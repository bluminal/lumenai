#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import {
  assertCanaryToken,
  canaryCredential,
  canaryModel,
  selectRepresentativeProbes,
} from '../lib/canary.mjs';
import {
  activateCodexSkills,
  listCodexSkills,
  runCodexProbeTurns,
} from '../lib/codex-app-server.mjs';
import { assertCompleteInventory, readExpectedEntrypoints } from '../lib/contract.mjs';
import { createProbeOverlay } from '../lib/probe-overlay.mjs';
import {
  NO_INJECTED_CONTEXT_PROBE_ID,
  NO_INJECTED_CONTEXT_PROBE_TOKEN,
  WORKFLOW_STEP_PROBE_ID,
  WORKFLOW_STEP_PROBE_TOKEN,
  assertInjectedContextFileRead,
  assertToolAttemptedAtMostOnce,
  codexReadInjectedContextFile,
  countCodexToolAttempts,
  noInjectedContextProbePrompt,
  workflowStepProbePrompt,
} from '../lib/tool-probes.mjs';
import { emit, parseLastJsonLine, runCommand } from '../lib/scenario-helpers.mjs';

const harness = 'codex';
const profile = 'canary';
const startedAt = Date.now();
const fixtureRoot = '/fixture/synthex';
const overlayRoot = '/workspace/probe/synthex';
const marketplaceRoot = '/workspace/marketplace';
const installedFixture = join(marketplaceRoot, 'plugins', 'synthex');
const marketplaceName = 'synthex-compat';
const selector = `synthex@${marketplaceName}`;

try {
  const isolation = assertIsolatedEnvironment();
  const version = runCommand('codex', ['--version']).stdout;
  process.env.CODEX_API_KEY = canaryCredential();
  emit(harness, 'environment', { ok: true, profile, version, isolation });

  const probes = createProbeOverlay({
    pluginRoot: fixtureRoot,
    outputRoot: overlayRoot,
    runId: 'canary',
  });
  const entries = readExpectedEntrypoints(overlayRoot);
  const representatives = selectRepresentativeProbes(probes);
  mkdirSync(join(marketplaceRoot, '.agents', 'plugins'), { recursive: true });
  mkdirSync(join(marketplaceRoot, 'plugins'), { recursive: true });
  cpSync(overlayRoot, installedFixture, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(overlayRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
  writeFileSync(
    join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'),
    `${JSON.stringify({
      name: marketplaceName,
      interface: { displayName: 'Synthex compatibility tests' },
      plugins: [{
        name: 'synthex',
        source: { source: 'local', path: './plugins/synthex' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
        description: manifest.description,
      }],
    }, null, 2)}\n`,
  );
  parseLastJsonLine(runCommand('codex', ['plugin', 'marketplace', 'add', marketplaceRoot, '--json']).stdout);
  parseLastJsonLine(runCommand('codex', ['plugin', 'add', selector, '--json']).stdout);
  emit(harness, 'install', { ok: true, profile, selector, count: entries.length });

  // Task 46 (FR-HM27, D25): commit-lint canary. Confirms the manifest's
  // `hooks` key really does resolve, through the installed fixture, to a
  // script that blocks a bad `git commit -m` subject the same way Codex's
  // own PreToolUse dispatch would drive it (`features.hooks` on) -- without
  // requiring a live Codex model call, which the actual dispatch path
  // would need. Reads hooks/codex-hooks.json from the INSTALLED fixture
  // (not the source tree) so drift between the two would fail this case,
  // and builds the exact hook JSON payload shape Codex sends on stdin
  // (Claude JSON shape per docs/reqs/harness-modernization.md's Codex
  // host notes), using the manifest's own matcher (its Bash-equivalent
  // tool name, "shell") rather than assuming Claude's "Bash".
  {
    const codexHooks = JSON.parse(
      readFileSync(join(installedFixture, 'hooks', 'codex-hooks.json'), 'utf8'),
    );
    const preToolUse = codexHooks.hooks?.PreToolUse?.[0];
    if (!preToolUse) throw new Error('codex-hooks.json has no PreToolUse entry to canary');
    const scriptRelPath = preToolUse.hooks[0].command.replace('${CLAUDE_PLUGIN_ROOT}', installedFixture);

    const commitLintProjectRoot = '/workspace/probe/commit-lint';
    mkdirSync(join(commitLintProjectRoot, '.synthex'), { recursive: true });
    writeFileSync(
      join(commitLintProjectRoot, '.synthex', 'config.yaml'),
      'git:\n  commit_convention: conventional\n',
    );

    const runCommitLint = (command) =>
      spawnSync('bash', [scriptRelPath], {
        cwd: commitLintProjectRoot,
        input: JSON.stringify({
          tool_name: preToolUse.matcher,
          tool_input: { command },
          cwd: commitLintProjectRoot,
        }),
        encoding: 'utf8',
        timeout: 20_000,
      });

    const blocked = runCommitLint('git commit -m "not a conventional subject"');
    if (blocked.status !== 2) {
      throw new Error(
        `commit-lint canary: expected exit 2 for a bad subject under matcher "${preToolUse.matcher}", got ${blocked.status}: ${blocked.stderr}`,
      );
    }
    if (!blocked.stderr.includes('does not match Conventional Commits')) {
      throw new Error(`commit-lint canary: missing fix hint on stderr: ${blocked.stderr}`);
    }

    const allowed = runCommitLint('git commit -m "feat: add x"');
    if (allowed.status !== 0) {
      throw new Error(
        `commit-lint canary: expected exit 0 for a good subject, got ${allowed.status}: ${allowed.stderr}`,
      );
    }

    emit(harness, 'commit-lint', { ok: true, profile, matcher: preToolUse.matcher, blockedExit: blocked.status });
  }

  const skills = await listCodexSkills('/workspace');
  const synthexSkills = skills.filter(({ name }) => name.startsWith('synthex:'));
  const inventory = assertCompleteInventory(
    entries,
    synthexSkills.map(({ name }) => name.slice('synthex:'.length)),
  );
  if (inventory.missing.length > 0) {
    throw new Error(`Codex skill inventory is incomplete: ${inventory.missing.join(', ')}`);
  }
  emit(harness, 'inventory', { ok: true, profile, discoveredCount: synthexSkills.length });

  const byName = new Map(synthexSkills.map((skill) => [skill.name, skill]));
  const activations = representatives.map((probe) => {
    const name = `synthex:${probe.id}`;
    const skill = byName.get(name);
    if (!skill?.path) throw new Error(`Codex reported no path for ${name}`);
    return { ...probe, name, path: skill.path };
  });
  const completed = await activateCodexSkills({
    cwd: '/workspace',
    skills: activations,
    model: canaryModel(undefined),
  });
  for (const activation of activations) {
    const result = completed.find(({ name }) => name === activation.name);
    assertCanaryToken({
      harness,
      id: activation.id,
      token: activation.token,
      output: JSON.stringify(result),
    });
    emit(harness, 'activate', {
      ok: true,
      profile,
      id: activation.id,
      kind: activation.kind,
      proof: 'real provider returned the temporary activation token',
    });
  }

  // Task 23 (NFR-HM4, FR-HM7, FR-HM12; D22): tool-BEHAVIOR probes. These are
  // deliberately skill-less (no plugin/catalog involvement) and run from a
  // throwaway project whose only instruction files are GEMINI.md and
  // .hermes.md — files Codex does not auto-inject (it injects AGENTS.md;
  // see Task 15) — so probe (b) can assert a real Read rather than relying
  // on host-injected context.
  const toolBehaviorRoot = '/workspace/probe/tool-behavior';
  mkdirSync(toolBehaviorRoot, { recursive: true });
  writeFileSync(join(toolBehaviorRoot, 'GEMINI.md'), '# Synthex compatibility test project\n');
  writeFileSync(join(toolBehaviorRoot, '.hermes.md'), '# Synthex compatibility test project\n');

  const toolProbeResults = await runCodexProbeTurns({
    cwd: toolBehaviorRoot,
    turns: [
      { id: WORKFLOW_STEP_PROBE_ID, text: workflowStepProbePrompt(WORKFLOW_STEP_PROBE_TOKEN) },
      {
        id: NO_INJECTED_CONTEXT_PROBE_ID,
        text: noInjectedContextProbePrompt(NO_INJECTED_CONTEXT_PROBE_TOKEN),
      },
    ],
    model: canaryModel(undefined),
  });

  const workflowStepResult = toolProbeResults.find(({ id }) => id === WORKFLOW_STEP_PROBE_ID);
  assertCanaryToken({
    harness,
    id: WORKFLOW_STEP_PROBE_ID,
    token: WORKFLOW_STEP_PROBE_TOKEN,
    output: JSON.stringify(workflowStepResult),
  });
  const workflowAttempts = countCodexToolAttempts(workflowStepResult?.items);
  assertToolAttemptedAtMostOnce({ harness, id: WORKFLOW_STEP_PROBE_ID, attempts: workflowAttempts });
  emit(harness, 'tool-behavior', {
    ok: true,
    profile,
    id: WORKFLOW_STEP_PROBE_ID,
    attempts: workflowAttempts,
  });

  const noInjectedContextResult = toolProbeResults.find(
    ({ id }) => id === NO_INJECTED_CONTEXT_PROBE_ID,
  );
  assertCanaryToken({
    harness,
    id: NO_INJECTED_CONTEXT_PROBE_ID,
    token: NO_INJECTED_CONTEXT_PROBE_TOKEN,
    output: JSON.stringify(noInjectedContextResult),
  });
  const contextFileRead = codexReadInjectedContextFile(noInjectedContextResult?.items);
  assertInjectedContextFileRead({ harness, id: NO_INJECTED_CONTEXT_PROBE_ID, file: contextFileRead });
  emit(harness, 'tool-behavior', {
    ok: true,
    profile,
    id: NO_INJECTED_CONTEXT_PROBE_ID,
    file: contextFileRead,
  });

  emit(harness, 'complete', {
    ok: true,
    profile,
    activated: activations.length,
    toolBehaviorProbes: 2,
    elapsedMs: Date.now() - startedAt,
  });
} catch (error) {
  emit(harness, 'complete', {
    ok: false,
    profile,
    elapsedMs: Date.now() - startedAt,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

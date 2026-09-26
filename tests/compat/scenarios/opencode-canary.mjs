#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import {
  assertCanaryToken,
  canaryCredential,
  canaryModel,
  selectRepresentativeProbes,
} from '../lib/canary.mjs';
import { assertCompleteInventory, readExpectedEntrypoints } from '../lib/contract.mjs';
import { createProbeOverlay } from '../lib/probe-overlay.mjs';
import { emit, runCommand, runCommandAsync } from '../lib/scenario-helpers.mjs';
import {
  NO_INJECTED_CONTEXT_PROBE_ID,
  NO_INJECTED_CONTEXT_PROBE_TOKEN,
  WORKFLOW_STEP_PROBE_ID,
  WORKFLOW_STEP_PROBE_TOKEN,
  assertInjectedContextFileRead,
  assertToolAttemptedAtMostOnce,
  countOpenCodeToolAttempts,
  noInjectedContextProbePrompt,
  opencodeReadInjectedContextFile,
  workflowStepProbePrompt,
} from '../lib/tool-probes.mjs';

const harness = 'opencode';
const profile = 'canary';
const startedAt = Date.now();
const fixtureRoot = '/fixture/synthex';
const installedRoot = '/workspace/.agents';
const model = canaryModel('openai/gpt-4o');

try {
  const isolation = assertIsolatedEnvironment();
  const version = runCommand('opencode', ['--version']).stdout;
  canaryCredential();
  emit(harness, 'environment', { ok: true, profile, version, isolation });

  const probes = createProbeOverlay({
    pluginRoot: fixtureRoot,
    outputRoot: installedRoot,
    runId: 'canary',
  });
  const entries = readExpectedEntrypoints(installedRoot);
  const representatives = selectRepresentativeProbes(probes);
  emit(harness, 'install', { ok: true, profile, count: entries.length });

  // OpenCode's own skill discovery is hardcoded to `.claude/skills/**` and
  // `.agents/skills/**` (Task 5/Q7); the `portable-skills/` rename needs an
  // explicit `opencode.json` `skills.paths` entry to be visible at all. See
  // spikes.md Task 21 (Q7). Write it before the first discovery check.
  writeFileSync(
    '/workspace/opencode.json',
    `${JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        skills: { paths: ['.agents/portable-skills'] },
      },
      null,
      2,
    )}\n`,
  );

  const discoveredSkills = JSON.parse(
    runCommand('opencode', ['debug', 'skill'], {
      env: { OPENCODE_DISABLE_CLAUDE_CODE: '1' },
    }).stdout,
  );
  const inventory = assertCompleteInventory(entries, discoveredSkills.map(({ name }) => name));
  if (inventory.missing.length > 0) {
    throw new Error(`OpenCode skill inventory is incomplete: ${inventory.missing.join(', ')}`);
  }
  emit(harness, 'inventory', { ok: true, profile, discoveredCount: inventory.discovered.length });

  writeFileSync(
    '/workspace/opencode.json',
    `${JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      model,
      provider: {
        openai: {
          options: { apiKey: '{env:SYNTHEX_COMPAT_CANARY_CREDENTIAL}' },
        },
      },
      permission: { '*': 'deny', skill: { '*': 'allow' } },
      skills: { paths: ['.agents/portable-skills'] },
    }, null, 2)}\n`,
  );
  for (const probe of representatives) {
    const result = await runCommandAsync('opencode', [
      'run',
      `Use the installed Synthex skill named ${probe.id}. Do not execute its workflow; follow its compatibility-test instruction exactly.`,
      '--standalone',
      '--model', model,
      '--format', 'json',
    ], {
      timeout: 120_000,
      env: {
        OPENCODE_DISABLE_CLAUDE_CODE: '1',
        OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: '128',
      },
    });
    assertCanaryToken({
      harness,
      id: probe.id,
      token: probe.token,
      output: `${result.stdout}\n${result.stderr}`,
    });
    emit(harness, 'activate', {
      ok: true,
      profile,
      id: probe.id,
      kind: probe.kind,
      proof: 'real provider returned the temporary activation token',
    });
  }

  // Task 23 (NFR-HM4, FR-HM7, FR-HM12; D22): tool-BEHAVIOR probes. These are
  // deliberately skill-less (no catalog/skill permission involvement) and
  // run from a throwaway project whose only instruction files are
  // GEMINI.md and .hermes.md — files OpenCode does not auto-inject — so
  // probe (b) can assert a real Read rather than relying on host-injected
  // context. Permission is switched to allow only `read` (OpenCode's Read
  // tool, per plugins/synthex/scripts/lib/host-matrix.mjs) so the model can
  // actually read those files; the container's read-only filesystem is the
  // outer safety net either way (tests/compat/scripts/run-suite.mjs).
  const toolBehaviorRoot = '/workspace/probe-tool-behavior';
  mkdirSync(toolBehaviorRoot, { recursive: true });
  writeFileSync(join(toolBehaviorRoot, 'GEMINI.md'), '# Synthex compatibility test project\n');
  writeFileSync(join(toolBehaviorRoot, '.hermes.md'), '# Synthex compatibility test project\n');
  writeFileSync(
    join(toolBehaviorRoot, 'opencode.json'),
    `${JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      model,
      provider: {
        openai: {
          options: { apiKey: '{env:SYNTHEX_COMPAT_CANARY_CREDENTIAL}' },
        },
      },
      permission: { '*': 'deny', read: 'allow' },
    }, null, 2)}\n`,
  );

  const toolProbeRunArgs = (prompt) => [
    'run',
    prompt,
    '--standalone',
    '--model', model,
    '--format', 'json',
  ];
  const toolProbeRunOptions = {
    cwd: toolBehaviorRoot,
    timeout: 120_000,
    env: {
      OPENCODE_DISABLE_CLAUDE_CODE: '1',
      OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: '128',
    },
  };

  const workflowStepResult = await runCommandAsync(
    'opencode',
    toolProbeRunArgs(workflowStepProbePrompt(WORKFLOW_STEP_PROBE_TOKEN)),
    toolProbeRunOptions,
  );
  const workflowStepOutput = `${workflowStepResult.stdout}\n${workflowStepResult.stderr}`;
  assertCanaryToken({
    harness,
    id: WORKFLOW_STEP_PROBE_ID,
    token: WORKFLOW_STEP_PROBE_TOKEN,
    output: workflowStepOutput,
  });
  const workflowAttempts = countOpenCodeToolAttempts(workflowStepOutput);
  assertToolAttemptedAtMostOnce({ harness, id: WORKFLOW_STEP_PROBE_ID, attempts: workflowAttempts });
  emit(harness, 'tool-behavior', {
    ok: true,
    profile,
    id: WORKFLOW_STEP_PROBE_ID,
    attempts: workflowAttempts,
  });

  const noInjectedContextResult = await runCommandAsync(
    'opencode',
    toolProbeRunArgs(noInjectedContextProbePrompt(NO_INJECTED_CONTEXT_PROBE_TOKEN)),
    toolProbeRunOptions,
  );
  const noInjectedContextOutput = `${noInjectedContextResult.stdout}\n${noInjectedContextResult.stderr}`;
  assertCanaryToken({
    harness,
    id: NO_INJECTED_CONTEXT_PROBE_ID,
    token: NO_INJECTED_CONTEXT_PROBE_TOKEN,
    output: noInjectedContextOutput,
  });
  const contextFileRead = opencodeReadInjectedContextFile(noInjectedContextOutput);
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
    activated: representatives.length,
    toolBehaviorProbes: 2,
    maxOutputTokens: 128,
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

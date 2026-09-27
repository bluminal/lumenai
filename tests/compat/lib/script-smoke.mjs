// tests/compat/lib/script-smoke.mjs
//
// Task 37 (FR-HM18, FR-HM40, NFR-HM4): exercises each registered Synthex
// runtime script's happy path plus a missing-jq/missing-node fallback path,
// run from INSIDE each compat container by that harness's offline scenario
// (tests/compat/scenarios/{claude,codex,gemini,opencode}-offline.mjs).
//
// None of the four pinned compat images installs jq (see
// tests/compat/harnesses/*/Dockerfile), so every case below already runs
// jq-less by construction — this module does not rely on that accident,
// though: every case is run under an explicitly restricted PATH built from
// tests/compat/lib/script-smoke.mjs's buildRestrictedPath(), symlinking in
// only the POSIX tools a script could plausibly need and NEVER jq, mirroring
// the jq-less-PATH pattern in
// tests/schemas/loop-idle-wait-behavioral.test.ts:148-165 and
// tests/schemas/loop-step-behavioral.test.ts's buildPath(). Each script gets
// two cases:
//
//   - "happy path"  — restricted PATH WITH node (proves the node-preferred
//     branch, where one exists, runs cleanly without jq).
//   - "fallback"    — restricted PATH WITHOUT node either (proves the
//     sed/awk/grep-only fallback actually runs, not just that it degrades
//     silently).
//
// For loop-advance-gate.sh (which REQUIRES jq and, per its own header
// comment, exits 0 immediately when jq is absent — see FR-HM40 item 8 and
// docs/plans/harness-modernization.md Task 37), both cases assert the
// documented safe-degrade behavior instead: this is the one script whose
// only reachable behavior in a jq-less container IS the fallback, and that
// exact behavior had no prior test coverage (loop-advance-gate-behavioral
// .test.ts's real-logic assertions are `describe.skipIf(!hasJq)` and are
// skipped in every environment lacking jq — see that file).
//
// `discoverRuntimeScripts` (tests/compat/lib/script-inventory.mjs) is the
// single source of truth for which scripts must have cases here;
// tests/schemas/script-smoke-registry.test.ts fails Layer 1 if a script it
// discovers has no entry in SMOKE_CASES, so this file and the portable
// -scripts contract cannot silently drift apart.

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverRuntimeScripts } from './script-inventory.mjs';

export { discoverRuntimeScripts };

// ---------------------------------------------------------------------------
// Restricted-PATH helper
// ---------------------------------------------------------------------------

const POSIX_TOOLS = [
  'bash', 'sh', 'sed', 'awk', 'grep', 'cut', 'wc', 'sort', 'head', 'tr',
  'mv', 'rm', 'mkdir', 'date', 'od', 'dirname', 'basename', 'cat', 'mktemp',
  'ls', 'cksum', 'sleep', 'printf', 'true', 'false',
];

function resolveRealTool(tool) {
  const result = spawnSync('/bin/sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

let restrictedPathSeq = 0;

/** Builds a bin/ dir of symlinks to only the POSIX tools these scripts need
 * (never jq), optionally including node. Returns the dir (usable as PATH). */
function buildRestrictedPath(baseDir, includeNode) {
  const bin = join(baseDir, `bin-${includeNode ? 'nojq' : 'nojq-nonode'}-${restrictedPathSeq++}`);
  mkdirSync(bin, { recursive: true });
  for (const tool of POSIX_TOOLS) {
    const src = resolveRealTool(tool);
    if (src) {
      try {
        symlinkSync(src, join(bin, tool));
      } catch {
        // already linked (e.g. sh -> bash on some images); ignore.
      }
    }
  }
  if (includeNode) {
    const nodeSrc = resolveRealTool('node');
    if (nodeSrc) {
      try {
        symlinkSync(nodeSrc, join(bin, 'node'));
      } catch {
        // ignore
      }
    }
  }
  return bin;
}

// ---------------------------------------------------------------------------
// Case-runner plumbing
// ---------------------------------------------------------------------------

class SmokeAssertionError extends Error {}

function assert(condition, message) {
  if (!condition) throw new SmokeAssertionError(message);
}

/** Always invokes the script explicitly via the restricted PATH's `bash`,
 * mirroring the rest of the Synthex Layer 2 suite (loop-step-behavioral
 * .test.ts, compact-recover-behavioral.test.ts, etc.), regardless of the
 * script's own shebang. */
function runScript(scriptAbsPath, args, { pathDir, env = {}, cwd, stdin } = {}) {
  const bash = join(pathDir, 'bash');
  const result = spawnSync(bash, [scriptAbsPath, ...args], {
    cwd,
    env: { PATH: pathDir, ...env },
    input: stdin,
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (result.error) throw result.error;
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function readPluginVersion(pluginRoot) {
  const manifest = JSON.parse(
    readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
  );
  return manifest.version;
}

// ---------------------------------------------------------------------------
// scripts/loop-step.sh — begin -> advance -> hold -> finish -> list -> cancel
// -> check-writable (Task 37's documented sequence).
// ---------------------------------------------------------------------------

function loopStepLifecycle(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const loopsDir = join(ctx.workDir, '.synthex', 'loops');
  const opts = { pathDir, cwd: ctx.workDir, env: { SYNTHEX_LOOPS_DIR: loopsDir } };

  const begin = runScript(ctx.scriptAbsPath, [
    'begin', '/synthex:next-priority',
    '--completion-promise', 'ALLDONE',
    '--name', 'smoke-loop',
    '--max', '3',
  ], opts);
  assert(begin.code === 0, `begin exited ${begin.code}: ${begin.stderr}`);
  assert(begin.stdout.trim() === 'smoke-loop', `begin printed ${JSON.stringify(begin.stdout)}`);

  const advance = runScript(ctx.scriptAbsPath, ['advance', 'smoke-loop'], opts);
  assert(advance.code === 0, `advance exited ${advance.code}: ${advance.stderr}`);
  assert(
    advance.stdout.trim() === '[loop smoke-loop iteration 1/3]',
    `advance printed ${JSON.stringify(advance.stdout)}`,
  );

  const hold = runScript(ctx.scriptAbsPath, ['hold', 'smoke-loop'], opts);
  assert(hold.code === 0, `hold exited ${hold.code}: ${hold.stderr}`);

  const finish = runScript(ctx.scriptAbsPath, ['finish', 'smoke-loop', 'completed'], opts);
  assert(finish.code === 0, `finish exited ${finish.code}: ${finish.stderr}`);

  const list = runScript(ctx.scriptAbsPath, ['list'], opts);
  assert(list.code === 0, `list exited ${list.code}: ${list.stderr}`);
  assert(/^COMPLETED \(1\):$/m.test(list.stdout), `list did not report the completed loop: ${list.stdout}`);
  assert(
    /smoke-loop\s+completed \(promise\)\s+iter 1\/3/.test(list.stdout),
    `list did not include the loop's outcome: ${list.stdout}`,
  );

  runScript(ctx.scriptAbsPath, [
    'begin', '/synthex:loop', '--completion-promise', 'X', '--name', 'smoke-loop-cancel',
  ], opts);
  const cancel = runScript(ctx.scriptAbsPath, ['cancel', 'smoke-loop-cancel'], opts);
  assert(cancel.code === 0, `cancel exited ${cancel.code}: ${cancel.stderr}`);
  assert(
    /Cancelled loop "smoke-loop-cancel"/.test(cancel.stdout),
    `cancel printed ${JSON.stringify(cancel.stdout)}`,
  );

  const checkWritable = runScript(ctx.scriptAbsPath, ['check-writable', loopsDir], opts);
  assert(
    checkWritable.code === 0,
    `check-writable exited ${checkWritable.code}: ${checkWritable.stderr}`,
  );
}

// ---------------------------------------------------------------------------
// scripts/lib/config-get.sh — resolves a known key from the plugin-shipped
// config/defaults.yaml when no project override exists.
// ---------------------------------------------------------------------------

function configGetCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const result = runScript(ctx.scriptAbsPath, ['review_loops.max_cycles', 'MISSING'], {
    pathDir,
    cwd: ctx.workDir,
    env: { CLAUDE_PROJECT_DIR: ctx.workDir },
  });
  assert(result.code === 0, `config-get exited ${result.code}: ${result.stderr}`);
  assert(
    result.stdout.trim() === '2',
    `expected the shipped default "2" for review_loops.max_cycles, got ${JSON.stringify(result.stdout)}`,
  );
}

// ---------------------------------------------------------------------------
// scripts/compact-recover.sh — the "compact" SessionStart hook.
// ---------------------------------------------------------------------------

function compactRecoverCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const loopsDir = join(ctx.workDir, '.synthex', 'loops');
  mkdirSync(loopsDir, { recursive: true });
  writeFileSync(
    join(loopsDir, 'smoke-recover.json'),
    JSON.stringify({ schema_version: 1, loop_id: 'smoke-recover', status: 'running', iteration: 2, max_iterations: 5 }),
  );
  const result = runScript(ctx.scriptAbsPath, [], {
    pathDir,
    cwd: ctx.workDir,
    env: { CLAUDE_PROJECT_DIR: ctx.workDir },
  });
  assert(result.code === 0, `compact-recover exited ${result.code}: ${result.stderr}`);
  assert(
    result.stdout.includes('Synthex loop smoke-recover is running (iteration 2/5)'),
    `unexpected compact-recover stdout: ${JSON.stringify(result.stdout)}`,
  );
  assert(
    result.stdout.includes('loop-step.sh advance smoke-recover'),
    `compact-recover did not print the resume command: ${JSON.stringify(result.stdout)}`,
  );
}

// ---------------------------------------------------------------------------
// scripts/loop-idle-wait.sh — a tiny SYNTHEX_LOOP_IDLE_MAX for the timeout
// path, plus a cancelled-loop fixture for the grep-based short-circuit.
// ---------------------------------------------------------------------------

function loopIdleWaitTimeoutCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const result = runScript(ctx.scriptAbsPath, ['smoke-idle'], {
    pathDir,
    cwd: ctx.workDir,
    env: { SYNTHEX_LOOP_IDLE_MAX: '1', SYNTHEX_LOOP_IDLE_POLL: '1' },
  });
  assert(result.code === 0, `loop-idle-wait exited ${result.code}: ${result.stderr}`);
  assert(
    /idle-wait smoke-idle: timeout after 1s \(idle streak 1, limit 1s\)/.test(result.stdout),
    `unexpected loop-idle-wait stdout: ${JSON.stringify(result.stdout)}`,
  );
}

function loopIdleWaitCancelledCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const loopsDir = join(ctx.workDir, '.synthex', 'loops');
  mkdirSync(loopsDir, { recursive: true });
  writeFileSync(join(loopsDir, 'smoke-idle-2.json'), JSON.stringify({ status: 'cancelled' }));
  const result = runScript(ctx.scriptAbsPath, ['smoke-idle-2'], {
    pathDir,
    cwd: ctx.workDir,
    env: { SYNTHEX_LOOP_IDLE_MAX: '5', SYNTHEX_LOOP_IDLE_POLL: '1' },
  });
  assert(result.code === 0, `loop-idle-wait exited ${result.code}: ${result.stderr}`);
  assert(
    /idle-wait smoke-idle-2: not-running after 0s/.test(result.stdout),
    `unexpected loop-idle-wait stdout: ${JSON.stringify(result.stdout)}`,
  );
}

// ---------------------------------------------------------------------------
// scripts/loop-advance-gate.sh — jq is REQUIRED for this hook's real logic;
// absent (as in every pinned compat image), it must degrade to "allow stop"
// (exit 0, empty stdout) rather than error. Both cases prove that safe
// degrade via different guard lines (see file header for why this is the
// one script where "happy path" and "fallback" converge on the same
// documented behavior).
// ---------------------------------------------------------------------------

function gateDegradeWithMatchingLoopCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const loopsDir = join(ctx.workDir, '.synthex', 'loops');
  mkdirSync(loopsDir, { recursive: true });
  writeFileSync(
    join(loopsDir, 'smoke-gate.json'),
    JSON.stringify({
      schema_version: 1,
      loop_id: 'smoke-gate',
      session_id: 'SMOKE-SESSION',
      status: 'running',
      iteration: 1,
      max_iterations: 5,
      completion_promise: 'ALLDONE',
    }),
  );
  const payload = JSON.stringify({
    session_id: 'SMOKE-SESSION',
    cwd: ctx.workDir,
    transcript_path: join(ctx.workDir, 'transcript.jsonl'),
    stop_hook_active: false,
  });
  const result = runScript(ctx.scriptAbsPath, [], { pathDir, cwd: ctx.workDir, stdin: payload });
  assert(result.code === 0, `loop-advance-gate exited ${result.code}: ${result.stderr}`);
  assert(
    result.stdout.trim() === '',
    `loop-advance-gate must degrade to empty stdout (allow stop) without jq, got: ${JSON.stringify(result.stdout)}`,
  );
}

function gateEmptyStdinCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const result = runScript(ctx.scriptAbsPath, [], { pathDir, cwd: ctx.workDir, stdin: '' });
  assert(result.code === 0, `loop-advance-gate exited ${result.code}: ${result.stderr}`);
  assert(
    result.stdout.trim() === '',
    `loop-advance-gate must allow stop on empty stdin, got: ${JSON.stringify(result.stdout)}`,
  );
}

// ---------------------------------------------------------------------------
// scripts/upgrade-nudge.sh — SessionStart hook, no jq/node dependency at
// all; the fallback case additionally exercises the feature+star nudge text.
// ---------------------------------------------------------------------------

function upgradeNudgeSeedCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  mkdirSync(join(ctx.workDir, '.synthex'), { recursive: true });
  const result = runScript(ctx.scriptAbsPath, [], {
    pathDir,
    cwd: ctx.workDir,
    env: { CLAUDE_PROJECT_DIR: ctx.workDir },
  });
  assert(result.code === 0, `upgrade-nudge exited ${result.code}: ${result.stderr}`);
  assert(
    result.stdout.trim() === '',
    `first run should seed state silently, got: ${JSON.stringify(result.stdout)}`,
  );
  const state = JSON.parse(readFileSync(join(ctx.workDir, '.synthex', 'state.json'), 'utf8'));
  const version = readPluginVersion(ctx.pluginRoot);
  assert(
    state.last_seen_version === version,
    `state.last_seen_version=${JSON.stringify(state.last_seen_version)}, expected ${JSON.stringify(version)}`,
  );
}

function upgradeNudgeFeatureCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const synthexDir = join(ctx.workDir, '.synthex');
  mkdirSync(synthexDir, { recursive: true });
  writeFileSync(
    join(synthexDir, 'state.json'),
    JSON.stringify({
      schema_version: 1,
      last_seen_version: '0.4.5',
      dismissed: false,
      starred: false,
      star_dismissed: false,
    }),
  );
  const result = runScript(ctx.scriptAbsPath, [], {
    pathDir,
    cwd: ctx.workDir,
    env: { CLAUDE_PROJECT_DIR: ctx.workDir },
  });
  assert(result.code === 0, `upgrade-nudge exited ${result.code}: ${result.stderr}`);
  assert(
    result.stdout.includes('Multi-model review is available'),
    `feature nudge missing from stdout: ${JSON.stringify(result.stdout)}`,
  );
  assert(
    result.stdout.includes('Please consider starring'),
    `star nudge missing from stdout: ${JSON.stringify(result.stdout)}`,
  );
}

// ---------------------------------------------------------------------------
// scripts/state-flag.sh — generic boolean-flag writer for .synthex/state
// .json (FR-HM26, Task 38). The happy-path case proves the node-preferred
// JSON.parse/stringify branch preserves an unrelated pre-existing field
// (plugin_root) while setting a new flag; the fallback case proves the
// sed/awk-only reader+writer does the same with neither jq nor node on
// PATH.
// ---------------------------------------------------------------------------

function stateFlagHappyPathCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const synthexDir = join(ctx.workDir, '.synthex');
  mkdirSync(synthexDir, { recursive: true });
  writeFileSync(
    join(synthexDir, 'state.json'),
    JSON.stringify({
      schema_version: 1,
      last_seen_version: '0.5.0',
      plugin_root: '/opt/synthex',
      dismissed: false,
    }),
  );
  const result = runScript(ctx.scriptAbsPath, ['dismissed'], {
    pathDir,
    cwd: ctx.workDir,
    env: { CLAUDE_PROJECT_DIR: ctx.workDir },
  });
  assert(result.code === 0, `state-flag exited ${result.code}: ${result.stderr}`);
  const state = JSON.parse(readFileSync(join(synthexDir, 'state.json'), 'utf8'));
  assert(state.dismissed === true, `dismissed was not set: ${JSON.stringify(state)}`);
  assert(
    state.plugin_root === '/opt/synthex',
    `plugin_root was not preserved: ${JSON.stringify(state)}`,
  );
  assert(
    state.last_seen_version === '0.5.0',
    `last_seen_version was not preserved: ${JSON.stringify(state)}`,
  );
}

function stateFlagFallbackCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const synthexDir = join(ctx.workDir, '.synthex');
  mkdirSync(synthexDir, { recursive: true });
  // No pre-existing state.json — proves the fallback path also handles the
  // "seed a fresh file" case, not only field preservation.
  const result = runScript(ctx.scriptAbsPath, ['starred'], {
    pathDir,
    cwd: ctx.workDir,
    env: { CLAUDE_PROJECT_DIR: ctx.workDir },
  });
  assert(result.code === 0, `state-flag exited ${result.code}: ${result.stderr}`);
  const state = JSON.parse(readFileSync(join(synthexDir, 'state.json'), 'utf8'));
  assert(state.starred === true, `starred was not set: ${JSON.stringify(state)}`);
  assert(state.schema_version === 1, `schema_version missing: ${JSON.stringify(state)}`);
}

// ---------------------------------------------------------------------------
// scripts/init-scaffold.sh — FR-HM26 config + doc-directory scaffold for
// `/synthex:init` Steps 2/8. No jq/node dependency at all; the fallback
// case additionally proves the idempotent no-op second run.
// ---------------------------------------------------------------------------

const INIT_SCAFFOLD_DOC_DIRS = [
  'docs/reqs',
  'docs/plans',
  'docs/specs',
  'docs/specs/decisions',
  'docs/specs/rfcs',
  'docs/runbooks',
  'docs/retros',
];

function initScaffoldFreshCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const result = runScript(ctx.scriptAbsPath, [], {
    pathDir,
    cwd: ctx.workDir,
    env: { CLAUDE_PROJECT_DIR: ctx.workDir },
  });
  assert(result.code === 0, `init-scaffold exited ${result.code}: ${result.stderr}`);
  assert(
    result.stdout.includes('Created .synthex/config.yaml'),
    `init-scaffold did not report the config file: ${JSON.stringify(result.stdout)}`,
  );
  const written = readFileSync(join(ctx.workDir, '.synthex', 'config.yaml'));
  const defaults = readFileSync(join(ctx.pluginRoot, 'config', 'defaults.yaml'));
  assert(
    written.equals(defaults),
    'init-scaffold: written config.yaml is not byte-identical to config/defaults.yaml',
  );
  for (const d of INIT_SCAFFOLD_DOC_DIRS) {
    assert(existsSync(join(ctx.workDir, d)), `init-scaffold did not create ${d}`);
  }
}

function initScaffoldIdempotentCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const opts = { pathDir, cwd: ctx.workDir, env: { CLAUDE_PROJECT_DIR: ctx.workDir } };
  const first = runScript(ctx.scriptAbsPath, [], opts);
  assert(first.code === 0, `init-scaffold first run exited ${first.code}: ${first.stderr}`);

  const second = runScript(ctx.scriptAbsPath, [], opts);
  assert(second.code === 0, `init-scaffold second run exited ${second.code}: ${second.stderr}`);
  // FR-HM27 (Task 46): the config file and doc dirs are still fully
  // idempotent (no "Created" line), but the commit-convention detection
  // (D24) re-samples and prints on every run by design, so the second run
  // is not entirely silent any more.
  assert(
    !second.stdout.includes('Created'),
    `init-scaffold second run should not re-create anything, got: ${JSON.stringify(second.stdout)}`,
  );
  assert(
    second.stdout.includes('Detected commit convention:'),
    `init-scaffold second run should still print the commit-convention detection line, got: ${JSON.stringify(second.stdout)}`,
  );
  for (const d of INIT_SCAFFOLD_DOC_DIRS) {
    assert(existsSync(join(ctx.workDir, d)), `init-scaffold lost ${d} on the second run`);
  }
}

// ---------------------------------------------------------------------------
// scripts/write-audit.mjs — Task 42 (FR-HM26, FR-HM44). Unlike every other
// registered script, this one has a `#!/usr/bin/env node` shebang and no
// bash entrypoint at all, so it cannot be exercised through runScript()'s
// bash-only invocation. The happy-path case spawns node directly (as the
// orchestrator's Step 9 call site does once its `command -v node` guard
// passes). The "fallback" case does NOT try to run the node script under a
// node-less PATH (impossible by construction); per the Task 37 registry's
// documented allowance for a node-shebang script, it instead proves the
// CALLING guard itself — the exact `command -v node` pattern
// multi-model-review-orchestrator.md's Step 9 documents — degrades to a
// clean non-zero exit with a message when node is absent, which is the
// condition under which the orchestrator's prose fallback (rendering the
// same markdown itself via its Write tool) takes over.
// ---------------------------------------------------------------------------

function writeAuditEnvelopeFixture() {
  return {
    command: 'review-code',
    invocation_metadata: { target: 'staged changes', timestamp: '2026-04-28T10:00:00Z', short_hash: 'c7d8e9f' },
    config_snapshot: { enabled: true, reviewers: ['codex-review-prompter'] },
    preflight_result: { summary: '1 reviewer configured, 1 available, 1 family, aggregator: codex-review-prompter' },
    unified_envelope: {
      per_reviewer_results: [
        { reviewer_id: 'code-reviewer', source_type: 'native-team', family: 'anthropic', status: 'success', findings_count: 0, error_code: null, usage: null },
      ],
      findings: [],
      aggregator_resolution: { name: 'codex-review-prompter', source: 'configured' },
      continuation_event: null,
    },
    audit_config: { enabled: true, output_path: 'docs/reviews/' },
  };
}

function writeAuditHappyPathCase(ctx) {
  const pathDir = ctx.buildRestrictedPath(true);
  const nodeBin = join(pathDir, 'node');
  const result = spawnSync(nodeBin, [ctx.scriptAbsPath], {
    cwd: ctx.workDir,
    env: { PATH: pathDir, CLAUDE_PROJECT_DIR: ctx.workDir },
    input: JSON.stringify(writeAuditEnvelopeFixture()),
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert(result.status === 0, `write-audit.mjs exited ${result.status}: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert(parsed.status === 'written', `expected status "written", got: ${result.stdout}`);
  assert(existsSync(parsed.path), `write-audit.mjs reported ${parsed.path} but it does not exist`);
}

function writeAuditNodeGuardFallbackCase(ctx) {
  const pathDir = ctx.buildRestrictedPath(false);
  const bash = join(pathDir, 'bash');
  // Mirrors multi-model-review-orchestrator.md's Step 9 call site verbatim:
  // guard with `command -v node`, and degrade cleanly (non-zero exit + a
  // message) when it is absent — the orchestrator's prose-fallback trigger.
  const guardScript = [
    'if command -v node >/dev/null 2>&1; then',
    `  node "${ctx.scriptAbsPath}"`,
    'else',
    '  echo "write-audit: node not found; falling back to prose render (FR-HM26 node-guard fallback)." >&2',
    '  exit 3',
    'fi',
  ].join('\n');
  const result = spawnSync(bash, ['-c', guardScript], {
    cwd: ctx.workDir,
    env: { PATH: pathDir, CLAUDE_PROJECT_DIR: ctx.workDir },
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert(result.status === 3, `expected the node-guard fallback to exit 3, got ${result.status}: ${result.stderr}`);
  assert(/node not found/.test(result.stderr), `expected a node-not-found message, got: ${result.stderr}`);
}

// ---------------------------------------------------------------------------
// scripts/lint-plan.mjs — Task 45 (FR-HM26). Same shape as write-audit.mjs
// above: a `#!/usr/bin/env node` shebang and no bash entrypoint, so the
// happy-path case spawns node directly (mirroring write-implementation
// -plan.md Step 5.5's `command -v node` guard once it passes) and the
// "fallback" case proves that CALLING guard itself degrades cleanly with a
// message when node is absent — the condition under which Step 5.5's prose
// fallback (self-checking against docs/plan-lint-rubric.md) takes over.
// ---------------------------------------------------------------------------

const LINT_PLAN_CLEAN_FIXTURE = [
  '# Implementation Plan: Smoke Fixture',
  '',
  '## Overview',
  'Fixture plan for the script-smoke suite.',
  '',
  '## Decisions',
  '',
  '| # | Decision | Context | Rationale |',
  '|---|----------|---------|-----------|',
  '| D1 | Keep it small. | Smoke test. | Speed. |',
  '',
  '## Open Questions',
  '',
  '| # | Question | Impact | Status |',
  '|---|----------|--------|--------|',
  '| Q1 | None. | None. | Resolved |',
  '',
  '## Phase 1: Only Phase',
  '',
  '### Milestone 1.1: Only Milestone',
  '| # | Task | Complexity | Dependencies | Status |',
  '|---|------|-----------|--------------|--------|',
  '| 1 | Do the thing. | S | None | done |',
  '',
  '**Task 1 Acceptance Criteria:** `[T]` The thing is done.',
  '',
  '**Parallelizable:** None.',
  '**Milestone Value:** Ships the thing.',
  '',
].join('\n');

function lintPlanHappyPathCase(ctx) {
  const pathDir = ctx.buildRestrictedPath(true);
  const nodeBin = join(pathDir, 'node');
  const planPath = join(ctx.workDir, 'plan.md');
  writeFileSync(planPath, LINT_PLAN_CLEAN_FIXTURE);
  const result = spawnSync(nodeBin, [ctx.scriptAbsPath, planPath], {
    cwd: ctx.workDir,
    env: { PATH: pathDir },
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert(result.status === 0, `lint-plan.mjs exited ${result.status} on a clean fixture: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert(parsed.total_findings === 0, `expected a clean fixture to have zero findings, got: ${result.stdout}`);
  assert(parsed.passed === true, `expected passed: true on a clean fixture, got: ${result.stdout}`);
}

function lintPlanNodeGuardFallbackCase(ctx) {
  const pathDir = ctx.buildRestrictedPath(false);
  const bash = join(pathDir, 'bash');
  // Mirrors write-implementation-plan.md's Step 5.5 call site verbatim:
  // guard with `command -v node`, and degrade cleanly (non-zero exit + a
  // message) when it is absent — the Step 5.5 prose-fallback trigger.
  const guardScript = [
    'if command -v node >/dev/null 2>&1; then',
    `  node "${ctx.scriptAbsPath}" plan.md`,
    'else',
    '  echo "lint-plan: node not found; falling back to docs/plan-lint-rubric.md self-check (FR-HM26 node-guard fallback)." >&2',
    '  exit 3',
    'fi',
  ].join('\n');
  const result = spawnSync(bash, ['-c', guardScript], {
    cwd: ctx.workDir,
    env: { PATH: pathDir },
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert(result.status === 3, `expected the node-guard fallback to exit 3, got ${result.status}: ${result.stderr}`);
  assert(/node not found/.test(result.stderr), `expected a node-not-found message, got: ${result.stderr}`);
}

// ---------------------------------------------------------------------------
// scripts/assemble-bundle.sh — FR-HM26/FR-HM44 context bundle assembler
// (replaces the retired `context-bundle-assembler` agent). The happy-path
// case proves an in-cap file is inlined into `files[]` while an over-cap
// file is routed to `needs_summary[]` instead, and that `.synthex/tmp/`
// gets a self-ignoring `.gitignore`; the fallback case proves the same
// routing works with neither jq nor node on PATH (the script never shells
// out to either, so both paths are identical by construction — this still
// proves the sed/awk-only implementation is the ONLY implementation, not a
// node-preferred one silently masking a broken fallback).
// ---------------------------------------------------------------------------

function assembleBundleHappyPathCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const artifactPath = join(ctx.workDir, 'artifact.ts');
  const smallPath = join(ctx.workDir, 'small.ts');
  const bigPath = join(ctx.workDir, 'big.ts');
  writeFileSync(artifactPath, 'artifact content\n');
  writeFileSync(smallPath, 'small\n');
  writeFileSync(bigPath, 'x'.repeat(90_000));

  const result = runScript(
    ctx.scriptAbsPath,
    [
      'assemble',
      '--artifact', artifactPath,
      '--touched', artifactPath,
      '--touched', smallPath,
      '--touched', bigPath,
    ],
    { pathDir, cwd: ctx.workDir, env: { CLAUDE_PROJECT_DIR: ctx.workDir } },
  );
  assert(result.code === 0, `assemble-bundle exited ${result.code}: ${result.stderr}`);
  const bundlePath = result.stdout.trim();
  assert(existsSync(bundlePath), `assemble-bundle did not print an existing bundle path: ${JSON.stringify(result.stdout)}`);

  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  assert(bundle.status === 'success', `expected status success, got ${JSON.stringify(bundle.status)}`);
  assert(bundle.manifest.artifact.inlined === true, 'artifact must be inlined');
  const filePaths = bundle.files.map((f) => f.path);
  assert(filePaths.includes(smallPath), `small.ts should be inlined: ${JSON.stringify(filePaths)}`);
  assert(!filePaths.includes(bigPath), `big.ts should NOT be inlined: ${JSON.stringify(filePaths)}`);
  const needsSummaryPaths = bundle.needs_summary.map((f) => f.path);
  assert(needsSummaryPaths.includes(bigPath), `big.ts should be in needs_summary: ${JSON.stringify(needsSummaryPaths)}`);

  const gitignorePath = join(ctx.workDir, '.synthex', 'tmp', '.gitignore');
  assert(existsSync(gitignorePath), '.synthex/tmp/.gitignore was not created');
  assert(
    readFileSync(gitignorePath, 'utf8').trim() === '*',
    `.gitignore should contain "*", got ${JSON.stringify(readFileSync(gitignorePath, 'utf8'))}`,
  );
}

function assembleBundleFallbackCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const synthexDir = join(ctx.workDir, '.synthex');
  mkdirSync(synthexDir, { recursive: true });
  writeFileSync(
    join(synthexDir, 'config.yaml'),
    'multi_model_review:\n  context:\n    max_bundle_bytes: 100000\n    max_file_bytes: 10\n',
  );
  const artifactPath = join(ctx.workDir, 'artifact.ts');
  writeFileSync(artifactPath, 'over ten bytes of artifact content\n');

  const result = runScript(
    ctx.scriptAbsPath,
    ['assemble', '--artifact', artifactPath],
    { pathDir, cwd: ctx.workDir, env: { CLAUDE_PROJECT_DIR: ctx.workDir } },
  );
  assert(result.code === 0, `assemble-bundle exited ${result.code}: ${result.stderr}`);
  const bundlePath = result.stdout.trim();
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  assert(bundle.status === 'success', `expected status success, got ${JSON.stringify(bundle.status)}`);
  // The artifact is exempt from max_file_bytes routing (Behavioral Rule 1):
  // even at 36 bytes > max_file_bytes (10), it stays inlined, never
  // demoted to needs_summary, because it can never be summarized.
  assert(bundle.manifest.artifact.inlined === true, 'artifact must stay inlined despite exceeding max_file_bytes');
  assert(bundle.needs_summary.length === 0, `artifact must not appear in needs_summary: ${JSON.stringify(bundle.needs_summary)}`);

  // A second run with the project's max_bundle_bytes lowered below the
  // artifact's own size proves the narrow_scope_required error path.
  writeFileSync(
    join(synthexDir, 'config.yaml'),
    'multi_model_review:\n  context:\n    max_bundle_bytes: 10\n    max_file_bytes: 100000\n',
  );
  const errorResult = runScript(
    ctx.scriptAbsPath,
    ['assemble', '--artifact', artifactPath],
    { pathDir, cwd: ctx.workDir, env: { CLAUDE_PROJECT_DIR: ctx.workDir } },
  );
  assert(errorResult.code === 2, `expected exit 2 (narrow_scope_required), got ${errorResult.code}: ${errorResult.stderr}`);
  const errorBundle = JSON.parse(readFileSync(errorResult.stdout.trim(), 'utf8'));
  assert(errorBundle.status === 'error', `expected status error, got ${JSON.stringify(errorBundle.status)}`);
  assert(
    errorBundle.error_code === 'narrow_scope_required',
    `expected narrow_scope_required, got ${JSON.stringify(errorBundle.error_code)}`,
  );
  assert(errorBundle.manifest === null, 'error bundle manifest must be null');
}

// ---------------------------------------------------------------------------
// scripts/commit-lint.sh — FR-HM27 (D24, Task 46) fail-open PreToolUse(Bash)
// hook that lints `git commit` subjects against Conventional Commits, but
// only when the project's git.commit_convention key is explicitly
// "conventional". Node does the actual JSON/command parsing; the happy
// path proves a bad subject is blocked, the fallback proves the
// `command -v node` guard fails OPEN (allows) rather than erroring.
// ---------------------------------------------------------------------------

function commitLintBadSubjectStdin() {
  return JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "not a conventional subject"' },
    cwd: '.',
  });
}

function commitLintHappyPathCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const synthexDir = join(ctx.workDir, '.synthex');
  mkdirSync(synthexDir, { recursive: true });
  writeFileSync(join(synthexDir, 'config.yaml'), 'git:\n  commit_convention: conventional\n');

  const result = runScript(ctx.scriptAbsPath, [], {
    pathDir,
    cwd: ctx.workDir,
    env: { CLAUDE_PROJECT_DIR: ctx.workDir },
    stdin: commitLintBadSubjectStdin(),
  });
  assert(result.code === 2, `expected exit 2 (blocked), got ${result.code}: ${result.stderr}`);
  assert(
    result.stderr.includes('does not match Conventional Commits'),
    `expected a fix hint on stderr, got: ${result.stderr}`,
  );
}

function commitLintFallbackCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const synthexDir = join(ctx.workDir, '.synthex');
  mkdirSync(synthexDir, { recursive: true });
  // Same "conventional" config and same bad subject as the happy path —
  // the only difference is node's absence, proving the guard fails open
  // (allows) rather than blocking or erroring without node to parse JSON.
  writeFileSync(join(synthexDir, 'config.yaml'), 'git:\n  commit_convention: conventional\n');

  const result = runScript(ctx.scriptAbsPath, [], {
    pathDir,
    cwd: ctx.workDir,
    env: { CLAUDE_PROJECT_DIR: ctx.workDir },
    stdin: commitLintBadSubjectStdin(),
  });
  assert(result.code === 0, `expected exit 0 (fail open without node), got ${result.code}: ${result.stderr}`);
}

// ---------------------------------------------------------------------------
// scripts/validate-findings — FR-HM28 adapter-output normalizer. Node is
// preferred; when node is absent this script falls back to jq, but jq is
// NEVER on PATH in these restricted-PATH scenarios either (see the module
// header), so the "missing jq/node fallback" case below exercises the
// script's third branch: the dependency-free `unknown_error` envelope it
// prints when NEITHER interpreter is reachable, rather than silently
// producing nothing.
// ---------------------------------------------------------------------------

const VALIDATE_FINDINGS_STDIN = '```json\n' + JSON.stringify({
  findings: [
    {
      finding_id: 'security.handleLogin.missing-csrf-check',
      severity: 'high',
      category: 'security',
      title: 'Missing CSRF check in handleLogin',
      description: 'The handleLogin function does not validate CSRF tokens.',
      file: 'src/auth/handleLogin.ts',
    },
  ],
  usage: { input_tokens: 100, output_tokens: 20, model: 'gpt-5' },
}) + '\n```';

function validateFindingsHappyPathCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const result = runScript(
    ctx.scriptAbsPath,
    ['--reviewer-id', 'codex-review-prompter', '--family', 'openai'],
    { pathDir, cwd: ctx.workDir, stdin: VALIDATE_FINDINGS_STDIN },
  );
  assert(result.code === 0, `validate-findings exited ${result.code}: ${result.stderr}`);
  const envelope = JSON.parse(result.stdout);
  assert(envelope.status === 'success', `expected status success, got: ${result.stdout}`);
  assert(envelope.findings.length === 1, `expected 1 finding, got: ${result.stdout}`);
  assert(
    envelope.findings[0].source.reviewer_id === 'codex-review-prompter'
      && envelope.findings[0].source.family === 'openai'
      && envelope.findings[0].source.source_type === 'external',
    `source was not injected correctly: ${result.stdout}`,
  );
}

function validateFindingsFallbackCase(ctx, includeNode) {
  const pathDir = ctx.buildRestrictedPath(includeNode);
  const result = runScript(
    ctx.scriptAbsPath,
    ['--reviewer-id', 'codex-review-prompter', '--family', 'openai'],
    { pathDir, cwd: ctx.workDir, stdin: VALIDATE_FINDINGS_STDIN },
  );
  assert(result.code === 0, `validate-findings exited ${result.code}: ${result.stderr}`);
  const envelope = JSON.parse(result.stdout);
  assert(
    envelope.status === 'failed' && envelope.error_code === 'unknown_error',
    `expected the dependency-free unknown_error envelope, got: ${result.stdout}`,
  );
  assert(Array.isArray(envelope.findings) && envelope.findings.length === 0, `findings should be empty: ${result.stdout}`);
}

// ---------------------------------------------------------------------------
// Registry — SMOKE_CASES keys are relPath as produced by
// discoverRuntimeScripts() (relative to pluginRoot, e.g. "scripts/loop-step
// .sh"). tests/schemas/script-smoke-registry.test.ts fails if a discovered
// script has no entry here.
// ---------------------------------------------------------------------------

export const SMOKE_CASES = {
  'scripts/loop-step.sh': [
    {
      name: 'happy path: begin -> advance -> hold -> finish -> list -> cancel -> check-writable (node present)',
      run: (ctx) => loopStepLifecycle(ctx, true),
    },
    {
      name: 'missing jq/node fallback: same lifecycle via the sed/awk-only path',
      run: (ctx) => loopStepLifecycle(ctx, false),
    },
  ],
  'scripts/lib/config-get.sh': [
    {
      name: 'happy path: resolves a shipped default key (node present)',
      run: (ctx) => configGetCase(ctx, true),
    },
    {
      name: 'missing jq/node fallback: resolves the same key via the awk parser',
      run: (ctx) => configGetCase(ctx, false),
    },
  ],
  'scripts/compact-recover.sh': [
    {
      name: 'happy path: prints the running loop and resume command (node present)',
      run: (ctx) => compactRecoverCase(ctx, true),
    },
    {
      name: 'missing jq/node fallback: same output via the awk reader',
      run: (ctx) => compactRecoverCase(ctx, false),
    },
  ],
  'scripts/loop-idle-wait.sh': [
    {
      name: 'happy path: tiny SYNTHEX_LOOP_IDLE_MAX times out via the jq-less status check (node present)',
      run: (ctx) => loopIdleWaitTimeoutCase(ctx, true),
    },
    {
      name: 'missing jq/node fallback: a cancelled loop short-circuits via the grep-based status check',
      run: (ctx) => loopIdleWaitCancelledCase(ctx, false),
    },
  ],
  'scripts/loop-advance-gate.sh': [
    {
      name: 'happy path: a matching running loop still degrades to allow-stop without jq (node present)',
      run: (ctx) => gateDegradeWithMatchingLoopCase(ctx, true),
    },
    {
      name: 'missing jq/node fallback: empty stdin allows the stop immediately',
      run: (ctx) => gateEmptyStdinCase(ctx, false),
    },
  ],
  'scripts/upgrade-nudge.sh': [
    {
      name: 'happy path: fresh project seeds state silently, no nudge (node present)',
      run: (ctx) => upgradeNudgeSeedCase(ctx, true),
    },
    {
      name: 'missing jq/node fallback: upgrade across the threshold prints both nudges',
      run: (ctx) => upgradeNudgeFeatureCase(ctx, false),
    },
  ],
  'scripts/state-flag.sh': [
    {
      name: 'happy path: sets a flag and preserves unrelated existing fields (node present)',
      run: (ctx) => stateFlagHappyPathCase(ctx, true),
    },
    {
      name: 'missing jq/node fallback: seeds a fresh file and sets the flag via the sed/awk path',
      run: (ctx) => stateFlagFallbackCase(ctx, false),
    },
  ],
  'scripts/commit-lint.sh': [
    {
      name: 'happy path: blocks a bad -m subject with a fix hint when git.commit_convention is "conventional" (node present)',
      run: (ctx) => commitLintHappyPathCase(ctx, true),
    },
    {
      name: 'missing node fallback: the command -v node guard fails open (allows) the same bad subject',
      run: (ctx) => commitLintFallbackCase(ctx, false),
    },
  ],
  'scripts/init-scaffold.sh': [
    {
      name: 'happy path: fresh project gets a byte-identical config.yaml and all doc dirs (node present)',
      run: (ctx) => initScaffoldFreshCase(ctx, true),
    },
    {
      name: 'missing jq/node fallback: same scaffold plus an idempotent no-op second run',
      run: (ctx) => initScaffoldIdempotentCase(ctx, false),
    },
  ],
  'scripts/write-audit.mjs': [
    {
      name: 'happy path: writes the audit markdown and reports status: "written" (node present)',
      run: (ctx) => writeAuditHappyPathCase(ctx),
    },
    {
      name: 'missing node fallback: the calling `command -v node` guard degrades to a clean non-zero exit with a message',
      run: (ctx) => writeAuditNodeGuardFallbackCase(ctx),
    },
  ],
  'scripts/lint-plan.mjs': [
    {
      name: 'happy path: a clean fixture plan yields zero findings and exit 0 (node present)',
      run: (ctx) => lintPlanHappyPathCase(ctx),
    },
    {
      name: 'missing node fallback: the calling `command -v node` guard degrades to a clean non-zero exit with a message',
      run: (ctx) => lintPlanNodeGuardFallbackCase(ctx),
    },
  ],
  'scripts/assemble-bundle.sh': [
    {
      name: 'happy path: in-cap file inlined, over-cap file routed to needs_summary, .gitignore self-ignores (node present)',
      run: (ctx) => assembleBundleHappyPathCase(ctx, true),
    },
    {
      name: 'missing jq/node fallback: artifact exemption plus narrow_scope_required error path',
      run: (ctx) => assembleBundleFallbackCase(ctx, false),
    },
  ],
  'scripts/validate-findings': [
    {
      name: 'happy path: fence-stripped JSON envelope normalized with source injected (node present)',
      run: (ctx) => validateFindingsHappyPathCase(ctx, true),
    },
    {
      name: 'missing jq/node fallback: dependency-free unknown_error envelope printed on stdout',
      run: (ctx) => validateFindingsFallbackCase(ctx, false),
    },
  ],
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {string} opts.pluginRoot absolute path to the harness's installed
 *   copy of the Synthex plugin (must include scripts/, config/, and
 *   .claude-plugin/ — i.e. a full cpSync of the plugin fixture root, not a
 *   partial support-file copy).
 * @param {(relPath: string, caseName: string, result: { ok: boolean, error?: string }) => void} [opts.onCase]
 *   called once per case as it completes.
 * @returns {Promise<{ ok: boolean, results: Array<{ relPath: string, name: string, ok: boolean, error?: string }> }>}
 */
export async function runScriptSmoke({ pluginRoot, onCase }) {
  const scripts = discoverRuntimeScripts(pluginRoot);
  const root = mkdtempSync(join(tmpdir(), 'synthex-script-smoke-'));
  const results = [];
  try {
    for (const { relPath, absPath } of scripts) {
      const cases = SMOKE_CASES[relPath];
      if (!cases || cases.length === 0) {
        throw new Error(
          `script-smoke: no smoke cases registered for ${relPath} (add one to SMOKE_CASES in tests/compat/lib/script-smoke.mjs)`,
        );
      }
      for (const testCase of cases) {
        const workDir = mkdtempSync(join(root, 'case-'));
        const ctx = {
          scriptAbsPath: absPath,
          pluginRoot,
          workDir,
          buildRestrictedPath: (includeNode) => buildRestrictedPath(workDir, includeNode),
        };
        let result;
        try {
          testCase.run(ctx);
          result = { relPath, name: testCase.name, ok: true };
        } catch (error) {
          result = {
            relPath,
            name: testCase.name,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        } finally {
          rmSync(workDir, { recursive: true, force: true });
        }
        results.push(result);
        onCase?.(relPath, testCase.name, result);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return { ok: results.every((r) => r.ok), results };
}

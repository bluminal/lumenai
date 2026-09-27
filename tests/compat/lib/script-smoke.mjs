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

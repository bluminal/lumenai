/**
 * Layer 2: Behavioral fixtures for compact-recover.sh — the synthex
 * SessionStart hook (matcher: "compact") that reprints running-loop
 * identity after context compaction (FR-HM20, D32).
 *
 * PreCompact stdout is not injected into the post-compaction summary, so
 * the reliable mechanism is this SessionStart-with-matcher-"compact" hook,
 * whose stdout IS visible to the resumed session. Each test sets up a temp
 * project's .synthex/loops directory with one or more loop state files and
 * asserts on exactly what the hook prints.
 *
 * The "hosts without node" describe block follows the jq-less PATH pattern
 * from loop-idle-wait-behavioral.test.ts:148-165 — a PATH containing only
 * the POSIX tools the script needs, minus node, to prove the sed/awk
 * fallback reader also produces the correct output on hosts (Codex, Grok)
 * that may lack a node runtime.
 *
 * Plan: docs/plans/harness-modernization.md Task 36.
 * Spec: docs/reqs/harness-modernization.md § FR-HM20.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const HOOK = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'compact-recover.sh');

let projectDir: string;
let loopsDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'compact-recover-'));
  loopsDir = join(projectDir, '.synthex', 'loops');
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

function writeLoop(id: string, fields: Record<string, unknown> = {}): void {
  mkdirSync(loopsDir, { recursive: true });
  const full = {
    schema_version: 1,
    loop_id: id,
    status: 'running',
    iteration: 3,
    max_iterations: 20,
    ...fields,
  };
  writeFileSync(join(loopsDir, `${id}.json`), JSON.stringify(full));
}

function runHook(): string {
  return execFileSync('bash', [HOOK], {
    cwd: projectDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf-8',
  });
}

describe('compact-recover.sh — prints running-loop identity', () => {
  it('prints nothing when .synthex/loops does not exist', () => {
    expect(runHook()).toBe('');
  });

  it('prints nothing when .synthex/loops is empty', () => {
    mkdirSync(loopsDir, { recursive: true });
    expect(runHook()).toBe('');
  });

  it('prints one line for a single running loop', () => {
    writeLoop('next-priority-ab12', { iteration: 4, max_iterations: 20 });
    const out = runHook().trim();
    expect(out).toBe(
      'Synthex loop next-priority-ab12 is running (iteration 4/20); state: .synthex/loops/next-priority-ab12.json — continue with loop-step.sh advance next-priority-ab12',
    );
  });

  it('prints nothing for a cancelled loop', () => {
    writeLoop('np-1', { status: 'cancelled' });
    expect(runHook()).toBe('');
  });

  it('prints nothing for a completed loop', () => {
    writeLoop('np-1', { status: 'completed' });
    expect(runHook()).toBe('');
  });

  it('prints only the running loop when a running and a terminal loop coexist', () => {
    writeLoop('np-running', { iteration: 2, max_iterations: 10 });
    writeLoop('np-done', { status: 'completed', iteration: 10, max_iterations: 10 });
    const out = runHook().trim();
    expect(out).toBe(
      'Synthex loop np-running is running (iteration 2/10); state: .synthex/loops/np-running.json — continue with loop-step.sh advance np-running',
    );
  });

  it('prints one line per running loop when several loops are running', () => {
    writeLoop('np-a', { iteration: 1, max_iterations: 5 });
    writeLoop('np-b', { iteration: 7, max_iterations: 8 });
    const lines = runHook().trim().split('\n').sort();
    expect(lines).toEqual([
      'Synthex loop np-a is running (iteration 1/5); state: .synthex/loops/np-a.json — continue with loop-step.sh advance np-a',
      'Synthex loop np-b is running (iteration 7/8); state: .synthex/loops/np-b.json — continue with loop-step.sh advance np-b',
    ]);
  });

  it('falls back to the filename when loop_id is missing from the state file', () => {
    mkdirSync(loopsDir, { recursive: true });
    writeFileSync(
      join(loopsDir, 'np-nofield.json'),
      JSON.stringify({ schema_version: 1, status: 'running', iteration: 1, max_iterations: 5 }),
    );
    const out = runHook().trim();
    expect(out).toBe(
      'Synthex loop np-nofield is running (iteration 1/5); state: .synthex/loops/np-nofield.json — continue with loop-step.sh advance np-nofield',
    );
  });

  it('ignores files already moved under .archive/', () => {
    mkdirSync(join(loopsDir, '.archive'), { recursive: true });
    writeFileSync(
      join(loopsDir, '.archive', 'np-old-2026-01-01T00-00-00Z.json'),
      JSON.stringify({ schema_version: 1, loop_id: 'np-old', status: 'running', iteration: 1, max_iterations: 5 }),
    );
    expect(runHook()).toBe('');
  });

  it('exits 0 even when it prints nothing', () => {
    mkdirSync(loopsDir, { recursive: true });
    expect(() => runHook()).not.toThrow();
  });
});

/** A PATH containing only the POSIX tools the script needs, minus node — the
 * loop-idle-wait-behavioral.test.ts:148-165 pattern, adapted to prove the
 * sed/awk fallback reader (Codex/Grok hosts may lack a node runtime). */
function nodelessPath(): string {
  const bin = join(projectDir, 'bin-nonode');
  mkdirSync(bin, { recursive: true });
  for (const tool of ['bash', 'awk', 'basename']) {
    const src = execFileSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf-8' }).trim();
    try {
      symlinkSync(src, join(bin, tool));
    } catch {
      /* already linked in a shared tmp base — ignore */
    }
  }
  return bin;
}

describe('compact-recover.sh — hosts without node', () => {
  function runNoNode(): string {
    const bin = nodelessPath();
    return execFileSync(join(bin, 'bash'), [HOOK], {
      cwd: projectDir,
      env: { PATH: bin, CLAUDE_PROJECT_DIR: projectDir },
      encoding: 'utf-8',
    });
  }

  it('still prints the running loop via the sed/awk fallback reader', () => {
    writeLoop('np-fallback', { iteration: 6, max_iterations: 12 });
    const out = runNoNode().trim();
    expect(out).toBe(
      'Synthex loop np-fallback is running (iteration 6/12); state: .synthex/loops/np-fallback.json — continue with loop-step.sh advance np-fallback',
    );
  });

  it('still prints nothing when no loop is running', () => {
    writeLoop('np-done', { status: 'completed' });
    expect(runNoNode()).toBe('');
  });
});

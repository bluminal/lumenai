/**
 * Layer 2: Behavioral fixtures for state-flag.sh — the generic boolean-flag
 * writer for .synthex/state.json (FR-HM26, Task 38).
 *
 * state-flag.sh reuses scripts/upgrade-nudge.sh's field-preservation rules:
 * every existing top-level field in state.json — including ones the script
 * itself never writes, such as "plugin_root" and "last_seen_version"
 * (upgrade-nudge.sh's own fields) — must survive a flag write untouched.
 * The write is atomic (tmp file + `mv -f`), and the script must work with
 * neither `jq` nor `node` on PATH (D19 / NFR-HM4): jq is never a dependency
 * at all, and node is used opportunistically behind `command -v node`,
 * falling back to a sed/awk-only reader+writer otherwise.
 *
 * The "hosts without node" describe block follows the jq-less PATH pattern
 * from loop-idle-wait-behavioral.test.ts:148-165 / compact-recover
 * -behavioral.test.ts — a restricted PATH containing only the POSIX tools
 * the script needs (never jq), minus node, to prove the fallback reader
 * also produces correct, field-preserving output.
 *
 * Plan: docs/plans/harness-modernization.md Task 38.
 * Spec: docs/reqs/harness-modernization.md § FR-HM26.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  chmodSync,
  existsSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'state-flag.sh');

let projectDir: string;
let synthexDir: string;
let stateFile: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'state-flag-'));
  synthexDir = join(projectDir, '.synthex');
  stateFile = join(synthexDir, 'state.json');
  mkdirSync(synthexDir, { recursive: true });
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

function writeState(fields: Record<string, unknown>): void {
  writeFileSync(stateFile, JSON.stringify(fields, null, 2) + '\n');
}

function readState(): Record<string, unknown> {
  return JSON.parse(readFileSync(stateFile, 'utf-8'));
}

function run(
  args: string[],
  opts: { pathDir?: string; env?: Record<string, string> } = {},
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('bash', [SCRIPT, ...args], {
      cwd: projectDir,
      env: {
        ...(opts.pathDir ? { PATH: opts.pathDir } : process.env),
        CLAUDE_PROJECT_DIR: projectDir,
        ...opts.env,
      },
      encoding: 'utf-8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err: any) {
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('state-flag.sh — writes a boolean flag', () => {
  it('creates state.json with schema_version, the flag, and updated_at when no file exists', () => {
    const result = run(['dismissed']);
    expect(result.code).toBe(0);
    const state = readState();
    expect(state.schema_version).toBe(1);
    expect(state.dismissed).toBe(true);
    expect(typeof state.updated_at).toBe('string');
    expect(state.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('sets the flag to true by default', () => {
    run(['starred']);
    expect(readState().starred).toBe(true);
  });

  it('accepts an explicit false value', () => {
    writeState({ schema_version: 1, dismissed: true });
    run(['dismissed', 'false']);
    expect(readState().dismissed).toBe(false);
  });

  it('preserves existing known fields (last_seen_version, plugin_root, other flags)', () => {
    writeState({
      schema_version: 1,
      last_seen_version: '0.5.0',
      plugin_root: '/Users/dev/.claude/plugins/synthex',
      dismissed: false,
      starred: false,
      star_dismissed: false,
      updated_at: '2026-01-01T00:00:00Z',
    });
    const result = run(['starred']);
    expect(result.code).toBe(0);
    const state = readState();
    expect(state.last_seen_version).toBe('0.5.0');
    expect(state.plugin_root).toBe('/Users/dev/.claude/plugins/synthex');
    expect(state.dismissed).toBe(false);
    expect(state.starred).toBe(true);
    expect(state.star_dismissed).toBe(false);
    expect(state.updated_at).not.toBe('2026-01-01T00:00:00Z');
  });

  it('preserves a field this script has never heard of (forward-compat)', () => {
    writeState({ schema_version: 1, some_future_field: 'keep-me', dismissed: false });
    run(['dismissed']);
    expect(readState().some_future_field).toBe('keep-me');
  });

  it('treats a malformed existing file as missing and overwrites it (FR-UO18 parity)', () => {
    writeFileSync(stateFile, '{ not valid json !!');
    const result = run(['dismissed']);
    expect(result.code).toBe(0);
    const state = readState();
    expect(state.dismissed).toBe(true);
    expect(state.schema_version).toBe(1);
  });

  it('is idempotent — running twice in a row is safe', () => {
    run(['dismissed']);
    const first = readState();
    run(['dismissed']);
    const second = readState();
    expect(second.dismissed).toBe(true);
    expect(first.dismissed).toBe(second.dismissed);
  });

  it('rejects a missing flag argument (exit 1)', () => {
    const result = run([]);
    expect(result.code).toBe(1);
    expect(existsSync(stateFile)).toBe(false);
  });

  it('rejects an invalid flag name (exit 1)', () => {
    const result = run(['not-an-identifier']);
    expect(result.code).toBe(1);
  });

  it('rejects an invalid value argument (exit 1)', () => {
    const result = run(['dismissed', 'yes']);
    expect(result.code).toBe(1);
  });

  it('exits 2 and writes nothing when .synthex/ does not exist', () => {
    rmSync(synthexDir, { recursive: true, force: true });
    const result = run(['dismissed']);
    expect(result.code).toBe(2);
    expect(existsSync(stateFile)).toBe(false);
  });
});

describe('state-flag.sh — atomic write', () => {
  it('leaves no tmp file behind on success', () => {
    run(['dismissed']);
    const entries = readdirSync(synthexDir);
    expect(entries).toEqual(['state.json']);
  });

  it('does not leave a partial state.json or stray tmp file when the directory is not writable', () => {
    writeState({ schema_version: 1, dismissed: false });
    chmodSync(synthexDir, 0o555);
    try {
      const result = run(['dismissed']);
      expect(result.code).toBe(5);
    } finally {
      chmodSync(synthexDir, 0o755);
    }
    const entries = readdirSync(synthexDir);
    expect(entries).toEqual(['state.json']);
    // Original content untouched — the write never landed.
    expect(readState().dismissed).toBe(false);
  });
});

/** A PATH containing only the POSIX tools state-flag.sh needs — never jq,
 * optionally node — the loop-idle-wait-behavioral.test.ts:148-165 /
 * compact-recover-behavioral.test.ts pattern. */
function buildRestrictedPath(includeNode: boolean): string {
  const bin = join(projectDir, `bin-${includeNode ? 'node' : 'nonode'}`);
  mkdirSync(bin, { recursive: true });
  const tools = ['bash', 'sh', 'sed', 'awk', 'grep', 'cut', 'head', 'tr', 'mv', 'rm', 'mkdir', 'date', 'dirname', 'basename', 'cat'];
  for (const tool of tools) {
    const src = execFileSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf-8' }).trim();
    try {
      symlinkSync(src, join(bin, tool));
    } catch {
      /* already linked in a shared tmp base — ignore */
    }
  }
  if (includeNode) {
    const nodeSrc = execFileSync('bash', ['-c', 'command -v node'], { encoding: 'utf-8' }).trim();
    try {
      symlinkSync(nodeSrc, join(bin, 'node'));
    } catch {
      /* ignore */
    }
  }
  return bin;
}

describe('state-flag.sh — jq-less PATH (node present)', () => {
  it('writes the flag and preserves other fields with no jq on PATH', () => {
    writeState({ schema_version: 1, last_seen_version: '0.5.0', dismissed: false });
    const pathDir = buildRestrictedPath(true);
    const result = run(['dismissed'], { pathDir });
    expect(result.code).toBe(0);
    const state = readState();
    expect(state.dismissed).toBe(true);
    expect(state.last_seen_version).toBe('0.5.0');
  });
});

describe('state-flag.sh — node-less PATH (sed/awk fallback)', () => {
  it('still writes the flag via the fallback reader/writer', () => {
    writeState({
      schema_version: 1,
      last_seen_version: '0.5.0',
      plugin_root: '/opt/synthex',
      dismissed: false,
      starred: true,
      star_dismissed: false,
      updated_at: '2026-01-01T00:00:00Z',
    });
    const pathDir = buildRestrictedPath(false);
    const result = run(['star_dismissed'], { pathDir });
    expect(result.code).toBe(0);
    const state = readState();
    expect(state.star_dismissed).toBe(true);
    // Every other field survives the sed/awk-only path untouched.
    expect(state.last_seen_version).toBe('0.5.0');
    expect(state.plugin_root).toBe('/opt/synthex');
    expect(state.dismissed).toBe(false);
    expect(state.starred).toBe(true);
    expect(state.updated_at).not.toBe('2026-01-01T00:00:00Z');
  });

  it('creates a fresh file via the fallback path when none exists', () => {
    const pathDir = buildRestrictedPath(false);
    const result = run(['dismissed'], { pathDir });
    expect(result.code).toBe(0);
    const state = readState();
    expect(state.schema_version).toBe(1);
    expect(state.dismissed).toBe(true);
  });

  it('leaves no tmp file behind via the fallback path', () => {
    const pathDir = buildRestrictedPath(false);
    run(['dismissed'], { pathDir });
    const entries = readdirSync(synthexDir);
    expect(entries).toEqual(['state.json']);
  });
});

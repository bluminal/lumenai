/**
 * Layer 2: behavioral fixtures for scripts/lib/detect-workspace-host.sh
 * (FR-HW2). Fake `orca` / `herdr` binaries on a private PATH stand in for the
 * real tools, so the test never touches a running Orca or Herdr.
 *
 * Plan: docs/plans/next-priority-host-workspaces.md T1.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', '..', 'plugins', 'synthex', 'scripts', 'lib', 'detect-workspace-host.sh');

let bin: string;

beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), 'detect-ws-bin-'));
});

afterEach(() => {
  rmSync(bin, { recursive: true, force: true });
});

function fake(name: string, body: string): void {
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

function detect(env: Record<string, string> = {}): string {
  const r = spawnSync('bash', [SCRIPT], {
    // Only the fake bin plus the system dirs the script's own tools need.
    env: { PATH: `${bin}:/usr/bin:/bin`, ...env },
    encoding: 'utf8',
  });
  expect(r.status).toBe(0);
  return r.stdout.trim();
}

const ORCA_OK = `echo '{ "ok": true, "result": { "worktree": {} } }'`;
const ORCA_NOT_HERE = `echo '{ "ok": false, "error": { "code": "selector_not_found" } }'; exit 1`;

describe('detect-workspace-host.sh (FR-HW2)', () => {
  it('prints none with no workspace manager', () => {
    expect(detect()).toBe('none');
  });

  it('prints orca when the current directory is an Orca-managed worktree', () => {
    fake('orca', ORCA_OK);
    expect(detect()).toBe('orca');
  });

  it('ignores an installed orca when the directory is not an Orca worktree', () => {
    fake('orca', ORCA_NOT_HERE);
    expect(detect()).toBe('none');
  });

  it('prints herdr only when HERDR_ENV=1 and herdr is on PATH', () => {
    fake('herdr', 'exit 0');
    expect(detect()).toBe('none');
    expect(detect({ HERDR_ENV: '1' })).toBe('herdr');
    rmSync(join(bin, 'herdr'));
    expect(detect({ HERDR_ENV: '1' })).toBe('none');
  });

  it('prefers orca over herdr when both apply', () => {
    fake('orca', ORCA_OK);
    fake('herdr', 'exit 0');
    expect(detect({ HERDR_ENV: '1' })).toBe('orca');
  });

  it('prints conductor (detect-only) when CONDUCTOR_WORKSPACE_PATH is set', () => {
    expect(detect({ CONDUCTOR_WORKSPACE_PATH: '/tmp/ws' })).toBe('conductor');
    fake('herdr', 'exit 0');
    expect(detect({ CONDUCTOR_WORKSPACE_PATH: '/tmp/ws', HERDR_ENV: '1' })).toBe('herdr');
  });
});

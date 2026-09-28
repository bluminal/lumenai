/**
 * Layer 2: Behavioral fixtures for scripts/task-completed-gate.sh and
 * scripts/teammate-idle-gate.sh — the FR-HM23 real TaskCompleted/
 * TeammateIdle command hooks. `TaskCompleted` and `TeammateIdle` fire
 * outside any model turn, so they support only command hooks (exit 2 to
 * block/redirect, exit 0 to allow); the classification table that used to
 * live entirely in prose (plugins/synthex-plus/hooks/*.md) now lives in
 * these scripts as deterministic code, gated by `standing_pools.enabled`.
 *
 * Task 50 [T] acceptance criteria (docs/plans/harness-modernization.md):
 *   - exit codes for both hooks (0 allow, 2 block/keep-working)
 *   - no-op (exit 0) when `standing_pools.enabled` is not "true"
 *   - no-op (exit 0) when the project has no Synthex config at all
 *   - no-op (exit 0) when node is unavailable (fail open)
 *   - task-completed-gate.sh: the work-type classification table
 *     (infrastructure > frontend > test > code > documentation, with the
 *     documented ambiguity-resolution rules) and its reviewer-routing table
 *   - teammate-idle-gate.sh: the standing-pool exemption (always allow) and
 *     the non-standing role-matching / dependency / cross-functional rules
 *
 * Spec: docs/reqs/harness-modernization.md § FR-HM23.
 * Plan: docs/plans/harness-modernization.md Task 50.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const TASK_COMPLETED_SCRIPT = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'task-completed-gate.sh');
const TEAMMATE_IDLE_SCRIPT = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'teammate-idle-gate.sh');

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'lifecycle-hooks-'));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

type RunResult = { stdout: string; stderr: string; status: number };

function runHook(script: string, payload: unknown, opts: { pathDir?: string; cwd?: string } = {}): RunResult {
  const pathDir = opts.pathDir ?? process.env.PATH ?? '';
  const result = spawnSync('bash', [script], {
    cwd: opts.cwd ?? projectDir,
    env: { PATH: pathDir, CLAUDE_PROJECT_DIR: opts.cwd ?? projectDir },
    input: payload === undefined ? '' : JSON.stringify(payload),
    encoding: 'utf-8',
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
}

function writeSynthexConfig(yaml: string, dir = '.synthex'): void {
  mkdirSync(join(projectDir, dir), { recursive: true });
  writeFileSync(join(projectDir, dir, 'config.yaml'), yaml);
}

function buildRestrictedPath(includeNode: boolean): string {
  const bin = mkdtempSync(join(tmpdir(), `lifecycle-hooks-bin-${includeNode ? 'node' : 'nonode'}-`));
  const tools = ['bash', 'sh', 'cat'];
  for (const tool of tools) {
    const result = spawnSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf-8' });
    const src = result.stdout.trim();
    if (src) spawnSync('ln', ['-sf', src, join(bin, tool)]);
  }
  if (includeNode) {
    const result = spawnSync('bash', ['-c', 'command -v node'], { encoding: 'utf-8' });
    const src = result.stdout.trim();
    if (src) spawnSync('ln', ['-sf', src, join(bin, 'node')]);
  }
  return bin;
}

const ENABLED_POOLS_CONFIG = 'standing_pools:\n  enabled: true\n';

// ── task-completed-gate.sh ──────────────────────────────────────────────

describe('task-completed-gate.sh — no-op / gating conditions (Task 50, FR-HM23)', () => {
  it('exits 0 with no stdout when the project has no Synthex config at all', () => {
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['src/foo.ts'] });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('exits 0 when standing_pools.enabled is false', () => {
    writeSynthexConfig('standing_pools:\n  enabled: false\n');
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['src/foo.ts'] });
    expect(result.status).toBe(0);
  });

  it('exits 0 when standing_pools.enabled is unset (config exists but key absent)', () => {
    writeSynthexConfig('other_key: value\n');
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['src/foo.ts'] });
    expect(result.status).toBe(0);
  });

  it('exits 0 when the review gate itself is disabled', () => {
    writeSynthexConfig(`${ENABLED_POOLS_CONFIG}hooks:\n  task_completed:\n    review_gate:\n      enabled: false\n`);
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['src/foo.ts'] });
    expect(result.status).toBe(0);
  });

  it('falls back to the legacy .synthex-plus/config.yaml (D6) when .synthex/config.yaml does not exist', () => {
    writeSynthexConfig(ENABLED_POOLS_CONFIG, '.synthex-plus');
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['src/foo.ts'] });
    expect(result.status).toBe(2);
  });

  it('fails open (exit 0) when node is unavailable, even with an enabled config', () => {
    writeSynthexConfig(ENABLED_POOLS_CONFIG);
    const pathDir = buildRestrictedPath(false);
    try {
      const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['src/foo.ts'] }, { pathDir });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
    } finally {
      rmSync(pathDir, { recursive: true, force: true });
    }
  });

  it('exits 0 on empty stdin', () => {
    writeSynthexConfig(ENABLED_POOLS_CONFIG);
    const result = runHook(TASK_COMPLETED_SCRIPT, undefined);
    expect(result.status).toBe(0);
  });

  it('exits 0 on unparseable JSON payload (fail open)', () => {
    writeSynthexConfig(ENABLED_POOLS_CONFIG);
    const pathDir = buildRestrictedPath(true);
    try {
      const raw = spawnSync('bash', [TASK_COMPLETED_SCRIPT], {
        cwd: projectDir,
        env: { PATH: pathDir, CLAUDE_PROJECT_DIR: projectDir },
        input: 'not json at all {{{',
        encoding: 'utf-8',
      });
      expect(raw.status).toBe(0);
    } finally {
      rmSync(pathDir, { recursive: true, force: true });
    }
  });
});

describe('task-completed-gate.sh — work-type classification table (Task 50, FR-HM23)', () => {
  beforeEach(() => {
    writeSynthexConfig(ENABLED_POOLS_CONFIG);
  });

  it('classifies a *.tf file as infrastructure and routes to code-reviewer + terraform-plan-reviewer', () => {
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['infra/main.tf'] });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('infrastructure change');
    expect(result.stderr).toContain('code-reviewer, terraform-plan-reviewer');
  });

  it('classifies a *.tsx file under src/ as frontend and routes to code-reviewer + security-reviewer + design-system-agent', () => {
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['src/components/Widget.tsx'] });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('frontend change');
    expect(result.stderr).toContain('code-reviewer, security-reviewer, design-system-agent');
  });

  it('classifies a plain *.ts file as code and routes to code-reviewer + security-reviewer', () => {
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['src/lib/util.ts'] });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('code change');
    expect(result.stderr).toContain('code-reviewer, security-reviewer');
  });

  it('classifies an all-test-file change as test and routes to code-reviewer only', () => {
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['tests/foo.test.ts', 'tests/bar.spec.ts'] });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('test change');
    expect(result.stderr).toContain('route to code-reviewer before');
  });

  it('classifies an all-documentation change as documentation and allows (exit 0, no gate)', () => {
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['docs/reqs/main.md', 'README.md'] });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('defaults an empty file list to code (most common default)', () => {
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: [] });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('code change');
  });

  it('ambiguity: mixed code + test files classify as code, not test', () => {
    const result = runHook(TASK_COMPLETED_SCRIPT, { files: ['src/lib/util.ts', 'src/lib/util.test.ts'] });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('code change');
  });

  it('ambiguity: mixed frontend + backend files classify as frontend', () => {
    const result = runHook(TASK_COMPLETED_SCRIPT, {
      files: ['src/components/Widget.tsx', 'server/api/handler.ts'],
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('frontend change');
  });

  it('infrastructure takes priority over frontend when both match', () => {
    const result = runHook(TASK_COMPLETED_SCRIPT, {
      files: ['deploy/k8s/service.yaml', 'src/components/Widget.tsx'],
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('infrastructure change');
  });

  it('reads the file list from completion_note.files when files is absent', () => {
    const result = runHook(TASK_COMPLETED_SCRIPT, { completion_note: { files: ['infra/main.tf'] } });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('infrastructure change');
  });
});

// ── teammate-idle-gate.sh ───────────────────────────────────────────────

describe('teammate-idle-gate.sh — no-op / gating conditions (Task 50, FR-HM23)', () => {
  it('exits 0 with no stdout when the project has no Synthex config at all', () => {
    const result = runHook(TEAMMATE_IDLE_SCRIPT, {
      standing: false,
      teammate: { role: 'reviewer' },
      pending_tasks: [{ id: 'task-1', role: 'reviewer', blocked: false }],
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('exits 0 when standing_pools.enabled is false', () => {
    writeSynthexConfig('standing_pools:\n  enabled: false\n');
    const result = runHook(TEAMMATE_IDLE_SCRIPT, {
      standing: false,
      teammate: { role: 'reviewer' },
      pending_tasks: [{ id: 'task-1', role: 'reviewer', blocked: false }],
    });
    expect(result.status).toBe(0);
  });

  it('exits 0 when work assignment itself is disabled', () => {
    writeSynthexConfig(`${ENABLED_POOLS_CONFIG}hooks:\n  teammate_idle:\n    work_assignment:\n      enabled: false\n`);
    const result = runHook(TEAMMATE_IDLE_SCRIPT, {
      standing: false,
      teammate: { role: 'reviewer' },
      pending_tasks: [{ id: 'task-1', role: 'reviewer', blocked: false }],
    });
    expect(result.status).toBe(0);
  });

  it('fails open (exit 0) when node is unavailable, even with an enabled config and matching work', () => {
    writeSynthexConfig(ENABLED_POOLS_CONFIG);
    const pathDir = buildRestrictedPath(false);
    try {
      const result = runHook(
        TEAMMATE_IDLE_SCRIPT,
        { standing: false, teammate: { role: 'reviewer' }, pending_tasks: [{ id: 'task-1', role: 'reviewer', blocked: false }] },
        { pathDir },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
    } finally {
      rmSync(pathDir, { recursive: true, force: true });
    }
  });

  it('exits 0 on empty stdin', () => {
    writeSynthexConfig(ENABLED_POOLS_CONFIG);
    const result = runHook(TEAMMATE_IDLE_SCRIPT, undefined);
    expect(result.status).toBe(0);
  });
});

describe('teammate-idle-gate.sh — standing-pool exemption (Task 50, FR-HM23 / FR-MMT12 / FR-MMT26)', () => {
  beforeEach(() => {
    writeSynthexConfig(ENABLED_POOLS_CONFIG);
  });

  it('always allows idle (exit 0) for a standing-pool teammate, even with matching unblocked work', () => {
    const result = runHook(TEAMMATE_IDLE_SCRIPT, {
      standing: true,
      teammate: { role: 'reviewer' },
      pending_tasks: [{ id: 'task-1', role: 'reviewer', blocked: false }],
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('the standing-pool branch is checked before role matching (no stderr routing text)', () => {
    const result = runHook(TEAMMATE_IDLE_SCRIPT, {
      standing: true,
      teammate: { role: 'reviewer' },
      pending_tasks: [{ id: 'task-1', role: 'reviewer', blocked: false }],
    });
    expect(result.stderr).toBe('');
  });
});

describe('teammate-idle-gate.sh — non-standing role matching (Task 50, FR-HM23)', () => {
  beforeEach(() => {
    writeSynthexConfig(ENABLED_POOLS_CONFIG);
  });

  it('blocks (exit 2) and names the lowest-id unblocked task matching the teammate role', () => {
    const result = runHook(TEAMMATE_IDLE_SCRIPT, {
      standing: false,
      teammate: { role: 'reviewer' },
      pending_tasks: [
        { id: 'task-9', role: 'reviewer', blocked: false },
        { id: 'task-2', role: 'reviewer', blocked: false },
        { id: 'task-1', role: 'frontend', blocked: false },
      ],
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('assign task-2');
  });

  it('never assigns a blocked task (dependency respect)', () => {
    const result = runHook(TEAMMATE_IDLE_SCRIPT, {
      standing: false,
      teammate: { role: 'reviewer' },
      pending_tasks: [{ id: 'task-1', role: 'reviewer', blocked: true }],
    });
    expect(result.status).toBe(0);
  });

  it('allows idle (exit 0) when no role-matching unblocked task exists and cross-functional is off', () => {
    const result = runHook(TEAMMATE_IDLE_SCRIPT, {
      standing: false,
      teammate: { role: 'reviewer' },
      pending_tasks: [{ id: 'task-1', role: 'frontend', blocked: false }],
    });
    expect(result.status).toBe(0);
  });

  it('suggests a cross-functional task (exit 2) when allow_cross_functional is true and no role match exists', () => {
    writeSynthexConfig(`${ENABLED_POOLS_CONFIG}hooks:\n  teammate_idle:\n    work_assignment:\n      allow_cross_functional: true\n`);
    const result = runHook(TEAMMATE_IDLE_SCRIPT, {
      standing: false,
      teammate: { role: 'reviewer' },
      pending_tasks: [{ id: 'task-1', role: 'frontend', blocked: false }],
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('assign task-1');
    expect(result.stderr).toContain('cross-functional suggestion');
  });

  it('does not suggest cross-functional work when allow_cross_functional is true but no unblocked task exists at all', () => {
    writeSynthexConfig(`${ENABLED_POOLS_CONFIG}hooks:\n  teammate_idle:\n    work_assignment:\n      allow_cross_functional: true\n`);
    const result = runHook(TEAMMATE_IDLE_SCRIPT, {
      standing: false,
      teammate: { role: 'reviewer' },
      pending_tasks: [{ id: 'task-1', role: 'frontend', blocked: true }],
    });
    expect(result.status).toBe(0);
  });
});

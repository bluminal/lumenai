/**
 * Layer 1: Keeps the next-priority worktree lifecycle bounded.
 *
 * A merged task worktree must be deleted before the orchestrator proceeds;
 * otherwise ignored worktrees accumulate and can exhaust developer disks.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMMAND_PATH = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'commands',
  'next-priority.md'
);
const content = readFileSync(COMMAND_PATH, 'utf8');

describe('next-priority merged-worktree lifecycle', () => {
  it('requires worktree removal immediately after a successful merge and before plan updates', () => {
    const merge = content.indexOf('git merge --ff-only');
    // The heading is qualified to worktrees this command created; cloud and
    // host-checkout tasks have no command-created worktree to remove.
    const cleanup = content.indexOf('**Immediate cleanup invariant');
    const remove = content.indexOf('git worktree remove', cleanup);
    const planUpdate = content.indexOf('### 9. Update the Plan');

    expect(merge).toBeGreaterThanOrEqual(0);
    expect(cleanup).toBeGreaterThan(merge);
    expect(remove).toBeGreaterThan(cleanup);
    expect(planUpdate).toBeGreaterThan(remove);
    expect(content.slice(cleanup, planUpdate)).toContain('Immediately after each successful merge');
    expect(content.slice(cleanup, planUpdate)).toContain('Do not defer this cleanup');
  });

  it('requires verification and refuses destructive cleanup of uncommitted work', () => {
    const cleanupToPlanUpdate = content.slice(
      content.indexOf('**Immediate cleanup invariant'),
      content.indexOf('### 9. Update the Plan')
    );

    expect(cleanupToPlanUpdate).toContain('git worktree list');
    expect(cleanupToPlanUpdate).toContain('Never use `git worktree remove --force`');
    expect(cleanupToPlanUpdate).toContain('never remove a worktree that has uncommitted changes');
  });

  it('uses Claude Code isolation instead of git worktree add when the default base path is in effect (FR-HW8)', () => {
    const step4 = content.slice(content.indexOf('### 4.'), content.indexOf('### 5.'));
    expect(step4).toMatch(/\*\*Claude Code isolation \(FR-HW8\):\*\* when local, your spawn tool accepts `isolation`, and `worktrees\.base_path` is `\.claude\/worktrees`, create no worktree here/);
    expect(step4).toContain('Rerun a worker that reports `blocked: git refused in isolated worktree` with a manual worktree below.');
    expect(step4).toContain('**Local (otherwise; skip entirely for `cloud` or `workspace`):**');
    // The worker keeps worktrees.branch_prefix by renaming the harness branch.
    expect(content).toContain('**Isolated:** First run `git branch -m <task-branch>`');
    // Live spike 2026-11-05: the isolation guard refuses `"$(command -v git)"` but accepts a literal path.
    expect(content).toContain('retry with the literal path `command -v git` prints (no `$(...)`)');
  });

  it('removes the isolated worktree the spawn returned as part of the cleanup invariant (FR-HW8)', () => {
    expect(content).toContain('**Immediate cleanup invariant (every local task checkout):**');
    expect(content).toContain('remove that task\'s exact worktree (under isolation, the `worktreePath` its spawn returned):');
  });
});

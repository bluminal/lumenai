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

  it('skips creating and removing a worktree when the host gives each worker its own checkout', () => {
    const step4 = content.slice(content.indexOf('### 4.'), content.indexOf('### 5.'));
    expect(step4).toMatch(/skip entirely when[^\n]*cloud[^\n]*host gives each worker its own checkout/);
    expect(step4).toContain('isolation: "worktree"');
    expect(content).toContain('**Host checkout:** Check out the task branch');
    expect(content).toMatch(/\*\*Immediate cleanup invariant \(worktrees this command created; a host-owned checkout is the host's to clean up\):\*\*/);
  });
});

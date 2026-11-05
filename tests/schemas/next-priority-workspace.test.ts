/**
 * Layer 1: next-priority host-workspace execution (FR-HW1–FR-HW7).
 *
 * The --in-workspace flag and resolution live in commands/next-priority.md;
 * the Orca/Herdr detail lives in the D17 cold-path doc
 * docs/next-priority-workspace.md.
 *
 * Plan: docs/plans/next-priority-host-workspaces.md T5.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(__dirname, '..', '..', 'plugins', 'synthex');
const command = readFileSync(join(PLUGIN, 'commands', 'next-priority.md'), 'utf8');
const doc = readFileSync(join(PLUGIN, 'docs', 'next-priority-workspace.md'), 'utf8');
const defaults = readFileSync(join(PLUGIN, 'config', 'defaults.yaml'), 'utf8');

function section(text: string, start: string, end: string): string {
  const s = text.indexOf(start);
  const e = text.indexOf(end, s + start.length);
  expect(s).toBeGreaterThanOrEqual(0);
  expect(e).toBeGreaterThan(s);
  return text.slice(s, e);
}

describe('next-priority --in-workspace (FR-HW1)', () => {
  it('documents --in-workspace as opt-in defaulting to off', () => {
    const row = command.split('\n').find((l) => l.startsWith('| `--in-workspace`'));
    expect(row).toBeDefined();
    expect(row).toMatch(/\|\s*off\s*\|\s*No\s*\|$/);
  });

  it('lets --local win and refuses --in-cloud with --in-workspace', () => {
    const env = section(command, '### Execution Environment Resolution', '## Core Responsibilities');
    expect(env).toContain('`--local` beats `--in-cloud` and `--in-workspace`');
    expect(env).toContain('passing both of those is refused with one line');
    expect(env).toContain('Read `${CLAUDE_PLUGIN_ROOT}/docs/next-priority-workspace.md`');
  });

  it('lists workspace as a config value without changing the local default', () => {
    expect(defaults).toMatch(/Options: local \| cloud \| workspace/);
    expect(defaults).toMatch(/next_priority:[\s\S]*?execution_environment:\s*local/);
  });
});

describe('next-priority-workspace.md cold path', () => {
  it('is a frontmatter-less cold-path doc', () => {
    expect(doc.startsWith('# next-priority: host workspace execution')).toBe(true);
    expect(doc).not.toMatch(/^---/);
  });

  it('detects the host with the script and falls back for conductor / none (FR-HW2, FR-HW3)', () => {
    expect(doc).toContain('scripts/lib/detect-workspace-host.sh');
    expect(doc).toContain(
      'Host workspaces are not supported here (<value>) — falling back to local worktrees.',
    );
  });

  it('never creates a worktree under worktrees.base_path', () => {
    expect(doc).toMatch(/does \*\*not\*\* run `git worktree add` under `worktrees\.base_path`/);
  });

  it('keeps briefs and results outside every checkout', () => {
    expect(doc).toContain('mktemp -d');
    expect(doc).toContain('<task-id>.result.md');
  });

  it('spawns Orca child workspaces under the current one (FR-HW4)', () => {
    expect(doc).toMatch(/orca worktree create [^\n]*--parent-worktree current/);
    expect(doc).toMatch(/--branch <task-branch> --agent <agent-id>/);
  });

  it('spawns Herdr worktree workspaces and starts the agent (FR-HW5)', () => {
    expect(doc).toContain('herdr worktree create --branch <task-branch> --base <base>');
    expect(doc).toContain('herdr agent start <name> --kind <agent-id> --pane <root-pane-id>');
  });

  it('waits per host and never answers for the user (FR-HW6)', () => {
    expect(doc).toContain('orca terminal wait --terminal <handle> --for tui-idle');
    expect(doc).toContain('herdr agent wait <name>');
    expect(doc).toMatch(/Never answer a worker's question or approve a prompt on the user's behalf/);
  });

  it('merges locally and removes the child workspace without --force (FR-HW7)', () => {
    const step8 = doc.slice(doc.indexOf('## Step 8'));
    expect(step8).toContain('No fetch is needed');
    expect(step8).toContain('orca worktree rm --worktree path:<checkout-path>');
    expect(step8).toContain('herdr worktree remove --workspace <workspace-id>');
    expect(step8).toContain('Never pass `--force`');
  });
});

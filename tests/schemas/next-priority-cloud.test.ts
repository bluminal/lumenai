/**
 * Layer 1: Guards Cursor cloud / FG-BG contracts on next-priority.md (FR-CA*).
 *
 * Plan: docs/plans/cursor-cloud-agent-support.md
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const COMMAND_PATH = join(ROOT, 'plugins', 'synthex', 'commands', 'next-priority.md');
const DEFAULTS_PATH = join(ROOT, 'plugins', 'synthex', 'config', 'defaults.yaml');

const content = readFileSync(COMMAND_PATH, 'utf8');
// Cloud execution is opt-in and off by default, so its detail lives in a D17
// cold-path doc the command Reads only when the environment resolves to cloud.
const CLOUD_PATH = join(ROOT, 'plugins', 'synthex', 'docs', 'next-priority-cloud.md');
const cloud = readFileSync(CLOUD_PATH, 'utf8');
const defaults = readFileSync(DEFAULTS_PATH, 'utf8');

function section(startMarker: string, endMarker: string, text = content): string {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe('next-priority cloud / local parameters (FR-CA3)', () => {
  const params = () => section('## Parameters', '## Core Responsibilities');

  it('documents --in-cloud as opt-in defaulting to off', () => {
    const row = params()
      .split('\n')
      .find((line) => line.includes('`--in-cloud`'));
    expect(row).toBeDefined();
    expect(row).toMatch(/\|\s*off\s*\|/);
    expect(row).toMatch(/\|\s*No\s*\|/);
    expect(cloud).toMatch(/environment:\s*"cloud"/);
  });

  it('documents --local as opt-in override defaulting to off', () => {
    const row = params()
      .split('\n')
      .find((line) => line.includes('`--local`'));
    expect(row).toBeDefined();
    expect(row).toMatch(/\|\s*off\s*\|/);
    expect(row).toMatch(/\|\s*No\s*\|/);
  });

  it('documents resolution order flag > config > local', () => {
    const env = section('### Execution Environment Resolution', '## Core Responsibilities');
    expect(env).toMatch(/--local.*--in-cloud.*next_priority\.execution_environment/s);
    expect(cloud).toContain('`--local` wins');
  });
});

describe('defaults.yaml next_priority.execution_environment (FR-CA2)', () => {
  it('defaults execution_environment to local', () => {
    expect(defaults).toMatch(/next_priority:[\s\S]*?execution_environment:\s*local/);
  });
});

describe('next-priority Step 4 cloud / local environments', () => {
  const step4 = () => section('## Step 4 — work environments', '## Step 5', cloud);

  it('skips local worktrees when cloud', () => {
    expect(step4()).toMatch(/Do \*\*not\*\* create local worktrees/);
  });

  it('resolves cloud_base_branch before spawn', () => {
    expect(step4()).toContain('cloud_base_branch');
  });

  it('refuses cloud fan-out when unsynced local changes matter (D7)', () => {
    expect(step4()).toMatch(/Unsynced local changes refuse \(D7\)/);
    expect(step4()).toMatch(/uncommitted or unpushed/);
  });
});

describe('next-priority Step 5 FG/BG + cloud spawn (FR-CA1, FR-CA4, FR-CA5)', () => {
  const step5 = () => section('## Step 5 — spawning workers', '## Step 8', cloud);

  it('requires background for parallel Tech Lead workers', () => {
    expect(step5()).toContain('run_in_background: true');
    expect(step5()).toMatch(/Parallel Tech Lead workers/);
  });

  it('requires foreground for advisory / gate agents', () => {
    expect(step5()).toMatch(/Advisory \/ gate agents/);
    expect(step5()).toMatch(/run_in_background: false/);
  });

  it('passes environment cloud and cloud_base_branch on Cursor', () => {
    expect(step5()).toContain('environment: "cloud"');
    expect(step5()).toContain('cloud_base_branch:');
  });

  it('falls back when host lacks environment parameter (FR-CA5)', () => {
    expect(cloud).toContain(
      'Cloud execution is not supported on this host — falling back to local worktrees.',
    );
  });

  it('forbids standing-pool inbox / A2A for cloud workers (FR-CA7)', () => {
    expect(cloud).toMatch(/never.*standing-pool filesystem inboxes|never.*A2A mailbox/is);
  });
});

describe('next-priority Step 8 cloud merge', () => {
  const step8 = () => section("## Step 8 — merging a cloud worker's branch", '\n# ', cloud + '\n# ');

  it('fetches worker branch instead of removing a worktree', () => {
    expect(step8()).toContain('git fetch origin');
    expect(step8()).toMatch(/no local worktree to remove/i);
  });
});

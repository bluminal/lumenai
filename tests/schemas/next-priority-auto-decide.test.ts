/**
 * Layer 1: Guards the `--auto-decide` autonomy directive on next-priority.md.
 *
 * `--auto-decide` lets the Tech Lead sub-agent resolve discretionary escalations
 * (a recommendation it already has) without calling AskUserQuestion, provided the
 * decision is recorded for later review. `[H]` acceptance-criteria approval is a
 * separate, unconditional gate and must never be affected by this flag — that
 * exclusion is the highest-risk regression this suite guards against.
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
const TECH_LEAD_PATH = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'agents',
  'tech-lead.md'
);
const content = readFileSync(COMMAND_PATH, 'utf8');
const techLeadContent = readFileSync(TECH_LEAD_PATH, 'utf8');

function section(startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return content.slice(start, end);
}

describe('next-priority --auto-decide parameter', () => {
  it('documents --auto-decide as an opt-in parameter defaulting to off', () => {
    const paramsSection = section('## Parameters', '## Core Responsibilities');
    const row = paramsSection
      .split('\n')
      .find((line) => line.includes('`--auto-decide`'));

    expect(row).toBeDefined();
    expect(row).toMatch(/\|\s*off\s*\|/);
    expect(row).toMatch(/\|\s*No\s*\|/);
  });
});

describe('next-priority --auto-decide delegation directive (Step 5)', () => {
  const step5 = () => section('### 5. Delegate to Tech Lead', '### 6. Monitor Progress');

  it('is conditional on --auto-decide, leaving the default path unchanged', () => {
    expect(step5()).toContain('only when `--auto-decide` is set');
  });

  it('instructs the Tech Lead to take its recommendation instead of asking, and to record it', () => {
    const directive = step5();
    expect(directive).toContain('take the recommended option yourself instead of calling `AskUserQuestion`');
    expect(directive).toMatch(/Decision Authority/);
    expect(directive).toMatch(/Behavioral Rule 7/);
    expect(directive).toContain('Record the decision, the alternatives considered, and your reasoning');
  });

  it('excludes [H] acceptance criteria from the autonomy directive', () => {
    expect(step5()).toContain('does **not** apply to `[H]` acceptance criteria');
  });

  it('requires the directive to propagate to sub-agents the Tech Lead delegates to', () => {
    expect(step5()).toContain('Propagate this directive to any sub-agent you delegate to');
  });
});

describe('next-priority [H] gate is unconditional (Step 7)', () => {
  it('states the [H] AskUserQuestion gate applies regardless of --auto-decide', () => {
    const step7 = section('### 7. Validate Completion', '### 8. Merge Results');
    expect(step7).toContain('This gate is unconditional');
    expect(step7).toContain('`[H]` criteria are never auto-approved');
    expect(step7).toContain('always ask via `AskUserQuestion`');
  });
});

describe('next-priority autonomous decision record (Step 9)', () => {
  it('requires recording the decision, alternatives, and reasoning for auto-decided choices', () => {
    const step9 = section('### 9. Update the Plan', '## Native Looping');
    expect(step9).toContain('Autonomous decision record (when `--auto-decide` was set)');
    expect(step9).toContain('the decision taken, the alternatives considered, and the reasoning');
  });
});

describe('--auto-decide scope guard (D3/D9)', () => {
  it('is implemented purely as next-priority.md delegation text, never in tech-lead.md', () => {
    expect(techLeadContent).not.toContain('--auto-decide');
    expect(techLeadContent).not.toContain('ultracode');
  });
});

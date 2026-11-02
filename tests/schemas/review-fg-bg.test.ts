/**
 * Layer 1: Review / orchestrator foreground spawn contracts (FR-CA1 / T5).
 *
 * Parallel reviewers must stay foreground so consolidation waits for verdicts.
 * next-priority Tech Leads are the background case — covered separately in
 * next-priority-cloud.test.ts.
 *
 * Plan: docs/plans/cursor-cloud-agent-support.md T5
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const orchestrator = readFileSync(
  join(ROOT, 'plugins', 'synthex', 'agents', 'multi-model-review-orchestrator.md'),
  'utf8',
);
const ladder = readFileSync(
  join(ROOT, 'plugins', 'synthex', 'docs', 'standing-pool-routing.md'),
  'utf8',
);
const reviewCode = readFileSync(
  join(ROOT, 'plugins', 'synthex', 'commands', 'review-code.md'),
  'utf8',
);

describe('review-code.md defers FG/BG to the capability ladder (size-gated)', () => {
  it('still routes level 3-4 through standing-pool-routing.md where FR-CA1/T5 lives', () => {
    expect(reviewCode).toContain('docs/standing-pool-routing.md');
    expect(reviewCode).toMatch(/FR-HM21 levels 3-4/);
  });
});

describe('multi-model-review-orchestrator.md Step 3 foreground batch (T5)', () => {
  it('requires foreground Task calls in the single parallel batch', () => {
    expect(orchestrator).toMatch(/Foreground \(FR-CA1 \/ T5\)/);
    expect(orchestrator).toMatch(/run_in_background:\s*false/);
    expect(orchestrator).toContain('next-priority');
  });
});

describe('standing-pool-routing.md level 3 stays host-name free for Cursor', () => {
  it('does not hard-code the Cursor product name in the FG/BG clause', () => {
    const level3Start = ladder.indexOf('**Parallel subagent fan-out.**');
    const level4Start = ladder.indexOf('**Sequential reviewers.**', level3Start);
    expect(level3Start).toBeGreaterThanOrEqual(0);
    const level3 = ladder.slice(level3Start, level4Start);
    expect(level3).not.toMatch(/\bCursor\b/);
    expect(level3).toMatch(/run_in_background:\s*false/);
  });
});

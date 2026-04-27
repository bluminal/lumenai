import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ARCH_PATH = join(__dirname, '..', '..', 'docs', 'specs', 'multi-model-review', 'architecture.md');

describe('Task 3: architecture.md skeleton', () => {
  let content: string;
  beforeAll(() => {
    content = readFileSync(ARCH_PATH, 'utf8');
  });

  it('file exists', () => {
    expect(existsSync(ARCH_PATH)).toBe(true);
  });

  it('contains "## Status: Skeleton" header (Task 49 will replace with Final)', () => {
    expect(content).toMatch(/## Status: Skeleton/);
  });

  describe('All 6 architecture concerns covered', () => {
    it.each([
      'Proposer-plus-Aggregator',
      'Native vs. External',
      'Parallel Fan-Out',
      'Context Bundle',
      'Audit Artifact',
      'Forthcoming Docs',
    ])('section: %s', (heading) => {
      expect(content).toContain(heading);
    });
  });

  describe('Cross-references to FR-MR numbers (accuracy spot-check)', () => {
    it.each([
      'FR-MR11', // orchestrator Sonnet
      'FR-MR12', // single-batch parallel fan-out
      'FR-MR13', // canonical finding (referenced by section 1)
      'FR-MR14', // dedup
      'FR-MR14a', // severity reconciliation
      'FR-MR14b', // minority-of-one
      'FR-MR15', // aggregator tier table
      'FR-MR16', // error_code enum
      'FR-MR17', // native-only continuation
      'FR-MR21a', // complexity gate (review-code)
      'FR-MR22', // no gate for write-implementation-plan
      'FR-MR24', // audit artifact
      'FR-MR28', // context bundle
      'NFR-MR4', // usage object
      'NFR-MR5', // extensibility
      'D17', // tier table
      'D18', // Stage 4 bounding
      'D20', // command-agnostic audit
    ])('references %s', (frRef) => {
      expect(content).toContain(frRef);
    });
  });

  it('forwards reference to Task 49 (Phase 6) for final pass', () => {
    expect(content).toContain('Task 49');
  });

  it('is non-trivial length (skeleton must have substance per [H] criterion)', () => {
    expect(content.length).toBeGreaterThan(2000);
  });
});

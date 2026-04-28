/**
 * Task 0: Baseline snapshots for FR-MMT regression (multi-model-teams).
 *
 * Verifies that the golden-snapshot fixtures for /team-review,
 * /synthex:review-code routing, and /synthex:performance-audit routing
 * exist in the expected location, load correctly, and contain the correct
 * `<<finding-body>>` redaction placeholders with no real finding text leaks.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SNAPSHOT_DIR = join(
  import.meta.dirname,
  '..',
  '__snapshots__',
  'multi-model-teams',
  'baseline',
);

const PARENT_SNAPSHOT_DIR = join(
  import.meta.dirname,
  '..',
  '__snapshots__',
  'multi-model-review',
  'baseline',
);

// ---------------------------------------------------------------------------
// File existence
// ---------------------------------------------------------------------------

describe('Task 0: Baseline snapshot files exist (FR-MMT regression base)', () => {
  it('team-review-baseline.snapshot.md exists', () => {
    expect(
      existsSync(join(SNAPSHOT_DIR, 'team-review-baseline.snapshot.md')),
    ).toBe(true);
  });

  it('review-code-routing-baseline.snapshot.md exists', () => {
    expect(
      existsSync(
        join(SNAPSHOT_DIR, 'review-code-routing-baseline.snapshot.md'),
      ),
    ).toBe(true);
  });

  it('performance-audit-routing-baseline.snapshot.md exists', () => {
    expect(
      existsSync(
        join(SNAPSHOT_DIR, 'performance-audit-routing-baseline.snapshot.md'),
      ),
    ).toBe(true);
  });

  it('redaction-strategy.md exists', () => {
    expect(existsSync(join(SNAPSHOT_DIR, 'redaction-strategy.md'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Redaction placeholders present
// ---------------------------------------------------------------------------

describe('Redaction: <<finding-body>> placeholder present in each baseline', () => {
  it('team-review baseline contains <<finding-body>>', () => {
    const content = readFileSync(
      join(SNAPSHOT_DIR, 'team-review-baseline.snapshot.md'),
      'utf8',
    );
    expect(content).toContain('<<finding-body>>');
  });

  it('review-code routing baseline contains <<finding-body>>', () => {
    const content = readFileSync(
      join(SNAPSHOT_DIR, 'review-code-routing-baseline.snapshot.md'),
      'utf8',
    );
    expect(content).toContain('<<finding-body>>');
  });

  it('performance-audit routing baseline contains <<finding-body>>', () => {
    const content = readFileSync(
      join(SNAPSHOT_DIR, 'performance-audit-routing-baseline.snapshot.md'),
      'utf8',
    );
    expect(content).toContain('<<finding-body>>');
  });
});

// ---------------------------------------------------------------------------
// No real finding text leaks (negative scan)
// ---------------------------------------------------------------------------

describe('Redaction: no real finding text leaks in any baseline', () => {
  const files = [
    'team-review-baseline.snapshot.md',
    'review-code-routing-baseline.snapshot.md',
    'performance-audit-routing-baseline.snapshot.md',
  ];

  for (const file of files) {
    it(`${file} — no "vulnerability found in" text leak`, () => {
      const content = readFileSync(join(SNAPSHOT_DIR, file), 'utf8');
      expect(content).not.toMatch(/vulnerability found in/i);
    });
  }
});

// ---------------------------------------------------------------------------
// Redaction strategy document assertions
// ---------------------------------------------------------------------------

describe('redaction-strategy.md content assertions', () => {
  const strategyPath = join(SNAPSHOT_DIR, 'redaction-strategy.md');

  it('strategy doc contains <<finding-body>>', () => {
    const content = readFileSync(strategyPath, 'utf8');
    expect(content).toContain('<<finding-body>>');
  });

  it('strategy doc references Task 38 (byte-identical routing fixture)', () => {
    const content = readFileSync(strategyPath, 'utf8');
    expect(content).toMatch(/Task 38/);
  });

  it('strategy doc references Task 56 (performance-audit routing)', () => {
    const content = readFileSync(strategyPath, 'utf8');
    expect(content).toMatch(/Task 56/);
  });

  it('strategy doc references Task 57 (review-code routing)', () => {
    const content = readFileSync(strategyPath, 'utf8');
    expect(content).toMatch(/Task 57/);
  });

  it('strategy doc cites the parent redaction-strategy as source', () => {
    const content = readFileSync(strategyPath, 'utf8');
    expect(content).toMatch(/multi-model-review.*baseline.*redaction-strategy/s);
  });
});

// ---------------------------------------------------------------------------
// team-review baseline: FR-MMT3 criterion 8 (no orchestrator invocation)
// ---------------------------------------------------------------------------

describe('team-review baseline: FR-MMT3 criterion 8 — no orchestrator invocation', () => {
  it('baseline records zero multi-model-review-orchestrator Task invocations', () => {
    const content = readFileSync(
      join(SNAPSHOT_DIR, 'team-review-baseline.snapshot.md'),
      'utf8',
    );
    // The trace section must exist and must state "none"
    expect(content).toContain(
      'multi-model-review-orchestrator invocations',
    );
    expect(content).toContain('(none');
  });
});

// ---------------------------------------------------------------------------
// review-code routing baseline: references parent baseline
// ---------------------------------------------------------------------------

describe('review-code routing baseline: references parent snapshot', () => {
  it('routing baseline references the parent review-code-baseline.snapshot.md', () => {
    const content = readFileSync(
      join(SNAPSHOT_DIR, 'review-code-routing-baseline.snapshot.md'),
      'utf8',
    );
    expect(content).toContain('review-code-baseline.snapshot.md');
  });

  it('parent review-code-baseline.snapshot.md still exists (consistency check)', () => {
    expect(
      existsSync(
        join(PARENT_SNAPSHOT_DIR, 'review-code-baseline.snapshot.md'),
      ),
    ).toBe(true);
  });

  it('routing baseline documents byte-identical assertion', () => {
    const content = readFileSync(
      join(SNAPSHOT_DIR, 'review-code-routing-baseline.snapshot.md'),
      'utf8',
    );
    expect(content).toMatch(/byte-identical/i);
  });
});

// ---------------------------------------------------------------------------
// performance-audit routing baseline: static reviewer set documented
// ---------------------------------------------------------------------------

describe('performance-audit routing baseline: static reviewer set', () => {
  it('baseline documents performance-engineer as the static required reviewer', () => {
    const content = readFileSync(
      join(SNAPSHOT_DIR, 'performance-audit-routing-baseline.snapshot.md'),
      'utf8',
    );
    expect(content).toContain('performance-engineer');
  });

  it('baseline documents byte-identical assertion', () => {
    const content = readFileSync(
      join(SNAPSHOT_DIR, 'performance-audit-routing-baseline.snapshot.md'),
      'utf8',
    );
    expect(content).toMatch(/byte-identical/i);
  });
});

/**
 * Task 3: Structural validation tests for docs/specs/multi-model-teams/architecture.md
 *
 * Validates:
 * 1. File exists and contains "## Status: Skeleton"
 * 2. All 6 required sections are present (Overview, Feature A, Feature B,
 *    Audit Extensions, v1 Scope, Forthcoming Docs)
 * 3. ASCII fan-out diagram present in Section 2
 * 4. Cross-references to routing.md, recovery.md, pool-lifecycle.md, parent architecture.md
 * 5. FR-MMT cross-references: FR-MMT1, FR-MMT3, FR-MMT4, FR-MMT5b, FR-MMT15,
 *    FR-MMT16, FR-MMT24, FR-MMT30, FR-MMT30a
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ARCH_PATH = join(
  import.meta.dirname,
  '..', '..', 'docs', 'specs', 'multi-model-teams', 'architecture.md'
);

describe('Task 3: docs/specs/multi-model-teams/architecture.md skeleton', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(ARCH_PATH, 'utf-8');
  });

  // ── 1. File existence and skeleton marker ─────────────────────────────────

  it('[T] file exists', () => {
    expect(existsSync(ARCH_PATH)).toBe(true);
  });

  it('[T] contains "## Status: Skeleton" marker (Task 65 will replace with Final)', () => {
    expect(content).toContain('## Status: Skeleton');
  });

  // ── 2. All 6 architecture concerns have at least one paragraph or diagram ──

  describe('[H] 6 required sections present', () => {
    it.each([
      ['1. Overview',                 '## 1. Overview'],
      ['2. Feature A',                '## 2. Feature A'],
      ['3. Feature B',                '## 3. Feature B'],
      ['4. Audit Artifact Extensions','## 4. Audit Artifact Extensions'],
      ['5. v1 Scope',                 '## 5. v1 Scope'],
      ['6. Forthcoming Docs',         '## 6. Forthcoming Docs'],
    ])('section %s is present', (_label, heading) => {
      expect(content).toContain(heading);
    });
  });

  // ── 3. ASCII diagram present in Section 2 ─────────────────────────────────

  it('[H] Section 2 contains ASCII fan-out diagram (┌ box-drawing character)', () => {
    // The Section 2 block must contain box-drawing ASCII: ┌
    const section2Start = content.indexOf('## 2. Feature A');
    const section3Start = content.indexOf('## 3. Feature B');
    expect(section2Start).toBeGreaterThan(-1);
    expect(section3Start).toBeGreaterThan(section2Start);
    const section2Body = content.slice(section2Start, section3Start);
    // Box-drawing char '┌' is the canonical marker for the fan-out diagram
    expect(section2Body).toContain('┌');
  });

  // ── 4. Cross-references to sibling and parent docs ────────────────────────

  describe('[H] cross-references to related documentation', () => {
    it.each([
      ['routing.md',            'routing.md'],
      ['recovery.md',           'recovery.md'],
      ['pool-lifecycle.md',     'pool-lifecycle.md'],
      ['parent architecture.md','multi-model-review/architecture.md'],
    ])('references %s', (_label, fragment) => {
      expect(content).toContain(fragment);
    });
  });

  // ── 5. FR-MMT cross-references ────────────────────────────────────────────

  describe('[T] FR-MMT cross-references accurate', () => {
    it.each([
      'FR-MMT1',   // Feature A — team-review multi-model integration
      'FR-MMT3',   // Feature A — multi-model enabled flag
      'FR-MMT4',   // bridge marshal contract (D22)
      'FR-MMT5b',  // idle identity drift mitigation (unconditional re-read)
      'FR-MMT15',  // inline pool discovery
      'FR-MMT16',  // task submission mechanism
      'FR-MMT24',  // per-task fallback recovery
      'FR-MMT30',  // pool_routing audit block
      'FR-MMT30a', // finding_attribution_telemetry block
    ])('references %s', (frRef) => {
      expect(content).toContain(frRef);
    });
  });

  // ── Non-trivial substance check ───────────────────────────────────────────

  it('[H] document has substantial content (>2000 characters)', () => {
    expect(content.length).toBeGreaterThan(2000);
  });
});

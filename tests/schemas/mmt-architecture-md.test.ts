/**
 * Task 65: Structural validation tests for docs/specs/multi-model-teams/architecture.md
 *
 * Updated from Task 3 skeleton checks to Task 65 final-pass requirements:
 * 1. File exists and contains "## Status: Final" (skeleton replaced by Task 65)
 * 2. All required sections present: Overview, Option B rationale, Feature A bridge,
 *    Feature B (pool lifecycle), Identity Drift Mitigation, Audit Extensions,
 *    Inherited Architecture, v1 Scope, Forthcoming Docs
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

  it('[T] contains "## Status: Final" marker (Task 65 replaced Skeleton with Final)', () => {
    expect(content).toContain('## Status: Final');
  });

  // ── 2. All 6 architecture concerns have at least one paragraph or diagram ──

  describe('[H] required sections present', () => {
    it.each([
      ['1. Overview',                      '## 1. Overview'],
      ['2. Option B rationale',            '## 2. Option B'],
      ['3. Feature A Bridge',              '## 3. Feature A Bridge'],
      ['4. Feature B: Standing Pools',     '## 4. Feature B'],
      ['5. Identity Drift Mitigation',     '## 5. Identity Drift Mitigation'],
      ['6. Audit Artifact Extensions',     '## 6. Audit Artifact Extensions'],
      ['7. Deferred Stage 3',              '## 7. Deferred Stage 3'],
      ['8. Inherited Architecture',        '## 8. Inherited Architecture'],
      ['9. v1 Scope',                      '## 9. v1 Scope'],
      ['10. Forthcoming Docs',             '## 10. Forthcoming Docs'],
    ])('section %s is present', (_label, heading) => {
      expect(content).toContain(heading);
    });
  });

  // ── 3. ASCII diagram present in Section 2 ─────────────────────────────────

  it('[H] Section 2 contains ASCII fan-out diagram (┌ box-drawing character)', () => {
    // The Section 2 block must contain box-drawing ASCII: ┌
    const section2Start = content.indexOf('## 2. Option B');
    const section3Start = content.indexOf('## 3. Feature A Bridge');
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

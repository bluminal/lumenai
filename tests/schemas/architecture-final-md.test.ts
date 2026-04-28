import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ARCH_PATH = join(__dirname, '..', '..', 'docs', 'specs', 'multi-model-review', 'architecture.md');

describe('Task 49: architecture.md final pass', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(ARCH_PATH, 'utf8');
  });

  it('file exists', () => {
    expect(existsSync(ARCH_PATH)).toBe(true);
  });

  it('"## Status: Skeleton" is NOT present (replaced by Final)', () => {
    expect(content).not.toContain('## Status: Skeleton');
  });

  it('"## Status: Final" IS present', () => {
    expect(content).toContain('## Status: Final');
  });

  describe('All 11 sections present', () => {
    it.each([
      '## 1. Overview',
      '## 2. Proposer-plus-Aggregator Architecture',
      '## 3. Native vs. External Proposers',
      '## 4. Parallel Fan-Out',
      '## 5. Aggregator Resolution',
      '## 6. Context Bundle',
      '## 7. Consolidation Pipeline',
      '## 8. Failure Handling',
      '## 9. Audit Artifact',
      '## 10. v1 vs. v2 Scope',
      '## 11. Cross-References to Forthcoming Documentation',
    ])('section heading: %s', (heading) => {
      expect(content).toContain(heading);
    });
  });

  describe('FR-MR cross-references', () => {
    it.each([
      'FR-MR9',
      'FR-MR11',
      'FR-MR12',
      'FR-MR13',
      'FR-MR14',
      'FR-MR14a',
      'FR-MR14b',
      'FR-MR15',
      'FR-MR16',
      'FR-MR17',
      'FR-MR20',
      'FR-MR23',
      'FR-MR24',
      'FR-MR28',
    ])('contains %s', (frRef) => {
      expect(content).toContain(frRef);
    });
  });

  describe('NFR-MR cross-references', () => {
    it.each(['NFR-MR2', 'NFR-MR4'])('contains %s', (nfrRef) => {
      expect(content).toContain(nfrRef);
    });
  });

  describe('D-rows referenced', () => {
    it.each(['D5', 'D6', 'D17', 'D18', 'D20', 'D21'])('contains %s', (dRow) => {
      expect(content).toContain(dRow);
    });
  });

  describe('v1 vs v2 explicit scope table', () => {
    it('contains "v1" scope content', () => {
      expect(content).toContain('v1');
    });

    it('contains "v2" scope content', () => {
      expect(content).toContain('v2');
    });

    it('contains "Phase 7" reference for v2 deferred work', () => {
      expect(content).toContain('Phase 7');
    });
  });

  it('Stage 3 deferred to Phase 7 is documented', () => {
    expect(content).toContain('Stage 3');
    expect(content).toContain('Phase 7');
    // Verify the deferred relationship is stated
    expect(content.toLowerCase()).toMatch(/stage 3.{0,200}phase 7|phase 7.{0,200}stage 3/s);
  });

  it('document length > 5000 chars (substantive)', () => {
    expect(content.length).toBeGreaterThan(5000);
  });

  it('ASCII fan-out diagram present (box-drawing characters or Native/External flow)', () => {
    const hasBoxDrawing = /[┌├└┐┘─│▼]/.test(content);
    const hasAsciiBoxWithNativeExternal =
      /\+[-+]+\+/.test(content) &&
      (content.includes('Native') || content.includes('External') || content.includes('native'));
    const hasBracketFlow =
      /\[native/.test(content) && /\[codex\]|\[gemini\]/.test(content);
    expect(hasBoxDrawing || hasAsciiBoxWithNativeExternal || hasBracketFlow).toBe(true);
  });
});

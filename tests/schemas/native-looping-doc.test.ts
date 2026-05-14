/**
 * Layer 1: Structural tests for plugins/synthex/docs/native-looping.md —
 * the canonical iteration-framework spec.
 *
 * Task 32 acceptance criteria:
 *   - file exists and renders as valid markdown
 *   - contains all 8 cross-reference anchor IDs (state, loop-id, shared-iter,
 *     subagent-iter, compaction-safety, promise-emission, markers, precedence)
 *   - Archive section present (Task 12 spec)
 *
 * Plan: docs/plans/native-looping.md Tasks 1, 12, 32.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOC_PATH = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'docs',
  'native-looping.md'
);

const EIGHT_ANCHORS = [
  'state',
  'loop-id',
  'shared-iter',
  'subagent-iter',
  'compaction-safety',
  'promise-emission',
  'markers',
  'precedence',
];

describe('native-looping.md framework spec — Task 32 structural validation', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(DOC_PATH, 'utf-8');
  });

  describe('Document structure', () => {
    it('opens with the framework title', () => {
      expect(content).toMatch(/^# Native Synthex Looping — Framework Specification/m);
    });

    it('lists the eight cross-reference anchors in the table', () => {
      // The "Eight cross-reference anchors" section is the canonical anchor table.
      expect(content).toMatch(/## Eight cross-reference anchors/);
      for (const anchor of EIGHT_ANCHORS) {
        expect(content).toContain(`\`${anchor}\``);
      }
    });
  });

  describe('Anchor IDs (HTML <a id> spans)', () => {
    it.each(EIGHT_ANCHORS)('anchor "%s" exists as <a id="%s">', (anchor) => {
      expect(content).toContain(`<a id="${anchor}">`);
    });
  });

  describe('Per-anchor section headings', () => {
    it('state file section heading present', () => {
      expect(content).toMatch(/##\s*<a id="state"><\/a>\s*State file schema/);
    });

    it('loop-id rules section heading present', () => {
      expect(content).toMatch(/##\s*<a id="loop-id"><\/a>\s*Loop-id assignment rules/);
    });

    it('shared-context iteration section heading present', () => {
      expect(content).toMatch(/##\s*<a id="shared-iter"><\/a>\s*Shared-context iteration mechanics/);
    });

    it('subagent iteration section heading present', () => {
      expect(content).toMatch(/##\s*<a id="subagent-iter"><\/a>\s*Fresh-subagent iteration mechanics/);
    });

    it('compaction-safety section heading present', () => {
      expect(content).toMatch(/##\s*<a id="compaction-safety"><\/a>\s*Auto-compaction guarantees/);
    });

    it('promise-emission section heading present', () => {
      expect(content).toMatch(/##\s*<a id="promise-emission"><\/a>\s*Completion-promise convention/);
    });

    it('markers section heading present', () => {
      expect(content).toMatch(/##\s*<a id="markers"><\/a>\s*Iteration markers/);
    });

    it('precedence section heading present', () => {
      expect(content).toMatch(/##\s*<a id="precedence"><\/a>\s*Precedence with the official Ralph Loop plugin/);
    });
  });

  describe('Archive section (Task 12)', () => {
    it('contains an Archive subsection under state', () => {
      expect(content).toMatch(/### Archive/);
    });

    it('documents the scan algorithm', () => {
      expect(content).toMatch(/Scan algorithm/);
    });

    it('documents the retention policy + Q-NL1 reference', () => {
      expect(content).toMatch(/Q-NL1/);
      expect(content).toMatch(/Retention/);
    });

    it('documents which commands run the archive scan', () => {
      expect(content).toMatch(/Which commands run the archive scan/);
    });
  });

  describe('FR / D references', () => {
    it('references at least some FR-NL identifiers in cross-references', () => {
      // The framework doc references FR-NL identifiers in passing (e.g., FR-NL11 in
      // the loop-id rationale, FR-NL44 in the precedence section). Assert the doc
      // contains AT LEAST 3 FR-NL references — exact count varies as the doc evolves.
      const matches = content.match(/FR-NL\d+/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(3);
    });

    it('references at least some D-NL decision identifiers', () => {
      const matches = content.match(/D-NL\d+/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(3);
    });
  });
});

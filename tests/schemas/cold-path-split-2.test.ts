/**
 * Layer 1: Structural validation for Task 14 (FR-HM5, D17, NFR-HM1) of
 * docs/plans/harness-modernization.md — applying the Task 13 cold-path-split
 * pattern to two more commands:
 *
 *   plugins/synthex/commands/performance-audit.md
 *     - Step 1b (Standing Pool Discovery and Routing) → docs/standing-pool-routing-performance-audit.md
 *       (a SEPARATE doc from review-code's docs/standing-pool-routing.md: the
 *       two bodies are materially different — static single-element
 *       required-reviewer-set vs review-code's dynamic flag/config-resolved
 *       set, one pool task vs one-per-reviewer, differing Skip-Steps counts —
 *       not just "review" vs "audit" word substitution)
 *     - Step 1c (Sandbox-Yolo Spawn Confirmation) → docs/sandbox-yolo.md
 *       (the SAME doc review-code reads: the two Step 1c bodies were
 *       verbatim-identical except for command-specific words, so Task 14
 *       kept both variants, verbatim, in one shared file under
 *       "## review-code variant" / "## performance-audit variant" headings)
 *
 *   plugins/synthex/commands/write-implementation-plan.md
 *     - the FR-MR6 "### Invocation Flags" block, and
 *     - the Step 6a "Multi-model active → invoke orchestrator" contract
 *       both move to docs/plan-multi-model.md, replaced by a single
 *       3-part gate (flags resolution + Read gate + other-hosts line) at
 *       the Step 6a call site. The native-only reviewer path (pinned by
 *       review-loops.ts) is untouched.
 *
 * This suite validates:
 *   [T] (NFR-HM1) Moved blocks are byte-identical to a pre-move copy —
 *       fixtures under tests/fixtures/cold-path/, captured from the
 *       pre-Task-14 command files, must each appear as an exact,
 *       unmodified substring of the doc file it moved to.
 *   [T] performance-audit.md is ≤ 8,704 bytes (8.5 KB).
 *   [T] write-implementation-plan.md is ≤ 26,112 bytes (25.5 KB).
 *   [T] both command files contain the D17 gates that replaced the moved
 *       blocks (same rules cold-path-includes.test.ts enforces).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(ROOT, 'plugins', 'synthex');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');
const DOCS_DIR = join(PLUGIN_ROOT, 'docs');
const FIXTURES_DIR = join(ROOT, 'tests', 'fixtures', 'cold-path');

const PERF_AUDIT_MD_PATH = join(COMMANDS_DIR, 'performance-audit.md');
const WIP_MD_PATH = join(COMMANDS_DIR, 'write-implementation-plan.md');

const perfAuditContent = readFileSync(PERF_AUDIT_MD_PATH, 'utf-8');
const wipContent = readFileSync(WIP_MD_PATH, 'utf-8');

// ── [T] (NFR-HM1) byte-identical moved blocks ────────────────────────────

interface MoveSpec {
  /** Fixture captured from the pre-move command file at the block boundary. */
  fixture: string;
  /** Doc file the block moved to. */
  doc: string;
}

const MOVES: MoveSpec[] = [
  {
    fixture: 'standing-pool-routing-performance-audit.fixture.md',
    doc: 'standing-pool-routing-performance-audit.md',
  },
  {
    fixture: 'sandbox-yolo-performance-audit.fixture.md',
    doc: 'sandbox-yolo.md',
  },
  {
    fixture: 'write-implementation-plan-invocation-flags.fixture.md',
    doc: 'plan-multi-model.md',
  },
  {
    fixture: 'write-implementation-plan-orchestrator-contract.fixture.md',
    doc: 'plan-multi-model.md',
  },
];

describe('Task 14: performance-audit.md + write-implementation-plan.md cold-path split (FR-HM5, D17, NFR-HM1)', () => {
  describe('[T] (NFR-HM1) moved blocks are byte-identical to the pre-move fixture', () => {
    for (const { fixture, doc } of MOVES) {
      it(`${doc} contains ${fixture} verbatim`, () => {
        const fixtureContent = readFileSync(join(FIXTURES_DIR, fixture), 'utf-8');
        const docContent = readFileSync(join(DOCS_DIR, doc), 'utf-8');
        expect(fixtureContent.length).toBeGreaterThan(0);
        expect(docContent).toContain(fixtureContent);
      });
    }

    it('doc files are never registered as commands/agents in plugin.json (D17 rule 4)', () => {
      const manifest = JSON.parse(
        readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf-8'),
      );
      const registered = new Set<string>([
        ...(manifest.commands ?? []),
        ...(manifest.agents ?? []),
      ]);
      for (const { doc } of MOVES) {
        expect(registered.has(`docs/${doc}`)).toBe(false);
        expect(registered.has(`./docs/${doc}`)).toBe(false);
      }
    });
  });

  // ── [T] performance-audit.md contains its two D17 gates ─────────────────

  describe('[T] performance-audit.md contains the two D17 gates that replaced the moved blocks', () => {
    const gates = [
      '${CLAUDE_PLUGIN_ROOT}/docs/standing-pool-routing-performance-audit.md',
      '${CLAUDE_PLUGIN_ROOT}/docs/sandbox-yolo.md',
    ];

    for (const gate of gates) {
      it(`references ${gate}`, () => {
        expect(perfAuditContent).toContain(gate);
      });
    }

    it('each gate is paired with the FR-HM13 other-hosts fallback sentence', () => {
      for (const gate of gates) {
        const idx = perfAuditContent.indexOf(gate);
        expect(idx).toBeGreaterThan(-1);
        const window = perfAuditContent.slice(idx, idx + 400);
        expect(window).toMatch(/other hosts/i);
        expect(window).toMatch(/plugin root/i);
      }
    });

    it('the TTY-guard sentence for sandbox-yolo confirmation stays inline (pinned by sandbox-yolo-tty-guard.test.ts)', () => {
      expect(perfAuditContent).toContain('When stdin is not a TTY');
    });
  });

  // ── [T] write-implementation-plan.md contains its D17 gate ──────────────

  describe('[T] write-implementation-plan.md contains the D17 gate that replaced the moved blocks', () => {
    const gate = '${CLAUDE_PLUGIN_ROOT}/docs/plan-multi-model.md';

    it(`references ${gate}`, () => {
      expect(wipContent).toContain(gate);
    });

    it('the gate is paired with the FR-HM13 other-hosts fallback sentence', () => {
      const idx = wipContent.indexOf(gate);
      expect(idx).toBeGreaterThan(-1);
      const window = wipContent.slice(idx, idx + 400);
      expect(window).toMatch(/other hosts/i);
      expect(window).toMatch(/plugin root/i);
    });

    it('the native-only path prose (pinned by review-loops.ts) is untouched', () => {
      expect(wipContent).toContain('Native-only active → spawn native reviewers directly');
      expect(wipContent).toContain('Context Management');
      expect(wipContent).toContain('multi_model_review.enabled: false');
    });
  });

  // ── [T] size budgets ──────────────────────────────────────────────────

  describe('[T] size budgets', () => {
    it('performance-audit.md is at or under 8,704 bytes (8.5 KB)', () => {
      const bytes = Buffer.byteLength(perfAuditContent, 'utf-8');
      expect(bytes).toBeLessThanOrEqual(8_704);
    });

    it('write-implementation-plan.md is at or under 26,112 bytes (25.5 KB)', () => {
      const bytes = Buffer.byteLength(wipContent, 'utf-8');
      expect(bytes).toBeLessThanOrEqual(26_112);
    });
  });
});

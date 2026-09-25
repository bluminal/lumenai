/**
 * Layer 1: Structural validation for Task 13 (FR-HM5, D17) of
 * docs/plans/harness-modernization.md — splitting the cold paths out of
 * plugins/synthex/commands/review-code.md into plugins/synthex/docs/.
 *
 * Moves (byte-identical, verbatim):
 *   - Step 1b (Standing Pool Discovery and Routing)  → docs/standing-pool-routing.md
 *   - Step 1c (Sandbox-Yolo Spawn Confirmation)       → docs/sandbox-yolo.md
 *   - FR-MR21 Steps 4-8 + the Complexity Gate         → docs/multi-model-decision.md
 *
 * This suite validates:
 *   [T] (NFR-HM1) Moved blocks are byte-identical to a pre-move copy —
 *       fixtures under tests/fixtures/cold-path/, captured from
 *       `git show HEAD:plugins/synthex/commands/review-code.md` at the
 *       block boundaries BEFORE Task 13's edit, must each appear as an
 *       exact, unmodified substring of the doc file it moved to.
 *   [T] review-code.md contains the three D17 gates that replaced the
 *       moved blocks (same rules cold-path-includes.test.ts enforces).
 *   [T] review-code.md is ≤ 15 KB (15,360 bytes).
 *   [T] the promptfoo "pool-gate-enabled" case (MMT-GATE-B1) exists in
 *       tests/promptfoo.config.yaml and points at its fixture project
 *       under tests/fixtures/multi-model-teams/pool-gate-enabled/.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'js-yaml';

const ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(ROOT, 'plugins', 'synthex');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');
const DOCS_DIR = join(PLUGIN_ROOT, 'docs');
const FIXTURES_DIR = join(ROOT, 'tests', 'fixtures', 'cold-path');

const REVIEW_CODE_MD_PATH = join(COMMANDS_DIR, 'review-code.md');
const reviewCodeContent = readFileSync(REVIEW_CODE_MD_PATH, 'utf-8');

// ── [T] (NFR-HM1) byte-identical moved blocks ────────────────────────────

interface MoveSpec {
  /** Fixture captured from the pre-move review-code.md at the block boundary. */
  fixture: string;
  /** Doc file the block moved to. */
  doc: string;
}

const MOVES: MoveSpec[] = [
  {
    fixture: 'standing-pool-routing.fixture.md',
    doc: 'standing-pool-routing.md',
  },
  {
    fixture: 'sandbox-yolo.fixture.md',
    doc: 'sandbox-yolo.md',
  },
  {
    fixture: 'multi-model-decision-steps4-8.fixture.md',
    doc: 'multi-model-decision.md',
  },
  {
    fixture: 'multi-model-decision-complexity-gate.fixture.md',
    doc: 'multi-model-decision.md',
  },
];

describe('Task 13: review-code.md cold-path split (FR-HM5, D17, NFR-HM1)', () => {
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

  // ── [T] review-code.md contains the three D17 gates ────────────────────

  describe('[T] review-code.md contains the three D17 gates that replaced the moved blocks', () => {
    const gates = [
      '${CLAUDE_PLUGIN_ROOT}/docs/standing-pool-routing.md',
      '${CLAUDE_PLUGIN_ROOT}/docs/sandbox-yolo.md',
      '${CLAUDE_PLUGIN_ROOT}/docs/multi-model-decision.md',
    ];

    for (const gate of gates) {
      it(`references ${gate}`, () => {
        expect(reviewCodeContent).toContain(gate);
      });
    }

    it('each gate target file exists under plugins/synthex/docs/', () => {
      for (const gate of gates) {
        const relPath = gate.replace('${CLAUDE_PLUGIN_ROOT}/', '');
        expect(existsSync(join(PLUGIN_ROOT, relPath))).toBe(true);
      }
    });

    it('each gate is paired with the FR-HM13 other-hosts fallback sentence', () => {
      // Loose structural check mirroring cold-path-includes.test.ts's rule:
      // "other hosts" and "plugin root" both appear near each gate target.
      for (const gate of gates) {
        const idx = reviewCodeContent.indexOf(gate);
        expect(idx).toBeGreaterThan(-1);
        const window = reviewCodeContent.slice(idx, idx + 400);
        expect(window).toMatch(/other hosts/i);
        expect(window).toMatch(/plugin root/i);
      }
    });
  });

  // ── [T] review-code.md ≤ 15 KB (15,360 bytes) ──────────────────────────

  describe('[T] review-code.md size budget', () => {
    it('is at or under 15,360 bytes (15 KB)', () => {
      const bytes = Buffer.byteLength(reviewCodeContent, 'utf-8');
      expect(bytes).toBeLessThanOrEqual(15_360);
    });
  });

  // ── D21 spec, Invocation Flags, and Steps 1-3 stay in review-code.md ────

  describe('content that stays in review-code.md (not moved)', () => {
    it('D21 Path-and-Reason Header Spec stays', () => {
      expect(reviewCodeContent).toContain('Path-and-Reason Header Spec (D21)');
    });

    it('Invocation Flags (FR-MR6) stays', () => {
      expect(reviewCodeContent).toContain('Invocation Flags (FR-MR6)');
    });

    it('the compact Steps 1-3 gate stays', () => {
      expect(reviewCodeContent).toContain('Steps 1-3');
    });

    it('.synthex-plus/config.yaml references are unchanged (Task 48 moves them later)', () => {
      // Task 13 does not touch these; the docs file (where the Step 1b
      // body now lives) must still reference the same config path.
      const routingDoc = readFileSync(join(DOCS_DIR, 'standing-pool-routing.md'), 'utf-8');
      expect(routingDoc).toContain('.synthex-plus/config.yaml');
    });
  });

  // ── [T] promptfoo "pool-gate-enabled" case exists and points at its fixture ──

  describe('[T] promptfoo pool-gate-enabled case (MMT-GATE-B1)', () => {
    const PROMPTFOO_CONFIG_PATH = join(ROOT, 'tests', 'promptfoo.config.yaml');
    const promptfooConfig = yaml.load(readFileSync(PROMPTFOO_CONFIG_PATH, 'utf-8')) as {
      tests: Array<{
        description?: string;
        vars?: Record<string, unknown>;
        assert?: Array<{ type: string; value: string }>;
      }>;
    };

    const gateCase = promptfooConfig.tests.find((t) =>
      (t.description ?? '').includes('pool-gate-enabled'),
    );

    it('the case exists in tests/promptfoo.config.yaml', () => {
      expect(gateCase).toBeDefined();
      expect(gateCase?.description).toContain('MMT-GATE-B1');
    });

    it('the case targets the review-code agent', () => {
      expect(gateCase?.vars?.agent).toBe('review-code');
    });

    it('the case input describes the project\'s own decoy docs/ file (to be avoided)', () => {
      const input = String(gateCase?.vars?.input ?? '');
      expect(input).toContain('DECOY-PROJECT-DOCS-MARKER');
      expect(input).toContain('standing_pools');
      expect(input).toContain('enabled: true');
    });

    it('the case asserts the rendered output reads the PLUGIN doc path, not the project\'s', () => {
      const values = (gateCase?.assert ?? []).map((a) => a.value);
      const types = (gateCase?.assert ?? []).map((a) => a.type);
      expect(values).toContain('${CLAUDE_PLUGIN_ROOT}/docs/standing-pool-routing.md');
      // The matching assertion must be a positive (icontains) check, not a
      // negative one, and a separate assertion must forbid the decoy marker.
      const positiveIdx = values.indexOf('${CLAUDE_PLUGIN_ROOT}/docs/standing-pool-routing.md');
      expect(types[positiveIdx]).toBe('icontains');
      const decoyIdx = values.indexOf('DECOY-PROJECT-DOCS-MARKER');
      expect(decoyIdx).toBeGreaterThan(-1);
      expect(types[decoyIdx]).toBe('not-icontains');
    });

    const FIXTURE_PROJECT_DIR = join(
      ROOT, 'tests', 'fixtures', 'multi-model-teams', 'pool-gate-enabled',
    );

    it('the fixture project directory exists with its OWN docs/ directory', () => {
      expect(existsSync(join(FIXTURE_PROJECT_DIR, 'docs', 'standing-pool-routing.md'))).toBe(true);
    });

    it('the fixture project\'s docs/ file is a decoy distinct from the plugin doc', () => {
      const projectDoc = readFileSync(
        join(FIXTURE_PROJECT_DIR, 'docs', 'standing-pool-routing.md'), 'utf-8',
      );
      const pluginDoc = readFileSync(join(DOCS_DIR, 'standing-pool-routing.md'), 'utf-8');
      expect(projectDoc).toContain('DECOY-PROJECT-DOCS-MARKER');
      expect(projectDoc).not.toBe(pluginDoc);
    });

    it('the fixture project has standing_pools.enabled: true in .synthex-plus/config.yaml', () => {
      const configPath = join(FIXTURE_PROJECT_DIR, '.synthex-plus', 'config.yaml');
      expect(existsSync(configPath)).toBe(true);
      const parsed = yaml.load(readFileSync(configPath, 'utf-8')) as {
        standing_pools?: { enabled?: boolean };
      };
      expect(parsed.standing_pools?.enabled).toBe(true);
    });

    it('the case is NOT auto-run by the default vitest suite (manual-trigger only, per Task 13)', () => {
      // This is a structural (Layer 1) check only — it does not invoke
      // promptfoo or the claude CLI. Layer 2 execution is manual-trigger,
      // matching the NL-B/AD-B convention documented in promptfoo.config.yaml.
      const raw = readFileSync(PROMPTFOO_CONFIG_PATH, 'utf-8');
      expect(raw).toContain('MMT-GATE-B');
      expect(raw).toContain('Manual-trigger only');
    });
  });
});

/**
 * Layer 1: Baseline-snapshot existence tests for native-looping plan Task 3.
 *
 * Phase 1 captures the deterministic envelope (frontmatter, Parameters table,
 * heading structure) of every FR-NL1 command BEFORE any --loop integration.
 * Later phases (4 and 5) add a "Native Looping" section + five new parameter
 * rows; the additions must not perturb the existing structure.
 *
 * This test only verifies the baselines exist and cover all FR-NL1 commands.
 * Byte-for-byte non-regression of the no-`--loop` path is asserted by the
 * per-command schema tests extended in Phase 6 (Task 31).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = join(__dirname, '..', '__snapshots__', 'native-looping', 'baseline');

const FR_NL1_COMMANDS: Array<{ plugin: 'synthex' | 'synthex-plus'; command: string }> = [
  { plugin: 'synthex', command: 'next-priority' },
  { plugin: 'synthex', command: 'write-implementation-plan' },
  { plugin: 'synthex', command: 'refine-requirements' },
  { plugin: 'synthex', command: 'review-code' },
  { plugin: 'synthex-plus', command: 'team-implement' },
  { plugin: 'synthex-plus', command: 'team-review' },
  { plugin: 'synthex-plus', command: 'team-plan' },
  { plugin: 'synthex-plus', command: 'team-refine' },
];

describe('native-looping baseline snapshots — Task 3', () => {
  it('MANIFEST.json exists and lists every FR-NL1 command', () => {
    const manifestPath = join(BASELINE_DIR, 'MANIFEST.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.snapshots).toBeInstanceOf(Array);
    const got = new Set(manifest.snapshots.map((s: any) => `${s.plugin}/${s.command}`));
    for (const { plugin, command } of FR_NL1_COMMANDS) {
      expect(got.has(`${plugin}/${command}`)).toBe(true);
    }
  });

  describe.each(FR_NL1_COMMANDS)(
    '$plugin/$command baseline',
    ({ plugin, command }) => {
      const path = join(BASELINE_DIR, `${plugin}__${command}.json`);

      it('snapshot file exists', () => {
        expect(existsSync(path)).toBe(true);
      });

      it('snapshot captures the Parameters table', () => {
        const snap = JSON.parse(readFileSync(path, 'utf-8'));
        expect(snap.parameters_table).toMatch(/^## Parameters/);
        expect(snap.parameters_table).toContain('| Parameter |');
      });

      it('snapshot captures at least one heading', () => {
        const snap = JSON.parse(readFileSync(path, 'utf-8'));
        expect(snap.headings.length).toBeGreaterThan(0);
        expect(snap.headings[0]).toMatch(/^#/);
      });

      it('snapshot does NOT contain a "Native Looping" section yet (pre-Phase-4/5)', () => {
        const snap = JSON.parse(readFileSync(path, 'utf-8'));
        // Baselines were captured BEFORE Phase 4/5 added --loop. If a baseline
        // already has Native Looping, the baseline is stale — re-capture before
        // proceeding.
        const hasNL = snap.headings.some((h: string) => /Native Looping/i.test(h));
        expect(hasNL).toBe(false);
      });
    }
  );
});

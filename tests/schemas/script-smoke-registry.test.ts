/**
 * Layer 1: Script-smoke registry coverage (Task 37, FR-HM18/FR-HM40/NFR-HM4).
 *
 * tests/compat/lib/script-smoke.mjs runs, inside every compat container's
 * offline profile, a happy-path case and a missing-jq/missing-node fallback
 * case for every runtime script the FR-HM40 portable-script contract
 * discovers (tests/schemas/portable-scripts.test.ts). Both consumers share
 * the same discovery (tests/compat/lib/script-inventory.mjs), so this test
 * fails the moment a runtime script is added, moved, or renamed without a
 * matching entry in script-smoke.mjs's SMOKE_CASES registry — the drift the
 * Task 37 acceptance criteria call out explicitly:
 *
 *   "[T] A schema test fails if a runtime script lacks a case."
 *
 * This is intentionally a pure inventory check (does every discovered
 * relPath have >= 1 registered case with a non-empty name and a run
 * function), not a re-execution of the cases themselves — actually running
 * them requires the jq-less/node-less container environment the Task 37
 * offline scenarios provide (tests/compat/scenarios/*-offline.mjs), which
 * this Layer 1 (zero-LLM-cost, host-run) suite does not have.
 *
 * Spec: docs/reqs/harness-modernization.md § FR-HM18, FR-HM40, NFR-HM4.
 * Plan: docs/plans/harness-modernization.md Task 37.
 */

import { describe, it, expect } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { discoverRuntimeScripts } from '../compat/lib/script-inventory.mjs';
import { SMOKE_CASES } from '../compat/lib/script-smoke.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'synthex');

const runtimeScripts = discoverRuntimeScripts(PLUGIN_ROOT);

describe('script-smoke registry coverage (Task 37)', () => {
  it('discovers at least the six Task 37 initial-case scripts', () => {
    const relPaths = runtimeScripts.map((s) => s.relPath);
    expect(relPaths).toEqual(
      expect.arrayContaining([
        'scripts/loop-step.sh',
        'scripts/lib/config-get.sh',
        'scripts/compact-recover.sh',
        'scripts/loop-idle-wait.sh',
        'scripts/loop-advance-gate.sh',
        'scripts/upgrade-nudge.sh',
      ]),
    );
  });

  describe.each(runtimeScripts)('$relPath', ({ relPath }) => {
    it('has a script-smoke case registered', () => {
      const cases = SMOKE_CASES[relPath];
      expect(cases, `SMOKE_CASES["${relPath}"] is missing — add it in tests/compat/lib/script-smoke.mjs`).toBeDefined();
      expect(cases.length).toBeGreaterThan(0);
    });

    it('has at least a happy-path case and a missing-jq/missing-node fallback case', () => {
      const cases = SMOKE_CASES[relPath] ?? [];
      expect(cases.length).toBeGreaterThanOrEqual(2);
    });

    it('every case has a non-empty name and a run function', () => {
      const cases = SMOKE_CASES[relPath] ?? [];
      for (const testCase of cases) {
        expect(typeof testCase.name).toBe('string');
        expect(testCase.name.length).toBeGreaterThan(0);
        expect(typeof testCase.run).toBe('function');
      }
    });
  });

  it('does not register cases for a script the contract no longer discovers (guards a stale registry)', () => {
    const discoveredRelPaths = new Set(runtimeScripts.map((s) => s.relPath));
    const staleEntries = Object.keys(SMOKE_CASES).filter((relPath) => !discoveredRelPaths.has(relPath));
    expect(staleEntries).toEqual([]);
  });
});

/**
 * Layer 2: Fixture validation tests for the timeout-fallback scenario.
 *
 * Validates that tests/fixtures/multi-model-teams/submission/timeout-fallback/fixture.json
 * is structurally correct and internally consistent, and that the standing-pool-submitter.md
 * agent contains the required verbatim timeout note.
 *
 * Covers:
 * - Required fields are present: scenario, setup.submission_timeout_seconds, expected.routing_decision
 * - expected.routing_decision === "fell-back-timeout" (validated against ROUTING_DECISION_VALUES)
 * - expected.tasks_marked_abandoned === true
 * - expected.verbatim_timeout_note matches the FR-MMT16a §3.4 pattern exactly
 * - standing-pool-submitter.md contains the verbatim timeout note (raw-string check)
 * - setup.elapsed_seconds > setup.submission_timeout_seconds (fixture internal consistency)
 * - "fell-back-timeout" is in ROUTING_DECISION_VALUES
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROUTING_DECISION_VALUES } from './standing-pool-cleanup.js';
import {
  fixture,
  assertFellBackTimeout,
  assertSubmitterOutputMatchesExpected,
  assertTasksMarkedAbandoned,
  assertFreshSpawnTriggered,
  assertVerbatimTimeoutNote,
  assertElapsedExceedsTimeout,
  assertPoolResponseIsNone,
} from '../fixtures/multi-model-teams/submission/timeout-fallback/assertions.js';

// ── File paths ────────────────────────────────────────────────────

const SUBMITTER_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'agents', 'standing-pool-submitter.md'
);

const submitterContent = readFileSync(SUBMITTER_PATH, 'utf-8');

// ── Tests ─────────────────────────────────────────────────────────

describe('timeout-fallback fixture — Layer 2 validation', () => {

  // ── Required top-level fields ────────────────────────────────────

  describe('Required fixture fields', () => {
    it('fixture has "scenario" field', () => {
      expect(fixture).toHaveProperty('scenario');
      expect(typeof fixture.scenario).toBe('string');
      expect(fixture.scenario.length).toBeGreaterThan(0);
    });

    it('fixture.scenario is "timeout-fallback"', () => {
      expect(fixture.scenario).toBe('timeout-fallback');
    });

    it('fixture has "setup.submission_timeout_seconds" field', () => {
      expect(fixture).toHaveProperty('setup');
      expect(fixture.setup).toHaveProperty('submission_timeout_seconds');
      expect(typeof fixture.setup.submission_timeout_seconds).toBe('number');
    });

    it('fixture has "expected.routing_decision" field', () => {
      expect(fixture).toHaveProperty('expected');
      expect(fixture.expected).toHaveProperty('routing_decision');
      expect(typeof fixture.expected.routing_decision).toBe('string');
    });

    it('fixture has "expected.tasks_marked_abandoned" field', () => {
      expect(fixture.expected).toHaveProperty('tasks_marked_abandoned');
    });

    it('fixture has "expected.verbatim_timeout_note" field', () => {
      expect(fixture.expected).toHaveProperty('verbatim_timeout_note');
      expect(typeof fixture.expected.verbatim_timeout_note).toBe('string');
    });

    it('fixture has "expected.fresh_spawn_triggered" field', () => {
      expect(fixture.expected).toHaveProperty('fresh_spawn_triggered');
    });
  });

  // ── routing_decision assertions ───────────────────────────────────

  describe('expected.routing_decision === "fell-back-timeout"', () => {
    it('expected.routing_decision is "fell-back-timeout"', () => {
      const err = assertFellBackTimeout();
      expect(err, err ?? undefined).toBeNull();
    });

    it('"fell-back-timeout" is in ROUTING_DECISION_VALUES', () => {
      expect(ROUTING_DECISION_VALUES).toContain('fell-back-timeout');
    });

    it('expected.routing_decision is a valid ROUTING_DECISION_VALUES member', () => {
      const decision = fixture.expected.routing_decision;
      expect(
        ROUTING_DECISION_VALUES.includes(decision as typeof ROUTING_DECISION_VALUES[number]),
        `"${decision}" is not a valid routing decision`
      ).toBe(true);
    });

    it('submitter_outputs.routing_decision matches expected.routing_decision', () => {
      const err = assertSubmitterOutputMatchesExpected();
      expect(err, err ?? undefined).toBeNull();
    });
  });

  // ── tasks_marked_abandoned assertion ─────────────────────────────

  describe('expected.tasks_marked_abandoned === true', () => {
    it('tasks_marked_abandoned is true (FR-MMT16a §3.4 step 1)', () => {
      const err = assertTasksMarkedAbandoned();
      expect(err, err ?? undefined).toBeNull();
    });
  });

  // ── verbatim_timeout_note assertions ─────────────────────────────

  describe('expected.verbatim_timeout_note matches FR-MMT16a §3.4 pattern', () => {
    it('verbatim_timeout_note exactly matches pattern from standing-pool-submitter.md Step 6', () => {
      const err = assertVerbatimTimeoutNote();
      expect(err, err ?? undefined).toBeNull();
    });

    it('verbatim_timeout_note contains the pool name substitution', () => {
      const note = fixture.expected.verbatim_timeout_note;
      const poolName = fixture.setup.pool_name;
      expect(note).toContain(`'${poolName}'`);
    });

    it('verbatim_timeout_note contains the timeout substitution in seconds', () => {
      const note = fixture.expected.verbatim_timeout_note;
      const timeout = fixture.setup.submission_timeout_seconds;
      expect(note).toContain(`${timeout}s`);
    });

    it('verbatim_timeout_note ends with "falling back to fresh-spawn review."', () => {
      const note = fixture.expected.verbatim_timeout_note;
      expect(note).toMatch(/falling back to fresh-spawn review\.$/);
    });
  });

  // ── standing-pool-submitter.md verbatim note check ────────────────

  describe('standing-pool-submitter.md contains the verbatim timeout note', () => {
    it('submitter.md contains "did not return a report within" (verbatim fragment)', () => {
      expect(submitterContent).toContain('did not return a report within');
    });

    it('submitter.md contains "falling back to fresh-spawn review" (verbatim fragment)', () => {
      expect(submitterContent).toContain('falling back to fresh-spawn review');
    });

    it('submitter.md contains the full verbatim timeout note template', () => {
      // The template uses {name} and {timeout} placeholders in the document
      expect(submitterContent).toContain(
        "did not return a report within {timeout}s; falling back to fresh-spawn review."
      );
    });

    it('submitter.md cites FR-MMT16a §3.4 for the timeout note requirement', () => {
      expect(submitterContent).toContain('FR-MMT16a');
    });
  });

  // ── Internal consistency: elapsed > timeout ───────────────────────

  describe('Fixture internal consistency', () => {
    it('setup.elapsed_seconds > setup.submission_timeout_seconds (timeout actually fired)', () => {
      const err = assertElapsedExceedsTimeout();
      expect(err, err ?? undefined).toBeNull();
    });

    it('pool_response is "none" (pool never returned report)', () => {
      const err = assertPoolResponseIsNone();
      expect(err, err ?? undefined).toBeNull();
    });

    it('fresh_spawn_triggered is true (caller spawns fresh reviewers)', () => {
      const err = assertFreshSpawnTriggered();
      expect(err, err ?? undefined).toBeNull();
    });

    it('setup.submitted_tasks has at least one task', () => {
      expect(fixture.setup.submitted_tasks).toBeDefined();
      expect(Array.isArray(fixture.setup.submitted_tasks)).toBe(true);
      expect(fixture.setup.submitted_tasks.length).toBeGreaterThan(0);
    });

    it('setup.pool_name matches the pool name in verbatim_timeout_note', () => {
      const poolName = fixture.setup.pool_name;
      const note = fixture.expected.verbatim_timeout_note;
      expect(note).toContain(poolName);
    });

    it('setup.submission_timeout_seconds matches the timeout value in verbatim_timeout_note', () => {
      const timeout = fixture.setup.submission_timeout_seconds;
      const note = fixture.expected.verbatim_timeout_note;
      expect(note).toContain(String(timeout));
    });
  });

});

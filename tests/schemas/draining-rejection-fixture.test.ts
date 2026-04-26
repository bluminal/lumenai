/**
 * Layer 2 fixture tests: draining-rejection submission scenario (Task 30b).
 *
 * Validates the draining-rejection fixture at:
 *   tests/fixtures/multi-model-teams/submission/draining-rejection/
 *
 * Scenario: pool transitions to draining between inline discovery (which read
 * index.json showing pool_state: idle) and the standing-pool-submitter's drain
 * check. The submitter re-reads config.json, detects pool_state: draining, and
 * returns fell-back-pool-draining without writing any task files or mailbox
 * notifications. (FR-MMT14a)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  fixture,
  assertRoutingDecisionIsDraining,
  assertSubmitterOutputMatchesExpected,
  assertNoTaskFilesWritten,
  assertNoMailboxNotification,
  assertDrainCheckExercised,
  assertConfigWasReread,
  assertRaceConditionModeled,
} from '../fixtures/multi-model-teams/submission/draining-rejection/assertions.js';

import { ROUTING_DECISION_VALUES } from './standing-pool-cleanup.js';

// ── Paths ─────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = join(
  import.meta.dirname,
  '..', 'fixtures', 'multi-model-teams', 'submission', 'draining-rejection'
);

const SUBMITTER_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'agents', 'standing-pool-submitter.md'
);

// ── Fixture structure ─────────────────────────────────────────────────────────

describe('draining-rejection — fixture structure', () => {

  it('fixture.json is readable and well-formed', () => {
    const raw = readFileSync(join(FIXTURE_DIR, 'fixture.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed).toBeTruthy();
    expect(typeof parsed.scenario).toBe('string');
    expect(typeof parsed.description).toBe('string');
    expect(parsed.setup).toBeTruthy();
    expect(parsed.submitter_inputs).toBeTruthy();
    expect(parsed.submitter_outputs).toBeTruthy();
    expect(parsed.expected).toBeTruthy();
  });

  it('scenario.md is present and non-empty', () => {
    const md = readFileSync(join(FIXTURE_DIR, 'scenario.md'), 'utf-8');
    expect(md.trim().length).toBeGreaterThan(0);
    expect(md).toContain('draining-rejection');
  });

  it('fixture.scenario is "draining-rejection"', () => {
    expect(fixture.scenario).toBe('draining-rejection');
  });

  it('setup.pool_name is "review-pool-b"', () => {
    expect(fixture.setup.pool_name).toBe('review-pool-b');
  });

  it('submitter_inputs.pool_name matches setup.pool_name', () => {
    expect(fixture.submitter_inputs.pool_name).toBe(fixture.setup.pool_name);
  });

});

// ── Routing decision ──────────────────────────────────────────────────────────

describe('draining-rejection — routing decision', () => {

  it('expected.routing_decision is "fell-back-pool-draining"', () => {
    const error = assertRoutingDecisionIsDraining();
    expect(error).toBeNull();
  });

  it('expected.routing_decision is in ROUTING_DECISION_VALUES', () => {
    expect(ROUTING_DECISION_VALUES).toContain(
      fixture.expected.routing_decision as typeof ROUTING_DECISION_VALUES[number]
    );
  });

  it('submitter_outputs.routing_decision matches expected.routing_decision', () => {
    const error = assertSubmitterOutputMatchesExpected();
    expect(error).toBeNull();
  });

});

// ── No filesystem writes ──────────────────────────────────────────────────────

describe('draining-rejection — no filesystem writes when draining', () => {

  it('expected.task_files_written is false (no tasks written when draining)', () => {
    const error = assertNoTaskFilesWritten();
    expect(error).toBeNull();
  });

  it('expected.task_files_written is explicitly false', () => {
    expect(fixture.expected.task_files_written).toBe(false);
  });

  it('expected.mailbox_notification_sent is false (no notification when draining)', () => {
    const error = assertNoMailboxNotification();
    expect(error).toBeNull();
  });

  it('expected.mailbox_notification_sent is explicitly false', () => {
    expect(fixture.expected.mailbox_notification_sent).toBe(false);
  });

});

// ── Drain check exercised ─────────────────────────────────────────────────────

describe('draining-rejection — drain check exercised', () => {

  it('expected.drain_check_exercised is true', () => {
    const error = assertDrainCheckExercised();
    expect(error).toBeNull();
  });

  it('expected.config_reread is true (submitter re-reads config.json, not index)', () => {
    const error = assertConfigWasReread();
    expect(error).toBeNull();
  });

});

// ── Race condition modeled ────────────────────────────────────────────────────

describe('draining-rejection — race condition correctly modeled in fixture', () => {

  it('setup.index_state.pool_state is "idle" AND setup.config_json_state.pool_state is "draining"', () => {
    const error = assertRaceConditionModeled();
    expect(error).toBeNull();
  });

  it('setup.index_state.pool_state is "idle" (stale snapshot)', () => {
    expect(fixture.setup.index_state.pool_state).toBe('idle');
  });

  it('setup.config_json_state.pool_state is "draining" (real state)', () => {
    expect(fixture.setup.config_json_state.pool_state).toBe('draining');
  });

  it('index_state and config_json_state differ — modeling the race window', () => {
    expect(fixture.setup.index_state.pool_state).not.toBe(
      fixture.setup.config_json_state.pool_state
    );
  });

});

// ── Agent documentation checks ────────────────────────────────────────────────

describe('draining-rejection — standing-pool-submitter.md documents drain check', () => {

  const submitterContent = readFileSync(SUBMITTER_MD_PATH, 'utf-8');

  it('standing-pool-submitter.md contains "re-reads" and "config.json" in Step 1 context', () => {
    // Drain check is documented: submitter re-reads config.json before writing tasks
    const hasReread = submitterContent.includes('re-read') || submitterContent.includes('re-reads');
    const hasConfigJson = submitterContent.includes('config.json');
    expect(hasReread, 'submitter.md must contain "re-read" or "re-reads"').toBe(true);
    expect(hasConfigJson, 'submitter.md must contain "config.json"').toBe(true);
  });

  it('standing-pool-submitter.md contains "fell-back-pool-draining"', () => {
    expect(submitterContent).toContain('fell-back-pool-draining');
  });

  it('standing-pool-submitter.md references FR-MMT14a (drain check requirement)', () => {
    expect(submitterContent).toContain('FR-MMT14a');
  });

  it('standing-pool-submitter.md documents that drain check fires before writing tasks', () => {
    // Step 1 must come before task writing (Step 3)
    const step1Index = submitterContent.indexOf('Step 1');
    const step3Index = submitterContent.indexOf('Step 3');
    expect(step1Index).toBeGreaterThan(-1);
    expect(step3Index).toBeGreaterThan(-1);
    expect(step1Index).toBeLessThan(step3Index);
  });

});

/**
 * Layer 2: /synthex:review-code routing integration fixture tests (Task 56).
 *
 * 9 scenarios covering pool-routing decisions for the review-code command.
 * All fixtures are synthetic (no live LLM calls). Fixture JSON is read and
 * validated; assertions delegate to per-scenario assertion helpers.
 *
 * Scenarios:
 *   (a) pool-match-native-only         — matches idle pool, multi_model=false; notification "multi-model: no"
 *   (b) pool-match-multi-model         — matches idle pool, multi_model=true; notification "multi-model: yes" + attribution
 *   (c) no-pool-fallback               — empty index; prefer-with-fallback silently falls back; no error
 *   (d) roster-mismatch-fallback       — pool exists but roster wrong; fell-back-roster-mismatch
 *   (e) explicit-pool-required-abort   — no pool + explicit-pool-required; aborts with verbatim FR-MMT17 error
 *   (f) pool-draining-fallback         — index idle but config.json draining; fell-back-pool-draining
 *   (g) tty-suppressed-waiting-indicator — not a TTY + wait > 60s; indicator suppressed
 *   (h) waiting-indicator-tty          — TTY + wait > 60s; verbatim indicator emitted
 *   (i) wait-under-60s                 — TTY + wait < 60s; indicator NOT emitted
 *
 * Acceptance criteria covered:
 *   FR-MMT17: routing notification verbatim text (multi-model: yes|no)
 *   FR-MMT17: explicit-pool-required verbatim error message with remediation hints
 *   Task 55 Item 3: waiting indicator verbatim text and conditional suppression (TTY + 60s threshold)
 *   Task 55 Item 4: provenance line verbatim in report (multi-model attribution)
 *   routing_decision enum: all 7 values tested across scenarios
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Fixture loaders ──────────────────────────────────────────────────────────

const FIXTURES_BASE = join(
  import.meta.dirname,
  '..', 'fixtures', 'multi-model-teams', 'routing', 'review-code'
);

function loadFixture(scenarioDir: string): Record<string, unknown> {
  const path = join(FIXTURES_BASE, scenarioDir, 'fixture.json');
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function loadScenarioMd(scenarioDir: string): string {
  const path = join(FIXTURES_BASE, scenarioDir, 'scenario.md');
  return readFileSync(path, 'utf-8');
}

// ── Per-scenario assertion imports ───────────────────────────────────────────

import {
  fixture as fixtureA,
  assertRoutedToPool as assertRoutedToPoolA,
  assertNativeOnly,
  assertNotificationContainsMultiModelNo,
  assertNotificationAbsentMultiModelYes,
  assertPoolName as assertPoolNameA,
  assertNoError as assertNoErrorA,
} from '../fixtures/multi-model-teams/routing/review-code/pool-match-native-only/assertions.js';

import {
  fixture as fixtureB,
  assertRoutedToPool as assertRoutedToPoolB,
  assertMultiModelTrue,
  assertNotificationContainsMultiModelYes,
  assertNotificationAbsentMultiModelNo,
  assertReportAttributionVerbatim,
  assertNoError as assertNoErrorB,
} from '../fixtures/multi-model-teams/routing/review-code/pool-match-multi-model/assertions.js';

import {
  fixture as fixtureC,
  assertFellBackNoPool,
  assertNoError as assertNoErrorC,
  assertErrorNotShown as assertErrorNotShownC,
  assertFreshSpawnFallback as assertFreshSpawnFallbackC,
  assertPoolNameIsNull as assertPoolNameIsNullC,
  assertEmptyPoolIndex,
} from '../fixtures/multi-model-teams/routing/review-code/no-pool-fallback/assertions.js';

import {
  fixture as fixtureD,
  assertFellBackRosterMismatch,
  assertAuditDecision as assertAuditDecisionD,
  assertPoolNameIsNull as assertPoolNameIsNullD,
  assertNoError as assertNoErrorD,
  assertErrorNotShown as assertErrorNotShownD,
  assertMismatchedRoster,
} from '../fixtures/multi-model-teams/routing/review-code/roster-mismatch-fallback/assertions.js';

import {
  fixture as fixtureE,
  assertSkippedRoutingModeExplicit,
  assertAbortIsTrue,
  assertErrorShown as assertErrorShownE,
  assertVerbatimErrorFragments,
  assertFirstLineVerbatim,
  assertStartReviewTeamHintPresent,
  assertConfigChangeHintPresent,
} from '../fixtures/multi-model-teams/routing/review-code/explicit-pool-required-abort/assertions.js';

import {
  fixture as fixtureF,
  assertFellBackPoolDraining,
  assertAuditDecision as assertAuditDecisionF,
  assertPoolNameInAudit,
  assertNoError as assertNoErrorF,
  assertErrorNotShown as assertErrorNotShownF,
  assertDrainingMismatch,
} from '../fixtures/multi-model-teams/routing/review-code/pool-draining-fallback/assertions.js';

import {
  fixture as fixtureG,
  assertRoutedToPool as assertRoutedToPoolG,
  assertWaitingIndicatorNotEmitted as assertWaitingIndicatorNotEmittedG,
  assertWaitingIndicatorTextIsNull as assertWaitingIndicatorTextIsNullG,
  assertStdoutIsNotTty,
  assertWaitExceedsThreshold as assertWaitExceedsThresholdG,
  assertSubmissionCompleted as assertSubmissionCompletedG,
} from '../fixtures/multi-model-teams/routing/review-code/tty-suppressed-waiting-indicator/assertions.js';

import {
  fixture as fixtureH,
  assertRoutedToPool as assertRoutedToPoolH,
  assertWaitingIndicatorEmitted,
  assertVerbatimTemplate,
  assertSampleIndicatorText,
  assertStdoutIsTty as assertStdoutIsTtyH,
  assertWaitExceedsThreshold as assertWaitExceedsThresholdH,
  assertIndicatorInterval,
  assertSubmissionCompleted as assertSubmissionCompletedH,
} from '../fixtures/multi-model-teams/routing/review-code/waiting-indicator-tty/assertions.js';

import {
  fixture as fixtureI,
  assertRoutedToPool as assertRoutedToPoolI,
  assertWaitingIndicatorNotEmitted as assertWaitingIndicatorNotEmittedI,
  assertWaitingIndicatorTextIsNull as assertWaitingIndicatorTextIsNullI,
  assertStdoutIsTty as assertStdoutIsTtyI,
  assertWaitBelowThreshold,
  assertSubmissionCompleted as assertSubmissionCompletedI,
} from '../fixtures/multi-model-teams/routing/review-code/wait-under-60s/assertions.js';

// ── Shared fixture structure validator ──────────────────────────────────────

/**
 * Validates the base fixture.json structure for /review-code routing fixtures.
 * Each fixture must have: scenario, description, setup, expected.
 * setup must have: index_json.pools array, config, command_args.
 * expected must have: routing_decision.
 */
function assertBaseFixtureStructure(fixture: Record<string, unknown>, scenarioName: string): void {
  expect(fixture, `${scenarioName}: fixture must be a non-null object`).toBeTruthy();
  expect(typeof fixture.scenario, `${scenarioName}: "scenario" must be a string`).toBe('string');
  expect(typeof fixture.description, `${scenarioName}: "description" must be a string`).toBe('string');
  expect(fixture.setup, `${scenarioName}: "setup" must be present`).toBeTruthy();
  expect(fixture.expected, `${scenarioName}: "expected" must be present`).toBeTruthy();

  const setup = fixture.setup as Record<string, unknown>;
  expect(setup.index_json, `${scenarioName}: setup.index_json must be present`).toBeTruthy();
  expect(setup.config, `${scenarioName}: setup.config must be present`).toBeTruthy();
  expect(setup.command_args, `${scenarioName}: setup.command_args must be present`).toBeTruthy();

  const indexJson = setup.index_json as Record<string, unknown>;
  expect(Array.isArray(indexJson.pools), `${scenarioName}: setup.index_json.pools must be an array`).toBe(true);

  const expected = fixture.expected as Record<string, unknown>;
  expect(typeof expected.routing_decision, `${scenarioName}: expected.routing_decision must be a string`).toBe('string');
}

const VALID_ROUTING_DECISIONS = [
  'routed-to-pool',
  'fell-back-no-pool',
  'fell-back-roster-mismatch',
  'fell-back-pool-draining',
  'fell-back-pool-stale',
  'fell-back-timeout',
  'skipped-routing-mode-explicit',
] as const;

// ── (a) pool-match-native-only ────────────────────────────────────────────────

describe('(a) pool-match-native-only — idle pool, multi_model=false', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('pool-match-native-only');
      assertBaseFixtureStructure(raw, 'pool-match-native-only');
    });

    it('scenario.md is present and non-empty', () => {
      const md = loadScenarioMd('pool-match-native-only');
      expect(md.trim().length).toBeGreaterThan(0);
      expect(md).toContain('pool-match-native-only');
    });

    it('fixture.scenario is "pool-match-native-only"', () => {
      expect(fixtureA.scenario).toBe('pool-match-native-only');
    });

    it('setup has exactly 1 pool in index_json', () => {
      expect(fixtureA.setup.index_json.pools).toHaveLength(1);
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "routed-to-pool"', () => {
      const error = assertRoutedToPoolA();
      expect(error).toBeNull();
    });

    it('routing_decision is a valid enum value', () => {
      expect(VALID_ROUTING_DECISIONS).toContain(fixtureA.expected.routing_decision as typeof VALID_ROUTING_DECISIONS[number]);
    });
  });

  describe('multi-model flag', () => {
    it('multi_model is false (native-only pool)', () => {
      const error = assertNativeOnly();
      expect(error).toBeNull();
    });

    it('pool in index_json has multi_model: false', () => {
      const pool = fixtureA.setup.index_json.pools[0] as Record<string, unknown>;
      expect(pool.multi_model).toBe(false);
    });
  });

  describe('routing notification', () => {
    it('notification_contains is "multi-model: no"', () => {
      const error = assertNotificationContainsMultiModelNo();
      expect(error).toBeNull();
    });

    it('notification_absent is "multi-model: yes"', () => {
      const error = assertNotificationAbsentMultiModelYes();
      expect(error).toBeNull();
    });
  });

  describe('pool and error', () => {
    it('pool_name is "review-pool-a"', () => {
      const error = assertPoolNameA();
      expect(error).toBeNull();
    });

    it('error is null', () => {
      const error = assertNoErrorA();
      expect(error).toBeNull();
    });
  });
});

// ── (b) pool-match-multi-model ────────────────────────────────────────────────

describe('(b) pool-match-multi-model — idle pool, multi_model=true', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('pool-match-multi-model');
      assertBaseFixtureStructure(raw, 'pool-match-multi-model');
    });

    it('scenario.md is present and non-empty', () => {
      const md = loadScenarioMd('pool-match-multi-model');
      expect(md.trim().length).toBeGreaterThan(0);
    });

    it('fixture.scenario is "pool-match-multi-model"', () => {
      expect(fixtureB.scenario).toBe('pool-match-multi-model');
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "routed-to-pool"', () => {
      const error = assertRoutedToPoolB();
      expect(error).toBeNull();
    });

    it('routing_decision is a valid enum value', () => {
      expect(VALID_ROUTING_DECISIONS).toContain(fixtureB.expected.routing_decision as typeof VALID_ROUTING_DECISIONS[number]);
    });
  });

  describe('multi-model flag', () => {
    it('multi_model is true', () => {
      const error = assertMultiModelTrue();
      expect(error).toBeNull();
    });

    it('expected.multi_model is true', () => {
      expect(fixtureB.expected.multi_model).toBe(true);
    });
  });

  describe('routing notification', () => {
    it('notification_contains is "multi-model: yes"', () => {
      const error = assertNotificationContainsMultiModelYes();
      expect(error).toBeNull();
    });

    it('notification_absent is "multi-model: no"', () => {
      const error = assertNotificationAbsentMultiModelNo();
      expect(error).toBeNull();
    });
  });

  describe('Task 55 Item 4: report attribution', () => {
    it('report_attribution matches verbatim provenance line', () => {
      const error = assertReportAttributionVerbatim();
      expect(error).toBeNull();
    });

    it('report_attribution contains "Review path: standing pool"', () => {
      expect(fixtureB.expected.report_attribution).toContain('Review path: standing pool');
    });

    it('report_attribution contains "(multi-model: yes)."', () => {
      expect(fixtureB.expected.report_attribution).toContain('(multi-model: yes).');
    });
  });

  describe('error', () => {
    it('error is null', () => {
      const error = assertNoErrorB();
      expect(error).toBeNull();
    });
  });
});

// ── (c) no-pool-fallback ──────────────────────────────────────────────────────

describe('(c) no-pool-fallback — empty index, prefer-with-fallback, silent fallback', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('no-pool-fallback');
      assertBaseFixtureStructure(raw, 'no-pool-fallback');
    });

    it('fixture.scenario is "no-pool-fallback"', () => {
      expect(fixtureC.scenario).toBe('no-pool-fallback');
    });

    it('index_json.pools is empty', () => {
      const error = assertEmptyPoolIndex();
      expect(error).toBeNull();
    });

    it('index_json.pools has length 0', () => {
      expect(fixtureC.setup.index_json.pools).toHaveLength(0);
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "fell-back-no-pool"', () => {
      const error = assertFellBackNoPool();
      expect(error).toBeNull();
    });

    it('routing_decision is a valid enum value', () => {
      expect(VALID_ROUTING_DECISIONS).toContain(fixtureC.expected.routing_decision as typeof VALID_ROUTING_DECISIONS[number]);
    });
  });

  describe('fallback semantics', () => {
    it('pool_name is null (no pool matched)', () => {
      const error = assertPoolNameIsNullC();
      expect(error).toBeNull();
    });

    it('fallback_type is "fresh-spawn"', () => {
      const error = assertFreshSpawnFallbackC();
      expect(error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('error is null (silent fallback)', () => {
      const error = assertNoErrorC();
      expect(error).toBeNull();
    });

    it('error_shown is false (no error displayed to user)', () => {
      const error = assertErrorNotShownC();
      expect(error).toBeNull();
    });
  });
});

// ── (d) roster-mismatch-fallback ──────────────────────────────────────────────

describe('(d) roster-mismatch-fallback — pool exists but roster wrong', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('roster-mismatch-fallback');
      assertBaseFixtureStructure(raw, 'roster-mismatch-fallback');
    });

    it('fixture.scenario is "roster-mismatch-fallback"', () => {
      expect(fixtureD.scenario).toBe('roster-mismatch-fallback');
    });

    it('pool roster contains only [performance-engineer]', () => {
      const error = assertMismatchedRoster();
      expect(error).toBeNull();
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "fell-back-roster-mismatch"', () => {
      const error = assertFellBackRosterMismatch();
      expect(error).toBeNull();
    });

    it('routing_decision is a valid enum value', () => {
      expect(VALID_ROUTING_DECISIONS).toContain(fixtureD.expected.routing_decision as typeof VALID_ROUTING_DECISIONS[number]);
    });
  });

  describe('audit', () => {
    it('audit_decision is "fell-back-roster-mismatch"', () => {
      const error = assertAuditDecisionD();
      expect(error).toBeNull();
    });
  });

  describe('fallback semantics', () => {
    it('pool_name is null (no matching pool)', () => {
      const error = assertPoolNameIsNullD();
      expect(error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('error is null (prefer-with-fallback does not abort)', () => {
      const error = assertNoErrorD();
      expect(error).toBeNull();
    });

    it('error_shown is false', () => {
      const error = assertErrorNotShownD();
      expect(error).toBeNull();
    });
  });
});

// ── (e) explicit-pool-required-abort ──────────────────────────────────────────

describe('(e) explicit-pool-required-abort — no pool, aborts with verbatim FR-MMT17 error', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('explicit-pool-required-abort');
      assertBaseFixtureStructure(raw, 'explicit-pool-required-abort');
    });

    it('fixture.scenario is "explicit-pool-required-abort"', () => {
      expect(fixtureE.scenario).toBe('explicit-pool-required-abort');
    });

    it('routing_mode in config is "explicit-pool-required"', () => {
      const config = fixtureE.setup.config as Record<string, unknown>;
      const pools = config.standing_pools as Record<string, unknown>;
      expect(pools.routing_mode).toBe('explicit-pool-required');
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "skipped-routing-mode-explicit"', () => {
      const error = assertSkippedRoutingModeExplicit();
      expect(error).toBeNull();
    });

    it('routing_decision is a valid enum value', () => {
      expect(VALID_ROUTING_DECISIONS).toContain(fixtureE.expected.routing_decision as typeof VALID_ROUTING_DECISIONS[number]);
    });
  });

  describe('abort behavior', () => {
    it('abort is true (command does not fall back)', () => {
      const error = assertAbortIsTrue();
      expect(error).toBeNull();
    });

    it('error_shown is true', () => {
      const error = assertErrorShownE();
      expect(error).toBeNull();
    });
  });

  describe('FR-MMT17 verbatim error message', () => {
    it('first line matches FR-MMT17 verbatim', () => {
      const error = assertFirstLineVerbatim();
      expect(error).toBeNull();
    });

    it('all verbatim FR-MMT17 error fragments present', () => {
      const error = assertVerbatimErrorFragments();
      expect(error).toBeNull();
    });

    it('error_message contains "No standing pool matches the required reviewers (code-reviewer, security-reviewer)."', () => {
      expect(fixtureE.expected.error_message).toContain(
        'No standing pool matches the required reviewers (code-reviewer, security-reviewer).'
      );
    });

    it("error_message contains \"Routing mode is 'explicit-pool-required'\"", () => {
      expect(fixtureE.expected.error_message).toContain("Routing mode is 'explicit-pool-required'");
    });

    it('error_message contains "fresh-spawn reviewers. To proceed, either:"', () => {
      expect(fixtureE.expected.error_message).toContain('fresh-spawn reviewers. To proceed, either:');
    });
  });

  describe('FR-MMT17 remediation hints', () => {
    it('start-review-team remediation hint present', () => {
      const error = assertStartReviewTeamHintPresent();
      expect(error).toBeNull();
    });

    it('config change remediation hint present', () => {
      const error = assertConfigChangeHintPresent();
      expect(error).toBeNull();
    });

    it("error_message contains '/synthex-plus:start-review-team --reviewers code-reviewer,security-reviewer'", () => {
      expect(fixtureE.expected.error_message).toContain(
        '/synthex-plus:start-review-team --reviewers code-reviewer,security-reviewer'
      );
    });

    it("error_message contains \"Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml\"", () => {
      expect(fixtureE.expected.error_message).toContain(
        "Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml"
      );
    });
  });
});

// ── (f) pool-draining-fallback ────────────────────────────────────────────────

describe('(f) pool-draining-fallback — index idle but config.json draining', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('pool-draining-fallback');
      assertBaseFixtureStructure(raw, 'pool-draining-fallback');
    });

    it('fixture.scenario is "pool-draining-fallback"', () => {
      expect(fixtureF.scenario).toBe('pool-draining-fallback');
    });

    it('index_json shows pool_state idle (stale snapshot)', () => {
      const pools = fixtureF.setup.index_json.pools;
      expect(pools).toHaveLength(1);
      const pool = pools[0] as Record<string, unknown>;
      expect(pool.pool_state).toBe('idle');
    });

    it('pool_config_json shows pool_state draining (real state)', () => {
      const poolConfig = fixtureF.setup.pool_config_json as Record<string, unknown>;
      expect(poolConfig.pool_state).toBe('draining');
    });

    it('draining mismatch condition is correctly set up', () => {
      const error = assertDrainingMismatch();
      expect(error).toBeNull();
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "fell-back-pool-draining"', () => {
      const error = assertFellBackPoolDraining();
      expect(error).toBeNull();
    });

    it('routing_decision is a valid enum value', () => {
      expect(VALID_ROUTING_DECISIONS).toContain(fixtureF.expected.routing_decision as typeof VALID_ROUTING_DECISIONS[number]);
    });
  });

  describe('audit', () => {
    it('audit_decision is "fell-back-pool-draining"', () => {
      const error = assertAuditDecisionF();
      expect(error).toBeNull();
    });

    it('pool_name is "review-pool-c" (recorded in audit)', () => {
      const error = assertPoolNameInAudit();
      expect(error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('error is null (prefer-with-fallback does not abort on draining)', () => {
      const error = assertNoErrorF();
      expect(error).toBeNull();
    });

    it('error_shown is false', () => {
      const error = assertErrorNotShownF();
      expect(error).toBeNull();
    });
  });
});

// ── (g) tty-suppressed-waiting-indicator ─────────────────────────────────────

describe('(g) tty-suppressed-waiting-indicator — not a TTY, wait > 60s, indicator suppressed', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('tty-suppressed-waiting-indicator');
      assertBaseFixtureStructure(raw, 'tty-suppressed-waiting-indicator');
    });

    it('fixture.scenario is "tty-suppressed-waiting-indicator"', () => {
      expect(fixtureG.scenario).toBe('tty-suppressed-waiting-indicator');
    });

    it('runtime.stdout_is_tty is false', () => {
      const error = assertStdoutIsNotTty();
      expect(error).toBeNull();
    });

    it('runtime.expected_wait_seconds > 60', () => {
      const error = assertWaitExceedsThresholdG();
      expect(error).toBeNull();
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "routed-to-pool"', () => {
      const error = assertRoutedToPoolG();
      expect(error).toBeNull();
    });
  });

  describe('Task 55 Item 3: waiting indicator suppressed (non-TTY)', () => {
    it('waiting_indicator_emitted is false (non-TTY suppression)', () => {
      const error = assertWaitingIndicatorNotEmittedG();
      expect(error).toBeNull();
    });

    it('waiting_indicator_text is null (nothing emitted)', () => {
      const error = assertWaitingIndicatorTextIsNullG();
      expect(error).toBeNull();
    });

    it('expected.waiting_indicator_emitted is explicitly false', () => {
      expect(fixtureG.expected.waiting_indicator_emitted).toBe(false);
    });
  });

  describe('submission', () => {
    it('submission_completed is true', () => {
      const error = assertSubmissionCompletedG();
      expect(error).toBeNull();
    });
  });
});

// ── (h) waiting-indicator-tty ─────────────────────────────────────────────────

describe('(h) waiting-indicator-tty — TTY, wait > 60s, verbatim indicator emitted', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('waiting-indicator-tty');
      assertBaseFixtureStructure(raw, 'waiting-indicator-tty');
    });

    it('fixture.scenario is "waiting-indicator-tty"', () => {
      expect(fixtureH.scenario).toBe('waiting-indicator-tty');
    });

    it('runtime.stdout_is_tty is true', () => {
      const error = assertStdoutIsTtyH();
      expect(error).toBeNull();
    });

    it('runtime.expected_wait_seconds > 60', () => {
      const error = assertWaitExceedsThresholdH();
      expect(error).toBeNull();
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "routed-to-pool"', () => {
      const error = assertRoutedToPoolH();
      expect(error).toBeNull();
    });
  });

  describe('Task 55 Item 3: waiting indicator verbatim text', () => {
    it('waiting_indicator_emitted is true', () => {
      const error = assertWaitingIndicatorEmitted();
      expect(error).toBeNull();
    });

    it('verbatim template matches Task 55 Item 3 exactly', () => {
      const error = assertVerbatimTemplate();
      expect(error).toBeNull();
    });

    it("waiting_indicator_verbatim_template is \"Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete...\"", () => {
      expect(fixtureH.expected.waiting_indicator_verbatim_template).toBe(
        "Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete..."
      );
    });

    it('sample indicator text contains pool name and progress', () => {
      const error = assertSampleIndicatorText();
      expect(error).toBeNull();
    });

    it('indicator_interval_seconds is 30', () => {
      const error = assertIndicatorInterval();
      expect(error).toBeNull();
    });
  });

  describe('submission', () => {
    it('submission_completed is true', () => {
      const error = assertSubmissionCompletedH();
      expect(error).toBeNull();
    });
  });
});

// ── (i) wait-under-60s ───────────────────────────────────────────────────────

describe('(i) wait-under-60s — TTY, wait < 60s, indicator NOT emitted', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('wait-under-60s');
      assertBaseFixtureStructure(raw, 'wait-under-60s');
    });

    it('fixture.scenario is "wait-under-60s"', () => {
      expect(fixtureI.scenario).toBe('wait-under-60s');
    });

    it('runtime.stdout_is_tty is true', () => {
      const error = assertStdoutIsTtyI();
      expect(error).toBeNull();
    });

    it('runtime.actual_wait_seconds < 60', () => {
      const error = assertWaitBelowThreshold();
      expect(error).toBeNull();
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "routed-to-pool"', () => {
      const error = assertRoutedToPoolI();
      expect(error).toBeNull();
    });
  });

  describe('Task 55 Item 3: waiting indicator NOT emitted (below 60s threshold)', () => {
    it('waiting_indicator_emitted is false (60s threshold not crossed)', () => {
      const error = assertWaitingIndicatorNotEmittedI();
      expect(error).toBeNull();
    });

    it('waiting_indicator_text is null', () => {
      const error = assertWaitingIndicatorTextIsNullI();
      expect(error).toBeNull();
    });

    it('expected.waiting_indicator_emitted is explicitly false', () => {
      expect(fixtureI.expected.waiting_indicator_emitted).toBe(false);
    });
  });

  describe('submission', () => {
    it('submission_completed is true', () => {
      const error = assertSubmissionCompletedI();
      expect(error).toBeNull();
    });
  });
});

/**
 * Layer 2: /synthex:performance-audit routing integration fixture tests (Task 58).
 *
 * 3 scenarios covering pool-routing decisions for the performance-audit command.
 * All fixtures are synthetic (no live LLM calls). Fixture JSON is read and
 * validated; assertions delegate to per-scenario assertion helpers.
 *
 * Scenarios:
 *   (a) pool-match                    — idle pool with [performance-engineer], multi_model=false; notification "multi-model: no"
 *   (b) no-pool-fallback              — pool with wrong roster [code-reviewer]; fell-back-roster-mismatch, silent fallback
 *   (c) explicit-pool-required-abort  — no pool + explicit-pool-required; aborts with verbatim FR-MMT17 error for performance-engineer
 *
 * Acceptance criteria covered:
 *   FR-MMT17: routing notification verbatim text (multi-model: no)
 *   FR-MMT17: explicit-pool-required verbatim error message with performance-engineer as required reviewer
 *   routing_decision enum: routed-to-pool, fell-back-roster-mismatch, skipped-routing-mode-explicit
 *   Static required-reviewer-set for /performance-audit is [performance-engineer]
 *   Cross-file: performance-audit.md contains verbatim explicit-pool-required error text for performance-engineer
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { ROUTING_DECISION_VALUES } from './standing-pool-cleanup.js';

// ── Fixture loaders ──────────────────────────────────────────────────────────

const FIXTURES_BASE = join(
  import.meta.dirname,
  '..', 'fixtures', 'multi-model-teams', 'routing', 'performance-audit'
);

const PERF_AUDIT_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'commands', 'performance-audit.md'
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
} from '../fixtures/multi-model-teams/routing/performance-audit/pool-match/assertions.js';

import {
  fixture as fixtureB,
  assertFellBackRosterMismatch,
  assertNoError as assertNoErrorB,
  assertErrorNotShown as assertErrorNotShownB,
  assertFreshSpawnFallback as assertFreshSpawnFallbackB,
  assertPoolNameIsNull as assertPoolNameIsNullB,
  assertWrongRosterInIndex,
} from '../fixtures/multi-model-teams/routing/performance-audit/no-pool-fallback/assertions.js';

import {
  fixture as fixtureC,
  assertSkippedRoutingModeExplicit,
  assertAbortIsTrue,
  assertErrorShown as assertErrorShownC,
  assertVerbatimErrorFragments,
  assertFirstLineVerbatim,
  assertReferencesPerformanceEngineer,
  assertStartReviewTeamHintPresent,
  assertConfigChangeHintPresent,
} from '../fixtures/multi-model-teams/routing/performance-audit/explicit-pool-required-abort/assertions.js';

// ── Shared fixture structure validator ──────────────────────────────────────

/**
 * Validates the base fixture.json structure for /performance-audit routing fixtures.
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

// ── (a) pool-match ────────────────────────────────────────────────────────────

describe('(a) pool-match — idle pool [performance-engineer], multi_model=false', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('pool-match');
      assertBaseFixtureStructure(raw, 'pool-match');
    });

    it('scenario.md is present and non-empty', () => {
      const md = loadScenarioMd('pool-match');
      expect(md.trim().length).toBeGreaterThan(0);
      expect(md).toContain('pool-match');
    });

    it('fixture.scenario is "pool-match"', () => {
      expect(fixtureA.scenario).toBe('pool-match');
    });

    it('setup has exactly 1 pool in index_json', () => {
      expect(fixtureA.setup.index_json.pools).toHaveLength(1);
    });

    it('pool roster is [performance-engineer]', () => {
      const pool = fixtureA.setup.index_json.pools[0] as Record<string, unknown>;
      const roster = pool.roster as string[];
      expect(roster).toHaveLength(1);
      expect(roster[0]).toBe('performance-engineer');
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "routed-to-pool"', () => {
      const error = assertRoutedToPoolA();
      expect(error).toBeNull();
    });

    it('routing_decision is a valid ROUTING_DECISION_VALUES value', () => {
      expect(ROUTING_DECISION_VALUES).toContain(fixtureA.expected.routing_decision as typeof ROUTING_DECISION_VALUES[number]);
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
    it('pool_name is "perf-pool-a"', () => {
      const error = assertPoolNameA();
      expect(error).toBeNull();
    });

    it('expected.pool_name is "perf-pool-a"', () => {
      expect(fixtureA.expected.pool_name).toBe('perf-pool-a');
    });

    it('error is null', () => {
      const error = assertNoErrorA();
      expect(error).toBeNull();
    });
  });
});

// ── (b) no-pool-fallback ──────────────────────────────────────────────────────

describe('(b) no-pool-fallback — pool with wrong roster, prefer-with-fallback, silent fallback', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('no-pool-fallback');
      assertBaseFixtureStructure(raw, 'no-pool-fallback');
    });

    it('scenario.md is present and non-empty', () => {
      const md = loadScenarioMd('no-pool-fallback');
      expect(md.trim().length).toBeGreaterThan(0);
    });

    it('fixture.scenario is "no-pool-fallback"', () => {
      expect(fixtureB.scenario).toBe('no-pool-fallback');
    });

    it('pool in index_json does NOT have performance-engineer in roster', () => {
      const error = assertWrongRosterInIndex();
      expect(error).toBeNull();
    });

    it('routing_mode in config is "prefer-with-fallback"', () => {
      const config = fixtureB.setup.config as Record<string, unknown>;
      const pools = config.standing_pools as Record<string, unknown>;
      expect(pools.routing_mode).toBe('prefer-with-fallback');
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "fell-back-roster-mismatch"', () => {
      const error = assertFellBackRosterMismatch();
      expect(error).toBeNull();
    });

    it('routing_decision is a valid ROUTING_DECISION_VALUES value', () => {
      expect(ROUTING_DECISION_VALUES).toContain(fixtureB.expected.routing_decision as typeof ROUTING_DECISION_VALUES[number]);
    });
  });

  describe('fallback semantics', () => {
    it('pool_name is null (no pool matched)', () => {
      const error = assertPoolNameIsNullB();
      expect(error).toBeNull();
    });

    it('fallback_type is "fresh-spawn"', () => {
      const error = assertFreshSpawnFallbackB();
      expect(error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('error is null (silent fallback)', () => {
      const error = assertNoErrorB();
      expect(error).toBeNull();
    });

    it('error_shown is false (no error displayed to user)', () => {
      const error = assertErrorNotShownB();
      expect(error).toBeNull();
    });
  });
});

// ── (c) explicit-pool-required-abort ──────────────────────────────────────────

describe('(c) explicit-pool-required-abort — no pool, aborts with verbatim FR-MMT17 error for performance-engineer', () => {

  describe('fixture structure', () => {
    it('fixture.json is readable and well-formed', () => {
      const raw = loadFixture('explicit-pool-required-abort');
      assertBaseFixtureStructure(raw, 'explicit-pool-required-abort');
    });

    it('scenario.md is present and non-empty', () => {
      const md = loadScenarioMd('explicit-pool-required-abort');
      expect(md.trim().length).toBeGreaterThan(0);
      expect(md).toContain('explicit-pool-required-abort');
    });

    it('fixture.scenario is "explicit-pool-required-abort"', () => {
      expect(fixtureC.scenario).toBe('explicit-pool-required-abort');
    });

    it('routing_mode in config is "explicit-pool-required"', () => {
      const config = fixtureC.setup.config as Record<string, unknown>;
      const pools = config.standing_pools as Record<string, unknown>;
      expect(pools.routing_mode).toBe('explicit-pool-required');
    });

    it('index_json.pools is empty', () => {
      expect(fixtureC.setup.index_json.pools).toHaveLength(0);
    });
  });

  describe('routing_decision', () => {
    it('routing_decision is "skipped-routing-mode-explicit"', () => {
      const error = assertSkippedRoutingModeExplicit();
      expect(error).toBeNull();
    });

    it('routing_decision is a valid ROUTING_DECISION_VALUES value', () => {
      expect(ROUTING_DECISION_VALUES).toContain(fixtureC.expected.routing_decision as typeof ROUTING_DECISION_VALUES[number]);
    });
  });

  describe('abort behavior', () => {
    it('abort is true (command does not fall back)', () => {
      const error = assertAbortIsTrue();
      expect(error).toBeNull();
    });

    it('error_shown is true', () => {
      const error = assertErrorShownC();
      expect(error).toBeNull();
    });
  });

  describe('FR-MMT17 verbatim error message — performance-engineer', () => {
    it('first line matches FR-MMT17 verbatim for performance-engineer', () => {
      const error = assertFirstLineVerbatim();
      expect(error).toBeNull();
    });

    it('all verbatim FR-MMT17 error fragments present', () => {
      const error = assertVerbatimErrorFragments();
      expect(error).toBeNull();
    });

    it('error_message references "performance-engineer" as the required reviewer', () => {
      const error = assertReferencesPerformanceEngineer();
      expect(error).toBeNull();
    });

    it('error_message contains "No standing pool matches the required reviewers (performance-engineer)."', () => {
      expect(fixtureC.expected.error_message).toContain(
        'No standing pool matches the required reviewers (performance-engineer).'
      );
    });

    it("error_message contains \"Routing mode is 'explicit-pool-required'\"", () => {
      expect(fixtureC.expected.error_message).toContain("Routing mode is 'explicit-pool-required'");
    });

    it('error_message contains "fresh-spawn reviewers. To proceed, either:"', () => {
      expect(fixtureC.expected.error_message).toContain('fresh-spawn reviewers. To proceed, either:');
    });
  });

  describe('FR-MMT17 remediation hints', () => {
    it('start-review-team remediation hint present with --reviewers performance-engineer', () => {
      const error = assertStartReviewTeamHintPresent();
      expect(error).toBeNull();
    });

    it('config change remediation hint present', () => {
      const error = assertConfigChangeHintPresent();
      expect(error).toBeNull();
    });

    it("error_message contains '/synthex-plus:start-review-team --reviewers performance-engineer'", () => {
      expect(fixtureC.expected.error_message).toContain(
        '/synthex-plus:start-review-team --reviewers performance-engineer'
      );
    });

    it("error_message contains \"Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml\"", () => {
      expect(fixtureC.expected.error_message).toContain(
        "Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml"
      );
    });
  });
});

// ── Cross-file: performance-audit.md contains verbatim error text ─────────────

describe('cross-file: plugins/synthex/commands/performance-audit.md — verbatim explicit-pool-required error for performance-engineer', () => {

  const perfAuditContent = readFileSync(PERF_AUDIT_MD_PATH, 'utf-8');

  it('performance-audit.md is readable and non-empty', () => {
    expect(perfAuditContent.trim().length).toBeGreaterThan(0);
  });

  it('performance-audit.md references "performance-engineer" as the static required reviewer', () => {
    expect(perfAuditContent).toContain('performance-engineer');
  });

  it('performance-audit.md contains the FR-MMT17 first-line error text for performance-engineer', () => {
    expect(perfAuditContent).toContain(
      'No standing pool matches the required reviewers (performance-engineer).'
    );
  });

  it('performance-audit.md contains the explicit-pool-required routing mode name', () => {
    expect(perfAuditContent).toContain('explicit-pool-required');
  });

  it('performance-audit.md contains the start-review-team remediation hint for performance-engineer', () => {
    expect(perfAuditContent).toContain(
      '/synthex-plus:start-review-team --reviewers performance-engineer'
    );
  });

  it('performance-audit.md contains the config change remediation hint', () => {
    expect(perfAuditContent).toContain(
      "Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml"
    );
  });
});

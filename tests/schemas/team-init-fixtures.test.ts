/**
 * Layer 2: Fixture validation tests for team-init FR-MMT27 (5 scenarios).
 *
 * Tests the fixture.json files under tests/fixtures/multi-model-teams/init/
 * and performs cross-file string-presence checks against team-init.md to
 * confirm FR-MMT27 acceptance criteria are met.
 *
 * Scenarios covered:
 *   (a) skip-both                              — both prompts skipped; no config written
 *   (b) enable-standing-pools-skip-multi-model — pools enabled; multi-model skipped
 *   (c) enable-both                            — both features enabled
 *   (d) non-interactive-tty-false              — CI mode: auto-skip, non-blocking
 *   (e) interactive-default-enter              — empty Enter treated as Skip
 *
 * Cross-file checks verify team-init.md contains FR-MMT27-mandated text.
 *
 * Cost: $0 (no LLM calls — pure file parsing)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

// ── Fixture loader helpers ───────────────────────────────────────

const FIXTURES_DIR = resolve(
  __dirname,
  '../fixtures/multi-model-teams/init',
);

function loadFixture(name: string): Record<string, unknown> {
  const filePath = resolve(FIXTURES_DIR, name, 'fixture.json');
  return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
}

// ── Load all 5 fixtures ──────────────────────────────────────────

let skipBoth: Record<string, unknown>;
let enablePoolsSkipMultiModel: Record<string, unknown>;
let enableBoth: Record<string, unknown>;
let nonInteractiveTtyFalse: Record<string, unknown>;
let interactiveDefaultEnter: Record<string, unknown>;

let teamInitContent: string;

beforeAll(() => {
  skipBoth = loadFixture('skip-both');
  enablePoolsSkipMultiModel = loadFixture(
    'enable-standing-pools-skip-multi-model',
  );
  enableBoth = loadFixture('enable-both');
  nonInteractiveTtyFalse = loadFixture('non-interactive-tty-false');
  interactiveDefaultEnter = loadFixture('interactive-default-enter');

  const teamInitPath = resolve(
    __dirname,
    '../../plugins/synthex-plus/commands/team-init.md',
  );
  teamInitContent = readFileSync(teamInitPath, 'utf-8');
});

// ── Shared: scenario field non-empty ────────────────────────────

describe('team-init init fixtures — scenario field validation', () => {
  const scenarioNames = [
    'skip-both',
    'enable-standing-pools-skip-multi-model',
    'enable-both',
    'non-interactive-tty-false',
    'interactive-default-enter',
  ];

  for (const name of scenarioNames) {
    it(`fixture "${name}" has a non-empty scenario field`, () => {
      const fixture = loadFixture(name);
      expect(typeof fixture.scenario).toBe('string');
      expect((fixture.scenario as string).length).toBeGreaterThan(0);
    });
  }
});

// ── Scenario (a): skip-both ──────────────────────────────────────

describe('team-init init fixture (a): skip-both', () => {
  it('has scenario field "skip-both"', () => {
    expect(skipBoth.scenario).toBe('skip-both');
  });

  it('expected.standing_pools_enabled_written is false', () => {
    const expected = skipBoth.expected as Record<string, unknown>;
    expect(expected.standing_pools_enabled_written).toBe(false);
  });

  it('expected.multi_model_team_review_enabled_written is false', () => {
    const expected = skipBoth.expected as Record<string, unknown>;
    expect(expected.multi_model_team_review_enabled_written).toBe(false);
  });

  it('expected.config_keys_added is an empty array', () => {
    const expected = skipBoth.expected as Record<string, unknown>;
    expect(expected.config_keys_added).toEqual([]);
  });

  it('expected.step9_pool_commands_shown is false', () => {
    const expected = skipBoth.expected as Record<string, unknown>;
    expect(expected.step9_pool_commands_shown).toBe(false);
  });
});

// ── Scenario (b): enable-standing-pools-skip-multi-model ─────────

describe('team-init init fixture (b): enable-standing-pools-skip-multi-model', () => {
  it('has correct scenario field', () => {
    expect(enablePoolsSkipMultiModel.scenario).toBe(
      'enable-standing-pools-skip-multi-model',
    );
  });

  it('expected.standing_pools_enabled_written is true', () => {
    const expected = enablePoolsSkipMultiModel.expected as Record<
      string,
      unknown
    >;
    expect(expected.standing_pools_enabled_written).toBe(true);
  });

  it('expected.routing_mode_written is "prefer-with-fallback"', () => {
    const expected = enablePoolsSkipMultiModel.expected as Record<
      string,
      unknown
    >;
    expect(expected.routing_mode_written).toBe('prefer-with-fallback');
  });

  it('expected.pool_spawned_at_init is false (FR-MMT27 criterion 3)', () => {
    const expected = enablePoolsSkipMultiModel.expected as Record<
      string,
      unknown
    >;
    expect(expected.pool_spawned_at_init).toBe(false);
  });

  it('expected.multi_model_team_review_enabled_written is false', () => {
    const expected = enablePoolsSkipMultiModel.expected as Record<
      string,
      unknown
    >;
    expect(expected.multi_model_team_review_enabled_written).toBe(false);
  });

  it('expected.step9_pool_commands_shown is true', () => {
    const expected = enablePoolsSkipMultiModel.expected as Record<
      string,
      unknown
    >;
    expect(expected.step9_pool_commands_shown).toBe(true);
  });

  it('step9_commands contains all 3 pool management commands', () => {
    const expected = enablePoolsSkipMultiModel.expected as Record<
      string,
      unknown
    >;
    const commands = expected.step9_commands as string[];
    expect(commands).toContain('/synthex-plus:start-review-team');
    expect(commands).toContain('/synthex-plus:stop-review-team');
    expect(commands).toContain('/synthex-plus:list-teams');
    expect(commands).toHaveLength(3);
  });
});

// ── Scenario (c): enable-both ────────────────────────────────────

describe('team-init init fixture (c): enable-both', () => {
  it('has scenario field "enable-both"', () => {
    expect(enableBoth.scenario).toBe('enable-both');
  });

  it('expected.standing_pools_enabled_written is true', () => {
    const expected = enableBoth.expected as Record<string, unknown>;
    expect(expected.standing_pools_enabled_written).toBe(true);
  });

  it('expected.multi_model_team_review_enabled_written is true', () => {
    const expected = enableBoth.expected as Record<string, unknown>;
    expect(expected.multi_model_team_review_enabled_written).toBe(true);
  });

  it('expected.pool_spawned_at_init is false (FR-MMT27 criterion 3)', () => {
    const expected = enableBoth.expected as Record<string, unknown>;
    expect(expected.pool_spawned_at_init).toBe(false);
  });

  it('expected.multi_model_prerequisite_notice_shown is true', () => {
    const expected = enableBoth.expected as Record<string, unknown>;
    expect(expected.multi_model_prerequisite_notice_shown).toBe(true);
  });

  it('config_keys_added contains both standing_pools.enabled and multi_model_review key', () => {
    const expected = enableBoth.expected as Record<string, unknown>;
    const keys = expected.config_keys_added as string[];
    expect(keys).toContain('standing_pools.enabled');
    expect(keys).toContain(
      'multi_model_review.per_command.team_review.enabled',
    );
  });

  it('step9_commands contains all 3 pool management commands', () => {
    const expected = enableBoth.expected as Record<string, unknown>;
    const commands = expected.step9_commands as string[];
    expect(commands).toContain('/synthex-plus:start-review-team');
    expect(commands).toContain('/synthex-plus:stop-review-team');
    expect(commands).toContain('/synthex-plus:list-teams');
  });
});

// ── Scenario (d): non-interactive-tty-false ──────────────────────

describe('team-init init fixture (d): non-interactive-tty-false', () => {
  it('has scenario field "non-interactive-tty-false"', () => {
    expect(nonInteractiveTtyFalse.scenario).toBe('non-interactive-tty-false');
  });

  it('environment.tty is false', () => {
    const env = nonInteractiveTtyFalse.environment as Record<string, unknown>;
    expect(env.tty).toBe(false);
  });

  it('expected.auto_skip_applied is true', () => {
    const expected = nonInteractiveTtyFalse.expected as Record<string, unknown>;
    expect(expected.auto_skip_applied).toBe(true);
  });

  it('expected.blocking is false', () => {
    const expected = nonInteractiveTtyFalse.expected as Record<string, unknown>;
    expect(expected.blocking).toBe(false);
  });

  it('expected.standing_pools_enabled_written is false', () => {
    const expected = nonInteractiveTtyFalse.expected as Record<string, unknown>;
    expect(expected.standing_pools_enabled_written).toBe(false);
  });

  it('expected.multi_model_team_review_enabled_written is false', () => {
    const expected = nonInteractiveTtyFalse.expected as Record<string, unknown>;
    expect(expected.multi_model_team_review_enabled_written).toBe(false);
  });

  it('expected.config_keys_added is empty', () => {
    const expected = nonInteractiveTtyFalse.expected as Record<string, unknown>;
    expect(expected.config_keys_added).toEqual([]);
  });
});

// ── Scenario (e): interactive-default-enter ──────────────────────

describe('team-init init fixture (e): interactive-default-enter', () => {
  it('has scenario field "interactive-default-enter"', () => {
    expect(interactiveDefaultEnter.scenario).toBe('interactive-default-enter');
  });

  it('expected.standing_pools_enabled_written is false (Enter = Skip)', () => {
    const expected = interactiveDefaultEnter.expected as Record<string, unknown>;
    expect(expected.standing_pools_enabled_written).toBe(false);
  });

  it('expected.multi_model_team_review_enabled_written is false (Enter = Skip)', () => {
    const expected = interactiveDefaultEnter.expected as Record<string, unknown>;
    expect(expected.multi_model_team_review_enabled_written).toBe(false);
  });

  it('expected.config_keys_added is empty', () => {
    const expected = interactiveDefaultEnter.expected as Record<string, unknown>;
    expect(expected.config_keys_added).toEqual([]);
  });

  it('expected.step9_pool_commands_shown is false', () => {
    const expected = interactiveDefaultEnter.expected as Record<string, unknown>;
    expect(expected.step9_pool_commands_shown).toBe(false);
  });
});

// ── Cross-file: team-init.md string-presence checks ─────────────

describe('team-init.md — cross-file FR-MMT27 string-presence checks', () => {
  it('contains "Enable / Skip" prompt format', () => {
    expect(teamInitContent).toContain('Enable / Skip');
  });

  it('contains "standing_pools.enabled: true"', () => {
    expect(teamInitContent).toContain('standing_pools.enabled: true');
  });

  it('contains a no-spawn-at-init instruction (FR-MMT27 criterion 3)', () => {
    const hasNoSpawn =
      teamInitContent.includes('pool_spawned_at_init') ||
      teamInitContent.includes('Do NOT spawn') ||
      teamInitContent.includes('do not spawn');
    expect(hasNoSpawn).toBe(true);
  });

  it('contains /synthex-plus:start-review-team with verbatim description', () => {
    expect(teamInitContent).toContain('/synthex-plus:start-review-team');
    expect(teamInitContent).toContain(
      'Start a standing review pool (keeps reviewers warm between reviews)',
    );
  });

  it('contains /synthex-plus:stop-review-team with verbatim description', () => {
    expect(teamInitContent).toContain('/synthex-plus:stop-review-team');
    expect(teamInitContent).toContain(
      'Stop a running pool (graceful shutdown with drain)',
    );
  });

  it('contains /synthex-plus:list-teams with verbatim description', () => {
    expect(teamInitContent).toContain('/synthex-plus:list-teams');
    expect(teamInitContent).toContain(
      'View all active pools and their status',
    );
  });
});

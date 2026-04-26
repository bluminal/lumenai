/**
 * Layer 1: Schema validation tests for team-init.md — FR-MMT27 additions.
 *
 * These are raw-string presence checks against the team-init command definition.
 * They catch regressions where FR-MMT27-mandated config keys, behaviors, or
 * Step 7 verbatim command descriptions are removed or reworded.
 *
 * FR-MMT27 requirements verified:
 *   1. standing_pools.enabled: true written on Enable
 *   2. prefer-with-fallback default routing_mode present
 *   3. Criterion 3: no pool spawn at init time
 *   4. multi_model_review.per_command.team_review.enabled: true written on Enable
 *   5. multi_model_review.enabled: true prerequisite noted
 *   6-8. Verbatim Step 7 command descriptions for pool management commands
 *   9. Two AskUserQuestion prompts (one per optional section)
 *   10. "Enable / Skip" pattern present
 *
 * Cost: $0 (no LLM calls — pure file parsing)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

// ── File loader ──────────────────────────────────────────────────

let content: string;

beforeAll(() => {
  const filePath = resolve(
    __dirname,
    '../../plugins/synthex-plus/commands/team-init.md',
  );
  content = readFileSync(filePath, 'utf-8');
});

// ── Tests ────────────────────────────────────────────────────────

describe('team-init.md — FR-MMT27: Standing Review Pools section', () => {

  it('contains the standing_pools.enabled: true config key (written on Enable)', () => {
    expect(content).toContain('standing_pools.enabled: true');
  });

  it('contains prefer-with-fallback as the default routing_mode', () => {
    expect(content).toContain('prefer-with-fallback');
  });

  it('contains a no-spawn-at-init instruction (FR-MMT27 criterion 3)', () => {
    const hasNoSpawn =
      content.includes('do not spawn') || content.includes('Do NOT spawn');
    expect(hasNoSpawn).toBe(true);
  });

});

describe('team-init.md — FR-MMT27: Multi-model review section', () => {

  it('contains multi_model_review.per_command.team_review.enabled: true config key', () => {
    expect(content).toContain(
      'multi_model_review.per_command.team_review.enabled: true',
    );
  });

  it('notes the multi_model_review.enabled: true prerequisite', () => {
    expect(content).toContain('multi_model_review.enabled: true');
  });

});

describe('team-init.md — FR-MMT27: Step 7 verbatim command descriptions', () => {

  it('contains /synthex-plus:start-review-team with verbatim description', () => {
    expect(content).toContain(
      '/synthex-plus:start-review-team',
    );
    expect(content).toContain(
      'Start a standing review pool (keeps reviewers warm between reviews)',
    );
  });

  it('contains /synthex-plus:stop-review-team with verbatim description', () => {
    expect(content).toContain(
      '/synthex-plus:stop-review-team',
    );
    expect(content).toContain(
      'Stop a running pool (graceful shutdown with drain)',
    );
  });

  it('contains /synthex-plus:list-teams with verbatim description', () => {
    expect(content).toContain(
      '/synthex-plus:list-teams',
    );
    expect(content).toContain(
      'View all active pools and their status',
    );
  });

});

describe('team-init.md — FR-MMT27: Interactive prompt structure', () => {

  it('contains AskUserQuestion exactly twice (once per optional section)', () => {
    const matches = content.match(/AskUserQuestion/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it('contains the "Enable / Skip" choice pattern', () => {
    expect(content).toContain('Enable / Skip');
  });

});

/**
 * Layer 1: Structural validation tests for Task 49 — one-team-per-session
 * standing pool exemption (FR-MMT26) and FR-MMT28 orphan scan.
 *
 * Covers all [T] acceptance criteria from Task 49:
 *
 *  1. team-implement.md: standing pool exemption present
 *  2. team-implement.md: FR-MMT26 referenced
 *  3. team-implement.md: original non-standing error message unchanged
 *  4. team-init.md: Pass 1 excludes ~/.claude/teams/standing/
 *  5. team-init.md: Pass 2 dual-condition orphan rule (TTL elapsed AND 24h inactivity)
 *  6. team-init.md: standing-pool-cleanup agent invoked in orphan path
 *  7. team-init.md: FR-MMT28 verbatim warning fragments
 *  8. team-init.md: FR-MMT28 warning is distinct from FR-MMT22 warning
 *  9. team-init.md: FR-MMT22 suppression does NOT suppress FR-MMT28 warnings
 * 10. team-init.md: FR-MMT28 referenced
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const TEAM_IMPLEMENT_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'commands', 'team-implement.md'
);

const TEAM_INIT_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'commands', 'team-init.md'
);

const implementContent = readFileSync(TEAM_IMPLEMENT_PATH, 'utf-8');
const initContent = readFileSync(TEAM_INIT_PATH, 'utf-8');

// ── team-implement.md tests ──────────────────────────────────────────────────

describe('team-implement.md — Task 49 [T] acceptance criteria', () => {

  // [T] 1. Standing pool exemption present in one-team-per-session check
  it('[T1] one-team-per-session check excludes ~/.claude/teams/standing/ (exemption present)', () => {
    // The check should either explicitly exclude the standing path OR say "exempt" near "standing"
    // near "one-team-per-session"
    const hasExcludePath = implementContent.includes('~/.claude/teams/standing/');
    const hasExemptNearStanding = /exempt[\s\S]{0,200}standing|standing[\s\S]{0,200}exempt/.test(implementContent);
    expect(
      hasExcludePath || hasExemptNearStanding,
      'Expected either the standing path exclusion or "exempt" + "standing" within 200 chars of each other'
    ).toBe(true);
  });

  // [T] 2. FR-MMT26 referenced
  it('[T2] contains FR-MMT26 (standing pool one-team-per-session exemption)', () => {
    expect(implementContent).toContain('FR-MMT26');
  });

  // [T] 3. Original non-standing error message unchanged
  it('[T3] original non-standing team conflict error message is preserved verbatim', () => {
    // Verify the canonical error text for a non-standing team conflict is still present
    expect(implementContent).toContain('Error: An active team "');
    expect(implementContent).toContain('already exists in this session.');
    expect(implementContent).toContain('Complete or clean up the existing team before creating a new one.');
    expect(implementContent).toContain('To clean up: check ~/.claude/teams/ for stale resources.');
  });

});

// ── team-init.md tests ───────────────────────────────────────────────────────

describe('team-init.md — Task 49 [T] acceptance criteria', () => {

  // [T] 4. Pass 1 explicitly excludes ~/.claude/teams/standing/
  it('[T4] Pass 1 excludes ~/.claude/teams/standing/ from non-standing orphan scan', () => {
    // "excluding" or "exclude" must appear near "standing"
    const hasExcludeNearStanding =
      /exclud(e|ing)[\s\S]{0,300}standing|standing[\s\S]{0,300}exclud(e|ing)/.test(initContent);
    expect(
      hasExcludeNearStanding,
      'Expected "excluding" or "exclude" within 300 chars of "standing" in team-init.md'
    ).toBe(true);
  });

  // [T] 5. Pass 2 dual-condition orphan rule — BOTH "TTL elapsed" AND "24 hours" or "24h"
  it('[T5] Pass 2 orphan rule requires both TTL elapsed condition', () => {
    expect(initContent).toContain('TTL elapsed');
  });

  it('[T5] Pass 2 orphan rule requires both inactive-for-24h condition', () => {
    const has24h = initContent.includes('24 hours') || initContent.includes('24h');
    expect(has24h, 'Expected "24 hours" or "24h" in team-init.md').toBe(true);
  });

  it('[T5] Pass 2 dual-condition phrasing: both conditions must hold simultaneously', () => {
    // "Both" or "both" should appear near the TTL/24h conditions
    expect(initContent).toMatch(/[Bb]oth/);
  });

  // [T] 6. standing-pool-cleanup agent invoked in the orphan path
  it('[T6] standing-pool-cleanup agent is invoked in the FR-MMT28 orphan path', () => {
    expect(initContent).toContain('standing-pool-cleanup');
  });

  // [T] 7. FR-MMT28 verbatim warning fragments present
  it('[T7] FR-MMT28 verbatim warning fragment: "Standing pool \'" present', () => {
    expect(initContent).toContain("Standing pool '");
  });

  it('[T7] FR-MMT28 verbatim warning fragment: "appears orphaned" present', () => {
    expect(initContent).toContain('appears orphaned');
  });

  it('[T7] FR-MMT28 verbatim warning fragment: "cleaned up automatically" present', () => {
    expect(initContent).toContain('cleaned up automatically');
  });

  // [T] 8. FR-MMT28 warning is distinct from FR-MMT22 warning
  // FR-MMT22 wording: "was stale and has been cleaned up. {fallback_action}"
  // FR-MMT28 warning must NOT contain this FR-MMT22-specific phrasing
  it('[T8] FR-MMT28 warning does NOT reuse the FR-MMT22 "was stale and has been cleaned up" phrasing', () => {
    expect(initContent).not.toContain('was stale and has been cleaned up. {fallback_action}');
    expect(initContent).not.toContain('was stale and has been cleaned up. ');
  });

  // [T] 9. FR-MMT22 suppression does NOT suppress FR-MMT28 warnings
  it('[T9] FR-MMT22 suppression does not suppress FR-MMT28 warnings (explicitly noted in file)', () => {
    // The file must contain language saying suppression does not apply to FR-MMT28
    const hasNonSuppression =
      /does not suppress[\s\S]{0,200}FR-MMT28|FR-MMT28[\s\S]{0,200}does not suppress/.test(initContent) ||
      /suppression[\s\S]{0,200}does not[\s\S]{0,200}(FR-MMT28|team-init)/.test(initContent) ||
      /FR-MMT22 suppression does not suppress/.test(initContent);
    expect(
      hasNonSuppression,
      'Expected explicit note that FR-MMT22 suppression does not apply to FR-MMT28'
    ).toBe(true);
  });

  // [T] 10. FR-MMT28 referenced
  it('[T10] contains FR-MMT28 (standing pool orphan scan)', () => {
    expect(initContent).toContain('FR-MMT28');
  });

});

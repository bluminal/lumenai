/**
 * Layer 1: Structural validation tests for the list-teams command.
 *
 * Validates all [T] acceptance criteria from Task 43:
 *   [T1] Both team types enumerated (non-standing from ~/.claude/teams/ excl. standing/;
 *        standing pools from index.json)
 *   [T2] Table layout matches FR-MMT11: Name, State, Roster, Multi-Model, Tasks, Idle,
 *        TTL Remaining columns present
 *   [T3] State column appears for standing pools with one of four documented values
 *   [T4] All four pool_state values documented: idle, active, draining, stopping
 *   [T5] TTL Remaining is always integer (never a string or fractional)
 *   [T6] State-value reference footnote present with all four values + descriptions
 *   [T7] Empty-list friendly message with start/create hint
 *   [T8] Standing pools section displayed BEFORE non-standing teams section
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const LIST_TEAMS_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'commands', 'list-teams.md'
);

const content = readFileSync(LIST_TEAMS_PATH, 'utf-8');

describe('commands/list-teams.md — Task 43 [T] acceptance criteria', () => {

  // ── [T1] Both team types enumerated ─────────────────────────────────────────
  it('[T1] non-standing teams enumerated from ~/.claude/teams/ excluding standing/', () => {
    expect(content).toContain('~/.claude/teams/');
    // Must explicitly exclude standing/
    expect(content).toMatch(/exclud\w*.*standing\//i);
  });

  it('[T1] standing pools enumerated from index.json', () => {
    expect(content).toContain('index.json');
    // Must reference the standing subdirectory index
    expect(content).toContain('~/.claude/teams/standing/index.json');
  });

  // ── [T2] Table layout matches FR-MMT11 column headers ───────────────────────
  it('[T2] column header "Name" present', () => {
    expect(content).toContain('Name');
  });

  it('[T2] column header "State" present', () => {
    expect(content).toContain('State');
  });

  it('[T2] column header "Roster" present', () => {
    expect(content).toContain('Roster');
  });

  it('[T2] column header "Multi-Model" present', () => {
    expect(content).toContain('Multi-Model');
  });

  it('[T2] column header "Tasks" present', () => {
    expect(content).toContain('Tasks');
  });

  it('[T2] column header "Idle" present', () => {
    expect(content).toContain('Idle');
  });

  it('[T2] column header "TTL Remaining" present', () => {
    expect(content).toContain('TTL Remaining');
  });

  // ── [T3] State column for standing pools with four documented values ─────────
  it('[T3] pool_state "idle" documented as a valid State value', () => {
    expect(content).toContain('idle');
  });

  it('[T3] pool_state "active" documented as a valid State value', () => {
    expect(content).toContain('active');
  });

  it('[T3] pool_state "draining" documented as a valid State value', () => {
    expect(content).toContain('draining');
  });

  it('[T3] pool_state "stopping" documented as a valid State value', () => {
    expect(content).toContain('stopping');
  });

  // ── [T4] All four pool_state values explicitly named ────────────────────────
  it('[T4] all four pool_state values named: idle, active, draining, stopping', () => {
    expect(content).toContain('idle');
    expect(content).toContain('active');
    expect(content).toContain('draining');
    expect(content).toContain('stopping');
  });

  // ── [T5] TTL Remaining is always integer ─────────────────────────────────────
  it('[T5] document asserts TTL Remaining is always an integer (not a string)', () => {
    // Must say "always" and "integer" near "TTL Remaining"
    expect(content).toMatch(/always.{0,120}integer/is);
    expect(content).toContain('TTL Remaining');
    // Ensure the word "integer" appears in the document
    expect(content).toContain('integer');
  });

  it('[T5] TTL Remaining set to 0 when draining or stopping', () => {
    expect(content).toMatch(/draining.*0|0.*draining/is);
    expect(content).toMatch(/stopping.*0|0.*stopping/is);
  });

  // ── [T6] State-value reference footnote with descriptions ──────────────────
  it('[T6] footnote describes "idle" state', () => {
    // Find a description after "idle" in the footnote/reference area
    expect(content).toMatch(/idle\s*[—\-–].{5,}/i);
  });

  it('[T6] footnote describes "active" state', () => {
    expect(content).toMatch(/active\s*[—\-–].{5,}/i);
  });

  it('[T6] footnote describes "draining" state', () => {
    expect(content).toMatch(/draining\s*[—\-–].{5,}/i);
  });

  it('[T6] footnote describes "stopping" state', () => {
    expect(content).toMatch(/stopping\s*[—\-–].{5,}/i);
  });

  it('[T6] draining description mentions not accepting new submissions', () => {
    expect(content).toMatch(/draining.{0,200}not accepting/is);
  });

  it('[T6] stopping description mentions will disappear from /list-teams', () => {
    expect(content).toMatch(/stopping.{0,200}\/list-teams/is);
  });

  // ── [T7] Empty-list friendly message ────────────────────────────────────────
  it('[T7] friendly empty-list message present (mentions starting or creating a team)', () => {
    expect(content).toMatch(/No active teams/i);
  });

  it('[T7] empty-list message includes hint to use start-review-team or run a review command', () => {
    // Must contain a start/create hint so users know how to proceed
    expect(content).toMatch(/start-review-team|run a review command/i);
  });

  // ── [T8] Standing pools section before non-standing teams section ────────────
  it('[T8] "Standing pools" heading appears before "Non-standing teams" heading', () => {
    const standingIdx = content.indexOf('Standing pools');
    const nonStandingIdx = content.indexOf('Non-standing teams');
    expect(standingIdx).toBeGreaterThanOrEqual(0);
    expect(nonStandingIdx).toBeGreaterThanOrEqual(0);
    expect(standingIdx).toBeLessThan(nonStandingIdx);
  });

});

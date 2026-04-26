/**
 * Layer 1: Structural validation tests for docs/specs/multi-model-teams/routing.md
 *
 * Validates that the routing normative skeleton satisfies all [T] acceptance criteria
 * from Task 31:
 *   - First line is exactly `## Status: Skeleton`
 *   - All required FR codes are present (FR-MMT15, FR-MMT16, FR-MMT16a, FR-MMT17,
 *     FR-MMT13, FR-MMT14a, FR-MMT18, FR-MMT22)
 *   - No literal `TODO` strings (case-sensitive)
 *   - Verbatim prefer-with-fallback notification text present
 *   - Verbatim FR-MMT16a timeout note substring present
 *   - Verbatim explicit-pool-required first-line present
 *   - Terminology: no standalone `Lead` / `team Lead` / `team-lead` outside `Pool Lead`
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROUTING_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'docs', 'specs', 'multi-model-teams', 'routing.md'
);

const content = readFileSync(ROUTING_MD_PATH, 'utf-8');
const lines = content.split('\n');

describe('routing.md — Task 31 [T] acceptance criteria', () => {

  // ── [T] `## Status: Skeleton` header at top ──────────────────────────────
  it('[T] first line is exactly "## Status: Skeleton"', () => {
    expect(lines[0]).toBe('## Status: Skeleton');
  });

  // ── [T] All FR-MMT references accurate ───────────────────────────────────
  it('[T] contains FR-MMT15 (discovery procedure)', () => {
    expect(content).toContain('FR-MMT15');
  });

  it('[T] contains FR-MMT16 (submission mechanism)', () => {
    expect(content).toContain('FR-MMT16');
  });

  it('[T] contains FR-MMT16a (report envelope and polling timeout)', () => {
    expect(content).toContain('FR-MMT16a');
  });

  it('[T] contains FR-MMT17 (routing mode semantics)', () => {
    expect(content).toContain('FR-MMT17');
  });

  it('[T] contains FR-MMT13 (lazy TTL enforcement / stale-pool cleanup trigger)', () => {
    expect(content).toContain('FR-MMT13');
  });

  it('[T] contains FR-MMT14a (draining-state submission semantics)', () => {
    expect(content).toContain('FR-MMT14a');
  });

  it('[T] contains FR-MMT18 (race conditions)', () => {
    expect(content).toContain('FR-MMT18');
  });

  it('[T] contains FR-MMT22 (stale-pool cleanup)', () => {
    expect(content).toContain('FR-MMT22');
  });

  // ── [T] No TODO placeholders ──────────────────────────────────────────────
  it('[T] does not contain the literal string TODO (skeleton is complete)', () => {
    // Case-sensitive per task spec
    expect(content).not.toContain('TODO');
  });

  // ── [T] Verbatim prefer-with-fallback notification ────────────────────────
  it('[T] contains verbatim prefer-with-fallback notification text', () => {
    expect(content).toContain(
      "Routing to standing pool '{name}' (multi-model: {yes|no})."
    );
  });

  // ── [T] Verbatim FR-MMT16a timeout note substring ────────────────────────
  it('[T] contains verbatim FR-MMT16a timeout note substring "did not return a report within"', () => {
    expect(content).toContain('did not return a report within');
  });

  // ── [T] Verbatim explicit-pool-required first-line ────────────────────────
  it('[T] contains verbatim explicit-pool-required error first line', () => {
    expect(content).toContain(
      'No standing pool matches the required reviewers'
    );
  });

  // ── [T] Terminology: only "Pool Lead" — no bare Lead / team Lead / team-lead ──
  it('[T] no standalone "Lead" outside "Pool Lead" (terminology gate)', () => {
    // Remove all occurrences of "Pool Lead" and then check that "Lead" does not appear
    // as a standalone word. This catches bare "Lead", "team Lead", "team-lead".
    const withPoolLeadRemoved = content.replace(/Pool Lead/g, 'POOL_LEAD_PLACEHOLDER');
    // Match standalone Lead (word boundary on both sides, case-sensitive)
    const bareLeadMatches = withPoolLeadRemoved.match(/\bLead\b/g);
    expect(bareLeadMatches).toBeNull();
  });

  it('[T] no "team Lead" (verbatim two-word form without "Pool" prefix)', () => {
    expect(content).not.toMatch(/\bteam Lead\b/);
  });

  it('[T] no "team-lead" (hyphenated form)', () => {
    expect(content).not.toMatch(/\bteam-lead\b/);
  });

});

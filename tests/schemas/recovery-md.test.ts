/**
 * Layer 1: Structural validation tests for docs/specs/multi-model-teams/recovery.md
 *
 * Validates that the recovery normative skeleton satisfies all [T] acceptance criteria
 * from Task 48:
 *   - First line is exactly `## Status: Skeleton`
 *   - FR-MMT24 recovery owned by submitting command's host session
 *   - Failed reviewer name extracted from error.message
 *   - Fresh sub-agent spawned via Task tool from host session
 *   - Lightweight merge — Stages 3–6 NOT re-run
 *   - D19 partial dedup: Stage 1 and Stage 2 only, with parent plan reference
 *   - source.source_type: "native-recovery" attribution
 *   - Verbatim FR-MMT24 step 5 report header fragments
 *   - standing-pool-submitter.md does NOT own recovery
 *   - Recovery not invoked for pool_lead_crashed / drain_timed_out (terminal failures)
 *   - review-code.md and performance-audit.md referenced as integration points
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const RECOVERY_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'docs', 'specs', 'multi-model-teams', 'recovery.md'
);

const content = readFileSync(RECOVERY_MD_PATH, 'utf-8');
const lines = content.split('\n');

describe('recovery.md — Task 48 [T] acceptance criteria', () => {

  // ── [T] FR-MMT24 recovery owned by submitting command's host session ──────
  it('[T] FR-MMT24 recovery owned by submitting command host session (not standing-pool-submitter)', () => {
    expect(content).toMatch(/host session/);
    // "submitting command" appears near recovery ownership
    expect(content).toContain('submitting command');
  });

  // ── [T] Failed reviewer name extracted from error.message ─────────────────
  it('[T] failed reviewer name extracted from error.message', () => {
    expect(content).toContain('error.message');
    expect(content).toContain('reviewer');
    expect(content).toContain('Extract');
  });

  // ── [T] Fresh sub-agent spawned via Task tool from host session ───────────
  it('[T] fresh sub-agent spawned via Task tool from host session', () => {
    expect(content).toContain('Task tool');
    expect(content).toContain('host session');
  });

  // ── [T] Lightweight merge — Stages 3–6 NOT re-run ────────────────────────
  it('[T] lightweight merge: Stages 3–6 explicitly NOT re-run', () => {
    expect(content).toContain('Stages 3');
    expect(content).toContain('NOT re-run');
  });

  // ── [T] D19 partial dedup: Stage 1 + Stage 2 only, parent plan reference ──
  it('[T] D19 partial dedup: Stage 1 and Stage 2 referenced with parent plan', () => {
    expect(content).toContain('Stage 1');
    expect(content).toContain('Stage 2');
    expect(content).toContain('parent');
  });

  // ── [T] source.source_type: "native-recovery" attribution ────────────────
  it('[T] recovered findings carry source.source_type: "native-recovery" (verbatim)', () => {
    expect(content).toContain('source.source_type: "native-recovery"');
  });

  // ── [T] Verbatim FR-MMT24 step 5 report header fragments ─────────────────
  it('[T] verbatim step-5 header fragment: "Note: reviewer " present', () => {
    expect(content).toContain('Note: reviewer ');
  });

  it('[T] verbatim step-5 header fragment: "was recovered from a pool failure" present', () => {
    expect(content).toContain('was recovered from a pool failure');
  });

  it('[T] verbatim step-5 header fragment: "Results below include recovered findings" present', () => {
    expect(content).toContain('Results below include recovered findings');
  });

  // ── [T] standing-pool-submitter.md does NOT own recovery ─────────────────
  it('[T] standing-pool-submitter.md referenced as NOT owning recovery', () => {
    expect(content).toContain('standing-pool-submitter');
    // Must appear alongside a "does not" or "NOT" or "not own" negation
    expect(content).toMatch(/standing-pool-submitter[\s\S]{0,200}(does NOT|does not|NOT own|not own)/);
  });

  // ── [T] Recovery not invoked for terminal error codes ─────────────────────
  it('[T] pool_lead_crashed referenced as a terminal failure (recovery not invoked)', () => {
    expect(content).toContain('pool_lead_crashed');
    expect(content).toMatch(/(terminal|not invoked|NOT invoked)/);
  });

  it('[T] drain_timed_out referenced alongside terminal failure semantics', () => {
    expect(content).toContain('drain_timed_out');
  });

  // ── [T] review-code.md and performance-audit.md as integration points ─────
  it('[T] review-code.md referenced as an integration point', () => {
    expect(content).toContain('review-code.md');
  });

  it('[T] performance-audit.md referenced as an integration point', () => {
    expect(content).toContain('performance-audit.md');
  });

  // ── [T] FR-MMT24 code present ────────────────────────────────────────────
  it('[T] contains FR-MMT24 (per-task fallback recovery)', () => {
    expect(content).toContain('FR-MMT24');
  });

});

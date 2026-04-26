/**
 * Layer 1: Structural validation tests for the pool routing section
 * in plugins/synthex/commands/review-code.md.
 *
 * Validates all [T] acceptance criteria from Tasks 54 + 55:
 *   - Discovery runs at command-invocation time
 *   - Discovery is INLINE (no standing-pool-router agent)
 *   - standing-pool-cleanup agent invoked inline on stale-pool
 *   - Required-reviewer-set chain: --reviewers flag > code_review.reviewers > hardcoded fallback
 *   - Discovery conditional on standing_pools.enabled: true
 *   - Verbatim FR-MMT17 routing notification present
 *   - Verbatim FR-MMT17 explicit-pool-required error present
 *   - Recovery path invoked on status: failed / reviewer_crashed
 *   - Task 55 Item 2: submission confirmation verbatim
 *   - Task 55 Item 3: waiting indicator verbatim
 *   - Task 55 Item 4: provenance line verbatim
 *   - Item 3 TTY conditional suppression language
 *   - Item 3 60s threshold language
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REVIEW_CODE_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'commands', 'review-code.md'
);

const content = readFileSync(REVIEW_CODE_MD_PATH, 'utf-8');

describe('review-code.md — Tasks 54+55 [T] acceptance criteria (inline discovery + pool routing + recovery)', () => {

  // ── [T] Discovery runs at command-invocation time ─────────────────────────
  it('[T] discovery runs at command-invocation time', () => {
    const hasInvocationTime =
      content.includes('command-invocation time') ||
      content.includes('command invocation time');
    expect(hasInvocationTime).toBe(true);
  });

  // ── [T] Discovery is INLINE (standing-pool-router must NOT appear) ────────
  it('[T] "standing-pool-router" does NOT appear (discovery is inline, not delegated to a router agent)', () => {
    expect(content).not.toContain('standing-pool-router');
  });

  // ── [T] standing-pool-cleanup agent invoked inline on stale-pool ──────────
  it('[T] standing-pool-cleanup agent is referenced for inline stale-pool detection', () => {
    expect(content).toContain('standing-pool-cleanup');
  });

  // ── [T] Required-reviewer-set chain ──────────────────────────────────────
  it('[T] --reviewers flag referenced as highest-priority resolver in the required-reviewer-set chain', () => {
    expect(content).toContain('--reviewers');
  });

  it('[T] code_review.reviewers config key referenced in the required-reviewer-set chain', () => {
    expect(content).toContain('code_review.reviewers');
  });

  it('[T] hardcoded fallback "code-reviewer, security-reviewer" present in the required-reviewer-set chain', () => {
    // The normative chain must document the exact hardcoded fallback pair
    expect(content).toContain('code-reviewer, security-reviewer');
  });

  // ── [T] Discovery conditional on standing_pools.enabled: true ────────────
  it('[T] standing_pools.enabled conditional gate is documented', () => {
    expect(content).toContain('standing_pools.enabled');
  });

  // ── [T] Verbatim FR-MMT17 routing notification ────────────────────────────
  it('[T] verbatim FR-MMT17 routing notification: "Routing to standing pool \'{pool_name}\' (multi-model: {yes|no})."', () => {
    expect(content).toContain(
      "Routing to standing pool '{pool_name}' (multi-model: {yes|no})."
    );
  });

  // ── [T] Verbatim explicit-pool-required error ────────────────────────────
  it('[T] verbatim explicit-pool-required error first line: "No standing pool matches the required reviewers"', () => {
    expect(content).toContain('No standing pool matches the required reviewers');
  });

  // ── [T] Recovery path on status: failed / reviewer_crashed ───────────────
  it('[T] reviewer_crashed error code referenced as the trigger for recovery', () => {
    expect(content).toContain('reviewer_crashed');
  });

  it('[T] "recovery" referenced in the context of reviewer_crashed', () => {
    expect(content).toContain('recovery');
  });

  it('[T] source.source_type: "native-recovery" attribution present', () => {
    expect(content).toContain('source.source_type: "native-recovery"');
  });

  // ── [T] Task 55 Item 2: submission confirmation verbatim ─────────────────
  it('[T] Task 55 Item 2: verbatim submission confirmation line present', () => {
    expect(content).toContain(
      "Submitted task '{uuid}' to pool '{pool_name}'. Polling for completion (timeout: {timeout}s)."
    );
  });

  // ── [T] Task 55 Item 3: waiting indicator verbatim ───────────────────────
  it('[T] Task 55 Item 3: verbatim waiting indicator line present', () => {
    expect(content).toContain(
      "Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete..."
    );
  });

  // ── [T] Task 55 Item 4: provenance line verbatim ─────────────────────────
  it('[T] Task 55 Item 4: verbatim provenance line present', () => {
    expect(content).toContain(
      "Review path: standing pool '{pool_name}' (multi-model: {yes|no})."
    );
  });

  // ── [T] Item 3 TTY conditional suppression ───────────────────────────────
  it('[T] Item 3 waiting indicator is suppressed when stdout is not a TTY (CI-friendly)', () => {
    const hasTtyLanguage =
      content.includes('TTY') ||
      content.includes('tty');
    expect(hasTtyLanguage).toBe(true);

    const hasSuppressionLanguage =
      content.includes('Suppressed when stdout is not a TTY') ||
      content.includes('not a TTY') ||
      content.includes('CI-friendly');
    expect(hasSuppressionLanguage).toBe(true);
  });

  // ── [T] Item 3 60s threshold ─────────────────────────────────────────────
  it('[T] Item 3 waiting indicator has a 60s threshold before it is emitted', () => {
    const has60sThreshold =
      content.includes('60s') ||
      content.includes('60 second') ||
      content.includes('< 60') ||
      content.includes('>= 60') ||
      content.includes('≥ 60');
    expect(has60sThreshold).toBe(true);
  });

});

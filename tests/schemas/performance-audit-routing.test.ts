/**
 * Layer 1: Structural validation tests for the pool routing section
 * in plugins/synthex/commands/performance-audit.md.
 *
 * Validates all [T] acceptance criteria from Task 57:
 *   - Static required-reviewer-set [performance-engineer] — no resolver chain
 *   - Discovery is INLINE (no standing-pool-router agent)
 *   - standing_pools.enabled conditional present
 *   - Verbatim FR-MMT17 routing notification present
 *   - Verbatim Item 2 submission confirmation present
 *   - Verbatim Item 3 waiting indicator present
 *   - Verbatim Item 4 provenance line present
 *   - Item 3 TTY conditional suppression language
 *   - Item 3 60s threshold language
 *   - Recovery path present (reviewer_crashed, source.source_type)
 *   - standing-pool-cleanup invoked on stale detection
 *   - explicit-pool-required error text present
 *   - Cross-file: verbatim NFR-MMT7 strings identical to review-code.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PERF_AUDIT_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'commands', 'performance-audit.md'
);

const REVIEW_CODE_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'commands', 'review-code.md'
);

const content = readFileSync(PERF_AUDIT_MD_PATH, 'utf-8');
const reviewCodeContent = readFileSync(REVIEW_CODE_MD_PATH, 'utf-8');

describe('performance-audit.md — Task 57 [T] acceptance criteria (inline discovery + pool routing + recovery)', () => {

  // ── [T] 1. Static required-reviewer-set: performance-engineer ────────────
  it('[T] "performance-engineer" appears as the required reviewer in the static set', () => {
    expect(content).toContain('performance-engineer');
  });

  it('[T] static required-reviewer-set — no --reviewers flag resolver chain present', () => {
    // performance-audit.md should NOT have a --reviewers flag (that belongs to review-code.md)
    expect(content).not.toContain('--reviewers flag');
  });

  it('[T] static required-reviewer-set — no performance_audit.reviewers config key resolver present', () => {
    // There is no performance_audit.reviewers resolver chain, only the static set
    expect(content).not.toContain('performance_audit.reviewers');
  });

  // ── [T] 2. Discovery is INLINE (standing-pool-router must NOT appear) ─────
  it('[T] "standing-pool-router" does NOT appear (discovery is inline, not delegated to a router agent)', () => {
    expect(content).not.toContain('standing-pool-router');
  });

  // ── [T] 3. standing_pools.enabled conditional gate is documented ──────────
  it('[T] standing_pools.enabled conditional gate is documented', () => {
    expect(content).toContain('standing_pools.enabled');
  });

  // ── [T] 4. Verbatim FR-MMT17 routing notification ─────────────────────────
  it('[T] verbatim FR-MMT17 routing notification: "Routing to standing pool \'{pool_name}\' (multi-model: {yes|no})."', () => {
    expect(content).toContain(
      "Routing to standing pool '{pool_name}' (multi-model: {yes|no})."
    );
  });

  // ── [T] 5. Verbatim Item 2: submission confirmation ───────────────────────
  it('[T] Item 2: verbatim submission confirmation line present', () => {
    expect(content).toContain(
      "Submitted task '{uuid}' to pool '{pool_name}'. Polling for completion (timeout: {timeout}s)."
    );
  });

  // ── [T] 6. Verbatim Item 3: waiting indicator ─────────────────────────────
  it('[T] Item 3: verbatim waiting indicator line present', () => {
    expect(content).toContain(
      "Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete..."
    );
  });

  // ── [T] 7. Verbatim Item 4: provenance line ───────────────────────────────
  it('[T] Item 4: verbatim provenance line present', () => {
    expect(content).toContain(
      "Review path: standing pool '{pool_name}' (multi-model: {yes|no})."
    );
  });

  // ── [T] 8. Item 3 TTY conditional suppression ─────────────────────────────
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

  // ── [T] 9. Item 3 60s threshold ───────────────────────────────────────────
  it('[T] Item 3 waiting indicator has a 60s threshold before it is emitted', () => {
    const has60sThreshold =
      content.includes('60s') ||
      content.includes('60 second') ||
      content.includes('< 60') ||
      content.includes('>= 60') ||
      content.includes('≥ 60');
    expect(has60sThreshold).toBe(true);
  });

  // ── [T] 10. Recovery path: reviewer_crashed and source.source_type ─────────
  it('[T] reviewer_crashed error code referenced as the trigger for recovery', () => {
    expect(content).toContain('reviewer_crashed');
  });

  it('[T] source.source_type: "native-recovery" attribution present', () => {
    expect(content).toContain('source.source_type: "native-recovery"');
  });

  // ── [T] 11. standing-pool-cleanup invoked on stale detection ─────────────
  it('[T] standing-pool-cleanup agent is referenced for inline stale-pool detection', () => {
    expect(content).toContain('standing-pool-cleanup');
  });

  // ── [T] 12. explicit-pool-required error text present ────────────────────
  it('[T] explicit-pool-required error text present', () => {
    expect(content).toContain('explicit-pool-required');
    expect(content).toContain('No standing pool matches the required reviewers');
  });

  // ── [T] 13. Cross-file: verbatim NFR-MMT7 strings identical to review-code.md ──
  it('[T] NFR-MMT7 Item 1 routing notification is verbatim-identical in both files', () => {
    const item1 = "Routing to standing pool '{pool_name}' (multi-model: {yes|no}).";
    expect(content).toContain(item1);
    expect(reviewCodeContent).toContain(item1);
  });

  it('[T] NFR-MMT7 Item 2 submission confirmation is verbatim-identical in both files', () => {
    const item2 = "Submitted task '{uuid}' to pool '{pool_name}'. Polling for completion (timeout: {timeout}s).";
    expect(content).toContain(item2);
    expect(reviewCodeContent).toContain(item2);
  });

  it('[T] NFR-MMT7 Item 3 waiting indicator is verbatim-identical in both files', () => {
    const item3 = "Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete...";
    expect(content).toContain(item3);
    expect(reviewCodeContent).toContain(item3);
  });

  it('[T] NFR-MMT7 Item 4 provenance line is verbatim-identical in both files', () => {
    const item4 = "Review path: standing pool '{pool_name}' (multi-model: {yes|no}).";
    expect(content).toContain(item4);
    expect(reviewCodeContent).toContain(item4);
  });

});

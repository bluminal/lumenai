/**
 * Layer 1: Structural validation tests for the pool routing section
 * formerly inline in plugins/synthex/commands/performance-audit.md's Step 1b.
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
 *   - Cross-file: verbatim NFR-MMT7 strings identical across both routing docs
 *
 * Task 14 (FR-HM5, D17) repoint: this section's body moved byte-identical
 * from performance-audit.md's Step 1b to
 * plugins/synthex/docs/standing-pool-routing-performance-audit.md, replaced
 * in performance-audit.md by a two-line D17 gate. Most assertions below now
 * read the doc file instead of the command file; a couple of "absence"
 * checks and the D17-gate-shape check still read the command file directly.
 *
 * This is a SEPARATE doc from review-code's docs/standing-pool-routing.md
 * (Task 13) — the two Step 1b bodies are materially different (static vs.
 * dynamic required-reviewer-set, one pool task vs. one-per-reviewer,
 * differing Skip-Steps counts), so Task 14 did not force them into one
 * parameterized file. The 4 NFR-MMT7 user-visible strings are still locked
 * verbatim across both docs — item 13 below compares the doc BODIES for
 * those 4 strings, and separately compares the two commands' D17 GATE LINES
 * (not full bodies, which now legitimately differ) for structural
 * consistency.
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

// Task 14 (FR-HM5, D17) repoint: performance-audit.md's Step 1b body now
// lives in its own doc (materially different from review-code's).
const STANDING_POOL_ROUTING_PERF_AUDIT_DOC_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'docs', 'standing-pool-routing-performance-audit.md'
);

// Task 13 (FR-HM5, D17): review-code.md's Step 1b body lives here.
const STANDING_POOL_ROUTING_DOC_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'docs', 'standing-pool-routing.md'
);

const commandContent = readFileSync(PERF_AUDIT_MD_PATH, 'utf-8');
const reviewCodeCommandContent = readFileSync(REVIEW_CODE_MD_PATH, 'utf-8');
const content = readFileSync(STANDING_POOL_ROUTING_PERF_AUDIT_DOC_PATH, 'utf-8');
const reviewCodeContent = readFileSync(STANDING_POOL_ROUTING_DOC_PATH, 'utf-8');

describe('performance-audit.md — Task 57 [T] acceptance criteria (inline discovery + pool routing + recovery)', () => {

  // ── [T] 1. Static required-reviewer-set: performance-engineer ────────────
  it('[T] "performance-engineer" appears as the required reviewer in the static set', () => {
    expect(content).toContain('performance-engineer');
  });

  it('[T] static required-reviewer-set — no --reviewers flag resolver chain present', () => {
    // performance-audit's routing doc should NOT have a --reviewers flag (that belongs to review-code's doc)
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
  it('[T] standing_pools.enabled conditional gate is documented (at the D17 gate in the command)', () => {
    expect(commandContent).toContain('standing_pools.enabled');
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

  // ── [T] 13. Cross-file: verbatim NFR-MMT7 strings identical, gate lines consistent ──
  //
  // The two Step 1b DOC bodies are no longer expected to be identical (Task
  // 14 kept them as separate docs because the surrounding prose differs
  // materially). What stays locked verbatim per D25/NFR-MMT7 is the 4
  // user-visible strings themselves, in both docs, and the D17 gate SHAPE
  // in both commands (same "If ... Read `${CLAUDE_PLUGIN_ROOT}/docs/...` and
  // follow it; otherwise ...; On other hosts, ..." pattern) — not the full
  // extracted bodies.
  const NFR_MMT7_ITEMS = [
    "Routing to standing pool '{pool_name}' (multi-model: {yes|no}).",
    "Submitted task '{uuid}' to pool '{pool_name}'. Polling for completion (timeout: {timeout}s).",
    "Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete...",
    "Review path: standing pool '{pool_name}' (multi-model: {yes|no}).",
  ];

  it.each(NFR_MMT7_ITEMS.map((item, i) => [i + 1, item] as const))(
    '[T] NFR-MMT7 Item %i is verbatim-identical across both routing docs',
    (_i, item) => {
      expect(content).toContain(item);
      expect(reviewCodeContent).toContain(item);
    },
  );

  it('[T] both commands\' Step 1b D17 gates follow the same shape (Read ${CLAUDE_PLUGIN_ROOT}/docs/... ; other-hosts fallback)', () => {
    const gateRe = /Read `\$\{CLAUDE_PLUGIN_ROOT\}\/docs\/[^`]+\.md` and follow it[^.]*\. On other hosts, resolve the plugin root/;
    expect(commandContent).toMatch(gateRe);
    expect(reviewCodeCommandContent).toMatch(gateRe);
  });

});

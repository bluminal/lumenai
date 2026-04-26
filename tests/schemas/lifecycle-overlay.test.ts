/**
 * Layer 1: Structural validation tests for the Standing Pool Lifecycle Overlay
 * in plugins/synthex-plus/templates/review.md.
 *
 * Validates all [T] acceptance criteria from Task 27:
 *   - Overlay heading present (exact string match)
 *   - All five lifecycle responsibilities (a)–(e) identifiable by raw-string check
 *   - max(existing, new) semantics phrase present
 *   - Dual-write requirement (config.json + index.json) documented
 *   - Debounce with exact phrase "at most once per 30 seconds"
 *   - mkdir-based locking (.index.lock) referenced
 *   - [H] FR-MMT5/12/14/9b verbatim acceptance criteria — flagged for human review
 *   - Terminology: "Pool Lead" only; no bare "Lead"; no "team lead"; no "pool lead" (lowercase)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REVIEW_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'templates', 'review.md'
);

const content = readFileSync(REVIEW_MD_PATH, 'utf-8');

// Extract only the Lifecycle Overlay section for scoped assertions
const lifecycleStart = content.indexOf('### Standing Pool Lifecycle Overlay');
const lifecycleSection = lifecycleStart >= 0 ? content.slice(lifecycleStart) : '';

describe('templates/review.md — Task 27 Standing Pool Lifecycle Overlay [T] acceptance criteria', () => {

  // ── [T] Overlay heading present ──────────────────────────────────────────
  it('[T] overlay heading "### Standing Pool Lifecycle Overlay (apply when standing=true)" is present', () => {
    expect(content).toContain(
      '### Standing Pool Lifecycle Overlay (apply when standing=true)'
    );
  });

  // ── [T] Five lifecycle responsibilities (a)–(e) identifiable ─────────────
  it('[T] responsibility (a): last_active_at dual-write on TeammateIdle is present', () => {
    // Check for the responsibility (a) heading substring
    expect(lifecycleSection).toContain('(a)');
    expect(lifecycleSection).toContain('last_active_at');
    expect(lifecycleSection).toContain('TeammateIdle');
  });

  it('[T] responsibility (b): skip natural shutdown on empty task list is present', () => {
    expect(lifecycleSection).toContain('(b)');
    expect(lifecycleSection).toContain('empty task list');
  });

  it('[T] responsibility (c): shutdown signal handling → draining state is present', () => {
    expect(lifecycleSection).toContain('(c)');
    expect(lifecycleSection).toContain('shutdown');
    expect(lifecycleSection).toContain('draining');
  });

  it('[T] responsibility (d): wait for in-flight tasks before stopping is present', () => {
    expect(lifecycleSection).toContain('(d)');
    expect(lifecycleSection).toContain('in-flight');
  });

  it('[T] responsibility (e): drain completion → stopping → exit is present', () => {
    expect(lifecycleSection).toContain('(e)');
    expect(lifecycleSection).toContain('stopping');
  });

  // ── [T] max(existing, new) semantics ─────────────────────────────────────
  it('[T] max-semantics exact phrase "max(existing, new)" is present', () => {
    expect(lifecycleSection).toContain('max(existing, new)');
  });

  // ── [T] Dual-write requirement documented (config.json + index.json) ─────
  it('[T] dual-write: config.json referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('config.json');
  });

  it('[T] dual-write: index.json referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('index.json');
  });

  it('[T] dual-write: both files mentioned in the (a) responsibility subsection', () => {
    // The (a) subsection must reference both the canonical config and the index cache
    const subsectionA = lifecycleSection.slice(
      lifecycleSection.indexOf('#### (a)'),
      lifecycleSection.indexOf('#### (b)')
    );
    expect(subsectionA).toContain('config.json');
    expect(subsectionA).toContain('index.json');
  });

  // ── [T] Debounce with exact phrase "at most once per 30 seconds" ─────────
  it('[T] debounce exact phrase "at most once per 30 seconds" is present', () => {
    expect(lifecycleSection).toContain('at most once per 30 seconds');
  });

  // ── [T] mkdir-based locking (.index.lock) referenced ─────────────────────
  it('[T] locking primitive "mkdir" referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('mkdir');
  });

  it('[T] lock directory ".index.lock" referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('.index.lock');
  });

  // ── [H] FR-MMT5/12/14/9b verbatim acceptance criteria — FLAG for human review ──
  //
  // This test asserts that the key FR reference codes appear in the lifecycle section.
  // The CONTENT of what those clauses say must be reviewed by a human against the
  // normative definitions in docs/specs/multi-model-teams/pool-lifecycle.md.
  // See the [H] FLAG comment at the bottom of this file.
  it('[H][T] FR-MMT12 (writer-ordering / max-semantics) referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('FR-MMT12');
  });

  it('[H][T] FR-MMT9b (dual-write pool-lead responsibility) referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('FR-MMT9b');
  });

  it('[H][T] FR-MMT14 (standing-pool idle persistence and draining) referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('FR-MMT14');
  });

  it('[H][T] FR-MMT5b (identity-confirm re-issuance per D26) referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('FR-MMT5b');
  });

  it('[H][T] FR-MMT20 (JSON-envelope re-issuance per D26) referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('FR-MMT20');
  });

  // ── [T] Terminology: "Pool Lead" only; no bare "Lead"; no "team lead"; no "pool lead" ──
  it('[T] no bare "Lead" outside "Pool Lead" in the lifecycle section (terminology gate)', () => {
    // Remove "Pool Lead" occurrences, then check no standalone "Lead" word remains
    const withPoolLeadRemoved = lifecycleSection.replace(/Pool Lead/g, 'POOL_LEAD_PLACEHOLDER');
    const bareLeadMatches = withPoolLeadRemoved.match(/\bLead\b/g);
    expect(bareLeadMatches).toBeNull();
  });

  it('[T] no "team lead" (case-insensitive two-word form) in lifecycle section', () => {
    expect(lifecycleSection).not.toMatch(/\bteam lead\b/i);
  });

  it('[T] no "pool lead" (lowercase form) in lifecycle section — only "Pool Lead" is permitted', () => {
    // Negative scan: "pool lead" with lowercase 'p' is disallowed
    expect(lifecycleSection).not.toContain('pool lead');
  });

  it('[T] no "team-lead" (hyphenated form) in lifecycle section', () => {
    expect(lifecycleSection).not.toMatch(/\bteam-lead\b/);
  });

});

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * [H] HUMAN REVIEW FLAG — Task 27 acceptance criterion [H]
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The [H] criterion requires a human to verify that the Lifecycle Overlay section
 * contains verbatim text matching the FR-MMT5/12/14/9b acceptance criteria from
 * docs/specs/multi-model-teams/pool-lifecycle.md. The tests above confirm that the
 * FR codes are present; the CONTENT must be reviewed by a human.
 *
 * Relevant section for human review (from templates/review.md,
 * "### Standing Pool Lifecycle Overlay (apply when standing=true)"):
 *
 * --- BEGIN SECTION FOR HUMAN REVIEW ---
 *
 * #### (a) `last_active_at` Dual-Write on TeammateIdle (FR-MMT12, FR-MMT9b)
 *
 * On each TeammateIdle event observed for any pool reviewer, the Pool Lead updates
 * `last_active_at` using **`max(existing, new)` semantics**: read the current
 * `last_active_at` from `~/.claude/teams/standing/<name>/config.json`, compare
 * against the proposed new timestamp, and write the larger of the two. This keeps
 * the timestamp monotonically non-decreasing regardless of write interleaving
 * between the Pool Lead and the TeammateIdle hook.
 *
 * **Debounce:** Write `last_active_at` at most once per 30 seconds even if multiple
 * TeammateIdle events fire within that window.
 *
 * **Dual-write protocol (FR-MMT9b):** Every `last_active_at` write touches both
 * files atomically:
 * 1. config.json (canonical): write to config.json.tmp, then rename.
 * 2. index.json (cache): acquire .index.lock (mkdir), write .index.json.tmp, rename,
 *    release (.rmdir).
 *
 * Check against:
 *   - FR-MMT12 §4.3: "Both Pool Lead writes and TeammateIdle hook writes use
 *     max(existing, new) semantics — last_active_at is monotonically non-decreasing
 *     under any write interleaving."
 *   - FR-MMT9b §2.5: "Pool Lead writes both config.json and index.json on every
 *     state transition and every last_active_at update."
 *
 * #### (b) Skip Natural Shutdown on Empty Task List
 *
 * Check against FR-MMT14: "Standing pool Pool Lead does NOT exit when task list empties."
 *
 * #### (c) Shutdown Signal Handling → Draining
 *
 * Check against FR-MMT14 state machine: shutdown_request message triggers draining
 * transition, written atomically to config.json + index.json.
 *
 * #### (d) Stuck-task timeout: lifecycle.stuck_task_timeout_minutes (default 30)
 *
 * Check that the default of 30 minutes matches the normative value in the plan.
 *
 * #### (e) Drain completion → stopping → exit
 *
 * Check against §3.2 state machine transitions:
 *   draining → stopping: "All in-flight tasks complete, OR stuck_task_timeout_minutes exceeded"
 *   stopping → removed: "Pool Lead exits"
 *
 * --- END SECTION FOR HUMAN REVIEW ---
 */

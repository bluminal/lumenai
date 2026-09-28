/**
 * Task 50 (FR-HM23) port: same structural assertions as
 * lifecycle-overlay.test.ts, run against the copy folded into
 * plugins/synthex/templates/review.md (Task 48, FR-HM24). The overlay text
 * is carried over verbatim from synthex-plus — Task 50 does not touch it —
 * so this file proves the port survives the TaskCompleted/TeammateIdle hook
 * rewrite unchanged. Keeps the synthex-plus original (and its own test)
 * passing unmodified.
 *
 * Layer 1: Structural validation tests for the Standing Pool Lifecycle
 * Overlay in plugins/synthex/templates/review.md.
 *
 * Validates all [T] acceptance criteria from Task 27 (ported):
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
  '..', '..', 'plugins', 'synthex', 'templates', 'review.md'
);

const content = readFileSync(REVIEW_MD_PATH, 'utf-8');

// Extract only the Lifecycle Overlay section for scoped assertions
const lifecycleStart = content.indexOf('### Standing Pool Lifecycle Overlay');
const lifecycleSection = lifecycleStart >= 0 ? content.slice(lifecycleStart) : '';

describe('templates/review.md (synthex) — Task 27/48 Standing Pool Lifecycle Overlay [T] acceptance criteria', () => {

  // ── [T] Overlay heading present ──────────────────────────────────────────
  it('[T] overlay heading "### Standing Pool Lifecycle Overlay (apply when standing=true)" is present', () => {
    expect(content).toContain(
      '### Standing Pool Lifecycle Overlay (apply when standing=true)'
    );
  });

  // ── [T] Five lifecycle responsibilities (a)–(e) identifiable ─────────────
  it('[T] responsibility (a): last_active_at dual-write on TeammateIdle is present', () => {
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
  it('[H][T] FR-MMT12 (writer-ordering / max-semantics) referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('FR-MMT12');
  });

  it('[H][T] FR-MMT9b (dual-write pool-lead responsibility) referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('FR-MMT9b');
  });

  it('[H][T] FR-MMT14 (standing-pool idle persistence and draining) referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('FR-MMT14');
  });

  // Task 51 (FR-HM22, ADR-plus-002) retired the D26 per-task identity-confirm re-issuance;
  // FR-MMT5b now appears only as a historical pointer in the "retired" note below the
  // lifecycle overlay, not as an active re-paste instruction — see start-review-team-synthex.test.ts
  // T11 for the replacement (agentType spawn + ListAgents verification).
  it('[H][T] FR-MMT5b is referenced only as a historical "retired (ADR-plus-002)" pointer', () => {
    expect(lifecycleSection).toContain('FR-MMT5b');
    expect(lifecycleSection).toContain('Per-Task Reviewer Re-Issuance — retired (ADR-plus-002)');
    expect(lifecycleSection).not.toContain('### Standing Pool Identity Confirm Overlay');
  });

  it('[H][T] FR-MMT20 (JSON-envelope, still delivered once at spawn time) referenced in lifecycle section', () => {
    expect(lifecycleSection).toContain('FR-MMT20');
  });

  // ── [T] Terminology: "Pool Lead" only; no bare "Lead"; no "team lead"; no "pool lead" ──
  it('[T] no bare "Lead" outside "Pool Lead" in the lifecycle section (terminology gate)', () => {
    const withPoolLeadRemoved = lifecycleSection.replace(/Pool Lead/g, 'POOL_LEAD_PLACEHOLDER');
    const bareLeadMatches = withPoolLeadRemoved.match(/\bLead\b/g);
    expect(bareLeadMatches).toBeNull();
  });

  it('[T] no "team lead" (case-insensitive two-word form) in lifecycle section', () => {
    expect(lifecycleSection).not.toMatch(/\bteam lead\b/i);
  });

  it('[T] no "pool lead" (lowercase form) in lifecycle section — only "Pool Lead" is permitted', () => {
    expect(lifecycleSection).not.toContain('pool lead');
  });

  it('[T] no "team-lead" (hyphenated form) in lifecycle section', () => {
    expect(lifecycleSection).not.toMatch(/\bteam-lead\b/);
  });

});

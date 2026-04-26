/**
 * Layer 1: Structural validation tests for the Stale-Pool Cleanup section
 * in docs/specs/multi-model-teams/routing.md.
 *
 * Validates all [T] acceptance criteria from Task 47:
 *   - ## Stale-Pool Cleanup section heading present
 *   - standing-pool-cleanup agent referenced by name
 *   - Index entry AND metadata dir removal mentioned (delegated to cleanup agent under lock)
 *   - "transient marker in the calling session's state" present verbatim
 *   - FR-MMT22 step 5 verbatim warning fragments all present
 *   - FR-MMT22 warning string is documented as distinct from FR-MMT28 warning
 *   - Detection conditions: metadata_dir condition AND last_active_at condition documented
 *   - max(ttl_minutes, 24h) floor documented
 *   - Routing continues after cleanup (routing_mode or prefer-with-fallback referenced after cleanup)
 *   - FR-MMT22 reference present in section
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROUTING_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'docs', 'specs', 'multi-model-teams', 'routing.md'
);

const content = readFileSync(ROUTING_MD_PATH, 'utf-8');

// Extract only the Stale-Pool Cleanup section for scoped assertions
const sectionStart = content.indexOf('## 7. Stale-Pool Cleanup');
const section = sectionStart >= 0 ? content.slice(sectionStart) : '';

describe('routing.md — Task 47 Stale-Pool Cleanup (FR-MMT22) [T] acceptance criteria', () => {

  // ── [T] Section heading present ──────────────────────────────────────────
  it('[T] "## 7. Stale-Pool Cleanup" section heading (or variant) is present', () => {
    const hasHeading =
      content.includes('## 7. Stale-Pool Cleanup') ||
      content.includes('## Stale-Pool Cleanup');
    expect(hasHeading).toBe(true);
  });

  // ── [T] standing-pool-cleanup agent referenced ────────────────────────────
  it('[T] standing-pool-cleanup agent referenced by name in the section', () => {
    expect(section).toContain('standing-pool-cleanup');
  });

  // ── [T] Index entry AND metadata dir removal mentioned under cleanup agent lock ──
  it('[T] index entry removal mentioned in the section', () => {
    const hasIndexRemoval =
      section.includes('removes the index entry') ||
      section.includes('remove the index entry');
    expect(hasIndexRemoval).toBe(true);
  });

  it('[T] metadata directory removal mentioned in the section', () => {
    const hasMetadirRemoval =
      section.includes('removes the metadata directory') ||
      section.includes('remove the metadata directory') ||
      section.includes('metadata directory (if present)');
    expect(hasMetadirRemoval).toBe(true);
  });

  it('[T] cleanup is delegated to cleanup agent under lock', () => {
    const hasLock =
      section.includes('.index.lock') ||
      section.includes('under index lock') ||
      section.includes('under lock');
    expect(hasLock).toBe(true);
  });

  // ── [T] "transient marker in the calling session's state" verbatim ────────
  it('[T] "transient marker in the calling session\'s state" present verbatim', () => {
    expect(section).toContain("transient marker in the calling session's state");
  });

  // ── [T] FR-MMT22 step 5 verbatim warning fragments ────────────────────────
  it('[T] FR-MMT22 verbatim warning fragment: "Standing pool \'" present', () => {
    expect(section).toContain("Standing pool '");
  });

  it('[T] FR-MMT22 verbatim warning fragment: "was stale and has been cleaned up." present', () => {
    expect(section).toContain('was stale and has been cleaned up.');
  });

  it('[T] FR-MMT22 verbatim warning fragment: "{fallback_action}" present', () => {
    expect(section).toContain('{fallback_action}');
  });

  // ── [T] FR-MMT22 warning is distinct from FR-MMT28 warning ───────────────
  it('[T] section documents that FR-MMT22 and FR-MMT28 use different verbatim warning strings', () => {
    const hasMmt28Distinction =
      (section.includes('FR-MMT28') && (
        section.includes('distinct') ||
        section.includes('different') ||
        section.includes('do NOT reuse') ||
        section.includes('do not reuse')
      ));
    expect(hasMmt28Distinction).toBe(true);
  });

  // ── [T] Detection conditions: metadata_dir AND last_active_at ────────────
  it('[T] metadata_dir (or "metadata dir") detection condition documented', () => {
    const hasMetadataDirCondition =
      section.includes('metadata_dir') ||
      section.includes('metadata dir');
    expect(hasMetadataDirCondition).toBe(true);
  });

  it('[T] last_active_at stale detection condition documented', () => {
    expect(section).toContain('last_active_at');
  });

  // ── [T] max(ttl_minutes, 24h) floor documented ────────────────────────────
  it('[T] "max(ttl_minutes, 24h)" or "max(ttl_minutes, 24 hours)" present', () => {
    const has24hFloor =
      section.includes('max(ttl_minutes, 24h)') ||
      section.includes('max(ttl_minutes, 24 hours)');
    expect(has24hFloor).toBe(true);
  });

  // ── [T] Routing continues after cleanup with routing_mode semantics ────────
  it('[T] routing_mode or prefer-with-fallback referenced after cleanup step', () => {
    // Find the cleanup procedure subsection and check for routing continuation text after it
    const afterCleanup = section.slice(section.indexOf('Cleanup Procedure') >= 0
      ? section.indexOf('Cleanup Procedure')
      : 0);
    const hasRoutingContinuation =
      afterCleanup.includes('routing_mode') ||
      afterCleanup.includes('prefer-with-fallback');
    expect(hasRoutingContinuation).toBe(true);
  });

  // ── [T] FR-MMT22 reference present in section ────────────────────────────
  it('[T] FR-MMT22 reference present in the stale-pool cleanup section', () => {
    expect(section).toContain('FR-MMT22');
  });

});

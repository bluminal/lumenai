/**
 * Layer 1: Structural validation tests for the start-review-team command.
 *
 * Validates all [T] acceptance criteria from Task 41:
 *   T1  — All 10 workflow steps present
 *   T2  — Pool name validation regex ^[a-z0-9][a-z0-9-]{0,47}$ present verbatim
 *   T3  — Verbatim rejection message ("Pool name '", "is invalid", "Names must be 1–48")
 *   T4  — Multi-model preflight reference
 *   T5  — mkdir + .index.lock (cross-session lock)
 *   T6  — pool_state: idle in step 8
 *   T7  — last_active_at = spawn timestamp in step 8
 *   T8  — .index.json.tmp + rename (atomic index update)
 *   T9  — Cost advisory verbatim text
 *   T10 — submission_timeout_seconds in step 10 confirmation
 *   T11 — Step 7 overlay: "Standing Pool Identity Confirm Overlay" present
 *   T12 — Step 7 overlay: "Standing Pool Lifecycle Overlay" present
 *   T13 — Lifecycle overlay only for Pool Lead (exclusive language near "Lifecycle Overlay")
 *   T14 — Multi-model overlay conditional on multi_model: true
 *   T15 — "Pool Lead" terminology present
 *   T16 — Pool roster scope note present
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const COMMAND_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'commands', 'start-review-team.md'
);

const content = readFileSync(COMMAND_PATH, 'utf-8');

describe('commands/start-review-team.md — Task 41 [T] acceptance criteria', () => {

  // ── [T1] All 10 workflow steps present ───────────────────────────────────
  it('[T1] Step 1 (pre-flight checks) is present', () => {
    expect(content).toMatch(/Step 1|### Step 1|#### Step 1|### 1\.|## Workflow.*Step 1/s);
    // More targeted: check for the actual step heading or numbered prefix
    const hasStep1 = /Step 1\.?\s*(Pre-?[Ff]light|pre-?flight)/i.test(content);
    expect(hasStep1).toBe(true);
  });

  it('[T1] Step 2 (parameter resolution and defaults) is present', () => {
    const hasStep2 = /Step 2\.?\s*(Parameter|parameter)/i.test(content);
    expect(hasStep2).toBe(true);
  });

  it('[T1] Step 3 (pool name validation) is present', () => {
    const hasStep3 = /Step 3\.?\s*(Pool\s+[Nn]ame|name\s+validation)/i.test(content);
    expect(hasStep3).toBe(true);
  });

  it('[T1] Step 4 (roster validation) is present', () => {
    const hasStep4 = /Step 4\.?\s*(Roster|roster)/i.test(content);
    expect(hasStep4).toBe(true);
  });

  it('[T1] Step 5 (multi-model preflight) is present', () => {
    const hasStep5 = /Step 5\.?\s*(Multi|multi)/i.test(content);
    expect(hasStep5).toBe(true);
  });

  it('[T1] Step 6 (cross-session lock acquisition) is present', () => {
    const hasStep6 = /Step 6\.?\s*(Cross|Lock|lock)/i.test(content);
    expect(hasStep6).toBe(true);
  });

  it('[T1] Step 7 (spawn the team) is present', () => {
    const hasStep7 = /Step 7\.?\s*(Spawn|spawn)/i.test(content);
    expect(hasStep7).toBe(true);
  });

  it('[T1] Step 8 (write pool metadata and update index) is present', () => {
    const hasStep8 = /Step 8\.?\s*(Write|Metadata|metadata)/i.test(content);
    expect(hasStep8).toBe(true);
  });

  it('[T1] Step 9 (idle the pool) is present', () => {
    const hasStep9 = /Step 9\.?\s*(Idle|idle)/i.test(content);
    expect(hasStep9).toBe(true);
  });

  it('[T1] Step 10 (confirm to user) is present', () => {
    const hasStep10 = /Step 10\.?\s*(Confirm|confirm)/i.test(content);
    expect(hasStep10).toBe(true);
  });

  // ── [T2] Pool name validation regex present verbatim ─────────────────────
  it('[T2] pool name regex ^[a-z0-9][a-z0-9-]{0,47}$ is present verbatim', () => {
    expect(content).toContain('^[a-z0-9][a-z0-9-]{0,47}$');
  });

  // ── [T3] Verbatim rejection message ──────────────────────────────────────
  it('[T3] rejection message contains "Pool name \'"', () => {
    expect(content).toContain("Pool name '");
  });

  it('[T3] rejection message contains "is invalid"', () => {
    expect(content).toContain('is invalid');
  });

  it('[T3] rejection message contains "Names must be 1–48"', () => {
    expect(content).toContain('Names must be 1–48');
  });

  // ── [T4] Multi-model preflight reference ─────────────────────────────────
  it('[T4] multi-model preflight reference is present', () => {
    const hasPreflight = /multi-model preflight|FR-MR20|preflight/i.test(content);
    expect(hasPreflight).toBe(true);
  });

  // ── [T5] mkdir + .index.lock present (cross-session lock) ─────────────────
  it('[T5] "mkdir" is referenced for lock acquisition', () => {
    expect(content).toContain('mkdir');
  });

  it('[T5] ".index.lock" is referenced', () => {
    expect(content).toContain('.index.lock');
  });

  // ── [T6] pool_state: idle in step 8 ──────────────────────────────────────
  it('[T6] "pool_state: idle" appears in the document (step 8 schema)', () => {
    expect(content).toContain('pool_state: idle');
  });

  // ── [T7] last_active_at = spawn timestamp in step 8 ──────────────────────
  it('[T7] "last_active_at" is set to the spawn timestamp in step 8', () => {
    expect(content).toContain('last_active_at');
    // Verify the spawn timestamp semantics are described
    const hasSpawnTimestamp = /last_active_at.*spawn|spawn.*last_active_at/is.test(content);
    expect(hasSpawnTimestamp).toBe(true);
  });

  // ── [T8] .index.json.tmp + rename (atomic index update) ──────────────────
  it('[T8] ".index.json.tmp" is referenced (atomic index write)', () => {
    expect(content).toContain('.index.json.tmp');
  });

  it('[T8] "rename" is referenced for the atomic index update', () => {
    expect(content).toContain('rename');
  });

  // ── [T9] Cost advisory verbatim text ─────────────────────────────────────
  it('[T9] cost advisory contains "Heads up: this pool will keep"', () => {
    expect(content).toContain('Heads up: this pool will keep');
  });

  it('[T9] cost advisory contains "idle for up to"', () => {
    expect(content).toContain('idle for up to');
  });

  it('[T9] cost advisory contains "minutes"', () => {
    // Already implied by "ttl_minutes" but assert on the advisory block
    const advisoryStart = content.indexOf('Heads up: this pool will keep');
    const advisoryExcerpt = advisoryStart >= 0 ? content.slice(advisoryStart, advisoryStart + 200) : '';
    expect(advisoryExcerpt).toContain('minutes');
  });

  it('[T9] cost advisory contains "Continue?"', () => {
    expect(content).toContain('Continue?');
  });

  // ── [T10] submission_timeout_seconds in step 10 ──────────────────────────
  it('[T10] "submission_timeout_seconds" appears in the step 10 confirmation', () => {
    expect(content).toContain('submission_timeout_seconds');
  });

  // ── [T11] Step 7 overlay: Standing Pool Identity Confirm Overlay ──────────
  it('[T11] "Standing Pool Identity Confirm Overlay" is referenced in the document', () => {
    expect(content).toContain('Standing Pool Identity Confirm Overlay');
  });

  // ── [T12] Step 7 overlay: Standing Pool Lifecycle Overlay ─────────────────
  it('[T12] "Standing Pool Lifecycle Overlay" is referenced in the document', () => {
    expect(content).toContain('Standing Pool Lifecycle Overlay');
  });

  // ── [T13] Lifecycle overlay is for Pool Lead ONLY ─────────────────────────
  it('[T13] Lifecycle Overlay is marked as exclusive to Pool Lead (not reviewers)', () => {
    // The document must indicate that the Lifecycle Overlay applies only to Pool Lead
    const lifecycleIdx = content.indexOf('Standing Pool Lifecycle Overlay');
    expect(lifecycleIdx).toBeGreaterThanOrEqual(0);
    // Look at a window around the first mention for exclusive language
    const window = content.slice(lifecycleIdx, lifecycleIdx + 600);
    const hasExclusiveLanguage = /Pool Lead.{0,200}ONLY|ONLY.{0,200}Pool Lead|Pool Lead's spawn prompt ONLY|Pool Lead only/i.test(window);
    expect(hasExclusiveLanguage).toBe(true);
  });

  it('[T13] Lifecycle Overlay section states reviewers do NOT receive it', () => {
    const hasNotForReviewers = /NOT in reviewer|not.*reviewer.*prompts|reviewer.*NOT/i.test(content);
    expect(hasNotForReviewers).toBe(true);
  });

  // ── [T14] Multi-model overlay conditional on multi_model: true ────────────
  it('[T14] Multi-Model overlay is described as conditional on multi_model: true', () => {
    const hasConditional = /multi_model.*true|when.*multi_model.*true|multi_model.*false.*omit/i.test(content);
    expect(hasConditional).toBe(true);
  });

  it('[T14] "Multi-Model Conditional Overlay" is referenced', () => {
    expect(content).toContain('Multi-Model Conditional Overlay');
  });

  // ── [T15] "Pool Lead" terminology present ────────────────────────────────
  it('[T15] "Pool Lead" appears in the document', () => {
    expect(content).toContain('Pool Lead');
  });

  // ── [T16] Pool roster scope note present ─────────────────────────────────
  it('[T16] pool roster scope note references "planning roster" OR "no agent allowlist" OR "FR-MMT15"', () => {
    const hasScopeNote = /planning roster|no agent allowlist|FR-MMT15/i.test(content);
    expect(hasScopeNote).toBe(true);
  });

  it('[T16] pool roster scope note references routing (FR-MMT15 context)', () => {
    const hasRoutingRef = /route|routing/i.test(content);
    expect(hasRoutingRef).toBe(true);
  });

});

/**
 * Layer 1: Structural validation tests for the standing-pool branch of
 * plugins/synthex-plus/hooks/teammate-idle-gate.md.
 *
 * Validates all [T] acceptance criteria from Task 28 (FR-MMT12):
 *   [T1]  Hook reads config.json and checks the "standing" field
 *   [T2]  standing: true branch is present and branches away from non-standing path
 *   [T3]  Standing-pool branch does NOT trigger dismissal/shutdown
 *   [T4]  max(existing, new) semantics phrase present in standing branch
 *   [T5]  config.json.tmp + rename pattern present (canonical write)
 *   [T6]  .index.lock locking primitive referenced
 *   [T7]  .index.json.tmp + rename pattern present (index write)
 *   [T8]  30-second debounce logic present
 *   [T9]  Non-standing path preserves original dismissal / shutdown logic
 *   [T10] Dual-write ordering (config.json first, index.json second) documented
 *   [T11] Exit code 0 returned on standing path
 *   [T12] Hook branches on standing: false / absent back to non-standing path
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const HOOK_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'hooks', 'teammate-idle-gate.md'
);

const content = readFileSync(HOOK_PATH, 'utf-8');

// ── Scoped sections ────────────────────────────────────────────────────────

// The entire "Standing Pool Branch" section
const standingStart = content.indexOf('## Standing Pool Branch');
const standingEnd = content.indexOf('\n## ', standingStart + 1);
const standingSection = standingStart >= 0
  ? content.slice(standingStart, standingEnd > standingStart ? standingEnd : undefined)
  : '';

// The "Standing Pool Path" subsection (everything between "Standing Pool Path" heading and "Non-Standing Path")
const standingPathStart = standingSection.indexOf('### Standing Pool Path');
const nonStandingPathStart = standingSection.indexOf('### Non-Standing Path');
const standingPathSection = standingPathStart >= 0 && nonStandingPathStart > standingPathStart
  ? standingSection.slice(standingPathStart, nonStandingPathStart)
  : standingSection.slice(standingPathStart);

// The "Non-Standing Path" subsection
const nonStandingSection = nonStandingPathStart >= 0
  ? standingSection.slice(nonStandingPathStart)
  : '';

// ── Test suite ─────────────────────────────────────────────────────────────

describe('hooks/teammate-idle-gate.md — Task 28 standing-pool branch [T] acceptance criteria', () => {

  // ── [T1] Hook reads config.json and checks the "standing" field ──────────
  it('[T1] hook reads ~/.claude/teams/<team-name>/config.json before branching', () => {
    // The branch-determination section must reference reading config.json
    expect(content).toContain('config.json');
    // Must reference the "standing" field by name
    expect(content).toContain('"standing"');
  });

  it('[T1] "standing" field check appears in the standing-pool section', () => {
    expect(standingSection).toContain('standing');
    // The section heading must reference FR-MMT12 to confirm normative linkage
    expect(standingSection).toContain('FR-MMT12');
  });

  // ── [T2] standing: true branch present ───────────────────────────────────
  it('[T2] "standing: true" branch path is explicitly identified in the hook', () => {
    expect(content).toContain('standing: true');
  });

  it('[T2] a distinct "Standing Pool Path" subsection exists', () => {
    expect(standingSection).toContain('Standing Pool Path');
  });

  // ── [T3] Standing-pool path does NOT trigger dismissal / shutdown ─────────
  it('[T3] standing-pool path explicitly states "Do NOT trigger teammate dismissal or shutdown"', () => {
    expect(standingPathSection).toMatch(/do not trigger teammate dismissal/i);
  });

  it('[T3] standing-pool path states pool teammates remain alive', () => {
    // Must say teammates remain alive / persist
    expect(standingPathSection).toMatch(/remain alive/i);
  });

  it('[T3] standing-pool path skips dismissal flow', () => {
    expect(standingPathSection).toMatch(/skip the dismissal flow/i);
  });

  // ── [T4] max(existing, new) semantics ────────────────────────────────────
  it('[T4] "max(existing, new)" exact phrase is present in the standing section', () => {
    expect(standingSection).toContain('max(existing, new)');
  });

  it('[T4] max-semantics comparison logic (proposed_ts vs existing_ts) is present', () => {
    // The pseudocode must show the comparison that implements max semantics
    expect(standingPathSection).toMatch(/proposed_ts\s*(?:>|<=)\s*existing/);
  });

  // ── [T5] config.json.tmp + rename (canonical write) ──────────────────────
  it('[T5] "config.json.tmp" temporary write file referenced in standing section', () => {
    expect(standingSection).toContain('config.json.tmp');
  });

  it('[T5] rename from config.json.tmp to config.json is documented', () => {
    // Must show the rename step for the canonical config write
    expect(standingPathSection).toMatch(/rename[^]*config\.json\.tmp[^]*config\.json/s);
  });

  // ── [T6] .index.lock locking primitive referenced ─────────────────────────
  it('[T6] ".index.lock" lock directory is referenced in the standing section', () => {
    expect(standingSection).toContain('.index.lock');
  });

  it('[T6] mkdir acquire for .index.lock is present', () => {
    expect(standingPathSection).toContain('mkdir');
    expect(standingPathSection).toContain('.index.lock');
  });

  it('[T6] rmdir release for .index.lock is present', () => {
    expect(standingPathSection).toContain('rmdir');
    expect(standingPathSection).toContain('.index.lock');
  });

  // ── [T7] .index.json.tmp + rename (index write) ──────────────────────────
  it('[T7] ".index.json.tmp" temporary write file referenced in standing section', () => {
    expect(standingSection).toContain('.index.json.tmp');
  });

  it('[T7] rename from .index.json.tmp to index.json is documented', () => {
    expect(standingPathSection).toMatch(/rename[^]*\.index\.json\.tmp[^]*index\.json/s);
  });

  // ── [T8] 30-second debounce ───────────────────────────────────────────────
  it('[T8] debounce threshold of 30 seconds is specified', () => {
    expect(standingPathSection).toMatch(/30 second/i);
  });

  it('[T8] debounce logic skips write when last write was recent', () => {
    // The pseudocode must mention skipping when within the window
    expect(standingPathSection).toMatch(/skip.*write|last write.*30|30.*ago/i);
  });

  // ── [T9] Non-standing path preserves original dismissal / shutdown logic ──
  it('[T9] non-standing path section explicitly states existing behavior is unchanged', () => {
    expect(nonStandingSection).toMatch(/unchanged/i);
  });

  it('[T9] original dismissal notification to lead is still present in the hook', () => {
    // The original hook had "Notify lead via mailbox that the teammate is available for dismissal"
    expect(content).toMatch(/notify.*lead.*dismissal|available for dismissal/i);
  });

  it('[T9] "allow_cross_functional" configuration check is still present', () => {
    // The original hook includes cross-functional work logic
    expect(content).toContain('allow_cross_functional');
  });

  it('[T9] the non-standing flowchart still references exit 2 (keep working)', () => {
    // exit 2 must remain for non-standing assignment path
    expect(content).toContain('exit 2 (keep working)');
  });

  // ── [T10] Dual-write ordering: config.json first, then index.json ─────────
  it('[T10] crash-safety ordering (config.json first, index.json second) is documented', () => {
    // Must mention config.json before index.json in the ordering context
    expect(standingPathSection).toMatch(/config\.json.*first|config\.json.*then.*index/is);
  });

  // ── [T11] Exit code 0 on standing path ───────────────────────────────────
  it('[T11] exit code 0 is specified for the standing pool idle path', () => {
    expect(standingPathSection).toContain('exit 0');
  });

  // ── [T12] standing: false / absent falls through to non-standing path ─────
  it('[T12] "standing: false" or field-absent condition routes to non-standing path', () => {
    expect(content).toMatch(/standing.*false.*absent|standing.*false|field.*absent/i);
  });

});

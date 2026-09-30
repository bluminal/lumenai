/**
 * Task 50 (FR-HM23) port of idle-gate-standing.test.ts (Task 28's
 * standing-pool branch coverage; both the original test and its subject,
 * the now-removed synthex-plus plugin's hooks/teammate-idle-gate.md, were
 * deleted in Task 55), adapted for the real TeammateIdle command hook: that
 * doc described a prompt-mediated standing-pool branch (config.json reads, mkdir-based
 * locking, a max(existing, new) debounced dual-write) that a real command
 * hook cannot perform — it fires with no model turn attached, so it cannot
 * call TaskUpdate or write files on the teammate's behalf.
 *
 * plugins/synthex/hooks/teammate-idle-gate.md keeps the one invariant that
 * DOES reduce to a command hook: a standing-pool teammate is exempt from
 * this hook's non-standing work-matching/dismissal flow and always allows
 * idle — the Pool Lead owns `last_active_at` maintenance and dismissal
 * per templates/review.md's "Standing Pool Lifecycle Overlay" (ported
 * verbatim, unchanged: see lifecycle-overlay-synthex.test.ts). This is the
 * same "standing pools are exempt from per-session/per-event bookkeeping"
 * principle as the one-team-per-session exemption (FR-MMT26,
 * tests/schemas/one-team-exemption.test.ts) — see the doc's own callout —
 * which is why this file also covers that exemption language rather than
 * porting one-team-exemption.test.ts by itself: FR-MMT26's subject files
 * (synthex-plus's commands/team-implement.md and team-init.md) are
 * retired outright under FR-HM24 (Tasks 51-55), never folded into synthex,
 * so there is no synthex command file to point an equivalent test at.
 *
 * The doc-level assertions below (exit codes, standing-branch behavior,
 * exemption language) are the [T]-relevant surface of the port;
 * lifecycle-hooks-behavioral.test.ts (Layer 2) proves the corresponding
 * script behavior end-to-end (standing:true always allows idle regardless
 * of pending_tasks).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const HOOK_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'hooks', 'teammate-idle-gate.md'
);

const content = readFileSync(HOOK_PATH, 'utf-8');

describe('hooks/teammate-idle-gate.md (synthex) — Task 50 standing-pool branch [T] acceptance criteria', () => {

  // ── [T1] Doc references the standing field the script branches on ────────
  it('[T1] doc documents the "standing" field the script branches on', () => {
    expect(content).toContain('`standing`');
  });

  // ── [T2] standing:true branch is explicitly identified ───────────────────
  it('[T2] "standing" field is described as always allowing idle (exit 0)', () => {
    expect(content).toMatch(/standing[\s\S]{0,120}always allow(s)? idle/i);
  });

  // ── [T3] Standing-pool path does NOT trigger dismissal / assignment ──────
  it('[T3] doc states nothing else runs on the standing-pool branch', () => {
    expect(content).toMatch(/always allows idle[\s\S]{0,40}nothing else runs/i);
  });

  it('[T3] doc attributes lifecycle ownership to the Pool Lead, not this hook', () => {
    expect(content).toMatch(/Pool Lead/);
    expect(content).toContain('Lifecycle Overlay');
  });

  // ── [T4] Exemption framing — the "one-team" / per-session-bookkeeping
  //         exemption principle (see file header for the FR-MMT26 mapping) ──
  it('[T4] doc explicitly frames the standing branch as an exemption', () => {
    expect(content).toMatch(/exemption/i);
  });

  it('[T4] doc cross-references FR-MMT26 (the one-team-per-session exemption)', () => {
    expect(content).toContain('FR-MMT26');
  });

  // ── [T5] Non-standing path documented distinctly ──────────────────────────
  it('[T5] doc documents the non-standing role-matching path', () => {
    expect(content).toMatch(/non-standing/i);
    expect(content).toContain('role');
  });

  it('[T5] doc documents dependency respect (never assign a blocked task)', () => {
    expect(content).toMatch(/blocked/i);
  });

  it('[T5] doc documents the cross-functional fallback and its config key', () => {
    expect(content).toContain('allow_cross_functional');
  });

  // ── [T6] Exit code table present and correctly attributes standing→0 ─────
  it('[T6] exit code table documents 0 = allow idle and 2 = keep working', () => {
    expect(content).toMatch(/\|\s*0\s*\|/);
    expect(content).toMatch(/\|\s*2\s*\|/);
    expect(content.toLowerCase()).toContain('allow idle');
    expect(content.toLowerCase()).toContain('keep working');
  });

  it('[T6] exit code table\'s 0 row includes the standing-pool teammate case', () => {
    const zeroRow = content.split('\n').find((l) => /^\|\s*0\s*\|/.test(l.trim()));
    expect(zeroRow).toBeDefined();
    expect(zeroRow ?? '').toMatch(/standing/i);
  });

  // ── Script entry point and hook registration are named ────────────────────
  it('names the real script entry point (not a prompt-mediated logic file)', () => {
    expect(content).toContain('scripts/teammate-idle-gate.sh');
  });

  it('is framed as a script doc, not behavioral logic itself', () => {
    expect(content).toMatch(/not itself read or interpreted as behavioral logic/i);
  });

});

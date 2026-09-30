/**
 * Task 50 (FR-HM23) port note, updated by Task 54 (FR-HM2 tombstone) and
 * again by Task 55 (FR-HM2 removal), for the old synthex-plus Task 49
 * FR-MMT26/FR-MMT28 suite (tests/schemas/one-team-exemption.test.ts,
 * deleted in Task 54).
 *
 * That deleted file validated synthex-plus's commands/
 * team-implement.md and team-init.md — the one-team-per-session standing
 * -pool exemption (FR-MMT26) and orphan-scan warning (FR-MMT28). Under
 * FR-HM24, `team-implement` and `team-init` (along with team-review,
 * team-plan, and team-refine) are RETIRED outright, not folded into
 * synthex: "their behavior is the capability ladder inside the existing
 * commands" (docs/reqs/harness-modernization.md § FR-HM24). There is
 * therefore no plugins/synthex/commands/team-implement.md or team-init.md
 * for a byte-for-byte port to point at.
 *
 * What DOES port cleanly, and is exercised here, is the one exemption
 * principle FR-MMT26 established that also applies to Task 50's own
 * TeammateIdle hook: a standing pool's lifecycle is never governed by
 * per-session/per-event bookkeeping that applies to ordinary (non-standing)
 * teams. idle-gate-standing-synthex.test.ts asserts the hook doc's
 * explicit exemption framing and its FR-MMT26 cross-reference. Task 54's
 * migration-stub assertion (against the synthex-plus tombstone release) no
 * longer applies — Task 55 deletes the synthex-plus plugin tree outright,
 * so this file now asserts that removal instead.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SYNTHEX_PLUS_ROOT = join(import.meta.dirname, '..', '..', 'plugins', 'synthex-plus');
const SYNTHEX_TEAM_IMPLEMENT = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'commands', 'team-implement.md'
);
const IDLE_GATE_DOC = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'hooks', 'teammate-idle-gate.md'
);

describe('one-team-exemption (FR-MMT26) — Task 55 scope note', () => {
  it('team-implement.md / team-init.md are retired, not folded (FR-HM24) — no synthex copy exists', () => {
    expect(existsSync(SYNTHEX_TEAM_IMPLEMENT)).toBe(false);
  });

  it('the synthex-plus plugin tree is fully removed (Task 55, FR-HM2)', () => {
    expect(existsSync(SYNTHEX_PLUS_ROOT)).toBe(false);
  });

  it('the FR-MMT26 exemption principle carries into the synthex TeammateIdle hook doc', () => {
    const content = readFileSync(IDLE_GATE_DOC, 'utf-8');
    expect(content).toContain('FR-MMT26');
    expect(content).toMatch(/exemption/i);
  });
});

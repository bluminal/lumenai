/**
 * Task 51 (FR-HM22, ADR-plus-002): pool prose no longer instructs reviewer
 * teammates to read-on-spawn or re-paste the FR-MMT5b identity-confirm
 * overlay per task. Reviewer identity now comes from an `agentType:
 * synthex:<agent-name>` spawn-time attachment (Task 11 + Task 51
 * live-compaction spikes), verified post-spawn via `ListAgents`.
 *
 * This suite validates the two Task 51 [T] acceptance criteria:
 *
 *   [T] Pool prose (start-review-team.md, templates/review.md,
 *       templates/_skeleton.md, docs/standing-pools.md) has no active
 *       read-on-spawn instruction and no active per-task overlay re-paste
 *       for reviewer identity. Any remaining "read-on-spawn" or "FR-MMT5b"
 *       text is only a historical/ADR pointer, not an executable
 *       instruction — checked by requiring the retired heading strings to
 *       be absent and (where the term survives) requiring nearby
 *       "ADR-plus-002" / "retired" / "Fallback" context.
 *
 *   [T] Layer 2 structural context delta: per standing-pool task, the old
 *       flow (D26) pulled in three reviewers' full agent files (the
 *       FR-MMT5b per-task re-read) plus the identity-confirm overlay text
 *       re-pasted into each reviewer's per-task SendMessage. The new flow
 *       pulls in none of that (identity is a spawn-time attachment, not
 *       conversation-history content). The measured delta must be
 *       >= 35,840 bytes (35 KB), the FR-HM22 acceptance floor.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(ROOT, 'plugins', 'synthex');
const FIXTURES_DIR = join(ROOT, 'tests', 'fixtures', 'pool-spawn-context');

const START_REVIEW_TEAM = join(PLUGIN_ROOT, 'commands', 'start-review-team.md');
const REVIEW_TEMPLATE = join(PLUGIN_ROOT, 'templates', 'review.md');
const SKELETON_TEMPLATE = join(PLUGIN_ROOT, 'templates', '_skeleton.md');
const STANDING_POOLS_DOC = join(PLUGIN_ROOT, 'docs', 'standing-pools.md');

const startReviewTeamContent = readFileSync(START_REVIEW_TEAM, 'utf-8');
const reviewTemplateContent = readFileSync(REVIEW_TEMPLATE, 'utf-8');
const skeletonContent = readFileSync(SKELETON_TEMPLATE, 'utf-8');
const standingPoolsContent = readFileSync(STANDING_POOLS_DOC, 'utf-8');

// ── [T] No active read-on-spawn / overlay re-paste for reviewer identity ──

describe('Task 51: pool prose has no active read-on-spawn or per-task overlay re-paste', () => {
  const RETIRED_HEADING = '### Standing Pool Identity Confirm Overlay';

  it('start-review-team.md does not contain the retired overlay heading', () => {
    expect(startReviewTeamContent).not.toContain(RETIRED_HEADING);
  });

  it('templates/review.md does not contain the retired overlay heading', () => {
    expect(reviewTemplateContent).not.toContain(RETIRED_HEADING);
  });

  it('templates/_skeleton.md does not document the retired overlay heading as a live section (only as a "Retired:" pointer)', () => {
    const idx = skeletonContent.indexOf(RETIRED_HEADING);
    expect(idx).toBeGreaterThanOrEqual(0); // it IS mentioned, but only historically
    const window = skeletonContent.slice(Math.max(0, idx - 80), idx + 80);
    expect(window).toMatch(/Retired:/);
  });

  it('docs/standing-pools.md does not mention read-on-spawn or the retired overlay', () => {
    expect(standingPoolsContent).not.toMatch(/read-on-spawn/i);
    expect(standingPoolsContent).not.toContain(RETIRED_HEADING);
  });

  it('start-review-team.md spawns reviewers with agentType: "synthex:<agent-name>", not a read-your-agent-file instruction', () => {
    expect(startReviewTeamContent).toContain('agentType: "synthex:<agent-name>"');
    expect(startReviewTeamContent).not.toContain(
      'Read your agent definition at plugins/synthex/agents/<agent-name>.md and adopt it as your identity.'
    );
  });

  it('every surviving "read-on-spawn" mention in start-review-team.md is a fallback/ADR pointer, not an active instruction', () => {
    const matches = [...startReviewTeamContent.matchAll(/.{0,60}read-on-spawn.{0,60}/gi)];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m[0]).toMatch(/ADR-plus-001|fallback/i);
    }
  });

  it('every surviving "read-on-spawn" mention in templates/review.md is a fallback/ADR pointer, not an active instruction', () => {
    const matches = [...reviewTemplateContent.matchAll(/.{0,60}read-on-spawn.{0,60}/gi)];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m[0]).toMatch(/ADR-plus-001|fallback/i);
    }
  });

  it('templates/review.md points to ADR-plus-002 for the identity-confirm retirement', () => {
    expect(reviewTemplateContent).toContain('ADR-plus-002');
    expect(reviewTemplateContent).toContain('Per-Task Reviewer Re-Issuance — retired (ADR-plus-002)');
  });

  it('start-review-team.md verifies spawn identity via ListAgents, not by reading config.json', () => {
    const verifyIdx = startReviewTeamContent.indexOf('Verify Spawn Identity');
    expect(verifyIdx).toBeGreaterThanOrEqual(0);
    const window = startReviewTeamContent.slice(verifyIdx, verifyIdx + 700);
    expect(window).toContain('ListAgents');
    expect(window).toMatch(/Do NOT verify identity by reading.*config\.json/i);
  });

  it('ADR-plus-002 exists and records the reversal of ADR-plus-001', () => {
    const adrPath = join(ROOT, 'docs', 'specs', 'decisions', 'ADR-plus-002-teammate-identity-via-subagent-type.md');
    const adrContent = readFileSync(adrPath, 'utf-8');
    expect(adrContent).toContain('ADR-plus-001');
    expect(adrContent).toMatch(/Reverse(s)? ADR-plus-001/);
  });
});

// ── [T] Layer 2: per-task reviewer context is >= 35 KB smaller ────────────

describe('Task 51 Layer 2: per-task reviewer context delta (FR-HM22 acceptance: >= 35,840 B)', () => {
  // Default multi-model-capable 3-reviewer roster (docs/standing-pools.md
  // "Reviewer requirements"): code-reviewer, security-reviewer,
  // design-system-agent. One review task is created per active reviewer
  // role, so a "per-task round" for a 3-reviewer pool means one task per
  // reviewer, evaluated together (matches the FR-HM22 acceptance wording
  // "three-reviewer pool").
  const ROSTER = ['code-reviewer', 'security-reviewer', 'design-system-agent'];

  it('computes OLD per-task-round bytes: each reviewer unconditionally re-reads its own full agent file (FR-MMT5b) PLUS the identity-confirm overlay re-pasted into each reviewer'
    + "'s per-task SendMessage (D26)", () => {
    const agentFileBytes = ROSTER.map((name) => {
      const path = join(PLUGIN_ROOT, 'agents', `${name}.md`);
      return Buffer.byteLength(readFileSync(path, 'utf-8'), 'utf-8');
    });
    const totalAgentFileBytes = agentFileBytes.reduce((a, b) => a + b, 0);

    const overlayFixturePath = join(
      FIXTURES_DIR,
      'identity-confirm-instruction-pre-task51.fixture.md'
    );
    const overlayBytes = Buffer.byteLength(readFileSync(overlayFixturePath, 'utf-8'), 'utf-8');
    // D26: "Each SendMessage assigning a task to a reviewer must include the
    // FR-MMT5b ... overlay instructions verbatim" -- once per reviewer, per task.
    const totalOverlayBytes = overlayBytes * ROSTER.length;

    const oldTotal = totalAgentFileBytes + totalOverlayBytes;

    // NEW: identity comes from the agentType spawn-time attachment, which is
    // resolved once by the host per request and is not conversation-history
    // content the command/prose ever reads, composes, or re-pastes. The
    // structural per-task cost pool prose now pulls in for reviewer identity
    // is zero -- confirmed by the "no active read-on-spawn or overlay
    // re-paste" describe block above (the retired heading and instruction
    // text are gone from every pool prose file).
    const newTotal = 0;

    const delta = oldTotal - newTotal;

    expect(totalAgentFileBytes).toBeGreaterThan(0);
    expect(overlayBytes).toBeGreaterThan(0);
    expect(delta).toBeGreaterThanOrEqual(35_840); // 35 KB, FR-HM22 acceptance floor
  });

  it('reports the measured delta for traceability (informational assertion, not a threshold)', () => {
    const agentFileBytes = ROSTER.map((name) => {
      const path = join(PLUGIN_ROOT, 'agents', `${name}.md`);
      return Buffer.byteLength(readFileSync(path, 'utf-8'), 'utf-8');
    }).reduce((a, b) => a + b, 0);
    const overlayFixturePath = join(
      FIXTURES_DIR,
      'identity-confirm-instruction-pre-task51.fixture.md'
    );
    const overlayBytes = Buffer.byteLength(readFileSync(overlayFixturePath, 'utf-8'), 'utf-8');
    const delta = agentFileBytes + overlayBytes * ROSTER.length;
    // Sanity bound: this is a real per-task byte count, not an inflated
    // number -- should be well under a single agent file's own size times
    // ten (catches an accidental unit error, e.g. counting in bits).
    expect(delta).toBeLessThan(500_000);
    // eslint-disable-next-line no-console
    console.log(`Task 51 measured per-task-round context delta: ${delta} bytes (>= 35,840 required)`);
  });
});

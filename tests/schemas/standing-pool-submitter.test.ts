/**
 * Layer 1: Structural validation tests for the Standing Pool Submitter agent
 * at plugins/synthex-plus/agents/standing-pool-submitter.md.
 *
 * Validates all [T] acceptance criteria from Task 35:
 *   [T1]  Agent declares model: haiku in YAML frontmatter
 *   [T2]  Agent re-reads config.json before submission to detect draining/stopping (FR-MMT14a)
 *   [T3]  Atomic write: .tmp + rename pattern for task files, mailbox notifications, and report-to envelope
 *   [T4]  UUID-based filenames for tasks, mailbox messages, and report-to path
 *   [T5]  Polling interval: every 2 seconds with backoff to maximum of 10 seconds
 *   [T6]  Timeout fallback verbatim text fragments present
 *   [T7]  Scope constraint: agent does NOT own FR-MMT24 recovery, no "Recovery" heading
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const AGENT_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'agents', 'standing-pool-submitter.md'
);

const content = readFileSync(AGENT_PATH, 'utf-8');

describe('standing-pool-submitter.md — Task 35 [T] acceptance criteria', () => {

  // ── [T1] model: haiku in YAML frontmatter ────────────────────────────────
  describe('[T1] YAML frontmatter declares model: haiku', () => {
    it('[T1] raw string "model: haiku" is present in the file', () => {
      expect(content).toContain('model: haiku');
    });

    it('[T1] frontmatter block (---) opens and closes before the first heading', () => {
      // Frontmatter must be at the top of the file
      expect(content).toMatch(/^---\n/);
      expect(content).toMatch(/^---\nmodel: haiku\n---/m);
    });
  });

  // ── [T2] config.json re-read + draining/stopping check (FR-MMT14a) ───────
  describe('[T2] pre-submission drain check re-reads config.json (FR-MMT14a)', () => {
    it('[T2] "config.json" is referenced for the drain check', () => {
      expect(content).toContain('config.json');
    });

    it('[T2] "draining" state is checked before submission', () => {
      expect(content).toContain('draining');
    });

    it('[T2] "stopping" state is checked before submission', () => {
      expect(content).toContain('stopping');
    });

    it('[T2] FR-MMT14a is cited', () => {
      expect(content).toContain('FR-MMT14a');
    });

    it('[T2] drain check returns fell-back-pool-draining routing decision', () => {
      expect(content).toContain('fell-back-pool-draining');
    });
  });

  // ── [T3] Atomic write: .tmp + rename for tasks, mailbox, envelope ─────────
  describe('[T3] atomic write pattern (.tmp + rename) for all file writes', () => {
    it('[T3] ".json.tmp" pattern is present (temporary file suffix)', () => {
      expect(content).toContain('.json.tmp');
    });

    it('[T3] ".tmp" suffix is present', () => {
      expect(content).toContain('.tmp');
    });

    it('[T3] "rename" step is documented for atomic writes', () => {
      expect(content).toContain('rename');
    });

    it('[T3] atomic write documented for task files (task_uuid.json.tmp pattern)', () => {
      // Task file writes must reference the .tmp + rename pattern
      expect(content).toMatch(/task[^]*\.json\.tmp|<task_uuid>\.json\.tmp/i);
    });

    it('[T3] atomic write documented for mailbox notification', () => {
      // Mailbox notification must reference .tmp + rename pattern
      expect(content).toMatch(/inboxes[^]*\.json\.tmp|batch_uuid[^]*\.json\.tmp/is);
    });

    it('[T3] FR-MMT16 atomicity is cited for the write pattern', () => {
      expect(content).toContain('FR-MMT16');
    });
  });

  // ── [T4] UUID-based filenames ─────────────────────────────────────────────
  describe('[T4] UUID-based filenames for tasks, mailbox messages, and report-to path', () => {
    it('[T4] "uuid" is referenced for task filenames', () => {
      expect(content).toMatch(/task_uuid|<uuid>|uuid.*task/i);
    });

    it('[T4] "uuid" is referenced for mailbox messages', () => {
      expect(content).toMatch(/batch_uuid|uuid.*mailbox|mailbox.*uuid/i);
    });

    it('[T4] "uuid" is referenced for the report-to path', () => {
      expect(content).toMatch(/report_uuid|uuid.*report/i);
    });

    it('[T4] UUID-based filenames described as guaranteeing uniqueness across concurrent submitters', () => {
      // The doc should explain why UUIDs are used
      expect(content).toMatch(/uuid.*unique|unique.*uuid/i);
    });
  });

  // ── [T5] Polling interval: every 2 seconds, backoff to 10 seconds ─────────
  describe('[T5] polling interval and backoff configuration', () => {
    it('[T5] "every 2 seconds" or "every 2s" polling interval is specified', () => {
      expect(content).toMatch(/every 2 seconds|every 2s|2 seconds|2s/i);
    });

    it('[T5] backoff to a maximum of 10 seconds is specified', () => {
      expect(content).toMatch(/maximum of 10 seconds|max.*10 second|10s.*backoff|backoff.*10/i);
    });

    it('[T5] polling starts at 2-second interval', () => {
      expect(content).toMatch(/interval\s*=\s*2s|start.*2s|2 seconds.*poll|poll.*2 seconds/i);
    });

    it('[T5] FR-MMT16 is cited for the polling behavior', () => {
      // Polling is defined in FR-MMT16 §2 step 4
      expect(content).toContain('FR-MMT16');
    });
  });

  // ── [T6] Timeout fallback verbatim text ────────────────────────────────────
  describe('[T6] timeout fallback emits the required verbatim one-line note', () => {
    it('[T6] verbatim note begins with "Pool \'" fragment', () => {
      expect(content).toContain("Pool '");
    });

    it('[T6] verbatim note contains "did not return a report within" fragment', () => {
      expect(content).toContain('did not return a report within');
    });

    it('[T6] verbatim note contains "falling back to fresh-spawn review" fragment', () => {
      expect(content).toContain('falling back to fresh-spawn review');
    });

    it('[T6] fell-back-timeout routing decision is returned on timeout', () => {
      expect(content).toContain('fell-back-timeout');
    });

    it('[T6] FR-MMT16a is cited for the timeout behavior', () => {
      expect(content).toContain('FR-MMT16a');
    });
  });

  // ── [T7] Scope constraint: does NOT own FR-MMT24 recovery ─────────────────
  describe('[T7] scope constraint: agent does not own FR-MMT24 recovery', () => {
    it('[T7] document states agent does not own FR-MMT24 recovery (phrase "does not own")', () => {
      expect(content).toMatch(/does not own.*FR-MMT24|does not own.*recovery/i);
    });

    it('[T7] "recovery" appears in the document (documenting the non-ownership)', () => {
      expect(content).toMatch(/recovery/i);
    });

    it('[T7] no "## Recovery" section heading (agent does not implement recovery)', () => {
      expect(content).not.toMatch(/^#{1,3}\s+Recovery\s*$/im);
    });

    it('[T7] no "### Recovery" section heading', () => {
      expect(content).not.toMatch(/^###\s+Recovery\s*$/im);
    });

    it('[T7] FR-MMT24 is cited (as the recovery mechanism owned by the caller)', () => {
      expect(content).toContain('FR-MMT24');
    });
  });

  // ── FR-MMT18 (race conditions documented) ─────────────────────────────────
  describe('FR-MMT18 race conditions documented', () => {
    it('FR-MMT18 is cited (file-based task list serializes concurrent submissions naturally)', () => {
      expect(content).toContain('FR-MMT18');
    });

    it('concurrent submitter uniqueness is addressed (report-to path isolation)', () => {
      expect(content).toMatch(/concurrent.*submitter|concurrent.*submission|unique.*report.*path/i);
    });
  });

});

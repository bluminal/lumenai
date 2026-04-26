/**
 * Layer 2: Fixture validation tests for the discovery-and-submit submission scenario.
 *
 * Exercises the full flow: review-code discovers a matching pool via inline discovery,
 * invokes standing-pool-submitter, and receives a success envelope.
 *
 * Acceptance criteria covered:
 *   [1] Fixture structure has all required fields
 *   [2] expected.routing_decision === "routed-to-pool"
 *   [3] expected.submitter_invoked === true
 *   [4] expected.tasks_submitted_count === 2
 *   [5] expected.envelope_status === "success"
 *   [6] Notification text matches verbatim: "Routing to standing pool '{pool_name}' (multi-model: no)."
 *   [7] Provenance line matches verbatim: "Review path: standing pool '{pool_name}' (multi-model: no)."
 *   [8] submitter_outputs has correct envelope shape (status, report, error, metadata)
 *   [9] submitter_inputs.tasks is a non-empty array
 *   [10] plugins/synthex/commands/review-code.md contains provenance line text verbatim
 *   [11] plugins/synthex-plus/agents/standing-pool-submitter.md documents .tmp + rename pattern
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateInlineDiscoveryOutput } from './standing-pool-cleanup.js';
import {
  assertDiscoveryAndSubmitFixture,
  assertRoutingDecisionIsRoutedToPool,
  assertSubmitterInvoked,
  assertTasksSubmittedCount,
  assertEnvelopeStatus,
  assertNotificationText,
  assertProvenanceLine,
  assertSubmitterInputTasksNonEmpty,
  assertSubmitterInputPoolName,
  assertEnvelopeShape,
} from '../fixtures/multi-model-teams/submission/discovery-and-submit/assertions.js';

// ── Load fixture ────────────────────────────────────────────────────────────

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..', 'fixtures', 'multi-model-teams', 'submission', 'discovery-and-submit', 'fixture.json'
);

const REVIEW_CODE_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'commands', 'review-code.md'
);

const SUBMITTER_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'agents', 'standing-pool-submitter.md'
);

const fixtureRaw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
const fixture = fixtureRaw as {
  scenario: string;
  description: string;
  setup: {
    pool_name: string;
    pool_roster: string[];
    pool_state: string;
    multi_model: boolean;
    last_active_at: string;
    ttl_minutes: number;
    routing_mode: string;
    matching_mode: string;
    submission_timeout_seconds: number;
    required_reviewer_set: string[];
    submitted_tasks: Array<{ subject: string; description: string }>;
  };
  submitter_inputs: {
    pool_name: string;
    tasks: Array<{ subject: string; description: string }>;
    submission_timeout_seconds: number;
  };
  submitter_outputs: {
    status: 'success' | 'failed';
    report: string | null;
    error: { code: string; message: string } | null;
    metadata: {
      pool_name: string;
      multi_model: boolean;
      task_uuids: string[];
      completed_at: string;
    };
  };
  expected: {
    routing_decision: string;
    pool_name: string;
    multi_model: boolean;
    submitter_invoked: boolean;
    tasks_submitted_count: number;
    envelope_status: string;
    report_surfaced: boolean;
    notification_contains: string;
    provenance_line: string;
  };
};

// ── [1] Fixture structure ──────────────────────────────────────────────────

describe('[1] fixture structure — required fields present', () => {
  it('fixture.json parses as a non-null object', () => {
    expect(typeof fixtureRaw).toBe('object');
    expect(fixtureRaw).not.toBeNull();
  });

  it('assertDiscoveryAndSubmitFixture returns valid', () => {
    const result = assertDiscoveryAndSubmitFixture(fixtureRaw);
    expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('scenario field is "discovery-and-submit"', () => {
    expect(fixture.scenario).toBe('discovery-and-submit');
  });

  it('description is a non-empty string', () => {
    expect(typeof fixture.description).toBe('string');
    expect(fixture.description.length).toBeGreaterThan(0);
  });

  it('setup block has pool_name', () => {
    expect(typeof fixture.setup.pool_name).toBe('string');
    expect(fixture.setup.pool_name.length).toBeGreaterThan(0);
  });

  it('setup block has pool_roster as non-empty array', () => {
    expect(Array.isArray(fixture.setup.pool_roster)).toBe(true);
    expect(fixture.setup.pool_roster.length).toBeGreaterThan(0);
  });

  it('setup block has submission_timeout_seconds as a number', () => {
    expect(typeof fixture.setup.submission_timeout_seconds).toBe('number');
    expect(fixture.setup.submission_timeout_seconds).toBeGreaterThan(0);
  });
});

// ── [2] routing_decision === "routed-to-pool" ─────────────────────────────

describe('[2] expected.routing_decision is "routed-to-pool"', () => {
  it('assertRoutingDecisionIsRoutedToPool returns null (pass)', () => {
    const error = assertRoutingDecisionIsRoutedToPool(fixture);
    expect(error).toBeNull();
  });

  it('expected.routing_decision is exactly "routed-to-pool"', () => {
    expect(fixture.expected.routing_decision).toBe('routed-to-pool');
  });

  it('routing_decision passes validateInlineDiscoveryOutput (FR-MMT30 schema)', () => {
    // Build a minimal routed-to-pool inline discovery output for schema validation.
    // The schema requires pool_name, multi_model, and match_rationale when routing_decision
    // is "routed-to-pool".
    const discoveryOutput = {
      routing_decision: fixture.expected.routing_decision,
      pool_name: fixture.expected.pool_name,
      multi_model: fixture.expected.multi_model,
      match_rationale: 'Pool roster covers required-reviewer-set under matching_mode: covers',
    };
    const result = validateInlineDiscoveryOutput(discoveryOutput);
    expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

// ── [3] submitter_invoked === true ────────────────────────────────────────

describe('[3] expected.submitter_invoked is true', () => {
  it('assertSubmitterInvoked returns null (pass)', () => {
    const error = assertSubmitterInvoked(fixture);
    expect(error).toBeNull();
  });

  it('expected.submitter_invoked is exactly true', () => {
    expect(fixture.expected.submitter_invoked).toBe(true);
  });
});

// ── [4] tasks_submitted_count === 2 ──────────────────────────────────────

describe('[4] expected.tasks_submitted_count is 2', () => {
  it('assertTasksSubmittedCount returns null (pass)', () => {
    const error = assertTasksSubmittedCount(fixture);
    expect(error).toBeNull();
  });

  it('expected.tasks_submitted_count is exactly 2', () => {
    expect(fixture.expected.tasks_submitted_count).toBe(2);
  });

  it('setup.submitted_tasks has 2 entries matching tasks_submitted_count', () => {
    expect(fixture.setup.submitted_tasks).toHaveLength(fixture.expected.tasks_submitted_count);
  });

  it('submitter_inputs.tasks has 2 entries matching tasks_submitted_count', () => {
    expect(fixture.submitter_inputs.tasks).toHaveLength(fixture.expected.tasks_submitted_count);
  });

  it('submitter_outputs.metadata.task_uuids has 2 entries', () => {
    expect(fixture.submitter_outputs.metadata.task_uuids).toHaveLength(
      fixture.expected.tasks_submitted_count
    );
  });
});

// ── [5] envelope_status === "success" ────────────────────────────────────

describe('[5] expected.envelope_status is "success"', () => {
  it('assertEnvelopeStatus returns null (pass)', () => {
    const error = assertEnvelopeStatus(fixture);
    expect(error).toBeNull();
  });

  it('expected.envelope_status is exactly "success"', () => {
    expect(fixture.expected.envelope_status).toBe('success');
  });

  it('submitter_outputs.status is "success" (matches expected.envelope_status)', () => {
    expect(fixture.submitter_outputs.status).toBe('success');
  });
});

// ── [6] Notification text verbatim ────────────────────────────────────────

describe('[6] notification text verbatim: "Routing to standing pool \'review-pool-a\' (multi-model: no)."', () => {
  it('assertNotificationText returns null (pass)', () => {
    const error = assertNotificationText(fixture);
    expect(error).toBeNull();
  });

  it('expected.notification_contains matches verbatim routing notification', () => {
    const poolName = fixture.expected.pool_name;
    expect(fixture.expected.notification_contains).toBe(
      `Routing to standing pool '${poolName}' (multi-model: no).`
    );
  });

  it('notification_contains includes the pool name from expected.pool_name', () => {
    expect(fixture.expected.notification_contains).toContain(fixture.expected.pool_name);
  });

  it('notification_contains includes "(multi-model: no)" (native pool, not multi-model)', () => {
    expect(fixture.expected.notification_contains).toContain('(multi-model: no)');
  });

  it('notification_contains does NOT include "(multi-model: yes)"', () => {
    expect(fixture.expected.notification_contains).not.toContain('(multi-model: yes)');
  });
});

// ── [7] Provenance line verbatim ──────────────────────────────────────────

describe('[7] provenance line verbatim: "Review path: standing pool \'review-pool-a\' (multi-model: no)."', () => {
  it('assertProvenanceLine returns null (pass)', () => {
    const error = assertProvenanceLine(fixture);
    expect(error).toBeNull();
  });

  it('expected.provenance_line matches verbatim NFR-MMT7 Item 4 format', () => {
    const poolName = fixture.expected.pool_name;
    expect(fixture.expected.provenance_line).toBe(
      `Review path: standing pool '${poolName}' (multi-model: no).`
    );
  });

  it('provenance_line starts with "Review path: standing pool"', () => {
    expect(fixture.expected.provenance_line).toMatch(/^Review path: standing pool/);
  });

  it('provenance_line ends with "(multi-model: no)."', () => {
    expect(fixture.expected.provenance_line).toMatch(/\(multi-model: no\)\.$/);
  });

  it('provenance_line includes the pool name from expected.pool_name', () => {
    expect(fixture.expected.provenance_line).toContain(fixture.expected.pool_name);
  });
});

// ── [8] submitter_outputs envelope shape ─────────────────────────────────

describe('[8] submitter_outputs envelope shape (FR-MMT16a output contract)', () => {
  it('assertEnvelopeShape returns valid', () => {
    const result = assertEnvelopeShape(fixture);
    expect(result.errors, `Envelope shape errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('submitter_outputs.status is "success" or "failed"', () => {
    expect(['success', 'failed']).toContain(fixture.submitter_outputs.status);
  });

  it('submitter_outputs.report is a string (not null) when status is "success"', () => {
    expect(fixture.submitter_outputs.status).toBe('success');
    expect(typeof fixture.submitter_outputs.report).toBe('string');
    expect(fixture.submitter_outputs.report).not.toBeNull();
  });

  it('submitter_outputs.error is null when status is "success"', () => {
    expect(fixture.submitter_outputs.error).toBeNull();
  });

  it('submitter_outputs.metadata.pool_name matches setup.pool_name', () => {
    expect(fixture.submitter_outputs.metadata.pool_name).toBe(fixture.setup.pool_name);
  });

  it('submitter_outputs.metadata.multi_model is false (native pool)', () => {
    expect(fixture.submitter_outputs.metadata.multi_model).toBe(false);
  });

  it('submitter_outputs.metadata.task_uuids is a non-empty array', () => {
    expect(Array.isArray(fixture.submitter_outputs.metadata.task_uuids)).toBe(true);
    expect(fixture.submitter_outputs.metadata.task_uuids.length).toBeGreaterThan(0);
  });

  it('submitter_outputs.metadata.completed_at is a non-empty string', () => {
    expect(typeof fixture.submitter_outputs.metadata.completed_at).toBe('string');
    expect(fixture.submitter_outputs.metadata.completed_at.length).toBeGreaterThan(0);
  });

  it('expected.report_surfaced is true', () => {
    expect(fixture.expected.report_surfaced).toBe(true);
  });
});

// ── [9] submitter_inputs.tasks is non-empty array ────────────────────────

describe('[9] submitter_inputs.tasks is a non-empty array', () => {
  it('assertSubmitterInputTasksNonEmpty returns null (pass)', () => {
    const error = assertSubmitterInputTasksNonEmpty(fixture);
    expect(error).toBeNull();
  });

  it('submitter_inputs.tasks is an array', () => {
    expect(Array.isArray(fixture.submitter_inputs.tasks)).toBe(true);
  });

  it('submitter_inputs.tasks has at least one task', () => {
    expect(fixture.submitter_inputs.tasks.length).toBeGreaterThan(0);
  });

  it('each task in submitter_inputs.tasks has a subject field', () => {
    for (const task of fixture.submitter_inputs.tasks) {
      expect(typeof task.subject).toBe('string');
      expect(task.subject.length).toBeGreaterThan(0);
    }
  });

  it('each task in submitter_inputs.tasks has a description field', () => {
    for (const task of fixture.submitter_inputs.tasks) {
      expect(typeof task.description).toBe('string');
    }
  });

  it('submitter_inputs.pool_name matches expected.pool_name (assertSubmitterInputPoolName)', () => {
    const error = assertSubmitterInputPoolName(fixture);
    expect(error).toBeNull();
  });

  it('submitter_inputs.submission_timeout_seconds matches setup.submission_timeout_seconds', () => {
    expect(fixture.submitter_inputs.submission_timeout_seconds).toBe(
      fixture.setup.submission_timeout_seconds
    );
  });
});

// ── [10] review-code.md contains provenance line text verbatim ───────────

describe('[10] plugins/synthex/commands/review-code.md contains provenance line verbatim', () => {
  const reviewCodeContent = readFileSync(REVIEW_CODE_MD_PATH, 'utf-8');

  it('review-code.md is readable and non-empty', () => {
    expect(reviewCodeContent.length).toBeGreaterThan(0);
  });

  it('review-code.md contains the verbatim provenance line template (NFR-MMT7 Item 4)', () => {
    // The normative form uses template variables per the spec
    expect(reviewCodeContent).toContain(
      "Review path: standing pool '{pool_name}' (multi-model: {yes|no})."
    );
  });

  it('review-code.md contains "Review path: standing pool" (provenance line prefix)', () => {
    expect(reviewCodeContent).toContain('Review path: standing pool');
  });

  it('review-code.md contains the verbatim routing notification template (FR-MMT17)', () => {
    expect(reviewCodeContent).toContain(
      "Routing to standing pool '{pool_name}' (multi-model: {yes|no})."
    );
  });
});

// ── [11] standing-pool-submitter.md documents .tmp + rename pattern ───────

describe('[11] plugins/synthex-plus/agents/standing-pool-submitter.md documents .tmp + rename', () => {
  const submitterContent = readFileSync(SUBMITTER_MD_PATH, 'utf-8');

  it('standing-pool-submitter.md is readable and non-empty', () => {
    expect(submitterContent.length).toBeGreaterThan(0);
  });

  it('documents the .tmp file extension (atomic write step 1)', () => {
    expect(submitterContent).toContain('.tmp');
  });

  it('documents the mv (rename) step for atomic writes', () => {
    expect(submitterContent).toContain('mv -f');
  });

  it('documents the .tmp + rename as atomic write pattern (FR-MMT16 §2)', () => {
    // The doc must contain both the .tmp pattern and the rename together in context
    const hasTmpPattern = submitterContent.includes('.json.tmp');
    const hasRenamePattern = submitterContent.includes('mv -f');
    expect(hasTmpPattern).toBe(true);
    expect(hasRenamePattern).toBe(true);
  });

  it('documents that a partial write is never visible (atomicity guarantee)', () => {
    const hasAtomicLanguage =
      submitterContent.includes('partial write') ||
      submitterContent.includes('atomic') ||
      submitterContent.includes('atomically');
    expect(hasAtomicLanguage).toBe(true);
  });

  it('documents the .tmp + rename rule in the Behavioral Rules section', () => {
    // Behavioral Rules section must reference the .tmp + rename pattern
    const rulesSection = submitterContent.includes('Behavioral Rules');
    expect(rulesSection).toBe(true);
    // The rule must appear in the document alongside .tmp
    const ruleWithTmp = submitterContent.includes('.tmp') && submitterContent.includes('rename');
    expect(ruleWithTmp).toBe(true);
  });
});

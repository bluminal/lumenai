/**
 * Layer 2: Fixture validation tests for the concurrent-submitters scenario.
 *
 * Models two independent sessions submitting to the same standing pool concurrently.
 * UUID-based report-to path isolation (FR-MMT16 §2, FR-MMT18 §5.1) ensures each
 * session receives the correct report envelope without collision.
 *
 * Acceptance criteria covered:
 *   [1]  Fixture structure has all required fields
 *   [2]  session_a.report_to !== session_b.report_to (paths differ — no collision)
 *   [3]  session_a.report_uuid !== session_b.report_uuid
 *   [4]  task_uuids from session_a and session_b do not overlap
 *   [5]  expected.report_to_paths_differ === true
 *   [6]  expected.no_report_collision === true
 *   [7]  expected.pool_serializes_work === true
 *   [8]  plugins/synthex-plus/agents/standing-pool-submitter.md contains "UUID" or "uuid"
 *   [9]  plugins/synthex-plus/agents/standing-pool-submitter.md contains "report_to" field doc
 *   [10] docs/specs/multi-model-teams/routing.md contains "FR-MMT18"
 *   [11] expected.fr_mmt18_documented_behavior is a non-empty string
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  assertConcurrentSubmittersFixture,
  assertReportToPathsDiffer,
  assertReportUuidsDiffer,
  assertTaskUuidsNoOverlap,
  assertExpectedReportToPathsDiffer,
  assertExpectedNoReportCollision,
  assertExpectedPoolSerializesWork,
  assertFrMmt18DocumentedBehavior,
} from '../fixtures/multi-model-teams/submission/concurrent-submitters/assertions.js';

// ── Load fixture ────────────────────────────────────────────────────────────

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..', 'fixtures', 'multi-model-teams', 'submission', 'concurrent-submitters', 'fixture.json'
);

const SUBMITTER_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'agents', 'standing-pool-submitter.md'
);

const ROUTING_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'docs', 'specs', 'multi-model-teams', 'routing.md'
);

const fixtureRaw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
const fixture = fixtureRaw as {
  scenario: string;
  description: string;
  setup: {
    pool_name: string;
    pool_roster: string[];
    pool_state: string;
  };
  session_a: {
    report_uuid: string;
    task_uuids: string[];
    report_to: string;
    submitted_at: string;
  };
  session_b: {
    report_uuid: string;
    task_uuids: string[];
    report_to: string;
    submitted_at: string;
  };
  expected: {
    session_a_report_to_unique: boolean;
    session_b_report_to_unique: boolean;
    report_to_paths_differ: boolean;
    task_uuids_no_overlap: boolean;
    both_sessions_complete: boolean;
    no_report_collision: boolean;
    pool_serializes_work: boolean;
    fr_mmt18_documented_behavior: string;
  };
};

// ── [1] Fixture structure ──────────────────────────────────────────────────

describe('[1] fixture structure — required fields present', () => {
  it('fixture.json parses as a non-null object', () => {
    expect(typeof fixtureRaw).toBe('object');
    expect(fixtureRaw).not.toBeNull();
  });

  it('assertConcurrentSubmittersFixture returns valid', () => {
    const result = assertConcurrentSubmittersFixture(fixtureRaw);
    expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('scenario field is "concurrent-submitters"', () => {
    expect(fixture.scenario).toBe('concurrent-submitters');
  });

  it('description is a non-empty string', () => {
    expect(typeof fixture.description).toBe('string');
    expect(fixture.description.length).toBeGreaterThan(0);
  });

  it('setup.pool_name is a non-empty string', () => {
    expect(typeof fixture.setup.pool_name).toBe('string');
    expect(fixture.setup.pool_name.length).toBeGreaterThan(0);
  });

  it('setup.pool_roster is a non-empty array', () => {
    expect(Array.isArray(fixture.setup.pool_roster)).toBe(true);
    expect(fixture.setup.pool_roster.length).toBeGreaterThan(0);
  });

  it('setup.pool_state is "idle"', () => {
    expect(fixture.setup.pool_state).toBe('idle');
  });

  it('session_a block is present with required fields', () => {
    expect(typeof fixture.session_a.report_uuid).toBe('string');
    expect(fixture.session_a.report_uuid.length).toBeGreaterThan(0);
    expect(Array.isArray(fixture.session_a.task_uuids)).toBe(true);
    expect(fixture.session_a.task_uuids.length).toBeGreaterThan(0);
    expect(typeof fixture.session_a.report_to).toBe('string');
    expect(fixture.session_a.report_to.length).toBeGreaterThan(0);
  });

  it('session_b block is present with required fields', () => {
    expect(typeof fixture.session_b.report_uuid).toBe('string');
    expect(fixture.session_b.report_uuid.length).toBeGreaterThan(0);
    expect(Array.isArray(fixture.session_b.task_uuids)).toBe(true);
    expect(fixture.session_b.task_uuids.length).toBeGreaterThan(0);
    expect(typeof fixture.session_b.report_to).toBe('string');
    expect(fixture.session_b.report_to.length).toBeGreaterThan(0);
  });
});

// ── [2] session_a.report_to !== session_b.report_to ───────────────────────

describe('[2] session_a.report_to !== session_b.report_to (no collision)', () => {
  it('assertReportToPathsDiffer returns null (pass)', () => {
    const error = assertReportToPathsDiffer(fixture);
    expect(error).toBeNull();
  });

  it('session_a.report_to and session_b.report_to are different strings', () => {
    expect(fixture.session_a.report_to).not.toBe(fixture.session_b.report_to);
  });

  it('session_a.report_to contains session_a report_uuid', () => {
    expect(fixture.session_a.report_to).toContain(fixture.session_a.report_uuid);
  });

  it('session_b.report_to contains session_b report_uuid', () => {
    expect(fixture.session_b.report_to).toContain(fixture.session_b.report_uuid);
  });

  it('both report_to paths point to the same pool directory', () => {
    const poolName = fixture.setup.pool_name;
    expect(fixture.session_a.report_to).toContain(poolName);
    expect(fixture.session_b.report_to).toContain(poolName);
  });

  it('both report_to paths are under the reports/ subdirectory', () => {
    expect(fixture.session_a.report_to).toContain('/reports/');
    expect(fixture.session_b.report_to).toContain('/reports/');
  });

  it('both report_to paths end with .json', () => {
    expect(fixture.session_a.report_to).toMatch(/\.json$/);
    expect(fixture.session_b.report_to).toMatch(/\.json$/);
  });
});

// ── [3] session_a.report_uuid !== session_b.report_uuid ───────────────────

describe('[3] session_a.report_uuid !== session_b.report_uuid', () => {
  it('assertReportUuidsDiffer returns null (pass)', () => {
    const error = assertReportUuidsDiffer(fixture);
    expect(error).toBeNull();
  });

  it('session_a.report_uuid and session_b.report_uuid are different strings', () => {
    expect(fixture.session_a.report_uuid).not.toBe(fixture.session_b.report_uuid);
  });

  it('session_a.report_uuid is a non-empty string', () => {
    expect(typeof fixture.session_a.report_uuid).toBe('string');
    expect(fixture.session_a.report_uuid.length).toBeGreaterThan(0);
  });

  it('session_b.report_uuid is a non-empty string', () => {
    expect(typeof fixture.session_b.report_uuid).toBe('string');
    expect(fixture.session_b.report_uuid.length).toBeGreaterThan(0);
  });
});

// ── [4] task_uuids no overlap ─────────────────────────────────────────────

describe('[4] task_uuids from session_a and session_b do not overlap', () => {
  it('assertTaskUuidsNoOverlap returns null (pass)', () => {
    const error = assertTaskUuidsNoOverlap(fixture);
    expect(error).toBeNull();
  });

  it('session_a.task_uuids and session_b.task_uuids share no UUIDs', () => {
    const setA = new Set(fixture.session_a.task_uuids);
    const overlap = fixture.session_b.task_uuids.filter(uuid => setA.has(uuid));
    expect(overlap).toHaveLength(0);
  });

  it('session_a has at least one task_uuid', () => {
    expect(fixture.session_a.task_uuids.length).toBeGreaterThan(0);
  });

  it('session_b has at least one task_uuid', () => {
    expect(fixture.session_b.task_uuids.length).toBeGreaterThan(0);
  });

  it('all task_uuids across both sessions are unique strings', () => {
    const allUuids = [...fixture.session_a.task_uuids, ...fixture.session_b.task_uuids];
    const uniqueUuids = new Set(allUuids);
    expect(uniqueUuids.size).toBe(allUuids.length);
  });
});

// ── [5] expected.report_to_paths_differ === true ──────────────────────────

describe('[5] expected.report_to_paths_differ is true', () => {
  it('assertExpectedReportToPathsDiffer returns null (pass)', () => {
    const error = assertExpectedReportToPathsDiffer(fixture);
    expect(error).toBeNull();
  });

  it('expected.report_to_paths_differ is exactly true', () => {
    expect(fixture.expected.report_to_paths_differ).toBe(true);
  });
});

// ── [6] expected.no_report_collision === true ─────────────────────────────

describe('[6] expected.no_report_collision is true', () => {
  it('assertExpectedNoReportCollision returns null (pass)', () => {
    const error = assertExpectedNoReportCollision(fixture);
    expect(error).toBeNull();
  });

  it('expected.no_report_collision is exactly true', () => {
    expect(fixture.expected.no_report_collision).toBe(true);
  });
});

// ── [7] expected.pool_serializes_work === true ────────────────────────────

describe('[7] expected.pool_serializes_work is true', () => {
  it('assertExpectedPoolSerializesWork returns null (pass)', () => {
    const error = assertExpectedPoolSerializesWork(fixture);
    expect(error).toBeNull();
  });

  it('expected.pool_serializes_work is exactly true', () => {
    expect(fixture.expected.pool_serializes_work).toBe(true);
  });
});

// ── [8] standing-pool-submitter.md contains UUID documentation ────────────

describe('[8] standing-pool-submitter.md contains UUID or uuid (UUID-based filename guarantee)', () => {
  const submitterContent = readFileSync(SUBMITTER_MD_PATH, 'utf-8');

  it('standing-pool-submitter.md is readable and non-empty', () => {
    expect(submitterContent.length).toBeGreaterThan(0);
  });

  it('standing-pool-submitter.md contains "UUID" or "uuid"', () => {
    const hasUUID = submitterContent.includes('UUID') || submitterContent.includes('uuid');
    expect(hasUUID).toBe(true);
  });

  it('documents UUID-based filenames for uniqueness across concurrent submitters', () => {
    // Must reference UUID in the context of uniqueness / concurrent submitters
    const hasUniqueUUID =
      submitterContent.includes('UUID') &&
      (submitterContent.includes('unique') || submitterContent.includes('concurrent'));
    expect(hasUniqueUUID).toBe(true);
  });

  it('documents both batch_uuid and report_uuid generation in Step 2', () => {
    expect(submitterContent).toContain('batch_uuid');
    expect(submitterContent).toContain('report_uuid');
  });
});

// ── [9] standing-pool-submitter.md documents report_to field ─────────────

describe('[9] standing-pool-submitter.md contains report_to field documentation', () => {
  const submitterContent = readFileSync(SUBMITTER_MD_PATH, 'utf-8');

  it('standing-pool-submitter.md contains "report_to"', () => {
    expect(submitterContent).toContain('report_to');
  });

  it('documents report_to path as uuid-based (unique per submission)', () => {
    // The submitter must document that the report_to path uses the report_uuid
    const hasReportToWithUuid =
      submitterContent.includes('report_to') &&
      (submitterContent.includes('report_uuid') || submitterContent.includes('<report_uuid>'));
    expect(hasReportToWithUuid).toBe(true);
  });

  it('documents report_to as shared across tasks in the same batch', () => {
    // "report_to field is shared across all tasks in this batch"
    expect(submitterContent).toContain('report_to');
    // The submitter doc explains this path goes in each task file
    expect(submitterContent).toContain('report-to path');
  });
});

// ── [10] routing.md contains FR-MMT18 ────────────────────────────────────

describe('[10] docs/specs/multi-model-teams/routing.md contains FR-MMT18', () => {
  const routingContent = readFileSync(ROUTING_MD_PATH, 'utf-8');

  it('routing.md is readable and non-empty', () => {
    expect(routingContent.length).toBeGreaterThan(0);
  });

  it('routing.md contains "FR-MMT18" (race condition semantics documented)', () => {
    expect(routingContent).toContain('FR-MMT18');
  });

  it('routing.md §5 documents concurrent submission behavior', () => {
    // Section 5 must discuss concurrent submissions
    expect(routingContent).toContain('Race Condition');
  });

  it('routing.md documents that non-deterministic completion order is documented behavior', () => {
    expect(routingContent).toContain('documented behavior');
  });

  it('routing.md advises using multiple pools for guaranteed parallelism', () => {
    expect(routingContent).toContain('multiple pools');
  });
});

// ── [11] expected.fr_mmt18_documented_behavior is a non-empty string ──────

describe('[11] expected.fr_mmt18_documented_behavior is a non-empty string', () => {
  it('assertFrMmt18DocumentedBehavior returns null (pass)', () => {
    const error = assertFrMmt18DocumentedBehavior(fixture);
    expect(error).toBeNull();
  });

  it('expected.fr_mmt18_documented_behavior is a string', () => {
    expect(typeof fixture.expected.fr_mmt18_documented_behavior).toBe('string');
  });

  it('expected.fr_mmt18_documented_behavior is non-empty', () => {
    expect(fixture.expected.fr_mmt18_documented_behavior.length).toBeGreaterThan(0);
  });

  it('expected.fr_mmt18_documented_behavior mentions non-deterministic completion order or multiple pools', () => {
    const val = fixture.expected.fr_mmt18_documented_behavior;
    const mentionsExpectedConcepts =
      val.includes('Non-deterministic') ||
      val.includes('non-deterministic') ||
      val.includes('multiple pools') ||
      val.includes('parallelism');
    expect(mentionsExpectedConcepts).toBe(true);
  });
});

/**
 * Layer 2: Behavioral fixtures for scripts/write-audit.mjs (Task 42,
 * FR-MR24, FR-HM26, FR-HM44) — replaces audit-writer-md.test.ts now that
 * the audit-artifact-writer agent is retired and this node script owns
 * the per-invocation multi-model audit artifact write.
 *
 * write-audit.mjs reproduces audit-artifact-writer.md's file path,
 * filename pattern, and 7 required + 4 optional markdown sections exactly
 * (see the script's own header comment for the input/output contract).
 * These tests exercise the script as a subprocess (the way
 * multi-model-review-orchestrator.md's Step 9 call site invokes it) and
 * validate the written markdown with the SAME validateAuditArtifact()
 * validator the pre-existing Section 8-11 fixture suite
 * (tests/fixtures/multi-model-teams/audit/audit-extensions-fixture.test.ts)
 * uses, so the script and the validator cannot silently drift apart.
 *
 * Plan: docs/plans/harness-modernization.md Task 42.
 * Spec: docs/reqs/harness-modernization.md § FR-HM26, FR-HM44.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, chmodSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateAuditArtifact, validateFilename } from './audit-artifact';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'write-audit.mjs');

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'write-audit-'));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

function run(
  envelope: unknown,
  opts: { env?: Record<string, string> } = {},
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      cwd: projectDir,
      input: JSON.stringify(envelope),
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, ...opts.env },
      encoding: 'utf-8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err: any) {
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function baseEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    command: 'review-code',
    invocation_metadata: {
      target: 'staged changes',
      timestamp: '2026-04-28T10:00:00Z',
      short_hash: 'c7d8e9f',
    },
    config_snapshot: {
      enabled: true,
      strict_mode: false,
      reviewers: ['codex-review-prompter', 'gemini-review-prompter'],
      aggregator: { command: 'codex-review-prompter' },
    },
    preflight_result: {
      summary: '4 reviewers configured, 4 available, 3 families, aggregator: codex-review-prompter',
      lines: ['Aggregator resolution source: configured'],
    },
    unified_envelope: {
      per_reviewer_results: [
        {
          reviewer_id: 'code-reviewer',
          source_type: 'native-team',
          family: 'anthropic',
          status: 'success',
          findings_count: 1,
          error_code: null,
          usage: null,
        },
        {
          reviewer_id: 'codex-review-prompter',
          source_type: 'external',
          family: 'openai',
          status: 'success',
          findings_count: 1,
          error_code: null,
          usage: { input_tokens: 4800, output_tokens: 360 },
        },
      ],
      findings: [
        {
          finding_id: 'SEC-UD-001',
          severity: 'high',
          category: 'security',
          title: 'SQL injection in users query builder',
          file: 'src/db/userQueries.ts',
          symbol: 'buildUserSearchQuery',
          raised_by: [
            { reviewer_id: 'code-reviewer', family: 'anthropic', source_type: 'native-team' },
            { reviewer_id: 'codex-review-prompter', family: 'openai', source_type: 'external' },
          ],
          superseded_by_verification: false,
        },
      ],
      aggregator_resolution: { name: 'codex-review-prompter', source: 'configured' },
      consolidation_trace: {
        stage4_calls_dispatched: 1,
        stage4_calls_skipped: 0,
        judge_mode_indicator: 'external-packaged',
      },
      continuation_event: null,
    },
    audit_config: { enabled: true, output_path: 'docs/reviews/', record_finding_attribution_telemetry: true },
    ...overrides,
  };
}

describe('write-audit.mjs — happy path (Task 42)', () => {
  it('exits 0 and writes status: "written"', () => {
    const result = run(baseEnvelope());
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe('written');
    expect(parsed.sections_present).toEqual([1, 2, 3, 4, 5, 6, 11]);
    expect(parsed.continuation_event_included).toBe(false);
  });

  it('writes the file under <output_path> resolved against CLAUDE_PROJECT_DIR', () => {
    const result = run(baseEnvelope());
    const parsed = JSON.parse(result.stdout);
    expect(existsSync(parsed.path)).toBe(true);
    expect(parsed.path).toBe(join(projectDir, 'docs', 'reviews', parsed.filename));
  });

  it('filename matches the FR-MR24 <YYYY-MM-DD>-<command>-<short-hash>.md pattern', () => {
    const result = run(baseEnvelope());
    const parsed = JSON.parse(result.stdout);
    expect(parsed.filename).toBe('2026-04-28-review-code-c7d8e9f.md');
    expect(validateFilename(parsed.filename).valid).toBe(true);
  });

  it('written markdown passes validateAuditArtifact (default flags)', () => {
    const result = run(baseEnvelope());
    const parsed = JSON.parse(result.stdout);
    const markdown = readFileSync(parsed.path, 'utf8');
    const validation = validateAuditArtifact(markdown);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('no leftover .tmp file after an atomic write', () => {
    run(baseEnvelope());
    const files = readdirSync(join(projectDir, 'docs', 'reviews'));
    expect(files.some((f) => f.includes('.tmp'))).toBe(false);
  });

  it('Section 4 splits native vs external reviewers with usage surfaced verbatim / not_reported', () => {
    const result = run(baseEnvelope());
    const parsed = JSON.parse(result.stdout);
    const markdown = readFileSync(parsed.path, 'utf8');
    expect(markdown).toMatch(/### Native reviewers/);
    expect(markdown).toMatch(/### External reviewers/);
    expect(markdown).toContain('usage: not_reported');
    expect(markdown).toContain('input_tokens: 4800, output_tokens: 360');
  });

  it('Section 5 findings carry raised_by attribution', () => {
    const result = run(baseEnvelope());
    const parsed = JSON.parse(result.stdout);
    const markdown = readFileSync(parsed.path, 'utf8');
    expect(markdown).toContain('reviewer_id: code-reviewer, family: anthropic, source_type: native-team');
  });

  it('second invocation with a different short_hash on the same day does not collide', () => {
    const first = run(baseEnvelope());
    const second = run(baseEnvelope({ invocation_metadata: { target: 'x', timestamp: '2026-04-28T10:05:00Z', short_hash: 'aaaa111' } }));
    const p1 = JSON.parse(first.stdout);
    const p2 = JSON.parse(second.stdout);
    expect(p1.filename).not.toBe(p2.filename);
    expect(existsSync(p1.path)).toBe(true);
    expect(existsSync(p2.path)).toBe(true);
  });
});

describe('write-audit.mjs — skip-write when disabled (FR-MR24 step rule)', () => {
  it('exits 0, writes nothing, and returns status: "skipped"', () => {
    const result = run(baseEnvelope({ audit_config: { enabled: false } }));
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ status: 'skipped', reason: 'audit.enabled is false' });
    expect(existsSync(join(projectDir, 'docs', 'reviews'))).toBe(false);
  });
});

describe('write-audit.mjs — Continuation Event (Section 7)', () => {
  it('is included only when continuation_event is non-null', () => {
    const envelope = baseEnvelope();
    (envelope.unified_envelope as any).continuation_event = {
      type: 'all-externals-failed',
      details: 'All external reviewers failed; continuing with natives only.',
    };
    const result = run(envelope);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.continuation_event_included).toBe(true);
    expect(parsed.sections_present).toContain(7);
    const markdown = readFileSync(parsed.path, 'utf8');
    const validation = validateAuditArtifact(markdown, { expectContinuationEvent: true });
    expect(validation.valid).toBe(true);
  });
});

describe('write-audit.mjs — optional Sections 8-10 (FR-MMT30)', () => {
  it('renders Team Metadata (Section 8) only when team_metadata is provided', () => {
    const envelope = baseEnvelope({
      team_metadata: {
        team_name: 'review-a3f7b2c1',
        team_type: 'standing-pool',
        multi_model: true,
        reviewer_roster: [{ reviewer_id: 'code-reviewer', spawn_timestamp: '2026-04-28T10:00:00Z' }],
        cross_domain_messages: { count: 1, messages: [{ from: 'code-reviewer', to: 'security-reviewer', subject: 'x', timestamp: '2026-04-28T10:03:12Z' }] },
      },
    });
    const result = run(envelope);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.sections_present).toContain(8);
    const markdown = readFileSync(parsed.path, 'utf8');
    expect(validateAuditArtifact(markdown, { expectTeamMetadata: true }).valid).toBe(true);
  });

  it('renders Pool Routing (Section 9) only when pool_routing is provided', () => {
    const envelope = baseEnvelope({
      pool_routing: {
        routing_decision: 'routed-to-pool',
        pool_name: 'review-pool-b',
        pool_multi_model: true,
        match_rationale: 'covers: pool roster superset-of required',
        would_have_routed: false,
      },
    });
    const result = run(envelope);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.sections_present).toContain(9);
    const markdown = readFileSync(parsed.path, 'utf8');
    expect(validateAuditArtifact(markdown, { expectPoolRouting: true }).valid).toBe(true);
  });

  it('renders Recovery (Section 10) only when recovery is provided', () => {
    const envelope = baseEnvelope({
      recovery: { occurred: true, failed_reviewer: 'performance-engineer', recovery_finding_count: 3 },
    });
    const result = run(envelope);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.sections_present).toContain(10);
    const markdown = readFileSync(parsed.path, 'utf8');
    expect(validateAuditArtifact(markdown, { expectRecovery: true }).valid).toBe(true);
  });

  it('omits Sections 8-10 entirely when their input blocks are absent', () => {
    const result = run(baseEnvelope());
    const parsed = JSON.parse(result.stdout);
    expect(parsed.sections_present).not.toContain(8);
    expect(parsed.sections_present).not.toContain(9);
    expect(parsed.sections_present).not.toContain(10);
  });
});

describe('write-audit.mjs — Finding Attribution Telemetry opt-out (FR-MMT30a)', () => {
  it('Section 11 is present by default (flag absent)', () => {
    const envelope = baseEnvelope();
    delete (envelope.audit_config as any).record_finding_attribution_telemetry;
    const result = run(envelope);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.sections_present).toContain(11);
  });

  it('Section 11 is omitted entirely when the flag is explicitly false', () => {
    const envelope = baseEnvelope({
      audit_config: { enabled: true, output_path: 'docs/reviews/', record_finding_attribution_telemetry: false },
    });
    const result = run(envelope);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.sections_present).not.toContain(11);
    const markdown = readFileSync(parsed.path, 'utf8');
    const validation = validateAuditArtifact(markdown, { expectAttributionTelemetry: false });
    expect(validation.valid).toBe(true);
  });
});

describe('write-audit.mjs — invalid input (exit 1)', () => {
  it('exits 1 on malformed JSON', () => {
    let code = 0;
    try {
      execFileSync('node', [SCRIPT], { cwd: projectDir, input: '{ not json', encoding: 'utf-8' });
    } catch (err: any) {
      code = err.status ?? 1;
    }
    expect(code).toBe(1);
  });

  it('exits 1 when a required field is missing', () => {
    const envelope = baseEnvelope();
    delete (envelope as any).unified_envelope;
    let code = 0;
    try {
      execFileSync('node', [SCRIPT], { cwd: projectDir, input: JSON.stringify(envelope), encoding: 'utf-8' });
    } catch (err: any) {
      code = err.status ?? 1;
    }
    expect(code).toBe(1);
  });
});

describe('write-audit.mjs — writability check before writing (FR-HM18)', () => {
  it('exits 2 with a clear message when the output directory cannot be written', () => {
    const readonlyProject = mkdtempSync(join(tmpdir(), 'write-audit-ro-'));
    const reviewsDir = join(readonlyProject, 'docs', 'reviews');
    mkdirSync(reviewsDir, { recursive: true });
    chmodSync(reviewsDir, 0o500);
    try {
      let code = 0;
      let stderr = '';
      try {
        execFileSync('node', [SCRIPT], {
          cwd: readonlyProject,
          input: JSON.stringify(baseEnvelope()),
          env: { ...process.env, CLAUDE_PROJECT_DIR: readonlyProject },
          encoding: 'utf-8',
        });
      } catch (err: any) {
        code = err.status ?? 1;
        stderr = err.stderr ?? '';
      }
      // A sandboxed/root test runner may still be able to write despite 0o500;
      // only assert the failure mode when it actually manifests.
      if (code !== 0) {
        expect(code).toBe(2);
        expect(stderr).toMatch(/cannot write to/);
      }
    } finally {
      chmodSync(reviewsDir, 0o700);
      rmSync(readonlyProject, { recursive: true, force: true });
    }
  });
});

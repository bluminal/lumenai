/**
 * Task 23: Layer 2 fixture — orchestrator parallel fan-out (2 native + 2 external).
 *
 * Assertion sets:
 *   (1) Structural — orchestrator .md contains FR-MR12 verbatim phrasing
 *   (2) Output    — fixture envelope contains all 4 reviewers' findings
 *
 * Wall-clock fan-out verification is explicitly deferred to Milestone 7.3 Task 61a.
 * Cached fixtures do not exercise real parallelism; promptfoo replays at near-zero
 * latency regardless of dispatch strategy.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateOrchestratorOutput, PATH_AND_REASON_HEADER_REGEX } from './orchestrator-output';

// ── Paths ─────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = join(
  import.meta.dirname,
  '..', 'fixtures', 'multi-model-review', 'orchestrator', 'parallel-fanout'
);

const ORCHESTRATOR_MD = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'agents', 'multi-model-review-orchestrator.md'
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadJson(filename: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, filename), 'utf-8')) as Record<string, unknown>;
}

function loadText(filename: string): string {
  return readFileSync(join(FIXTURE_DIR, filename), 'utf-8');
}

// ── Shared loads ──────────────────────────────────────────────────────────────

let fixture: Record<string, unknown>;
let envelope: Record<string, unknown>;
let readmeText: string;
let orchestratorMd: string;

beforeAll(() => {
  fixture = loadJson('fixture.json');
  envelope = loadJson('expected_envelope.json');
  readmeText = loadText('README.md');
  orchestratorMd = readFileSync(ORCHESTRATOR_MD, 'utf-8');
});

// ── (1) Structural: FR-MR12 verbatim phrasing in orchestrator .md ─────────────

describe('Task 23 structural: FR-MR12 verbatim phrasing', () => {
  it('orchestrator .md contains verbatim phrase "single parallel Task batch" (FR-MR12)', () => {
    expect(orchestratorMd).toContain('single parallel Task batch');
  });

  it('orchestrator .md references FR-MR12 by identifier', () => {
    expect(orchestratorMd).toContain('FR-MR12');
  });
});

// ── (2) Output: expected_envelope passes schema validation ────────────────────

describe('Task 23 output: expected_envelope schema validation', () => {
  it('validateOrchestratorOutput passes with no errors', () => {
    const result = validateOrchestratorOutput(envelope);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

// ── (3) per_reviewer_results has exactly 4 entries ───────────────────────────

describe('Task 23 output: per_reviewer_results count', () => {
  it('per_reviewer_results.length === 4', () => {
    expect(Array.isArray(envelope.per_reviewer_results)).toBe(true);
    expect((envelope.per_reviewer_results as unknown[]).length).toBe(4);
  });

  it('fixture.expected_per_reviewer_results_count === 4 (metadata agrees)', () => {
    expect(fixture.expected_per_reviewer_results_count).toBe(4);
  });
});

// ── (4) Source-type split: 2 native-team + 2 external ────────────────────────

describe('Task 23 output: source_type split 2 native + 2 external', () => {
  let results: Array<Record<string, unknown>>;

  beforeAll(() => {
    results = envelope.per_reviewer_results as Array<Record<string, unknown>>;
  });

  it('exactly 2 entries have source_type "native-team"', () => {
    const nativeCount = results.filter(r => r.source_type === 'native-team').length;
    expect(nativeCount).toBe(2);
  });

  it('exactly 2 entries have source_type "external"', () => {
    const externalCount = results.filter(r => r.source_type === 'external').length;
    expect(externalCount).toBe(2);
  });

  it('native-team reviewers are code-reviewer and security-reviewer', () => {
    const nativeIds = results
      .filter(r => r.source_type === 'native-team')
      .map(r => r.reviewer_id)
      .sort();
    expect(nativeIds).toEqual(['code-reviewer', 'security-reviewer'].sort());
  });

  it('external reviewers are codex-review-prompter and gemini-review-prompter', () => {
    const externalIds = results
      .filter(r => r.source_type === 'external')
      .map(r => r.reviewer_id)
      .sort();
    expect(externalIds).toEqual(['codex-review-prompter', 'gemini-review-prompter'].sort());
  });

  it('native-team entries have family "anthropic"', () => {
    const nativeEntries = results.filter(r => r.source_type === 'native-team');
    for (const entry of nativeEntries) {
      expect(entry.family).toBe('anthropic');
    }
  });
});

// ── (5) findings array has exactly 7 entries ─────────────────────────────────

describe('Task 23 output: findings count', () => {
  it('findings.length === 7', () => {
    expect(Array.isArray(envelope.findings)).toBe(true);
    expect((envelope.findings as unknown[]).length).toBe(7);
  });

  it('fixture.expected_total_findings === 7 (metadata agrees)', () => {
    expect(fixture.expected_total_findings).toBe(7);
  });

  it('per_reviewer_results findings_count values sum to 7', () => {
    const results = envelope.per_reviewer_results as Array<Record<string, unknown>>;
    const sum = results.reduce((acc, r) => acc + (r.findings_count as number), 0);
    expect(sum).toBe(7);
  });
});

// ── (6) Each finding has source attribution matching one of the 4 proposers ───

describe('Task 23 output: finding source attribution', () => {
  const VALID_PROPOSER_IDS = new Set([
    'code-reviewer',
    'security-reviewer',
    'codex-review-prompter',
    'gemini-review-prompter',
  ]);

  it('every finding has a non-empty source.reviewer_id', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    for (const [i, f] of findings.entries()) {
      const src = f.source as Record<string, unknown>;
      expect(typeof src.reviewer_id, `findings[${i}].source.reviewer_id must be string`).toBe('string');
      expect((src.reviewer_id as string).length, `findings[${i}].source.reviewer_id must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('every finding source.reviewer_id matches one of the 4 proposers', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    for (const [i, f] of findings.entries()) {
      const src = f.source as Record<string, unknown>;
      expect(
        VALID_PROPOSER_IDS.has(src.reviewer_id as string),
        `findings[${i}].source.reviewer_id "${src.reviewer_id}" not in proposer list`
      ).toBe(true);
    }
  });

  it('each of the 4 proposers contributes at least one finding', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    const reviewerIds = new Set(findings.map(f => (f.source as Record<string, unknown>).reviewer_id));
    for (const proposerId of VALID_PROPOSER_IDS) {
      expect(reviewerIds.has(proposerId), `proposer "${proposerId}" contributed no findings`).toBe(true);
    }
  });

  it('native-team findings have source.source_type "native-team"', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    const nativeProposers = new Set(['code-reviewer', 'security-reviewer']);
    const nativeFindings = findings.filter(f => {
      const src = f.source as Record<string, unknown>;
      return nativeProposers.has(src.reviewer_id as string);
    });
    for (const f of nativeFindings) {
      const src = f.source as Record<string, unknown>;
      expect(src.source_type).toBe('native-team');
    }
  });

  it('external findings have source.source_type "external"', () => {
    const findings = envelope.findings as Array<Record<string, unknown>>;
    const externalProposers = new Set(['codex-review-prompter', 'gemini-review-prompter']);
    const externalFindings = findings.filter(f => {
      const src = f.source as Record<string, unknown>;
      return externalProposers.has(src.reviewer_id as string);
    });
    for (const f of externalFindings) {
      const src = f.source as Record<string, unknown>;
      expect(src.source_type).toBe('external');
    }
  });
});

// ── (7) Structural FR-MR12 check: raw-string match in orchestrator .md ────────
// (covered in the structural section above; this block confirms the precise
//  acceptance-criterion wording from the task spec)

describe('Task 23 structural: acceptance criterion verbatim check', () => {
  it('AC verbatim: orchestrator .md contains "single parallel Task batch"', () => {
    // Raw-string match per task spec
    expect(orchestratorMd).toContain('single parallel Task batch');
  });
});

// ── (8) README.md contains forward-reference to Task 61a / Milestone 7.3 ──────

describe('Task 23 deferred verification: README forward-reference', () => {
  it('README.md contains "Task 61a" (forward-reference to deferred wall-clock test)', () => {
    expect(readmeText).toContain('Task 61a');
  });

  it('README.md contains "Milestone 7.3" (forward-reference to deferred wall-clock test)', () => {
    expect(readmeText).toContain('Milestone 7.3');
  });
});

// ── (9) path_and_reason_header passes D21 regex ───────────────────────────────

describe('Task 23 output: path_and_reason_header (D21)', () => {
  it('path_and_reason_header is a string', () => {
    expect(typeof envelope.path_and_reason_header).toBe('string');
  });

  it('path_and_reason_header matches D21 regex', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.test(envelope.path_and_reason_header as string)).toBe(true);
  });

  it('path_and_reason_header reflects 2 native + 2 external (literal match)', () => {
    expect(envelope.path_and_reason_header).toBe(
      'Review path: multi-model (above-threshold diff; reviewers: 2 native + 2 external)'
    );
  });
});

// ── (10) continuation_event === null ──────────────────────────────────────────

describe('Task 23 output: continuation_event', () => {
  it('continuation_event is null (all proposers succeeded)', () => {
    expect(envelope.continuation_event).toBeNull();
  });
});

// ── Bonus: aggregator_resolution ─────────────────────────────────────────────

describe('Task 23 output: aggregator_resolution', () => {
  it('aggregator_resolution.name is "codex-review-prompter"', () => {
    const ar = envelope.aggregator_resolution as Record<string, unknown>;
    expect(ar.name).toBe('codex-review-prompter');
  });

  it('aggregator_resolution.source is "tier-table" (D17 resolution)', () => {
    const ar = envelope.aggregator_resolution as Record<string, unknown>;
    expect(ar.source).toBe('tier-table');
  });
});

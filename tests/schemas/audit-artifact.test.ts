/**
 * Vitest suite for audit-artifact.ts (FR-MR24, NFR-MR4).
 * 18 cases covering required sections, native/external split, filename patterns,
 * NFR-MR4 usage enforcement, continuation event conditionality, and attribution.
 */

import { describe, it, expect } from 'vitest';
import {
  validateFilename,
  validateAuditArtifact,
  FILENAME_REGEX,
  REQUIRED_SECTIONS,
  COMMAND_VALUES,
  POOL_ROUTING_DECISION_VALUES,
} from './audit-artifact';

// ---------------------------------------------------------------------------
// Sample fixtures
// ---------------------------------------------------------------------------

const validSampleReviewCode = `
# Multi-Model Review Audit

## 1. Invocation Metadata
- Command: review-code
- Target: staged changes
- Timestamp: 2026-04-27T12:00:00Z
- Short hash: a1b2c3d

## 2. Config Snapshot
\`\`\`yaml
multi_model_review:
  enabled: true
  ...
\`\`\`

## 3. Preflight Result
4 reviewers configured, 4 available, 3 families, aggregator: codex-review-prompter

## 4. Per-Reviewer Results

### Native reviewers
| Reviewer ID | Family | Status | Findings | Usage |
|-------------|--------|--------|----------|-------|
| code-reviewer | anthropic | success | 3 | usage: not_reported |
| security-reviewer | anthropic | success | 2 | usage: not_reported |

### External reviewers
| Reviewer ID | Family | Status | Findings | Usage |
|-------------|--------|--------|----------|-------|
| codex-review-prompter | openai | success | 4 | input_tokens: 4521, output_tokens: 312 |
| gemini-review-prompter | google | success | 5 | input_tokens: 5234, output_tokens: 412 |

## 5. Consolidated Findings with Attribution
- Finding A (raised_by: code-reviewer, codex-review-prompter)
- Finding B (raised_by: security-reviewer)

## 6. Aggregator Trace
Aggregator: codex-review-prompter (source: tier-table)
Stage 4 calls dispatched: 3
`;

const validSampleWriteImplementationPlan = `
# Multi-Model Review Audit

## 1. Invocation Metadata
- Command: write-implementation-plan
- Target: plan request
- Timestamp: 2026-04-27T14:00:00Z
- Short hash: f4e5d6c

## 2. Config Snapshot
\`\`\`yaml
multi_model_review:
  enabled: true
\`\`\`

## 3. Preflight Result
2 reviewers configured, 2 available, aggregator: gemini-review-prompter

## 4. Per-Reviewer Results

### Native reviewers
| Reviewer ID | Family | Status | Findings | Usage |
|-------------|--------|--------|----------|-------|
| architect | anthropic | success | 1 | usage: not_reported |

### External reviewers
| Reviewer ID | Family | Status | Findings | Usage |
|-------------|--------|--------|----------|-------|
| gemini-review-prompter | google | success | 2 | input_tokens: 3100, output_tokens: 280 |

## 5. Consolidated Findings with Attribution
- Finding X (raised_by: architect, gemini-review-prompter)

## 6. Aggregator Trace
Aggregator: gemini-review-prompter (source: configured)
`;

/** Valid sample augmented with Continuation Event section. */
const validSampleWithContinuation = validSampleReviewCode + `
## 7. Continuation Event
- Type: all-externals-failed
- Details: All external reviewers timed out; native results retained.
`;

const validSampleWithTeamMetadata = validSampleReviewCode + `
## 8. Team Metadata
- Team name: review-a3f7b2c1
- Team type: standing-pool

### Reviewer Roster
| Reviewer ID | Spawn Timestamp |
|-------------|-----------------|
| code-reviewer | 2026-04-27T12:00:00Z |
| security-reviewer | 2026-04-27T12:00:01Z |

### Cross-Domain Messages
Count: 1
| From | To | Subject | Timestamp |
|------|----|---------|-----------|
| code-reviewer | security-reviewer | potential SQL injection in users.py | 2026-04-27T12:05:00Z |
`;

const validSampleWithPoolRouting = validSampleReviewCode + `
## 9. Pool Routing
- routing_decision: routed-to-pool
- pool_name: review-pool
- pool_multi_model: false
- match_rationale: covers: pool roster {code-reviewer,security-reviewer} superset-of required {code-reviewer,security-reviewer}
- would_have_routed: false
`;

const validSampleWithRecovery = validSampleReviewCode + `
## 10. Recovery
- occurred: true
- failed_reviewer: performance-engineer
- recovery_finding_count: 3
`;

const validSampleWithAttributionTelemetry = validSampleReviewCode + `
## 11. Finding Attribution Telemetry
### Finding: AUTH-001
- consolidated_finding_id: AUTH-001
- raised_by: code-reviewer (anthropic, native-team), codex-review-prompter (openai, external)
- consensus_count: 2
- minority_of_one: false

### Finding: SEC-001
- consolidated_finding_id: SEC-001
- raised_by: security-reviewer (anthropic, native-team)
- consensus_count: 1
- minority_of_one: true
`;

/** Helper: strip a section heading (and its content up to next heading) from markdown. */
function stripSection(markdown: string, sectionPattern: RegExp): string {
  // Remove from matching heading to the next heading of same or higher level, or EOF
  return markdown.replace(
    new RegExp(`(^|\\n)(#{1,3}[^\\n]*${sectionPattern.source}[\\s\\S]*?)(?=\\n#{1,3} |$)`, 'i'),
    ''
  );
}

// ---------------------------------------------------------------------------
// Filename validation
// ---------------------------------------------------------------------------

describe('validateFilename', () => {
  it('(3) accepts valid review-code filename', () => {
    const result = validateFilename('2026-04-27-review-code-a1b2c3d.md');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(4) accepts valid write-implementation-plan filename', () => {
    const result = validateFilename('2026-04-27-write-implementation-plan-f4e5d6c.md');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(5) rejects filename with no date prefix', () => {
    const result = validateFilename('audit.md');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not match FR-MR24 pattern/);
  });

  it('(6) rejects filename with unknown command', () => {
    const result = validateFilename('2026-04-27-other-cmd-abc123.md');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not match FR-MR24 pattern/);
  });
});

// ---------------------------------------------------------------------------
// COMMAND_VALUES constant
// ---------------------------------------------------------------------------

describe('COMMAND_VALUES', () => {
  it('exports both supported command values', () => {
    expect(COMMAND_VALUES).toContain('review-code');
    expect(COMMAND_VALUES).toContain('write-implementation-plan');
    expect(COMMAND_VALUES).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// FILENAME_REGEX
// ---------------------------------------------------------------------------

describe('FILENAME_REGEX', () => {
  it('matches review-code filename', () => {
    expect(FILENAME_REGEX.test('2026-04-27-review-code-a1b2c3d.md')).toBe(true);
  });

  it('matches write-implementation-plan filename', () => {
    expect(FILENAME_REGEX.test('2026-04-27-write-implementation-plan-f4e5d6c.md')).toBe(true);
  });

  it('does not match unknown command', () => {
    expect(FILENAME_REGEX.test('2026-04-27-other-cmd-abc123.md')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateAuditArtifact — valid samples
// ---------------------------------------------------------------------------

describe('validateAuditArtifact — valid samples', () => {
  it('(1) accepts valid review-code sample with all 6 mandatory sections', () => {
    const result = validateAuditArtifact(validSampleReviewCode);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(2) accepts valid write-implementation-plan sample', () => {
    const result = validateAuditArtifact(validSampleWriteImplementationPlan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(18) accepts markdown with all 6 mandatory + optional Continuation Event when expectContinuationEvent: true', () => {
    const result = validateAuditArtifact(validSampleWithContinuation, { expectContinuationEvent: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateAuditArtifact — missing sections
// ---------------------------------------------------------------------------

describe('validateAuditArtifact — missing sections', () => {
  it('(7) fails when Section 1 (Invocation Metadata) is missing', () => {
    const stripped = validSampleReviewCode.replace(/##\s*\d+\.\s*Invocation Metadata[\s\S]*?(?=\n##\s*\d+\.|$)/, '');
    const result = validateAuditArtifact(stripped);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invocation Metadata'))).toBe(true);
  });

  it('(8) fails when Section 4 (Per-Reviewer Results) is missing', () => {
    const stripped = validSampleReviewCode.replace(/##\s*\d+\.\s*Per-Reviewer Results[\s\S]*?(?=\n##\s*\d+\.|$)/, '');
    const result = validateAuditArtifact(stripped);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Per-Reviewer Results'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateAuditArtifact — native/external split
// ---------------------------------------------------------------------------

describe('validateAuditArtifact — native/external split', () => {
  it('(9) fails when native/external sub-headings are absent from Section 4', () => {
    // Replace the subsection headings with a generic one that has neither keyword
    const stripped = validSampleReviewCode
      .replace(/### Native reviewers/gi, '### All reviewers')
      .replace(/### External reviewers/gi, '### More reviewers');
    const result = validateAuditArtifact(stripped);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /native reviewers/i.test(e))).toBe(true);
    expect(result.errors.some(e => /external reviewers/i.test(e))).toBe(true);
  });

  it('fails when only native sub-heading is missing', () => {
    const stripped = validSampleReviewCode.replace(/### Native reviewers/gi, '### Reviewers');
    const result = validateAuditArtifact(stripped);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /native reviewers/i.test(e))).toBe(true);
  });

  it('fails when only external sub-heading is missing', () => {
    const stripped = validSampleReviewCode.replace(/### External reviewers/gi, '### Reviewers');
    const result = validateAuditArtifact(stripped);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /external reviewers/i.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateAuditArtifact — NFR-MR4 usage enforcement
// ---------------------------------------------------------------------------

describe('validateAuditArtifact — NFR-MR4 usage enforcement', () => {
  it('(10) fails when both usage blocks AND "usage: not_reported" are absent', () => {
    const stripped = validSampleReviewCode
      .replace(/input_tokens[^|]*/gi, '')
      .replace(/output_tokens[^|]*/gi, '')
      .replace(/usage:\s*not_reported/gi, '');
    const result = validateAuditArtifact(stripped);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /NFR-MR4/.test(e))).toBe(true);
  });

  it('(11) passes when "usage: not_reported" present (no input_tokens)', () => {
    // Build a markdown that has not_reported but no input_tokens/output_tokens
    const markdown = validSampleReviewCode
      .replace(/input_tokens[^,|\n]*, output_tokens[^|]*/gi, 'usage: not_reported');
    const result = validateAuditArtifact(markdown);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(12) passes when input_tokens + output_tokens block present (standard NFR-MR4)', () => {
    // validSampleReviewCode already has input_tokens + output_tokens
    const result = validateAuditArtifact(validSampleReviewCode);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateAuditArtifact — Continuation Event conditionality
// ---------------------------------------------------------------------------

describe('validateAuditArtifact — Continuation Event section', () => {
  it('(13) fails when expectContinuationEvent: true and section is absent', () => {
    const result = validateAuditArtifact(validSampleReviewCode, { expectContinuationEvent: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /Continuation Event section expected/i.test(e))).toBe(true);
  });

  it('(14) passes when expectContinuationEvent: true and section is present', () => {
    const result = validateAuditArtifact(validSampleWithContinuation, { expectContinuationEvent: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('(15) passes when expectContinuationEvent: false (default) and section is absent', () => {
    const result = validateAuditArtifact(validSampleReviewCode);
    // absence of Continuation Event is fine when not expected
    expect(result.errors.some(e => /Continuation Event/i.test(e))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateAuditArtifact — attribution
// ---------------------------------------------------------------------------

describe('validateAuditArtifact — attribution (raised_by)', () => {
  it('(16) fails when raised_by attribution is missing from Section 5', () => {
    const stripped = validSampleReviewCode.replace(/raised_by[^))]*/gi, '');
    const result = validateAuditArtifact(stripped);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /raised_by/.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateAuditArtifact — edge cases
// ---------------------------------------------------------------------------

describe('validateAuditArtifact — edge cases', () => {
  it('(17) fails on empty markdown string', () => {
    const result = validateAuditArtifact('');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-empty markdown string/);
  });

  it('fails on non-string input', () => {
    // @ts-expect-error intentional type violation for test
    const result = validateAuditArtifact(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-empty markdown string/);
  });

  it('accumulates multiple errors when several sections are missing', () => {
    const result = validateAuditArtifact('# Minimal\nSome content\nraised_by: x\nusage: not_reported\nNative reviewers\nExternal reviewers');
    expect(result.valid).toBe(false);
    // At minimum, all 6 required sections should be flagged
    expect(result.errors.length).toBeGreaterThanOrEqual(REQUIRED_SECTIONS.length);
  });
});

// ---------------------------------------------------------------------------
// validateAuditArtifact — Team Metadata (Section 8)
// ---------------------------------------------------------------------------

describe('validateAuditArtifact — Team Metadata (Section 8)', () => {
  it('passes when expectTeamMetadata: true and section is present', () => {
    const result = validateAuditArtifact(validSampleWithTeamMetadata, { expectTeamMetadata: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when expectTeamMetadata: true and section is absent', () => {
    const result = validateAuditArtifact(validSampleReviewCode, { expectTeamMetadata: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /Team Metadata section \(Section 8\) expected/i.test(e))).toBe(true);
  });

  it('passes without error when expectTeamMetadata is false and section is absent', () => {
    const result = validateAuditArtifact(validSampleReviewCode, { expectTeamMetadata: false });
    expect(result.errors.some(e => /Team Metadata/i.test(e))).toBe(false);
  });

  it('passes without error when expectTeamMetadata is undefined (default) and section is absent', () => {
    const result = validateAuditArtifact(validSampleReviewCode);
    expect(result.errors.some(e => /Team Metadata/i.test(e))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateAuditArtifact — Pool Routing (Section 9)
// ---------------------------------------------------------------------------

describe('validateAuditArtifact — Pool Routing (Section 9)', () => {
  it('passes when expectPoolRouting: true and section present with valid routing_decision enum', () => {
    const result = validateAuditArtifact(validSampleWithPoolRouting, { expectPoolRouting: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when expectPoolRouting: true and section is absent', () => {
    const result = validateAuditArtifact(validSampleReviewCode, { expectPoolRouting: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /Pool Routing section \(Section 9\) expected/i.test(e))).toBe(true);
  });

  it('fails when routing_decision value is outside the FR-MMT30 enum', () => {
    const badSample = validSampleReviewCode + `
## 9. Pool Routing
- routing_decision: unknown-decision
- pool_name: review-pool
`;
    const result = validateAuditArtifact(badSample, { expectPoolRouting: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /routing_decision value "unknown-decision" is not in the FR-MMT30 enum/.test(e))).toBe(true);
  });

  it('passes without error when expectPoolRouting is false and section is absent', () => {
    const result = validateAuditArtifact(validSampleReviewCode, { expectPoolRouting: false });
    expect(result.errors.some(e => /Pool Routing/i.test(e))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateAuditArtifact — Recovery (Section 10)
// ---------------------------------------------------------------------------

describe('validateAuditArtifact — Recovery (Section 10)', () => {
  it('passes when expectRecovery: true and section is present', () => {
    const result = validateAuditArtifact(validSampleWithRecovery, { expectRecovery: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when expectRecovery: true and section is absent', () => {
    const result = validateAuditArtifact(validSampleReviewCode, { expectRecovery: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /Recovery section \(Section 10\) expected/i.test(e))).toBe(true);
  });

  it('passes without error when expectRecovery is false and section is absent', () => {
    const result = validateAuditArtifact(validSampleReviewCode, { expectRecovery: false });
    expect(result.errors.some(e => /Recovery section/i.test(e))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateAuditArtifact — Attribution Telemetry (Section 11)
// ---------------------------------------------------------------------------

describe('validateAuditArtifact — Attribution Telemetry (Section 11)', () => {
  it('passes when expectAttributionTelemetry: true and section present with all 3 required fields', () => {
    const result = validateAuditArtifact(validSampleWithAttributionTelemetry, { expectAttributionTelemetry: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when expectAttributionTelemetry: true and section is absent', () => {
    const result = validateAuditArtifact(validSampleReviewCode, { expectAttributionTelemetry: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /Finding Attribution Telemetry section \(Section 11\) expected/i.test(e))).toBe(true);
  });

  it('fails when expectAttributionTelemetry: true and section present but missing consolidated_finding_id', () => {
    const badSample = validSampleWithAttributionTelemetry.replace(/consolidated_finding_id[^\n]*/gi, '');
    const result = validateAuditArtifact(badSample, { expectAttributionTelemetry: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /consolidated_finding_id/.test(e))).toBe(true);
  });

  it('fails when expectAttributionTelemetry: true and section present but missing consensus_count', () => {
    const badSample = validSampleWithAttributionTelemetry.replace(/consensus_count[^\n]*/gi, '');
    const result = validateAuditArtifact(badSample, { expectAttributionTelemetry: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /consensus_count/.test(e))).toBe(true);
  });

  it('fails when expectAttributionTelemetry: true and section present but missing minority_of_one', () => {
    const badSample = validSampleWithAttributionTelemetry.replace(/minority_of_one[^\n]*/gi, '');
    const result = validateAuditArtifact(badSample, { expectAttributionTelemetry: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /minority_of_one/.test(e))).toBe(true);
  });

  it('passes when expectAttributionTelemetry: false and section is absent', () => {
    const result = validateAuditArtifact(validSampleReviewCode, { expectAttributionTelemetry: false });
    expect(result.errors.some(e => /Finding Attribution Telemetry section should be absent/i.test(e))).toBe(false);
  });

  it('fails when expectAttributionTelemetry: false and section is present (should be absent)', () => {
    const result = validateAuditArtifact(validSampleWithAttributionTelemetry, { expectAttributionTelemetry: false });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /Finding Attribution Telemetry section should be absent/i.test(e))).toBe(true);
  });

  it('passes without Section 11 validation when expectAttributionTelemetry is undefined (default)', () => {
    // Default behavior: no section 11 presence or absence check
    const result = validateAuditArtifact(validSampleReviewCode);
    expect(result.errors.some(e => /Finding Attribution Telemetry/.test(e))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POOL_ROUTING_DECISION_VALUES constant
// ---------------------------------------------------------------------------

describe('POOL_ROUTING_DECISION_VALUES', () => {
  it('exports all 7 enum values', () => {
    expect(POOL_ROUTING_DECISION_VALUES).toHaveLength(7);
    expect(POOL_ROUTING_DECISION_VALUES).toContain('routed-to-pool');
    expect(POOL_ROUTING_DECISION_VALUES).toContain('fell-back-no-pool');
    expect(POOL_ROUTING_DECISION_VALUES).toContain('fell-back-roster-mismatch');
    expect(POOL_ROUTING_DECISION_VALUES).toContain('fell-back-pool-draining');
    expect(POOL_ROUTING_DECISION_VALUES).toContain('fell-back-pool-stale');
    expect(POOL_ROUTING_DECISION_VALUES).toContain('fell-back-timeout');
    expect(POOL_ROUTING_DECISION_VALUES).toContain('skipped-routing-mode-explicit');
  });

  it('does not include invalid values', () => {
    expect(POOL_ROUTING_DECISION_VALUES).not.toContain('unknown-decision');
    expect(POOL_ROUTING_DECISION_VALUES).not.toContain('routed-to-queue');
    expect(POOL_ROUTING_DECISION_VALUES).not.toContain('');
  });
});

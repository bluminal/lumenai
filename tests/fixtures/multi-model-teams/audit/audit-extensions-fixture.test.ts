/**
 * Layer 2 fixture extension tests — Audit Artifact optional sections 8–11.
 *
 * These tests verify that the audit-artifact validator correctly accepts or
 * rejects representative markdown strings for each multi-model-teams scenario
 * that populates Sections 8 (Team Metadata), 9 (Pool Routing), 10 (Recovery),
 * and 11 (Finding Attribution Telemetry).
 *
 * Source requirements:
 *   - FR-MMT30  (Sections 8, 9, 10 — team_metadata, pool_routing, recovery)
 *   - FR-MMT30a (Section 11 — finding_attribution_telemetry config flag)
 *   - Task 59   (extended audit-artifact-writer.md with Sections 8–10)
 *   - Task 60   (Section 11 + record_finding_attribution_telemetry flag)
 *   - Task 61   (validator helpers: expectTeamMetadata, expectPoolRouting,
 *                expectRecovery, expectAttributionTelemetry)
 *
 * These are behavioral fixture tests (Layer 2): no live agent invocations.
 * Representative markdown strings are inlined and exercised through
 * validateAuditArtifact() from tests/schemas/audit-artifact.ts.
 */

import { describe, it, expect } from 'vitest';
import { validateAuditArtifact } from '../../schemas/audit-artifact';

// ---------------------------------------------------------------------------
// Shared base markdown — valid Sections 1–6 (used as foundation for all cases)
// ---------------------------------------------------------------------------

const BASE_AUDIT = `
# Multi-Model Review Audit

## 1. Invocation Metadata
- Command: review-code
- Target: staged changes
- Timestamp: 2026-04-28T10:00:00Z
- Short hash: c7d8e9f
- Config file path: .synthex/config.yaml

## 2. Config Snapshot
\`\`\`yaml
multi_model_review:
  enabled: true
  strict_mode: false
  include_native_reviewers: true
  min_family_diversity: 2
  min_proposers_to_proceed: 2
  reviewers:
    - codex-review-prompter
    - gemini-review-prompter
  aggregator:
    command: codex-review-prompter
  consolidation:
    stage2_jaccard_threshold: 0.8
  audit:
    enabled: true
    output_path: docs/reviews/
    record_finding_attribution_telemetry: true
\`\`\`

## 3. Preflight Result
4 reviewers configured, 4 available, 3 families, aggregator: codex-review-prompter

- CLI presence check: codex — found (/usr/local/bin/codex)
- CLI auth check: codex — authenticated (exit 0)
- CLI presence check: gemini — found (/usr/local/bin/gemini)
- CLI auth check: gemini — authenticated (exit 0)
- Family diversity: 3 unique families (anthropic, openai, google) — threshold met (min: 2)
- Aggregator resolution source: configured

## 4. Per-Reviewer Results

### Native reviewers
| Reviewer ID | Source Type | Family | Status | Findings Count | Error Code | Usage |
|-------------|-------------|--------|--------|----------------|------------|-------|
| code-reviewer | native-team | anthropic | success | 2 | null | usage: not_reported |
| security-reviewer | native-team | anthropic | success | 1 | null | usage: not_reported |

### External reviewers
| Reviewer ID | Source Type | Family | Status | Findings Count | Error Code | Usage |
|-------------|-------------|--------|--------|----------------|------------|-------|
| codex-review-prompter | external | openai | success | 3 | null | input_tokens: 4800, output_tokens: 360 |
| gemini-review-prompter | external | google | success | 2 | null | input_tokens: 4320, output_tokens: 290 |

## 5. Consolidated Findings with Attribution

### Finding 1
- **Severity:** high
- **Category:** security
- **Title:** SQL injection in users query builder
- **File:** src/db/userQueries.ts
- **Symbol:** buildUserSearchQuery
- **raised_by:**
  - { reviewer_id: code-reviewer, family: anthropic, source_type: native-team }
  - { reviewer_id: security-reviewer, family: anthropic, source_type: native-team }
  - { reviewer_id: codex-review-prompter, family: openai, source_type: external }
- **superseded_by_verification:** false

### Finding 2
- **Severity:** medium
- **Category:** craftsmanship
- **Title:** Unhandled promise rejection in service layer
- **File:** src/services/userService.ts
- **Symbol:** fetchUserById
- **raised_by:**
  - { reviewer_id: code-reviewer, family: anthropic, source_type: native-team }
- **superseded_by_verification:** false

## 6. Aggregator Trace
- Aggregator name: codex-review-prompter
- Resolution source: configured
- Stage 4 LLM-tiebreaker calls dispatched: 1
- Stage 4 LLM-tiebreaker calls skipped (cap): 0
- Position-randomization seed: 2
- Judge-mode prompt indicator: external-packaged
`.trim();

// ---------------------------------------------------------------------------
// Sub-case (a): /team-review --multi-model → Section 8 Team Metadata
// Scenario: code-review standing-pool team with code-reviewer + security-reviewer,
// multi-model active, 2 cross-domain messages between the two reviewers.
// ---------------------------------------------------------------------------

const SECTION_8_TEAM_METADATA = `

## 8. Team Metadata
- Team name: review-a3f7b2c1
- Team type: standing-pool
- Multi-model: true

### Reviewer Roster
| Reviewer ID | Spawn Timestamp |
|-------------|-----------------|
| code-reviewer | 2026-04-28T10:00:00Z |
| security-reviewer | 2026-04-28T10:00:01Z |

### Cross-Domain Messages
Count: 2
| From | To | Subject | Timestamp |
|------|----|---------|-----------|
| code-reviewer | security-reviewer | Potential SQL injection in userQueries.ts line 47 | 2026-04-28T10:03:12Z |
| security-reviewer | code-reviewer | Confirmed — injection path exists via unsanitized input | 2026-04-28T10:04:55Z |
`;

const auditWithTeamMetadata = BASE_AUDIT + SECTION_8_TEAM_METADATA;

describe('Sub-case (a): /team-review --multi-model → Section 8 Team Metadata', () => {
  it('audit markdown contains a Section 8 Team Metadata heading', () => {
    expect(auditWithTeamMetadata).toMatch(/^#+\s*(\d+\.\s*)?Team Metadata/im);
  });

  it('team_type is standing-pool', () => {
    expect(auditWithTeamMetadata).toMatch(/standing-pool/i);
  });

  it('reviewer roster table contains code-reviewer row with spawn timestamp', () => {
    expect(auditWithTeamMetadata).toContain('code-reviewer');
    expect(auditWithTeamMetadata).toContain('2026-04-28T10:00:00Z');
  });

  it('reviewer roster table contains security-reviewer row with spawn timestamp', () => {
    expect(auditWithTeamMetadata).toContain('security-reviewer');
    expect(auditWithTeamMetadata).toContain('2026-04-28T10:00:01Z');
  });

  it('cross-domain message count is 2', () => {
    expect(auditWithTeamMetadata).toMatch(/Count:\s*2/i);
  });

  it('cross-domain messages table has from, to, subject, timestamp columns', () => {
    expect(auditWithTeamMetadata).toMatch(/\|\s*From\s*\|/i);
    expect(auditWithTeamMetadata).toMatch(/\|\s*To\s*\|/i);
    expect(auditWithTeamMetadata).toMatch(/\|\s*Subject\s*\|/i);
    expect(auditWithTeamMetadata).toMatch(/\|\s*Timestamp\s*\|/i);
  });

  it('first cross-domain message is craftsmanship → security direction', () => {
    expect(auditWithTeamMetadata).toContain('code-reviewer | security-reviewer');
  });

  it('second cross-domain message is security → craftsmanship direction (reply)', () => {
    expect(auditWithTeamMetadata).toContain('security-reviewer | code-reviewer');
  });

  it('validateAuditArtifact with expectTeamMetadata: true returns valid: true', () => {
    const result = validateAuditArtifact(auditWithTeamMetadata, { expectTeamMetadata: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateAuditArtifact fails when team metadata section is absent but expected', () => {
    const result = validateAuditArtifact(BASE_AUDIT, { expectTeamMetadata: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /Team Metadata section \(Section 8\) expected/i.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sub-case (b): Pool-match /review-code → Section 9 routing_decision: routed-to-pool
// Scenario: review-pool-b matched via "covers" matching mode (superset of required
// roster). routing_decision is "routed-to-pool", pool_name is non-null, match_rationale
// describes the covers relationship.
// ---------------------------------------------------------------------------

const SECTION_9_ROUTED_TO_POOL = `

## 9. Pool Routing
- routing_decision: routed-to-pool
- pool_name: review-pool-b
- pool_multi_model: true
- match_rationale: covers: pool roster {code-reviewer,security-reviewer} superset-of required {code-reviewer,security-reviewer}
- would_have_routed: false
`;

const auditWithPoolRouted = BASE_AUDIT + SECTION_9_ROUTED_TO_POOL;

describe('Sub-case (b): pool-match /review-code → Section 9 routing_decision: routed-to-pool', () => {
  it('audit markdown contains a Section 9 Pool Routing heading', () => {
    expect(auditWithPoolRouted).toMatch(/^#+\s*(\d+\.\s*)?Pool Routing/im);
  });

  it('routing_decision is routed-to-pool', () => {
    expect(auditWithPoolRouted).toMatch(/routing_decision[:\s]+routed-to-pool/i);
  });

  it('pool_name is non-null (review-pool-b)', () => {
    expect(auditWithPoolRouted).toMatch(/pool_name[:\s]+review-pool-b/i);
  });

  it('match_rationale is non-null and describes superset/covers relationship', () => {
    expect(auditWithPoolRouted).toMatch(/match_rationale[:\s]+covers/i);
    expect(auditWithPoolRouted).toContain('superset-of');
  });

  it('would_have_routed is false', () => {
    expect(auditWithPoolRouted).toMatch(/would_have_routed[:\s]+false/i);
  });

  it('pool_multi_model field is present', () => {
    expect(auditWithPoolRouted).toMatch(/pool_multi_model[:\s]+(true|false)/i);
  });

  it('validateAuditArtifact with expectPoolRouting: true returns valid: true', () => {
    const result = validateAuditArtifact(auditWithPoolRouted, { expectPoolRouting: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateAuditArtifact fails when pool routing section absent but expected', () => {
    const result = validateAuditArtifact(BASE_AUDIT, { expectPoolRouting: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /Pool Routing section \(Section 9\) expected/i.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sub-case (c): No-pool-fallback /review-code → Section 9 routing_decision: fell-back-no-pool
// Scenario: index.json has no pools, prefer-with-fallback mode, falls back to fresh-spawn.
// routing_decision is "fell-back-no-pool", pool_name is null.
// ---------------------------------------------------------------------------

const SECTION_9_NO_POOL_FALLBACK = `

## 9. Pool Routing
- routing_decision: fell-back-no-pool
- pool_name: null
- pool_multi_model: null
- match_rationale: null
- would_have_routed: false
`;

const auditWithNoPoolFallback = BASE_AUDIT + SECTION_9_NO_POOL_FALLBACK;

describe('Sub-case (c): no-pool-fallback /review-code → Section 9 routing_decision: fell-back-no-pool', () => {
  it('audit markdown contains a Section 9 Pool Routing heading', () => {
    expect(auditWithNoPoolFallback).toMatch(/^#+\s*(\d+\.\s*)?Pool Routing/im);
  });

  it('routing_decision is fell-back-no-pool', () => {
    expect(auditWithNoPoolFallback).toMatch(/routing_decision[:\s]+fell-back-no-pool/i);
  });

  it('pool_name is null', () => {
    expect(auditWithNoPoolFallback).toMatch(/pool_name[:\s]+null/i);
  });

  it('validateAuditArtifact with expectPoolRouting: true returns valid: true', () => {
    const result = validateAuditArtifact(auditWithNoPoolFallback, { expectPoolRouting: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('routed-to-pool variant and fell-back-no-pool variant differ in routing_decision', () => {
    expect(auditWithPoolRouted).toMatch(/routing_decision[:\s]+routed-to-pool/i);
    expect(auditWithNoPoolFallback).toMatch(/routing_decision[:\s]+fell-back-no-pool/i);
    expect(auditWithPoolRouted).not.toMatch(/routing_decision[:\s]+fell-back-no-pool/i);
  });

  it('fell-back-no-pool variant has null pool_name unlike routed-to-pool variant', () => {
    expect(auditWithPoolRouted).toMatch(/pool_name[:\s]+review-pool-b/i);
    expect(auditWithNoPoolFallback).toMatch(/pool_name[:\s]+null/i);
  });
});

// ---------------------------------------------------------------------------
// Sub-case (d): FR-MMT24 recovery fired → Section 10 recovery.occurred: true
// Scenario: performance-engineer reviewer crashed mid-review, FR-MMT24 recovery
// fired, remaining reviewers continued. 3 recovery findings captured.
// ---------------------------------------------------------------------------

const SECTION_10_RECOVERY = `

## 10. Recovery
- occurred: true
- failed_reviewer: performance-engineer
- recovery_finding_count: 3
`;

const auditWithRecovery = BASE_AUDIT + SECTION_10_RECOVERY;

describe('Sub-case (d): FR-MMT24 recovery fired → Section 10 recovery.occurred: true', () => {
  it('audit markdown contains a Section 10 Recovery heading', () => {
    expect(auditWithRecovery).toMatch(/^#+\s*(\d+\.\s*)?Recovery/im);
  });

  it('occurred is true', () => {
    expect(auditWithRecovery).toMatch(/occurred[:\s]+true/i);
  });

  it('failed_reviewer is non-null (performance-engineer)', () => {
    expect(auditWithRecovery).toMatch(/failed_reviewer[:\s]+performance-engineer/i);
  });

  it('recovery_finding_count is present', () => {
    expect(auditWithRecovery).toMatch(/recovery_finding_count[:\s]+3/i);
  });

  it('validateAuditArtifact with expectRecovery: true returns valid: true', () => {
    const result = validateAuditArtifact(auditWithRecovery, { expectRecovery: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateAuditArtifact fails when recovery section absent but expected', () => {
    const result = validateAuditArtifact(BASE_AUDIT, { expectRecovery: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /Recovery section \(Section 10\) expected/i.test(e))).toBe(true);
  });

  it('recovery section is silently omitted when recovery block absent and flag not set', () => {
    const result = validateAuditArtifact(BASE_AUDIT);
    expect(result.errors.some(e => /Recovery section/i.test(e))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sub-case (e): Attribution telemetry config flag behavior
//
// Variant 1 (flag=true / default): Section 11 is present with all required fields.
// Variant 2 (flag=false): Section 11 is completely absent.
// ---------------------------------------------------------------------------

const SECTION_11_ATTRIBUTION_TELEMETRY = `

## 11. Finding Attribution Telemetry

### Finding: SEC-UD-001
- consolidated_finding_id: SEC-UD-001
- raised_by:
  - { reviewer_id: code-reviewer, family: anthropic, source_type: native-team }
  - { reviewer_id: security-reviewer, family: anthropic, source_type: native-team }
  - { reviewer_id: codex-review-prompter, family: openai, source_type: external }
- consensus_count: 3
- minority_of_one: false

### Finding: CRAFT-UD-002
- consolidated_finding_id: CRAFT-UD-002
- raised_by:
  - { reviewer_id: code-reviewer, family: anthropic, source_type: native-team }
- consensus_count: 1
- minority_of_one: false
`;

const auditWithAttributionTelemetry = BASE_AUDIT + SECTION_11_ATTRIBUTION_TELEMETRY;
// auditWithoutAttributionTelemetry is just BASE_AUDIT (no Section 11)
const auditWithoutAttributionTelemetry = BASE_AUDIT;

describe('Sub-case (e): Attribution telemetry flag=true → Section 11 present with required fields', () => {
  it('audit markdown contains a Section 11 Finding Attribution Telemetry heading', () => {
    expect(auditWithAttributionTelemetry).toMatch(
      /^#+\s*(\d+\.\s*)?(Finding Attribution Telemetry|Attribution Telemetry)/im
    );
  });

  it('Section 11 contains consolidated_finding_id for each finding entry', () => {
    expect(auditWithAttributionTelemetry).toMatch(/consolidated_finding_id[:\s]+SEC-UD-001/i);
    expect(auditWithAttributionTelemetry).toMatch(/consolidated_finding_id[:\s]+CRAFT-UD-002/i);
  });

  it('Section 11 contains consensus_count field', () => {
    expect(auditWithAttributionTelemetry).toMatch(/consensus_count[:\s]+\d+/i);
  });

  it('Section 11 contains minority_of_one field', () => {
    expect(auditWithAttributionTelemetry).toMatch(/minority_of_one[:\s]+(true|false)/i);
  });

  it('raised_by entries carry reviewer_id, family, and source_type', () => {
    expect(auditWithAttributionTelemetry).toContain('reviewer_id: code-reviewer');
    expect(auditWithAttributionTelemetry).toContain('family: anthropic');
    expect(auditWithAttributionTelemetry).toContain('source_type: native-team');
  });

  it('raised_by entries include external source_type for cross-reviewer findings', () => {
    expect(auditWithAttributionTelemetry).toContain('source_type: external');
    expect(auditWithAttributionTelemetry).toContain('family: openai');
  });

  it('consensus_count of 3 for multi-reviewer finding SEC-UD-001', () => {
    const match = auditWithAttributionTelemetry.match(/SEC-UD-001[\s\S]*?consensus_count[:\s]+(\d+)/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('3');
  });

  it('minority_of_one is false for consensus finding (3 raisers)', () => {
    const match = auditWithAttributionTelemetry.match(/SEC-UD-001[\s\S]*?minority_of_one[:\s]+(true|false)/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('false');
  });

  it('validateAuditArtifact with expectAttributionTelemetry: true returns valid: true', () => {
    const result = validateAuditArtifact(auditWithAttributionTelemetry, {
      expectAttributionTelemetry: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateAuditArtifact fails when Section 11 absent but expectAttributionTelemetry: true', () => {
    const result = validateAuditArtifact(BASE_AUDIT, { expectAttributionTelemetry: true });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(e => /Finding Attribution Telemetry section \(Section 11\) expected/i.test(e))
    ).toBe(true);
  });
});

describe('Sub-case (e): Attribution telemetry flag=false → Section 11 completely absent', () => {
  it('audit markdown does NOT contain a Section 11 heading when flag is false', () => {
    expect(auditWithoutAttributionTelemetry).not.toMatch(
      /^#+\s*(\d+\.\s*)?(Finding Attribution Telemetry|Attribution Telemetry)/im
    );
  });

  it('does NOT contain consolidated_finding_id in the flag=false variant', () => {
    expect(auditWithoutAttributionTelemetry).not.toMatch(/consolidated_finding_id/i);
  });

  it('does NOT contain consensus_count in the flag=false variant', () => {
    expect(auditWithoutAttributionTelemetry).not.toMatch(/consensus_count/i);
  });

  it('Sections 1–6 are structurally unchanged vs. flag=true version (both have Section 1)', () => {
    expect(auditWithAttributionTelemetry).toMatch(/^#+\s*(\d+\.\s*)?Invocation Metadata/im);
    expect(auditWithoutAttributionTelemetry).toMatch(/^#+\s*(\d+\.\s*)?Invocation Metadata/im);
  });

  it('Sections 1–6 are structurally unchanged vs. flag=true version (both have Section 6)', () => {
    expect(auditWithAttributionTelemetry).toMatch(/^#+\s*(\d+\.\s*)?Aggregator Trace/im);
    expect(auditWithoutAttributionTelemetry).toMatch(/^#+\s*(\d+\.\s*)?Aggregator Trace/im);
  });

  it('validateAuditArtifact with expectAttributionTelemetry: false returns valid: true', () => {
    const result = validateAuditArtifact(auditWithoutAttributionTelemetry, {
      expectAttributionTelemetry: false,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateAuditArtifact fails when Section 11 is present but expectAttributionTelemetry: false', () => {
    const result = validateAuditArtifact(auditWithAttributionTelemetry, {
      expectAttributionTelemetry: false,
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(e =>
        /Finding Attribution Telemetry section should be absent/i.test(e)
      )
    ).toBe(true);
  });

  it('flag=false variant passes base validation (no Section 11 enforcement by default)', () => {
    // When expectAttributionTelemetry is not specified (undefined), the default behavior
    // does not enforce presence or absence of Section 11.
    const result = validateAuditArtifact(auditWithoutAttributionTelemetry);
    expect(result.errors.some(e => /Finding Attribution Telemetry/.test(e))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-section integration: all optional sections together (8+9+10+11)
// ---------------------------------------------------------------------------

describe('Integration: all optional sections 8–11 present in a single audit artifact', () => {
  const fullyExtendedAudit =
    BASE_AUDIT +
    SECTION_8_TEAM_METADATA +
    SECTION_9_ROUTED_TO_POOL +
    SECTION_10_RECOVERY +
    SECTION_11_ATTRIBUTION_TELEMETRY;

  it('fully-extended audit passes validateAuditArtifact with all optional flags enabled', () => {
    const result = validateAuditArtifact(fullyExtendedAudit, {
      expectTeamMetadata: true,
      expectPoolRouting: true,
      expectRecovery: true,
      expectAttributionTelemetry: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('all four optional section headings are present', () => {
    expect(fullyExtendedAudit).toMatch(/^#+\s*(\d+\.\s*)?Team Metadata/im);
    expect(fullyExtendedAudit).toMatch(/^#+\s*(\d+\.\s*)?Pool Routing/im);
    expect(fullyExtendedAudit).toMatch(/^#+\s*(\d+\.\s*)?Recovery/im);
    expect(fullyExtendedAudit).toMatch(/^#+\s*(\d+\.\s*)?(Finding Attribution Telemetry|Attribution Telemetry)/im);
  });

  it('sections appear in ascending numeric order (8 before 9 before 10 before 11)', () => {
    const idx8 = fullyExtendedAudit.search(/^#+\s*(\d+\.\s*)?Team Metadata/im);
    const idx9 = fullyExtendedAudit.search(/^#+\s*(\d+\.\s*)?Pool Routing/im);
    const idx10 = fullyExtendedAudit.search(/^#+\s*(\d+\.\s*)?Recovery/im);
    const idx11 = fullyExtendedAudit.search(
      /^#+\s*(\d+\.\s*)?(Finding Attribution Telemetry|Attribution Telemetry)/im
    );
    expect(idx8).toBeGreaterThan(-1);
    expect(idx9).toBeGreaterThan(idx8);
    expect(idx10).toBeGreaterThan(idx9);
    expect(idx11).toBeGreaterThan(idx10);
  });

  it('mandatory base sections (1–6) are unaffected by optional sections being present', () => {
    const result = validateAuditArtifact(fullyExtendedAudit);
    // No errors related to missing mandatory sections
    const mandatoryErrors = result.errors.filter(e =>
      /Missing required section/.test(e) || /native reviewers/i.test(e) || /external reviewers/i.test(e)
    );
    expect(mandatoryErrors).toHaveLength(0);
  });
});

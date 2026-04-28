/**
 * Audit-artifact markdown validator (FR-MR24, NFR-MR4).
 *
 * Source of truth: plugins/synthex/agents/audit-artifact-writer.md (Task 39)
 *
 * The audit writer produces a markdown file with 7 required sections (1-6 mandatory, 7 conditional)
 * plus 4 optional sections added for multi-model teams support (Tasks 59-60):
 *   1. Invocation Metadata
 *   2. Config Snapshot
 *   3. Preflight Result
 *   4. Per-Reviewer Results (split native/external)
 *   5. Consolidated Findings with Attribution
 *   6. Aggregator Trace
 *   7. Continuation Event (omitted when continuation_event === null)
 *   8. Team Metadata (present when a standing pool was used)
 *   9. Pool Routing (present when pool routing was attempted)
 *  10. Recovery (present when a reviewer recovery occurred)
 *  11. Finding Attribution Telemetry (present when record_finding_attribution_telemetry is true)
 *
 * Per NFR-MR4, per-reviewer rows surface the envelope's `usage` object verbatim. When
 * the source envelope's usage is null, the row shows `usage: not_reported` explicitly.
 *
 * Filename pattern: `<YYYY-MM-DD>-<command>-<short-hash>.md` (works for both review-code and
 * write-implementation-plan).
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const COMMAND_VALUES = ['review-code', 'write-implementation-plan'] as const;

export const POOL_ROUTING_DECISION_VALUES = [
  'routed-to-pool',
  'fell-back-no-pool',
  'fell-back-roster-mismatch',
  'fell-back-pool-draining',
  'fell-back-pool-stale',
  'fell-back-timeout',
  'skipped-routing-mode-explicit',
] as const;

export type PoolRoutingDecision = typeof POOL_ROUTING_DECISION_VALUES[number];

export const REQUIRED_SECTIONS = [
  'Invocation Metadata',
  'Config Snapshot',
  'Preflight Result',
  'Per-Reviewer Results',
  'Consolidated Findings',
  'Aggregator Trace',
] as const;
// Section 7 (Continuation Event) is conditional — only required when continuation_event !== null

export const FILENAME_REGEX = /^\d{4}-\d{2}-\d{2}-(review-code|write-implementation-plan)-[a-f0-9]+\.md$/;

export interface ValidateOptions {
  /** When true, expects a Continuation Event section (when source envelope had a continuation_event). */
  expectContinuationEvent?: boolean;
  /** When true, expects a Team Metadata section (Section 8). */
  expectTeamMetadata?: boolean;
  /** When true, expects a Pool Routing section (Section 9). */
  expectPoolRouting?: boolean;
  /** When true, expects a Recovery section (Section 10). */
  expectRecovery?: boolean;
  /** When true (default), expects Finding Attribution Telemetry section (Section 11).
   *  When false, asserts section 11 is ABSENT. */
  expectAttributionTelemetry?: boolean;
}

export function validateFilename(filename: string): ValidationResult {
  const errors: string[] = [];
  if (!FILENAME_REGEX.test(filename)) {
    errors.push(
      `Filename "${filename}" does not match FR-MR24 pattern <YYYY-MM-DD>-<command>-<short-hash>.md`
    );
  }
  return { valid: errors.length === 0, errors };
}

export function validateAuditArtifact(
  markdown: string,
  options: ValidateOptions = {}
): ValidationResult {
  const errors: string[] = [];
  if (typeof markdown !== 'string' || markdown.length === 0) {
    return { valid: false, errors: ['Audit artifact must be a non-empty markdown string'] };
  }

  // Check required sections via heading match (## or ### depending on writer convention)
  for (const section of REQUIRED_SECTIONS) {
    // Match heading containing the section name (case-insensitive, allows numbering prefix like "1.")
    const headingRegex = new RegExp(`^#+\\s*(\\d+\\.\\s*)?${section}`, 'mi');
    if (!headingRegex.test(markdown)) {
      errors.push(`Missing required section: "${section}"`);
    }
  }

  // Check Section 4 split: must have BOTH "Native" AND "External" sub-headings
  const hasNativeSplit = /native\s+reviewers/i.test(markdown);
  const hasExternalSplit = /external\s+reviewers/i.test(markdown);
  if (!hasNativeSplit) {
    errors.push('Section 4 missing "Native reviewers" sub-heading (FR-MR24 native/external split)');
  }
  if (!hasExternalSplit) {
    errors.push('Section 4 missing "External reviewers" sub-heading');
  }

  // NFR-MR4: each external-reviewer entry has usage block (input_tokens, output_tokens) OR explicit "usage: not_reported"
  // We check that the markdown contains at least one of these patterns somewhere in Section 4
  const hasUsageBlock = /input_tokens/.test(markdown) && /output_tokens/.test(markdown);
  const hasUsageNotReported = /usage:\s*not_reported/i.test(markdown);
  if (!hasUsageBlock && !hasUsageNotReported) {
    errors.push(
      'Section 4 must surface usage object verbatim (input_tokens + output_tokens) OR mark "usage: not_reported" (NFR-MR4)'
    );
  }

  // Continuation Event section: required only when expectContinuationEvent is true
  if (options.expectContinuationEvent) {
    const hasContinuationSection = /^#+\s*(\d+\.\s*)?Continuation Event/im.test(markdown);
    if (!hasContinuationSection) {
      errors.push('Continuation Event section expected (continuation_event was non-null in source envelope)');
    }
  }

  // Findings section: should reference attribution (raised_by)
  const hasAttribution = /raised_by/i.test(markdown);
  if (!hasAttribution) {
    errors.push('Section 5 missing finding attribution (raised_by) — per FR-MR24, findings carry full attribution');
  }

  // Team Metadata (Section 8): optional, required when expectTeamMetadata is true
  if (options.expectTeamMetadata) {
    const hasTeamMetadata = /^#+\s*(\d+\.\s*)?Team Metadata/im.test(markdown);
    if (!hasTeamMetadata) {
      errors.push('Team Metadata section (Section 8) expected (team_metadata block was provided)');
    }
  }

  // Pool Routing (Section 9): optional, required when expectPoolRouting is true
  if (options.expectPoolRouting) {
    const hasPoolRouting = /^#+\s*(\d+\.\s*)?Pool Routing/im.test(markdown);
    if (!hasPoolRouting) {
      errors.push('Pool Routing section (Section 9) expected (pool_routing block was provided)');
    }
    // Validate routing_decision enum coverage
    const routingDecisionMatch = markdown.match(/routing_decision[:\s]+([a-z-]+)/i);
    if (routingDecisionMatch) {
      const decision = routingDecisionMatch[1];
      if (!POOL_ROUTING_DECISION_VALUES.includes(decision as PoolRoutingDecision)) {
        errors.push(`routing_decision value "${decision}" is not in the FR-MMT30 enum`);
      }
    }
  }

  // Recovery (Section 10): optional, required when expectRecovery is true
  if (options.expectRecovery) {
    const hasRecovery = /^#+\s*(\d+\.\s*)?Recovery/im.test(markdown);
    if (!hasRecovery) {
      errors.push('Recovery section (Section 10) expected (recovery block was provided)');
    }
  }

  // Finding Attribution Telemetry (Section 11)
  // expectAttributionTelemetry: default true when undefined
  const checkAttribution = options.expectAttributionTelemetry !== false;
  if (checkAttribution) {
    // When explicitly set to true, validates presence and required fields
    if (options.expectAttributionTelemetry === true) {
      const hasAttributionSection = /^#+\s*(\d+\.\s*)?(Finding Attribution Telemetry|Attribution Telemetry)/im.test(markdown);
      if (!hasAttributionSection) {
        errors.push('Finding Attribution Telemetry section (Section 11) expected (record_finding_attribution_telemetry is true)');
      }
      // Validate each entry has consolidated_finding_id and consensus_count
      if (!/consolidated_finding_id/i.test(markdown)) {
        errors.push('Section 11 missing consolidated_finding_id field (FR-MMT30a)');
      }
      if (!/consensus_count/i.test(markdown)) {
        errors.push('Section 11 missing consensus_count field (FR-MMT30a)');
      }
      if (!/minority_of_one/i.test(markdown)) {
        errors.push('Section 11 missing minority_of_one field (FR-MMT30a)');
      }
    }
  } else {
    // expectAttributionTelemetry === false: assert section 11 is ABSENT
    const hasAttributionSection = /^#+\s*(\d+\.\s*)?(Finding Attribution Telemetry|Attribution Telemetry)/im.test(markdown);
    if (hasAttributionSection) {
      errors.push('Finding Attribution Telemetry section should be absent when record_finding_attribution_telemetry is false (FR-MMT30a)');
    }
  }

  return { valid: errors.length === 0, errors };
}

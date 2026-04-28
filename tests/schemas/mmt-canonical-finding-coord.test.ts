/**
 * Task 2a coordination tests: verify parent canonical-finding-schema includes
 * `native-team` + `native-recovery` enum values (multi-model-teams requirement).
 *
 * Covers:
 * 1. canonical-finding-schema.md exists
 * 2. JSON Schema includes all 3 source_type enum values verbatim
 * 3. native-recovery use case documented (FR-MMT24 + "fresh native sub-agent")
 * 4. Validator accepts findings with source_type "native-recovery"
 * 5. SOURCE_TYPE_VALUES includes all 3 values
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCanonicalFinding, SOURCE_TYPE_VALUES } from './canonical-finding.js';

const SCHEMA_MD_PATH = resolve(
  __dirname,
  '../../plugins/synthex/agents/_shared/canonical-finding-schema.md',
);

const VALID_NATIVE_RECOVERY_FINDING = {
  finding_id: 'reliability.freshSpawn.fallback-finding',
  severity: 'medium',
  category: 'reliability',
  title: 'Fallback finding from fresh native sub-agent (FR-MMT24)',
  description: 'The original reviewer sub-agent timed out; this finding was produced by a fresh native sub-agent spawned via the FR-MMT24 recovery path.',
  file: 'src/orchestrator/review-coordinator.ts',
  source: {
    reviewer_id: 'native-recovery-reviewer',
    family: 'anthropic',
    source_type: 'native-recovery',
  },
};

describe('Task 2a — MMT canonical-finding schema coordination', () => {

  // 1. Schema file exists
  it('canonical-finding-schema.md exists on disk', () => {
    let content: string;
    expect(() => {
      content = readFileSync(SCHEMA_MD_PATH, 'utf8');
    }).not.toThrow();
    expect(content!.length).toBeGreaterThan(0);
  });

  // 2. JSON Schema includes all 3 source_type enum values verbatim
  it('JSON Schema includes "native-team" enum value', () => {
    const content = readFileSync(SCHEMA_MD_PATH, 'utf8');
    expect(content).toContain('"native-team"');
  });

  it('JSON Schema includes "external" enum value', () => {
    const content = readFileSync(SCHEMA_MD_PATH, 'utf8');
    expect(content).toContain('"external"');
  });

  it('JSON Schema includes "native-recovery" enum value', () => {
    const content = readFileSync(SCHEMA_MD_PATH, 'utf8');
    expect(content).toContain('"native-recovery"');
  });

  // 3. native-recovery use case is documented with FR-MMT24 + "fresh native sub-agent"
  it('documents native-recovery use case referencing FR-MMT24', () => {
    const content = readFileSync(SCHEMA_MD_PATH, 'utf8');
    expect(content).toContain('FR-MMT24');
  });

  it('documents native-recovery use case referencing "native-recovery"', () => {
    const content = readFileSync(SCHEMA_MD_PATH, 'utf8');
    // Must appear outside the JSON block too (prose documentation)
    const occurrences = (content.match(/native-recovery/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2); // at least in JSON + prose
  });

  it('documents native-recovery use case referencing "fresh native sub-agent"', () => {
    const content = readFileSync(SCHEMA_MD_PATH, 'utf8');
    expect(content).toContain('fresh native sub-agent');
  });

  // 4. Validator accepts a finding with source_type "native-recovery"
  it('validator accepts a finding with source_type "native-recovery"', () => {
    const result = validateCanonicalFinding(VALID_NATIVE_RECOVERY_FINDING);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validator acceptance of native-recovery is distinct from native-team', () => {
    const nativeTeam = validateCanonicalFinding({
      ...VALID_NATIVE_RECOVERY_FINDING,
      source: { ...VALID_NATIVE_RECOVERY_FINDING.source, source_type: 'native-team' },
    });
    const nativeRecovery = validateCanonicalFinding(VALID_NATIVE_RECOVERY_FINDING);
    expect(nativeTeam.valid).toBe(true);
    expect(nativeRecovery.valid).toBe(true);
  });

  // 5. SOURCE_TYPE_VALUES includes all 3 values
  it('SOURCE_TYPE_VALUES includes "native-team"', () => {
    expect(SOURCE_TYPE_VALUES).toContain('native-team');
  });

  it('SOURCE_TYPE_VALUES includes "external"', () => {
    expect(SOURCE_TYPE_VALUES).toContain('external');
  });

  it('SOURCE_TYPE_VALUES includes "native-recovery"', () => {
    expect(SOURCE_TYPE_VALUES).toContain('native-recovery');
  });

  it('SOURCE_TYPE_VALUES contains exactly 3 values', () => {
    expect(SOURCE_TYPE_VALUES).toHaveLength(3);
  });
});

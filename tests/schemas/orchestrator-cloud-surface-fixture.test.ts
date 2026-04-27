/**
 * Task 23c: Layer 2 fixture validation — cloud-surface (NFR-MR2 single remediation).
 *
 * Validates:
 * 1. expected_envelope passes validateOrchestratorOutput schema
 * 2. continuation_event.type === "cloud-surface-no-clis"
 * 3. continuation_event.details mentions "adapter-recipes.md" (raw-string)
 * 4. continuation_event.details is a SINGLE string — not an array of per-CLI errors
 *    (proves "single remediation, not cascade")
 * 5. Verbatim cloud-surface message: orchestrator.md contains the substring
 *    "no external review CLIs are available" (Task 23c contract)
 * 6. orchestrator.md references "adapter-recipes.md"
 * 7. All 3 external adapter entries have error_code: cli_missing (audit state consistent)
 *    AND the user-visible event is the SINGLE continuation_event (not a per-CLI cascade
 *    in continuation_event.details)
 * 8. NFR-MR2 is referenced in orchestrator.md
 * 9. findings === [] (cloud-surface aborts — no consolidation)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateOrchestratorOutput } from './orchestrator-output.js';

// ── File paths ─────────────────────────────────────────────────────────────

const FIXTURE_DIR = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'multi-model-review',
  'orchestrator',
  'cloud-surface'
);

const ORCHESTRATOR_MD = join(
  import.meta.dirname,
  '..', '..',
  'plugins', 'synthex', 'agents', 'multi-model-review-orchestrator.md'
);

// ── Load fixtures ──────────────────────────────────────────────────────────

const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'fixture.json'), 'utf-8'));
const expectedEnvelope = JSON.parse(readFileSync(join(FIXTURE_DIR, 'expected_envelope.json'), 'utf-8'));
const orchestratorMd = readFileSync(ORCHESTRATOR_MD, 'utf-8');

// ── Verbatim cloud-surface remediation message (Task 23c contract) ─────────

const CLOUD_SURFACE_REMEDIATION_SUBSTRING = 'no external review CLIs are available';
const ADAPTER_RECIPES_DOC = 'adapter-recipes.md';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Task 23c: cloud-surface fixture — NFR-MR2 single remediation validation', () => {

  // ── 1. Schema validation ─────────────────────────────────────────────────

  describe('1. expected_envelope passes validateOrchestratorOutput', () => {
    it('validateOrchestratorOutput returns valid: true for expected_envelope', () => {
      const result = validateOrchestratorOutput(expectedEnvelope);
      expect(result.valid, `Schema errors: ${result.errors.join('; ')}`).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ── 2. continuation_event.type ───────────────────────────────────────────

  describe('2. continuation_event.type === "cloud-surface-no-clis"', () => {
    it('continuation_event is present (not null)', () => {
      expect(expectedEnvelope.continuation_event).not.toBeNull();
      expect(expectedEnvelope.continuation_event).toBeDefined();
    });

    it('continuation_event.type is "cloud-surface-no-clis"', () => {
      expect(expectedEnvelope.continuation_event.type).toBe('cloud-surface-no-clis');
    });

    it('fixture.expected_continuation_type is "cloud-surface-no-clis"', () => {
      expect(fixture.expected_continuation_type).toBe('cloud-surface-no-clis');
    });

    it('fixture expected_continuation_type matches envelope continuation_event.type', () => {
      expect(expectedEnvelope.continuation_event.type).toBe(fixture.expected_continuation_type);
    });
  });

  // ── 3. continuation_event.details references adapter-recipes.md ──────────

  describe('3. continuation_event.details references adapter-recipes.md (raw-string)', () => {
    it('continuation_event.details mentions "adapter-recipes.md"', () => {
      expect(expectedEnvelope.continuation_event.details).toContain(ADAPTER_RECIPES_DOC);
    });

    it('fixture.remediation_doc_reference is "adapter-recipes.md"', () => {
      expect(fixture.remediation_doc_reference).toBe(ADAPTER_RECIPES_DOC);
    });

    it('continuation_event.details contains the fixture remediation_doc_reference', () => {
      expect(expectedEnvelope.continuation_event.details).toContain(fixture.remediation_doc_reference);
    });
  });

  // ── 4. Single remediation — NOT a per-CLI cascade ────────────────────────

  describe('4. continuation_event.details is a SINGLE string (not a per-CLI cascade)', () => {
    it('continuation_event.details is a string (not an array)', () => {
      expect(typeof expectedEnvelope.continuation_event.details).toBe('string');
    });

    it('continuation_event.details is non-empty', () => {
      expect(expectedEnvelope.continuation_event.details.length).toBeGreaterThan(0);
    });

    it('continuation_event.details does NOT list per-CLI errors (no "codex-review-prompter" in details)', () => {
      expect(expectedEnvelope.continuation_event.details).not.toContain('codex-review-prompter');
    });

    it('continuation_event.details does NOT list per-CLI errors (no "gemini-review-prompter" in details)', () => {
      expect(expectedEnvelope.continuation_event.details).not.toContain('gemini-review-prompter');
    });

    it('continuation_event.details does NOT list per-CLI errors (no "ollama-review-prompter" in details)', () => {
      expect(expectedEnvelope.continuation_event.details).not.toContain('ollama-review-prompter');
    });

    it('fixture.expected_NOT_a_per_cli_cascade is true', () => {
      expect(fixture.expected_NOT_a_per_cli_cascade).toBe(true);
    });
  });

  // ── 5. Verbatim cloud-surface message in orchestrator.md ─────────────────

  describe('5. Verbatim cloud-surface message check in orchestrator.md (Task 23c contract)', () => {
    it('orchestrator.md contains the substring "no external review CLIs are available"', () => {
      expect(orchestratorMd).toContain(CLOUD_SURFACE_REMEDIATION_SUBSTRING);
    });

    it('continuation_event.details contains the substring "no external review CLIs are available"', () => {
      expect(expectedEnvelope.continuation_event.details).toContain(CLOUD_SURFACE_REMEDIATION_SUBSTRING);
    });

    it('fixture.single_remediation_error_substring is "no external review CLIs are available"', () => {
      expect(fixture.single_remediation_error_substring).toBe(CLOUD_SURFACE_REMEDIATION_SUBSTRING);
    });

    it('orchestrator.md contains the fixture single_remediation_error_substring', () => {
      expect(orchestratorMd).toContain(fixture.single_remediation_error_substring);
    });
  });

  // ── 6. orchestrator.md references adapter-recipes.md ────────────────────

  describe('6. orchestrator.md references adapter-recipes.md', () => {
    it('orchestrator.md contains "adapter-recipes.md"', () => {
      expect(orchestratorMd).toContain(ADAPTER_RECIPES_DOC);
    });
  });

  // ── 7. All 3 externals have cli_missing; single user-visible event ────────

  describe('7. All 3 external adapter entries have error_code: cli_missing (audit) and single user-visible event', () => {
    const externalEntries = (expectedEnvelope.per_reviewer_results as Array<{
      reviewer_id: string;
      source_type: string;
      status: string;
      error_code: string | null;
    }>).filter(e => e.source_type === 'external');

    it('exactly 3 external entries are present', () => {
      expect(externalEntries).toHaveLength(3);
    });

    it('all external entries have status: failed', () => {
      for (const entry of externalEntries) {
        expect(entry.status).toBe('failed');
      }
    });

    it('all external entries have error_code: "cli_missing"', () => {
      for (const entry of externalEntries) {
        expect(entry.error_code).toBe('cli_missing');
      }
    });

    it('codex-review-prompter entry has error_code: "cli_missing"', () => {
      const entry = externalEntries.find(e => e.reviewer_id === 'codex-review-prompter');
      expect(entry).toBeDefined();
      expect(entry?.error_code).toBe('cli_missing');
    });

    it('gemini-review-prompter entry has error_code: "cli_missing"', () => {
      const entry = externalEntries.find(e => e.reviewer_id === 'gemini-review-prompter');
      expect(entry).toBeDefined();
      expect(entry?.error_code).toBe('cli_missing');
    });

    it('ollama-review-prompter entry has error_code: "cli_missing"', () => {
      const entry = externalEntries.find(e => e.reviewer_id === 'ollama-review-prompter');
      expect(entry).toBeDefined();
      expect(entry?.error_code).toBe('cli_missing');
    });

    it('user-visible continuation_event.details does NOT enumerate 3 separate cli_missing errors (single remediation)', () => {
      // Count how many times cli_missing appears in continuation_event.details
      // A cascade would list it once per CLI (3+); a single remediation lists it 0 times
      const details: string = expectedEnvelope.continuation_event.details;
      const occurrences = (details.match(/cli_missing/g) || []).length;
      expect(occurrences).toBe(0);
    });

    it('fixture.all_externals_unavailable is true', () => {
      expect(fixture.all_externals_unavailable).toBe(true);
    });
  });

  // ── 8. NFR-MR2 referenced in orchestrator.md ────────────────────────────

  describe('8. NFR-MR2 is referenced in orchestrator.md', () => {
    it('orchestrator.md mentions NFR-MR2', () => {
      expect(orchestratorMd).toContain('NFR-MR2');
    });
  });

  // ── 9. findings === [] (cloud-surface aborts) ────────────────────────────

  describe('9. findings === [] (cloud-surface aborts — no consolidation)', () => {
    it('findings is an empty array', () => {
      expect(Array.isArray(expectedEnvelope.findings)).toBe(true);
      expect(expectedEnvelope.findings).toHaveLength(0);
    });
  });

  // ── 10. Native entries still present and succeeded ───────────────────────

  describe('10. Native entries are present in per_reviewer_results (audit completeness)', () => {
    const nativeEntries = (expectedEnvelope.per_reviewer_results as Array<{
      reviewer_id: string;
      source_type: string;
      status: string;
      error_code: string | null;
    }>).filter(e => e.source_type === 'native-team');

    it('exactly 2 native-team entries are present', () => {
      expect(nativeEntries).toHaveLength(2);
    });

    it('all native entries have status: success', () => {
      for (const entry of nativeEntries) {
        expect(entry.status).toBe('success');
      }
    });

    it('code-reviewer native entry is present', () => {
      const entry = nativeEntries.find(e => e.reviewer_id === 'code-reviewer');
      expect(entry).toBeDefined();
    });

    it('security-reviewer native entry is present', () => {
      const entry = nativeEntries.find(e => e.reviewer_id === 'security-reviewer');
      expect(entry).toBeDefined();
    });
  });

});

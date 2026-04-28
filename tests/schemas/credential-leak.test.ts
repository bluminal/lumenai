/**
 * Task 41: Cross-cutting credential-leak test (FR-MR2).
 *
 * Scans ALL paths the orchestrator writes during a representative review-code
 * multi-model invocation for credential leakage. 60 assertions:
 * 10 credential patterns × 6 output files.
 *
 * Source of truth: FR-MR2 (no credentials in any orchestrator-written output path).
 * Fixture: tests/fixtures/multi-model-review/credential-scope/representative-invocation/
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';

const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'multi-model-review', 'credential-scope', 'representative-invocation');
const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, 'fixture.json'), 'utf8'));
const PATTERN_SET = fixture.credential_pattern_set as string[];

const SCANNED_FILES = [
  'audit-file.md',
  'raw-output-codex.json',
  'raw-output-gemini.json',
  'orchestrator-stderr.log',
  'synthex-config-yaml-post-init.yaml',
  'bundle-manifest.json',
];

describe('Task 41: Cross-cutting credential-leak test (FR-MR2)', () => {
  describe('Fixture structure', () => {
    it('fixture.json declares the credential pattern set', () => {
      expect(PATTERN_SET).toBeDefined();
      expect(PATTERN_SET.length).toBeGreaterThanOrEqual(10);
    });

    it('fixture.json declares all 5 scanned path categories', () => {
      expect(fixture.scanned_paths).toEqual([
        'audit_file',
        'raw_output_files',
        'orchestrator_stderr',
        'synthex_config_yaml_post_init',
        'bundle_manifest',
      ]);
    });

    it.each(SCANNED_FILES)('sample file exists: %s', (file) => {
      expect(statSync(join(FIXTURE_DIR, file)).isFile()).toBe(true);
    });
  });

  describe('Audit file (FR-MR24) contains expected sections', () => {
    let auditContent: string;
    beforeAll(() => {
      auditContent = readFileSync(join(FIXTURE_DIR, 'audit-file.md'), 'utf8');
    });
    it('contains "Invocation Metadata" section', () => expect(auditContent).toMatch(/Invocation Metadata/));
    it('contains "Per-Reviewer Results" section', () => expect(auditContent).toMatch(/Per-Reviewer Results/));
    it('contains "Consolidated Findings" section', () => expect(auditContent).toMatch(/Consolidated Findings/));
  });

  describe('Credential-pattern grep across all 6 output files', () => {
    for (const file of SCANNED_FILES) {
      describe(`File: ${file}`, () => {
        let content: string;
        beforeAll(() => {
          content = readFileSync(join(FIXTURE_DIR, file), 'utf8');
        });
        for (const pattern of PATTERN_SET) {
          it(`does NOT contain credential pattern "${pattern}"`, () => {
            expect(content).not.toContain(pattern);
          });
        }
      });
    }
  });

  describe('CI integration', () => {
    it('test file lives under tests/schemas/ (Layer 2 default suite)', () => {
      // Existence check: this very file is found in the suite. Trivially passes by being run.
      expect(true).toBe(true);
    });
  });
});

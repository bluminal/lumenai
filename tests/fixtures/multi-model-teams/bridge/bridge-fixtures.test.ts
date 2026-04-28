import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixtureBase = join(__dirname);

function loadFixture(scenario: string, file: string) {
  return JSON.parse(readFileSync(join(fixtureBase, scenario, file), 'utf-8'));
}

describe('Team Orchestrator Bridge — Layer 2 Fixtures', () => {
  describe('well-formed-mailbox', () => {
    it('produces 2 reviewers × 1 finding each with source_type native-team', () => {
      const output = loadFixture('well-formed-mailbox', 'expected-output.json');
      expect(output.per_reviewer_results).toHaveLength(2);
      expect(output.findings).toHaveLength(2);
      output.findings.forEach((f: any) => {
        expect(f.source.source_type).toBe('native-team');
        expect(f.source.family).toBe('anthropic');
      });
    });

    it('preserves report_markdown verbatim for each reviewer', () => {
      const output = loadFixture('well-formed-mailbox', 'expected-output.json');
      const codeReviewer = output.per_reviewer_results.find((r: any) => r.reviewer_id === 'code-reviewer');
      expect(codeReviewer.report_markdown).toContain('## Code Review Report');
      expect(codeReviewer.status).toBe('success');
      expect(codeReviewer.error_code).toBeNull();
    });

    it('both reviewers have status success', () => {
      const output = loadFixture('well-formed-mailbox', 'expected-output.json');
      output.per_reviewer_results.forEach((r: any) => {
        expect(r.status).toBe('success');
        expect(r.source_type).toBe('native-team');
      });
    });
  });

  describe('malformed-findings-json', () => {
    it('marks malformed reviewer as parse_failed', () => {
      const output = loadFixture('malformed-findings-json', 'expected-output-after-retry-failure.json');
      const codeReviewer = output.per_reviewer_results.find((r: any) => r.reviewer_id === 'code-reviewer');
      expect(codeReviewer.status).toBe('failed');
      expect(codeReviewer.error_code).toBe('parse_failed');
      expect(codeReviewer.findings_count).toBe(0);
    });

    it('well-formed reviewer flows through when one reviewer is malformed', () => {
      const output = loadFixture('malformed-findings-json', 'expected-output-after-retry-failure.json');
      const securityReviewer = output.per_reviewer_results.find((r: any) => r.reviewer_id === 'security-reviewer');
      expect(securityReviewer.status).toBe('success');
      expect(securityReviewer.findings_count).toBe(1);
    });

    it('output findings[] contains only well-formed reviewer findings', () => {
      const output = loadFixture('malformed-findings-json', 'expected-output-after-retry-failure.json');
      expect(output.findings).toHaveLength(1);
      expect(output.findings[0].source.reviewer_id).toBe('security-reviewer');
    });

    it('clarification message targets the malformed reviewer', () => {
      const clarification = loadFixture('malformed-findings-json', 'expected-clarification-message.json');
      expect(clarification.to).toBe('code-reviewer');
      expect(clarification.type).toBe('message');
      expect(clarification.body).toMatch(/findings_json/);
    });
  });

  describe('missing-findings-json', () => {
    it('missing findings_json triggers same parse_failed path as malformed', () => {
      const output = loadFixture('missing-findings-json', 'expected-output-after-retry-failure.json');
      const codeReviewer = output.per_reviewer_results.find((r: any) => r.reviewer_id === 'code-reviewer');
      expect(codeReviewer.status).toBe('failed');
      expect(codeReviewer.error_code).toBe('parse_failed');
    });

    it('well-formed reviewer still flows through when findings_json is absent', () => {
      const output = loadFixture('missing-findings-json', 'expected-output-after-retry-failure.json');
      const securityReviewer = output.per_reviewer_results.find((r: any) => r.reviewer_id === 'security-reviewer');
      expect(securityReviewer.status).toBe('success');
    });
  });
});

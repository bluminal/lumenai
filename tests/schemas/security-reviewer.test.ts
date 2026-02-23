/**
 * Layer 1: Schema validation tests for Security Reviewer output.
 *
 * Validates structural compliance against the format defined in
 * security-reviewer.md. Runs against golden snapshots.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateSecurityReviewerOutput } from './security-reviewer.js';
import {
  parseMarkdownOutput,
  areFindingsSorted,
  isVerdictConsistent,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadSecuritySnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('security-reviewer--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('security-reviewer--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Security Reviewer Schema', () => {
  const snapshots = loadSecuritySnapshots();
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes full schema validation', () => {
          const result = validateSecurityReviewerOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
        });

        it('has a verdict (PASS, WARN, or FAIL)', () => {
          const parsed = parseMarkdownOutput(output);
          expect(parsed.verdict, 'Could not detect verdict in output').not.toBeNull();
          expect(['PASS', 'WARN', 'FAIL']).toContain(parsed.verdict);
        });

        it('contains security-related content', () => {
          const lower = output.toLowerCase();
          expect(
            lower.includes('security') ||
            lower.includes('vulnerability') ||
            lower.includes('cwe') ||
            lower.includes('owasp') ||
            lower.includes('finding')
          ).toBe(true);
        });
      });
    }
  });

  // Fixture-specific expectations
  describe.runIf(hasSnapshots && 'security/clean-code' in snapshots)('Clean code (PASS or WARN)', () => {
    it('has PASS or WARN verdict (no critical issues in clean code)', () => {
      const parsed = parseMarkdownOutput(snapshots['security/clean-code']);
      expect(['PASS', 'WARN']).toContain(parsed.verdict);
    });
  });

  describe.runIf(hasSnapshots && 'security/hardcoded-secret' in snapshots)('Hardcoded secret (FAIL)', () => {
    it('has FAIL verdict', () => {
      const parsed = parseMarkdownOutput(snapshots['security/hardcoded-secret']);
      expect(parsed.verdict).toBe('FAIL');
    });

    it('mentions credentials or secrets', () => {
      const lower = snapshots['security/hardcoded-secret'].toLowerCase();
      expect(
        lower.includes('credential') ||
        lower.includes('secret') ||
        lower.includes('hardcoded') ||
        lower.includes('aws')
      ).toBe(true);
    });
  });

  describe.runIf(hasSnapshots && 'security/mixed-severity' in snapshots)('Mixed severity (sorted)', () => {
    it('has findings sorted by severity', () => {
      const parsed = parseMarkdownOutput(snapshots['security/mixed-severity']);
      if (parsed.findings.length > 1) {
        expect(areFindingsSorted(parsed.findings)).toBe(true);
      }
    });
  });
});

// ── Unit tests for the parser ────────────────────────────────────

describe('Security output parser', () => {
  const sampleOutput = `## Security Review Verdict: FAIL

### Summary
Critical security issues found: hardcoded AWS credentials and exposed database connection string.

### Findings

#### [CRITICAL] Hardcoded AWS Access Key
- **CWE:** CWE-798
- **Category:** Secrets & Sensitive Data Leakage
- **Risk:** Attacker can gain full AWS account access if this key is exposed via source control
- **Location:** src/config.ts:2-4
- **Description:** AWS access key ID and secret key are hardcoded directly in the source code.
- **Proof:**
\`\`\`typescript
export const AWS_CONFIG = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};
\`\`\`
- **Remediation:** Use environment variables or AWS SDK credential providers:
\`\`\`typescript
import { fromEnv } from '@aws-sdk/credential-providers';
const credentials = fromEnv();
\`\`\`
- **References:** https://cwe.mitre.org/data/definitions/798.html

#### [HIGH] Exposed Database Connection String
- **CWE:** CWE-259
- **Category:** Secrets & Sensitive Data Leakage
- **Risk:** Database credentials exposed, allowing unauthorized database access
- **Location:** src/config.ts:7
- **Description:** PostgreSQL connection string with username and password hardcoded.
- **Proof:**
\`\`\`typescript
export const DB_URL = 'postgres://admin:supersecret@prod-db.example.com:5432/myapp';
\`\`\`
- **Remediation:** Use environment variables:
\`\`\`typescript
export const DB_URL = process.env.DATABASE_URL;
\`\`\`
- **References:** https://cwe.mitre.org/data/definitions/259.html

### Secrets Scan
Detected 2 secrets in changed files:
- AWS Access Key ID pattern (AKIA...) in src/config.ts:3
- Database connection string with embedded credentials in src/config.ts:7

### Dependency Audit
No dependency changes in this review.

### Recommendations
1. Set up a pre-commit hook with a secrets scanner (e.g., truffleHog, git-secrets) to prevent credential commits
2. Rotate the exposed AWS credentials immediately if they are real (not example values)
3. Consider using AWS Secrets Manager or HashiCorp Vault for centralized secret management`;

  it('extracts FAIL verdict', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.verdict).toBe('FAIL');
    expect(parsed.agentType).toBe('security');
  });

  it('extracts 2 findings', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings).toHaveLength(2);
  });

  it('first finding is CRITICAL with CWE-798', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings[0].severity).toBe('CRITICAL');
    expect(parsed.findings[0].cweReference).toBe('CWE-798');
  });

  it('second finding is HIGH with CWE-259', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings[1].severity).toBe('HIGH');
    expect(parsed.findings[1].cweReference).toBe('CWE-259');
  });

  it('findings have code blocks', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings[0].hasCodeBlock).toBe(true);
    expect(parsed.findings[1].hasCodeBlock).toBe(true);
  });

  it('Secrets Scan section has content', () => {
    const secretsScan = findSection(parseMarkdownOutput(sampleOutput).sections, 'Secrets Scan');
    expect(secretsScan).toBeDefined();
    expect(secretsScan!.content).not.toBe('');
  });

  it('Dependency Audit section has content', () => {
    const depAudit = findSection(parseMarkdownOutput(sampleOutput).sections, 'Dependency Audit');
    expect(depAudit).toBeDefined();
    expect(depAudit!.content).not.toBe('');
  });

  it('passes full schema validation', () => {
    const result = validateSecurityReviewerOutput(sampleOutput);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

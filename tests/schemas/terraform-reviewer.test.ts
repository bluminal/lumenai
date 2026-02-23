/**
 * Layer 1: Schema validation tests for Terraform Plan Reviewer output.
 *
 * These tests validate structural compliance of agent outputs against
 * the format defined in terraform-plan-reviewer.md. They run against
 * golden snapshots stored in __snapshots__/ — zero LLM cost.
 *
 * To regenerate snapshots: npm run snapshots:update
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateTerraformReviewerOutput } from './terraform-reviewer.js';
import {
  parseMarkdownOutput,
  areFindingsSorted,
  isVerdictConsistent,
  getMaxSeverity,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadTerraformSnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('terraform-plan-reviewer--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('terraform-plan-reviewer--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Terraform Plan Reviewer Schema', () => {
  const snapshots = loadTerraformSnapshots();

  // Skip all tests if no snapshots exist yet
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes full schema validation', () => {
          const result = validateTerraformReviewerOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
          expect(result.valid).toBe(true);
        });

        it('has a verdict (PASS, WARN, or FAIL)', () => {
          const parsed = parseMarkdownOutput(output);
          expect(parsed.verdict, 'Could not detect verdict in output').not.toBeNull();
          expect(['PASS', 'WARN', 'FAIL']).toContain(parsed.verdict);
        });

        it('contains a summary or overview section', () => {
          const lower = output.toLowerCase();
          expect(
            lower.includes('summary') || lower.includes('overview') || lower.includes('executive summary')
          ).toBe(true);
        });

        it('contains cost information', () => {
          const lower = output.toLowerCase();
          expect(
            lower.includes('cost') || lower.includes('pricing') || lower.includes('estimated')
          ).toBe(true);
        });
      });
    }
  });

  // Tests against specific fixture expectations
  describe.runIf(hasSnapshots && 'terraform/clean-plan' in snapshots)('Clean plan (PASS or WARN)', () => {
    it('has PASS or WARN verdict (no critical/high issues in clean plan)', () => {
      const parsed = parseMarkdownOutput(snapshots['terraform/clean-plan']);
      expect(['PASS', 'WARN']).toContain(parsed.verdict);
    });

    it('has no CRITICAL findings', () => {
      const parsed = parseMarkdownOutput(snapshots['terraform/clean-plan']);
      const critical = parsed.findings.filter(f => f.severity === 'CRITICAL');
      expect(critical).toEqual([]);
    });
  });

  describe.runIf(hasSnapshots && 'terraform/destructive-rds' in snapshots)('Destructive RDS (FAIL)', () => {
    it('has FAIL verdict', () => {
      const parsed = parseMarkdownOutput(snapshots['terraform/destructive-rds']);
      expect(parsed.verdict).toBe('FAIL');
    });

    it('has CRITICAL findings', () => {
      const parsed = parseMarkdownOutput(snapshots['terraform/destructive-rds']);
      const critical = parsed.findings.filter(f => f.severity === 'CRITICAL');
      expect(critical.length).toBeGreaterThan(0);
    });

    it('mentions RDS or database', () => {
      const lower = snapshots['terraform/destructive-rds'].toLowerCase();
      expect(lower.includes('rds') || lower.includes('database')).toBe(true);
    });
  });

  describe.runIf(hasSnapshots && 'terraform/multi-issue' in snapshots)('Multi-issue (sorted findings)', () => {
    it('has findings sorted by severity', () => {
      const parsed = parseMarkdownOutput(snapshots['terraform/multi-issue']);
      if (parsed.findings.length > 1) {
        expect(areFindingsSorted(parsed.findings)).toBe(true);
      }
    });

    it('has FAIL verdict due to CRITICAL/HIGH findings', () => {
      const parsed = parseMarkdownOutput(snapshots['terraform/multi-issue']);
      expect(parsed.verdict).toBe('FAIL');
    });
  });

  describe.runIf(hasSnapshots && 'terraform/empty-plan' in snapshots)('Empty plan (PASS)', () => {
    it('has PASS verdict', () => {
      const parsed = parseMarkdownOutput(snapshots['terraform/empty-plan']);
      expect(parsed.verdict).toBe('PASS');
    });

    it('has no findings', () => {
      const parsed = parseMarkdownOutput(snapshots['terraform/empty-plan']);
      expect(parsed.findings).toEqual([]);
    });
  });
});

// ── Unit tests for the parser itself ─────────────────────────────

describe('Terraform output parser', () => {
  const sampleOutput = `## Terraform Plan Review Verdict: FAIL

### Summary
This plan destroys a production RDS instance without a final snapshot.

### Cost Impact
**Estimated Monthly Change:** -$450 to -$500

| Resource | Action | Type | Estimated Monthly Cost |
|----------|--------|------|----------------------|
| aws_db_instance.production_users | destroy | db.r5.xlarge | -$450 - $500 |

### Destructive Actions
- aws_db_instance.production_users: Being destroyed with skip_final_snapshot = true. Data loss risk: **certain**.

### Security Concerns
No security concerns detected.

### Best Practice Violations
No best practice violations detected.

### Findings Detail

#### [CRITICAL] Production Database Deletion Without Snapshot
- **Resource:** \`aws_db_instance.production_users\`
- **Risk:** Permanent, irrecoverable data loss for all user data
- **Description:** The RDS instance is being destroyed with skip_final_snapshot = true, meaning no backup will be created before deletion.
- **Recommendation:** Set skip_final_snapshot = false and provide a final_snapshot_identifier:
\`\`\`hcl
resource "aws_db_instance" "production_users" {
  skip_final_snapshot       = false
  final_snapshot_identifier = "production-users-final-\${timestamp()}"
}
\`\`\`

#### [HIGH] Associated Security Group Destruction
- **Resource:** \`aws_security_group.rds_access\`
- **Risk:** If other resources reference this SG, they will lose network access
- **Description:** The security group used by the RDS instance is also being destroyed.
- **Recommendation:** Verify no other resources depend on this security group before proceeding.`;

  it('extracts FAIL verdict', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.verdict).toBe('FAIL');
    expect(parsed.agentType).toBe('terraform');
  });

  it('extracts all sections', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const titles = parsed.sections.map(s => s.title);
    expect(titles).toContain('Terraform Plan Review Verdict: FAIL');
  });

  it('extracts findings with correct severity', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings[0].severity).toBe('CRITICAL');
    expect(parsed.findings[1].severity).toBe('HIGH');
  });

  it('extracts finding fields', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings[0].fields['Resource']).toContain('aws_db_instance');
    expect(parsed.findings[0].fields['Risk']).toContain('data loss');
  });

  it('detects code blocks in findings', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings[0].hasCodeBlock).toBe(true);
  });

  it('reports findings as sorted', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(areFindingsSorted(parsed.findings)).toBe(true);
  });

  it('reports verdict as consistent', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(isVerdictConsistent('FAIL', parsed.findings)).toBe(true);
  });

  it('extracts cost impact table', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const costTable = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('cost')
    );
    expect(costTable).toBeDefined();
    expect(costTable!.headers).toContain('Resource');
    expect(costTable!.headers).toContain('Action');
    expect(costTable!.rows.length).toBeGreaterThan(0);
  });

  it('passes full schema validation', () => {
    const result = validateTerraformReviewerOutput(sampleOutput);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

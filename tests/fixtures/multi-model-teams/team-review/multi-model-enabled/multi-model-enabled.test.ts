import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname);
const load = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf-8'));

describe('team-review multi-model-enabled fixture', () => {
  const expected = load('expected-output.json');
  const mailbox = load('expected-lead-mailbox.json');
  const sequencing = load('expected-sequencing.json');

  it('Lead mailbox contains exactly one orchestrator-report', () => {
    expect(mailbox.messages).toHaveLength(1);
    expect(mailbox.messages[0].filename_pattern).toBe('orchestrator-report-*.json');
    expect(mailbox.messages[0].count).toBe(1);
  });

  it('no Lead-side consolidated-report produced', () => {
    expect(mailbox.consolidated_report_from_lead).toBe(false);
  });

  it('report contains ## Code Review Report header', () => {
    expect(expected.report).toContain('## Code Review Report');
  });

  it('findings include both native-team and external source_types (FR-MMT4 criterion 6)', () => {
    const sourceTypes = expected.findings.flatMap((f: any) =>
      f.raised_by.map((r: any) => r.source_type)
    );
    expect(sourceTypes).toContain('native-team');
    expect(sourceTypes).toContain('external');
  });

  it('cross-reviewer finding has raised_by from both native-team and external', () => {
    const sqlFinding = expected.findings.find((f: any) => f.finding_id === 'security.searchUsers.sql-injection');
    expect(sqlFinding).toBeDefined();
    const sourceTypes = sqlFinding.raised_by.map((r: any) => r.source_type);
    expect(sourceTypes).toContain('native-team');
    expect(sourceTypes).toContain('external');
  });

  it('audit artifact includes team_metadata block', () => {
    expect(expected.audit_artifact.team_metadata).toBeDefined();
    expect(expected.audit_artifact.team_metadata.team_name).toBe('review-a3f7b2c1');
    expect(expected.audit_artifact.team_metadata.multi_model).toBe(true);
  });

  it('path_and_reason_header matches team multi-model format', () => {
    expect(expected.path_and_reason_header).toContain('team + external multi-model');
    expect(expected.path_and_reason_header).toContain('review-a3f7b2c1');
  });

  it('D24: sequencing recorded — native and external start concurrently', () => {
    expect(sequencing.native_reviewers_start).toBe('concurrent_with_external_fan_out');
    expect(sequencing.external_reviewers_start).toBe('concurrent_with_native_team');
    expect(sequencing.note).toContain('D24');
  });
});

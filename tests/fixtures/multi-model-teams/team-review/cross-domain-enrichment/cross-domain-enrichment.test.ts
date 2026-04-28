import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname);
const load = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf-8'));

describe('team-review cross-domain-enrichment fixture', () => {
  const crossDomainMsg = load('cross-domain-message.json');
  const securityMailbox = load('security-reviewer-mailbox.json');
  const expected = load('expected-output.json');

  it('cross-domain message targets security-reviewer (not Lead)', () => {
    expect(crossDomainMsg.to).toBe('security-reviewer');
    expect(crossDomainMsg.from).toBe('code-reviewer');
    expect(crossDomainMsg.type).toBe('message');
  });

  it('cross-domain messages not blocked by FR-MMT4 (FR-MMT4 only suppresses Lead consolidated-report)', () => {
    expect(expected.cross_domain_messages_blocked_by_fr_mmt4).toBe(false);
  });

  it("security-reviewer's findings_json reflects cross-domain context", () => {
    const finding = securityMailbox.findings_json.findings[0];
    expect(finding.description).toContain('Cross-domain tip from code-reviewer');
    expect(finding.source.source_type).toBe('native-team');
  });

  it('orchestrator receives enriched findings via bridge (context already embedded)', () => {
    expect(expected.orchestrator_input_findings_include_cross_domain_context).toBe(true);
  });

  it('orchestrator does NOT separately consume cross-domain messages', () => {
    expect(expected.orchestrator_consumes_cross_domain_messages_directly).toBe(false);
  });

  it('enriched finding carries source_type native-team', () => {
    const finding = expected.findings[0];
    expect(finding.source.source_type).toBe('native-team');
    expect(finding.source.reviewer_id).toBe('security-reviewer');
  });

  it('security-reviewer mailbox message has valid findings_json structure', () => {
    expect(securityMailbox.findings_json).toBeDefined();
    expect(securityMailbox.findings_json.findings).toHaveLength(1);
    expect(securityMailbox.report_markdown).toContain('Cross-domain tip acknowledged');
  });
});

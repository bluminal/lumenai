/**
 * lint-prd.mjs — the PRD structural + provenance audit.
 *
 * Exercises the script as a subprocess, the way write-prd.md and
 * refine-requirements.md invoke it (FR-HM26). The rubric's
 * judgement-dependent checks are not scripted and are recorded in the
 * script's reconciliation record, so this suite asserts that
 * `checks_skipped` says so rather than letting silence imply they passed.
 *
 * Cost: $0 (subprocess only, no LLM calls)
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(import.meta.dirname, '..', '..', 'plugins', 'synthex', 'scripts', 'lint-prd.mjs');

type Finding = { severity: string; title: string; location: string; rule: string; issue: string; fix: string };
type Report = {
  prd_file: string;
  rubric_version: string;
  total_findings: number;
  counts: Record<string, number>;
  findings: Finding[];
  checks_skipped: string[];
  passed: boolean;
};

function run(text: string, args: string[] = [], extraFiles: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lint-prd-'));
  const file = join(dir, 'doc.md');
  writeFileSync(file, text);
  const resolved = args.map((a) => (extraFiles[a] !== undefined ? (writeFileSync(join(dir, a), extraFiles[a]), join(dir, a)) : a));
  const r = spawnSync(process.execPath, [SCRIPT, file, ...resolved], { encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr, report: r.stdout ? (JSON.parse(r.stdout) as Report) : null };
}

const has = (r: Report | null, severity: string, substring: string) =>
  Boolean(r?.findings.some((f) => f.severity === severity && f.title.includes(substring)));

/** A PRD with nothing wrong with it. */
function cleanPrd(overrides: { fr?: string } = {}): string {
  return [
    '# Product Requirements Document: Fixture',
    '',
    '**Provenance:** `[S]` sourced · `[U]` user-stated · `[D]` derived · `[A]` assumed',
    '',
    '## 1. Vision & Purpose',
    'Make the thing legible.',
    '',
    '## 2. Target Users / Personas',
    'Finance ops.',
    '',
    '## 3. Functional Requirements',
    overrides.fr ??
      ['#### FR-1: Bulk export `[U]`', '**Source:** confirmed in the interview', '**Acceptance Criteria:**', '- Exports 10k rows under 5s'].join('\n'),
    '',
    '## 4. Non-Functional Requirements',
    '#### NFR-1: Latency `[D]`',
    '**Source:** package.json, the existing p95 budget',
    '**Acceptance Criteria:**',
    '- p95 under 300ms',
    '',
    '## 5. Out of Scope',
    'Invoicing.',
    '',
    '## 6. Success Metrics',
    'Adoption above 40%.',
    '',
    '## 7. Assumptions & Constraints',
    'None.',
    '',
    '## 8. Open Questions',
    'None.',
    '',
    '## 9. Source Map',
    '| Document | Contributed |',
    '|----------|-------------|',
    '| notes/kickoff.md | FR-1 |',
  ].join('\n');
}

describe('lint-prd.mjs', () => {
  describe('Contract', () => {
    it('[T] exits 0 with no findings on a clean PRD', () => {
      const { status, report } = run(cleanPrd());
      expect(report?.findings).toEqual([]);
      expect(report?.passed).toBe(true);
      expect(status).toBe(0);
    });

    it('[T] exits 2 when a CRITICAL or HIGH is present', () => {
      const { status, report } = run(cleanPrd({ fr: '#### FR-1: Untagged\n**Acceptance Criteria:**\n- specific thing' }));
      expect(report?.passed).toBe(false);
      expect(status).toBe(2);
    });

    it('[T] exits 1 on a usage error rather than emitting a report', () => {
      const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/usage: node lint-prd\.mjs/);
      expect(r.stdout).toBe('');
    });

    it('[T] rejects an unknown flag', () => {
      const { status, stderr } = run(cleanPrd(), ['--nonsense']);
      expect(status).toBe(1);
      expect(stderr).toMatch(/unknown flag --nonsense/);
    });

    it('[T] rejects an unknown --assumption-policy value', () => {
      const { status, stderr } = run(cleanPrd(), ['--assumption-policy', 'maybe']);
      expect(status).toBe(1);
      expect(stderr).toMatch(/--assumption-policy must be blocking or warn/);
    });

    it('[T] uses only the three severities lint-plan.mjs uses', () => {
      const { report } = run(cleanPrd({ fr: '#### FR-1: Untagged\n**Acceptance Criteria:**\n- works correctly' }));
      expect(Object.keys(report!.counts).sort()).toEqual(['CRITICAL', 'HIGH', 'MEDIUM']);
      for (const f of report!.findings) expect(['CRITICAL', 'HIGH', 'MEDIUM']).toContain(f.severity);
    });

    it('[T] every finding carries all six makeFinding fields', () => {
      const { report } = run(cleanPrd({ fr: '#### FR-1: Untagged\n**Acceptance Criteria:**\n- specific' }));
      expect(report!.findings.length).toBeGreaterThan(0);
      for (const f of report!.findings) {
        for (const k of ['severity', 'title', 'location', 'rule', 'issue', 'fix']) {
          expect(f[k as keyof Finding]).toBeTruthy();
        }
      }
    });

    it('[T] sorts findings most-severe first', () => {
      const { report } = run(cleanPrd({ fr: '#### FR-1: Untagged\n**Acceptance Criteria:**\n- works correctly' }));
      const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 } as Record<string, number>;
      const seq = report!.findings.map((f) => rank[f.severity]);
      expect(seq).toEqual([...seq].sort((a, b) => a - b));
    });
  });

  describe('Provenance is blocking', () => {
    it('[T] an untagged requirement is CRITICAL', () => {
      const { report } = run(cleanPrd({ fr: '#### FR-1: Untagged\n**Source:** x page 2\n**Acceptance Criteria:**\n- specific' }));
      expect(has(report, 'CRITICAL', 'carries no provenance tag')).toBe(true);
    });

    it('[T] a missing Source line is CRITICAL', () => {
      const { report } = run(cleanPrd({ fr: '#### FR-1: Tagged `[U]`\n**Acceptance Criteria:**\n- specific' }));
      expect(has(report, 'CRITICAL', 'has no Source line')).toBe(true);
    });

    it('[T] a surviving [A] is CRITICAL under the default policy', () => {
      const fr = '#### FR-1: Guess `[A]`\n**Source:** inferred from the existing retention window\n**Acceptance Criteria:**\n- specific';
      const { report } = run(cleanPrd({ fr }));
      expect(has(report, 'CRITICAL', 'unconfirmed assumption')).toBe(true);
    });

    it('[T] --assumption-policy warn downgrades it to MEDIUM and never silently', () => {
      const fr = '#### FR-1: Guess `[A]`\n**Source:** inferred from the existing retention window\n**Acceptance Criteria:**\n- specific';
      const { report, status } = run(cleanPrd({ fr }), ['--assumption-policy', 'warn']);
      expect(has(report, 'CRITICAL', 'unconfirmed assumption')).toBe(false);
      expect(has(report, 'MEDIUM', 'unconfirmed assumption')).toBe(true);
      expect(status).toBe(0);
    });

    it('[T] two tags on one requirement is HIGH', () => {
      const fr = '#### FR-1: Both `[S]` `[U]`\n**Source:** notes/kickoff.md page 2\n**Acceptance Criteria:**\n- specific';
      const { report } = run(cleanPrd({ fr }));
      expect(has(report, 'HIGH', 'more than one provenance tag')).toBe(true);
    });

    it('[T] a duplicate FR id is HIGH', () => {
      const fr = [
        '#### FR-1: First `[U]`',
        '**Source:** interview',
        '**Acceptance Criteria:**',
        '- specific',
        '',
        '#### FR-1: Second `[U]`',
        '**Source:** interview',
        '**Acceptance Criteria:**',
        '- specific',
      ].join('\n');
      const { report } = run(cleanPrd({ fr }));
      expect(has(report, 'HIGH', 'Duplicate requirement id FR-1')).toBe(true);
    });

    it('[T] unfalsifiable acceptance criteria are HIGH', () => {
      const fr = '#### FR-1: Vague `[U]`\n**Source:** interview\n**Acceptance Criteria:**\n- works correctly';
      const { report } = run(cleanPrd({ fr }));
      expect(has(report, 'HIGH', 'unfalsifiable acceptance criteria')).toBe(true);
    });
  });

  describe('Citation checks require the manifest', () => {
    const manifest = JSON.stringify({
      manifest: {
        sources: [
          { path: 'notes/kickoff.md', summarized: false, status: 'read' },
          { path: 'granola-oct8.md', summarized: true, status: 'read' },
          { path: 'spec.md', status: 'unreadable', reason: '403' },
        ],
      },
    });

    it('[T] says citation checks were skipped when no manifest is supplied', () => {
      const { report } = run(cleanPrd());
      expect(report!.checks_skipped.some((s) => s.includes('no --sources manifest'))).toBe(true);
    });

    it('[T] stops saying so once a manifest is supplied', () => {
      const { report } = run(cleanPrd(), ['--sources', 'm.json'], { 'm.json': manifest });
      expect(report!.checks_skipped.some((s) => s.includes('no --sources manifest'))).toBe(false);
    });

    it('[T] [S] citing an unreadable source is HIGH', () => {
      const fr = '#### FR-1: From a 403 `[S]`\n**Source:** spec.md section 2\n**Acceptance Criteria:**\n- specific';
      const { report } = run(cleanPrd({ fr }), ['--sources', 'm.json'], { 'm.json': manifest });
      expect(has(report, 'HIGH', 'cites an unreadable source')).toBe(true);
    });

    it('[T] [S] citing a summarized source without an excerpt is HIGH', () => {
      const fr = '#### FR-1: From a summary `[S]`\n**Source:** granola-oct8.md at 00:34:10\n**Acceptance Criteria:**\n- specific';
      const { report } = run(cleanPrd({ fr }), ['--sources', 'm.json'], { 'm.json': manifest });
      expect(has(report, 'HIGH', 'summarized source without an excerpt')).toBe(true);
    });

    it('[T] a verbatim excerpt satisfies the summarized-source check', () => {
      const fr =
        '#### FR-1: From a summary `[S]`\n**Source:** granola-oct8.md at 00:34:10 — "we have to ship bulk export this quarter"\n**Acceptance Criteria:**\n- specific';
      const { report } = run(cleanPrd({ fr }), ['--sources', 'm.json'], { 'm.json': manifest });
      expect(has(report, 'HIGH', 'summarized source without an excerpt')).toBe(false);
    });

    it('[T] [S] citing a document that was never supplied is HIGH', () => {
      const fr = '#### FR-1: Ghost `[S]`\n**Source:** ghost.md page 4\n**Acceptance Criteria:**\n- specific';
      const { report } = run(cleanPrd({ fr }), ['--sources', 'm.json'], { 'm.json': manifest });
      expect(has(report, 'HIGH', 'cites a document that was not supplied')).toBe(true);
    });

    it('[T] a citation without a location is HIGH', () => {
      const fr = '#### FR-1: Vague cite `[S]`\n**Source:** the meeting notes\n**Acceptance Criteria:**\n- specific';
      const { report } = run(cleanPrd({ fr }));
      expect(has(report, 'HIGH', 'without a location')).toBe(true);
    });
  });

  describe('A pending Source Map cell is valid, never a finding', () => {
    const manifest = JSON.stringify([{ path: 'notes/kickoff.md', summarized: false, status: 'read' }]);

    it('[T] an empty Contributed cell raises nothing', () => {
      const text = cleanPrd().replace('| notes/kickoff.md | FR-1 |', '| notes/kickoff.md | FR-1 |\n| https://granola.ai/x |  |');
      const { report } = run(text, ['--sources', 'm.json'], { 'm.json': manifest });
      expect(has(report, 'HIGH', 'not supplied')).toBe(false);
      expect(report!.findings.filter((f) => f.title.includes('granola'))).toEqual([]);
    });

    it('[T] the literal word pending raises nothing either', () => {
      const text = cleanPrd().replace('| notes/kickoff.md | FR-1 |', '| notes/kickoff.md | FR-1 |\n| https://granola.ai/x | pending |');
      const { report } = run(text, ['--sources', 'm.json'], { 'm.json': manifest });
      expect(report!.findings.filter((f) => f.title.includes('granola'))).toEqual([]);
    });

    it('[T] but a FILLED cell citing an unsupplied document is HIGH', () => {
      const text = cleanPrd().replace('| notes/kickoff.md | FR-1 |', '| notes/kickoff.md | FR-1 |\n| ghost.md | FR-9 |');
      const { report } = run(text, ['--sources', 'm.json'], { 'm.json': manifest });
      expect(has(report, 'HIGH', 'cites a document that was not supplied')).toBe(true);
    });
  });

  describe('Document-level sections', () => {
    it('[T] Vision / Out of Scope / Success Metrics are each required', () => {
      for (const [heading, label] of [
        ['## 1. Vision & Purpose\nMake the thing legible.\n', 'Missing Vision & Purpose'],
        ['## 5. Out of Scope\nInvoicing.\n', 'Missing Out of Scope'],
        ['## 6. Success Metrics\nAdoption above 40%.\n', 'Missing Success Metrics'],
      ]) {
        const { report } = run(cleanPrd().replace(heading, ''));
        expect(has(report, 'HIGH', label), label).toBe(true);
      }
    });

    it('[T] no functional requirement at all is CRITICAL', () => {
      const text = cleanPrd().replace(/#### FR-1[\s\S]*?- Exports 10k rows under 5s/, 'Nothing yet.');
      const { report } = run(text);
      expect(has(report, 'CRITICAL', 'No functional requirements')).toBe(true);
    });

    it('[T] a missing Open Questions section is MEDIUM', () => {
      const { report } = run(cleanPrd().replace('## 8. Open Questions\nNone.\n', ''));
      expect(has(report, 'MEDIUM', 'Missing Open Questions')).toBe(true);
    });

    it('[T] sections are matched by name, so a renumbered PRD with contiguous numbers is clean', () => {
      const text = cleanPrd()
        .replace('## 1. Vision & Purpose', '## 1. Target Users / Personas TMP')
        .replace('## 2. Target Users / Personas', '## 2. Vision & Purpose')
        .replace('## 1. Target Users / Personas TMP', '## 1. Target Users / Personas');
      const { report } = run(text);
      expect(report!.findings).toEqual([]);
    });

    it('[T] non-contiguous numbering is MEDIUM', () => {
      const { report } = run(cleanPrd().replace('## 4. Non-Functional Requirements', '## 7. Non-Functional Requirements'));
      expect(has(report, 'MEDIUM', 'not contiguous')).toBe(true);
    });

    it('[T] a missing provenance legend is MEDIUM', () => {
      const { report } = run(cleanPrd().replace(/\*\*Provenance:\*\*.*\n/, ''));
      expect(has(report, 'MEDIUM', 'Missing provenance legend')).toBe(true);
    });
  });

  describe('Judgement-dependent checks are declared skipped, not implied passed', () => {
    it('[T] names what it does not check', () => {
      const { report } = run(cleanPrd());
      expect(report!.checks_skipped.some((s) => s.includes('measurable-success'))).toBe(true);
      expect(report!.checks_skipped.some((s) => s.includes('reconciliation record'))).toBe(true);
    });
  });
});

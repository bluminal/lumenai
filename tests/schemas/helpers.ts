/**
 * Markdown parsing utilities for agent output validation.
 *
 * Extracts structured data (sections, findings, tables, verdicts)
 * from the markdown outputs produced by advisory agents.
 */

// ── Types ────────────────────────────────────────────────────────

export interface ParsedOutput {
  verdictLine: string | null;
  verdict: 'PASS' | 'WARN' | 'FAIL' | null;
  agentType: 'terraform' | 'security' | 'implementation-plan' | 'unknown';
  sections: Section[];
  findings: Finding[];
  tables: Table[];
  rawText: string;
}

export interface Section {
  level: number;
  title: string;
  content: string;
  subsections: Section[];
}

export interface Finding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  fields: Record<string, string>;
  hasCodeBlock: boolean;
  cweReference: string | null;
}

export interface Table {
  sectionTitle: string;
  headers: string[];
  rows: string[][];
}

// ── Constants ────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

// Strict format: ## Terraform Plan Review Verdict: FAIL
const VERDICT_PATTERN_STRICT = /^##\s+(Terraform Plan Review|Security Review)\s+Verdict:\s+(PASS|WARN|FAIL)\s*$/m;

/**
 * Extract verdict from flexible agent output formats.
 * Real agents produce many different verdict patterns:
 *
 *   # 🔴 TERRAFORM PLAN REVIEW — FAIL
 *   ## 🚨 FAIL — Critical Secrets Exposure
 *   ### Verdict: ⚠️ WARN
 *   ## Security Review Result: ❌ FAIL — Do Not Merge
 *   > **⚠️ WARN — Approve with Conditions**
 *   **Verdict: ✅ PASS**
 *   **Verdict:** ⚠️ WARN
 *   ## Security Review: ... — **FAIL** 🚨
 *   ### Overall Verdict: ❌ FAIL
 *   ❌  FAIL (inside code blocks or tables)
 *
 * Rather than a single regex, we search the text for verdict keywords
 * in priority order, looking for contextual patterns.
 */
function extractFlexibleVerdict(text: string): { verdict: 'PASS' | 'WARN' | 'FAIL'; line: string } | null {
  const lines = text.split('\n');

  // Priority 1: Lines with "verdict" keyword
  for (const line of lines) {
    if (/verdict/i.test(line)) {
      if (/\bFAIL\b/i.test(line)) return { verdict: 'FAIL', line };
      if (/\bWARN\b/i.test(line)) return { verdict: 'WARN', line };
      if (/\bPASS\b/i.test(line)) return { verdict: 'PASS', line };
    }
  }

  // Priority 2: Heading lines (# ## ###) with PASS/WARN/FAIL
  for (const line of lines) {
    if (/^#{1,4}\s/.test(line)) {
      if (/\bFAIL\b/i.test(line)) return { verdict: 'FAIL', line };
      if (/\bWARN\b/i.test(line)) return { verdict: 'WARN', line };
      if (/\bPASS\b/i.test(line)) return { verdict: 'PASS', line };
    }
  }

  // Priority 3: Bold text with verdict keywords  (**FAIL**, **Verdict: PASS**)
  for (const line of lines) {
    if (/\*\*.*?\bFAIL\b.*?\*\*/i.test(line)) return { verdict: 'FAIL', line };
    if (/\*\*.*?\bWARN\b.*?\*\*/i.test(line)) return { verdict: 'WARN', line };
    if (/\*\*.*?\bPASS\b.*?\*\*/i.test(line)) return { verdict: 'PASS', line };
  }

  // Priority 4: Blockquote lines with verdict
  for (const line of lines) {
    if (/^>\s/.test(line)) {
      if (/\bFAIL\b/i.test(line)) return { verdict: 'FAIL', line };
      if (/\bWARN\b/i.test(line)) return { verdict: 'WARN', line };
      if (/\bPASS\b/i.test(line)) return { verdict: 'PASS', line };
    }
  }

  // Priority 5: Any line with emoji verdict indicators + keyword
  for (const line of lines) {
    if (/[❌🔴🚨]/.test(line) && /\bFAIL\b/i.test(line)) return { verdict: 'FAIL', line };
    if (/[⚠️🟡🟠]/.test(line) && /\bWARN\b/i.test(line)) return { verdict: 'WARN', line };
    if (/[✅🟢]/.test(line) && /\bPASS\b/i.test(line)) return { verdict: 'PASS', line };
  }

  return null;
}

// Strict finding format: #### [CRITICAL] Title
const FINDING_PATTERN_STRICT = /^####\s+\[(CRITICAL|HIGH|MEDIUM|LOW)\]\s+(.+)$/;

// Flexible finding formats used by real agent output:
//   ### 🔴 S3-SEC-01 — Title
//   ### 🔴 CRITICAL-1: Title
//   ### 🟠 HIGH-1: Title
//   ### 🟡 P2 — Medium: Title
//   ### 🔴 P1 — High: Title
//   ### 🔵 LOW — Title
const EMOJI_SEVERITY_MAP: Record<string, string> = {
  '🔴': 'CRITICAL',
  '🟠': 'HIGH',
  '🟡': 'MEDIUM',
  '🔵': 'LOW',
};

const FINDING_PATTERN_FLEXIBLE = /^###\s+(🔴|🟠|🟡|🔵)\s+(.+)$/;

const SECTION_PATTERN = /^(#{1,4})\s+(.+)$/;
const TABLE_ROW_PATTERN = /^\|(.+)\|$/;
const TABLE_SEPARATOR_PATTERN = /^\|[\s\-:|]+\|$/;
const CODE_BLOCK_PATTERN = /```[\s\S]*?```/;
const CWE_PATTERN = /CWE-\d+/;
const FIELD_PATTERN = /^-\s+\*\*([^*]+)\*\*:?\s*(.*)$/;

// ── Main Parser ──────────────────────────────────────────────────

export function parseMarkdownOutput(text: string): ParsedOutput {
  const lines = text.split('\n');

  // Try strict verdict pattern first, then flexible
  let verdictMatch = text.match(VERDICT_PATTERN_STRICT);
  let verdict: 'PASS' | 'WARN' | 'FAIL' | null = null;
  let verdictLine: string | null = null;

  if (verdictMatch) {
    verdict = verdictMatch[2] as 'PASS' | 'WARN' | 'FAIL';
    verdictLine = verdictMatch[0];
  } else {
    const flexResult = extractFlexibleVerdict(text);
    if (flexResult) {
      verdict = flexResult.verdict;
      verdictLine = flexResult.line;
    }
  }

  // Detect agent type from content, not just verdict line
  let agentType: ParsedOutput['agentType'] = 'unknown';
  if (text.match(/terraform plan review|terraform/i) && text.match(/resource|plan|infrastructure/i)) {
    agentType = 'terraform';
  } else if (text.match(/security review|security|vulnerability|CWE-/i)) {
    agentType = 'security';
  } else if (text.match(/^#\s+Implementation Plan:/m)) {
    agentType = 'implementation-plan';
  }

  const sections = parseSections(lines);
  const findings = parseFindings(lines);
  const tables = parseTables(lines, sections);

  return { verdictLine, verdict, agentType, sections, findings, tables, rawText: text };
}

// ── Section Parser ───────────────────────────────────────────────

function parseSections(lines: string[]): Section[] {
  const topSections: Section[] = [];
  const stack: Section[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_PATTERN);
    if (!match) continue;

    const level = match[1].length;
    const title = match[2].trim();

    // Collect content until next heading of same or higher level
    const contentLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const nextMatch = lines[j].match(SECTION_PATTERN);
      if (nextMatch && nextMatch[1].length <= level) break;
      if (nextMatch && nextMatch[1].length === level + 1) break; // subsection will collect its own
      contentLines.push(lines[j]);
    }

    const section: Section = {
      level,
      title,
      content: contentLines.join('\n').trim(),
      subsections: [],
    };

    // Place section in the right level of the hierarchy
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      topSections.push(section);
    } else {
      stack[stack.length - 1].subsections.push(section);
    }
    stack.push(section);
  }

  return topSections;
}

// ── Finding Parser ───────────────────────────────────────────────

/**
 * Infer severity from a flexible finding heading.
 * Handles patterns like:
 *   "CRITICAL-1: Title" → CRITICAL
 *   "P1 — High: Title" → HIGH
 *   "Severity: HIGH" in body text
 */
function inferSeverityFromTitle(title: string): Finding['severity'] | null {
  const upper = title.toUpperCase();
  if (upper.includes('CRITICAL')) return 'CRITICAL';
  if (upper.includes('HIGH') || upper.includes('P1')) return 'HIGH';
  if (upper.includes('MEDIUM') || upper.includes('P2')) return 'MEDIUM';
  if (upper.includes('LOW') || upper.includes('P3') || upper.includes('P4')) return 'LOW';
  return null;
}

function parseFindings(lines: string[]): Finding[] {
  const findings: Finding[] = [];
  let i = 0;

  while (i < lines.length) {
    // Try strict format first: #### [CRITICAL] Title
    let match = lines[i].match(FINDING_PATTERN_STRICT);
    let severity: Finding['severity'] | null = null;
    let title: string | null = null;

    if (match) {
      severity = match[1] as Finding['severity'];
      title = match[2].trim();
    } else {
      // Try flexible format: ### 🔴 Title
      const flexMatch = lines[i].match(FINDING_PATTERN_FLEXIBLE);
      if (flexMatch) {
        const emoji = flexMatch[1];
        const rawTitle = flexMatch[2].trim();
        severity = (EMOJI_SEVERITY_MAP[emoji] as Finding['severity']) || null;

        // Refine severity from title text (e.g., "P1 — High: Title" overrides emoji)
        const titleSeverity = inferSeverityFromTitle(rawTitle);
        if (titleSeverity) severity = titleSeverity;

        title = rawTitle;
      }
    }

    if (!severity || !title) { i++; continue; }

    const fields: Record<string, string> = {};
    let blockText = '';
    i++;

    // Collect all lines belonging to this finding (until next heading or end)
    while (i < lines.length) {
      if (lines[i].match(/^#{1,4}\s/) && !lines[i].match(/^#{5,}/)) break;
      // Also break on --- horizontal rules which separate findings in some formats
      if (lines[i].match(/^---\s*$/) && i + 1 < lines.length && lines[i + 1].match(/^###?\s/)) break;
      blockText += lines[i] + '\n';

      const fieldMatch = lines[i].match(FIELD_PATTERN);
      if (fieldMatch) {
        const key = fieldMatch[1].trim().replace(/:$/, ''); // strip trailing colon from key
        let value = fieldMatch[2].trim();

        // Multi-line field: collect indented/continuation lines
        let j = i + 1;
        while (j < lines.length && !lines[j].match(FIELD_PATTERN) && !lines[j].match(/^#{1,4}\s/) && lines[j].trim() !== '') {
          if (lines[j].startsWith('  ') || lines[j].startsWith('\t') || lines[j].startsWith('```')) {
            value += '\n' + lines[j];
            j++;
          } else {
            break;
          }
        }
        fields[key] = value;
      }

      // Also check for "**Severity: HIGH**" pattern in body
      const severityInBody = lines[i].match(/\*\*Severity:\s*(CRITICAL|HIGH|MEDIUM|LOW)\*\*/i);
      if (severityInBody) {
        severity = severityInBody[1].toUpperCase() as Finding['severity'];
      }

      i++;
    }

    // Extract CWE from the finding block OR from the title
    const allText = title + '\n' + blockText;

    findings.push({
      severity,
      title,
      fields,
      hasCodeBlock: CODE_BLOCK_PATTERN.test(blockText),
      cweReference: allText.match(CWE_PATTERN)?.[0] ?? null,
    });
  }

  return findings;
}

// ── Table Parser ─────────────────────────────────────────────────

function parseTables(lines: string[], sections: Section[]): Table[] {
  const tables: Table[] = [];
  let currentSection = '';
  let i = 0;

  while (i < lines.length) {
    // Track which section we're in
    const sectionMatch = lines[i].match(SECTION_PATTERN);
    if (sectionMatch) {
      currentSection = sectionMatch[2].trim();
      i++;
      continue;
    }

    // Detect table: header row, separator row, then data rows
    if (TABLE_ROW_PATTERN.test(lines[i]) && i + 1 < lines.length && TABLE_SEPARATOR_PATTERN.test(lines[i + 1])) {
      const headers = parseTableRow(lines[i]);
      i += 2; // skip header and separator

      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_PATTERN.test(lines[i]) && !TABLE_SEPARATOR_PATTERN.test(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }

      tables.push({ sectionTitle: currentSection, headers, rows });
      continue;
    }

    i++;
  }

  return tables;
}

function parseTableRow(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1) // remove leading/trailing empty strings from split
    .map(cell => cell.trim());
}

// ── Utility Functions ────────────────────────────────────────────

/**
 * Check if findings are sorted by severity (CRITICAL first, then HIGH, MEDIUM, LOW).
 */
export function areFindingsSorted(findings: Finding[]): boolean {
  for (let i = 1; i < findings.length; i++) {
    if (SEVERITY_ORDER[findings[i].severity] < SEVERITY_ORDER[findings[i - 1].severity]) {
      return false;
    }
  }
  return true;
}

/**
 * Get the highest severity across all findings.
 */
export function getMaxSeverity(findings: Finding[]): Finding['severity'] | null {
  if (findings.length === 0) return null;
  let max: Finding['severity'] = 'LOW';
  for (const f of findings) {
    if (SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[max]) {
      max = f.severity;
    }
  }
  return max;
}

/**
 * Check that the verdict is consistent with the highest severity finding.
 * CRITICAL/HIGH → FAIL, MEDIUM-only → WARN, LOW/none → PASS
 */
export function isVerdictConsistent(verdict: 'PASS' | 'WARN' | 'FAIL', findings: Finding[]): boolean {
  const maxSeverity = getMaxSeverity(findings);

  if (maxSeverity === null || maxSeverity === 'LOW') return verdict === 'PASS';
  if (maxSeverity === 'MEDIUM') return verdict === 'WARN';
  // CRITICAL or HIGH
  return verdict === 'FAIL';
}

/**
 * Find a section by title (case-insensitive substring match).
 */
export function findSection(sections: Section[], title: string): Section | undefined {
  for (const s of sections) {
    if (s.title.toLowerCase().includes(title.toLowerCase())) return s;
    const found = findSection(s.subsections, title);
    if (found) return found;
  }
  return undefined;
}

/**
 * Extract all section titles at a given level.
 */
export function getSectionTitles(sections: Section[], level?: number): string[] {
  const titles: string[] = [];
  for (const s of sections) {
    if (!level || s.level === level) titles.push(s.title);
    titles.push(...getSectionTitles(s.subsections, level));
  }
  return titles;
}

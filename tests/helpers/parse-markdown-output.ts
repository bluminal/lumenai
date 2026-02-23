/**
 * Markdown output parser for agent test framework.
 *
 * Extracts structured data from agent markdown outputs (terraform-plan-reviewer,
 * security-reviewer, product-manager) so that schema validators and assertion
 * helpers can operate on typed objects instead of raw strings.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedOutput {
  /** The raw verdict heading line, e.g. "## Terraform Plan Review Verdict: FAIL" */
  verdictLine: string | null;
  /** Extracted verdict value */
  verdict: 'PASS' | 'WARN' | 'FAIL' | null;
  /** Which agent produced this output (inferred from the verdict heading) */
  agentType: 'terraform' | 'security' | 'implementation-plan' | 'unknown';
  /** All sections parsed from headings */
  sections: Section[];
  /** All findings extracted from #### [SEVERITY] blocks */
  findings: Finding[];
  /** All markdown tables found in the output */
  tables: Table[];
  /** The original unmodified text */
  rawText: string;
}

export interface Section {
  /** Heading level (2, 3, 4, etc.) */
  level: number;
  /** Heading text without the ## prefix */
  title: string;
  /** Everything between this heading and the next same-or-higher-level heading */
  content: string;
  /** Child headings nested under this section */
  subsections: Section[];
}

export interface Finding {
  /** Severity tag from the heading */
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  /** Finding title (text after the severity tag) */
  title: string;
  /** Key-value pairs parsed from "- **Key:** value" lines */
  fields: Record<string, string>;
  /** Whether the finding body contains a fenced code block */
  hasCodeBlock: boolean;
  /** CWE reference if present (e.g. "CWE-79") */
  cweReference: string | null;
}

export interface Table {
  /** Title of the section this table appears in */
  sectionTitle: string;
  /** Column headers */
  headers: string[];
  /** Data rows (each row is an array of cell values) */
  rows: string[][];
}

// ---------------------------------------------------------------------------
// Heading regex
// ---------------------------------------------------------------------------

/**
 * Matches a markdown heading line and captures: level (number of #), title text.
 */
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

/**
 * Matches a finding heading: #### [SEVERITY] Title
 * Captures severity and title independently.
 */
const FINDING_HEADING_RE =
  /^#{3,4}\s+\[?(CRITICAL|HIGH|MEDIUM|LOW)\]?\s+(.+?)\s*$/i;

/**
 * Matches a "- **Key:** value" field line inside a finding.
 */
const FIELD_RE = /^-\s+\*\*(.+?):\*\*\s*(.*)$/;

/**
 * Matches a CWE reference anywhere in a string.
 */
const CWE_RE = /CWE-\d+/i;

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseMarkdownOutput(text: string): ParsedOutput {
  const lines = text.split('\n');

  const result: ParsedOutput = {
    verdictLine: null,
    verdict: null,
    agentType: 'unknown',
    sections: [],
    findings: [],
    tables: [],
    rawText: text,
  };

  // 1. Extract verdict
  extractVerdict(lines, result);

  // 2. Build section tree
  result.sections = buildSectionTree(lines);

  // 3. Extract findings
  result.findings = extractFindings(lines);

  // 4. Extract tables (with section context)
  result.tables = extractTables(lines, result.sections);

  return result;
}

// ---------------------------------------------------------------------------
// Verdict extraction
// ---------------------------------------------------------------------------

const VERDICT_RE =
  /^##\s+(.+?)\s+Verdict:\s*(PASS|WARN|FAIL)\s*$/i;

function extractVerdict(lines: string[], out: ParsedOutput): void {
  for (const line of lines) {
    const m = line.match(VERDICT_RE);
    if (m) {
      out.verdictLine = line.trim();
      out.verdict = m[2].toUpperCase() as 'PASS' | 'WARN' | 'FAIL';

      const prefix = m[1].toLowerCase();
      if (prefix.includes('terraform')) {
        out.agentType = 'terraform';
      } else if (prefix.includes('security')) {
        out.agentType = 'security';
      } else if (prefix.includes('implementation')) {
        out.agentType = 'implementation-plan';
      }
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Section tree builder
// ---------------------------------------------------------------------------

interface HeadingMark {
  index: number;
  level: number;
  title: string;
}

function buildSectionTree(lines: string[]): Section[] {
  // Collect all headings with their line indices
  const headings: HeadingMark[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (m) {
      headings.push({ index: i, level: m[1].length, title: m[2] });
    }
  }

  if (headings.length === 0) return [];

  // Build flat sections first (content = lines between this heading and the next)
  const flat: Section[] = headings.map((h, idx) => {
    const startLine = h.index + 1; // skip the heading itself
    const endLine =
      idx + 1 < headings.length ? headings[idx + 1].index : lines.length;
    const content = lines.slice(startLine, endLine).join('\n').trim();
    return {
      level: h.level,
      title: h.title,
      content,
      subsections: [],
    };
  });

  // Nest into tree based on heading levels
  return nestSections(flat);
}

/**
 * Given a flat array of sections ordered by appearance, build a tree where
 * deeper-level sections become children of the nearest preceding shallower section.
 */
function nestSections(flat: Section[]): Section[] {
  const roots: Section[] = [];
  const stack: Section[] = [];

  for (const sec of flat) {
    // Pop from stack until we find a parent with a lower level
    while (stack.length > 0 && stack[stack.length - 1].level >= sec.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(sec);
    } else {
      stack[stack.length - 1].subsections.push(sec);
    }

    stack.push(sec);
  }

  return roots;
}

// ---------------------------------------------------------------------------
// Findings extraction
// ---------------------------------------------------------------------------

function extractFindings(lines: string[]): Finding[] {
  const findings: Finding[] = [];
  let i = 0;

  while (i < lines.length) {
    const headingMatch = lines[i].match(FINDING_HEADING_RE);
    if (!headingMatch) {
      i++;
      continue;
    }

    const severity = headingMatch[1].toUpperCase() as Finding['severity'];
    const title = headingMatch[2];
    i++;

    // Collect body lines until the next heading of level <= 4 or end of file
    const bodyLines: string[] = [];
    while (i < lines.length) {
      const nextHeading = lines[i].match(HEADING_RE);
      if (nextHeading && nextHeading[1].length <= 4) {
        break;
      }
      bodyLines.push(lines[i]);
      i++;
    }

    const body = bodyLines.join('\n');
    const fields = parseFields(bodyLines);
    const hasCodeBlock = /```/.test(body);

    // Look for CWE reference in the body or fields
    let cweReference: string | null = null;
    const cweMatch = body.match(CWE_RE);
    if (cweMatch) {
      cweReference = cweMatch[0].toUpperCase();
    }

    findings.push({
      severity,
      title,
      fields,
      hasCodeBlock,
      cweReference,
    });
  }

  return findings;
}

/**
 * Parse "- **Key:** value" field lines from a finding's body.
 * Multi-line values (continuation lines that are not a new field) are
 * appended to the previous field's value.
 */
function parseFields(bodyLines: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  let lastKey: string | null = null;

  for (const line of bodyLines) {
    const m = line.match(FIELD_RE);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      fields[key] = val;
      lastKey = key;
    } else if (lastKey && line.trim().length > 0 && !line.match(HEADING_RE)) {
      // Continuation line for the previous field value
      // Only if the line is indented or looks like part of the previous field
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('```')) {
        // New list item or code block start -- don't merge
        lastKey = null;
      } else {
        fields[lastKey] += ' ' + trimmed;
      }
    }
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Table extraction
// ---------------------------------------------------------------------------

/**
 * Extract markdown tables from the output. Each table is annotated with the
 * section title it appears under.
 */
function extractTables(lines: string[], sections: Section[]): Table[] {
  const tables: Table[] = [];
  let i = 0;

  while (i < lines.length) {
    // Look for a table header row: | col1 | col2 | col3 |
    if (!isTableRow(lines[i])) {
      i++;
      continue;
    }

    // Check that the next line is a separator row: | --- | --- | --- |
    if (i + 1 >= lines.length || !isTableSeparator(lines[i + 1])) {
      i++;
      continue;
    }

    // We have a table. Parse header, skip separator, collect data rows.
    const headers = parseTableCells(lines[i]);
    i += 2; // skip header and separator

    const rows: string[][] = [];
    while (i < lines.length && isTableRow(lines[i])) {
      rows.push(parseTableCells(lines[i]));
      i++;
    }

    // Determine which section this table belongs to
    const sectionTitle = findContainingSection(
      lines,
      i - rows.length - 2, // index of the header row
      sections,
    );

    tables.push({ sectionTitle, headers, rows });
  }

  return tables;
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  // All cells should be dashes (with optional colons for alignment)
  const cells = parseTableCells(line);
  return cells.every((c) => /^[:\-\s]+$/.test(c));
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  // Strip leading and trailing pipes, then split by pipe
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((cell) => cell.trim());
}

/**
 * Given a line index, walk backwards through headings to find the nearest
 * section title that contains this line.
 */
function findContainingSection(
  lines: string[],
  targetIndex: number,
  _sections: Section[],
): string {
  for (let i = targetIndex - 1; i >= 0; i--) {
    const m = lines[i].match(HEADING_RE);
    if (m) {
      return m[2];
    }
  }
  return '(top-level)';
}

// ---------------------------------------------------------------------------
// Utility: Severity ordering check
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Returns true if the findings array is sorted by severity from CRITICAL to LOW.
 * Findings with the same severity are considered correctly ordered regardless of
 * their relative position.
 */
export function isSeverityOrdered(findings: Finding[]): boolean {
  if (findings.length <= 1) return true;

  for (let i = 1; i < findings.length; i++) {
    const prev = SEVERITY_ORDER[findings[i - 1].severity] ?? 99;
    const curr = SEVERITY_ORDER[findings[i].severity] ?? 99;
    if (curr < prev) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Utility: Find section by title
// ---------------------------------------------------------------------------

/**
 * Recursively search the section tree for a section whose title matches
 * (case-insensitive substring match).
 */
export function findSection(
  sections: Section[],
  titleQuery: string,
): Section | null {
  const lower = titleQuery.toLowerCase();
  for (const sec of sections) {
    if (sec.title.toLowerCase().includes(lower)) {
      return sec;
    }
    const child = findSection(sec.subsections, titleQuery);
    if (child) return child;
  }
  return null;
}

/**
 * Collect all sections matching a title query (case-insensitive substring).
 */
export function findAllSections(
  sections: Section[],
  titleQuery: string,
): Section[] {
  const lower = titleQuery.toLowerCase();
  const results: Section[] = [];

  function walk(secs: Section[]): void {
    for (const sec of secs) {
      if (sec.title.toLowerCase().includes(lower)) {
        results.push(sec);
      }
      walk(sec.subsections);
    }
  }

  walk(sections);
  return results;
}

// ---------------------------------------------------------------------------
// Utility: Find table by section title
// ---------------------------------------------------------------------------

/**
 * Find a table whose sectionTitle matches (case-insensitive substring).
 */
export function findTable(tables: Table[], sectionQuery: string): Table | null {
  const lower = sectionQuery.toLowerCase();
  return tables.find((t) => t.sectionTitle.toLowerCase().includes(lower)) ?? null;
}

/**
 * Convert a table into an array of objects keyed by header names.
 */
export function tableToObjects(table: Table): Record<string, string>[] {
  return table.rows.map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < table.headers.length; i++) {
      obj[table.headers[i]] = row[i] ?? '';
    }
    return obj;
  });
}

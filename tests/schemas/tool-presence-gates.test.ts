/**
 * Task 2: tool-presence-gates.test.ts (FR-HM3, D3).
 *
 * FR-HM3 requires every reference to a Claude-only tool in commands/ and
 * agents/ prose to be wrapped in a capability-ladder gate of the form
 * "if a `<Tool>` is in your tool list, do A; otherwise do B" — never a
 * branch that keys on host name alone.
 *
 * D3's token rule defines what counts as a "reference" precisely, so this
 * test doesn't flag every incidental appearance of an English word that
 * happens to match a tool name:
 *
 *   - a backticked exact tool name, e.g. `` `Workflow` ``
 *   - the literal phrase "<Name> tool", e.g. "Workflow tool", "the Artifact
 *     tool tool" (case-sensitive on the tool name, case-insensitive "tool")
 *
 * Markdown headings (lines starting with `#`) and fenced code blocks are
 * excluded — a `## Workflow` section heading or a `Workflow` mentioned
 * inside an example fence is not a capability branch.
 *
 * A reference "shares a paragraph" with the gate phrases when the same
 * blank-line-delimited paragraph contains both "in your tool list" and the
 * word "otherwise" (both matched case-insensitively, since "Otherwise" may
 * open a sentence).
 *
 * KNOWN_UNGATED (below) is a ratchet allowlist of real, today-ungated call
 * sites, keyed by file + tool. It exists so this test can land before the
 * prose is fixed (gating the prose is out of scope for this task — see the
 * command's brief). The ratchet test below fails if an allowlisted entry
 * is no longer ungated (fixed or the reference removed), so the list can
 * only shrink, never grow silently.
 */

import { describe, expect, it } from 'vitest';
import { extname, join, relative } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = join(__dirname, '..', '..');
const SCAN_DIRS = ['plugins/synthex/commands', 'plugins/synthex/agents'];

export const TOOL_NAMES = [
  'Workflow',
  'Artifact',
  'ScheduleWakeup',
  'PushNotification',
  'ReportFindings',
  'SendMessage',
  'ListAgents',
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

interface Paragraph {
  text: string;
  startLine: number;
  isHeading: boolean;
}

interface ToolReference {
  tool: ToolName;
  gated: boolean;
  startLine: number;
  paragraphText: string;
}

// ── Paragraph extraction ────────────────────────────────────────────────
//
// Splits markdown text into blank-line-delimited paragraphs, skipping
// content inside fenced code blocks and treating a heading line as its own
// (excluded) one-line paragraph. Fence matching tracks the fence character
// and length so a longer outer fence (` ```` `) correctly contains a
// shorter nested fence (` ``` `) as literal content, per CommonMark.

function matchFenceOpen(line: string): { char: string; len: number } | null {
  const m = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!m) return null;
  return { char: m[1][0], len: m[1].length };
}

function matchFenceClose(line: string, fenceChar: string, fenceLen: number): boolean {
  const re = fenceChar === '`' ? /^ {0,3}(`{3,})\s*$/ : /^ {0,3}(~{3,})\s*$/;
  const m = line.match(re);
  return m !== null && m[1].length >= fenceLen;
}

export function extractParagraphs(text: string): Paragraph[] {
  const lines = text.split('\n');
  const paragraphs: Paragraph[] = [];
  let current: string[] = [];
  let currentStart = -1;
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  const flush = () => {
    if (current.length > 0) {
      paragraphs.push({
        text: current.join('\n'),
        startLine: currentStart + 1,
        isHeading: false,
      });
      current = [];
      currentStart = -1;
    }
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];

    if (inFence) {
      if (matchFenceClose(line, fenceChar, fenceLen)) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }
      continue; // fence content and the closing marker are never scanned
    }

    const open = matchFenceOpen(line);
    if (open) {
      flush();
      inFence = true;
      fenceChar = open.char;
      fenceLen = open.len;
      continue;
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      flush();
      paragraphs.push({ text: line, startLine: idx + 1, isHeading: true });
      continue;
    }

    if (currentStart === -1) currentStart = idx;
    current.push(line);
  }
  flush();

  return paragraphs;
}

// ── D3 token matching ───────────────────────────────────────────────────

export function findReferencesInText(text: string): ToolReference[] {
  const refs: ToolReference[] = [];

  for (const para of extractParagraphs(text)) {
    if (para.isHeading) continue; // headings are never capability branches

    for (const tool of TOOL_NAMES) {
      const backtickRe = new RegExp('`' + tool + '`');
      const toolWordRe = new RegExp('\\b' + tool + '\\b\\s+tool\\b', 'i');

      if (backtickRe.test(para.text) || toolWordRe.test(para.text)) {
        const gated =
          /in your tool list/i.test(para.text) && /\botherwise\b/i.test(para.text);
        refs.push({
          tool,
          gated,
          startLine: para.startLine,
          paragraphText: para.text,
        });
      }
    }
  }

  return refs;
}

function walkMarkdownFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(p, out);
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      out.push(p);
    }
  }
  return out;
}

// ── KNOWN_UNGATED ratchet allowlist ─────────────────────────────────────
//
// Every entry below is a real, verified call site as of Task 2 (2026-09-24).
// Gating this prose is out of scope for Task 2 — see docs/plans/harness-
// modernization.md Task 2. Do not add an entry without file:line evidence
// in the comment; do not widen an entry beyond file + tool.

interface KnownUngatedEntry {
  file: string;
  tool: ToolName;
}

export const KNOWN_UNGATED: KnownUngatedEntry[] = [
  // plugins/synthex/agents/codex-review-prompter.md:132 —
  //   "2. **Waits for the parent's decision** via a follow-up `SendMessage`
  //   from the orchestrator carrying the decision payload."
  // Backticked `SendMessage`, not wrapped in a tool-presence gate. This is
  // the only real D3 reference to SendMessage found in commands/ or
  // agents/ today (a second, non-backticked, non-"tool"-suffixed mention
  // of SendMessage exists at line 152 but does not meet the D3 token rule,
  // so it is not a "reference" and needs no allowlist entry).
  { file: 'plugins/synthex/agents/codex-review-prompter.md', tool: 'SendMessage' },
];

// ── Acceptance criteria ─────────────────────────────────────────────────

describe('Task 2: tool-presence-gates.test.ts (FR-HM3, D3)', () => {
  const files = SCAN_DIRS.flatMap((dir) =>
    walkMarkdownFiles(join(ROOT, dir)).map((abs) => relative(ROOT, abs)),
  );

  it('scans commands/ and agents/ markdown files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  const allRefs = files.flatMap((relFile) => {
    const text = readFileSync(join(ROOT, relFile), 'utf8');
    return findReferencesInText(text).map((ref) => ({ file: relFile, ...ref }));
  });

  it('finds at least one D3 tool reference (sanity check the scanner is not vacuous)', () => {
    expect(allRefs.length).toBeGreaterThan(0);
  });

  const ungated = allRefs.filter((ref) => !ref.gated);

  it(
    'every D3 tool reference outside KNOWN_UNGATED shares a paragraph with ' +
      '"in your tool list" and "otherwise"',
    () => {
      const unexpected = ungated.filter(
        (ref) =>
          !KNOWN_UNGATED.some(
            (entry) => entry.file === ref.file && entry.tool === ref.tool,
          ),
      );

      if (unexpected.length > 0) {
        const detail = unexpected
          .map((ref) => `  ${ref.file}:${ref.startLine} — \`${ref.tool}\``)
          .join('\n');
        throw new Error(
          `Ungated D3 tool reference(s) not covered by KNOWN_UNGATED:\n${detail}\n\n` +
            'Either gate the prose with "if a `<Tool>` is in your tool list, ' +
            'do A; otherwise do B", or add a KNOWN_UNGATED entry with file:line evidence.',
        );
      }

      expect(unexpected).toHaveLength(0);
    },
  );

  it(
    'KNOWN_UNGATED is a ratchet: every allowlisted entry is still a real, ' +
      'currently-ungated reference',
    () => {
      const stale = KNOWN_UNGATED.filter(
        (entry) =>
          !ungated.some((ref) => ref.file === entry.file && ref.tool === entry.tool),
      );

      if (stale.length > 0) {
        const detail = stale
          .map((entry) => `  ${entry.file} — \`${entry.tool}\``)
          .join('\n');
        throw new Error(
          `KNOWN_UNGATED entries no longer describe an ungated reference ` +
            `(the reference was gated or removed). Remove them — the list ` +
            `can only shrink:\n${detail}`,
        );
      }

      expect(stale).toHaveLength(0);
    },
  );
});

// ── Self-test: D3 token-matching precision ──────────────────────────────

describe('Task 2: D3 token-matching precision (self-test fixtures)', () => {
  it('a bare section heading like "## Workflow" does not match', () => {
    const refs = findReferencesInText('## Workflow\n\nUnrelated prose below the heading.\n');
    expect(refs).toHaveLength(0);
  });

  it('the agent name "Audit Artifact Writer" does not match', () => {
    const refs = findReferencesInText(
      '"Audit Artifact Writer" is a Haiku-backed utility agent, not a tool reference.\n',
    );
    expect(refs).toHaveLength(0);
  });

  it('a fenced code block mentioning tool names does not match', () => {
    const refs = findReferencesInText(
      [
        '```text',
        'Mentions `Workflow` and the Artifact tool here, but this is a code fence.',
        '```',
        '',
      ].join('\n'),
    );
    expect(refs).toHaveLength(0);
  });

  it('a nested fence (outer ```` around inner ```) is skipped in full', () => {
    const refs = findReferencesInText(
      [
        '1. Example:',
        '',
        '   ````',
        '   ```json',
        '   {"tool": "Workflow", "message": "SendMessage"}',
        '   ```',
        '   ````',
        '',
        '2. `Workflow` is unrelated prose after the fence, gated: in your tool list; otherwise skip.',
        '',
      ].join('\n'),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].tool).toBe('Workflow');
    expect(refs[0].gated).toBe(true);
  });

  it('a backticked `Workflow` reference matches', () => {
    const refs = findReferencesInText(
      'If a `Workflow` tool is in your tool list, use it directly; otherwise fall back to prose.\n',
    );
    expect(refs.some((ref) => ref.tool === 'Workflow')).toBe(true);
  });

  it('the bare phrase "Workflow tool" (no backticks) matches', () => {
    const refs = findReferencesInText(
      'The Workflow tool is in your tool list only on Claude Code; otherwise fall back to the prose path.\n',
    );
    expect(refs.some((ref) => ref.tool === 'Workflow')).toBe(true);
  });

  it('the bare phrase "the Artifact tool" (no backticks) matches', () => {
    const refs = findReferencesInText(
      'The Artifact tool is in your tool list only on Claude Code; otherwise fall back to the prose path.\n',
    );
    expect(refs.some((ref) => ref.tool === 'Artifact')).toBe(true);
  });

  it('gating requires both "in your tool list" and "otherwise" in the same paragraph', () => {
    const missingOtherwise = findReferencesInText(
      'If a `Workflow` tool is in your tool list, use it directly.\n',
    );
    expect(missingOtherwise[0].gated).toBe(false);

    const missingToolList = findReferencesInText(
      'If a `Workflow` tool is available, use it directly; otherwise fall back to prose.\n',
    );
    expect(missingToolList[0].gated).toBe(false);
  });

  it('a gate phrase in a different paragraph does not count as shared', () => {
    const refs = findReferencesInText(
      [
        'If a `Workflow` tool is available, use it directly.',
        '',
        'Otherwise, note that this capability is in your tool list on some hosts.',
        '',
      ].join('\n'),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].gated).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Task 15 (Phase 2, Milestone 2.1; FR-HM7)
//
// Claude Code injects CLAUDE.md into context automatically, so a literal
// `@CLAUDE.md` include in command prose duplicates ~27 KB per invocation.
// Codex/OpenCode read AGENTS.md (CLAUDE.md as fallback), Gemini CLI reads
// GEMINI.md, Hermes is first-match across .hermes.md/AGENTS.md/CLAUDE.md,
// and Grok has no `@` include syntax at all. Command prose must therefore
// describe host-aware behavior instead of hard-coding `@CLAUDE.md`.
//
// This suite:
//   1. Asserts no `@CLAUDE.md` literal remains anywhere under
//      plugins/synthex/commands or plugins/synthex/agents.
//   2. Asserts each of the 7 known sites contains the canonical sentence
//      naming all four candidate files (AGENTS.md, CLAUDE.md, GEMINI.md,
//      .hermes.md). The sentence text lives in ONE constant here so future
//      sites can reuse it instead of re-deriving the wording.
//   3. Self-tests the detection logic against a bare `@CLAUDE.md` fixture
//      string, so a regression in the detector itself would be caught.
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, '..', '..');
const COMMANDS_DIR = join(ROOT, 'plugins', 'synthex', 'commands');
const AGENTS_DIR = join(ROOT, 'plugins', 'synthex', 'agents');

// ---------------------------------------------------------------------------
// Canonical sentences (single source of truth — reuse these, don't re-derive)
// ---------------------------------------------------------------------------

/** The four candidate project-instruction filenames, in canonical order. */
const FOUR_INSTRUCTION_FILES =
  '`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.hermes.md`';

/** Canonical sentence for the 5 READ sites — identical text at every site. */
const READ_SENTENCE =
  'If the host did not already inject the project instruction file into ' +
  `your context, Read the first of ${FOUR_INSTRUCTION_FILES} that exists ` +
  'at the repository root.';

/**
 * Canonical opening clause for the 2 UPDATE sites. The trailing clause
 * ("with ...") differs per site (it describes what's being appended), so
 * only the shared, host-aware opening is held as a constant.
 */
const UPDATE_SENTENCE_OPENING =
  'Update the project instruction file (`CLAUDE.md` on Claude Code; ' +
  `otherwise the first of ${FOUR_INSTRUCTION_FILES} that exists) with`;

// ---------------------------------------------------------------------------
// Detection helper (self-tested below)
// ---------------------------------------------------------------------------

/** Detects a literal `@CLAUDE.md` inclusion (backtick-wrapped or bare). */
function containsAtClaudeMdInclusion(content: string): boolean {
  return /@CLAUDE\.md/.test(content);
}

/** Recursively collects all .md file paths under a directory. */
function collectMarkdownFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// The 7 known sites (FR-HM7)
// ---------------------------------------------------------------------------

const READ_SITES = [
  { file: 'performance-audit.md', line: 194 },
  { file: 'review-code.md', line: 324 },
  { file: 'refine-requirements.md', line: 64 },
  { file: 'reliability-review.md', line: 43 },
  { file: 'write-implementation-plan.md', line: 106 },
] as const;

const UPDATE_SITES = [
  { file: 'next-priority.md', line: 164 },
  { file: 'write-implementation-plan.md', line: 326 },
] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Task 15: host-aware project-instruction-file prose (FR-HM7)', () => {
  describe('no @CLAUDE.md literal remains', () => {
    it('plugins/synthex/commands contains no @CLAUDE.md', () => {
      const offenders = collectMarkdownFiles(COMMANDS_DIR)
        .filter((f) => containsAtClaudeMdInclusion(readFileSync(f, 'utf8')))
        .map((f) => f.replace(ROOT + '/', ''));
      expect(offenders).toEqual([]);
    });

    it('plugins/synthex/agents contains no @CLAUDE.md', () => {
      const offenders = collectMarkdownFiles(AGENTS_DIR)
        .filter((f) => containsAtClaudeMdInclusion(readFileSync(f, 'utf8')))
        .map((f) => f.replace(ROOT + '/', ''));
      expect(offenders).toEqual([]);
    });
  });

  describe('READ sites use the canonical sentence', () => {
    for (const site of READ_SITES) {
      it(`${site.file}:${site.line} contains the canonical READ sentence naming all four files`, () => {
        const content = readFileSync(join(COMMANDS_DIR, site.file), 'utf8');
        expect(content).toContain(READ_SENTENCE);
      });
    }

    it('the canonical READ sentence is byte-identical across all 5 sites', () => {
      const occurrences = READ_SITES.map((site) => {
        const content = readFileSync(join(COMMANDS_DIR, site.file), 'utf8');
        return content.includes(READ_SENTENCE);
      });
      expect(occurrences.every(Boolean)).toBe(true);
    });
  });

  describe('UPDATE sites use the canonical opening clause', () => {
    for (const site of UPDATE_SITES) {
      it(`${site.file}:${site.line} contains the canonical UPDATE opening naming all four files`, () => {
        const content = readFileSync(join(COMMANDS_DIR, site.file), 'utf8');
        expect(content).toContain(UPDATE_SENTENCE_OPENING);
      });
    }
  });

  describe('detection self-test (fixture)', () => {
    it('flags a bare @CLAUDE.md inclusion in a sample string', () => {
      const sample = 'Before starting, Read `@CLAUDE.md` for project conventions.';
      expect(containsAtClaudeMdInclusion(sample)).toBe(true);
    });

    it('does not flag the canonical host-aware sentence', () => {
      expect(containsAtClaudeMdInclusion(READ_SENTENCE)).toBe(false);
      expect(containsAtClaudeMdInclusion(UPDATE_SENTENCE_OPENING)).toBe(false);
    });

    it('does not flag unrelated @{...} parameter placeholders', () => {
      const sample = 'Check `@{specs_path}` for existing technical specs';
      expect(containsAtClaudeMdInclusion(sample)).toBe(false);
    });
  });

});

// ---------------------------------------------------------------------------
// Task 18 (Phase 2, Milestone 2.2; FR-HM13 + FR-HM42)
//
// (a) Every `${CLAUDE_PLUGIN_ROOT}/scripts/...` invocation in commands/ or
//     agents/ prose must be followed — in the same paragraph, or on the next
//     non-empty line — by ONE canonical other-hosts sentence naming Codex,
//     Gemini CLI, OpenCode, Grok, and Hermes, plus the D17 `plugin_root`
//     fallback from `.synthex/state.json`.
// (b) A separate canonical sentence covers depth-1 hosts that refuse a
//     nested subagent (OpenCode, Grok Build, Hermes): it must appear,
//     byte-identical, in exactly tech-lead.md, multi-model-review-
//     orchestrator.md, and next-priority.md — and nowhere else, and never
//     inside a `## Output Format` section.
// ---------------------------------------------------------------------------

/** Canonical other-hosts sentence for every `${CLAUDE_PLUGIN_ROOT}/scripts/...` call site. */
const OTHER_HOSTS_SCRIPT_SENTENCE =
  'On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if ' +
  '`${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: ' +
  '`plugin_root` from `.synthex/state.json`, else the directory two levels ' +
  'above the wrapper you were loaded from.';

/** Canonical depth-1 inline-delegation sentence (FR-HM42). */
const DEPTH1_INLINE_SENTENCE =
  'If the host refuses a nested subagent (depth-1 hosts such as OpenCode, ' +
  'Grok Build, and Hermes), perform the role inline in this session, then continue.';

/** The exactly-3 files that must carry the depth-1 sentence. */
const DEPTH1_SITES = [
  join(AGENTS_DIR, 'tech-lead.md'),
  join(AGENTS_DIR, 'multi-model-review-orchestrator.md'),
  join(COMMANDS_DIR, 'next-priority.md'),
];

/** Detects a `${CLAUDE_PLUGIN_ROOT}/scripts/...` script-invocation line. */
const SCRIPT_CALL_PATTERN = /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\//;

/** Returns the 0-based line indices in `content` that invoke a plugin-root script. */
function findScriptCallLines(content: string): number[] {
  const lines = content.split('\n');
  const matches: number[] = [];
  lines.forEach((line, i) => {
    if (SCRIPT_CALL_PATTERN.test(line)) matches.push(i);
  });
  return matches;
}

/**
 * True if the canonical other-hosts sentence appears either (a) in the same
 * blank-line-delimited paragraph as `lineIndex`, or (b) on the next
 * non-empty line after it — skipping past a fenced code block's closing
 * ``` marker first, if `lineIndex` sits inside one.
 */
function isFollowedByOtherHostsSentence(content: string, lineIndex: number): boolean {
  const lines = content.split('\n');

  // Is this line inside a fenced code block? Count ``` fence markers above it.
  let fenceCount = 0;
  for (let i = 0; i < lineIndex; i++) {
    if (/^```/.test(lines[i].trim())) fenceCount++;
  }
  const insideFence = fenceCount % 2 === 1;

  // (a) Same paragraph: expand to the nearest blank lines on either side.
  let start = lineIndex;
  while (start > 0 && lines[start - 1].trim() !== '') start--;
  let end = lineIndex;
  while (end < lines.length - 1 && lines[end + 1].trim() !== '') end++;
  const paragraph = lines.slice(start, end + 1).join('\n');
  if (paragraph.includes(OTHER_HOSTS_SCRIPT_SENTENCE)) return true;

  // (b) Next non-empty line — if inside a fence, first skip past its close.
  let j = lineIndex + 1;
  if (insideFence) {
    while (j < lines.length && !/^```/.test(lines[j].trim())) j++;
    j++; // step past the closing fence marker itself
  }
  while (j < lines.length && lines[j].trim() === '') j++;
  return j < lines.length && lines[j].includes(OTHER_HOSTS_SCRIPT_SENTENCE);
}

const SCRIPT_CALL_FILES = [
  ...collectMarkdownFiles(COMMANDS_DIR),
  ...collectMarkdownFiles(AGENTS_DIR),
];

describe('Task 18: other-hosts guidance follows every ${CLAUDE_PLUGIN_ROOT}/scripts call (FR-HM13)', () => {
  describe('discovery: known script-call sites', () => {
    it('finds exactly the 2 known sites (next-priority.md, loop.md)', () => {
      const sites = SCRIPT_CALL_FILES.filter(
        (f) => findScriptCallLines(readFileSync(f, 'utf8')).length > 0
      ).map((f) => f.replace(ROOT + '/', ''));
      expect(sites.sort()).toEqual(
        [
          'plugins/synthex/commands/loop.md',
          'plugins/synthex/commands/next-priority.md',
        ].sort()
      );
    });
  });

  describe('every script-call line is followed by the canonical other-hosts sentence', () => {
    for (const file of SCRIPT_CALL_FILES) {
      const relPath = file.replace(ROOT + '/', '');
      const content = readFileSync(file, 'utf8');
      const callLines = findScriptCallLines(content);
      for (const lineIndex of callLines) {
        it(`${relPath}:${lineIndex + 1} is followed by the canonical other-hosts sentence`, () => {
          expect(isFollowedByOtherHostsSentence(content, lineIndex)).toBe(true);
        });
      }
    }
  });

  describe('fixture self-tests (detector correctness)', () => {
    it('flags a script line followed by the sentence in the same paragraph', () => {
      const sample =
        `Run the script.\n\n` +
        '```bash\n' +
        'bash "${CLAUDE_PLUGIN_ROOT}/scripts/example.sh"\n' +
        '```\n\n' +
        `${OTHER_HOSTS_SCRIPT_SENTENCE}\n\n` +
        `Continue on.`;
      const lines = sample.split('\n');
      const idx = lines.findIndex((l) => SCRIPT_CALL_PATTERN.test(l));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(isFollowedByOtherHostsSentence(sample, idx)).toBe(true);
    });

    it('flags a script line followed by the sentence inline in the same paragraph (no fence)', () => {
      const sample =
        `Run \`bash "\${CLAUDE_PLUGIN_ROOT}/scripts/example.sh"\`. ${OTHER_HOSTS_SCRIPT_SENTENCE} Then continue.`;
      expect(isFollowedByOtherHostsSentence(sample, 0)).toBe(true);
    });

    it('does NOT flag a script line with no other-hosts sentence nearby', () => {
      const sample =
        `Run the script.\n\n` +
        '```bash\n' +
        'bash "${CLAUDE_PLUGIN_ROOT}/scripts/example.sh"\n' +
        '```\n\n' +
        `Continue on with unrelated prose.`;
      const lines = sample.split('\n');
      const idx = lines.findIndex((l) => SCRIPT_CALL_PATTERN.test(l));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(isFollowedByOtherHostsSentence(sample, idx)).toBe(false);
    });
  });
});

describe('Task 18: depth-1 inline-delegation rule (FR-HM42)', () => {
  describe('present, byte-identical, in exactly the 3 files', () => {
    for (const file of DEPTH1_SITES) {
      const relPath = file.replace(ROOT + '/', '');
      it(`${relPath} contains the canonical depth-1 sentence`, () => {
        const content = readFileSync(file, 'utf8');
        expect(content).toContain(DEPTH1_INLINE_SENTENCE);
      });
    }

    it('is byte-identical across all 3 sites', () => {
      const occurrences = DEPTH1_SITES.map((file) =>
        readFileSync(file, 'utf8').includes(DEPTH1_INLINE_SENTENCE)
      );
      expect(occurrences.every(Boolean)).toBe(true);
    });
  });

  describe('appears in exactly these 3 files, nowhere else under commands/ or agents/', () => {
    it('no other commands/ or agents/ file contains the depth-1 sentence', () => {
      const allFiles = [
        ...collectMarkdownFiles(COMMANDS_DIR),
        ...collectMarkdownFiles(AGENTS_DIR),
      ];
      const offenders = allFiles
        .filter((f) => !DEPTH1_SITES.includes(f))
        .filter((f) => readFileSync(f, 'utf8').includes(DEPTH1_INLINE_SENTENCE))
        .map((f) => f.replace(ROOT + '/', ''));
      expect(offenders).toEqual([]);
    });
  });

  describe('kept out of ## Output Format sections', () => {
    for (const file of DEPTH1_SITES) {
      const relPath = file.replace(ROOT + '/', '');
      it(`${relPath}: sentence is not inside ## Output Format`, () => {
        const content = readFileSync(file, 'utf8');
        const start = content.indexOf('## Output Format');
        if (start === -1) return; // no such section in this file — nothing to guard
        const nextH2 = content.indexOf('\n## ', start + 1);
        const section = nextH2 === -1 ? content.slice(start) : content.slice(start, nextH2);
        expect(section).not.toContain(DEPTH1_INLINE_SENTENCE);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Task 17 (Phase 2, Milestone 2.2; FR-HM8)
//
// Drop emphasis scaffolding written for older models:
//   1. next-priority.md's `--loop` STOP blockquote banner is replaced by one
//      plain sentence.
//   2. product-manager.md's AskUserQuestion rule — previously restated in
//      full up to 5 times — is trimmed to at most 2 statements: one
//      canonical statement in `## Behavioral Rules` and one at the
//      Requirements Gathering ("interview") step.
// ---------------------------------------------------------------------------

const NEXT_PRIORITY_PATH = join(COMMANDS_DIR, 'next-priority.md');
const PRODUCT_MANAGER_PATH = join(AGENTS_DIR, 'product-manager.md');

/** The plain-sentence replacement for the removed STOP banner (FR-HM8). */
const LOOP_REPLACEMENT_SENTENCE =
  '`--loop` here is Synthex native looping (see the Native Looping section), ' +
  'not the harness `/loop` skill.';

/**
 * Counts statements of "the AskUserQuestion rule" in product-manager.md.
 *
 * "The rule" is defined as a sentence that BOTH names the `AskUserQuestion`
 * tool AND explicitly frames it as required for human-user input (the
 * phrase "human user", as in "human user input" / "input from the human
 * user"). This distinguishes a full rule *statement* from an incidental
 * *usage* mention of the tool inside an unrelated workflow instruction
 * (e.g. "ask 3-5 at a time using `AskUserQuestion`", or "start by asking
 * clarifying questions ... using the `AskUserQuestion` tool" — neither of
 * which restates the human-vs-sub-agent escalation rule and both of which
 * are kept intact by Task 17).
 *
 * Sentences are split on `.`/`!`/`?` followed by whitespace; markdown
 * em-dash clauses ("--") do not end a sentence for this purpose, matching
 * how the rule is actually written in product-manager.md.
 */
function countAskUserQuestionRuleStatements(content: string): number {
  const sentences = content.split(/(?<=[.!?])\s+/);
  return sentences.filter(
    (s) => /AskUserQuestion/.test(s) && /human user/i.test(s)
  ).length;
}

describe('Task 17: emphasis scaffolding diet (FR-HM8)', () => {
  describe('next-priority.md: STOP banner replaced', () => {
    let content: string;

    it('reads the file', () => {
      content = readFileSync(NEXT_PRIORITY_PATH, 'utf8');
      expect(content.length).toBeGreaterThan(0);
    });

    it('no longer contains the STOP blockquote banner', () => {
      content = readFileSync(NEXT_PRIORITY_PATH, 'utf8');
      expect(content).not.toMatch(/STOP and jump to/);
      expect(content).not.toMatch(/>\s*\*\*If `--loop` appears/);
    });

    it('contains the plain-sentence replacement', () => {
      content = readFileSync(NEXT_PRIORITY_PATH, 'utf8');
      expect(content).toContain(LOOP_REPLACEMENT_SENTENCE);
    });
  });

  describe('product-manager.md: AskUserQuestion rule stated at most twice', () => {
    it('the rule appears at most twice', () => {
      const content = readFileSync(PRODUCT_MANAGER_PATH, 'utf8');
      expect(countAskUserQuestionRuleStatements(content)).toBeLessThanOrEqual(2);
    });

    it('one canonical statement lives in ## Behavioral Rules', () => {
      const content = readFileSync(PRODUCT_MANAGER_PATH, 'utf8');
      const behavioralSection = content.slice(content.indexOf('## Behavioral Rules'));
      expect(countAskUserQuestionRuleStatements(behavioralSection)).toBe(1);
    });

    it('one statement remains at the interview (Requirements Gathering) step', () => {
      const content = readFileSync(PRODUCT_MANAGER_PATH, 'utf8');
      const interviewSection = content.slice(
        content.indexOf('## Requirements Gathering'),
        content.indexOf('## Primary Documents')
      );
      expect(countAskUserQuestionRuleStatements(interviewSection)).toBe(1);
    });

    it('detection self-test: counts a full rule restatement', () => {
      const sample =
        '**ALWAYS** use the `AskUserQuestion` tool when you need human user input.';
      expect(countAskUserQuestionRuleStatements(sample)).toBe(1);
    });

    it('detection self-test: does not count an incidental usage mention', () => {
      const sample =
        'Group them logically, ask 3-5 at a time using `AskUserQuestion`, ' +
        'and adapt follow-ups based on answers.';
      expect(countAskUserQuestionRuleStatements(sample)).toBe(0);
    });
  });
});

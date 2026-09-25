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

  // -------------------------------------------------------------------------
  // Task 18 will extend this suite with a rule that other-hosts guidance
  // must follow every `${CLAUDE_PLUGIN_ROOT}/scripts` call site. Not
  // implemented here — this block reserves the spot.
  // -------------------------------------------------------------------------
  describe.todo(
    'Task 18: other-hosts guidance follows every ${CLAUDE_PLUGIN_ROOT}/scripts call'
  );
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

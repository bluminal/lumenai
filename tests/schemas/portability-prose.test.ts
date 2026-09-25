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

/**
 * Layer 1: Raw-string + structural tests for the multi-model review wizard.
 * "Configure Multi-Model Review (optional)" — FR-MR19, D22, FR-MR27.
 *
 * Originally tested init.md §4. As of upgrade-onboarding Phase 1 (Tasks 1-3),
 * the wizard content was extracted into a standalone command at
 * plugins/synthex/commands/configure-multi-model.md, with section anchors
 * renumbered (4a→1a, 4b→1b, 4c→1c, 4d→1d). This test now reads from the
 * standalone wizard file and matches against `### 1. ...`.
 *
 * These tests validate the *definition* (markdown) of the wizard,
 * not runtime behavior. They catch regressions where:
 * - The multi-model review section is removed
 * - D22 auth pre-validation is dropped
 * - Parallel CLI detection is serialized
 * - Unauthenticated CLIs leak into the reviewers list
 * - The FR-MR27 data-transmission warning is removed or weakened
 * - The FR-MR20 preflight format changes
 * - The docs/reviews/ directory creation step is removed
 *
 * Cost: $0 (no LLM calls — pure file parsing)
 *
 * [H] markers indicate acceptance criteria requiring user approval.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INIT_MD_PATH = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'commands',
  'configure-multi-model.md'
);

// init.md is the broader command — referenced for structural ordering tests
// (e.g., "section 4 comes after section 3"). The wizard content moved to
// configure-multi-model.md (INIT_MD_PATH above), but init.md still owns the
// overall workflow shape.
const INIT_MD_HOST_PATH = join(
  __dirname,
  '..',
  '..',
  'plugins',
  'synthex',
  'commands',
  'init.md'
);

// ── File loader ──────────────────────────────────────────────────

function loadInitMd(): string {
  return readFileSync(INIT_MD_PATH, 'utf-8');
}

function loadInitMdHost(): string {
  return readFileSync(INIT_MD_HOST_PATH, 'utf-8');
}

/**
 * Extract a top-level workflow section by step number and title substring.
 * Returns text from the matching ### heading to the next ### N. or ## heading.
 */
function extractSection(markdown: string, stepNum: number, titleSubstr: string): string | null {
  const escaped = titleSubstr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `### ${stepNum}\\.\\s+[^\\n]*${escaped}[\\s\\S]*?(?=\\n### \\d|\n## [A-Z]|$)`
  );
  const match = markdown.match(pattern);
  return match ? match[0] : null;
}

// ── Tests ────────────────────────────────────────────────────────

describe('init.md — Multi-Model Review section (Task 47)', () => {
  let content: string;

  beforeAll(() => {
    content = loadInitMd();
  });

  // ── 1. File exists ──────────────────────────────────────────────

  it('file exists', () => {
    expect(existsSync(INIT_MD_PATH)).toBe(true);
  });

  // ── 2. New section present ──────────────────────────────────────

  it('contains "Configure Multi-Model Review" section', () => {
    expect(content).toContain('Configure Multi-Model Review');
  });

  it('section is numbered 4 (inserted between concurrent tasks and .gitignore)', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
  });

  // ── 3. CLI detection runs both `which` AND auth check (D22) ─────

  it('section references `which` for CLI presence detection', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('which');
  });

  it('section references auth check command alongside `which`', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    // The section must document auth check commands, not just which
    expect(section!).toMatch(/auth check/i);
  });

  it('section includes codex auth check command (codex auth status)', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('codex auth status');
  });

  it('section includes gemini auth check command (gcloud auth list)', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('gcloud auth list');
  });

  // ── 4. All checks dispatch concurrently in a single parallel Bash batch ─

  it('specifies that all checks dispatch concurrently in a single parallel Bash batch', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('single parallel Bash batch');
  });

  it('states that wall-clock is bounded by the slowest single check (not sum)', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toMatch(/slowest single check/);
  });

  // ── 5. "Enable with detected CLIs" only includes authenticated CLIs (D22) ─

  it('option 1 label specifies ONLY authenticated CLIs are included', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toMatch(/ONLY authenticated/);
  });

  it('states that detected-but-unauthenticated CLIs are NOT written to reviewers list', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    // Must explicitly say unauthenticated are excluded from the reviewers list
    expect(section!).toMatch(/Do NOT include detected-but-unauthenticated/i);
  });

  // ── 6. Unauthenticated CLIs surfaced separately with remediation hints ───

  it('surfaces unauthenticated CLIs separately with remediation hints', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toMatch(/detected-but-unauthenticated/);
  });

  it('includes gcloud auth login as a remediation hint example', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('gcloud auth login');
  });

  // ── 7. [H] Three options surfaced via AskUserQuestion ───────────

  it('[H] uses AskUserQuestion to surface options', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('AskUserQuestion');
  });

  it('[H] option 1 is "Enable with detected CLIs"', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('Enable with detected CLIs');
  });

  it('[H] option 2 is "Enable later (show snippet)"', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('Enable later (show snippet)');
  });

  it('[H] option 3 is "Skip"', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toMatch(/\bSkip\b/);
  });

  // ── 8. [H] Detection scan emits progress indicator before auth checks ─

  it('[H] emits "Detecting installed CLIs..." progress indicator before checks', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('Detecting installed CLIs');
  });

  it('[H] progress indicator appears before the auth check table', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    const progressPos = section!.indexOf('Detecting installed CLIs');
    const tablePos = section!.indexOf('| CLI |');
    expect(progressPos).toBeGreaterThan(-1);
    expect(tablePos).toBeGreaterThan(progressPos);
  });

  // ── 9. Auth checks exiting 0 treated as authenticated regardless of advisory text ─

  it('states auth checks that exit 0 are treated as authenticated regardless of advisory text on stdout/stderr', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toMatch(/exit 0/);
    expect(section!).toMatch(/authenticated/);
    expect(section!).toMatch(/advisory/i);
  });

  // ── 10. Data-transmission warning appears before `enabled: true` ─

  it('data-transmission warning text appears in the section', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('Heads up — data transmission');
  });

  it('warning appears BEFORE the instruction to write enabled: true', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    const warningPos = section!.indexOf('Heads up — data transmission');
    // The instruction to write enabled: true appears after the warning
    const writeConfigPos = section!.indexOf('enabled: true', warningPos + 1);
    expect(warningPos).toBeGreaterThan(-1);
    expect(writeConfigPos).toBeGreaterThan(warningPos);
  });

  // ── 11. [H] Warning copy matches data-handling guidance style ───

  it('[H] warning mentions "code, diffs" as transmitted content', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('code, diffs');
  });

  it('[H] warning mentions local-model alternatives (Ollama)', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('Ollama');
  });

  it('[H] warning states Synthex does not store, log, or modify content', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toMatch(/does not store, log, or modify/);
  });

  // ── 12. "Enable with detected" writes config matching authenticated CLIs only ─

  it('"Enable with detected" option writes reviewers list with authenticated CLIs only', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    // Must mention writing reviewers to config with authenticated CLIs
    expect(section!).toContain('reviewers');
    expect(section!).toMatch(/authenticated CLIs only/i);
  });

  // ── 13. Preflight runs and reports summary in FR-MR20 format ────

  it('preflight runs and reports summary in FR-MR20 format', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('N reviewers configured, M available, K families, aggregator:');
  });

  it('references FR-MR20 for the preflight summary format', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('FR-MR20');
  });

  // ── 14. Preflight failure prints remediation but does not abort init ─

  it('preflight failure does NOT abort init', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toMatch(/does NOT abort init/);
  });

  it('preflight failure prints remediation so user can fix and re-run', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toMatch(/remediation/i);
  });

  // ── 15. docs/reviews/ created and surfaced in init confirmation ──

  it('docs/reviews/ directory is created when "Enable with detected" is chosen', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toContain('docs/reviews/');
    expect(section!).toContain('mkdir');
  });

  it('docs/reviews/ creation is surfaced in init confirmation output', () => {
    // The confirmation block lives in init.md, not the wizard file.
    const hostContent = loadInitMdHost();
    expect(hostContent).toMatch(/docs\/reviews\//);
    const confirmSection = extractSection(hostContent, 7, 'Confirm and Guide');
    expect(confirmSection).not.toBeNull();
    expect(confirmSection!).toContain('docs/reviews/');
  });

  // ── Workflow section ordering (init.md structural tests) ─────────

  it('section 4 (multi-model) comes AFTER section 3 (concurrent tasks)', () => {
    const hostContent = loadInitMdHost();
    const concurrentPos = hostContent.indexOf('### 3. Configure Concurrent Tasks');
    const mmrPos = hostContent.indexOf('### 4. Configure Multi-Model Review');
    expect(concurrentPos).toBeGreaterThan(-1);
    expect(mmrPos).toBeGreaterThan(concurrentPos);
  });

  it('section 5 (update .gitignore) comes AFTER section 4 (multi-model)', () => {
    const hostContent = loadInitMdHost();
    const mmrPos = hostContent.indexOf('### 4. Configure Multi-Model Review');
    const gitignorePos = hostContent.indexOf('### 5. Update .gitignore');
    expect(mmrPos).toBeGreaterThan(-1);
    expect(gitignorePos).toBeGreaterThan(mmrPos);
  });

  it('sections renumbered correctly: 5=.gitignore, 6=create-dirs, 7=confirm', () => {
    const hostContent = loadInitMdHost();
    expect(hostContent).toContain('### 5. Update .gitignore');
    expect(hostContent).toContain('### 6. Create Document Directories');
    expect(hostContent).toContain('### 7. Confirm and Guide');
  });

  // ── Anti-pattern: no API keys ────────────────────────────────────

  it('explicitly states API keys must NOT be written to config', () => {
    const section = extractSection(content, 1, 'Configure Multi-Model Review');
    expect(section).not.toBeNull();
    expect(section!).toMatch(/API keys/i);
    expect(section!).toMatch(/NOT contain API keys|does NOT contain API keys/i);
  });
});

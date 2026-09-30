/**
 * Task 57 (FR-HM16, D4): workflow-names.test.ts.
 *
 * Live-run root cause (not prompt wording): a plugin Workflow script's
 * `meta.name` is registered as the slash command `<plugin>:<name>`, and
 * that registration SHADOWS a same-named plugin command entirely. A Task
 * 57 `[H]` live run confirmed this directly — a workflow whose `meta.name`
 * was `review-code` made `/synthex:review-code` expand straight to "Run
 * the 'synthex:review-code' workflow ... Invoke:
 * `Workflow({ name: "synthex:review-code" })`" instead of loading
 * `commands/review-code.md`, silently skipping every config check, the
 * capability ladder, and the review loop. See the Task 9 addendum in
 * docs/specs/harness-modernization/spikes.md and
 * plugins/synthex/docs/engines/review-code-workflow.md's "Live-run fixes"
 * section.
 *
 * This suite is the static guard against that class of bug recurring:
 *   [T] every `plugins/synthex/workflows/*.js` `meta.name` is unique
 *   [T] no workflow `meta.name` collides with any command basename in
 *       `plugins/synthex/commands/` (recursively, so a future nested
 *       command is covered too)
 *   [T] no workflow `meta.name` collides with any agent basename in
 *       `plugins/synthex/agents/`
 *
 * `meta.name` is parsed out of each workflow file's source text (not
 * executed — a workflow script body references globals like `args`,
 * `agent`, `parallel`, `phase`, and `log` that only exist inside the
 * Workflow runtime, so `eval`/`import` would throw), so this test can
 * never hardcode a name and silently stop checking the real file.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const pluginRoot = join(repoRoot, 'plugins', 'synthex');
const WORKFLOWS_DIR = join(pluginRoot, 'workflows');
const COMMANDS_DIR = join(pluginRoot, 'commands');
const AGENTS_DIR = join(pluginRoot, 'agents');

/** Lists every `.js` file directly under `dir` (workflows/ is not expected to nest). */
function listWorkflowFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => join(dir, entry.name));
}

/** Recursively lists every `.md` basename (without extension) under `dir`, nested or not. */
function listMarkdownBasenames(dir: string): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      names.push(...listMarkdownBasenames(full));
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      names.push(entry.name.slice(0, -'.md'.length));
    }
  }
  return names;
}

/**
 * Extracts `meta.name` from a Workflow script's source text by locating
 * the `export const meta = { ... }` object literal and reading its `name`
 * field — never by executing the file.
 */
function parseWorkflowMetaName(source: string, filePath: string): string {
  const metaStart = source.indexOf('export const meta');
  if (metaStart === -1) {
    throw new Error(`${filePath}: no "export const meta" found`);
  }
  const braceStart = source.indexOf('{', metaStart);
  if (braceStart === -1) {
    throw new Error(`${filePath}: "export const meta" has no opening brace`);
  }
  // Find the matching closing brace by depth-counting (the meta object
  // nests an array of phase objects, so a naive first-"}" search is wrong).
  let depth = 0;
  let metaEnd = -1;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        metaEnd = i;
        break;
      }
    }
  }
  if (metaEnd === -1) {
    throw new Error(`${filePath}: unbalanced braces in "export const meta" object`);
  }
  const metaBlock = source.slice(braceStart, metaEnd + 1);
  const nameMatch = metaBlock.match(/\bname:\s*'([^']+)'/);
  if (!nameMatch) {
    throw new Error(`${filePath}: meta object has no name: '...' field`);
  }
  return nameMatch[1];
}

const workflowFiles = listWorkflowFiles(WORKFLOWS_DIR);
const workflowNames = workflowFiles.map((filePath) => ({
  filePath,
  name: parseWorkflowMetaName(readFileSync(filePath, 'utf8'), filePath),
}));

const commandNames = new Set(listMarkdownBasenames(COMMANDS_DIR));
const agentNames = new Set(listMarkdownBasenames(AGENTS_DIR));

describe('Task 57 (live-run defect 1 root cause): workflow-names.test.ts', () => {
  it('found at least one workflow to check (sanity — an empty glob would make every assertion below vacuously pass)', () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  it('every workflow meta.name is parseable and non-empty', () => {
    for (const { filePath, name } of workflowNames) {
      expect(name, filePath).toBeTruthy();
      expect(typeof name).toBe('string');
    }
  });

  it('no two workflows share the same meta.name', () => {
    const seen = new Map<string, string>();
    for (const { filePath, name } of workflowNames) {
      const priorFile = seen.get(name);
      expect(priorFile, `"${name}" is used by both ${priorFile} and ${filePath}`).toBeUndefined();
      seen.set(name, filePath);
    }
  });

  it('no workflow meta.name collides with a command basename (the live-run root cause)', () => {
    for (const { filePath, name } of workflowNames) {
      expect(
        commandNames.has(name),
        `${filePath}: meta.name "${name}" collides with commands/${name}.md — a workflow ` +
          `named the same as a command registers as the same slash command and SILENTLY ` +
          `SHADOWS the command file (confirmed live, Task 57). Rename the workflow.`,
      ).toBe(false);
    }
  });

  it('no workflow meta.name collides with an agent basename', () => {
    for (const { filePath, name } of workflowNames) {
      expect(
        agentNames.has(name),
        `${filePath}: meta.name "${name}" collides with agents/${name}.md`,
      ).toBe(false);
    }
  });

  it('the review-code-engine workflow specifically is not named "review-code" (Task 57 regression)', () => {
    const reviewCodeEngine = workflowNames.find((w) => w.filePath.endsWith('review-code-engine.js'));
    expect(reviewCodeEngine, 'plugins/synthex/workflows/review-code-engine.js not found').toBeTruthy();
    expect(reviewCodeEngine!.name).toBe('review-code-engine');
    expect(reviewCodeEngine!.name).not.toBe('review-code');
  });
});

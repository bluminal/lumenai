/**
 * Task 57 (FR-HM16, D4): review-engine-sync.test.ts.
 *
 * plugins/synthex/workflows/review-code.js (a Workflow script) cannot
 * `import` plugins/synthex/workflows/lib/review-engine.mjs: Workflow
 * scripts run in a sandboxed plain-JS context with no filesystem or
 * Node.js module resolution (Task 9 spike,
 * docs/specs/harness-modernization/spikes.md; the workflow-authoring
 * skill: "No filesystem or Node.js API access"). So review-code.js
 * carries an inlined copy of every pure function from lib/review-engine.mjs
 * instead, between a pair of sync markers.
 *
 * This suite is the "another deterministic means" of keeping the two
 * copies from drifting apart (Task 57's own instruction): it extracts the
 * marked region from review-code.js and the corresponding function
 * definitions from lib/review-engine.mjs, normalizes away comments,
 * `export` keywords, and incidental whitespace, and asserts the two are
 * textually identical. A future edit to one copy without the other fails
 * this test, not silently at runtime inside a live Workflow run.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const workflowsRoot = join(repoRoot, 'plugins', 'synthex', 'workflows');
const SCRIPT_PATH = join(workflowsRoot, 'review-code.js');
const LIB_PATH = join(workflowsRoot, 'lib', 'review-engine.mjs');

const scriptSrc = readFileSync(SCRIPT_PATH, 'utf8');
const libSrc = readFileSync(LIB_PATH, 'utf8');

const BEGIN_MARKER = 'BEGIN REVIEW-ENGINE-SYNC';
const END_MARKER = 'END REVIEW-ENGINE-SYNC';

function normalize(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\/\/.*$/gm, '') // line comments
    .replace(/\bexport\s+/g, '') // export keyword (not an ES module in a Workflow script)
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMarkedRegion(src: string): string {
  const start = src.indexOf(BEGIN_MARKER);
  const end = src.indexOf(END_MARKER);
  expect(start, `${BEGIN_MARKER} marker not found`).toBeGreaterThan(-1);
  expect(end, `${END_MARKER} marker not found`).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const afterStart = src.indexOf('\n', start) + 1;
  return src.slice(afterStart, end);
}

describe('Task 57 (FR-HM16): review-engine-sync.test.ts — script/module drift guard', () => {
  it('review-code.js has both sync markers, in order', () => {
    expect(scriptSrc.indexOf(BEGIN_MARKER)).toBeGreaterThan(-1);
    expect(scriptSrc.indexOf(END_MARKER)).toBeGreaterThan(scriptSrc.indexOf(BEGIN_MARKER));
  });

  it('the marked region in review-code.js and lib/review-engine.mjs are functionally identical', () => {
    const scriptRegion = normalize(extractMarkedRegion(scriptSrc));

    const libStart = libSrc.indexOf('const SEVERITY_RANK');
    const libEnd = libSrc.indexOf('// ── Task 58');
    expect(libStart, 'lib/review-engine.mjs: const SEVERITY_RANK not found').toBeGreaterThan(-1);
    expect(libEnd, 'lib/review-engine.mjs: Task 58 extension-point comment not found').toBeGreaterThan(libStart);
    const libRegion = normalize(libSrc.slice(libStart, libEnd));

    expect(scriptRegion).not.toBe('');
    expect(scriptRegion).toBe(libRegion);
  });

  it('every function exported by lib/review-engine.mjs (except the Task 58 extension point) has a same-named copy inlined in review-code.js', () => {
    const exportedNames = [...libSrc.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]);
    expect(exportedNames.length).toBeGreaterThan(0);
    const scriptRegion = extractMarkedRegion(scriptSrc);
    for (const name of exportedNames) {
      expect(scriptRegion, `review-code.js is missing an inlined copy of ${name}`).toMatch(
        new RegExp(`\\b(?:function|const)\\s+${name}\\b`),
      );
    }
  });

  it('review-code.js never uses the `export` keyword in code outside `export const meta`', () => {
    // Strip comments first — prose describing the sync mechanism
    // legitimately mentions `export` inside backticks.
    const codeOnly = scriptSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const exportLines = codeOnly
      .split('\n')
      .filter((line) => /\bexport\b/.test(line) && !/^export const meta\b/.test(line.trim()));
    expect(exportLines).toEqual([]);
  });
});

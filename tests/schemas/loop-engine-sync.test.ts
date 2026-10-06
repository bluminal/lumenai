/**
 * Task 59 (FR-HM19, D33, D34): loop-engine-sync.test.ts.
 *
 * plugins/synthex/workflows/loop-engine.js is a Workflow script, so it
 * cannot load plugins/synthex/workflows/lib/loop-engine.mjs (Workflow
 * scripts run in a sandboxed plain-JS context with no filesystem or module
 * resolution; Task 9 spike, docs/specs/harness-modernization/spikes.md).
 * It carries an inlined copy of the lib between a pair of sync markers
 * instead. This suite is the drift guard, mirroring
 * review-engine-sync.test.ts:
 *   - the marked region equals the lib from `const LOOP_ENGINE_SCHEMA_VERSION`
 *     to the end, after normalizing comments, `export`, and whitespace;
 *   - the script's `meta` is a pure literal named `loop-engine` (never
 *     `loop`, which would shadow /synthex:loop);
 *   - the script uses no import, require, clock, randomness, or agentType;
 *   - the verbatim rule constants still match the command files they were
 *     copied from (next-priority.md §1, and the Emission Point bullets and
 *     "Do NOT emit" caveats of the three judge commands), so the Stage 2
 *     verdict judges exactly what the Stage 1 prose path judges.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  EMISSION_CAVEATS,
  EMISSION_CONDITIONS,
  NEXT_PRIORITY_CRITICAL_RULES,
  NEXT_PRIORITY_SELECTION_RULES,
} from '../../plugins/synthex/workflows/lib/loop-engine.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const pluginRoot = join(repoRoot, 'plugins', 'synthex');
const workflowsRoot = join(pluginRoot, 'workflows');
const commandsRoot = join(pluginRoot, 'commands');
const SCRIPT_PATH = join(workflowsRoot, 'loop-engine.js');
const LIB_PATH = join(workflowsRoot, 'lib', 'loop-engine.mjs');

const scriptSrc = readFileSync(SCRIPT_PATH, 'utf8');
const libSrc = readFileSync(LIB_PATH, 'utf8');

const BEGIN_MARKER = 'BEGIN LOOP-ENGINE-SYNC';
const END_MARKER = 'END LOOP-ENGINE-SYNC';

function normalize(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\/\/.*$/gm, '') // line comments
    .replace(/\bexport\s+/g, '') // export keyword (not an ES module in a Workflow script)
    .replace(/\s+/g, ' ')
    .trim();
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
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

/** The script body: everything after the END marker line. */
function scriptBody(): string {
  const end = scriptSrc.indexOf(END_MARKER);
  return scriptSrc.slice(scriptSrc.indexOf('\n', end) + 1);
}

/** The balanced `{ ... }` object literal that follows `export const meta =`. */
function extractMetaBlock(src: string): string {
  const braceStart = src.indexOf('{', src.indexOf('export const meta'));
  let depth = 0;
  for (let i = braceStart; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  throw new Error('unbalanced braces in export const meta');
}

/** The source text of the `{ ... }` options literal of the agent() call with this label. */
function agentOptions(label: string): string {
  const body = stripComments(scriptBody());
  const m = body.match(new RegExp(`\\{\\s*label:\\s*'${label}'[^}]*\\}`));
  expect(m, `no agent() options object with label '${label}'`).toBeTruthy();
  return m![0];
}

function readCommand(name: string): string[] {
  return readFileSync(join(commandsRoot, `${name}.md`), 'utf8').split('\n');
}

/** Lines strictly between the first line equal to `startLine` and the next line starting with `endPrefix`. */
function linesBetween(lines: string[], startLine: string, endPrefix: string): string[] {
  const start = lines.findIndex((l) => l === startLine);
  expect(start, `"${startLine}" not found`).toBeGreaterThan(-1);
  const rel = lines.slice(start + 1).findIndex((l) => l.startsWith(endPrefix));
  expect(rel, `"${endPrefix}" not found after "${startLine}"`).toBeGreaterThan(-1);
  return lines.slice(start + 1, start + 1 + rel);
}

describe('Task 59 (FR-HM19): loop-engine-sync.test.ts', () => {
  it('loop-engine.js has both LOOP-ENGINE-SYNC markers, in order', () => {
    expect(scriptSrc.indexOf(BEGIN_MARKER)).toBeGreaterThan(-1);
    expect(scriptSrc.indexOf(END_MARKER)).toBeGreaterThan(scriptSrc.indexOf(BEGIN_MARKER));
    expect(scriptSrc.split(BEGIN_MARKER).length - 1).toBe(1);
    expect(scriptSrc.split(END_MARKER).length - 1).toBe(1);
  });

  it('the marked region equals lib/loop-engine.mjs from const LOOP_ENGINE_SCHEMA_VERSION to the end (comments, export and whitespace normalized)', () => {
    const scriptRegion = normalize(extractMarkedRegion(scriptSrc));
    const libStart = libSrc.indexOf('const LOOP_ENGINE_SCHEMA_VERSION');
    expect(libStart, 'lib/loop-engine.mjs: const LOOP_ENGINE_SCHEMA_VERSION not found').toBeGreaterThan(-1);
    const libRegion = normalize(libSrc.slice(libStart));
    expect(scriptRegion).not.toBe('');
    expect(scriptRegion).toBe(libRegion);
  });

  it('every export of lib/loop-engine.mjs has a same-named copy in the marked region', () => {
    const exportedNames = [...libSrc.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]);
    expect(exportedNames.length).toBeGreaterThan(0);
    expect(exportedNames).toContain('validateArgs');
    expect(exportedNames).toContain('decideAction');
    const scriptRegion = extractMarkedRegion(scriptSrc);
    for (const name of exportedNames) {
      expect(scriptRegion, `loop-engine.js is missing an inlined copy of ${name}`).toMatch(
        new RegExp(`\\b(?:function|const)\\s+${name}\\b`),
      );
    }
  });

  it("loop-engine.js starts with export const meta and meta is a pure literal named loop-engine (not 'loop')", () => {
    expect(scriptSrc.startsWith('export const meta = {')).toBe(true);
    const block = extractMetaBlock(scriptSrc);
    const skeleton = block.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, '');
    expect(skeleton).not.toMatch(/[`]|\.\.\.|\(/);
    // Remove keys (an identifier followed by ':') and the literals true/false/null/numbers;
    // only object/array punctuation and whitespace may remain.
    const residue = skeleton
      .replace(/\b[A-Za-z_$][\w$]*\s*:/g, '')
      .replace(/\b(?:true|false|null)\b/g, '')
      .replace(/-?\b\d+(?:\.\d+)?\b/g, '');
    expect(residue).toMatch(/^[\s{}[\],]*$/);
    const meta = new Function(`return ${block}`)();
    expect(meta.name).toBe('loop-engine');
    expect(meta.name).not.toBe('loop');
  });

  it('loop-engine.js has no import, require, Date.now, Math.random, argless new Date(), or agentType in code', () => {
    const code = stripComments(scriptSrc);
    expect(code).not.toMatch(/^\s*import\b|\bimport\s*\(/m);
    expect(code).not.toMatch(/\brequire\s*\(/);
    expect(code).not.toMatch(/\bDate\.now\b/);
    expect(code).not.toMatch(/\bMath\.random\b/);
    expect(code).not.toMatch(/\bnew\s+Date\s*\(\s*\)/);
    expect(code).not.toMatch(/\bagentType\b/);
    expect(code).not.toMatch(/\bisolation\s*:/);
  });

  it('loop-engine.js uses export only for meta', () => {
    const exportLines = stripComments(scriptSrc)
      .split('\n')
      .filter((line) => /\bexport\b/.test(line) && !/^export const meta\b/.test(line.trim()));
    expect(exportLines).toEqual([]);
  });

  it('every phase() title in the body is declared in meta.phases', () => {
    const meta = new Function(`return ${extractMetaBlock(scriptSrc)}`)();
    const declared = new Set(meta.phases.map((p: { title: string }) => p.title));
    expect([...declared]).toEqual(['Verdict', 'Confirm']);
    const body = stripComments(scriptBody());
    const called = [...body.matchAll(/\bphase\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
    const optionPhases = [...body.matchAll(/\bphase:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(called.length).toBeGreaterThan(0);
    for (const title of [...called, ...optionPhases]) {
      expect(declared.has(title), `phase '${title}' is not declared in meta.phases`).toBe(true);
    }
  });

  it('the Verdict agent() call pins model sonnet with effort medium and the Confirm call pins model sonnet with effort low', () => {
    const verdict = agentOptions('verdict');
    expect(verdict).toMatch(/\bphase:\s*'Verdict'/);
    expect(verdict).toMatch(/\bmodel:\s*'sonnet'/);
    expect(verdict).toMatch(/\beffort:\s*'medium'/);
    const confirm = agentOptions('confirm');
    expect(confirm).toMatch(/\bphase:\s*'Confirm'/);
    expect(confirm).toMatch(/\bmodel:\s*'sonnet'/);
    expect(confirm).toMatch(/\beffort:\s*'low'/);
    // Exactly the two leaves, nothing else spawned.
    expect([...stripComments(scriptBody()).matchAll(/\bagent\(/g)].length).toBe(2);
    expect(stripComments(scriptBody())).not.toMatch(/\bparallel\(|\bpipeline\(|\bworkflow\(/);
  });

  it('NEXT_PRIORITY_SELECTION_RULES and NEXT_PRIORITY_CRITICAL_RULES match next-priority.md verbatim', () => {
    const lines = readCommand('next-priority');
    const section = linesBetween(lines, '### 1. Analyze the Implementation Plan', '**Plan complete:**');
    const bullets = section.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
    expect(bullets).toHaveLength(4);
    expect(NEXT_PRIORITY_SELECTION_RULES).toEqual(bullets);
    const critical = lines.filter((l) => l.startsWith('**Critical Rule:**'));
    expect(critical).toHaveLength(2);
    expect(NEXT_PRIORITY_CRITICAL_RULES).toEqual(critical);
  });

  it("EMISSION_CONDITIONS and EMISSION_CAVEATS match each judge command's Emission Point verbatim", () => {
    const judges = ['review-code', 'refine-requirements', 'write-implementation-plan'] as const;
    expect(Object.keys(EMISSION_CONDITIONS).sort()).toEqual([...judges].sort());
    expect(Object.keys(EMISSION_CAVEATS).sort()).toEqual([...judges].sort());
    for (const name of judges) {
      const section = linesBetween(readCommand(name), '### Emission Point', '### Iteration Body');
      const bullets = section.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
      const caveats = section.filter((l) => l.startsWith('Do NOT emit'));
      expect(bullets, name).toHaveLength(4);
      expect(EMISSION_CONDITIONS[name], name).toEqual(bullets);
      expect(EMISSION_CAVEATS[name], name).toEqual(caveats);
    }
  });
});

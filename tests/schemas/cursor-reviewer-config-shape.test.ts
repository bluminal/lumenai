/**
 * multi-model-review Task 69 (D26, D43): every Cursor reviewer entry that
 * Synthex ships as an example names an explicit, non-Auto model AND a
 * family, in block style.
 *
 * cursor-review.sh refuses to run (cli_failed; --auth-check exits 12)
 * without `per_reviewer.cursor-review-prompter.model` (never `auto*`) and
 * `.family`, so an example that lists the reviewer without them would hand
 * users a config that can never review anything. This suite scans the
 * shipped examples: plugins/synthex/config/defaults.yaml (comments
 * included), the configure-multi-model wizard (its Option 2 snippet), and
 * the init fixtures. Task 70 adds the Cursor examples; until then the scan
 * finds none, and the detector self-tests below keep it honest.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const KEY = 'cursor-review-prompter';

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const SOURCES = [
  join(ROOT, 'plugins', 'synthex', 'config', 'defaults.yaml'),
  join(ROOT, 'plugins', 'synthex', 'commands', 'configure-multi-model.md'),
  ...walk(join(ROOT, 'tests', 'fixtures', 'multi-model-review', 'init')),
  ...walk(join(ROOT, 'tests', 'fixtures', 'commands', 'init')),
].filter((p) => /\.(ya?ml|md|json|txt)$/.test(p));

/** A YAML line with every leading comment marker removed ("#     # - foo" -> "    - foo"), keeping relative indentation. */
function uncomment(line: string): string {
  let l = line;
  while (/^\s*#/.test(l)) l = l.replace(/^(\s*)#+ ?/, '$1');
  return l;
}

const indentOf = (l: string) => /^ */.exec(l)?.[0].length ?? 0;

type Problem = string;

/**
 * Problems with the Cursor reviewer entries in one YAML-ish text (a YAML
 * file, a Markdown file with YAML snippets, or commented-out YAML):
 *   - every `cursor-review-prompter:` mapping must be block style, with a
 *     `model:` that is set, not null and not auto*, and a non-empty
 *     `family:`;
 *   - a text that lists `- cursor-review-prompter` as a reviewer must also
 *     carry such a mapping.
 */
function cursorEntryProblems(text: string): { problems: Problem[]; entries: number; listed: number } {
  const lines = text.split('\n').map(uncomment);
  const problems: Problem[] = [];
  let entries = 0;
  let listed = 0;
  lines.forEach((line, i) => {
    if (new RegExp(`^\\s*-\\s*${KEY}\\b`).test(line)) listed++;
    const m = new RegExp(`^(\\s*)${KEY}:\\s*(.*)$`).exec(line);
    if (!m) return;
    entries++;
    const rest = m[2].replace(/\s+#.*$/, '').trim();
    if (rest !== '') {
      problems.push(`line ${i + 1}: ${KEY} is not block style (${rest})`);
      return;
    }
    const base = m[1].length;
    const block: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === '') continue;
      if (indentOf(l) <= base) break;
      block.push(l.trim());
    }
    const field = (k: string) => {
      const f = block.map((l) => new RegExp(`^${k}:\\s*(.*)$`).exec(l)).find(Boolean);
      return f ? f[1].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '') : undefined;
    };
    const model = field('model');
    const family = field('family');
    if (model === undefined || model === '' || model === 'null' || model === '~') problems.push(`line ${i + 1}: ${KEY} has no explicit model`);
    else if (/^auto/i.test(model)) problems.push(`line ${i + 1}: ${KEY} model is ${model} (Auto is never allowed, D26)`);
    if (family === undefined || family === '' || family === 'null' || family === '~') problems.push(`line ${i + 1}: ${KEY} has no family`);
  });
  if (listed > 0 && entries === 0) problems.push(`lists ${KEY} as a reviewer without a per_reviewer.${KEY} block (model and family)`);
  return { problems, entries, listed };
}

/** JSON fixtures: every per_reviewer.cursor-review-prompter object needs a non-auto model and a family. */
function jsonProblems(value: unknown, path = '$'): Problem[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => jsonProblems(v, `${path}[${i}]`));
  if (typeof value !== 'object' || value === null) return [];
  const out: Problem[] = [];
  for (const [k, v] of Object.entries(value)) {
    if (k === 'per_reviewer' && typeof v === 'object' && v !== null && KEY in v) {
      const e = (v as Record<string, unknown>)[KEY] as Record<string, unknown> | null;
      const model = e && typeof e.model === 'string' ? e.model : '';
      if (model === '' || /^auto/i.test(model)) out.push(`${path}.per_reviewer.${KEY}: model ${JSON.stringify(e?.model)}`);
      if (!e || typeof e.family !== 'string' || e.family === '') out.push(`${path}.per_reviewer.${KEY}: no family`);
    }
    out.push(...jsonProblems(v, `${path}.${k}`));
  }
  return out;
}

describe('Task 69: Cursor reviewer examples carry an explicit model and family (D26)', () => {
  it('scans the defaults, the wizard and the init fixtures', () => {
    expect(SOURCES.some((p) => p.endsWith('defaults.yaml'))).toBe(true);
    expect(SOURCES.some((p) => p.endsWith('configure-multi-model.md'))).toBe(true);
    expect(SOURCES.filter((p) => p.includes(`${join('fixtures', 'multi-model-review', 'init')}`)).length).toBeGreaterThan(0);
  });

  it.each(SOURCES.map((p) => [relative(ROOT, p), p]))('%s: every cursor reviewer entry has block-style model (never auto*) and family', (_rel, p) => {
    const text = readFileSync(p, 'utf8');
    const problems = p.endsWith('.json') ? jsonProblems(JSON.parse(text)) : cursorEntryProblems(text).problems;
    expect(problems).toEqual([]);
  });

  describe('detector self-tests', () => {
    it('accepts a block-style entry, commented or not', () => {
      const ok = `per_reviewer:\n  ${KEY}:\n    model: claude-opus-5-thinking-high\n    family: anthropic\n`;
      expect(cursorEntryProblems(ok).problems).toEqual([]);
      const commented = ok.split('\n').map((l) => (l ? `# ${l}` : l)).join('\n');
      expect(cursorEntryProblems(commented)).toMatchObject({ problems: [], entries: 1 });
      const md = `\`\`\`yaml\n# multi_model_review:\n#   reviewers:\n#     # - ${KEY}   # Cursor\n#   per_reviewer:\n#     ${KEY}:\n#       model: gpt-5.6-sol-high   # pick a paid-plan slug\n#       family: openai\n\`\`\`\n`;
      expect(cursorEntryProblems(md)).toMatchObject({ problems: [], entries: 1, listed: 1 });
    });

    it.each([
      ['auto', `${KEY}:\n  model: auto\n  family: anthropic\n`],
      ['Auto', `${KEY}:\n  model: "Auto"\n  family: anthropic\n`],
      ['no model', `${KEY}:\n  family: anthropic\n`],
      ['null model', `${KEY}:\n  model: null\n  family: anthropic\n`],
      ['no family', `${KEY}:\n  model: claude-opus-5-thinking-high\n`],
      ['flow style', `${KEY}: { model: claude-opus-5-thinking-high, family: anthropic }\n`],
      ['a family in a sibling block', `${KEY}:\n  model: claude-opus-5-thinking-high\nother:\n  family: anthropic\n`],
      ['listed without a block', `reviewers:\n  - ${KEY}\n`],
    ])('rejects %s', (_label, text) => {
      expect(cursorEntryProblems(text).problems.length).toBeGreaterThan(0);
    });

    it('checks JSON fixtures too', () => {
      expect(jsonProblems({ per_reviewer: { [KEY]: { model: 'claude-opus-5-thinking-high', family: 'anthropic' } } })).toEqual([]);
      expect(jsonProblems({ a: { per_reviewer: { [KEY]: { model: 'auto', family: 'anthropic' } } } })).toHaveLength(1);
      expect(jsonProblems({ per_reviewer: { [KEY]: { model: 'gpt-5.2' } } })).toHaveLength(1);
    });
  });
});

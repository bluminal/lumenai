/**
 * CONTRIBUTING.md "Adding an External Source", rules 2, 3 and 6.
 *
 * Rule 2 — a project that does not use a source sees nothing. A command
 * reaches source logic only through one gate block, whose first sentence
 * tells the agent to skip the section when `external_source` is unset. This
 * suite proves the disabled path is the pre-change command:
 *
 *   1. each gated command has exactly one gate block, worded identically
 *      except for the command name;
 *   2. with that block removed, the command references nothing the feature
 *      added: not `external_source`, the shared doc, the contract, an
 *      adapter, or a source name;
 *   3. every other command, the shared agents' templates, the shipped
 *      defaults, `init`, the document templates and the linters contain no
 *      source name and no `external_source`.
 *
 * Skipping the gate therefore leaves exactly the text that existed before
 * the feature, and nothing outside the gate can reach the new code path.
 *
 * Rule 6 — the shared layer names no source. Rule 3 — no business concepts
 * in the files the source adds.
 *
 * Cost: $0 (no LLM calls)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const PLUGIN = join(ROOT, 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');

/** Commands that read or write the elements on the convention map. */
const GATED = ['next-priority', 'refine-requirements', 'write-implementation-plan', 'retrospective'];

/** Source names, derived from the adapters that exist, so a new source is covered automatically. */
const SOURCES = readdirSync(join(PLUGIN, 'agents'))
  .filter((f) => f.endsWith('-document-store.md'))
  .map((f) => f.replace(/-document-store\.md$/, ''));

const SETUP_COMMANDS = SOURCES.map((s) => `configure-${s}.md`);

const GATE_RE =
  /## External Source\n\nWhen `external_source` is unset — the default — skip this section entirely\.[^\n]*\n\n/g;

const FEATURE_REFERENCES = [
  /external_source/,
  /external-sources\.md/,
  /document-store-contract/,
  /-document-store\b/,
  /-task-store\b/,
];

const sourceNameRe = () => new RegExp(`\\b(${SOURCES.join('|')})\\b`, 'i');

function referencesFeature(text: string): string[] {
  const hits = FEATURE_REFERENCES.filter((re) => re.test(text)).map(String);
  if (sourceNameRe().test(text)) hits.push('a source name');
  return hits;
}

describe('rule 2: setup', () => {
  it('at least one source adapter exists, so the source-name checks are not vacuous', () => {
    expect(SOURCES).toContain('notion');
  });
});

describe('rule 2: one gate per gated command', () => {
  it.each(GATED)('%s has exactly one gate block', (cmd) => {
    const text = read(`commands/${cmd}.md`);
    expect(text.match(GATE_RE)?.length ?? 0).toBe(1);
  });

  it('every gate is worded identically except for the command name', () => {
    const normalized = GATED.map((cmd) => {
      const gate = read(`commands/${cmd}.md`).match(GATE_RE)![0];
      expect(gate).toContain(`its \`${cmd}\` section`);
      return gate.replace(`\`${cmd}\``, '`<command>`');
    });
    expect(new Set(normalized).size).toBe(1);
  });

  it('the gate names no source', () => {
    const gate = read(`commands/${GATED[0]}.md`).match(GATE_RE)![0];
    expect(gate).not.toMatch(sourceNameRe());
  });

  it('the gate reads the shared doc section for that command, and the section exists', () => {
    const doc = read('docs/external-sources.md');
    for (const cmd of GATED) {
      expect(read(`commands/${cmd}.md`).match(GATE_RE)![0]).toContain(
        '`${CLAUDE_PLUGIN_ROOT}/docs/external-sources.md`',
      );
      expect(doc).toContain(`### ${cmd}\n`);
    }
  });

  it.each(GATED)('%s references nothing the feature added once its gate is removed', (cmd) => {
    const stripped = read(`commands/${cmd}.md`).replace(GATE_RE, '');
    expect(referencesFeature(stripped)).toEqual([]);
  });
});

describe('rule 2: nothing else reaches the feature', () => {
  const ungated = readdirSync(join(PLUGIN, 'commands'))
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !GATED.includes(f.replace(/\.md$/, '')))
    .filter((f) => !SETUP_COMMANDS.includes(f));

  it.each(ungated)('commands/%s has no gate and no reference', (file) => {
    expect(referencesFeature(read(`commands/${file}`))).toEqual([]);
  });

  const untouched = [
    'config/defaults.yaml',
    'agents/product-manager.md',
    'commands/init.md',
    'scripts/init-scaffold.sh',
    'scripts/lint-plan.mjs',
    'docs/plan-lint-rubric.md',
    'scripts/commit-lint.sh',
    ...readdirSync(join(PLUGIN, 'templates')).map((f) => `templates/${f}`),
  ];

  it.each(untouched)('%s contains no source name and no external_source', (rel) => {
    expect(referencesFeature(read(rel))).toEqual([]);
  });

  it('defaults.yaml ships no external_source, so absent means off', () => {
    expect(read('config/defaults.yaml')).not.toMatch(/^external_source:/m);
  });

  it('init does not run source setup', () => {
    expect(read('commands/init.md')).not.toMatch(/configure-(notion|<source>)/);
  });
});

describe('rule 6: the shared layer names no source', () => {
  const shared = ['agents/_shared/document-store-contract.md', 'docs/external-sources.md'];

  it.each(shared)('%s names no source', (rel) => {
    expect(read(rel)).not.toMatch(sourceNameRe());
  });

  it('adapters are resolved by name, so a second source edits no command', () => {
    const contract = read('agents/_shared/document-store-contract.md');
    expect(contract).toMatch(/`<name>-document-store` and `<name>-task-store`/);
    expect(read('docs/external-sources.md')).toMatch(/`<source>-document-store`/);
  });

  it('every source ships both adapters and a setup command', () => {
    for (const s of SOURCES) {
      expect(readdirSync(join(PLUGIN, 'agents'))).toContain(`${s}-task-store.md`);
      expect(readdirSync(join(PLUGIN, 'commands'))).toContain(`configure-${s}.md`);
    }
  });
});

describe('rule 3: no business concepts in what a source adds', () => {
  const added = [
    'agents/_shared/document-store-contract.md',
    'docs/external-sources.md',
    ...SOURCES.flatMap((s) => [
      `agents/${s}-document-store.md`,
      `agents/${s}-task-store.md`,
      `commands/configure-${s}.md`,
    ]),
  ];

  it.each(added)('%s uses none of the organizational vocabulary', (rel) => {
    expect(read(rel)).not.toMatch(/\b(epics?|initiatives?|sprints?|squads?|workstreams?)\b/i);
  });
});

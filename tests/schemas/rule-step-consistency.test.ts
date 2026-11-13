/**
 * Cross-checks each file's procedural steps against its own behavioral rules.
 *
 * Four bugs in the Notion backend shared one shape: a file stated a rule and
 * then contradicted it a few paragraphs later in a step. The most recent was
 * `use-epic.md`, whose rule 4 forbids deriving a recorded path from a label
 * while Step 5 did exactly that for Notion-routed documents. Every existing
 * assertion passed, because they check that a file *contains* the right
 * statements — never that its procedure honours them.
 *
 * Two mechanisms here.
 *
 * 1. Structural hygiene across every file that has a rules list.
 * 2. An anchored-rule registry: each "Never ..." rule names the step that must
 *    enforce it and the text proving it does. A **completeness guard** fails
 *    when a covered file grows a "Never" rule with no registry entry, so the
 *    obligation accretes with the rules rather than rotting.
 *
 * The registry is hand-curated on purpose. Detecting arbitrary semantic
 * contradiction needs a judgement these tests cannot make; naming the specific
 * contradiction you are guarding against is what actually catches regressions.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');

/** Every file carrying a `## Behavioral Rules` section. */
function filesWithRules(): string[] {
  const out: string[] = [];
  for (const dir of ['agents', 'commands']) {
    for (const name of readdirSync(join(PLUGIN, dir))) {
      if (!name.endsWith('.md')) continue;
      const rel = `${dir}/${name}`;
      if (read(rel).includes('## Behavioral Rules')) out.push(rel);
    }
  }
  return out.sort();
}

/** The rules list body, bounded by the next top-level heading. */
function rulesBody(text: string): string {
  const start = text.indexOf('## Behavioral Rules');
  if (start < 0) return '';
  const rest = text.slice(start + '## Behavioral Rules'.length);
  const next = rest.search(/\n## [A-Z]/);
  return next < 0 ? rest : rest.slice(0, next);
}

/** Numbered rule entries, as [number, text]. */
function rules(text: string): Array<[number, string]> {
  return [...rulesBody(text).matchAll(/^(\d+)\. (.+)$/gm)].map(
    (m) => [Number(m[1]), m[2]] as [number, string],
  );
}

/** A named section's body, bounded by the next heading of the same-or-higher level. */
function section(text: string, heading: string): string {
  const at = text.indexOf(heading);
  if (at < 0) return '';
  const depth = heading.match(/^#+/)?.[0].length ?? 3;
  const rest = text.slice(at + heading.length);
  const boundary = new RegExp(`\\n#{1,${depth}} `);
  const next = rest.search(boundary);
  return next < 0 ? rest : rest.slice(0, next);
}

/**
 * Anchored rules. Each entry says: this rule must be enforced in this step,
 * and here is the text proving it. `forbidden` adds a negative check where a
 * concrete wrong-shape is worth excluding outright.
 */
type Anchor = {
  rule: RegExp;
  enforcedIn: string;
  proof: RegExp;
  forbidden?: RegExp;
};

const REGISTRY: Record<string, Anchor[]> = {
  'agents/notion-document-store.md': [
    {
      rule: /Never create as a side effect/,
      enforcedIn: '### Step 1 — Resolve the Target',
      proof: /Do \*\*not\*\* create a page as a side effect of a `read`/,
    },
    {
      rule: /Never guess a target/,
      enforcedIn: '### Step 1 — Resolve the Target',
      proof: /\*\*Never guess between multiple candidates\.\*\*/,
      forbidden: /pick the first|closest match|best guess/i,
    },
    {
      rule: /Never mutate what you did not create/,
      enforcedIn: '### Step 3 — Never Mutate Structure',
      proof: /rename, move, archive, or delete any pre-existing page/,
    },
    {
      rule: /Never drop or alter a fenced code block's language tag/,
      enforcedIn: '### Step 2 — Perform the Operation',
      proof: /\*\*Fenced code blocks pass through verbatim, language tag included\.\*\*/,
      forbidden: /strip the (?:language )?tag|normalize the fence/i,
    },
  ],

  'agents/notion-task-store.md': [
    {
      rule: /Never query or write unscoped/,
      enforcedIn: '### Step 1 — Epic Scoping Check (FR-NB4)',
      proof: /MUST NOT proceed unscoped/,
      forbidden: /fall back to an unscoped|proceed without a filter/i,
    },
    {
      rule: /Never resolve a relation reference by name without a unique exact match/,
      enforcedIn: '#### Resolve the value to something the property can filter on',
      proof: /unique exact match/,
      forbidden: /partial match is acceptable|nearest match/i,
    },
    {
      rule: /Never alter the database schema/,
      enforcedIn: '### Step 2 — Map Properties, Never Migrate Schema (FR-NB5)',
      proof: /MUST NOT\*{0,2} alter the schema|do not add a select option/,
    },
    {
      rule: /Never touch an item assigned to someone else/,
      enforcedIn: '### Step 1b — Assignee Scoping',
      proof: /not selected, not modified, and not reported/,
    },
    {
      rule: /Never derive identity from an ordinal/,
      enforcedIn: '### Step 4 — Task Identity (FR-NB7)',
      proof: /Never resolve a `task_ref` from an ordinal/,
    },
  ],

  'commands/configure-notion.md': [
    {
      rule: /Never auto-select a target/,
      enforcedIn: '### 2. Nominate Existing Targets',
      proof: /never auto-select/i,
    },
    {
      rule: /Never change a schema without explicit confirmation/,
      enforcedIn: '### 3. Epic Scoping (required for tasks)',
      proof: /needs your explicit confirmation/,
    },
    {
      rule: /Never enable tasks unscoped/,
      enforcedIn: '### 3. Epic Scoping (required for tasks)',
      proof: /do NOT write `notion\.enabled: true` for tasks/,
    },
    {
      rule: /Never derive an epic value/,
      enforcedIn: '### 3. Epic Scoping (required for tasks)',
      proof: /Leave this blank|each plan carries its own/,
    },
    {
      rule: /Never write credentials to config/,
      enforcedIn: '### 7. Write the Configuration',
      proof: /Never write a Notion API key or token/,
    },
  ],

  'commands/use-epic.md': [
    {
      rule: /Never write a document/,
      enforcedIn: '### 5. Resolve Its Documents',
      proof: /\*\*Do not create any document\.\*\*/,
    },
    {
      rule: /Never auto-select an ambiguous epic/,
      enforcedIn: '### 4. Resolve the Epic',
      proof: /\*\*Never auto-select on an ambiguous match\.\*\*/,
    },
    {
      rule: /Never store active-epic state in `\.synthex\/state\.json`/,
      enforcedIn: '## State File',
      proof: /Do not move this into `state\.json`/,
    },
    {
      rule: /Never derive a recorded path from a label after the fact/,
      enforcedIn: '#### Notion-routed types',
      proof: /do not apply the slug convention/,
      // The original bug: the Notion branch manufactured <dir>/<slug>.md.
      forbidden: /<dir>\/<slug>\.md.*Record the repo-relative path/s,
    },
    {
      rule: /Never apply a filesystem convention to a Notion-routed type/,
      enforcedIn: '#### Notion-routed types',
      proof: /Do not scan directories, and do not apply the slug convention/,
      forbidden: /scan `documents\./,
    },
    {
      rule: /Never report a document missing without checking its own backend/,
      enforcedIn: '#### Both branches',
      proof: /must have been checked against the backend it actually routes to/,
    },
  ],
};

describe('Rules and steps agree', () => {
  describe('Structural hygiene (all files with rules)', () => {
    const files = filesWithRules();

    it('finds the expected population of rule-bearing files', () => {
      expect(files.length).toBeGreaterThan(20);
    });

    it.each(filesWithRules())('%s numbers its rules contiguously from 1', (rel) => {
      // Mis-renumbering happened three times while editing these lists, twice
      // leaving a duplicate number that a careful read missed.
      const nums = rules(read(rel)).map(([n]) => n);
      // Some agents carry a rules heading with prose rather than a numbered
      // list; contiguity only applies when there IS a list.
      if (nums.length === 0) return;
      expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1));
    });

    it.each(filesWithRules())('%s has no duplicated rule', (rel) => {
      const texts = rules(read(rel)).map(([, t]) => t.replace(/\*\*/g, '').trim());
      expect(new Set(texts).size).toBe(texts.length);
    });
  });

  describe('Completeness guard', () => {
    // A covered file that grows a "Never" rule without a registry entry fails
    // here. That is the mechanism keeping this suite honest as rules are added.
    it.each(Object.keys(REGISTRY))('%s has every Never rule anchored to a step', (rel) => {
      const text = read(rel);
      const nevers = rules(text)
        .map(([, t]) => t)
        .filter((t) => /^\*\*Never/.test(t));
      expect(nevers.length).toBeGreaterThan(0);

      const unanchored = nevers.filter(
        (t) => !REGISTRY[rel].some((a) => a.rule.test(t)),
      );
      expect(
        unanchored,
        `${rel} has Never rules with no registry entry — add one naming the step that enforces each`,
      ).toEqual([]);
    });

    it.each(Object.keys(REGISTRY))('%s registry references only real rules', (rel) => {
      const text = read(rel);
      const body = rulesBody(text);
      for (const a of REGISTRY[rel]) {
        expect(body, `${rel}: registry rule ${a.rule} matches no actual rule`).toMatch(a.rule);
      }
    });
  });

  describe('Each anchored rule is honoured by its step', () => {
    const cases = Object.entries(REGISTRY).flatMap(([rel, anchors]) =>
      anchors.map((a) => [rel, a.enforcedIn, a] as [string, string, Anchor]),
    );

    it.each(cases)('%s — %s', (rel, heading, anchor) => {
      const text = read(rel);
      const body = section(text, heading);
      expect(body, `${rel}: section "${heading}" not found or empty`).not.toBe('');
      expect(
        body,
        `${rel}: "${heading}" does not honour rule ${anchor.rule} — expected ${anchor.proof}`,
      ).toMatch(anchor.proof);
    });

    const negatives = Object.entries(REGISTRY).flatMap(([rel, anchors]) =>
      anchors
        .filter((a) => a.forbidden)
        .map((a) => [rel, a.enforcedIn, a] as [string, string, Anchor]),
    );

    it.each(negatives)('%s — %s contains no contradicting shape', (rel, heading, anchor) => {
      const body = section(read(rel), heading);
      expect(
        body,
        `${rel}: "${heading}" matches ${anchor.forbidden}, which contradicts ${anchor.rule}`,
      ).not.toMatch(anchor.forbidden!);
    });
  });

  describe('The original bug would now fail', () => {
    it('use-epic Step 5 has a Notion branch at all', () => {
      // The bug was the absence of one: Step 5 resolved only on the
      // filesystem, so Notion-backed documents were reported missing.
      const step5 = section(read('commands/use-epic.md'), '### 5. Resolve Its Documents');
      expect(step5).toMatch(/#### Notion-routed types/);
      expect(step5).toMatch(/#### Filesystem-routed types/);
    });

    it('its Notion branch resolves without touching the filesystem', () => {
      const notion = section(read('commands/use-epic.md'), '#### Notion-routed types');
      expect(notion).toMatch(/is never on disk/);
      expect(notion).not.toMatch(/<slug>/);
    });
  });
});

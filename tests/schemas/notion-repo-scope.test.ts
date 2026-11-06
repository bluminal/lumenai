/**
 * FR-NB10: optional repo scoping.
 *
 * Epic scoping (FR-NB4) separates Synthex from other teams' tickets, but not
 * one epic's own tasks from each other when that epic spans more than one git
 * repository — an initiative with Firestore functions and dbt in one repo and
 * a dashboard in another is a confirmed case. Without a second filter,
 * `next-priority` run from one checkout can select a task whose code lives in
 * a different repo entirely.
 *
 * This is optional and off by default. The two things this suite protects:
 * absent, it must cost nothing (same discipline as `notion.enabled: false`);
 * present, it must be enforced with no partial credit — filtered, stamped,
 * verified on write, and never silently degraded to epic-only scoping.
 *
 * Unlike the feat/notion-backend layout, this project's next-priority
 * Notion wiring lives in the cold-path doc `docs/document-backends.md`
 * (`### next-priority`), not inline in `commands/next-priority.md` — that
 * command is already pinned at its D17 byte budget
 * (`tests/schemas/next-priority-cold-path.test.ts`), so this suite reads the
 * shared doc's per-command stanza for next-priority assertions instead.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadDefaultsYaml } from '../helpers/load-defaults';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');

describe('FR-NB10: optional repo scoping', () => {
  let contract: string;
  let taskStore: string;
  let wizard: string;
  let sharedDoc: string;
  let nextPriorityStanza: string;
  let defaults: any;

  beforeAll(async () => {
    contract = read('agents/_shared/document-store-contract.md');
    taskStore = read('agents/notion-task-store.md');
    wizard = read('commands/configure-notion.md');
    sharedDoc = read('docs/document-backends.md');
    nextPriorityStanza = sharedDoc.split('### next-priority')[1]?.split('\n### ')[0] ?? '';
    defaults = await loadDefaultsYaml();
  });

  describe('Contract states the optional guarantee', () => {
    it('has a dedicated subsection citing FR-NB10, nested under epic scoping', () => {
      expect(contract).toMatch(/^### Repo scoping \(optional, FR-NB10\)$/m);
    });

    it('states the absent case costs nothing', () => {
      expect(contract).toMatch(/a no-op/);
      expect(contract).toMatch(/[Rr]un no new logic at all/);
    });

    it('requires filtering, stamping, and write-time verification once configured', () => {
      expect(contract).toMatch(/MUST additionally filter on the configured property\/value/);
      expect(contract).toMatch(/MUST be stamped with the configured value, alongside the epic value/);
      expect(contract).toMatch(/MUST additionally verify the target row carries the configured value before writing/);
    });

    it('forbids degrading once the property is configured', () => {
      expect(contract).toMatch(/there is \*\*no degradation path\.\*\*/);
      expect(contract).toMatch(/reintroduce the exact failure this feature exists to prevent/);
    });

    it('distinguishes legacy-empty exclusion from an ordinary non-match, and requires counting it', () => {
      expect(contract).toMatch(/excluded, not matched/);
      expect(contract).toMatch(/separate from the normal "doesn't match this repo" exclusions/);
    });

    it('requires naming a cross-repo dependency rather than dropping it', () => {
      expect(contract).toMatch(/Cross-repo dependencies are named, never dropped/);
      expect(contract).toMatch(/`resolve_task_refs`.*exists to resolve exactly that ref/s);
    });

    it('states there is no filesystem-backend equivalent, and why', () => {
      expect(contract).toMatch(/No filesystem-backend equivalent/);
      expect(contract).toMatch(/[Aa] filesystem plan is already one-per-initiative-per-repo/);
    });

    it('describes the default-repo catch-all, scoped to reads only and to one repo', () => {
      expect(contract).toMatch(/`repo_scope\.default: true` flips that for exactly one repo/);
      expect(contract).toMatch(/only changes what a \*\*read\*\* matches/);
      expect(contract).toMatch(/`create_tasks` still always stamps the literal configured value regardless of `default`/);
      expect(contract).toMatch(/MUST report `repo_scope_unset_count: 0`/);
      expect(contract).toMatch(/Synthex has no mechanism to verify, and does not attempt to verify, that only one repo/);
    });

    it('adds resolve_task_refs to the task-operations table, scoped to reporting only', () => {
      expect(contract).toMatch(/`resolve_task_refs`\s*\|\s*`task_refs\[\]`/);
      expect(contract).toMatch(/deliberately bypasses the `repo_scope` filter/);
      expect(contract).toMatch(/never bypasses epic scoping/);
      expect(contract).toMatch(/never claims or writes anything/);
    });

    it('cites FR-NB10 in the source authority list', () => {
      expect(contract).toMatch(/FR-NB10 \(optional repo scoping\)/);
    });

    it('includes the new test file in the validation-surface Implemented-in line', () => {
      expect(contract).toMatch(/tests\/schemas\/notion-repo-scope\.test\.ts/);
    });
  });

  describe('Task store: Step 1c enforces it with no partial credit', () => {
    it('is a distinct step, after assignee scoping, not a renumber of it', () => {
      expect(taskStore).toMatch(/^### Step 1c — Repo Scoping \(optional, FR-NB10\)$/m);
      // Step 1b must still exist verbatim — this feature must not have
      // renumbered or replaced assignee scoping.
      expect(taskStore).toMatch(/^### Step 1b — Assignee Scoping$/m);
    });

    it('skips entirely when the property is unset', () => {
      expect(taskStore).toMatch(/When `config\.repo_scope\.property` is null — the default — skip this step entirely/);
    });

    it('fails schema_mismatch on a misconfigured property, never silently unscoped for this dimension', () => {
      expect(taskStore).toMatch(/error_code: schema_mismatch`, naming the specific failure/);
      expect(taskStore).toMatch(/no degradation path once configured/);
      expect(taskStore).toMatch(/no `strict_mode` exemption, no falling back to epic-scope-only/);
    });

    it('describes the legacy-empty count as distinct from the queue filter', () => {
      expect(taskStore).toMatch(/does not match the filter — it is unclaimed work, not this repo's work/);
      expect(taskStore).toMatch(/repo_scope_unset_count/);
    });

    it('declares resolve_task_refs in the input contract', () => {
      expect(taskStore).toMatch(/resolve_task_refs/);
      expect(taskStore).toMatch(/task_refs:\s*array\s*\(optional\)\s*—\s*required for resolve_task_refs/);
      expect(taskStore).toMatch(/repo_scope:\s*object\|null/);
    });

    it('declares the default catch-all flag and its effect on the filter and the count', () => {
      expect(taskStore).toMatch(/`default` \(bool, optional,\s*defaults false\) makes this repo the\s*implicit catch-all for rows with no value/);
      expect(taskStore).toMatch(/Exception — `config\.repo_scope\.default: true`\./);
      expect(taskStore).toMatch(/repo_scope_unset_count` is always `0` under this config/);
      expect(taskStore).toMatch(/At most one repo sharing the database should set this; you verify only your own `config`, never anyone else's/);
    });

    it('documents both filter shapes for the repo term', () => {
      const shape = taskStore.split('#### Filter shape')[1]?.split('####')[0] ?? '';
      expect(shape).toMatch(/\*\*`default: false`.*strict:\s*`<repo_scope\.property> enum_is <repo_scope\.value>`/s);
      expect(shape).toMatch(/\*\*`default: true`.*nested `or`.*is_empty/s);
      expect(shape).toMatch(/skip this second query entirely and return `repo_scope_unset_count: 0`/);
    });

    it('resolve_task_refs is read-only, epic-scoped, and never claims', () => {
      const section = taskStore.split('#### Resolving cross-repo dependency refs')[1]?.split('####')[0] ?? '';
      expect(section).toMatch(/never via a query/);
      expect(section).toMatch(/whose epic value matches `config\.epic\.value`/);
      expect(section).toMatch(/never claims, never writes, and never checks assignee eligibility/);
    });

    it('extends write-time verification to the repo dimension', () => {
      expect(taskStore).toMatch(
        /confirm its epic matches the resolved reference, its repo value matches `config\.repo_scope\.value` when Step 1c applies, and that it is assignee-eligible/,
      );
    });

    it('carries the invariant forward into the behavioral rules without weakening the first three', () => {
      const rules = taskStore.split('## Behavioral Rules')[1] ?? '';
      expect(rules).toMatch(/\*\*Never query or write unscoped\.\*\*/);
      expect(rules).toMatch(/resolve_task_refs.*never returns a ref outside the configured epic/s);
    });

    it('names repo scoping as an explicitly optional fourth dimension in the mission statement', () => {
      expect(taskStore).toMatch(/A fourth, optional dimension applies only when the project has configured it/);
    });

    it('stamps create_tasks with the repo value alongside the epic value', () => {
      const ops = taskStore.split('### Step 3 — Perform the Operation')[1]?.split('### Step 4')[0] ?? '';
      expect(ops).toMatch(/create_tasks.*stamped with the repo value too when Step 1c applies/s);
    });
  });

  describe('Wizard: optional, skippable, reuses the epic-scoping UX', () => {
    it('is its own step after assignee scoping, before property mapping', () => {
      expect(wizard).toMatch(
        /### 3c\. Repo Scoping \(optional — for an epic spanning multiple repos\)[\s\S]*### 4\. Map Properties/,
      );
    });

    it('defaults to skipped', () => {
      expect(wizard).toMatch(/No — this epic lives in one repo\.\*\*\s*\(default\)/);
    });

    it('requires explicit confirmation before adding a new property, default no', () => {
      expect(wizard).toMatch(/Add a `Repo` select property to the `<database name>` database\? This modifies a database your team shares\. \(y\/N\)/);
    });

    it('treats property and value as required together', () => {
      expect(wizard).toMatch(/The first two are required together — do not write one without the other/);
    });

    it('offers the default-repo catch-all, defaulting to no, with a one-repo warning', () => {
      expect(wizard).toMatch(/Is this the default repo for untagged work\?/);
      expect(wizard).toMatch(/No — require an explicit tag, same as any other repo\.\*\*\s*\(default\)/);
      expect(wizard).toMatch(/at most one repo sharing the database should make this choice/);
      expect(wizard).toMatch(/Synthex cannot check that from here/);
    });

    it('is reflected in the written config and the confirmation summary', () => {
      expect(wizard).toMatch(/repo_scope:\s*\n\s*property: <property name, or null>\s*\n\s*value: <this repo's value, or null>/);
      expect(wizard).toMatch(/Repo scope:\s*<repo property = value, or "not scoped/);
    });

    it('surfaces current repo_scope state on wizard re-entry', () => {
      expect(wizard).toMatch(/`repo_scope: <property = value, or "not scoped">`/);
    });
  });

  describe('next-priority stanza (docs/document-backends.md): passthrough, legacy count, and cross-repo dependency naming', () => {
    it('states repo_scope passes straight through, unlike the epic reference', () => {
      expect(nextPriorityStanza).toMatch(/Repo scoping passes straight through, unlike the epic reference/);
      expect(nextPriorityStanza).toMatch(/there is no per-plan resolution step for it/);
    });

    it('reports the legacy-unset count once per run, when non-zero', () => {
      expect(nextPriorityStanza).toMatch(/repo_scope_unset_count/);
      expect(nextPriorityStanza).toMatch(/Report that count once per run, when non-zero/);
    });

    it('resolves a cross-repo dependency by name before reporting it missing', () => {
      expect(nextPriorityStanza).toMatch(/call `resolve_task_refs` for exactly that ref/);
      expect(nextPriorityStanza).toMatch(/blocked on "<title>", scoped to a different repo \(<repo_scope_value>\)/);
    });

    it('gates the resolve_task_refs call so it never runs as a matter of course', () => {
      expect(nextPriorityStanza).toMatch(
        /Only call `resolve_task_refs` when `notion\.repo_scope\.property` is set and a ref is actually absent from the queue — never as a matter of course/,
      );
    });

    it('adds the operation to the task-store table, scoped to the repo-active case', () => {
      expect(nextPriorityStanza).toMatch(
        /\| Step 1 — name a cross-repo dependency \| `resolve_task_refs` \(only when repo scoping is active and a dependency ref is absent from the queue\) \|/,
      );
    });

    it('marks list_tasks as additionally repo-filtered when configured, without losing the epic-filtered baseline', () => {
      expect(nextPriorityStanza).toMatch(/`list_tasks` \(epic-filtered, additionally repo-filtered when configured\)/);
    });
  });

  describe('Shared mechanics doc links the rule rather than restating it normatively', () => {
    it('notes the passthrough in the general task-specifics list and points at the contract', () => {
      expect(sharedDoc).toMatch(/Repo scoping \(optional, FR-NB10\) passes straight from config, unlike the epic reference/);
      expect(sharedDoc).toContain('_shared/document-store-contract.md');
    });
  });

  describe('defaults.yaml: off by default, documented, no filesystem equivalent', () => {
    it('declares notion.repo_scope with property/value null and default false', () => {
      expect(defaults.notion.repo_scope).toEqual({ property: null, value: null, default: false });
    });

    it('is a map, not a list — same discipline as backend_overrides and property_map', () => {
      expect(Array.isArray(defaults.notion.repo_scope)).toBe(false);
      expect(typeof defaults.notion.repo_scope).toBe('object');
    });

    it('documents the static-per-checkout nature and the lack of a filesystem equivalent in comments', () => {
      const yamlText = read('config/defaults.yaml');
      expect(yamlText).toMatch(/this value is NOT read from the plan/);
      expect(yamlText).toMatch(/No filesystem-backend equivalent/);
    });
  });

  describe('docs/reqs/notion-backend.md: FR-NB10 entry', () => {
    it('adds a dedicated FR-NB10 requirement between FR-NB9 and the NFRs', () => {
      const reqs = readFileSync(
        join(import.meta.dirname, '..', '..', 'docs', 'reqs', 'notion-backend.md'),
        'utf8',
      );
      expect(reqs).toMatch(/^### FR-NB10: Optional repo scoping$/m);
      expect(reqs).toMatch(/second, optional, independent equality filter ANDed onto the epic filter/);
      expect(reqs).toMatch(/no filesystem-backend equivalent, since a filesystem plan is already one-per-initiative-per-repo/);
    });
  });

  describe('Gated behind explicit "when configured" language — the absent case is a no-op by construction', () => {
    it.each([
      ['notion-task-store', () => taskStore],
      ['next-priority stanza', () => nextPriorityStanza],
    ])('%s gates every repo_scope behavior on it being configured', (_name, get) => {
      const text = get();
      expect(text).toMatch(/repo_scope\.property.*(?:is set|is null|applies)/);
    });
  });
});

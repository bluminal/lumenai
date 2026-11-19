/**
 * PRD authoring pipeline: /synthex:write-prd, prd-linter, provenance tagging,
 * and source ingestion.
 *
 * The point of the design is that a command can be easy to invoke without
 * producing an unearned document. Two mechanisms carry that, and both are
 * asserted here:
 *
 *   - Supplied sources change what the interview is ABOUT rather than
 *     replacing it, so grounding reduces effort instead of lowering the bar.
 *   - Every requirement records where it came from, so fabrication is visible
 *     and countable rather than indistinguishable from research.
 *
 * Cost: $0 (no LLM calls — pure file assertions)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadDefaultsYaml, loadDefaultsYamlText } from '../helpers/load-defaults';

const PLUGIN = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(PLUGIN, rel), 'utf8');
// Per-command backend prose moved to the cold path (commands sit at their D17
// byte budgets); assertions about it read the doc, not the command.
const backendDoc = read('docs/document-backends.md');

const TAGS = ['[S]', '[U]', '[D]', '[A]'] as const;

describe('PRD authoring pipeline', () => {
  let cmd: string;
  let linter: string;
  let pm: string;
  let assembler: string;
  let init: string;
  let cfg: any;
  let cfgText: string;

  beforeAll(async () => {
    cmd = read('commands/write-prd.md');
    linter = read('docs/prd-lint-rubric.md');
    pm = read('agents/product-manager.md');
    assembler = read('scripts/assemble-bundle.sh');
    init = read('commands/init.md');
    cfg = await loadDefaultsYaml();
    cfgText = loadDefaultsYamlText();
  });

  // 'Work items are linked back into the plan table' moved: that prose now lives in the cold-path
  // docs/document-backends.md per-command stanza (commands sit at their
  // D17 byte budgets), and the assembler's source mode is covered
  // executably by assemble-bundle-behavioral.test.ts.


  describe('Registration', () => {

    it('write-prd precedes write-implementation-plan in the manifest', () => {
      // Authoring order: a plan consumes a PRD, so the PRD command comes first.
      const m = JSON.parse(read('.claude-plugin/plugin.json'));
      expect(m.commands.indexOf('./commands/write-prd.md')).toBeLessThan(
        m.commands.indexOf('./commands/write-implementation-plan.md'),
      );
    });
  });

  describe('Sources change the interview rather than replacing it', () => {
    it('states the commitment up front', () => {
      expect(cmd).toMatch(
        /source documents change what the interview is about; they do not replace it/i,
      );
    });

    it('accepts repeatable --from taking paths, globs, dirs, and URLs', () => {
      expect(cmd).toMatch(/`--from <path>`/);
      expect(cmd).toMatch(/Repeatable/);
      expect(cmd).toMatch(/a file, a glob, a directory, a URL, or a Notion page URL/);
    });

    it('auto-discovers repo sources before asking for any', () => {
      // "No flags" must not mean "blank prompt" — the repo is a source set.
      expect(cmd).toMatch(/Auto-discover first/);
      for (const f of ['README.md', 'CLAUDE.md', 'package.json', 'docs/specs/']) {
        expect(cmd, `auto-discovery omits ${f}`).toContain(f);
      }
    });

    it('never asks what it can read from the codebase', () => {
      expect(cmd).toMatch(/never ask what you can read/);
    });

    it('delegates reading to the bundle assembler rather than reimplementing it', () => {
      expect(cmd).toMatch(/scripts\/assemble-bundle\.sh assemble/);
      expect(cmd).toMatch(/--source <path>/);
      expect(cmd).toMatch(/what could not be read, with a reason/);
    });

    it('sets expectations differently with and without sources', () => {
      expect(cmd).toMatch(/I'll draft from these and ask only about\s+what they don't settle/);
      expect(cmd).toMatch(/This will be a longer interview/);
    });

    it('teaches --from at the moment it is relevant', () => {
      expect(cmd).toMatch(/This is where `--from` gets taught/);
    });

    it('refuses to silently proceed past an unreadable source', () => {
      expect(cmd).toMatch(/If a supplied source cannot be read/);
      expect(cmd).toMatch(/Do not silently proceed/);
    });
  });

  describe('The epic reference has an origin', () => {
    // Before this, nothing created the reference: write-prd said "resolve the
    // epic_page doc type" without saying how, and write-implementation-plan
    // read it from a line it then set itself. Every artifact inherited from
    // something nothing produced.
    let wip: string;
    beforeAll(() => {
      wip = read('commands/write-implementation-plan.md');
    });

    it('write-prd declares itself the origin', () => {
      expect(cmd).toMatch(/\*\*This command originates the epic reference\.\*\*/);
      expect(cmd).toMatch(/nothing upstream can supply it/);
    });

    it('takes an --epic parameter', () => {
      expect(cmd).toMatch(/`--epic <url\\\|id>`/);
    });

    it('resolves in a stated order, ending in asking', () => {
      const step = cmd.split('#### 1a. Resolve the epic')[1]?.split('#### 1b.')[0] ?? '';
      expect(step).toMatch(/`--epic`, when supplied/);
      expect(step).toMatch(/existing PRD's `\*\*Epic:\*\*` link/);
      expect(step).toMatch(/`notion\.epic\.value` from config/);
      expect(step).toMatch(/\*\*Ask\.\*\*/);
    });

    it('never auto-selects, even on a single match', () => {
      expect(cmd).toMatch(/Never auto-select, even on a single match/);
    });

    it('verifies the epic by fetching it before proceeding', () => {
      expect(cmd).toMatch(/Verify the resolved epic by fetching it/);
      expect(cmd).toMatch(/rather than proceeding with an unverified anchor/);
    });

    it('records it in the PRD so the plan inherits it', () => {
      expect(cmd).toMatch(/is written into the PRD as its `\*\*Epic:\*\*` link/);
      expect(cmd).toMatch(/that record is how `write-implementation-plan` learns which epic/);
    });

    it('the plan reads it from the PRD rather than re-asking', () => {
      expect(backendDoc).toMatch(/Resolve the epic from \*\*the PRD's\*\* `\*\*Epic:\*\*` link/);
      expect(backendDoc).toMatch(/\*\*Copy the epic reference onto the plan\.\*\*/);
      expect(backendDoc).toMatch(/rather than asking the user/);
    });

    it('explains why re-asking is the hazard', () => {
      expect(backendDoc).toMatch(
        /re-asking something already recorded is how two artifacts end up pointing at different epics/,
      );
    });

    it('the plan asks only when the PRD has no link', () => {
      expect(backendDoc).toMatch(/Ask the user only when the PRD has no `\*\*Epic:\*\*` link/);
    });

    it('does not apply under the filesystem backend', () => {
      expect(cmd).toMatch(/Under `filesystem` this step does not apply — there is no epic/);
    });
  });

  describe('Discovery precedes specification', () => {
    it('command establishes the why before requirements', () => {
      expect(cmd).toMatch(/^### 5\. Establish the Why$/m);
      expect(cmd).toMatch(/^#### 5c\. Author it through discovery$/m);
      expect(cmd).toMatch(/prerequisite for requirements/);
    });

    it('establishes the epic page sections', () => {
      for (const t of ['Why this exists', "How we'll know it worked", 'Out of scope']) {
        expect(pm, `epic page template omits ${t}`).toContain(t);
      }
    });

    it('states where discovery output lands per backend', () => {
      expect(cmd).toMatch(/\*\*Where it lands depends on the backend\.\*\*/);
      expect(cmd).toMatch(/there is no landing page/);
    });

    it('has a floor that stops rather than drafting on nothing', () => {
      // The anti-slop floor: no sources plus no answers means there is nothing
      // to write a PRD from.
      expect(cmd).toMatch(/\*\*Floor condition\.\*\*/);
      expect(cmd).toMatch(/\*\*stop and report what is missing\.\*\* Do not draft/);
      expect(cmd).toMatch(/failure this command exists to prevent/);
    });

    it('product-manager carries the same floor', () => {
      expect(pm).toMatch(/^## Discovery Before Specification$/m);
      expect(pm).toMatch(/If you cannot establish vision, users, and at least one scope boundary, stop/);
      expect(pm).toMatch(/becomes a feature list/);
    });

    it('offers deepening techniques rather than interrogating', () => {
      for (const t of ['Pre-mortem', 'Negative space', 'Socratic', 'Inversion']) {
        expect(pm, `techniques omit ${t}`).toContain(t);
      }
      expect(pm).toMatch(/Offer them as options rather than interrogating/);
    });

    it('--epic-only stops once the epic page is established', () => {
      expect(cmd).toMatch(/`--epic-only`/);
      expect(cmd).toMatch(/\*\*If `--epic-only`:\*\* stop here/);
    });

    it('--epic-only reports rather than writing a file on the filesystem', () => {
      // There is no landing page in a repo, so there is nothing for it to write.
      expect(cmd).toMatch(/`--epic-only` is not applicable and should report as much rather than writing a file nobody opens/);
    });
  });

  describe('Provenance is required and blocking', () => {
    it('product-manager defines all four tags with a required source line', () => {
      expect(pm).toMatch(/^## Provenance Tagging$/m);
      for (const t of TAGS) {
        expect(pm, `PM omits ${t}`).toContain(t);
      }
      expect(pm).toMatch(/Sourced/);
      expect(pm).toMatch(/User-stated/);
      expect(pm).toMatch(/Derived/);
      expect(pm).toMatch(/Assumed/);
    });

    it('states why tagging exists at all', () => {
      expect(pm).toMatch(/fabrication is \*\*visible and countable\*\*/);
      expect(pm).toMatch(/mostly `\[A\]` is self-evidently unearned/);
    });

    it('forbids assumptions surviving into a final PRD', () => {
      expect(pm).toMatch(/No `\[A\]` survives into a final PRD/);
    });

    it('forbids invention, routing unknowns to Open Questions', () => {
      expect(pm).toMatch(/Never invent an answer/);
      expect(pm).toMatch(/it goes in Open Questions/);
    });

    it('forbids silently reconciling contradicting sources', () => {
      // The highest-value slop: it looks like a decision was made.
      expect(pm).toMatch(/Never silently reconcile contradicting sources/);
      expect(pm).toMatch(/looks like a decision was made/);
      expect(cmd).toMatch(/never reconcile silently/);
    });

    it('requires a citation to be specific enough to check', () => {
      expect(pm).toMatch(/"From the meeting notes" is not a citation/);
    });

    it('PRD template carries the legend, tags, Source line, and Source Map', () => {
      expect(pm).toMatch(/\*\*Provenance:\*\*/);
      expect(pm).toMatch(/#### FR-\[ID\]: \[Requirement Title\] `\[S\]`/);
      expect(pm).toMatch(/\*\*Source:\*\*/);
      // Matched by name: the two PRD shapes number sections differently, and
      // inserting a section renumbers both.
      expect(pm).toMatch(/^## \d+\. Source Map$/m);
      expect(pm).toMatch(/^## \d+\. Open Questions$/m);
      expect(pm).toMatch(/\*\*Epic:\*\*/);
    });
  });

  describe('The epic page is Notion-only', () => {
    it('contract explains the landing-page constraint as its cause', () => {
      const contract = read('agents/_shared/document-store-contract.md');
      expect(contract).toMatch(/^### The epic page, and why it is Notion-only$/m);
      expect(contract).toMatch(/resolves to the epic row \*\*itself\*\*/);
      expect(contract).toMatch(/`notion\.targets\.epic_page` is meaningless/);
      expect(contract).toMatch(/the page you land on must not be the page that changes fastest/);
    });

    it('does not exist under the filesystem backend', () => {
      const contract = read('agents/_shared/document-store-contract.md');
      expect(contract).toMatch(/A repository has no landing page/);
      expect(contract).toMatch(/`epic_page` is not a valid `doc_type`/);
    });

    it('leaves no filesystem config key behind', () => {
      // The vestigial documents.brief was a file mirroring a Notion affordance.
      expect(cfg.documents).not.toHaveProperty('brief');
      expect(cfg.documents).not.toHaveProperty('epic_page');
    });

    it('is a patch target, never a write target', () => {
      // A whole-page write would discard body content Synthex did not author.
      const contract = read('agents/_shared/document-store-contract.md');
      expect(contract).toMatch(/It is a `patch` target, never a `write` target/);
      expect(cmd).toMatch(/always written with `patch`, never `write`/);
    });

    it('document store records the exception in its title table', () => {
      const ds = read('agents/notion-document-store.md');
      expect(ds).toMatch(/resolves to the epic page \*\*itself\*\*, not a subpage/);
      expect(ds).toMatch(/\| \*\*Epic-scoped\*\* \| `epic_page`,/);
      expect(ds).toMatch(/exists only under the `notion` backend/);
    });
  });

  describe('Existing content is refined, never discarded', () => {
    it('treats a populated body as input rather than an obstacle', () => {
      expect(pm).toMatch(/^### Refining a populated epic page$/m);
      expect(pm).toMatch(/it is \*\*input, not an obstacle\.\*\*/);
      expect(cmd).toMatch(/The existing content is input, not an obstacle/);
    });

    it('maps visibly, then asks about gaps and leftovers', () => {
      for (const text of [pm, cmd]) {
        expect(text).toMatch(/\*\*Map\*\*/);
        expect(text).toMatch(/Ask about gaps/);
        expect(text).toMatch(/Ask about leftovers/);
      }
      expect(pm).toMatch(/Mapping is a claim about their writing/);
    });

    it('forbids silently dropping existing content', () => {
      // The failure mode of any standardization pass.
      for (const text of [pm, cmd]) {
        expect(text).toMatch(/Never silently drop existing content/);
      }
      expect(pm).toMatch(/Additional context/);
      expect(pm).toMatch(/not a recoverable mistake/);
    });

    it('does not treat prior Synthex output as a convention', () => {
      // An epic asserting its own authority proves nothing if Synthex wrote it.
      expect(pm).toMatch(/content Synthex itself wrote earlier is not evidence of a convention/i);
      expect(pm).toMatch(/Check provenance before deferring/);
    });

    it('checks for loss rather than assuming none, via prior_content', () => {
      // The script cannot compare two prose documents for meaning
      // (reconciliation #2), so write-prd owns the check as an instruction.
      expect(cmd).toMatch(/The script cannot check whether a refinement lost content/);
      expect(cmd).toMatch(/compare against what you read in Step 5a/);
    });

    it('says so rather than implying a pass when prior content is absent', () => {
      expect(linter).toMatch(/Say these were skipped rather than implying they passed/);
      expect(linter).toMatch(/lost any claim from its prior content/);
    });

    it('requires approval before writing back', () => {
      for (const text of [pm, cmd]) {
        expect(text).toMatch(/get approval\*{0,2} before writing/);
      }
    });
  });

  describe('Navigation and freshness in the epic body', () => {
    // Designed against an observed failure: a stakeholder opened an epic,
    // missed the subpages beneath it, and read the body's detail as evidence
    // it was the live plan. It was stale. Detail implied freshness because
    // nothing else carried that signal.
    let np: string;
    let contract: string;
    beforeAll(() => {
      np = read('commands/next-priority.md');
      contract = read('agents/_shared/document-store-contract.md');
    });

    it('brief template carries a navigation section', () => {
      expect(pm).toMatch(/^## Where the detail lives$/m);
    });

    it('it sits directly after the problem statement, above the fold', () => {
      const whyPos = pm.indexOf('## Why this exists');
      const navPos = pm.indexOf('## Where the detail lives');
      const measuresPos = pm.indexOf("## How we'll know it worked");
      expect(whyPos).toBeGreaterThan(-1);
      expect(navPos).toBeGreaterThan(whyPos);
      expect(navPos).toBeLessThan(measuresPos);
      expect(pm).toMatch(/above the fold/);
    });

    it('routes to all three live artifacts', () => {
      const nav = pm.split('## Where the detail lives')[1]?.split("## How we'll know")[0] ?? '';
      expect(nav).toMatch(/Product Requirements/);
      expect(nav).toMatch(/Implementation Plan/);
      expect(nav).toMatch(/Work items/);
    });

    it('each route carries a current-state signal', () => {
      const nav = pm.split('## Where the detail lives')[1]?.split("## How we'll know")[0] ?? '';
      expect(nav).toMatch(/Current state/);
      expect(nav).toMatch(/updated \d{4}-\d{2}-\d{2}/);
      expect(nav).toMatch(/Phase 2 of 6/);
    });

    it('states the wrong inference not to make, verbatim', () => {
      const disclaimer = 'This page is a summary, not the plan. For current status, follow the links above.';
      expect(pm).toContain(disclaimer);
      expect(cmd).toContain(disclaimer);
      expect(pm).toMatch(/its bluntness is the point/);
    });

    it('marks the section as Synthex-owned', () => {
      expect(pm).toMatch(/Maintained by Synthex — edits here are overwritten/);
    });

    it('records the failure it was designed against', () => {
      for (const [name, text] of [
        ['product-manager', pm],
        ['contract', contract],
        ['write-prd', cmd],
      ] as const) {
        expect(text, `${name} omits the observed failure`).toMatch(
          /stale|did not notice|missed the/i,
        );
      }
      expect(pm).toMatch(/Detail read as freshness/);
    });
  });

  describe('Volatile content is excluded from the epic body', () => {
    it('states the rule as a testable predicate', () => {
      expect(pm).toMatch(/^### Phases and other volatile content$/m);
      expect(pm).toMatch(/do \*\*not\*\* belong on the epic page/);
    });

    it('names the consequence of breaking it', () => {
      expect(pm).toMatch(/putting them on the landing page is the failure above/);
    });

    it('carves out the navigation block as the sole exception', () => {
      expect(cmd).toMatch(/only volatile content permitted in an epic body/);
      expect(pm).toMatch(/Never strip such content without a verified destination/);
    });

    it('requires a verified destination before relocating', () => {
      // The rule previously named an exit without an entrance, which on a real
      // project would have deleted the only copy of Phases 2-6.
      for (const [name, text] of [['product-manager', pm], ['write-prd', cmd]] as const) {
        expect(text, `${name} omits the destination requirement`).toMatch(
          /verified destination|Relocation requires a destination/,
        );
      }
      expect(cmd).toMatch(/Naming an exit without an entrance is prescribed data loss/);
      expect(pm).toMatch(/report the required sequence and stop/);
    });

    it('names the plan as the destination, at two resolutions', () => {
      expect(pm).toMatch(/all phases named with their outcome, and only committed phases decomposed/);
      expect(pm).toMatch(/Detail follows commitment/);
    });

    it('linter flags volatile content outside the navigation block as CRITICAL', () => {
      expect(linter).toMatch(/No status, date, count, task, or milestone outside `## Where the detail lives` \| CRITICAL \|/);
    });

    it('linter reports misplaced content rather than relocating it', () => {
      expect(linter).toMatch(/\*\*Report it; never move it yourself, and never delete it\.\*\*/);
    });

    it('linter treats a missing navigation section as CRITICAL', () => {
      expect(linter).toMatch(/`## Where the detail lives` present \| CRITICAL \|/);
    });

    it('write-prd redirects volatile discovery output rather than filing it', () => {
      expect(cmd).toMatch(/\*\*Everything else on the epic page must be non-volatile\.\*\*/);
      expect(cmd).toMatch(/say so rather than filing it here/);
    });
  });

  describe('next-priority keeps the freshness block current', () => {
    let np: string;
    beforeAll(() => {
      np = read('commands/next-priority.md');
    });

    it('refreshes it at the end of the run', () => {
      expect(backendDoc).toMatch(/Refresh the epic's navigation block once, at the end of the run/);
    });

    it('updates phase, counts, and dates', () => {
      expect(backendDoc).toMatch(/updating the phase, the done\/total task counts/);
    });

    it('is once per run, not per task', () => {
      // A write per status transition churns page history for no added signal.
      expect(backendDoc).toMatch(/\*\*Once per run, not per task\.\*\*/);
      expect(backendDoc).toMatch(/churn the page history for no added signal/);
    });

    it('updates even when the run ends with work outstanding', () => {
      // A partially-finished run is when someone is most likely to look.
      expect(backendDoc).toMatch(/including when the run ends with tasks still open/);
      expect(backendDoc).toMatch(/most likely to go looking/);
    });

    it('patches rather than replacing the body', () => {
      expect(backendDoc).toMatch(/Use `patch`, never `write`: the rest of the body is the team's/);
    });

    it('explains why keeping it current is not cosmetic', () => {
      expect(backendDoc).toMatch(/makes staleness visible instead of invisible/);
    });
  });

  describe('PRD has two shapes, one per backend', () => {
    it('documents both shapes and why they differ', () => {
      expect(pm).toMatch(/^### Filesystem backend — self-contained$/m);
      expect(pm).toMatch(/^### Notion backend — requirements, with the why on the epic page$/m);
      expect(pm).toMatch(
        /the same information placed where that backend's readers actually arrive/,
      );
    });

    it('filesystem shape keeps the why sections', () => {
      const fs = pm.split('### Filesystem backend')[1]?.split('### Notion backend')[0] ?? '';
      for (const s of ['Vision & Purpose', 'Target Users', 'Out of Scope', 'Success Metrics']) {
        expect(fs, `filesystem shape omits ${s}`).toContain(s);
      }
    });

    it('notion shape drops exactly the three moved sections', () => {
      const nt = pm.split('### Notion backend — requirements')[1] ?? '';
      const shape = nt.split('```')[1] ?? '';
      for (const gone of ['Vision & Purpose', 'Out of Scope', 'Success Metrics']) {
        expect(shape, `notion shape still contains ${gone}`).not.toContain(gone);
      }
    });

    it('keeps Target Users in the PRD under both shapes', () => {
      // The epic page carries the audience as a clause; detailed personas are
      // requirements context. This is what dissolves the overlap a real run hit.
      const nt = pm.split('### Notion backend — requirements')[1] ?? '';
      expect(nt).toMatch(/\*\*Target Users stays here\*\*/);
      expect(nt.split('```')[1] ?? '').toContain('Target Users');
    });

    it('notion shape opens with an Epic link', () => {
      expect(pm).toMatch(/\*\*Epic:\*\* \[link to the epic page\]/);
    });

    it('accepts the not-readable-alone cost only for the notion shape', () => {
      expect(pm).toMatch(/a PRD is not readable alone, and that is the accepted cost/);
      expect(pm).toMatch(/one authoritative home per fact/);
    });

    it('linter conditions the shape on epic_page_present', () => {
      expect(linter).toMatch(/when an epic page holds the why \| HIGH \|/);
      expect(linter).toMatch(/when there \*\*is\*\* an epic page \| MEDIUM \|/);
    });

    it('linter requires Target Users under either shape', () => {
      expect(linter).toMatch(/`Target Users \/ Personas` present under either shape \| HIGH \|/);
    });

    it('command passes the shape flag to the linter', () => {
      expect(cmd).toMatch(/--epic-page-present/);
      expect(cmd).toMatch(/so the right PRD shape is applied/);
    });

    it('command tells the PM not to re-ask what discovery settled', () => {
      expect(cmd).toMatch(/Do \*\*not\*\* re-ask what discovery already answered/);
    });
  });

  // The PRD Linter's rubric is now scripts/lint-prd.mjs, with
  // docs/prd-lint-rubric.md as its no-node prose twin (FR-HM26). What these
  // tests asserted as prose -- severities, the blocking [A] policy, citation
  // checks, the report's shape -- is covered executably by the 41 subprocess
  // tests in lint-prd.test.ts, which is a stronger guarantee than asserting
  // that a markdown file describes the behaviour. Only the rubric's prose
  // twin is checked here, so the two cannot silently diverge.
  describe('PRD lint rubric (prose twin of scripts/lint-prd.mjs)', () => {
    it('restates the blocking assumption policy', () => {
      expect(linter).toMatch(/No `\[A\]` survives, under the default blocking policy \| CRITICAL \|/);
    });

    it('restates the citation checks', () => {
      expect(linter).toMatch(/names a document \*\*and\*\* a location within it \| HIGH \|/);
      expect(linter).toMatch(/does not cite a source that could not be read \| HIGH \|/);
    });

    it('requires Out of Scope to be non-empty', () => {
      expect(linter).toMatch(/`## Out of scope` present and non-empty \| HIGH \|/);
    });

    it('names what it deliberately does not check rather than implying a pass', () => {
      expect(linter).toMatch(/## What this rubric deliberately does not check/);
      expect(linter).toMatch(/Say these were skipped rather than implying they passed/);
    });

    it('is reachable without node, and is not a registered command', () => {
      expect(linter).toMatch(/No-shell prose fallback/);
      expect(linter).toMatch(/never registered in `plugin\.json`/);
    });
  });

  describe('Reuses the existing quality pipeline', () => {
    it('lints before expensive reviewers, with the reason stated', () => {
      expect(cmd).toMatch(/scripts\/lint-prd\.mjs/);
      expect(cmd).toMatch(/command -v node/);
      expect(cmd).toMatch(/docs\/prd-lint-rubric\.md/);
    });

    it('hands off to refine-requirements rather than adding a review stack', () => {
      expect(cmd).toMatch(/\/synthex:refine-requirements/);
    });

    it('resolves every CRITICAL including unconfirmed assumptions', () => {
      expect(cmd).toMatch(/must resolve \*\*every CRITICAL\*\*/);
      expect(cmd).toMatch(/confirming it with the user, grounding it in a source, or demoting it to an Open Question/);
    });

    it('surfaces provenance counts to the user at the end', () => {
      expect(cmd).toMatch(/Surfacing the provenance counts is the point of tagging/);
    });
  });

  describe('Does not clobber an existing PRD', () => {
    it('decides what the run is doing before touching anything', () => {
      expect(cmd).toMatch(/^### 1\. Decide What This Run Is Doing$/m);
      expect(cmd).toMatch(/do \*\*not\*\* overwrite it/);
      expect(cmd).toMatch(/Write a sub-PRD/);
    });

    it('requires named confirmation for the destructive option', () => {
      expect(cmd).toMatch(/destructive and its confirmation must name the file/);
      expect(cmd).toMatch(/never take it as a default/i);
    });

    it('branches on what actually exists rather than on the PRD alone', () => {
      const step = cmd.split('### 1. Decide What This Run Is Doing')[1]?.split('### 2.')[0] ?? '';
      expect(step).toMatch(/\| Epic page \| PRD \| Action \|/);
      expect(step).toMatch(/absent or n\/a \| absent/);
    });
  });

  describe('Regenerating the epic on an established project', () => {
    // The question this closes: a project whose PRD and plan already exist,
    // whose epic body has drifted or was never standardized.
    let np: string;
    beforeAll(() => {
      np = read('commands/next-priority.md');
    });

    it('--epic-only bypasses the PRD gate entirely', () => {
      // Previously Step 1 ran unconditionally, so asking for just the brief
      // prompted about the PRD, and none of the options was "just the brief".
      expect(cmd).toMatch(/If `--epic-only` is set, skip the PRD entirely/);
      expect(cmd).toMatch(/it is not this run's concern/);
    });

    it('names the established-project case explicitly', () => {
      expect(cmd).toMatch(
        /standardizing or refreshing an epic on a project whose PRD and plan already exist/,
      );
    });

    it('surfaces the refresh option where a user would look for it', () => {
      expect(cmd).toMatch(/\*\*Refresh the epic page\*\*/);
      expect(cmd).toMatch(/Leaves the PRD alone/);
      expect(cmd).toMatch(/discoverable from the command you would naturally reach for/);
    });

    it('next-priority does not inject a block into a free-form body', () => {
      expect(backendDoc).toMatch(/\*\*When the section does not exist\*\*/);
      expect(backendDoc).toMatch(/do not inject it/);
      expect(backendDoc).toMatch(/Run \/synthex:write-prd --epic-only to standardize it/);
    });

    it('explains why restructuring belongs to write-prd, not to a task run', () => {
      expect(backendDoc).toMatch(/where the user is present to approve the mapping/);
      expect(backendDoc).toMatch(/a task-execution command is the wrong place to make that call/);
    });

    it('inserts the block only into an already-standard body', () => {
      expect(backendDoc).toMatch(/Insert it only when the body is already in standard epic-page shape/);
      expect(backendDoc).toMatch(/directly after `## Why this exists`/);
    });
  });

  // 'Source-set mode in the bundle assembler' moved: that prose now lives in the cold-path
  // docs/document-backends.md per-command stanza (commands sit at their
  // D17 byte budgets), and the assembler's source mode is covered
  // executably by assemble-bundle-behavioral.test.ts.


  describe('Configuration', () => {
    it('defines the prd block with blocking assumptions by default', () => {
      expect(cfg.prd).toEqual({
        max_source_bytes: 200000,
        max_file_bytes: 40000,
        assumption_policy: 'blocking',
      });
    });

    it('documents why blocking is the default', () => {
      expect(cfgText).toMatch(
        /indistinguishable from a fabricated one to whoever\s*#?\s*builds from it/,
      );
    });

    it('documents every prd subkey with an inline comment', () => {
      const lines = cfgText.split('\n');
      for (const key of ['max_source_bytes:', 'max_file_bytes:', 'assumption_policy:']) {
        const idx = lines.findIndex((l) => l.trimStart().startsWith(key));
        expect(idx, `missing ${key}`).toBeGreaterThan(0);
        expect(lines.slice(Math.max(0, idx - 10), idx).join('\n')).toMatch(/#/);
      }
    });
  });

  describe('init points at the right command', () => {
    it('no longer claims write-implementation-plan creates a PRD', () => {
      // The previous text sent new users to a command that only reads a PRD.
      expect(init).not.toMatch(/Create your PRD with the `write-implementation-plan` command/);
    });

    it('directs users to write-prd and teaches --from', () => {
      expect(init).toMatch(/Create your PRD:\s+\/write-prd/);
      expect(init).toMatch(/Pass --from <paths>/);
    });

    it('lists write-prd among available commands', () => {
      expect(init).toMatch(/\/write-prd\s+— Author a PRD/);
    });
  });

  describe('Notion backend integration', () => {
    it('wires through the document-store contract', () => {
      expect(cmd).toMatch(/^## Document Backend$/m);
      expect(cmd).toContain('../docs/document-backends.md');
      expect(cmd).toMatch(/skip this section entirely/);
      expect(cmd).toContain('FR-NB2');
    });

    it('places the PRD as the epic Product Requirements subpage', () => {
      expect(cmd).toMatch(/`Product Requirements` subpage of its epic/);
      expect(cmd).toMatch(/schema_mismatch/);
    });

    it('accepts Notion pages as source material', () => {
      expect(cmd).toMatch(/`--from` accepts Notion page URLs/);
    });

    it('creates rather than overwrites', () => {
      expect(cmd).toMatch(/use `create`, not `write`/);
    });
  });
});

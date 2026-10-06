/**
 * multi-model-review Task 70 (D24, D26, D35, D41–D43): the configure-multi-model
 * wizard, the defaults.yaml examples and the docs know about the Grok and
 * Cursor proposers.
 *
 * Layer 1 only: the wizard is prose, so these checks pin its definition, the
 * init fixtures that describe its outcomes, and the shipped config examples.
 * Nothing here runs grok or cursor-agent. The U23 check runs config-get.sh,
 * the same reader both runners use, against a throwaway project config.
 *
 * Criteria (docs/plans/multi-model-review.md, Task 70):
 *   - Step 1a: grok and cursor-agent candidates (never `agent`), runner
 *     --auth-check lines each followed by the other-hosts sentence, the
 *     CLI-to-adapter mapping table, `reviewers` holds adapter names, exit
 *     codes 0/10/11/12 for these two CLIs.
 *   - Step 1b: a "detected — opt in manually" listing shown as text; Cursor
 *     always (D43); grok on exit 12 and on SYNTHEX_HOST=grok; Option 1 writes
 *     only authenticated, non-manual CLIs; AskUserQuestion count <= 5.
 *   - FR-MR27 additions; Option 2 snippet lines; init fixtures match.
 *   - defaults.yaml examples and aggregator pinning comment; tier_table and
 *     the D17 chain unchanged; nothing rejects allow_api_key_billing (U23).
 *   - Docs rows (README, CLAUDE.md, start-review-team.md, docs/testing.md).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const ROOT = join(__dirname, '..', '..');
const PLUGIN = join(ROOT, 'plugins', 'synthex');
const WIZARD_PATH = join(PLUGIN, 'commands', 'configure-multi-model.md');
const DEFAULTS_PATH = join(PLUGIN, 'config', 'defaults.yaml');
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'multi-model-review', 'init');
const CONFIG_GET = join(PLUGIN, 'scripts', 'lib', 'config-get.sh');

const wizard = readFileSync(WIZARD_PATH, 'utf8');
const defaults = readFileSync(DEFAULTS_PATH, 'utf8');

/** Canonical other-hosts sentence (single source: portability-prose.test.ts). */
const OTHER_HOSTS_SCRIPT_SENTENCE =
  'On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if ' +
  '`${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: ' +
  '`plugin_root` from `.synthex/state.json`, else the directory two levels ' +
  'above the wrapper you were loaded from.';

/** The text of one `#### <id>` subsection of the wizard, up to the next `####`/`###`. */
function subsection(id: string): string {
  const start = wizard.indexOf(`#### ${id}`);
  expect(start, `#### ${id}`).toBeGreaterThan(-1);
  const rest = wizard.slice(start + 1);
  const next = rest.search(/\n#{3,4} /);
  return next === -1 ? wizard.slice(start) : wizard.slice(start, start + 1 + next);
}

/** The blank-line-delimited paragraph that contains `needle`. */
function paragraphOf(text: string, needle: string): string {
  const i = text.indexOf(needle);
  expect(i, needle).toBeGreaterThan(-1);
  const start = text.lastIndexOf('\n\n', i);
  const end = text.indexOf('\n\n', i);
  return text.slice(start === -1 ? 0 : start + 2, end === -1 ? text.length : end);
}

/** The wizard's CLI-to-adapter mapping table, parsed. */
function mappingTable(): Record<string, string> {
  const s = subsection('1a.');
  const table = s.slice(s.indexOf('**CLI-to-adapter mapping.**'));
  const map: Record<string, string> = {};
  for (const m of table.matchAll(/^\| `([a-z-]+)` \| `([a-z]+-review-prompter)` \|$/gm)) map[m[1]] = m[2];
  return map;
}

/** The Option 2 snippet (the wizard's only ```yaml block). */
function wizardSnippet(): string {
  const m = /```yaml\n([\s\S]*?)```/.exec(wizard);
  expect(m).not.toBeNull();
  return m![1];
}

/** Remove one level of `# ` comment from every line ("#   a: 1" -> "  a: 1"). */
function uncommentOnce(text: string, indent = ''): string {
  return text
    .split('\n')
    .map((l) => (l.startsWith(`${indent}#`) ? indent + l.slice(indent.length + 1).replace(/^ /, '') : l))
    .join('\n');
}

const EXPECTED_MAPPING: Record<string, string> = {
  codex: 'codex-review-prompter',
  gemini: 'gemini-review-prompter',
  ollama: 'ollama-review-prompter',
  llm: 'llm-review-prompter',
  aws: 'bedrock-review-prompter',
  claude: 'claude-review-prompter',
  grok: 'grok-review-prompter',
  'cursor-agent': 'cursor-review-prompter',
};

// ── Step 1a ─────────────────────────────────────────────────────────────────

describe('Task 70 Step 1a: grok and cursor-agent detection', () => {
  const s1a = subsection('1a.');

  it('the candidate list gains grok and cursor-agent', () => {
    expect(s1a).toContain('`[codex, gemini, ollama, llm, aws, claude, grok, cursor-agent]`');
  });

  it('presence checks are `command -v grok` and `command -v cursor-agent`', () => {
    expect(s1a).toMatch(/^\| `grok` \| `command -v grok` \|/m);
    expect(s1a).toMatch(/^\| `cursor-agent` \| `command -v cursor-agent` \|/m);
  });

  it('never checks for or runs a binary named `agent` (it can be Grok\'s)', () => {
    expect(wizard).not.toMatch(/\b(?:which|command -v)\s+agent\b/);
    expect(wizard).not.toMatch(/`agent (?:status|login|-p)\b/);
    expect(s1a).toMatch(/Never check for, or run, a binary named `agent`/);
  });

  it.each([
    ['grok', '"${CLAUDE_PLUGIN_ROOT}/scripts/adapters/grok-review.sh" --auth-check'],
    ['cursor-agent', '"${CLAUDE_PLUGIN_ROOT}/scripts/adapters/cursor-review.sh" --auth-check'],
  ])('%s auth is checked through its runner, followed by the canonical other-hosts sentence', (_cli, call) => {
    expect(s1a).toContain(call);
    expect(paragraphOf(s1a, call)).toContain(OTHER_HOSTS_SCRIPT_SENTENCE);
  });

  it('the runners named in the wizard exist and their headers document exits 0, 10, 11 and 12', () => {
    for (const r of ['grok-review.sh', 'cursor-review.sh']) {
      const p = join(PLUGIN, 'scripts', 'adapters', r);
      expect(existsSync(p), r).toBe(true);
      const src = readFileSync(p, 'utf8');
      for (const code of ['0', '10', '11', '12']) expect(src, `${r} exit ${code}`).toMatch(new RegExp(`^#\\s+${code} - `, 'm'));
    }
  });

  it('reads exit codes 0, 10, 11 and 12 for these two CLIs', () => {
    expect(s1a).toMatch(/For `grok` and `cursor-agent`, read the runner's exit code \(exit codes 0, 10, 11 and 12\)/);
    expect(s1a).toMatch(/^- \*\*0\*\* — authenticated/m);
    // grok exit 0 also covers an opted-in XAI_API_KEY (grok-review.sh auth_probe), billed per token
    const zero = /^- \*\*0\*\* — (.*)$/m.exec(s1a)?.[1] ?? '';
    expect(zero).toContain('`XAI_API_KEY` with `per_reviewer.grok-review-prompter.allow_api_key_billing: true`, which bills per token');
    expect(s1a).toMatch(/^- \*\*10\*\* — the binary is not on PATH: treat as not-detected/m);
    expect(s1a).toMatch(/^- \*\*11\*\* — not authenticated/m);
    const twelve = /^- \*\*12\*\* — (.*)$/m.exec(s1a)?.[1] ?? '';
    expect(twelve).toContain('per_reviewer.grok-review-prompter.allow_api_key_billing');
    expect(twelve).toContain('XAI_API_KEY');
    expect(twelve).toContain('per_reviewer.cursor-review-prompter.model');
    expect(twelve).toContain('CURSOR_API_KEY');
    expect(twelve).toMatch(/non-Auto/);
    // the Cursor key-only case names Cursor's own opt-in, and exit 12 only ever means the manual bucket
    expect(twelve).toContain('only `CURSOR_API_KEY` is available and `per_reviewer.cursor-review-prompter.allow_api_key_billing` is not `true`');
    expect(twelve).toContain('Exit 12 always lands in the manual bucket, never in detected-and-authenticated.');
    expect(twelve).toContain('the check has not seen the login state');
  });

  it('the four buckets are a partition: manual wins, and exit 12 never reaches the authenticated bucket', () => {
    expect(s1a).toContain('Each CLI lands in exactly one group; a CLI that matches the manual bucket goes there and nowhere else');
    const authed = /^- \*\*detected-and-authenticated\*\* — (.*)$/m.exec(s1a)?.[1] ?? '';
    expect(authed).toContain('both exited 0');
    expect(authed).toContain('and the CLI is not in the manual bucket below');
    expect(authed).not.toMatch(/\b12\b/);
    const unauth = /^- \*\*detected-but-unauthenticated\*\* — (.*)$/m.exec(s1a)?.[1] ?? '';
    expect(unauth).toContain('and the CLI is not in the manual bucket below');
    expect(unauth).toContain('`cursor-agent` never lands here');
    expect(unauth).not.toMatch(/cursor-agent[^.]*exit 11/);
    expect(unauth).not.toMatch(/\b12\b/);
  });

  it('keeps the exit-0-only rule for the six older CLIs', () => {
    expect(s1a).toMatch(/For the first six CLIs, auth checks that exit 0 are treated as authenticated/);
  });

  it('has the CLI-to-adapter mapping table, and every adapter in it exists and is registered', () => {
    expect(mappingTable()).toEqual(EXPECTED_MAPPING);
    const plugin = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
    const registered = JSON.stringify(plugin.agents);
    for (const adapter of Object.values(EXPECTED_MAPPING)) {
      expect(existsSync(join(PLUGIN, 'agents', `${adapter}.md`)), adapter).toBe(true);
      expect(registered, adapter).toContain(`${adapter}.md`);
    }
  });

  it('says `reviewers` holds adapter names, not CLI names (Step 1a and Step 1d)', () => {
    expect(s1a).toContain('`multi_model_review.reviewers` holds adapter names, not CLI names');
    const s1d = subsection('1d.');
    expect(s1d).toContain('`reviewers` holds adapter names, never CLI names');
    expect(s1d).toContain('`multi_model_review.reviewers: [<adapter names>]`');
    // the old wording wrote CLI names
    expect(wizard).not.toContain('reviewers: [<authenticated CLIs only>]');
    expect(wizard).not.toContain('[<ONLY authenticated CLIs by name>]');
  });

  it('defines the manual opt-in bucket: Cursor always, grok on exit 12 or SYNTHEX_HOST=grok', () => {
    const bucket = /^- \*\*detected — opt in manually\*\* — (.*)$/m.exec(s1a)?.[1] ?? '';
    expect(bucket).toContain('`cursor-agent` whenever it is detected, whatever its auth exit (D43)');
    expect(bucket).toContain('`grok` on auth exit 12');
    expect(bucket).toContain('`grok` whenever the host id is `grok`');
  });

  it('takes the host id from the host (the wrapper\'s SYNTHEX_HOST step), not from a separate environment read', () => {
    const host = paragraphOf(s1a, '**Host id (for Step 1b).**');
    expect(host).toContain("the id the wrapper's `SYNTHEX_HOST` step tells you to export (`grok` when you run in Grok Build");
    expect(host).toContain('on Claude Code it is empty');
    expect(host).toContain('Export it in the same Bash command as the runner auth checks');
    expect(host).toContain('Do not decide it from a separate `echo $SYNTHEX_HOST`');
    expect(wizard).not.toMatch(/read `SYNTHEX_HOST` from the environment/);
    // the wrapper step the wizard points at really exists for the Grok host
    const wrapper = readFileSync(join(PLUGIN, 'portable-skills', 'configure-multi-model', 'SKILL.md'), 'utf8');
    expect(wrapper).toMatch(/export `SYNTHEX_HOST=<id>` for the current host \([^)]*`grok`/);
  });
});

// ── Step 1b ─────────────────────────────────────────────────────────────────

describe('Task 70 Step 1b: "detected — opt in manually" listing', () => {
  const s1b = subsection('1b.');
  const listing = paragraphOf(s1b, '**Detected — opt in manually.**') + '\n' + s1b.slice(s1b.indexOf('**Detected — opt in manually.**'));
  const manualLines = listing.split('\n').filter((l) => /^- `(grok|cursor-agent)`/.test(l));

  it('is shown as text, not as a new option (still exactly 3 numbered options)', () => {
    expect(listing).toContain('print this listing as plain text before the question. It is NOT an option and adds no question');
    const options = s1b.split('\n').filter((l) => /^> \d+\. /.test(l));
    expect(options).toHaveLength(3);
    expect(options.join('\n')).not.toMatch(/opt in manually/i);
  });

  it('prints both text listings before the question, so the billing and plan notes are read before choosing', () => {
    expect(s1b).toContain('Print the two text listings below as plain text BEFORE asking the question, so the user reads them before choosing.');
    expect(wizard).not.toContain('after the options');
    // the instruction comes before both listings it governs
    const before = s1b.indexOf('BEFORE asking the question');
    expect(before).toBeLessThan(s1b.indexOf('surface them SEPARATELY'));
    expect(before).toBeLessThan(s1b.indexOf('**Detected — opt in manually.**'));
  });

  it('lists Cursor always, with the model/family instruction, the paid-plan note and the login step (D43)', () => {
    expect(listing).toContain('`cursor-agent` is always listed when detected (D43)');
    expect(listing).toContain('for `cursor-agent`, exactly one of its four lines');
    const cursor = manualLines.find((l) => l.startsWith('- `cursor-agent` without both model and family in the config (any auth exit)'));
    expect(cursor).toBeDefined();
    expect(cursor).toContain('per_reviewer.cursor-review-prompter.model');
    expect(cursor).toContain('.family');
    expect(cursor).toContain('never auto');
    expect(cursor).toContain('Named models need a paid Cursor plan');
    expect(cursor).toContain('the auth check cannot see the plan');
    // the guard runs before `cursor-agent status`, so the login state is unknown here
    expect(cursor).toContain('run cursor-agent login if you are not logged in');
    expect(cursor).toContain('the auth check stops before it can see your login');
  });

  it('gives the right Cursor line once model and family are set: exit 0, 11 and 12', () => {
    const line = (exit: number) => manualLines.find((l) => l.startsWith(`- \`cursor-agent\` with model and family set, auth exit ${exit}:`));
    expect(line(0)).toContain('add cursor-review-prompter to reviewers');
    expect(line(0)).toContain('Named models need a paid Cursor plan');
    expect(line(11)).toContain('Run cursor-agent login');
    expect(line(12)).toContain('only CURSOR_API_KEY is available');
    expect(line(12)).toContain('Run cursor-agent login');
    expect(line(12)).toContain('per_reviewer.cursor-review-prompter.allow_api_key_billing: true');
    expect(line(12)).toContain('billed per request');
    // exactly the four Cursor cases, no more
    const cases = [
      '- `cursor-agent` without both model and family in the config (any auth exit):',
      ...[0, 11, 12].map((exit) => `- \`cursor-agent\` with model and family set, auth exit ${exit}:`),
    ];
    const cursorLines = manualLines.filter((l) => l.startsWith('- `cursor-agent`'));
    expect(cursorLines.map((l) => cases.find((c) => l.startsWith(c)))).toEqual(cases);
  });

  it('lists grok on auth exit 12 with the opt-in instruction and its billing consequence', () => {
    const grok12 = manualLines.find((l) => l.startsWith('- `grok` on auth exit 12'));
    expect(grok12).toBeDefined();
    expect(grok12).toContain('grok login');
    expect(grok12).toContain('per_reviewer.grok-review-prompter.allow_api_key_billing: true');
    expect(grok12).toContain('billed per token');
  });

  it('lists grok when SYNTHEX_HOST=grok, with the self-review note (D24)', () => {
    const host = manualLines.find((l) => l.startsWith('- `grok` when the host id is `grok` (self-review note)'));
    expect(host).toBeDefined();
    expect(host).toContain('this session runs on Grok');
    expect(host).toContain('no family diversity');
  });

  it('flags an opted-in grok API key in the Option 1 label (exit 0 can mean per-token billing)', () => {
    expect(s1b).toContain('When the config sets `per_reviewer.grok-review-prompter.allow_api_key_billing: true`, show grok in the label as `grok (may bill XAI_API_KEY per token)`.');
  });

  it('Option 1 writes only detected, authenticated, non-manual CLIs', () => {
    expect(s1b).toMatch(/never a manual opt-in CLI/);
    expect(listing).toContain('Option 1 never adds anything in it');
    expect(subsection('1d.')).toContain(
      'Do NOT include detected-but-unauthenticated CLIs or manual opt-in CLIs in this list.'
    );
  });

  it('keeps the AskUserQuestion count at most 5', () => {
    expect((wizard.match(/AskUserQuestion/g) ?? []).length).toBeLessThanOrEqual(5);
  });

  it('a re-run keeps manual opt-in adapters already in reviewers, and says so', () => {
    const s1d = subsection('1d.');
    const keep = /^ {3}- \*\*Re-run: keep manual opt-ins\.\*\* (.*)$/m.exec(s1d)?.[1] ?? '';
    expect(keep).toContain('`cursor-review-prompter`; `grok-review-prompter` when grok is in that bucket');
    expect(keep).toContain('write the authenticated adapters first, then each kept entry in its existing order, without duplicates');
    expect(keep).toContain('`Kept cursor-review-prompter (manual opt-in)`');
    expect(keep).toContain('the wizard never removes it');
    // Step 0's re-run option and Option 1's label both point at the rule
    expect(wizard).toContain('overwrite `multi_model_review.reviewers`, keeping any manual opt-in adapter already in the list (Step 1d)');
    expect(s1b).toContain('a re-run also keeps manual opt-in adapters already in `reviewers`; Step 1d');
  });
});

// ── Step 1c: FR-MR27 ────────────────────────────────────────────────────────

describe('Task 70 Step 1c: FR-MR27 warning additions', () => {
  const s1c = subsection('1c.');
  const warning = s1c
    .split('\n')
    .filter((l) => l.startsWith('>'))
    .join('\n');

  it('names xAI and Cursor as providers', () => {
    expect(warning).toContain('(OpenAI, Google, xAI, Cursor, etc.)');
  });

  it('describes Cursor\'s second hop and billing, including the ~16k-token overhead and (NO ZDR) models', () => {
    expect(warning).toMatch(/\*\*Cursor is a second hop\.\*\*/);
    expect(warning).toContain('both Cursor\'s and that vendor\'s terms apply');
    expect(warning).toContain('`(NO ZDR)`');
    expect(warning).toMatch(/\*\*Cursor billing\.\*\*/);
    expect(warning).toContain('about 16k tokens');
    expect(warning).toContain('retries included');
  });

  it('says Grok user and plugin hooks in $GROK_HOME run once per review (D35)', () => {
    expect(warning).toContain('Grok user and plugin hooks in `$GROK_HOME` run once per Grok review');
  });

  it('says the user\'s Cursor-loaded hooks, apparently including Claude Code hooks, run once per Cursor review (D41)', () => {
    expect(warning).toContain('Hooks your Cursor loads, apparently including Claude Code hooks, run once per Cursor review');
  });

  it('says Cursor stores a transcript and chat copy under ~/.cursor, which the runner deletes after the run (D42)', () => {
    expect(warning).toContain('Cursor stores a transcript and a chat copy of each review under `~/.cursor`');
    expect(warning).toContain('the runner deletes that run\'s entries after the run');
  });

  it('keeps the original warning text and its placement before the write', () => {
    expect(warning).toContain('**Heads up — data transmission**');
    expect(warning).toContain('Synthex does not store, log, or modify this content');
    expect(warning).toContain('configure ONLY local-model adapters');
  });
});

// ── Option 2 snippet and init fixtures ─────────────────────────────────────

describe('Task 70 Option 2 snippet', () => {
  const snippet = wizardSnippet();

  it('has commented grok and cursor reviewer lines', () => {
    expect(snippet).toMatch(/^#\s+#\s*- grok-review-prompter\b/m);
    expect(snippet).toMatch(/^#\s+#\s*- cursor-review-prompter\b/m);
  });

  it('has block-style per_reviewer.cursor-review-prompter model and family placeholders and allow_api_key_billing: false for both', () => {
    expect(snippet).toMatch(/^#\s+cursor-review-prompter:\s*$/m);
    const parsed = parseYaml(uncommentOnce(snippet)) as {
      multi_model_review: { per_reviewer: Record<string, Record<string, unknown>>; aggregator: { command: string } };
    };
    const per = parsed.multi_model_review.per_reviewer;
    expect(per['grok-review-prompter']).toEqual({ allow_api_key_billing: false });
    const cursor = per['cursor-review-prompter'];
    expect(typeof cursor.model).toBe('string');
    expect(cursor.model as string).not.toMatch(/^auto/i);
    expect(typeof cursor.family).toBe('string');
    expect((cursor.family as string).length).toBeGreaterThan(0);
    expect(cursor.allow_api_key_billing).toBe(false);
    expect(parsed.multi_model_review.aggregator.command).toBe('auto');
  });

  it('warns on the aggregator line that a flagship Cursor reviewer can win auto, and points at pinning', () => {
    expect(snippet).toMatch(
      /^# {5}command: auto {3}# a Cursor reviewer with a flagship slug can win auto; pin another adapter \(see defaults\.yaml\)$/m
    );
  });

  it('the init fixture\'s expected-snippet.yaml is byte-identical to the wizard snippet', () => {
    expect(readFileSync(join(FIXTURES, 'enabled-later-with-snippet', 'expected-snippet.yaml'), 'utf8')).toBe(snippet);
  });
});

describe('Task 70 init fixtures match the wizard', () => {
  interface Fixture {
    scenario: string;
    user_choice: number;
    synthex_host: string;
    detection_results: {
      detected_and_authenticated: string[];
      detected_opt_in_manually: { cli: string; auth_exit: number }[];
      not_detected: string[];
    };
    expected_config_writes: Record<string, unknown>;
    existing_config?: { multi_model_review?: { reviewers?: string[] } };
    expected_kept_manual?: string[];
    expected_confirmation_includes?: string[];
    expected_manual_listing_includes?: string[];
    expected_yaml_snippet_includes_commented_reviewers?: string[];
  }
  const dirs = readdirSync(FIXTURES).filter((d) => existsSync(join(FIXTURES, d, 'fixture.json')));
  const fixtures = dirs.map((d) => JSON.parse(readFileSync(join(FIXTURES, d, 'fixture.json'), 'utf8')) as Fixture);
  const map = mappingTable();
  const s1b = subsection('1b.');

  it('includes the grok-host self-review and re-run scenarios', () => {
    expect(dirs).toEqual(
      expect.arrayContaining(['enabled-with-detected', 'enabled-later-with-snippet', 'skip', 'grok-host-self-review', 'rerun-keeps-manual'])
    );
  });

  it.each(fixtures.map((f) => [f.scenario, f]))('%s: every fixture records the manual bucket and the host', (_s, f) => {
    expect(Array.isArray(f.detection_results.detected_opt_in_manually)).toBe(true);
    expect(typeof f.synthex_host).toBe('string');
  });

  it.each(fixtures.map((f) => [f.scenario, f]))('%s: cursor-agent is never auto-enrolled; grok is manual on exit 12 or a Grok host', (_s, f) => {
    const d = f.detection_results;
    expect(d.detected_and_authenticated).not.toContain('cursor-agent');
    const manual = d.detected_opt_in_manually.map((m) => m.cli);
    // a detected cursor-agent always lands in the manual bucket (D43)
    if (!d.not_detected.includes('cursor-agent')) expect(manual).toContain('cursor-agent');
    for (const m of d.detected_opt_in_manually.filter((x) => x.cli === 'grok')) {
      expect(m.auth_exit === 12 || f.synthex_host === 'grok').toBe(true);
    }
    if (f.synthex_host === 'grok') expect(d.detected_and_authenticated).not.toContain('grok');
  });

  it.each(fixtures.filter((f) => f.user_choice === 1).map((f) => [f.scenario, f]))(
    '%s: Option 1 writes the adapter names of authenticated, non-manual CLIs only',
    (_s, f) => {
      const authed = f.detection_results.detected_and_authenticated.map((cli) => map[cli]);
      expect(authed.every(Boolean)).toBe(true);
      // Step 1d re-run rule: keep a manual-bucket adapter that is already in reviewers, after the authenticated ones
      const existing = f.existing_config?.multi_model_review?.reviewers ?? [];
      const manualAdapters = f.detection_results.detected_opt_in_manually.map((m) => map[m.cli]);
      const kept = existing.filter((a) => manualAdapters.includes(a) && !authed.includes(a));
      expect(f.expected_kept_manual ?? []).toEqual(kept);
      expect(f.expected_config_writes['multi_model_review.reviewers']).toEqual([...authed, ...kept]);
      for (const a of manualAdapters.filter((x) => !kept.includes(x))) {
        expect(f.expected_config_writes['multi_model_review.reviewers']).not.toContain(a);
      }
      for (const k of kept) expect(f.expected_confirmation_includes ?? []).toContain(`Kept ${k} (manual opt-in)`);
    }
  );

  it.each(fixtures.filter((f) => f.expected_manual_listing_includes).map((f) => [f.scenario, f]))(
    '%s: the manual-listing strings the fixture expects appear in the wizard\'s Step 1b listing',
    (_s, f) => {
      for (const s of f.expected_manual_listing_includes!) expect(s1b, s).toContain(s);
    }
  );

  it('the re-run fixture starts from a hand-added cursor-review-prompter and keeps it', () => {
    const f = fixtures.find((x) => x.scenario === 'rerun-keeps-manual')!;
    expect(f).toBeDefined();
    expect(f.existing_config?.multi_model_review?.reviewers).toContain('cursor-review-prompter');
    expect(f.detection_results.detected_opt_in_manually.map((m) => m.cli)).toContain('cursor-agent');
    expect(f.expected_config_writes['multi_model_review.reviewers']).toContain('cursor-review-prompter');
    for (const s of f.expected_confirmation_includes ?? []) expect(subsection('1d.'), s).toContain(s.replace(/^Kept (\S+) .*/, 'Kept $1'));
  });

  it('the snippet fixture expects the grok and cursor commented reviewers', () => {
    const f = fixtures.find((x) => x.scenario === 'enabled-later-with-snippet')!;
    expect(f.expected_yaml_snippet_includes_commented_reviewers).toEqual(
      expect.arrayContaining(['grok-review-prompter', 'cursor-review-prompter'])
    );
  });
});

// ── defaults.yaml ───────────────────────────────────────────────────────────

describe('Task 70 defaults.yaml examples', () => {
  const parsed = parseYaml(defaults) as {
    multi_model_review: {
      reviewers: unknown[];
      per_reviewer: unknown;
      aggregator: { command: string; tier_table: unknown[] };
      external_permission_mode: Record<string, string>;
    };
  };

  /** The commented `per_reviewer:` example block, uncommented one level. */
  function perReviewerExample(): Record<string, Record<string, unknown>> {
    const lines = defaults.split('\n');
    const start = lines.findIndex((l) => l === '  per_reviewer:');
    expect(start).toBeGreaterThan(-1);
    const block: string[] = [];
    for (let i = start + 1; i < lines.length && lines[i].trim() !== ''; i++) block.push(lines[i]);
    const yaml = 'per_reviewer:\n' + uncommentOnce(block.join('\n'), '    ');
    return (parseYaml(yaml) as { per_reviewer: Record<string, Record<string, unknown>> }).per_reviewer;
  }

  it('has commented reviewer examples for grok and cursor (and the live list stays empty)', () => {
    expect(defaults).toMatch(/^ {2}# {3}- grok-review-prompter\s+#/m);
    expect(defaults).toMatch(/^ {2}# {3}- cursor-review-prompter\s+#/m);
    expect(parsed.multi_model_review.reviewers).toEqual([]);
    expect(parsed.multi_model_review.per_reviewer).toBeNull();
  });

  it('has block-style per_reviewer examples for grok and cursor', () => {
    expect(defaults).toMatch(/^ {4}# cursor-review-prompter:\s*$/m);
    expect(defaults).toMatch(/^ {4}# grok-review-prompter:\s*$/m);
    const per = perReviewerExample();
    expect(per['grok-review-prompter']).toEqual({ allow_api_key_billing: false });
    expect(per['cursor-review-prompter'].model).toMatch(/^[a-z0-9.-]+$/);
    expect(per['cursor-review-prompter'].model as string).not.toMatch(/^auto/i);
    expect(per['cursor-review-prompter'].family).toBe('openai');
    expect(per['cursor-review-prompter'].allow_api_key_billing).toBe(false);
    // the pre-existing examples still parse
    expect(per['codex-review-prompter']).toEqual({ model: 'gpt-5', family: 'openai' });
  });

  it('the grok example says family defaults to xai only for an unset or grok-* model (grok-review.sh)', () => {
    expect(defaults).toContain(
      '    #   # model: unset uses the account default; family defaults to xai\n' +
        '    #   # (a model not starting grok- gives unknown unless you set family).\n'
    );
    const runner = readFileSync(join(PLUGIN, 'scripts', 'adapters', 'grok-review.sh'), 'utf8');
    expect(runner).toMatch(/""\|grok-\*\) FAMILY="xai" ;;\s*\n\s*\*\) FAMILY="unknown" ;;/);
  });

  it('has the aggregator pinning comment (why Cursor/Grok should not be the aggregator unless pinned)', () => {
    const agg = defaults.slice(defaults.indexOf('  aggregator:\n'), defaults.indexOf('    command: auto\n'));
    expect(agg).toContain('Pinning (multi-model-review D31)');
    expect(agg).toMatch(/Grok's\s*\n?\s*#?\s*family \(xai\) has no row/);
    expect(agg).toContain('cursor-review-prompter configured with a flagship slug');
    expect(agg).toMatch(/second hop/);
    expect(agg).toMatch(/Neither Cursor nor Grok\s*\n\s*#\s*should be the aggregator unless you pin it/);
    expect(agg).toContain('#   command: codex-review-prompter');
    expect(parsed.multi_model_review.aggregator.command).toBe('auto');
  });

  it('leaves tier_table and the D17 chain unchanged', () => {
    expect(parsed.multi_model_review.aggregator.tier_table).toEqual([
      { tier: 1, family: 'anthropic', model: 'claude-opus-4-7' },
      { tier: 2, family: 'openai', model: 'gpt-5' },
      { tier: 3, family: 'anthropic', model: 'claude-sonnet-5' },
      { tier: 4, family: 'google', model: 'gemini-2.5-pro' },
      { tier: 5, family: 'local-deepseek', model: 'deepseek-v3' },
      { tier: 6, family: 'local-qwen', model: 'qwen-32b' },
    ]);
    expect(defaults).toContain('    # Claude Opus > GPT-5 > Claude Sonnet > Gemini 2.5 Pro > DeepSeek V3 > Qwen 32B.\n');
  });

  it('keeps grok and cursor read-only in external_permission_mode', () => {
    expect(parsed.multi_model_review.external_permission_mode.grok).toBe('read-only');
    expect(parsed.multi_model_review.external_permission_mode.cursor).toBe('read-only');
  });
});

// ── U23: nothing rejects allow_api_key_billing ──────────────────────────────

describe('Task 70 U23: no validator rejects per_reviewer.<id>.allow_api_key_billing', () => {
  function walk(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  }
  const CODE = [
    ...walk(join(PLUGIN, 'scripts')),
    ...walk(join(PLUGIN, 'workflows')),
    ...walk(join(PLUGIN, 'hooks')),
    ...walk(join(ROOT, 'tests', 'schemas')).filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts')),
  ].filter((p) => !/\.(md|ya?ml|txt)$/.test(p));

  // Any mention of the bare key counts (dot, colon, bracket, optional chaining or a
  // quoted string); per_reviewer_results / per_reviewer_timeout_seconds do not.
  const PER_REVIEWER = /\bper_reviewer\b(?!_)/;

  it('the reader pattern catches dot, bracket, optional-chaining and quoted access', () => {
    for (const src of [
      'cfg.multi_model_review.per_reviewer.x',
      "cfg.multi_model_review['per_reviewer']?.[id]",
      'mmr.per_reviewer?.[id]',
      'mmr.per_reviewer[id]',
      'const k = "per_reviewer";',
      'per_reviewer:',
    ]) {
      expect(PER_REVIEWER.test(src), src).toBe(true);
    }
    for (const src of ['per_reviewer_results', 'per_reviewer_timeout_seconds']) expect(PER_REVIEWER.test(src), src).toBe(false);
  });

  it('the only code that reads per_reviewer.<id> keys is the two runners, and both read allow_api_key_billing', () => {
    const readers = CODE.filter((p) => PER_REVIEWER.test(readFileSync(p, 'utf8'))).map((p) => relative(ROOT, p));
    expect(readers.sort()).toEqual([
      'plugins/synthex/scripts/adapters/cursor-review.sh',
      'plugins/synthex/scripts/adapters/grok-review.sh',
    ]);
    for (const r of readers) {
      expect(readFileSync(join(ROOT, r), 'utf8')).toMatch(/per_reviewer\.[a-z-]+-review-prompter\.allow_api_key_billing/);
    }
  });

  it('config-get.sh (the runners\' reader) resolves allow_api_key_billing from a project config built from the defaults example', () => {
    const proj = mkdtempSync(join(tmpdir(), 'synthex-u23-'));
    try {
      mkdirSync(join(proj, '.synthex'));
      const lines = defaults.split('\n');
      const start = lines.findIndex((l) => l === '  per_reviewer:');
      const block: string[] = [];
      for (let i = start + 1; i < lines.length && lines[i].trim() !== ''; i++) block.push(lines[i]);
      const example = uncommentOnce(block.join('\n'), '    ').replace(/allow_api_key_billing: false/g, 'allow_api_key_billing: true');
      writeFileSync(join(proj, '.synthex', 'config.yaml'), `multi_model_review:\n  per_reviewer:\n${example}\n`);
      const get = (key: string) =>
        spawnSync('bash', [CONFIG_GET, key, 'unset'], {
          env: { ...process.env, CLAUDE_PROJECT_DIR: proj },
          encoding: 'utf8',
        });
      for (const id of ['grok-review-prompter', 'cursor-review-prompter']) {
        const r = get(`multi_model_review.per_reviewer.${id}.allow_api_key_billing`);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout.trim()).toBe('true');
      }
      expect(get('multi_model_review.per_reviewer.cursor-review-prompter.family').stdout.trim()).toBe('openai');
      // the project file is still a valid config as a whole
      expect(() => parseYaml(readFileSync(join(proj, '.synthex', 'config.yaml'), 'utf8'))).not.toThrow();
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });
});

// ── Docs ────────────────────────────────────────────────────────────────────

describe('Task 70 docs', () => {
  it('docs/multi-model-review/README.md adapter row lists grok and cursor', () => {
    const readme = readFileSync(join(ROOT, 'docs', 'multi-model-review', 'README.md'), 'utf8');
    const row = readme.split('\n').find((l) => l.startsWith('| Adapter (one per provider) |'));
    expect(row).toBeDefined();
    expect(row).toContain('`grok-review-prompter`');
    expect(row).toContain('`cursor-review-prompter`');
  });

  it.each([
    ['grok-review-prompter', 'family `xai`'],
    ['cursor-review-prompter', 'family from config'],
  ])('root CLAUDE.md Utility Layer has a %s row matching the adapter frontmatter and tier', (adapter, family) => {
    const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
    const utility = claude.slice(claude.indexOf('### Utility Layer'), claude.indexOf('## Commands'));
    const row = utility.split('\n').find((l) => l.startsWith(`| \`${adapter}\` |`));
    expect(row).toBeDefined();
    const md = readFileSync(join(PLUGIN, 'agents', `${adapter}.md`), 'utf8');
    expect(md).toMatch(/^model: haiku$/m);
    expect(md).toMatch(/capability_tier:\*\* `text-only`/);
    expect(row).toMatch(/^\| `[a-z-]+` \| Haiku-backed; .*\(`text-only` tier; .*\) \| Utility \|$/);
    expect(row).toContain(family);
  });

  it('start-review-team.md roster includes grok and cursor', () => {
    const srt = readFileSync(join(PLUGIN, 'commands', 'start-review-team.md'), 'utf8');
    expect(srt).toContain('(codex, claude, gemini, bedrock, llm, ollama, grok, cursor —');
  });

  it('start-review-team Step 5a never warns or prompts for a grok/cursor sandbox-yolo (a read-only alias, D29)', () => {
    const srt = readFileSync(join(PLUGIN, 'commands', 'start-review-team.md'), 'utf8');
    const step = srt.slice(srt.indexOf('### Step 5a.'), srt.indexOf('### Step 6'));
    expect(step).toContain('**grok and cursor never count as `sandbox-yolo` here.**');
    expect(step).toContain('print the info line `<cli-name> sandbox-yolo runs as read-only (D29)` instead of the warning, and do not prompt for it');
    expect(step).toContain('**If any other CLI in the roster resolves to `sandbox-yolo`**');
    expect(step).toContain('counting a grok or cursor `sandbox-yolo` as `read-only`');
    // the D25 / NFR-MMT7 locked warning string is unchanged
    expect(step).toContain('⚠ <cli-name> is configured in sandbox-yolo mode — CLI will run with full tool permissions inside an OS sandbox.');
    // and both runners really treat sandbox-yolo as read-only
    for (const r of ['grok-review.sh', 'cursor-review.sh']) {
      expect(readFileSync(join(PLUGIN, 'scripts', 'adapters', r), 'utf8'), r).toMatch(/sandbox-yolo is a no-op alias of\s*\n#\s*read-only/);
    }
  });

  it('docs/testing.md lists the grok and cursor adapters and their suites', () => {
    const t = readFileSync(join(ROOT, 'docs', 'testing.md'), 'utf8');
    expect(t).toContain('`claude-`, `bedrock-`, `llm-`, `grok-`, `cursor-review-prompter`) are Haiku-backed');
    for (const suite of [
      'grok-review-runner-behavioral.test.ts',
      'cursor-review-runner-behavioral.test.ts',
      'cursor-reviewer-config-shape.test.ts',
      'configure-multi-model-grok-cursor.test.ts',
    ]) {
      expect(t).toContain(suite);
      expect(existsSync(join(ROOT, 'tests', 'schemas', suite)), suite).toBe(true);
    }
  });
});

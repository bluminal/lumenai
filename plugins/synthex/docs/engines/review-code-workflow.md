# The `/synthex:review-code` Workflow Engine (FR-HM16, Task 57)

Claude Code only. Opt-in. Cold-path detail for the capability ladder's level 2
in [`docs/standing-pool-routing.md`](../standing-pool-routing.md) (D4: engine
docs live under `plugins/synthex/docs/engines/`). This document is not
included by any command at invocation time — the ladder document is what
actually gates and invokes the engine; this page is reference material for
engineers and for the `[H]` live-run comparison.

## Live-run fixes (Task 57, post-implementation)

A `[H]` live run on `src/users.js` (a planted-issue diff: a hardcoded API
key, a SQL-injection regression, a swallowed-error retry loop, and a secret
leaked to an arbitrary caller-supplied URL) found 5 defects, all fixed in
this revision:

1. **Gate leak.** With `code_review.engine: prose`, the model still called
   `Workflow` as its first tool use — the old Step-4 pointer in
   `review-code.md` read as an invitation. Level 2's condition is now
   resolved deterministically via `scripts/lib/config-get.sh
   code_review.engine prose` (or a direct config Read when `Bash` is absent)
   with an explicit "do NOT call `Workflow` unless..." guard, and the
   `review-code.md` pointer was reworded to a refusal by default. See the
   capability ladder's level 2 in `docs/standing-pool-routing.md`.
2. **Pointless second cycle.** The script used to loop internally over
   `review_loops.max_cycles`, re-running every reviewer with no fix step in
   between (a script cannot apply fixes). It now runs exactly **one**
   review cycle per invocation and returns; the command's own Review Loop
   (`review-code.md` Step 6) owns the fix-and-re-review loop across turns,
   passing `cycle` and `priorCycleSummary` in `args` on each re-invocation.
3. **Dedupe missed cross-reviewer duplicates.** Two reviewers describing
   the same issue with different `finding_id`/`title`/`category` were not
   merged, because Stage 2 only merged on a high (>=0.8) title-only Jaccard
   score. Stage 2 now also merges a pair at the same location (matching
   symbol, or overlapping/near `line_range`, mirroring the multi-model
   orchestrator's Stage 5b "same location" definition) whose Jaccard score
   clears a lower `locationJaccardThreshold` (default 0.3). Verified
   against the live run's actual 8 findings
   (`tests/fixtures/review-engine/live-run-t57-cross-reviewer-duplicates.json`),
   which now collapse to 4.
4. **"Raised by: unknown" on every finding.** The forced envelope schema
   never required `source`, and reviewer agents reliably omitted it. The
   script now stamps `source.reviewer_id` (and `family`/`source_type`) from
   the reviewer it knows it just invoked — `stampReviewerSource` — rather
   than trusting a model self-report.
5. **Report text.** `reviewed` no longer defaults to a hardcoded "staged
   changes"; the caller passes the actual resolved scope (e.g. "unstaged
   changes") in `args.reviewed`. `date` was already caller-supplied (scripts
   cannot call `Date.now()`) but is now explicitly documented in the ladder
   doc's `args` contract. A merged finding now keeps **both** contributing
   reviewers' categories (joined with ` / `) instead of silently dropping
   one on a severity tie — a hardcoded secret filed as "Correctness" by one
   reviewer and "Secrets & Sensitive Data Leakage" by the other now renders
   as both, and the `|| 'uncategorized'` default still applies only when
   every contributing category was genuinely empty.

## What it does

`plugins/synthex/workflows/review-code.js` is a Workflow script that
reproduces `/synthex:review-code`'s reviewer fan-out, consolidation, and
report rendering using structured tool calls instead of markdown prose
parsing. It is auto-discovered from the plugin's `workflows/` directory with
no `plugin.json` entry (confirmed by the Task 9 spike,
`docs/specs/harness-modernization/spikes.md` "Task 9 — Workflow capability
spike": a script at a plugin's `workflows/` root is picked up and namespaced
as `<plugin>:<script-name>` — here, `synthex:review-code`).

Each `Workflow` call runs exactly **one** review cycle:

1. Runs every configured reviewer (`code_review.reviewers`, e.g.
   `code-reviewer`, `security-reviewer`) in `parallel()`, each as
   `agent(prompt, {agentType: 'synthex:<reviewer>', schema})` with the
   schema forced to `{findings[], positives[], summary}` — the per-reviewer
   envelope FR-HM16 specifies, matching the canonical finding shape in
   `agents/_shared/canonical-finding.schema.json` (Task 43) where
   applicable, so "What's Done Well" and convention feedback survive
   structured output. Each reviewer's returned findings are immediately
   stamped with that reviewer's identity (`stampReviewerSource`) — the
   schema does not require `source`, so the script, which knows which
   `agentType` it just called, supplies it authoritatively rather than
   trusting the model to self-report it.
2. When multi-model review is enabled, runs a second `parallel()` group
   that invokes the `multi-model-review-orchestrator` agent unchanged (its
   own Step 0–8 preflight, tier-table aggregator selection, FR-MR17
   failure handling, and D21 header construction are untouched) and folds
   its returned `findings[]` into the same consolidated list.
3. Dedupes all findings in plain JS — no agent call — by exact
   `finding_id` (Stage 1) and, within the same file, by EITHER a high
   (>=0.8) normalized-title Jaccard score regardless of location, OR a
   lower (>=0.3) score corroborated by matching location (matching symbol,
   or overlapping/near `line_range`) (Stage 2) — mirroring (a simplified
   form of) the multi-model orchestrator's own Stage 1/Stage 2/Stage 5b
   consolidation described in `docs/specs/multi-model-review/
   architecture.md`, minus the Stage 4 LLM tiebreaker (dedup here never
   spawns an agent, by design). `finding_id`, `title`, and `category` may
   all differ between a merged pair — real reviewers rarely word the same
   bug identically — and a merged finding keeps every contributing
   reviewer's category rather than discarding one.
4. Runs exactly one `effort: 'medium'` agent call to synthesize the 2–3
   sentence "Summary" prose. The PASS/WARN/FAIL verdict itself is **not**
   asked of an agent — it is computed deterministically from the
   consolidated findings' severities (`aggregateVerdict`), the same rule
   `review-code.md` Step 5 documents ("FAIL if ANY reviewer returns FAIL
   ... WARN if ANY reviewer returns WARN ... PASS if ALL reviewers return
   PASS", restated here as "FAIL if any CRITICAL/HIGH finding, WARN if any
   MEDIUM finding, PASS otherwise" since the forced envelope carries no
   per-reviewer verdict field to begin with).
5. Renders the markdown report with the same template
   `review-code.md` Step 5 embeds (`## Code Review Report` through
   `### Summary`), prefixed with the D21 path-and-reason header, and
   returns `{report, verdict, cycle}`.

A script cannot wait for a human to apply fixes between cycles (no
filesystem, no `AskUserQuestion`), so it does not loop internally over
`review_loops.max_cycles` — that loop lives entirely in the command
(`review-code.md` Step 6, unchanged from the prose path), which re-invokes
`Workflow {"name": "synthex:review-code"}` for each subsequent cycle on a
FAIL verdict, incrementing `args.cycle` and passing a compact summary of
unresolved findings as `args.priorCycleSummary`. See
`docs/standing-pool-routing.md`'s "Level 2's `Workflow` `args` contract."

## Config

```yaml
code_review:
  engine: workflow   # prose | workflow (default: prose)
```

`engine: workflow` only takes effect when a `Workflow` tool is also in the
caller's tool list — see "The opt-in (D31)" below. Every other host, and any
host missing the tool, keeps running the prose path unconditionally; this is
the single engine gate (`docs/standing-pool-routing.md`'s capability ladder)
— neither `review-code.md`, `performance-audit.md`, nor any agent file
re-implements the `code_review.engine` check (enforced by
`tests/schemas/capability-ladder.test.ts`'s "single engine gate" describe
block).

`review_loops.max_cycles` and `review_loops.min_severity_to_address`
(global, or the `code_review.review_loops` override) resolve exactly as
documented in `review-code.md`'s "Review loop config resolution order" —
but the workflow script itself never reads them. They stay entirely in the
command's own Review Loop (Step 6), which decides whether to re-invoke the
workflow for another cycle; the script only ever sees the current `cycle`
number and `priorCycleSummary` via `args` (see "Live-run fixes" above,
defect 2).

## The opt-in (D31)

Per the Task 9 spike's finding (d), a committed config key alone is not a
valid Workflow opt-in. The opt-in the Workflow tool's contract requires is
"a skill or slash command whose instructions tell you to call Workflow" —
here, the capability ladder's own level-2 prose in
`docs/standing-pool-routing.md`, which instructs the command to call
`Workflow {"name": "synthex:review-code"}` when the two conditions
(`Workflow` tool present, `code_review.engine: workflow` set) both hold. No
per-session confirmation is asked beyond that.

## The headless allow rule

Headless runs (no one present to answer an interactive tool-use prompt)
additionally need a `Workflow(synthex:<name>)` permission allow rule — or
auto/bypass mode — configured ahead of time, since the Workflow tool call
itself would otherwise block on a permission prompt nobody can answer.
`/synthex:schedule` recipes force `engine: prose` for exactly this reason
(FR-HM16's acceptance criteria: "the engine is never selected in headless
runs").

## Fallbacks

Three independent degradation paths, all clean (no error, no stall):

- **No `Workflow` tool, or `engine` is not `workflow`:** the capability
  ladder skips level 2 entirely and falls to level 3 (parallel subagent
  fan-out) or level 4 (sequential), printing `GAP_MESSAGES.engineFallback`
  once. See `docs/standing-pool-routing.md`'s "Capability Ladder (FR-HM21)"
  section.
- **Multi-model orchestrator returns an unparseable envelope:** the script
  logs a notice and continues with the native-only findings for that
  cycle rather than failing the whole review.
- **A reviewer agent errors or is skipped:** `parallel()`'s contract
  resolves a failed thunk to `null`; the script's reviewer-table and
  findings-collection steps both tolerate a `null` result (an empty
  findings/positives list is stamped instead), rendering that reviewer's
  row as `FAIL (no response)` rather than throwing.

## Output parity with the prose path

The rendered report uses the identical section structure, headings, and
table format as the prose path's Step 5 template in `review-code.md`
(`## Code Review Report`, `### Reviewed:`, `### Date:`, `### Overall
Verdict:`, the `| Reviewer | Verdict | Findings |` table, `### CRITICAL /
HIGH / MEDIUM / LOW Findings`, `### What's Done Well`, `### Summary`), and
the D21 path-and-reason header is prepended exactly as the prose path
prepends it (`multi-model-decision.md` Step 7 / `standing-pool-routing.md`
§1b-iii.6.b). `tests/schemas/review-engine-renderer.test.ts` snapshot-tests
`renderReport`'s output against this template and asserts every heading
appears in the same order; `tests/schemas/review-engine-sync.test.ts`
guards the workflow script's inlined copy of the same functions against
drift from `workflows/lib/review-engine.mjs`. What is **not** guaranteed
identical is reviewer prose style — the workflow path forces structured
JSON output from each reviewer and re-renders it, so wording will differ
from a reviewer's free-form markdown on the prose path even when the
underlying findings are the same. The `[H]` live comparison below checks
*shape*, not prose-for-prose text.

## Why the pure functions live in a separate module

`workflows/lib/review-engine.mjs` exports `dedupeFindings`,
`aggregateVerdict`, `countsBySeverity`, `sortFindingsBySeverity`,
`renderPathHeader`, `renderReport`, `stampReviewerSource`, and the small
token/similarity/location helpers they use, as a plain ES module with zero
dependencies — `tests/schemas/review-engine-renderer.test.ts` imports it
directly under Node/Vitest, no Workflow runtime required.

`workflows/review-code.js` cannot `import` that module: Workflow scripts run
in a sandboxed plain-JS context with no filesystem or Node.js module
resolution (confirmed by the Task 9 spike; the workflow-authoring skill's
own contract: "No filesystem or Node.js API access"). So the script instead
carries an inlined copy of the same function bodies, between a pair of sync
markers, with the `export` keyword stripped (a Workflow script body is not
an ES module — only `export const meta` is special-cased by the runtime).
`tests/schemas/review-engine-sync.test.ts` extracts both copies and diffs
them textually, after stripping comments and `export` tokens, on every test
run — so the two copies cannot silently drift apart. **When editing dedupe,
verdict, or render logic, edit `lib/review-engine.mjs` first, then copy the
same text into `review-code.js`'s marked block in the same commit**; the
sync test will fail the commit's own test run otherwise.

## Task 58 extension point (FR-HM17)

Task 58 adds an adversarial refute pass: three independent refuters per
CRITICAL/HIGH finding (Sonnet 5, `effort: low`), 2-of-3 survival, and a
`verification: {status, method, failure_scenario}` field on each finding in
the audit artifact. The vote-aggregation function that decides survival
(`survives = refutedCount < 2` given 3 votes) is a pure function with the
same "lives in `lib/review-engine.mjs`, inlined-and-synced into
`review-code.js`" story as everything else in this document — `review-code
.js`'s structure (the marked sync region, the per-cycle loop, the
`dedupeFindings` → `aggregateVerdict` → `renderReport` pipeline) is built to
receive it without a restructure. It is not implemented by Task 57.

## `ReportFindings`

FR-HM16's prose says the script "calls `ReportFindings` once per cycle with
the consolidated list." Before writing `review-code.js`, this was checked
against two sources of truth, per this task's own instruction to "match
whatever the prose path does":

1. **The prose path** (`plugins/synthex/commands/review-code.md` and every
   file it reads) never calls a `ReportFindings` tool anywhere. The only
   place `ReportFindings` appears in the repository is
   `plugins/synthex/docs/tool-map.md` and `scripts/lib/host-matrix.mjs`'s
   `KNOWN_UNGATED`-adjacent tool list — both list it purely as a *name* to
   gate on other hosts, with zero call sites to gate.
2. **The Workflow script API** (confirmed by the Task 9 spike and the
   workflow-authoring skill) exposes exactly `meta`, `agent`, `parallel`,
   `pipeline`, `phase`, `log`, `args`, `budget`, and `workflow` — no
   `ReportFindings` hook.

Given both checks came back empty, `review-code.js` does not call
`ReportFindings`. This is documented in the script itself, immediately after
the report is rendered, rather than silently diverging from the FR-HM16
text. **Reversal condition:** if a future Claude Code release adds a
`ReportFindings` tool that reaches Workflow scripts, and the prose path
gains a matching call site, wire it in here — call it once per invocation,
after `dedupeFindings` and before the `return`, passing the consolidated
`findings` array — and update this section.

## Running the `[H]` live comparison

This is left to the human reviewer (the `[H]` acceptance criterion). Exact
steps:

1. In a scratch project with the `synthex` plugin installed (or
   `--plugin-dir` pointed at this repo's `plugins/synthex`), set:
   ```yaml
   # .synthex/config.yaml
   code_review:
     engine: workflow
   ```
2. Make a small **unstaged working-tree** diff with at least one deliberate
   CRITICAL or HIGH issue that a code-quality reviewer and a security
   reviewer would both plausibly flag at the same location (so the
   cross-reviewer dedupe fix, defect 3, actually exercises) and at least
   one MEDIUM or LOW issue (so all four severity sections render).
   Deliberately leave it unstaged — defect 5 was a hardcoded "staged
   changes" default; an unstaged diff is a better regression check than a
   staged one.
3. Grant `Workflow(synthex:review-code)` in your permission settings, or
   run in a mode (`--dangerously-skip-permissions`, project trust) that
   would otherwise prompt for it — the level-2 opt-in still requires the
   command's own prose to instruct the call (D31); this just avoids an
   interactive tool-use block if you are scripting the comparison.
4. Run `claude -p "/synthex:review-code"` (or the interactive equivalent)
   twice against the *same* diff in the *same* scratch project: once with
   `code_review.engine: workflow`, once with `engine: prose` (or the key
   absent, which defaults to `prose`).
5. **Compare:**
   - The D21 path-and-reason header line is present and identical in
     shape (mode, reason clause, reviewer counts) on both runs.
   - Both outputs have the same section headings in the same order
     (`## Code Review Report` → `### Reviewed:` → `### Date:` → `---` →
     `### Overall Verdict:` → the reviewer table → `---` → the four
     severity sections in CRITICAL/HIGH/MEDIUM/LOW order → `---` →
     `### What's Done Well` → `---` → `### Summary`).
   - The overall verdict (PASS/WARN/FAIL) matches between runs for the
     same diff (it may not be byte-identical prose, but the severity
     classification of the same underlying issues should agree).
   - No CRITICAL or HIGH finding present in one run's findings is silently
     missing from the other's (Stage 1/Stage 2 dedup should not have
     eaten a real, distinct finding — cross-check finding titles/files).
   - The workflow run's transcript shows the expected shape: reviewers
     launched via `agent(..., {agentType: 'synthex:<reviewer>'})` in one
     `parallel()` group, one `effort: medium` call afterward, and (per
     this document's "ReportFindings" section) no `ReportFindings` tool
     call.
6. **Re-check the 5 live-run defects specifically** ("Live-run fixes"
   above):
   1. With `engine: prose`, the `prose` run's transcript shows **no**
      `Workflow` tool call at all — not even as a first move, before any
      other tool use.
   2. With `engine: workflow` and a FAIL verdict, the transcript shows
      exactly one `Workflow` call per review cycle — never two native
      reviewer fan-outs inside a single `Workflow` result — and the
      `Review path:` `reason` clause never says "re-review cycle N" on
      what was actually the first invocation.
   3. If the diff has 2+ reviewers reporting what is recognizably the same
      underlying issue (same file, overlapping lines), the rendered
      CRITICAL/HIGH section has one entry per issue, not one per
      reviewer-finding pair.
   4. Every finding's `- **Raised by:**` line names the actual reviewer(s)
      (e.g. `code-reviewer (anthropic)`), never `unknown`.
   5. `### Reviewed:` matches the actual scope reviewed (staged vs.
      unstaged, or the literal target), `### Date:` is today's date, and
      no finding's `- **Category:**` line drops a reviewer-provided,
      security-relevant category in favor of a more generic one from
      another reviewer.
7. Record the result (pass/discrepancies) wherever this task's `[H]`
   sign-off is tracked; this document does not prescribe where.

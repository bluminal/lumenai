# Implementation Plan: Harness-Native Synthex

<!-- DRAFT: pending peer review (write-implementation-plan Step 6) -->

## Overview

Implements `docs/reqs/harness-modernization.md` (FR-HM1..45, NFR-HM1..7): tool-presence-gated Claude accelerators, prompt diet, zero-token scripts, one plugin, and full prose workflows on Codex, Gemini CLI, OpenCode, Grok, and Hermes.

**Conventions for every task:**
- Commits use Conventional Commit subjects. Never hand-bump versions or `CHANGELOG.md`.
- After any manifest, H1, or `description:` change, run `node plugins/synthex/scripts/generate-codex-skills.mjs` in the same commit.
- After any command or agent add or remove, update `tests/compat/lib/inventory.mjs` (Task 1) and the CLAUDE.md command/agent tables in the same commit.
- Every new runtime script registers a happy-path case and a missing-`jq`/missing-node case in the Task 37 smoke suite.
- Includes use the D17 path form.
- Spike results go in `docs/specs/harness-modernization/spikes.md` (question, method, result, decision, fallback taken).
- `[H]` means human judgment **or** a live host session outside CI. `[O]` appears only at milestone level.

## Decisions

| # | Decision | Context / Rationale |
|---|----------|---------------------|
| D1 | A new Phase 1 (foundations, spikes) goes in front; plan Phase N+1 = PRD phase N. FR-HM17 prose pass → Phase 3; FR-HM44 → Phase 2. | Unblocks all later work. |
| D2 | All count assertions import `tests/compat/lib/inventory.mjs`. | Counts change in 6 phases. |
| D3 | FR-HM3 matches only backticked tool names or "`<Name>` tool" outside headings and fences. `KNOWN_UNGATED` holds real call sites only, only shrinks, and is empty after Phase 6. | Headings use "Workflow". |
| D4 | Engine docs in `plugins/synthex/docs/engines/`; the script goes where Task 9 proves workflows load from. | Includes under `commands/` become slash commands. A1. |
| D5 | Counts: 18/28/46 → 18/23/41 (Phase 5) → 22/26/48 (Task 47) → **24/26/50**. FR-HM24's 31/53 is never reached. | A2. |
| D6 | `standing_pools` lives in `.synthex/config.yaml`; every reader falls back to `.synthex-plus/config.yaml` with a deprecation line for one major version. *Assumed; confirm.* | Existing pool users keep working. |
| D7 | Tombstone synthex-plus release (Task 54) ships with the fold; the nudge warns while synthex-plus stays installed. *Assumed; confirm.* | Removal does not uninstall; only the tombstone disables stale hooks. A11. |
| D8 | Major bump via `.release-intent.json` in Task 54's own `feat!:` commit; Task 55 is `chore:`. | `release.yml` reads subjects plus intent; works under merge commits. A15. |
| D9 | Host data (tools, harnesses, headless flags, caps, gap text) lives in build-time `host-matrix.mjs`; the generator emits wrappers, `docs/hosts.md`, and runtime `config/hosts.env` under `--check`. | NFR-HM5. |
| D10 | PR-A (Task 28): `description:` + allowlists for surviving agents. PR-B (Task 30): all `effort:` pins and model moves, eval-gated. | Effort and allowlists change cost. A3. |
| D11 | `start-review-team`, `stop-review-team`, and `list-teams` print `GAP_MESSAGES.pool` (one neutral sentence for terminal and table) without `SendMessage`/`ListAgents`; `configure-teams` is ungated. | Mixed-host teams can author config. A16. |
| D12 | `.synthex/facts.md` is gitignored. *Assumed; confirm.* | mtimes differ per clone. |
| D13 | `canonical-finding.schema.json` is the source of truth. | Scripts and `--output-schema` need JSON. |
| D14 | Grok = `Manifest-supported (compat pending: no pinnable install)` until Q2. | A13. |
| D15 | Command `description:`/`effort:` only if Tasks 6/7 prove them safe. | OQ-2, OQ-4. |
| D16 | FR-HM35..39 do not exist in the PRD. | — |
| D17 | Includes read `${CLAUDE_PLUGIN_ROOT}/docs/<x>.md` plus the other-hosts line; if not expanded, the SessionStart hook writes `plugin_root` to `.synthex/state.json`. | The project's own `docs/` would shadow bare paths. A14. |
| D18 | FR-HM17 prose pass behind `code_review.verification: prose\|off`, default `off`. *Assumed; confirm.* | NFR-HM1, NFR-HM3. A4. |
| D19 | Runtime scripts may use bash; no `python`; build tools excluded by list. *Assumed; confirm.* | Existing scripts are bash. A5. |
| D20 | Phase 6 = PR 1 (Tasks 47–54, `harness/one-plugin` with CI, weekly rebase, wrappers regenerated not merged) + PR 2 (Task 55) after the PR 1 release. | Every merge releases. Resolves Q3. |
| D21 | The wrapper rename is `feat:` with a README note for manual installs; Grok is checked manually in Task 5. *Assumed; confirm.* | Manifest installs follow. |
| D22 | Tool-behavior checks run in the canary profile; activation checks only request-side facts. | Loopback emits no tool calls. A6. |
| D23 | synthex-plus `star`, `dismiss-upgrade-nudge`, `api-spike`, and its nudge are retired; its `state.json` is ignored. | Avoids duplicates. |
| D24 | `git.commit_convention` defaults to `auto`; lint only when it is explicitly `conventional`. | NFR-HM1. A7. |
| D25 | Codex uses the generated `hooks/codex-hooks.json` (commit-lint only, Codex matcher). | Codex honors `Stop`. A12. |
| D26 | Shell YAML reads go through `scripts/lib/config-get.sh` (subset; node preferred; defaults; D6; fail open). | No `jq`/`yq`. |
| D27 | Hermes is out of the release gate until two drift runs pass. | A8. |
| D28 | Eval gates: ≥ 3 runs; aggregate recall ≥ baseline; no fixture loses > 1 planted issue. | Noise. A9. |
| D29 | Frontmatter = `balanced`; `economy`/`premium` are per-agent deltas. | NFR-HM5. |
| D30 | Decision waits use `loop-step.sh hold`; the Stop gate allows a stop while a decision is pending; stale `runId` is cleared. | A10. |
| D31 | If a config key is not a Workflow opt-in, ask once per session; never select the engine headless; schedule forces `prose`. | Q5. |

**PRD amendments** (apply in the same PR as this plan):
- A1: FR-HM4/16 engine paths.
- A2: FR-HM24 counts 24/26/50.
- A3: NFR-HM3 exceptions add the effort pins that pass Task 30.
- A4: FR-HM17 prose pass opt-in, default `off`.
- A5: FR-HM40 and commitment 5 allow bash.
- A6: NFR-HM4, FR-HM7, FR-HM12, and FR-HM21 tool-behavior checks move to the canary.
- A7: FR-HM27 default `auto`.
- A8: FR-HM45 Hermes release-gate exclusion.
- A9: FR-HM34 ≥ 3 runs.
- A10: FR-HM18 `hold`; FR-HM19 `runId` staleness.
- A11: FR-HM2 tombstone before removal.
- A12: FR-HM27 Codex hooks path `hooks/codex-hooks.json`.
- A13: FR-HM45 Grok label wording.
- A14: FR-HM5 gate path form; FR-HM13 `plugin_root` in state.
- A15: §9 constraint: major bump via `.release-intent.json`; removal commit `chore:`.
- A16: FR-HM24 `configure-teams` is ungated.

## Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| Q1 | (OQ-5) Do cloud routines draw on plan-included usage? | Whether Task 62 offers them. Default: OS cron only. | Open (user) |
| Q2 | (OQ-6) Is there a pinnable Grok install, and does `.grok-plugin` take precedence? | Grok admission (D14). | Open (external) |
| Q3 | Ship the synthex-plus removal as its own release? | Migration messaging. | Resolved → D20 (assumed; confirm) |
| Q4 | How long does the D6 fallback stay? | Fallback removal. Default: until the next major. | Open (user) |
| Q5 | Is a committed config key a valid Workflow opt-in? | Task 56 gate. Answered by Task 9; fallback D31. | Open |
| Q6 | If the rename fails for any harness, do we accept Claude Code double-loading? | FR-HM11 becomes a gap. Default: accept and re-spike. | Open (user) |

## Phase 1: Foundations and Spikes

### Milestone 1.1: Test Plumbing
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 1 | `inventory.mjs` (D2): repoint the literal counts at `cross-harness-compat.test.ts:40-41,240-241`. Compat scenarios already derive counts via `readExpectedEntrypoints()` (NFR-HM5, NFR-HM6). | S | None | done |
| 2 | `tool-presence-gates.test.ts` (FR-HM3, D3, Grok "Workflows" precision) and `no-usage-billing.test.ts` (FR-HM1). Add the no-billing sentence to the README cost section. | S | None | done |
| 3 | `tests/helpers/invoke-agent.ts` reads `model:`/`effort:` from frontmatter, and the Layer 2 cache key includes both (FR-HM14) | M | None | done |
| 4 | Generator H1 detection ignores frontmatter and block scalars; `probe-overlay.mjs:16` splits on the real closing delimiter. Scaffold `host-matrix.mjs` (D9; FR-HM14, NFR-HM5). | S | None | in progress |
**Task 1 Acceptance Criteria:** `[T]` `schemas/` passes with 18/28/46 from `inventory.mjs`. `[T]` A grep test finds no numeric `toHaveLength(`/`toBe(` next to `commands`/`agents`/`entries`/`probes`. → done in `0c7a4ed`: `tests/compat/lib/inventory.mjs` exports COMMAND_COUNT/AGENT_COUNT/WRAPPER_COUNT plus `diffInventoryAgainstManifest()`; `cross-harness-compat.test.ts` ("keeps tests/compat/lib/inventory.mjs in sync with the plugin manifest", "derives a unique portable skill for every command and agent", "builds unique activation probes without changing canonical prompts"); `inventory-count-literals.test.ts` ("finds no hardcoded commands/agents/entries/probes count assertion outside the allowlist"; one allowlisted unrelated fixture count in team-init-fixtures.test.ts:168).
**Task 2 Acceptance Criteria:** `[T]` Every D3 tool reference outside `KNOWN_UNGATED` shares a paragraph with "in your tool list" and "otherwise". `[T]` Self-test fixtures: `## Workflow`, "Audit Artifact Writer", and fenced code do not match; `` `Workflow` `` and "Workflow tool" do. `[T]` No `ultra`/`ultrareview`/`Managed Agents` in prose; the README sentence is present. → done in `006bf48`: `tool-presence-gates.test.ts` ("every D3 tool reference outside KNOWN_UNGATED shares a paragraph with 'in your tool list' and 'otherwise'", ratchet test, and the "D3 token-matching precision" fixtures); `no-usage-billing.test.ts` ("no executable prose mentions ultrareview, /code-review ultra, code-review ultra, or Managed Agents", "README cost section" block). KNOWN_UNGATED seeded with one entry: `agents/codex-review-prompter.md` `SendMessage` (line 132); the other six tools have zero real references today. README gained a `## Cost` section.
**Task 3 Acceptance Criteria:** `[T]` `invoke-agent-frontmatter.test.ts`: `model: haiku`/`effort: low` are read, and the cache key differs from `effort: high`. → done in `f225e9e`: `tests/schemas/invoke-agent-frontmatter.test.ts` ("parses model: haiku and effort: low correctly"; "getCacheKey — effort tier is part of the Layer 2 cache key"). `--effort` confirmed as a real CLI flag on 2.1.281; whether Haiku honors it is left to Task 7. Follow-up: `tests/helpers/claude-provider.js` and `generate-snapshots.js` duplicate the cache-key logic and still ignore frontmatter; fold into Task 25 (eval baseline) so Layer 2 runs respect tiers.
**Task 4 Acceptance Criteria:** `[T]` A block-scalar `description:` containing `# ` and `---` yields the correct H1 and wrapper. `[T]` `--check` passes on the current tree (`codex-plugin.test.ts:38-45`, `grok-plugin.test.ts:63-70`).

**Parallelizable:** 1–3 concurrently, then 4.
**Milestone Value:** Cheap count changes, a gate guard, and tier-aware Layer 2.

### Milestone 1.2: Portability Spikes (gate Phases 2–3)
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 5 | Spike OQ-1 (FR-HM11): point Codex/Grok `skills` at `portable-skills/`, adapt Gemini/OpenCode installs, run offline + activation on 4 harnesses, confirm zero `synthex:*` skills on Claude Code, check Grok manually (D21). Task 21 lands this branch. **Fallback:** keep `skills/` (Q6). | M | Task 1 | pending |
| 6 | Spike OQ-2 (FR-HM14): Codex 0.154.0 `skills/list` count with a command `description:`. **Fallback:** a generator-side description table. | S | None | pending |
| 7 | Spike OQ-3/4 (FR-HM14, FR-HM17): Haiku 4.5 agent `effort:`; command `effort:`. **Fallback:** no Haiku effort, Sonnet `low` refuters, no command effort (D15). | S | None | pending |
| 8 | Spike OQ-7 (FR-HM45) on the current tree: does `hermes skills list` see `.agents/skills/`, can `skill_view` read `../../commands/`, and does Skills Guard flag anything? **Fallback:** `hermes -z` + `skills_list()` inventory, with install-time path rewrite in the recipe (no wrapper variant). | S | None | pending |

**Task 5 Acceptance Criteria:** `[H]` `spikes.md` OQ-1 records per-harness results, the Claude skill list, the Grok observation, and whether the fallback fired (Task 21 updated if so).
**Task 6 Acceptance Criteria:** `[H]` `spikes.md` OQ-2 records both counts; Tasks 19 and 28 name the description source.
**Task 7 Acceptance Criteria:** `[H]` `spikes.md` OQ-3/4 has transcript excerpts; Tasks 30 and 58 and D15 are updated.
**Task 8 Acceptance Criteria:** `[H]` `spikes.md` OQ-7 records inventory, `skill_view`, and Skills Guard results; Tasks 20, 21, and 65 name the Hermes install shape.

**Parallelizable:** 5–7 concurrently, then 8; all `[H]`, start day one.
**Milestone Value:** Tree and frontmatter design settled.

### Milestone 1.3: Claude Capability Spikes (gate Phases 6–8)
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 9 | Spike Workflow (FR-HM16, FR-HM19 a/c, Q5): plugin-shipped script? `agentType: 'synthex:code-reviewer'` resolves? `ScheduleWakeup` resumes without a user turn? config key = opt-in? **Fallbacks:** if the script can't ship, defer Phases 7–8; if `agentType` fails, inline the prompts and drop the cache target; if resume fails, keep the in-turn wait; for opt-in, D31. | S | None | pending |
| 10 | Spike OQ-8 (FR-HM19 b): can a workflow `tech-lead` spawn Agent subagents? **Fallback:** the command orchestrates the fan-out. `skipped` if Task 9 finds scripts can't ship. | S | Task 9 | pending |
| 11 | Spike OQ-9 (FR-HM22, 30 min): does a `synthex:<agent>` teammate keep its model/effort across compaction? **Fallback:** keep read-on-spawn and drop the context target. | S | None | pending |

**Task 9 Acceptance Criteria:** `[H]` `spikes.md` answers all 4 questions with reproduction scripts; any fallback that fired becomes a D-row.
**Task 10 Acceptance Criteria:** `[H]` `spikes.md` OQ-8 has a transcript; Task 59 names the orchestration shape.
**Task 11 Acceptance Criteria:** `[H]` `spikes.md` OQ-9 shows model/effort before and after compaction; Task 51 names the path.

**Parallelizable:** 9 and 11 concurrently (`[H]`, day one); 10 follows 9 only. Runs alongside Phases 2–5.
**Milestone Value:** Gated phases start with known feasibility.

## Phase 2: Prompt Diet and Portable Catalog (PRD Phase 1)

### Milestone 2.1: Cold-Path Split and Host-Aware Context
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 12 | FR-HM43: ship `plugins/synthex/docs/` in every install (`gemini-activation.mjs:38-53`, `opencode-activation.mjs:17-43`, README l.40, `ADDING_HARNESS.md`). Add `cold-path-includes.test.ts`. Verify D17 expansion and its `plugin_root` fallback. | S | None | pending |
| 13 | FR-HM5 `review-code.md`: Step 1b → `docs/standing-pool-routing.md`, Step 1c → `docs/sandbox-yolo.md`, FR-MR21 Steps 4–8 + complexity gate → `docs/multi-model-decision.md`. The D21 spec and the 3-line FR-MR21 gate stay. | M | Task 12 | pending |
| 14 | FR-HM5 `performance-audit.md` (1b/1c → same docs) and `write-implementation-plan.md` (FR-MR6 flags + Step 6a → `docs/plan-multi-model.md`) | M | Task 13 | pending |
| 15 | FR-HM7: replace the seven `@CLAUDE.md` inclusions with the host-aware Read sentence | S | None | pending |

**Task 12 Acceptance Criteria:** `[T]` Every include uses the D17 form; any bare `docs/<x>.md` target fails; targets exist; none live under `commands/` or in `plugin.json`. `[T]` `upgrade-nudge-hook-behavioral` asserts `plugin_root` is written. `[T]` Offline passes on 4 harnesses with `docs/` installed. `[H]` The expansion result is recorded in `spikes.md`.
**Task 13 Acceptance Criteria:** `[T]` (NFR-HM1) Moved blocks are byte-identical to a pre-move copy. `[T]` Repointed: `review-code-md.test.ts` (:54, :145, :179), `review-code-routing`, `submission-fixture`, `sandbox-yolo-confirm.test.ts:38-73`. `sandbox-yolo-tty-guard.test.ts:43-90` strings stay in the command. `[T]` `review-code.md` ≤ 15 KB. `[T]` Layer 2 `pool-gate-enabled` fixture (project with its own `docs/`) fires the gate. `review-loops.ts:186-209` passes.
**Task 14 Acceptance Criteria:** `[T]` Repointed: `performance-audit-routing`, `performance-audit-fixtures.test.ts:376-403`, `write-implementation-plan-md`. `[T]` `performance-audit.md` ≤ 8.5 KB; `write-implementation-plan.md` ≤ 25.5 KB.
**Task 15 Acceptance Criteria:** `[T]` `portability-prose.test.ts`: no `@CLAUDE.md`; the 7 sites name `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.hermes.md`. `[H]` Manual Codex, Gemini, and OpenCode sessions show the Read (until the Task 23 canary automates it).

**Parallelizable:** {12, 15} (15 `[H]`, start early) → 13 → 14.
**Milestone Value:** review-code default path roughly halved; correct instruction file on every host.
**Observational Outcomes:** `[O]` review-code and performance-audit token deltas recorded in `docs/testing.md` (NFR-HM2).

### Milestone 2.2: Agent and Command Prose Diet
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 16 | FR-HM6 across the 12 specialists: Interaction tables → `docs/agent-interactions.md`; Future Considerations → `docs/roadmap.md`; Scope Boundaries → 2 lines (keep "Overlap"); delete the tech-lead/lead-frontend registries; the design-system registry becomes a pointer; keep terraform routing; drop orchestrator bookkeeping | M | None | pending |
| 17 | FR-HM8: one sentence replaces the next-priority STOP banner; product-manager's AskUserQuestion rule goes from 4 statements to 1; drop untested traceability IDs | S | None | pending |
| 18 | FR-HM13 + FR-HM42: other-hosts line after every `${CLAUDE_PLUGIN_ROOT}/scripts` call; depth-1 inline rule in `tech-lead.md`, the orchestrator, and `next-priority.md` | S | Task 17 | pending |

**Task 16 Acceptance Criteria:** `[T]` `agent-boilerplate.test.ts`: each specialist is ≥ 1.5 KB smaller than the recorded size; H1s unchanged; `## Output Format` byte-identical. `[T]` Pass: standing-pool-cleanup headings, `orchestrator-md`, 7 `*-adapter-md`, `context-bundle-assembler-md`, `audit-writer-md`, `--check`. `[T]` Layer 2: no verdict change on 3 code-reviewer and 7 security-reviewer fixtures.
**Task 17 Acceptance Criteria:** `[T]` `native-looping-wiring`/`-baselines`/`-doc` pass. `[T]` `portability-prose`: the rule appears at most twice in `product-manager.md`; the banner is gone.
**Task 18 Acceptance Criteria:** `[T]` `portability-prose`: every plugin-root script line has an other-hosts line; the depth-1 sentence is in all 3 files. `[T]` `next-priority-auto-decide.test.ts:84-100` passes.

**Parallelizable:** {16, 17} → 18 (18 and 17 share `next-priority.md`).
**Milestone Value:** 400–500 fewer tokens per specialist spawn; inline delegation on depth-1 hosts.
**Observational Outcomes:** `[O]` Per-spawn token delta from the Task 16 Layer 2 runs recorded in `docs/testing.md`.

### Milestone 2.3: Portable Skill Catalog
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 19 | FR-HM9 + FR-HM10: first capture the Codex/OpenCode catalog baseline; descriptions ≤ 120 chars with no boilerplate; command `argument-hint`, `compatibility`, `metadata.short-description`; agent `user-invocable: false`; `skills/<agent>/agents/openai.yaml` with `allow_implicit_invocation: false` | M | Tasks 4, 6 | pending |
| 20 | FR-HM12: emit the tool-map table and the two rules (skip-once, adopt-inline) from `host-matrix.mjs` into every wrapper; the generator header lists all harnesses, including Hermes (FR-HM45) | M | Tasks 8, 19 | pending |
| 21 | FR-HM11 per Task 5: generator writes `portable-skills/`; update the Codex/Grok `skills` keys and the Gemini/OpenCode/Hermes recipes; README note for manual installs (D21); delete `skills/`. If the fallback fired, record the gap. | M | Tasks 5, 8, 20 | pending |
| 22 | FR-HM9: codex/opencode activation captures the catalog block at loopback and asserts the `harnesses.mjs` budget | M | Task 21 | pending |
| 23 | Canary tool behavior (NFR-HM4, FR-HM7, FR-HM12; D22): Codex/OpenCode `*-canary.mjs` gain (a) a `Workflow`-step probe (≤ 1 attempt, no retry) and (b) a no-injected-context probe (the instruction file is Read). Tasks 46 and 49 add cases. | M | Tasks 20, 21 | pending |

**Task 19 Acceptance Criteria:** `[T]` `wrapper-catalog.test.ts`: each description ≤ 120, total < 6,000, agent wrappers carry `user-invocable: false` + `openai.yaml`. `[T]` `contract.mjs:46-74` accepts the `agents/` subdir; `codex-plugin.test.ts:38-45` and `grok-plugin.test.ts:45-54,63-70` pass. `[T]` The baseline capture is saved under `tests/compat/baselines/`.
**Task 20 Acceptance Criteria:** `[T]` `wrapper-catalog`: the table matches the constant byte-for-byte and both rules are present in every wrapper. `[T]` The `grok-plugin.test.ts:45-54` half-length check holds (escalate to the PM before relaxing it); `--check` passes.
**Task 21 Acceptance Criteria:** `[T]` Repointed: `codex-plugin.test.ts:20`, `grok-plugin.test.ts:20,46`, `contract.mjs:30,48`, `probe-overlay.mjs:39-53`, `cross-harness-compat.test.ts:45-53,249`, all offline/activation/canary scenarios, both scheduled workflows, `ADDING_HARNESS.md`. `[T]` Offline + activation pass on 4 harnesses with unchanged counts. `[H]` A live Claude Code session lists zero `synthex:*` skills, and `/skill-doctor` reports no Synthex cost.
**Task 22 Acceptance Criteria:** `[T]` Activation fails over budget: OpenCode ≤ 60% of the Task 19 baseline; Codex has 0 blank descriptions.
**Task 23 Acceptance Criteria:** `[T]` The `cross-harness-compat.test.ts:133-160` canary-shape checks cover the new probes.

**Parallelizable:** 19 → 20 → 21 → {22, 23} (shared generator); Milestone 2.4 runs alongside.
**Milestone Value:** Smaller catalogs everywhere and no Claude Code double load.
**Observational Outcomes:** `[O]` Weekly drift shows 46 non-blank Codex descriptions. `[O]` The first main-branch canary run passes both Task 23 probes on Codex and OpenCode.

### Milestone 2.4: Latent Defect Fixes
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 24 | FR-HM44: `multi_model_review.context.{max_bundle_bytes,max_file_bytes,convention_paths,spec_paths}` and `per_reviewer_timeout_seconds` in `defaults.yaml` | S | None | pending |
| 25 | FR-HM44/28: `gemini-review-prompter` drops the `--readonly`/`--no-tools` probe, uses `--approval-mode default --output-format json`, and checks for an API key before `gcloud` | S | None | pending |
| 26 | FR-HM44: `code-reviewer` Step 2 becomes an inline scan gated on `code_review.spec_inline_bytes` (64 KB); orchestrator Stage 8g replaces `Date.now()` with a counter rotation | S | None | pending |

**Task 24 Acceptance Criteria:** `[T]` `load-defaults-helper` and `defaults-yaml-mmr` assert the keys, defaults, and comments.
**Task 25 Acceptance Criteria:** `[T]` `gemini-adapter-md`, the gemini fixtures, and `sandbox-profile-task87` pass; `--readonly` is absent; the API-key check comes first.
**Task 26 Acceptance Criteria:** `[T]` Step 2 has no "spawn a sub-agent" and names the key; `orchestrator-md` asserts no `Date.now`; the default is present.

**Parallelizable:** 24–26 concurrently.
**Milestone Value:** Gemini multi-model review works; orchestrator config references resolve.

## Phase 3: Agent Re-Tier and Evaluation (PRD Phase 2)

### Milestone 3.1: Eval Baseline and Frontmatter PR-A
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 27 | FR-HM34: `plugins/synthex/evals/` with 18 planted-issue cases, deterministic graders, ablation on, a hash-keyed skip wrapper, and a manual `agent-tests.yml` job (`--threshold 0.67`); baseline over ≥ 3 runs (D28) | M | Task 3 | pending |
| 28 | FR-HM14 PR-A (D10): one-line `description:` on all 28 agents; `tools:` allowlists (read end to end) for agents that survive Phase 5; wrapper descriptions come from `description:` | M | Tasks 6, 19 | pending |
| 29 | FR-HM17 prose pass (D18): "Verification pass (CRITICAL/HIGH only, top 5)" in code-reviewer, security-reviewer, and performance-engineer, rendering `- **Verification:**`, gated on `code_review.verification` | M | Task 16 | pending |

**Task 27 Acceptance Criteria:** `[T]` `evals-config.test.ts`: 18 cases, no LLM/baseline grader gating, no Artifact. `[H]` Baseline recall and variance recorded in `docs/testing.md`.
**Task 28 Acceptance Criteria:** `[T]` `agent-frontmatter.test.ts`: single-line `description:`; tech-lead, lead-frontend, and orchestrator allowlists include `Agent`/`Task`; each allowlist is a superset of the tools the agent's prose names; no `effort:` added. `[T]` Model pins pass (`audit-writer-md:19`, adapter-md, `cancel-loop:45`, `list-loops:43`, `configure-multi-model:50`, `dismiss-upgrade-nudge:76`, `loop-command:46`); `--check` passes. `[H]` `claude plugin validate` reports zero description warnings (live CLI).
**Task 29 Acceptance Criteria:** `[T]` `helpers.ts` and the code-reviewer/security-reviewer validators accept the line; security rule 8 and the D21 regex are unchanged. `[T]` `defaults.yaml` has `code_review.verification: off` with a comment. `[T]` Layer 2: with `off`, the 10 fixtures match the redacted FR-MR23 baseline; with `prose`, verdicts are unchanged and the recall/precision delta is recorded.

**Parallelizable:** 27–29 concurrently (27, 28 `[H]`: start early).
**Milestone Value:** Recall baseline, description routing, and complete allowlists.

### Milestone 3.2: Model Tier Changes and Profiles (PR-B)
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 30 | FR-HM14 PR-B (D10): all `effort:` pins (PM/architect `high`, ADR `xhigh`, utilities `low` per Task 7) and model moves (code-reviewer → sonnet `medium`; sre-agent and ux-researcher → sonnet `high`) | M | Tasks 7, 27, 28 | pending |
| 31 | FR-HM15: `models:` block (profile, `models.agents.<name>.model`, advisory `hosts.<harness>.models`; D29 deltas) and a "Model Resolution" paragraph in each spawning command | M | Task 30 | pending |

**Task 30 Acceptance Criteria:** `[T]` The D28 eval gate passes. `[T]` Adapter envelope parse rates are unchanged at `effort: low`. `[H]` The PM accepts each cost increase as an NFR-HM3 exception (A3).
**Task 31 Acceptance Criteria:** `[T]` `model-resolution.test.ts`: order is flag > `models.agents` > profile > frontmatter; D21 regex unchanged; pool-unaffected sentence present; deltas name existing agents; `defaults.yaml` keys commented.

**Parallelizable:** 30 → 31; request Task 30 `[H]` sign-off once Task 27's baseline lands.
**Milestone Value:** Evidence-backed tiers and cost profiles.
**Observational Outcomes:** `[O]` Per-agent token cost before and after Task 30 recorded in `docs/testing.md`.

## Phase 4: Portable Loop Engine (PRD Phase 3)

### Milestone 4.1: Script Contract and `loop-step.sh`
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 32 | FR-HM40 (D19): `portable-scripts.test.ts`; bring the 3 existing scripts into compliance | S | None | pending |
| 33 | D26: `scripts/lib/config-get.sh <dotted.key>` (FR-HM23, FR-HM27, FR-HM40) | M | Task 32 | pending |
| 34 | FR-HM18: `scripts/loop-step.sh` with `begin`, `advance`, `hold`, `finish`, `archive`, `list`, `cancel [--all]`, `check-writable`, taking over the 7 refusal paths and the archive/list/cancel formats. `list-loops`/`cancel-loop` become one Bash call each; `loop-state-lifecycle.ts` wraps the script; state writers call `check-writable`. | L | Task 32 | pending |
| 35 | FR-HM41 + FR-HM18: `host-matrix.mjs` adds headless flags, shell caps, `SYNTHEX_LOOP_IDLE_MAX`, and Grok background-poll guidance. The generator emits `docs/hosts.md` and `config/hosts.env`. `check-writable` prints the hint for `$SYNTHEX_HOST` (wrappers set it), or all hints if it is unset. | M | Tasks 20, 34 | pending |
| 36 | FR-HM20: `SessionStart` `compact` hook prints the running loop-id and state path | S | Task 34 | pending |

**Task 32 Acceptance Criteria:** `[T]` Runtime files (build tools excluded) have an `sh`/`bash`/`node` shebang, no `python`, and a documented exit-code header; node scripts guard with `command -v node`; waiters read `SYNTHEX_LOOP_IDLE_MAX`.
**Task 33 Acceptance Criteria:** `[T]` `config-get-behavioral.test.ts`, with and without node: comments, quoting, 2/4-space indentation, missing file, missing key → default, D6 fallback + stderr notice, malformed YAML → exit 0 with an empty value.
**Task 34 Acceptance Criteria:** `[T]` `loop-step-behavioral.test.ts` runs every subcommand under a jq-less PATH (`loop-idle-wait-behavioral.test.ts:148-165` pattern): `advance` prints `[loop <id> iteration N/M]` and exits non-zero on cancel/max; `hold` does not increment. `[T]` `portable-scripts`: every state writer calls `check-writable`. `[T]` Rewritten and passing: `loop-command`, `list-loops`, `cancel-loop`, `loop-state-lifecycle`, `native-looping-doc` (FR-NL/D-NL citations, Archive/Retention kept), `native-looping-wiring`; `loop-state-file.ts` REQUIRED_FIELDS unchanged. `[T]` Layer 2 shows 1 Bash call per iteration.
**Task 35 Acceptance Criteria:** `[T]` `--check` covers `docs/hosts.md` and `hosts.env`. `hosts-doc.test.ts`: each host has an approval flag and a cap (Claude 600, Gemini ≤ 240, Grok/OpenCode ≤ 90). `[T]` `check-writable` on a read-only dir exits non-zero with the matching hint.
**Task 36 Acceptance Criteria:** `[T]` `upgrade-nudge-hook.test.ts` covers the `compact` entry; the behavioral test prints the loop-id only when a loop is running.

**Parallelizable:** 32 → {33, 34} → {35, 36} → 37.
**Milestone Value:** One tool call per iteration; loud headless failures.

### Milestone 4.2: Script Smoke Suite
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 37 | FR-HM18, FR-HM40, NFR-HM4: `tests/compat/lib/script-smoke.mjs` in the offline profile of all 4 images (Codex `workspace-write`) runs each registered script's happy path and its missing-`jq`/missing-node path. Initial cases: `loop-step`, `config-get`, the compact hook, and the 3 existing scripts. | M | Tasks 33, 34, 36 | pending |

**Task 37 Acceptance Criteria:** `[T]` Every case passes in each container without `jq`. `[T]` A schema test fails if a runtime script lacks a case.
**Milestone Value:** Every shipped script is proven portable on every image.

## Phase 5: Zero-Token Scripts and Utility Retirement (PRD Phase 4)

### Milestone 5.1: State, Scaffold, and Facts
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 38 | FR-HM26: `scripts/state-flag.sh <flag>` (`upgrade-nudge.sh` field preservation), used by `dismiss-upgrade-nudge` and `star` (`star` keeps its interactive question) | S | Task 37 | pending |
| 39 | FR-HM26: `scripts/init-scaffold.sh` replaces `init` Step 2 | S | Task 37 | pending |
| 40 | FR-HM29: `init` writes `.synthex/facts.md` (4 facts with anchors; D12). Consumers read it first and keep detection as the fallback. | M | Task 39 | pending |

**Task 38 Acceptance Criteria:** `[T]` `state-flag-behavioral.test.ts`: fields preserved, atomic write. `[T]` `dismiss-upgrade-nudge.test.ts:95-133` repointed; statePath, `"dismissed": true`, `last_seen_version`, and "Do NOT use `AskUserQuestion`" still hold.
**Task 39 Acceptance Criteria:** `[T]` `init-multimodel-md.test.ts:277-310` ordering passes; the output is byte-identical to `defaults.yaml`.
**Task 40 Acceptance Criteria:** `[T]` `facts.test.ts`: 4 facts with freshness rules, a fallback sentence per consumer, `.gitignore` includes `facts.md`, and `init.md` prints `Wrote <N> facts to .synthex/facts.md`. `init-multimodel-md` passes.

**Parallelizable:** {38, 39} → 40.
**Milestone Value:** First zero-token paths; facts are cached.

### Milestone 5.2: Review Pipeline Scripts
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 41 | FR-HM26: `scripts/assemble-bundle.sh` writes `.synthex/tmp/bundle-<hash>.json` (Haiku only for oversize files), self-ignores `.synthex/tmp/`, and deletes bundles at run end or after 24 h. The orchestrator and 4 adapters use it. Retire `context-bundle-assembler`; the FR-MR9 envelope is unchanged. | M | Tasks 24, 37 | pending |
| 42 | FR-HM26 + FR-HM44: `scripts/write-audit.mjs` at orchestrator Step 9 with a node-guard fallback; retire `audit-artifact-writer` | M | Task 37 | pending |
| 43 | FR-HM28: `canonical-finding.schema.json` (D13); `scripts/validate-findings` (node, `jq` fallback, FR-MR16 enum, `parse_failed`); adapters ~5 KB; Codex `--output-schema`; D17 tier table → `defaults.yaml` family rows; orchestrator depth-1 direct-CLI note | L | Tasks 25, 37 | pending |

**Task 41 Acceptance Criteria:** `[T]` Repinned `synthex-plugin-json.test.ts:19-25,62-66,108-110,141-143`; inventory agents −1. `context-bundle-assembler-md`/`-fixtures` are ported to `assemble-bundle-behavioral.test.ts` (3 oversize scenarios, `.gitignore` containing `*`, cleanup). `[T]` `adapter-envelope.ts` is unchanged.
**Task 42 Acceptance Criteria:** `[T]` `write-audit-behavioral.test.ts` replaces `audit-writer-md.test.ts`; the other 4 referencing tests are updated; agents −1. `[T]` `orchestrator-md` asserts the call site and fallback.
**Task 43 Acceptance Criteria:** `[T]` Pass: `canonical-finding.ts` (JSON), `adapter-envelope.ts`, `mmt-canonical-finding-coord`, 7 `*-adapter-md` (H1s + 8 FR-MR8 labels), codex/gemini/ollama fixtures, `sandbox-profile-task87`, `orchestrator-md`/`-preflight`/`-fanout`/`-cloud-surface`/`-natives-fail`/`stage3`/`stage5plus`. `[T]` `validate-findings-behavioral.test.ts`: fence strip, NDJSON join, `source` injection, every error code.

**Parallelizable:** 41–43 concurrently; serialize `plugin.json` edits.
**Milestone Value:** No 200 KB Haiku re-emission; audits written; depth-1 adapters work.
**Observational Outcomes:** `[O]` Haiku tokens saved per multi-model run (`oversized-bundle` fixture) recorded in `docs/testing.md`.

### Milestone 5.3: Planning and Commit Utilities
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 44 | FR-HM26: retire `plan-scribe`. Step 5 writes the draft with `<!-- DRAFT -->`; the PM edits in place; the renumbering rule is stated once; remove the delegation section from `product-manager.md`. | M | Task 14 | pending |
| 45 | FR-HM26: reconcile the `plan-linter` rubric with `implementation-plan.ts`, port it to `scripts/lint-plan.mjs`, retire `plan-linter` | M | Tasks 37, 44 | pending |
| 46 | FR-HM27: retire `commit-message-author` (one-sentence rule in tech-lead, lead-frontend, next-priority). `init` writes an explicit `git.commit_convention` (default `auto`, D24). Fail-open `scripts/commit-lint.sh` PreToolUse hook via `config-get.sh`. Generated `hooks/codex-hooks.json` (D25). Update the CLAUDE.md release note. | L | Tasks 33, 37, 39 | pending |

**Task 44 Acceptance Criteria:** `[T]` `write-implementation-plan-md`: no plan-scribe; DRAFT marker and renumbering sentence present; agents −1.
**Task 45 Acceptance Criteria:** `[T]` `lint-plan.test.ts`: script and `implementation-plan.ts` agree on every plan fixture, including this plan; agents −1.
**Task 46 Acceptance Criteria:** `[T]` `commit-lint-hook-behavioral.test.ts`: regex equals `release.yml`'s; blocks a bad `-m`; passes `-F -` and the `rtk git commit` prefix; skips `--amend --no-edit`, `-C`, `-c`, `--fixup`, `--squash`, and merges; exits 0 with no project config or when the key is not explicitly `conventional`. `[T]` `codex-plugin.test.ts`: the hooks key points at `codex-hooks.json`, which has no `Stop`/`SessionStart`/`TaskCompleted`/`TeammateIdle`, uses the `host-matrix.mjs` Codex matcher, and is covered by `--check`. `[T]` The Codex canary gains a case: with `features.hooks` on, a bad `git commit -m` is blocked. `[T]` `init.md` prints `Detected commit convention: <value> (from <N> commits)`; agents −1.

**Parallelizable:** {44, 46}; 45 after 44.
**Milestone Value:** 5 of 6 utility agents retired.
**Observational Outcomes:** `[O]` Plan-cycle output tokens before and after (`tests/fixtures/product-manager`) and Haiku tokens saved per commit recorded in `docs/testing.md`. `[O]` Releases detect semver correctly without the agent. `[O]` The first Codex canary commit-lint run passes.

## Phase 6: One Plugin, Teams Fold-In (PRD Phase 5)

Per D20: Tasks 47–54 = PR 1 (`harness/one-plugin`); Task 55 = PR 2.

### Milestone 6.1: Fold Pool Capabilities into Synthex
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 47 | FR-HM24: extend `agent-tests.yml` PR triggers to `harness/**` (D20). Move `start-review-team`, `stop-review-team`, `list-teams`, `configure-teams`, and the 3 pool agents into `plugins/synthex` (gates per D11). Add the `standing_pools` block to `defaults.yaml`. Regenerate wrappers with `compatibility:`. | L | Tasks 13, 14, 21, 33 | pending |
| 48 | FR-HM24 asset fold: move templates (≥ `review.md`, `_skeleton.md`), docs (`standing-pools.md`, `context-management.md`, `output-formats.md`), and the 2 gate scripts. Rewrite `plugins/synthex-plus/` paths to the D17 form. Point every `standing_pools.*` read (routing doc, pool commands, 3 pool agents) at `.synthex/config.yaml` with the D6 fallback sentence. `configure-teams` writes `.synthex/config.yaml`. Apply D23. | M | Task 47 | pending |
| 49 | FR-HM21: ladder levels 1, 3, and 4 plus a level-2 placeholder in `docs/standing-pool-routing.md`, selected by tool presence, with the depth-1 inline rule. Empty the pool entries in `KNOWN_UNGATED`. Add a level-3 canary probe. | M | Tasks 23, 48 | pending |
| 50 | FR-HM23: `TaskCompleted`/`TeammateIdle` command hooks (exit 2) with the classification table in a script, gated on `standing_pools.enabled` via `config-get.sh`; `hooks/*.md` becomes script docs | M | Tasks 33, 48 | pending |

**Task 47 Acceptance Criteria:** `[T]` Ported and passing: `configure-teams`, `list-teams`, `start/stop-review-team`, `standing-pool-cleanup(-output)`, `standing-pool-submitter`, `team-orchestrator-bridge`, the submission/concurrent-submitters/draining-rejection/timeout fixtures, `sandbox-yolo-confirm`/`-tty-guard`. `[T]` Inventory 22/26/48; the pool agents pass `agent-frontmatter.test.ts` (`description:`, allowlists); offline + activation pass on 4 harnesses. `[T]` `gap-messages.test.ts`: the 3 gated commands print `GAP_MESSAGES.pool` verbatim; `configure-teams` has no gate. `[T]` `agent-tests.yml` triggers on `harness/**`.
**Task 48 Acceptance Criteria:** `[T]` A grep finds no `plugins/synthex-plus/` in `plugins/synthex/`; `.synthex-plus/config.yaml` appears only inside the D6 fallback sentence. `[T]` Every referenced template and doc exists. `[T]` Layer 2 fixtures: `standing_pools.enabled` in `.synthex/config.yaml` only routes to the pool; legacy file only routes with the deprecation line. `[T]` `configure-teams` writes `.synthex/config.yaml`; gate scripts get smoke cases.
**Task 49 Acceptance Criteria:** `[T]` `capability-ladder.test.ts`: levels 1, 3, 4 match FR-HM21; the level-2 slot is present; no host names or bare "Workflows"; `review-code-routing` and `performance-audit-routing` are updated; `KNOWN_UNGATED` has no pool entries; `gap-messages` covers the ladder fallback.
**Task 50 Acceptance Criteria:** `[T]` `lifecycle-hooks-behavioral.test.ts` (exit codes, no-op when disabled or with no config). Ported: `idle-gate-standing`, `one-team-exemption`, `lifecycle-overlay`, `synthex-plus/hooks`. Smoke case registered.

**Parallelizable:** 47 → 48 → {49, 50}.
**Milestone Value:** Pools work from `synthex` alone.
**Observational Outcomes:** `[O]` Codex and OpenCode canary runs show level-3 fan-out (D22).

### Milestone 6.2: Identity, Gaps, and synthex-plus Removal
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 51 | FR-HM22 per Task 11: spawn teammates as `synthex:<agent>`; delete read-on-spawn, the FR-MMT5b re-read, and the D26 overlay re-paste; verify via `ListAgents`; write ADR-plus-002 (which records the retention instead if the fallback fired) | M | Tasks 11, 47 | pending |
| 52 | FR-HM25: pool gap entries (Codex, Gemini, OpenCode, Grok) in `harnesses.mjs` and the README using `GAP_MESSAGES.pool`; note Hermes Kanban as future work | S | Task 47 | pending |
| 53 | NFR-HM7: CLAUDE.md (drop Synthex Plus; pool routing goes under synthex); `docs/migrations/synthex-plus.md` (step 1: stop running pools); READMEs link to it; `.gitignore:33`; superseded banners on `plus.md` and `multi-model-teams.md`; the D7 nudge | S | Tasks 47, 48 | pending |
| 54 | FR-HM2 tombstone (D7, D8): synthex-plus gets an empty `hooks.json`, no agents, and command stubs that print migration steps. Commit `.release-intent.json` (`bump: major`, reason naming `docs/migrations/synthex-plus.md`) in its own `feat!:` commit. | S | Tasks 47–52, 53 | pending |
| 55 | FR-HM2 + FR-HM24 (PR 2, after the PR 1 release): remove synthex-plus and retire `team-*` (5 commands): `marketplace.json:26-39`, plugin tree, `release.yml` (178-263, 292, 373-407, 488, 509 → one manifest set and a `synthex X` header), `cross-harness-compat.test.ts:196-207`, `grok-plugin.test.ts:27-37`, `native-looping-wiring` (4 team commands), the `native-looping.md` slug table, `claude-provider.js:58,145-156`, `promptfoo.config.yaml` (17 refs), `tests/fixtures/{synthex-plus,multi-model-teams}`, snapshots, and `tests/schemas/synthex-plus/`. `chore:`. | L | Task 54 | pending |

**Task 51 Acceptance Criteria:** `[T]` Pool prose has no read-on-spawn or overlay re-paste (or has an ADR pointer on fallback). `[T]` Layer 2: per-task reviewer context ≥ 35 KB smaller. `[H]` ADR-plus-002 approved.
**Task 52 Acceptance Criteria:** `[T]` `cross-harness-compat` asserts the 4 gap entries; `gap-messages` matches the README and `harnesses.mjs`.
**Task 53 Acceptance Criteria:** `[T]` CLAUDE.md has no "Commands (Synthex Plus)"; `upgrade-nudge-hook-behavioral` covers the synthex-plus warning. `[H]` The migration doc is reviewed.
**Task 54 Acceptance Criteria:** `[T]` `synthex-plus-tombstone.test.ts`: no hook events, empty `agents[]`, a migration pointer in every command. `[T]` `cross-harness-compat.test.ts:209-222` is updated to the new intent (`bump: major`, reason contains `docs/migrations/synthex-plus.md`). `[T]` `release.yml` still bumps synthex-plus.
**Task 55 Acceptance Criteria:** `[T]` `schemas/` is green; a grep finds no `plugins/synthex-plus` over `tests/`, `.github/`, `.claude-plugin/`, `plugins/synthex/`. `[T]` A `release.yml` dry-run bumps only the synthex manifests. `[H]` The tombstone release tag exists before merge.

**Parallelizable:** {51, 52, 53} (51, 53 `[H]`: start early) → 54 (PR 1) → release → 55.
**Milestone Value:** One plugin, one release line, and 35–50 KB less context per pool task.

## Phase 7: Workflow Review Engine (PRD Phase 6; gated by Task 9)

### Milestone 7.1: Engine
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 56 | FR-HM4 + FR-HM16 + NFR-HM1: `code_review.engine: prose\|workflow` (default `prose`) fills ladder level 2 in `docs/standing-pool-routing.md` (config enables, `Workflow` presence selects, D31). `review-code.md` keeps only its ≤ 3-line ladder pointer and adds no separate gate. A one-line notice prints on fallback. | S | Tasks 9, 49 | pending |
| 57 | FR-HM16: the workflow script (D4) plus `docs/engines/review-code-workflow.md`: parallel reviewers with a forced `{findings[],positives[],summary}` envelope; JS dedupe; one `effort: medium` verdict; template renderer with D21/FR-MR17 literals; `ReportFindings` once per cycle; a `max_cycles` loop; a multi-model second `parallel()` group; lifecycle held in variables | L | Tasks 43, 56 | pending |
| 58 | FR-HM17 engine: 3 refuters per CRITICAL/HIGH at `effort: low` (model per Task 7), 2-of-3 survival, `verification: {status, method, failure_scenario}` in the audit | M | Tasks 42, 57 | pending |

**Task 56 Acceptance Criteria:** `[T]` With `prose` and verification `off`, output matches the redacted FR-MR23 baseline structurally. `[T]` `capability-ladder.test.ts` asserts all 4 levels and a single engine gate. `[T]` `tool-presence-gates` passes with no allowlist entry; `review-loops.ts:186-209` is untouched; the headless rule (D31) is present.
**Task 57 Acceptance Criteria:** `[T]` `review-engine-renderer.test.ts` snapshot-matches the current template via the pure render and dedupe functions. `[H]` A live Claude Code run matches the prose output shape.
**Task 58 Acceptance Criteria:** `[T]` Vote-function unit test (2/3 survives; `superseded_by_verification` not reused); the `write-audit.mjs` schema accepts `verification`.

**Parallelizable:** 56 → 57 → 58.
**Milestone Value:** Opt-in refuted reviews on Claude Code (−6–9k tokens per cycle).

## Phase 8: Workflow Loop (PRD Phase 7; gated by Tasks 9, 10)

### Milestone 8.1: Stage 2 Loop
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 59 | FR-HM19: when a `Workflow` tool is present, `--loop` runs the iteration via a script with schema `{done, idle, blocked_on_human[], summary}`. `idle` triggers `ScheduleWakeup` backoff; `runId` is written to state and the Stop gate skips while it is set; stale `runId` is cleared (D30); cancel is re-read between resumes; timestamps come from `loop-step.sh`. Prose goes to `docs/engines/loop-workflow.md`; use the Task 10 shape. | L | Tasks 10, 34, 57 | pending |

**Task 59 Acceptance Criteria:** `[T]` `loop-state-file.ts` accepts `runId`; `loop-advance-gate-behavioral` exits 0 with a fresh `runId` and blocks once it is stale. `[T]` Claude-path loop prose is ≥ 8 KB smaller. `[T]` Without `Workflow`/`Monitor`, native-looping tests pass unchanged. `[H]` A live multi-iteration run with a mid-run cancel.
**Milestone Value:** Validated loop termination; idle loops stop burning turns.

## Phase 9: Unattended Operation (PRD Phase 8)

### Milestone 9.1: Decision Inbox, Decide, Schedule
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 60 | FR-HM30 + FR-HM31: at `[H]` or a high-impact escalation (`--auto-decide` off), `--loop` writes `.synthex/decisions/<loop-id>-<task-id>.json` (self-ignoring dir) before asking. Headless hosts wait via `loop-idle-wait.sh` using `hold` (D30). If `PushNotification` is present and `notifications.push_on_gate` is set, a notification is sent. | M | Task 34 | pending |
| 61 | FR-HM31: `/synthex:decide <id> <option>` validates, writes the answer, and prints the result | S | Task 60 | pending |
| 62 | FR-HM32 + FR-HM1: `/synthex:schedule` presets (`nightly-priority`, `weekly-retro`, `pr-review`); recipes from `docs/hosts.md`; OS cron or CI by default; cloud routines only if Q1 resolves yes; engine forced to `prose` (D31); routines written to config with iteration caps | M | Tasks 35, 60 | pending |

**Task 60 Acceptance Criteria:** `[T]` `next-priority-auto-decide.test.ts:84-100` passes. `decision-inbox.test.ts`: shape `{loop_id, task_id, question, options[], recommendation, links, created_at}`, write-before-ask order, non-consumption sentence, `.gitignore` containing `*`. `[T]` The gate allows the stop while a decision is pending. `[T]` Notification body: `Synthex decision <id>: <one-line question> — run /synthex:decide <id> <option>`.
**Task 61 Acceptance Criteria:** `[T]` `decide-command.test.ts` locks: `Decision <id> recorded: <option>. Loop <loop-id> resumes task <task-id> at its next wake.` / `No pending decision <id>. Pending: <ids or "none">.` / `Option "<option>" is not valid for <id>. Choose one of: <options>.` / `Decision <id> was already answered (<option>, <timestamp>); no change.` Inventory +1 command; wrappers regenerated.
**Task 62 Acceptance Criteria:** `[T]` `schedule-command.test.ts`: every host row names its approval flag; Grok never uses `/loop`/`scheduler_create`; no billed feature. Inventory +1 command (after Phase 6 this equals D5's 24/26/50); offline + activation pass.

**Parallelizable:** 60 → {61, 62}.
**Milestone Value:** Unattended loops everywhere.

## Phase 10: Plan Cockpit (PRD Phase 9)

### Milestone 10.1: Read-Only Plan Projection
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 63 | FR-HM33: `templates/plan-cockpit.html`, compliant with the artifact design contract | M | None | pending |
| 64 | FR-HM33: `write-implementation-plan` publishes the cockpit once (URL stored in `.synthex/state.json`); `next-priority` writes changed rows at Steps 3 and 9 and resyncs at milestone boundaries; comments are surfaced but never auto-applied. Gated on `artifacts.plan_cockpit.enabled` and the `Artifact` tool. | M | Tasks 60, 63 | pending |

**Task 63 Acceptance Criteria:** `[T]` `plan-cockpit-template.test.ts`: `:root` tokens; a `prefers-color-scheme: dark` block under `:root:not([data-theme="light"])`; a `:root[data-theme="dark"]` block; an explicit `body` background; a 2–4 word `<title>`; CDN allowlist; Google Fonts only. `[T]` Playwright at 375 px: no horizontal scroll and 16 px gutters in both themes.
**Task 64 Acceptance Criteria:** `[T]` `tool-presence-gates` passes; `native-looping-wiring` headings intact; the prose states no local HTML is written without the tool. `[H]` A live run shows row deltas and comment surfacing; plan-tier comment limits are documented.

**Parallelizable:** 63 anytime → 64 (`[H]`: book an Artifact-enabled session early).
**Milestone Value:** A live, read-only plan view on Claude Code.

## Phase 11: Harness Admission and Close-Out (PRD Phase 10)

### Milestone 11.1: Hermes, Grok, Docs
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 65 | FR-HM45: Hermes compat adapter covering the `versions.lock.json` git-sha pin, a Python+uv+Node Dockerfile, the `harnesses.mjs` entry with gaps, `hermes-offline`/`-activation`/`-canary` (`hermes -z "/<slug> <nonce>"`, hard timeout), `agent-tests.yml` and `authenticated-compatibility-canary.yml` matrices, and `cross-harness-compat` expectations. Excluded from the release gate (D27). | L | Tasks 8, 21 | pending |
| 66 | FR-HM45 + NFR-HM7: three-state harness table in the README and the matching CLAUDE.md list; aggregate the NFR-HM2 measurements against PRD §8 in `docs/testing.md` | S | Tasks 55, 65 | pending |

**Task 65 Acceptance Criteria:** `[T]` Hermes offline + activation pass in CI for all wrappers; `cross-harness-compat` covers its scenario shape. `[T]` The `release.yml` harness list excludes Hermes, with a D27 comment.
**Task 66 Acceptance Criteria:** `[T]` The README and CLAUDE.md contain `Supported (in compat matrix)`, `Manifest-supported (compat pending: <blocker>)`, and `Not supported`. Grok reads `Manifest-supported (compat pending: no pinnable install)`. Hermes's row reflects Task 65 and footnotes the D27 release-gate caveat. The no-billing sentence is present, and CLAUDE.md counts equal `inventory.mjs`. `[H]` Every PRD §8 row has a measured value or a named blocker.

**Parallelizable:** 65 starts after Task 21; 66 waits for both 55 and 65.
**Milestone Value:** Hermes supported; docs match the plugin.
**Observational Outcomes:** `[O]` Two consecutive weekly drift runs pass for all five harnesses.

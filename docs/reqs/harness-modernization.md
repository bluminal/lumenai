# Product Requirements Document: Harness-Native Synthex

**Status:** Draft v1.1 (2026-09-24; amendments A1 to A16 from `docs/plans/harness-modernization.md` applied)
**Owner:** Bluminal Labs
**Related:** `docs/reqs/main.md`, `docs/reqs/multi-model-review.md`, `docs/reqs/plus.md` (superseded in part by this document), `docs/reqs/multi-model-teams.md` (superseded in part by this document), `docs/specs/decisions/ADR-003` (native looping)

---

## 1. Vision & Purpose

**Why this exists:** Synthex was designed against the Claude 4 era of Claude Code. Since March 2026 the model family and the harness have gained primitives that Synthex currently re-implements in prose: deterministic multi-agent orchestration (the Workflow tool), schema-forced structured output, per-agent effort levels and tool allowlists, background subagents with worktree isolation, named agents that can be resumed, agent teams with lifecycle hooks, a one-hour prompt cache, on-demand tool loading, persistent memory, published artifacts, and a first-party plugin evaluation harness. Meanwhile Claude 5 models follow instructions well enough that much of Synthex's emphatic, repeated guardrail prose is dead weight.

A 52-agent review of the plugin (2026-09-23) measured the cost of that gap. Examples: `review-code.md` is 27.6 KB but its default path is roughly 6 KB; every specialist agent carries 1.5 to 2 KB of non-instructional boilerplate; `commit-message-author` is a 16.9 KB Haiku prompt spawned once per commit; the loop engine performs four to six model-executed tool calls per iteration to do bookkeeping a shell script can do in one; and every Claude Code session loads all 46 generated skill wrappers, so Claude sees every command and agent twice.

At the same time, Synthex now ships to more than one harness. Codex, Gemini CLI, OpenCode, and Grok load the generated `skills/` tree today; Hermes Agent is a candidate. Those harnesses honor only `name` and `description` in skill frontmatter, inject the whole skill catalog into every request, have no Stop hook, cap shell calls at two to five minutes, and each expose a different subagent, approval, and context-file model. Any modernization that assumes Claude Code silently breaks or silently degrades elsewhere unless it is written as a capability ladder.

**This PRD** defines how Synthex adopts the new Claude and Claude Code capabilities to become cheaper, faster, and more capable **on Claude Code**, while remaining **one plugin** that degrades gracefully and predictably on every other supported harness. It also folds the standing-pool and team features of `synthex-plus` back into `synthex` behind capability detection, so the harness, not the user, decides when to use teams.

**Design commitments:**

1. **No usage-billed features.** Nothing in this PRD may invoke a feature that bills against usage credits or a separate SKU (for example `/code-review ultra`, the GitHub Code Review managed service, or Managed Agents). Everything runs on plan-included or API-key token spend the user already pays for.
2. **One plugin.** `synthex-plus` is phased out. Team and pool behavior lives in `synthex` and activates only when the host exposes the tools it needs.
3. **The prose path stays canonical.** Every command remains a complete, executable markdown workflow on every host. Claude-only engines are opt-in accelerators layered on top, never replacements.
4. **Capability detection by tool presence, never by host name.** A branch reads "if a `Workflow` tool is in your tool list", not "on Claude Code".
5. **Portable scripts.** Anything moved out of prose into a script is `bash` (present on every supported host and compat image) or `node`, with `jq` optional and no `python`, and it degrades to a stated prose fallback when the host cannot run it.

---

## 2. Target Users / Personas

| Persona | Description | Primary Need |
|---------|-------------|--------------|
| **Claude Code power user** | Runs `next-priority --loop` for hours, reviews every PR with `review-code`, pays per token | Lower token cost per command, faster wall-clock, fewer fragile prose state machines |
| **Multi-harness team** | Some engineers on Claude Code, others on Codex, OpenCode, or Grok, sharing one `.synthex/config.yaml` | Identical outputs and safe behavior everywhere; no host-specific config keys that break a colleague's session |
| **Autonomy operator** | Wants Synthex to run unattended (nightly plans, PR reviews) and be steerable from a phone | Human gates that do not block a terminal; scheduling that uses only plan-included usage |
| **Plugin maintainer (Bluminal)** | Owns 1 MB of markdown, 46 wrappers, a 5-harness compat matrix, and a release pipeline | Fewer duplicated sources of truth; changes that the existing test gates can verify |
| **Local-first developer** | Runs Ollama and Hermes or OpenCode, possibly offline | No hard dependency on Claude-only tools, `jq`, or network services |

---

## 3. Terminology

| Term | Definition |
|------|------------|
| **Harness** | The coding-agent CLI or app that loads Synthex: Claude Code, Codex CLI, Gemini CLI, OpenCode, Grok Build, Hermes Agent. |
| **Canonical file** | A `commands/*.md` or `agents/*.md` file. The single behavioral source of truth on every harness. |
| **Wrapper** | A generated `skills/<slug>/SKILL.md` that non-Claude harnesses load. Contains discovery metadata and "read the canonical file" instructions only. |
| **Capability ladder** | The ordered set of implementations of one behavior, from richest (Claude-only tool) to baseline (prose executed by any host), selected at runtime by tool presence. |
| **Tool-presence gate** | A sentence in a command of the form "If a tool named `X` is in your tool list, do A; otherwise do B." Never references a host by name. |
| **Cold path** | A block of command prose that executes only when a config key or flag enables it (standing-pool routing, sandbox-yolo confirmation, the multi-model decision framework). |
| **Hot path** | Prose that executes on every invocation with default configuration. |
| **Engine** | A selectable implementation of a command's orchestration: `prose` (default, canonical) or `workflow` (Claude Code Workflow script). |
| **Utility agent** | A Haiku-backed agent that exists only to perform mechanical work (rendering, copying, flipping a flag, linting). |
| **Zero-token script** | A shell or node script that replaces a utility agent's mechanical work with no model call. |
| **Skill catalog budget** | The per-session context a harness spends listing skills. Codex caps it at 2% of the context window or 8,000 characters; OpenCode and Gemini inject every skill's name, description, and path into every request. |
| **Depth-1 host** | A harness whose subagents cannot spawn subagents (OpenCode default, Grok Build, Hermes default). |
| **Decision inbox** | `.synthex/decisions/<id>.json` files written at human gates so a loop can wait for an answer without blocking a terminal. |
| **Documented gap** | A capability a harness lacks, recorded in `tests/compat/lib/harnesses.mjs` and the README rather than silently skipped (per `tests/compat/ADDING_HARNESS.md`). |

---

## 4. Functional Requirements

### 4.1 Guiding Constraints

**FR-HM1: No usage-billed features**

No command, agent, hook, or generated recipe may invoke a feature that bills against usage credits or a separate SKU. Specifically excluded: `/code-review ultra` and `/ultrareview`, the GitHub Code Review managed service, Managed Agents, and any cloud routine whose billing is not verified to draw on plan-included usage.

**Acceptance Criteria:**
- A grep of `plugins/synthex/` for `ultra`, `ultrareview`, and `Managed Agents` in executable prose returns no matches.
- `/synthex:schedule` (FR-HM32) defaults to an OS-cron or CI recipe on every host; it offers a harness-native scheduler only when that scheduler's billing is documented as plan-included, and it says so in its output.
- The README states the no-usage-billing commitment in the cost section.

**FR-HM2: One plugin**

`synthex-plus` is retired. Its standing-pool and team capabilities are re-homed in `synthex` per FR-HM23 through FR-HM25. No new `synthex-plus` features are accepted after this PRD is approved. Because removing a plugin from the marketplace does not uninstall cached copies, a final tombstone release of `synthex-plus` (empty `hooks.json`, commands that print migration steps only) ships before the marketplace entry is removed.

**Acceptance Criteria:**
- A tombstone `synthex-plus` release is published before the marketplace entry is removed; stale installs run no hooks after upgrading to it.
- `.claude-plugin/marketplace.json` lists one plugin.
- `release.yml` bumps one plugin manifest set (Claude, Codex, Grok) and one CHANGELOG header.
- `CLAUDE.md` has no "Commands (Synthex Plus)" table; pool routing is documented under `synthex`.
- The blast-radius list in §5.6 is fully addressed or explicitly deferred with an issue link.

**FR-HM3: Capability detection by tool presence**

Every branch that depends on a Claude-only capability is gated by a tool-presence sentence, and every such sentence has an explicit fallback. Host names appear only in documentation and install recipes, never in a gate.

**Acceptance Criteria:**
- A Layer 1 test asserts that every occurrence of `Workflow`, `Artifact`, `ScheduleWakeup`, `PushNotification`, `ReportFindings`, `SendMessage`, and `ListAgents` in `commands/` and `agents/` is within a paragraph that also contains the phrase "in your tool list" and the word "otherwise".
- Gates never key on a shared config value alone. A config key may *enable* a branch; only tool presence may *select* it. Rationale: `.synthex/config.yaml` is committed and shared across harnesses (§5).
- Where a host has a feature with the same name but different semantics (Grok's own "Workflows" feature), the gate names the tool precisely ("a tool named `Workflow` whose description mentions `pipeline(`") and the fallback says "never substitute a host feature of the same name".

**FR-HM4: The prose path remains canonical**

Every command is a complete, executable markdown workflow without any Claude-only tool. Claude-only engines are additive branches in separate files referenced from the command, so that locked strings, headings, and test anchors in the command file are untouched.

**Acceptance Criteria:**
- `code_review.engine` defaults to `prose`.
- The native-only review output remains byte-identical to the FR-MR23 baseline snapshot when `engine: prose`.
- Each engine branch lives in `plugins/synthex/docs/engines/<command>-<engine>.md` (never under `commands/`, which Claude Code would register as a slash command) and is referenced from the command in at most three lines.

### 4.2 Prompt Diet and Cold-Path Split

**FR-HM5: Cold-path split**

Blocks that execute only when a config key enables them move out of the hot path into `plugins/synthex/docs/<topic>.md`, mirroring the existing `docs/native-looping.md` precedent. The command keeps a two-line gate: "If `<key>` is true (or `--flag` was passed), Read `${CLAUDE_PLUGIN_ROOT}/docs/<topic>.md` and follow it; otherwise continue to Step N", followed by the FR-HM13 other-hosts line. A bare `docs/<topic>.md` path is forbidden because it would resolve against the user's own `docs/` directory and silently skip the branch.

Targets and expected sizes:

| File | Blocks moved | Before | After (est.) |
|------|--------------|--------|--------------|
| `commands/review-code.md` | Step 1b standing-pool routing, Step 1c sandbox-yolo, FR-MR21 Steps 4 to 8 and the complexity gate | 27.6 KB | ~14 KB |
| `commands/performance-audit.md` | Steps 1b and 1c | 15.9 KB | ~8 KB |
| `commands/write-implementation-plan.md` | FR-MR6 flags and the Step 6a orchestrator contract | 28.7 KB | ~25 KB |

The D21 `Review path:` header spec and the three-line FR-MR21 gate stay in the command because native-only output also carries the header.

**Acceptance Criteria:**
- Moved blocks are byte-identical in their new location; Layer 1 tests that assert verbatim D21, D25, FR-MMT17, and FR-MR21 strings are repointed at the doc files. Verbatim sandbox-yolo strings that `sandbox-yolo-tty-guard.test.ts` requires in the command file stay in the command file.
- The includes are NOT placed under `commands/` (Claude Code would surface them as slash commands) and are NOT registered as skills (each registered skill adds a permanent catalog line on every host).
- The `docs/` directory is added to every install bundle (FR-HM43); a Layer 1 test asserts every `Read docs/<x>.md` target exists.
- A Layer 2 fixture with `standing_pools.enabled: true` proves the pool gate still fires after the split, because a silently skipped pool gate has no output tell.

**FR-HM6: Boilerplate removal from agents**

From each of the 12 specialist agents remove "Interaction with Other Agents" tables and "Future Considerations" sections (relocated to `docs/agent-interactions.md` or `docs/roadmap.md`, never to HTML comments, which no host strips). Condense "Scope Boundaries" to two lines but keep the "Overlap" sentence, which is behavioral. Trim "When You Are Invoked" to one sentence but keep the heading. Delete the phantom "not yet available" registries in `tech-lead.md` and `lead-frontend-engineer.md`; keep `design-system-agent`'s registry as a one-line pointer to `design_system.specialists`; keep `terraform-plan-reviewer`'s provider-prefix routing lines and drop its "Extending the Registry" prose. In `multi-model-review-orchestrator.md` remove milestone bookkeeping and collapse "Source Authority" to one line.

**Acceptance Criteria:**
- Per-specialist prompt shrinks by at least 1.5 KB with no change to the Output Format section.
- Every H1 survives (the wrapper generator reads it).
- `standing-pool-cleanup`-style tests that require `## When You Are Invoked` and a Boundaries heading still pass.
- Layer 2 fixtures show no verdict changes on the three code-reviewer and seven security-reviewer fixtures.

**FR-HM7: Replace inline `@CLAUDE.md` inclusions with host-aware context loading**

The seven inline `@CLAUDE.md` inclusions (`review-code.md:324`, `refine-requirements.md:64`, `reliability-review.md:43`, `write-implementation-plan.md:106,326`, `performance-audit.md:194`, `next-priority.md:164`) are replaced by one sentence: "If the host did not already inject the project instruction file into your context, Read the first of `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.hermes.md` that exists at the repository root."

Rationale: Claude Code injects `CLAUDE.md` automatically (so the inclusion is a 26.8 KB duplicate in this repo). Codex and OpenCode read `AGENTS.md` and treat `CLAUDE.md` only as a fallback; Gemini CLI does not read `CLAUDE.md` at all; Hermes uses first-match-wins across `.hermes.md`, `AGENTS.md`, `CLAUDE.md`; Grok injects `CLAUDE.md` and `AGENTS.md` but has no `@` include syntax, so today's inclusion is literal text there.

**Acceptance Criteria:**
- No `@CLAUDE.md` remains in `commands/` or `agents/`.
- A Layer 2 fixture on Claude Code shows the command output unchanged.
- The credential-gated canary profile for Codex, Gemini, and OpenCode confirms the `Read` of the project instruction file is issued when no host injection occurred (the activation loopback providers never emit tool calls, so they cannot verify this).

**FR-HM8: Drop emphasis scaffolding written for older models**

Replace the "STOP and jump to Native Looping" banner in `next-priority.md` with one sentence ("`--loop` here is Synthex native looping, not the harness `/loop` skill"). Cut the four repetitions of the AskUserQuestion rule in `product-manager.md` to one. Remove PRD and plan traceability IDs from runtime prose where a Layer 1 test does not lock them; where a test locks them, leave them and file the test for later cleanup.

**Acceptance Criteria:**
- Native-looping wiring and baseline tests pass.
- No command contains the same rule stated more than twice.

### 4.3 Portable Skill Catalog and Per-Host Packaging

**FR-HM9: Shorten wrapper descriptions**

The generator's `skillDescription()` emits at most 120 characters per skill and drops the "Use when the user asks for /synthex:x, $x, or the equivalent x command" boilerplate. Command wrappers gain `argument-hint` and `compatibility` (agentskills.io fields, ignored where unsupported). Codex additionally receives `metadata.short-description`.

Rationale: Codex's default skill catalog budget is 8,000 characters and 46 wrappers already exceed it, causing descriptions to be shrunk or blanked (blanked descriptions disable implicit invocation). OpenCode and Gemini inject every skill's name, description, and absolute path into every request. Hermes' whole-catalog index is roughly 3k tokens.

**Acceptance Criteria:**
- Total rendered description characters across the tree stay under 6,000.
- A compat scenario captures the skill catalog block at the loopback provider for Codex and OpenCode and asserts its byte size against a budget recorded in `tests/compat/lib/harnesses.mjs`.

**FR-HM10: Agent wrappers are model-invocable, not user-invocable**

The 28 agent wrappers carry `user-invocable: false` (honored by Grok, ignored elsewhere). On Codex, the generator additionally emits `agents/openai.yaml` with `policy.allow_implicit_invocation: false` for agent wrappers so they do not compete for the catalog budget.

**Acceptance Criteria:**
- Grok's `/` menu lists 18 Synthex commands, not 46 entries.
- Codex's `skills/list` shows all 46 with non-blank descriptions after FR-HM9.

**FR-HM11: Stop double-loading the catalog on Claude Code**

Claude Code auto-discovers `skills/` and offers no exclude mechanism, so today every Claude session lists all 46 `synthex:*` wrappers next to the native `synthex:*` commands and agents. The generator writes the portable tree to a directory Claude Code does not auto-scan (working name `portable-skills/`), and the Codex and Grok manifests point their `skills` key at it. Gemini, OpenCode, and Hermes install recipes and compat scenarios are updated to the new path.

**Acceptance Criteria:**
- A Claude Code session with Synthex installed lists 18 commands and 28 agents and zero `synthex:*` skills.
- `codex-plugin.test.ts`, `grok-plugin.test.ts`, `contract.mjs`, `cross-harness-compat.test.ts`, `ADDING_HARNESS.md`, and the four activation scenarios reference the new path; counts remain 18/28/46.
- `/skill-doctor` on Claude Code reports no Synthex skill context cost.

Open question OQ-1 records the alternative of keeping `skills/` and accepting duplication if the rename proves unworkable for a harness.

**FR-HM12: Concrete tool-name map in wrappers**

Wrapper step 4 ("translate Claude Code-specific tool names") becomes a table keyed by host, generated from one source in the generator:

| Claude tool | Codex | Gemini CLI | OpenCode | Grok Build | Hermes |
|-------------|-------|------------|----------|------------|--------|
| Read / Edit / Write | read, `apply_patch`, write | `read_file`, `replace`, `write_file` | `read`, `edit`, `write` | `Read`, `search_replace`, `Write` | `read_file`, `patch`, `write_file` |
| Bash | shell | `run_shell_command` | `bash` | `run_terminal_command` | `terminal` |
| Agent / Task | `spawn_agent` + `wait_agent` | subagent tool, else `activate_skill` | `task` | `spawn_subagent` / `task` | `delegate_task` |
| AskUserQuestion | `request_user_input` (plan mode only), else ask in chat and end the turn | `ask_user` (denied headless) | `question` (denied headless) | `ask_user_question` if listed, else ask in chat | `clarify` (unsafe headless) |
| Workflow, Artifact, ScheduleWakeup, PushNotification, ReportFindings, SendMessage, ListAgents | skip the step | skip the step | skip the step | skip the step; never use Grok's `/workflow` | skip the step |

Plus two rules: "If a named tool does not exist, skip that step once and continue; never retry it" (weak models loop on unavailable-tool errors) and "If the host refuses a nested subagent, adopt the role inline: read the `agents/` file and perform it in this session."

**Acceptance Criteria:**
- The table is emitted verbatim into every wrapper from a single constant in the generator; `--check` stays byte-exact.
- The two rules appear in every wrapper.
- Canary-profile probes on OpenCode and Codex show no repeated calls to an unavailable tool.

**FR-HM13: Plugin root discovery for scripts on non-Claude hosts**

`${CLAUDE_PLUGIN_ROOT}` is set only for Claude Code hooks (and Codex hooks). Every command that runs a script provides the two-line host split already used in `next-priority.md:233-236`, and every wrapper states the installed plugin root as the directory two levels above the wrapper. As a fallback where the variable is not expanded in command prose, the SessionStart hook writes the resolved `plugin_root` into `.synthex/state.json` for prose to read.

**Acceptance Criteria:**
- Every `bash "${CLAUDE_PLUGIN_ROOT}/scripts/...` invocation in `commands/` and `agents/` is immediately followed by the "other hosts" line.
- The SessionStart hook records `plugin_root` in `.synthex/state.json`, and the cold-path include test verifies both the primary and the fallback resolution.

### 4.4 Agent Re-Tiering and Effort Profiles

**FR-HM14: Frontmatter re-tier**

Every agent gains `description:` (one line, used by Claude Code routing and by the generator in place of the H1 for wrapper descriptions). Model and effort tiers are updated for the Claude 5 roster:

| Agent | Today | Target | Reason |
|-------|-------|--------|--------|
| product-manager, architect | opus | opus, `effort: high` (ADR mode `xhigh`) | Opus 5.5 defaults to medium effort; pin to avoid a silent quality drop |
| sre-agent, ux-researcher | opus | sonnet, `effort: high` | Template-driven artifact modes |
| code-reviewer | haiku | sonnet, `effort: medium` | Reads specs and reasons across them; cheapest model in the roster today |
| security-reviewer, terraform-plan-reviewer, tech-lead | sonnet | sonnet, `effort: high` | Unchanged |
| performance-engineer, design-system-agent, quality-engineer, retrospective-facilitator, lead-frontend-engineer | sonnet | sonnet, `effort: medium` | Bounded, template-driven |
| All Haiku utilities and adapters | haiku | haiku, `effort: low`, `tools:` allowlist of the 2 to 4 tools they use | Mechanical work |
| Command drivers (next-priority, write-implementation-plan, refine-requirements, write-rfc) | opus | opus (unchanged in v1) | The driver itself resolves merge conflicts and gates [H] approval; downgrade only after FR-HM40 data |

**Acceptance Criteria:**
- The 28 agents carry `description:`; `claude plugin validate` shows zero description warnings.
- `tools:` allowlists are derived by reading each utility agent end to end (no agent names its tools today); an allowlist never omits `Task`/`Agent` for tech-lead, lead-frontend-engineer, or multi-model-review-orchestrator.
- `tests/helpers/invoke-agent.ts` reads `model:` and `effort:` from frontmatter instead of hardcoding `sonnet`, and the Layer 2 cache key includes both, so re-tiers are evaluable.
- Whether Haiku 4.5 accepts `effort:` and whether command frontmatter honors `effort:` are verified empirically before any command-level effort key ships (the docs contradict themselves on both).
- `tests/schemas/*` regexes that pin `model: haiku` for adapters and utilities still pass; the generator's H1 detection is hardened against `# ` lines inside a block-scalar description (probe-overlay splits on the first `\n---\n`).
- Adding `description:` to **commands** is deferred to OQ-2: Codex converts a plugin's `commands/*.md` into skills at install only when the command has a frontmatter description, which would create duplicates next to the generated wrappers.

**FR-HM15: Model profiles as a config knob**

`defaults.yaml` gains a `models:` block: `models.profile: economy|balanced|premium` (default `balanced`, the FR-HM14 table) plus `models.agents.<name>.model` overrides. Commands apply them via the Agent tool's per-call model override on Claude Code. On other hosts the block is documented as advisory ("apply where the host supports per-subagent model selection; otherwise ignore") and a `hosts.<harness>.models` map may translate tiers to host model ids (for example OpenCode `provider/model`, Gemini `flash|pro|inherit`).

**Acceptance Criteria:**
- Resolution order is documented once per command in a short "Model Resolution" paragraph: flag > `models.agents` > profile > frontmatter.
- The D21 `Review path:` header regex is unchanged; effort or model info, if rendered, goes on its own line.
- Standing-pool routing is documented as unaffected by profiles (pools never re-spawn).

### 4.5 Review Engine and Verification

**FR-HM16: `review-code` workflow engine (Claude Code only, opt-in)**

`code_review.engine: prose|workflow` (default `prose`). When `workflow` is set **and** a `Workflow` tool is in the tool list, `review-code` hands the already-resolved config, diff path, convention sources, and reviewer list to a script that: fans reviewers out in `parallel()` with the canonical finding schema forced as structured output (per-reviewer envelope `{findings[], positives[], summary}` so "What's Done Well" and convention sections survive); dedupes in plain JS by `finding_id` and fingerprint; runs one `effort: medium` verdict call; renders the existing markdown report from the fixed template with D21 and FR-MR17 strings as template literals; and calls `ReportFindings` once per cycle with the consolidated list. The fix-and-re-review loop is a `while` over `max_cycles` with resumed runs reusing the cached reviewer prefix.

Config resolution, standing-pool discovery, the sandbox-yolo confirmation, and diff resolution stay in the command preamble (scripts have no filesystem, shell, `Date.now()`, or `AskUserQuestion`).

**Acceptance Criteria:**
- With `engine: prose`, output is byte-identical to the FR-MR23 baseline.
- With `engine: workflow` on a host without the tool, the command takes the prose path and prints one line saying so.
- The engine is documented in `plugins/synthex/docs/engines/review-code-workflow.md`; the script lives wherever the Workflow-packaging spike shows Claude Code loads plugin workflows from; `review-code.md` references it in at most three lines.
- If a committed config key does not count as the Workflow tool's opt-in, the command asks once per session; the engine is never selected in headless runs, and `/synthex:schedule` recipes force `prose`.
- A spike confirms `agentType: 'synthex:code-reviewer'` resolves from a Workflow script before implementation proceeds; if it does not, the engine inlines reviewer prompts and the acceptance target for cache sharing is dropped.
- The "Context Management" fresh-agent paragraphs that `review-loops.ts` mandates are untouched.
- The multi-model path is unchanged: external proposers still run through the orchestrator; the engine consumes its envelope as a second `parallel()` group.
- Finding lifecycle (fixed, skipped, no change) is tracked in script variables, not in `ReportFindings` (its `outcome` field is undocumented).
- Renderer output is snapshot-tested against the current template.

**FR-HM17: Adversarial refute pass on CRITICAL and HIGH findings**

On the workflow engine, each CRITICAL or HIGH finding is checked by three independent refuters (correctness, does-it-reproduce, security-impact), each seeing only the artifact and the single finding, at `effort: low` on Sonnet 5 (Haiku 4.5's support for `effort` is unverified). A finding survives with two of three non-refuted votes. Refuted findings remain in the audit artifact with a new `verification: {status, method, failure_scenario}` field; the existing `superseded_by_verification` value is not reused.

On the prose path (all hosts), the three review agents gain a short "Verification pass (CRITICAL/HIGH only, top 5)" section: "If an LSP tool is available, use definition/references/diagnostics; otherwise grep for the symbol's references; never block the review on verification." The result renders as a `- **Verification:** CONFIRMED (lsp|grep) | PLAUSIBLE (none)` line inside the existing `#### [SEV] Title` block. The prose pass is opt-in via `code_review.verification: prose|off`, default `off`, because it changes zero-config output and adds tool calls on the default path (NFR-HM1, NFR-HM3); it may become the default once the FR-HM34 suite shows a recall gain.

**Acceptance Criteria:**
- `security-reviewer` rule 8 ("never approve code with CRITICAL findings") is unchanged; a PLAUSIBLE CRITICAL still fails the review.
- The D21 header regex is unchanged.
- `helpers.ts` parsing and the code-reviewer and security-reviewer validators pass with the new line present.

### 4.6 Loop Engine

**FR-HM18: Stage 1, portable loop bookkeeping script**

`scripts/loop-step.sh` (`bash`, `jq` optional, same discipline as `loop-advance-gate.sh`) implements `begin <command> [--name] [--max]`, `advance <id>` (atomic increment, prints the `[loop <id> iteration N/M]` marker, exits non-zero on cancelled or max), `hold <id>` (a decision-wait re-entry that does not increment the counter), `finish <id> <status>`, `archive`, `list`, `cancel [--all]`, and `check-writable`. The Stop-hook gate allows a stop while a decision file is pending, the same way it allows a pending `AskUserQuestion`. The seven refusal paths, the archive algorithm, and the list and cancel output formats move into the script. Command prose shrinks to "run `loop-step.sh advance`; if exit 0 perform the iteration body, else stop." `list-loops` and `cancel-loop` become one Bash call each.

The state-file contract (`.synthex/loops/<id>.json`, session ownership rule, promise sentinel, Stop-hook gate) is unchanged. `tests/helpers/loop-state-lifecycle.ts` becomes a thin wrapper that executes the script so the two cannot drift.

**Acceptance Criteria:**
- Per iteration: one Bash call instead of four to six model-executed tool calls.
- `check-writable` tests a write to `.synthex/loops/` first and prints a host-specific hint on failure (Codex: `--sandbox workspace-write`; Gemini: `--approval-mode yolo` or a policy file; OpenCode headless: `--auto`).
- The script runs on the compat images without `jq` (none of the pinned images ship it).
- Host detection for the writability hint reads a generated `config/hosts.env` (covered by the generator's `--check`) and a `SYNTHEX_HOST` variable the wrappers set; scripts never parse markdown to learn the host.
- `loop-command.test.ts`, `list-loops.test.ts`, `cancel-loop.test.ts`, `loop-state-lifecycle.test.ts`, and `native-looping-doc.test.ts` are rewritten to assert script behavior plus the retained prose anchors (FR-NL and D-NL citations, Archive and Retention headings).
- Shell-timeout envelopes are documented and enforced via `SYNTHEX_LOOP_IDLE_MAX`: Claude Code 600 s (current), Gemini CLI at most 240 s (5-minute hard cap), Grok Build and OpenCode at most 90 s (120 s default), Hermes no cap known.
- Where the host offers background command execution with a poll tool (Grok Build's `background: true` plus `get_command_or_subagent_output`, up to one hour), the idle wait runs that way instead of a foreground sleep, and the wrapper's tool map says so.

**FR-HM19: Stage 2, Workflow-driven loop on Claude Code**

When a `Workflow` tool is in the tool list, `--loop` runs the iteration body as `agent(iterationPrompt(i), {schema: {done, idle, blocked_on_human[], summary}, agentType: 'synthex:tech-lead'})` inside a script loop, so termination is a validated field rather than a `<promise>` regex scan. On `idle` the command calls `ScheduleWakeup` with the existing backoff instead of a 600 s sleep and resumes from `runId`. On `blocked_on_human` it returns to the command, which runs `AskUserQuestion` (or writes the decision inbox, FR-HM31) and resumes. The state file carries an optional `runId`; the Stop-hook gate skips when one is present.

**Acceptance Criteria:**
- Loop protocol prose on the Claude path drops by at least 8 KB.
- Cancel is honored between resumes by re-reading the state file.
- A stale `runId` (state file `last_updated` older than a documented threshold) is cleared so a crashed Workflow run does not make the Stop-hook gate skip forever.
- Timestamps come from `loop-step.sh` calls or `args`, never from the script.
- A spike confirms (a) a plugin can ship a Workflow script, (b) a workflow subagent running `tech-lead` can itself spawn Agent-tool subagents (next-priority fans out to `concurrent_tasks` Tech Leads), and (c) a resume can be triggered from `ScheduleWakeup` without a user turn. If (b) fails, the iteration body is orchestrated by the command and only the Tech Lead tasks run as workflow agents.
- `Monitor` is not required; when absent (headless, Bedrock) the Stage 1 in-turn wait is used.

**FR-HM20: Compaction recovery**

Loop identity survives compaction via a `SessionStart` hook with matcher `compact` that prints the running loop-id and state path (the reliable mechanism; PreCompact stdout is not injected into the summary).

### 4.7 Teams and Pools Folded into Synthex

**FR-HM21: Capability ladder for reviews**

`review-code` and `performance-audit` select their orchestration by tool presence, in this order:

1. If `SendMessage` and `ListAgents` are in the tool list and `standing_pools.enabled` is true and a pool is running: route to the pool (today's synthex-plus behavior, moved into `synthex`).
2. Else if a `Workflow` tool is in the tool list and `code_review.engine: workflow`: FR-HM16.
3. Else if the host can spawn parallel subagents (a tool named `Agent`, `Task`, `task`, `spawn_agent`, or `delegate_task` is present): fan reviewers out in one turn and consolidate via the prose path.
4. Else: sequential reviewers (today's baseline).

**Acceptance Criteria:**
- Detection never keys on host names or on Grok's "Workflows" feature.
- On depth-1 hosts, when the command is already running inside a subagent and a spawn is refused, the command performs the reviewer roles inline (FR-HM12 rule).
- Level 3 is exercised by the Codex and OpenCode canary-profile probes (real models; the activation loopback emits no tool calls).

**FR-HM22: Teammates spawned as plugin agent types**

Where agent teams exist, teammates are spawned with `subagent_type: 'synthex:<agent>'` so identity is the system prompt and survives compaction. The read-on-spawn pattern, the FR-MMT5b per-task identity re-read, and the D26 per-task overlay re-paste are deleted once a 30-minute spike confirms a teammate spawned this way keeps its model and effort. `ADR-plus-002` records the reversal of `ADR-plus-001`.

**Acceptance Criteria:**
- Per standing-pool task, reviewer context drops by 35 to 50 KB (three-reviewer pool).
- Spawn verification uses `ListAgents`, not reading `~/.claude/teams/<name>/config.json`.

**FR-HM23: Real lifecycle gates**

The `TaskCompleted` and `TeammateIdle` hooks are command hooks that exit 2 to block (prompt-type hooks are not supported on those events), with a distilled classification table and reviewer routing in the script, gated by `standing_pools.enabled` so they no-op for non-Synthex teams. The 25 KB of gate prose in `hooks/*.md` is reduced to documentation of the script.

**FR-HM24: Command surface after the fold**

`start-review-team`, `stop-review-team`, and `list-teams` move into `synthex` as commands gated by tool presence (they print the single-sourced documented-gap sentence elsewhere). `configure-teams` also moves but is not gated, because it only writes config and a mixed-host team must be able to author it from any host. `team-review`, `team-implement`, `team-plan`, `team-refine`, and `team-init` are retired; their behavior is the capability ladder inside the existing commands. The generator emits wrappers for the four surviving commands with a `compatibility:` note. Pool configuration moves to `.synthex/config.yaml`; every reader falls back to `.synthex-plus/config.yaml` with a deprecation line for one major version.

**Acceptance Criteria:**
- Final counts after this PRD are 24 commands, 26 agents, and 50 wrappers (the fold adds four commands and three agents; utility retirement removes five agents; `decide` and `schedule` add two commands). Count constants and the eight pinned agents in `synthex-plugin-json.test.ts` are updated in the same commit as each change.
- Every `standing_pools.*` read in the routing doc, the pool commands, and the pool agents points at `.synthex/config.yaml` with the fallback sentence; Layer 2 fixtures cover both the new location and the legacy fallback.
- `tests/schemas/synthex-plus/` suites are ported or deleted with the features they test.

**FR-HM25: Standing pools on other hosts**

Standing pools are a documented gap on Codex (ephemeral in-session teams only), Gemini, OpenCode, and Grok. Hermes' Kanban board is noted as a possible future backend, not implemented.

### 4.8 Zero-Token Scripts and Utility Retirement

**FR-HM26: Scripts replace mechanical utility work**

| Today | Replacement | Notes |
|-------|-------------|-------|
| `context-bundle-assembler` (Haiku re-emits up to 200 KB) | `scripts/assemble-bundle.sh` writes `{manifest, files, needs_summary[]}` to `.synthex/tmp/bundle-<hash>.json`; one Haiku `effort: low` call only for files over `max_file_bytes` | Adds the missing `multi_model_review.context.*` keys to `defaults.yaml` (FR-HM44) |
| `audit-artifact-writer` (never invoked today) | `scripts/write-audit.mjs` with a documented call site in the orchestrator Step 9 | Node required; `command -v node` guard with a prose fallback |
| `dismiss-upgrade-nudge`, `star` state writes | `scripts/state-flag.sh <flag>` reusing `upgrade-nudge.sh` field-preservation rules | `star` keeps its single `AskUserQuestion` on interactive hosts |
| `init` Step 2 (copies 10 KB YAML through model context) | `scripts/init-scaffold.sh` | |
| `plan-scribe` (full-plan round trip three times per cycle) | Retired. The PM writes the draft to the plan path at Step 5 with a `<!-- DRAFT -->` marker and applies accepted findings with the host's edit tool; renumbering rule stated once | Largest output-token saving in the set |
| `plan-linter` | `scripts/lint-plan.mjs` ported from `tests/schemas/implementation-plan.ts` after the two rubrics are reconciled | Node required; `plan-linter.md` kept only until the script reaches parity |

**Acceptance Criteria:**
- Every script is `bash` or `#!/usr/bin/env node`, `jq` optional; each state-writing script calls the FR-HM18 writability check. `.synthex/tmp/` and `.synthex/decisions/` create a self-ignoring `.gitignore` on first write, and bundles are deleted at run end or after 24 hours.
- Each retired agent is removed from `plugin.json` and the wrapper tree in the same commit; `synthex-plugin-json.test.ts` pins are updated.
- The FR-MR9 inline `context_bundle` envelope is unchanged in v1 (adapters are not touched); an optional `context_bundle_path` is future work.

**FR-HM27: Retire `commit-message-author`**

The three delegation blocks (`tech-lead.md`, `lead-frontend-engineer.md`, `next-priority.md`) collapse to one sentence requiring a Conventional Commits subject plus a what/why body, carrying issue keys from the branch name. A `git.commit_convention: conventional|issue-key|gitmoji|plain|auto` key (default `auto`, meaning no lint until `init` has sampled history) is written by `init` from a 50-commit sample. On hosts with hooks, a `PreToolUse` hook on `git commit` lints the subject with the regex `release.yml` uses.

**Acceptance Criteria:**
- The hook fails open: it lints only when the project config explicitly sets `conventional` (a project with no config, or the `auto` default, is never linted, per NFR-HM1), only messages it can extract deterministically (`-m`, `-F <file>`, `-F -` heredoc), skips `--amend --no-edit`, `-C`, `-c`, `--fixup`, `--squash`, and merge commits, tolerates an `rtk git commit` prefix, and returns the fix hint on block.
- The Codex manifest points at a generated `hooks/codex-hooks.json` containing only host-safe hooks (commit-lint at first, with the Codex tool matcher emitted from the host matrix); a test asserts it contains no `Stop`, `SessionStart`, `TaskCompleted`, or `TeammateIdle` entries, so Codex never inherits the loop gate. A Codex canary case confirms a bad subject is blocked with `features.hooks` on. Gemini receives the same script as a `BeforeTool` hook only once an extension manifest exists (future work); Hermes and OpenCode are prose-only.
- `release.yml` continues to detect the semver bump from subjects.

**FR-HM28: Adapter consolidation for multi-model review**

Export the canonical finding schema as `agents/_shared/canonical-finding.schema.json`; add `scripts/validate-findings` (node with a `jq` fallback) that normalizes external CLI stdout (fence strip, NDJSON join), validates, injects `source`, and prints the envelope or a `parse_failed` envelope with the closed FR-MR16 error-code enum. Adapters shrink to roughly 5 KB each but stay executable prose for other hosts. The D17 tier table is single-sourced in `defaults.yaml` as family-keyed rows.

**Acceptance Criteria:**
- Codex adapter passes the schema via `codex exec --output-schema`; Gemini adapter drops the `--readonly`/`--no-tools` probe (neither flag exists) and uses `--approval-mode default --output-format json` headless, with an API-key-aware auth check (FR-HM44).
- Adapter H1s and the eight FR-MR8 section labels that `*-adapter-md.test.ts` assert remain.
- The orchestrator notes the depth-1 rule: on hosts that refuse nested spawns it calls the external CLIs directly via the scripts instead of spawning adapter agents.

### 4.9 Project Facts

**FR-HM29: `.synthex/facts.md`**

`init` writes four facts, each with a freshness rule; commands consult facts before re-detecting:

| Fact | Freshness rule |
|------|----------------|
| `commit_convention` | Re-verify when HEAD moved more than 50 commits past the recorded SHA |
| `test_runner` and coverage command | Re-verify when `package.json` or `pytest.ini` mtime is newer |
| `frontend_framework` | Same rule |
| `spec_index` (path glob to spec file map) | Re-verify when `docs/specs` mtime is newer |

**Acceptance Criteria:**
- Single store; the Claude memory directory is not used for facts (no dual-store rule to enforce).
- Every consumer keeps its detection step as the fallback when the file is missing, so projects that ran `init` before this release keep working.
- `init.md` step numbering that `init-multimodel-md.test.ts` pins is preserved.

### 4.10 Unattended Operation

**FR-HM30: Decision inbox**

When a `--loop` run reaches an `[H]` criterion or a high-impact escalation with `--auto-decide` off, the command writes `.synthex/decisions/<loop-id>-<task-id>.json` `{loop_id, task_id, question, options[], recommendation, links, created_at}` **before** asking. Interactive hosts then call the host's question tool as today (the pinned Step 7 sentences are unchanged). Headless hosts, or hosts whose question tool is denied headless (Gemini, OpenCode, Hermes), skip the question and wait on the file with `loop-idle-wait.sh` using the decision file as an extra watch path. Decision waits do not consume `--max-iterations`.

**FR-HM31: `/synthex:decide <id> <option>`**

Answers an inbox entry from any session on any host; the waiting loop picks it up at its next wake. If a `PushNotification` tool is in the tool list and `notifications.push_on_gate` is set, the gate also sends a notification containing the decide command.

**FR-HM32: `/synthex:schedule`**

Emits an OS-cron or CI recipe for three presets: `nightly-priority` (`next-priority --loop --auto-decide --max-iterations N`), `weekly-retro`, and `pr-review` (`review-code --pr <n>`). The recipe is host-specific and includes the headless flags each host needs:

| Host | Recipe shape |
|------|--------------|
| Claude Code | `claude -p "/synthex:next-priority --loop …"`; in-session `CronCreate` offered as an alternative. Cloud routines only if verified plan-included (FR-HM1) |
| Codex | `codex exec --sandbox workspace-write -a never --output-last-message …` |
| Gemini CLI | `gemini -p … --approval-mode yolo --output-format json` (skills do not activate headless without yolo) |
| OpenCode | `opencode run --command <slug> --auto` |
| Grok Build | OS cron with `grok -p "/synthex:…" --yolo --max-turns N --output-format json`; never `/loop` or `scheduler_create` (they run detached depth-1 subagents that cannot delegate) |
| Hermes | `hermes cron create "<schedule>" "<prompt>" --skill <synthex-skill> --deliver origin` (native, durable) |

**Acceptance Criteria:**
- Writes chosen routines to `.synthex/config.yaml` for visibility with a per-routine iteration cap.
- Adds two commands (`decide`, `schedule`); counts and wrappers updated.
- `tech-lead.md` never mentions `--auto-decide` (locked by `next-priority-auto-decide.test.ts`); the decision request is written by the command layer.

### 4.11 Plan Cockpit

**FR-HM33: Read-only plan projection (Claude Code only, flag-gated)**

When `artifacts.plan_cockpit.enabled` is true and an `Artifact` tool is in the tool list, `write-implementation-plan` publishes `templates/plan-cockpit.html` once and stores its URL in `.synthex/state.json`; `next-priority` writes only the rows that changed this iteration to the artifact database at Steps 3 and 9, with a full-table resync at milestone boundaries only. Unread comments are surfaced as a one-line notice and, when actionable, presented via the host's question tool; they are never auto-applied, especially under `--auto-decide`.

**Acceptance Criteria:**
- The template ships fully compliant with the artifact design contract so no design skills load at runtime.
- On any host without the tool the steps are skipped silently; no HTML file is written locally.
- Plan-tier limits on comments are documented (comments require Team or Enterprise sharing).

### 4.12 Evaluation

**FR-HM34: Plugin eval suite alongside promptfoo**

`plugins/synthex/evals/` holds the 18 planted-issue fixtures as direct-agent cases with deterministic graders only (regex on locked verdict headers, planted CWE IDs, and destructive-action strings; one `tool_used` on the review-code fan-out). Ablation stays on so each release reports the plugin's delta over vanilla Claude. Each fixture runs at least 3 times; a gate passes when aggregate recall is at least the baseline and no fixture loses more than one planted issue (a single run is too noisy to gate a model change). A hash-keyed wrapper skips unchanged cases (the eval harness has no cross-run cache), and the baseline's own variance is recorded in `docs/testing.md`. Layer 1 vitest remains the free PR gate; `tests/compat` remains the multi-host gate.

**Acceptance Criteria:**
- FR-HM14 tier changes and FR-HM15 profiles are gated on planted-issue recall from this suite.
- No LLM or baseline grader gates CI.
- The Artifact tool is not called from inside eval runs (it is disabled there).

### 4.13 Cross-Harness Compatibility Requirements

**FR-HM40: Portable-script contract**

Every shipped runtime script: `bash` (present on every supported host and compat image; the existing scripts are bash) or `#!/usr/bin/env node`; `jq` optional with a working no-`jq` path; a `command -v node` guard where node is required, with the calling command stating the prose fallback; no `python`; a writability preflight for any state write; exit codes documented in the script header. `SYNTHEX_LOOP_IDLE_MAX` is honored by every waiting script. Build-time tools (the wrapper generator and the host matrix) are excluded from this contract by an explicit list. Every runtime script has a smoke case in the compat offline profile covering its happy path and its missing-`jq` or missing-node fallback on each image.

**FR-HM41: Headless approval modes**

Every recipe or doc that runs Synthex headless names the approval flag the host needs (FR-HM32 table). Commands that write state check writability first (FR-HM18) rather than failing silently under `read-only` sandboxes (Codex default for `codex exec`, Gemini headless `default`, OpenCode `run` without `--auto`).

**FR-HM42: Depth-1 delegation rule**

`tech-lead.md`, `multi-model-review-orchestrator.md`, and `next-priority.md` (the three places delegation nests today) carry the rule: "If the host refuses a nested subagent, perform the role inline in this session and continue."

**FR-HM43: Install bundles include `docs/`**

The Gemini per-skill install recipe, the OpenCode `.agents/` copy, the Hermes `.agents/skills/` install, and the compat scenarios' support-bundle copy lists all include `plugins/synthex/docs/` so FR-HM5 includes resolve. The README install layout is updated.

**FR-HM44: Latent defects fixed in this PRD's scope**

- `multi_model_review.context.{max_bundle_bytes, max_file_bytes, convention_paths, spec_paths}` and `per_reviewer_timeout_seconds` are referenced by the orchestrator but missing from `defaults.yaml`.
- `gemini-review-prompter` probes for `--readonly` and `--no-tools`, which do not exist in any Gemini CLI version; its default read-only mode always aborts with `cli_failed`. Its `gcloud auth list` check is wrong for API-key users.
- `code-reviewer` Step 2 "spawn a sub-agent" is dead whenever code-reviewer runs as a subagent; the relevance scan becomes inline and size-gated (`code_review.spec_inline_bytes`, default 64 KB).
- `audit-artifact-writer` has no invocation site; FR-HM26 wires the replacement.
- The multi-model orchestrator's Stage 8g uses a `Date.now()` seed; replaced by an invocation-counter rotation.

**FR-HM45: Harness admission for Hermes and Grok**

"Supported" means present in `tests/compat` with passing `offline` and `activation` profiles per `ADDING_HARNESS.md`. Neither Hermes nor Grok meets that today.

- **Hermes Agent** (Nous Research; v0.21.4, 2026-09-21): admission requires a git-tag pin (no npm package; PyPI is stale and unsupported upstream), a Python + uv + Node Dockerfile, install via project `.agents/skills/` with the full plugin tree (per-skill `hermes skills install` copies only the skill folder and breaks the wrapper's `../../commands/` link), activation via `hermes -z "/<slug> <nonce>"` against an OpenAI-compatible loopback, and a hard timeout to avoid the known headless `clarify` hang. Documented gaps: no plugin-shipped hooks, no Artifact, no ScheduleWakeup, no main-agent output schema. Hermes stays out of the release gate's harness set until two weekly drift runs pass, and its README row carries that footnote.
- **Grok Build** (xAI): admission is blocked on finding a pinnable install (no npm package, no GitHub releases). Until then Grok's README row reads `Manifest-supported (compat pending: no pinnable install)`. Open verification items: whether `.grok-plugin/plugin.json` is honored over `.claude-plugin/`, whether `commands: []`/`agents: []` suppress auto-discovery, and whether plugin hooks dispatch (upstream issue #236).

**Acceptance Criteria:**
- The README's harness table has three states: supported (in compat matrix), manifest-supported (compat pending, with the blocker named), and not supported.
- `generate-codex-skills.mjs`'s header lists every harness the tree targets.

---

## 5. Cross-Harness Impact Analysis

Researched 2026-09-23 against: Codex CLI 0.154.0 pinned (0.156.1 current), Gemini CLI 0.39.1 pinned (0.61.0 current), OpenCode 1.18.15 pinned (1.18.32 current), Grok Build 1.0.40, Hermes Agent v0.21.4. Verdicts: **WORKS** (runs unchanged), **DEGRADED** (runs with the named fallback), **NO-OP** (skipped; safe when gated on tool presence), **BREAKS** (misbehaves unless mitigated).

### 5.1 Verdict matrix

| Proposal | Codex | Gemini CLI | OpenCode | Grok Build | Hermes |
|----------|-------|------------|----------|------------|--------|
| P1 Prompt diet, cold-path split, `@CLAUDE.md` | WORKS | DEGRADED: `docs/` must ship; no CLAUDE.md injection | WORKS: wrapper trim is the big win here | WORKS | DEGRADED: first-match context file |
| P2 Workflow review engine | NO-OP if tool-gated; BREAKS if config-gated only | NO-OP if tool-gated | NO-OP if tool-gated | DEGRADED: must not confuse Grok "Workflows"; BREAKS if config-gated only | NO-OP if tool-gated |
| P3 Agent frontmatter re-tier | NO-OP (inert) | NO-OP now; BREAKS if files become Gemini subagents (Claude tool names, model ids) | NO-OP now; BREAKS if copied into `.opencode/agents` | NO-OP (`agents: []`) | NO-OP |
| P4 Loop Stage 1 script | DEGRADED: `read-only` sandbox blocks writes | DEGRADED: approval prompts; 5-min shell cap; no Stop hook | WORKS in TUI; DEGRADED headless (`--auto`, no `jq`) | WORKS; 120 s shell cap | WORKS; `/goal` or cron is a better native fit |
| P4 Loop Stage 2 workflow | NO-OP | NO-OP | NO-OP | NO-OP | NO-OP |
| P5 Teams fold-in | DEGRADED: ephemeral in-session teams via `spawn_agent`/`send_message` | DEGRADED: single session | DEGRADED: parallel `task`, depth 1 | DEGRADED: depth 1; watch false positives on "Workflows" | DEGRADED: flat `delegate_task`; Kanban is a future pool backend |
| P6 Zero-token scripts | WORKS (workspace-write) | WORKS interactive; DEGRADED headless | WORKS (no `jq`) | WORKS for `sh`; DEGRADED for node/`jq` | WORKS (Node 26 installed) |
| P7 Drop commit-message-author | DEGRADED: hook runs only with `features.hooks` | WORKS prose; hook NO-OP | DEGRADED: prose only | WORKS prose; hook not dispatched | DEGRADED: hook must be user-installed |
| P8 Decision inbox, schedule | DEGRADED: inbox works; no push; cron recipe | DEGRADED: inbox is the only headless gate; waits capped | DEGRADED: inbox is the only headless gate | DEGRADED: never `/loop`; cron recipe | DEGRADED: native cron is better than a recipe |
| P9 Facts file | WORKS | WORKS | WORKS | WORKS | WORKS |
| P10 Plan cockpit | NO-OP | NO-OP | NO-OP | NO-OP | NO-OP |
| P11 Adapter consolidation | WORKS; `--output-schema` native | WORKS and fixes a latent break | WORKS (node) | DEGRADED (node/`jq`); fixes depth-2 spawn failure | WORKS (node) |
| P12 Plugin eval | NO-OP | NO-OP | NO-OP | NO-OP | NO-OP |

### 5.2 Cross-cutting findings

1. **Skill catalog cost is a tax on every host, not just Claude Code.** Codex budgets 8,000 characters (already exceeded, causing blanked descriptions); OpenCode and Gemini inject name, description, and absolute path for all 46 wrappers into every request (estimated 3 to 5k tokens); Hermes indexes the whole catalog at roughly 3k tokens. FR-HM9 to FR-HM11 address this. On OpenCode and Gemini the larger structural fix is to generate native agent and command files instead of agent wrappers (Future Work).
2. **Only `name` and `description` are honored in skill frontmatter anywhere.** `allowed-tools`, `model`, and `effort` are ignored by Codex, Gemini, OpenCode, and Hermes; Grok honors `user-invocable`. Agent frontmatter (`model: opus|sonnet|haiku`) is never read outside Claude Code because every other host reaches agents only through wrappers. That is why FR-HM14 is safe as long as the canonical files are never copied verbatim into a host's native agent directory.
3. **Config keys are shared; tool presence is not.** `.synthex/config.yaml` is committed. A team member on Claude Code setting `code_review.engine: workflow` must not make a Codex colleague's session try to emulate a Workflow script. FR-HM3 is the load-bearing rule.
4. **No Stop hook exists anywhere but Claude Code.** Gemini's `AfterAgent` deny-retry is the closest analogue but requires an extension manifest; OpenCode's `session.idle` is observe-only; Codex honors `Stop` only when the user enables `features.hooks`; Grok does not dispatch plugin hooks (issue #236); Hermes has no Stop hook. Loops must stay in-turn on those hosts, which the current design already assumes.
5. **Shell timeouts differ by host.** Claude Code 600 s (current default), Gemini CLI 5-minute hard cap, Grok Build and OpenCode 120 s default. `SYNTHEX_LOOP_IDLE_MAX` already exists; FR-HM18 makes it mandatory in recipes.
6. **Headless modes deny questions.** Gemini `ask_user`, OpenCode `question`, and Hermes `clarify` are denied or hang headless; Codex's `request_user_input` exists only in plan mode. The decision inbox (FR-HM30) is therefore the correct headless `[H]` gate on every host, not just a Claude convenience.
7. **Depth-1 delegation is common.** OpenCode (default), Grok Build, and Hermes (default) refuse nested subagents. Today `multi-model-review-orchestrator` cannot spawn adapter agents on those hosts; FR-HM28's scripts and FR-HM42's inline rule fix this.
8. **`jq` is absent from every pinned compat image and from Hermes' installer.** Node is present on all of them. Scripts must have a no-`jq` path; node is acceptable behind a guard.
9. **Context-file injection differs.** Codex and OpenCode read `AGENTS.md` and only fall back to `CLAUDE.md`; Gemini reads `GEMINI.md`; Hermes is first-match across `.hermes.md`, `AGENTS.md`, `CLAUDE.md`; Grok injects both. FR-HM7 replaces the inline include with a host-aware read.
10. **Gemini CLI distribution changed.** Since 2026-06-18 only Code Assist Standard/Enterprise and paid API-key users can run `gemini`; consumer tiers moved to Antigravity CLI (`agy`), which reads `.agents/skills/` and imports Gemini extensions. The compat matrix should consider adding `agy` (Future Work).

### 5.3 Per-harness notes

**Codex CLI.** Native multi-agent (`spawn_agent`, `wait_agent`, `send_message`, `list_agents`) with per-agent model and reasoning effort, so FR-HM21 level 3 is strong here. `.codex-plugin/plugin.json` accepts `hooks` (Claude JSON shape, `${CLAUDE_PLUGIN_ROOT}` alias) but not `agents` or `commands`. Codex migrates a plugin's `commands/*.md` into skills at install only when a command has a frontmatter `description` (OQ-2). `codex exec` defaults to a read-only sandbox, so state-writing scripts need `--sandbox workspace-write`. `codex exec --output-schema` enforces JSON natively, which FR-HM28 should use.

**Gemini CLI.** Plain skills cannot carry hooks, agents, policies, or a context file; a `gemini-extension.json` can (Future Work). Skills activate only after user confirmation, which headless `default` mode denies; loops and scripts need `--approval-mode yolo` or a policy file. The 5-minute shell cap kills the current 540 s idle wait. Subagents exist but Synthex ships none in Gemini format; Claude `tools:` names match no Gemini tool, so canonical agent files must never be registered as Gemini agents unmapped.

**OpenCode.** Native `task` subagents with per-agent model, parallel calls, depth 1, background behind an experimental flag, no worktree parameter. Rich plugin hooks exist but only as JS modules. Structured output is SDK-only. `opencode run` auto-rejects every permission ask unless `--auto`. Reads `.claude/skills` and `.agents/skills`, not `.claude/agents`. The recommended structural change is to generate `.opencode/agents/*.md` and `.opencode/commands/*.md` so `task` can target Synthex roles natively.

**Grok Build.** `.grok-plugin/plugin.json` with `commands: []` and `agents: []` avoids double registration, but whether Grok honors that manifest over `.claude-plugin/` is unverified. Plugin hooks are not dispatched (issue #236). `/loop` and `scheduler_create` run detached depth-1 subagents that cannot delegate, so scheduled Synthex must use OS cron with `grok -p`. Grok has its own "Workflows" feature; prose must never say "run the Workflow script" without the tool-presence qualifier. No compat adapter exists and no pinnable install has been found.

**Hermes Agent.** Loads skills from `.agents/skills/` (not `.claude/skills`); every skill doubles as a slash command; `delegate_task` supports `output_schema`, batching, background, and worktree isolation but not per-task model or system prompt. Native durable cron with chat delivery is better than any recipe. Not in the repo today; FR-HM45 defines admission.

### 5.4 Test and CI gates that lock the current shape

| Gate | File:line | Affected by |
|------|-----------|-------------|
| Command/agent/wrapper counts 18/28/46 and skill-tree sync | `tests/schemas/cross-harness-compat.test.ts:40-48, 240-249` | FR-HM24, FR-HM26, FR-HM27, FR-HM32 |
| Generator `--check` byte-exact | `codex-plugin.test.ts:38-45`, `grok-plugin.test.ts:63-70` | FR-HM9 to FR-HM12 (regenerate in the same commit) |
| Every manifest entry needs a SKILL.md | `tests/compat/lib/contract.mjs:4-44`, `probe-overlay.mjs:39-53` | FR-HM11 |
| Eight pinned agents | `synthex-plugin-json.test.ts` | FR-HM26 |
| Verbatim D21/D25/FR-MMT17/FR-MR21 strings in command files | `review-code-md`, `review-code-routing`, `performance-audit-routing`, `sandbox-yolo-*` tests (~90 assertions) | FR-HM5 |
| Context Management fresh-agent prose in six commands | `review-loops.ts:186-209` | FR-HM16 must not touch |
| Native-looping headings, params, FR-NL/D-NL citations | `native-looping-wiring`, `native-looping-doc`, `loop-*` tests | FR-HM18, FR-HM19 |
| `tech-lead.md` never mentions `--auto-decide`; Step 7 sentences | `next-priority-auto-decide.test.ts:84-100` | FR-HM30 |
| `init.md` step order | `init-multimodel-md.test.ts:277-310` | FR-HM29 |
| Release runs offline and activation on the staged artifact | `release.yml:344-358` | Everything that changes the tree |

### 5.5 Existing idioms to reuse

- Host-split command lines: `next-priority.md:233-239`.
- Capability-absence paragraph: `docs/native-looping.md:194`, `hooks/loop-advance-gate.md:101`.
- Config-key gate: `review-code.md:47`.
- Tool-availability fallback: `multi-model-review-orchestrator.md:259`.
- Env shim for timeouts: `scripts/loop-idle-wait.sh:22-24`.

### 5.6 `synthex-plus` phase-out blast radius

Marketplace and manifest (`.claude-plugin/marketplace.json:26-39`, `plugins/synthex-plus/.claude-plugin/plugin.json`); `release.yml` (roughly 13 lines: 178-263, 292, 373-407, 488, 509) and `cross-harness-compat.test.ts:206`; the plugin tree (11 commands, 3 agents, hooks, 3 scripts, 5 templates, 4 docs, config, README); cross-references inside `synthex` (`review-code.md:45-161`, `performance-audit.md:38-151`, `docs/native-looping.md` slug table, `README.md:191-207`); repo docs (`README.md`, `CLAUDE.md:187-204`, `.gitignore:33`, `docs/reqs/plus.md`, `docs/plans/plus.md`, `docs/reqs/multi-model-teams.md`, `docs/specs/multi-model-teams/*`, `docs/specs/spike-agent-teams-api.md`, two retros and plans); tests (`tests/schemas/synthex-plus/` three suites plus roughly 35 other suites, `tests/helpers/claude-provider.js:58,145-156`, `tests/promptfoo.config.yaml` 17 references, `tests/fixtures/multi-model-teams/**`, native-looping baseline snapshots).

---

## 6. Non-Functional Requirements

**NFR-HM1: Zero-config compatibility.** A project with no new config keys sees byte-identical outputs from every command on every host, except for the token reductions in §4.2, which change prompts but not outputs.

**NFR-HM2: Measured savings.** Every token claim in this PRD is verified before merge by a Layer 2 fixture or a compat loopback capture and recorded in `docs/testing.md`. Current verified estimates: review-code default path halved (~3.3k tokens per invocation); performance-audit down ~2k tokens; 400 to 500 tokens per specialist spawn from boilerplate; 6 to 9k tokens per review cycle on the workflow engine; 35 to 50 KB per standing-pool task from identity-as-system-prompt; 7 to 15k Haiku tokens per commit from retiring `commit-message-author`; 30 to 45k output tokens per plan cycle from retiring `plan-scribe`.

**NFR-HM3: Cost floor.** No change increases per-invocation cost on the default path of any command on any host, except FR-HM14's move of `code-reviewer` from Haiku to Sonnet and the `effort:` pins that pass the FR-HM34 eval gate, each accepted deliberately with token cost recorded before and after.

**NFR-HM4: Portability parity.** For each proposal, the §5.1 verdict is the contract: a WORKS or DEGRADED cell must hold for that host, with request-side facts (catalog size, install shape) checked in the compat activation profile and tool-behavior facts (no unavailable-tool retry, instruction-file read, parallel fan-out) checked in the credential-gated canary profile, because the activation loopback providers never emit tool calls.

**NFR-HM5: Single source of truth.** Anything emitted per host (wrapper descriptions, tool maps, tier tables, headless recipes) is generated from one constant or one config block; `--check` proves the tree is in sync.

**NFR-HM6: Testability.** Layer 1 remains the free PR gate; `tests/compat` remains the multi-host gate; `plugins/synthex/evals/` is the Claude behavioral gate for tier changes. Any FR that moves prose must repoint, not delete, the assertions that locked it.

**NFR-HM7: Documentation.** README (harness table with three support states, cost commitment), CLAUDE.md (agent and command tables, harness list, no synthex-plus section), `config/defaults.yaml` (every new key with a comment), `docs/testing.md`, `docs/agent-interactions.md` (relocated Interaction tables).

---

## 7. Out of Scope

- Any usage-billed feature (FR-HM1).
- Rewriting the multi-model orchestrator's Stages 3 to 5 in JavaScript: it removes no subagent call and the adapter files must stay executable prose for other hosts.
- Per-host native agent and command generation for OpenCode and Gemini (`.opencode/agents`, `gemini-extension.json`): valuable, but a packaging project of its own (Future Work).
- Hermes Kanban as a standing-pool backend.
- Prompt-cache layout tricks in prose: the subagent cache defaults to five minutes, effort-invariant caching is unavailable on Bedrock, and nothing strips HTML comments.
- Command-level `description:` frontmatter until OQ-2 is resolved.
- Cloud routines (`/schedule`) as a default scheduler until billing is verified plan-included.
- Downgrading the four Opus command drivers.
- Antigravity CLI support (tracked as Future Work).

---

## 8. Success Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| `review-code` default-path prompt bytes | ≤ 15 KB (from 27.6 KB) | Layer 1 size assertion |
| Claude Code sessions list zero `synthex:*` skills | 0 | Manual plus `/skill-doctor` |
| Codex skill catalog under budget with no blanked descriptions | 100% of 46 non-blank | Compat activation capture |
| OpenCode `<available_skills>` block size | ≤ 60% of today | Compat loopback capture |
| Loop bookkeeping tool calls per iteration | 1 (from 4 to 6) | Layer 2 transcript count |
| Utility agents retired | 5 of 6 (commit-message-author, plan-scribe, plan-linter, context-bundle-assembler, audit-artifact-writer) | `plugin.json` diff |
| Native-only review output byte-identical to FR-MR23 baseline | 100% | Snapshot |
| Planted-issue recall after re-tier | No regression on 18 fixtures | FR-HM34 suite |
| Standing-pool per-task reviewer context | −35 KB or better | Layer 2 transcript size |
| Every Claude-only tool reference is tool-presence gated | 100% | Layer 1 grep test (FR-HM3) |
| All five harnesses pass offline and activation profiles after the wrapper-tree rename | 5 of 5 (Grok and Hermes once admitted) | `agent-tests.yml` |
| Latent defects in FR-HM44 fixed | 5 of 5 | Layer 1 and adapter fixtures |
| `synthex-plus` removed from marketplace and release | Complete | `release.yml`, marketplace diff |

---

## 9. Assumptions & Constraints

**Assumptions:**
- Workflow scripts can be shipped inside a plugin and can target plugin agents by `agentType` (spike in FR-HM16 and FR-HM19; a June 2026 upstream issue requested plugin-distributed workflows, so implementation may lag documentation).
- The Agent tool's per-call `model` override works for plugin agents (verified in Claude Code 2.1.281).
- Node is present on developer hosts that run Synthex; scripts that require it degrade to prose when it is absent.
- Codex's install-time command migration behaves on 0.154.0 as it does on `main` (OQ-2).
- Users of shared repos accept that `.synthex/config.yaml` keys are advisory on hosts that lack the corresponding capability.

**Constraints:**
- Per `CLAUDE.md`: agent and command definitions are markdown. This PRD introduces runtime scripts under `scripts/` (already precedent: three shell scripts) and one JavaScript workflow file; it does not introduce a runtime dependency on any package.
- Release automation owns version bumps; this work ships as Conventional Commits with `feat:` (minor) for new commands. The major bump for the `synthex-plus` fold is requested through `.release-intent.json` (`bump: major`) committed in the tombstone task's own `feat!:` commit, because this repo merges with merge commits whose subjects `release.yml` does not read; the later marketplace-removal commit is `chore:`.
- The `synthex-plus` fold lands as one integration branch with CI enabled for it, merged as a single PR after the tombstone release, so no half-folded state (doubled pool commands or doubled lifecycle hooks) is ever released.
- The FR-MR23 byte-identical native path and the loop state-file contract are frozen interfaces.
- Layer 2/3 caches key on agent file hashes; each agent edit invalidates cached outputs once (roughly $11 per full re-run at current fixture counts).

---

## 10. Phasing

Ordered by value over effort, honoring dependencies. Each phase is independently shippable.

| Phase | Contents | Effort | Depends on |
|-------|----------|--------|------------|
| 1 | FR-HM5 to FR-HM13 (prompt diet, wrapper trim, catalog split, tool map), FR-HM44 defect fixes, FR-HM43 docs bundling | M | — |
| 2 | FR-HM14 frontmatter re-tier (PR-A: descriptions plus Opus effort pins plus utility `tools:`/`effort: low`), FR-HM34 eval suite, `invoke-agent.ts` frontmatter support | S + M | — |
| 3 | FR-HM18 loop Stage 1 script, FR-HM20 compaction recovery, FR-HM40/41 script contract and headless recipes | L | — |
| 4 | FR-HM26 to FR-HM28 zero-token scripts, utility retirement, adapter consolidation; FR-HM29 facts | M | 3 (writability preflight) |
| 5 | FR-HM2, FR-HM21 to FR-HM25 teams fold-in and `synthex-plus` removal (spike-gated) | L | 1 (cold-path docs hold the pool routing) |
| 6 | FR-HM16, FR-HM17 workflow review engine and refute pass (spike-gated) | L | 2 (schema exports), 4 (validator) |
| 7 | FR-HM19 loop Stage 2 (spike-gated) | L | 3, 6 |
| 8 | FR-HM30 to FR-HM32 decision inbox, decide, schedule | M | 3 |
| 9 | FR-HM33 plan cockpit | M | 8 |
| 10 | FR-HM45 Hermes admission; Grok admission when a pin exists | M each | 1 (wrapper tree) |

---

## 11. Future Work / Extension Points

- Generate `.opencode/agents/*.md` and `.opencode/commands/*.md` so OpenCode's `task` can target Synthex roles natively and the catalog shrinks by 28 entries.
- Generate `gemini-extension.json` with skills, mapped agents, hooks (`AfterAgent` loop gate, `BeforeTool` commit lint), policies for `scripts/`, and a `GEMINI.md`.
- Generate Codex `agents/openai.yaml` roles from agent frontmatter (`effort:` to `model_reasoning_effort`).
- Antigravity CLI (`agy`) as a compat harness alongside or instead of Gemini CLI.
- Hermes Kanban as a standing-pool backend; Hermes native cron as the `/synthex:schedule` target.
- An optional `context_bundle_path` in the FR-MR9 envelope for agentic-tier adapters.
- An optional OpenCode JS plugin that re-prompts on `session.idle` while a loop is running (the only Stop-hook analogue there).
- Sonnet drivers for the four Opus commands once FR-HM34 data supports it.
- LSP-grounded verification beyond the top five findings.

---

## 12. Open Questions

**OQ-1: Wrapper tree location.** FR-HM11 renames `skills/` to stop Claude Code double-loading the catalog. If any harness cannot be pointed at a renamed directory (Gemini and OpenCode rely on install recipes, Hermes on `.agents/skills/`), the fallback is to keep `skills/` and accept the duplication on Claude Code. Decide after a one-day spike across the four compat scenarios.

**OQ-2: Command `description:` frontmatter on Codex.** Codex migrates plugin `commands/*.md` into skills at install when a frontmatter `description` exists, producing duplicates next to generated wrappers. Verify on 0.154.0; if confirmed, commands stay description-free and the generator sources wrapper descriptions from a generator-side table instead.

**OQ-3: Haiku 4.5 and `effort:`.** Researchers disagree on whether Haiku accepts the effort parameter. Verify empirically; if not, utilities keep default effort and FR-HM17 refuters run on Sonnet 5 at `effort: low`.

**OQ-4: Command frontmatter `effort:`.** The Claude Code docs both confirm and deny support. Verify before any command-level key ships.

**OQ-5: Cloud routine billing.** If `/schedule` cloud routines draw on plan-included usage, `/synthex:schedule` may offer them on Claude Code; otherwise the OS-cron recipe remains the only Claude option (FR-HM1).

**OQ-6: Grok manifest precedence and pinning.** Whether `.grok-plugin/plugin.json` is honored over `.claude-plugin/`, whether `commands: []` suppresses discovery, and how to pin a Grok Build version for a container. Without answers Grok stays manifest-supported only.

**OQ-7: Hermes install path.** Whether `hermes skills list` enumerates project-tier skills and whether `skill_view` may read outside the skill directory; determines the Hermes offline-profile design.

**OQ-8: Workflow subagent nesting.** Whether a workflow subagent running `tech-lead` can spawn Agent-tool subagents (FR-HM19). If not, next-priority's fan-out stays in the command and only tasks run as workflow agents.

**OQ-9: Teammate identity spike.** Whether a teammate spawned as `synthex:<agent>` keeps that agent's model and effort and survives compaction with its identity (FR-HM22). If not, ADR-plus-001's read-on-spawn stays.

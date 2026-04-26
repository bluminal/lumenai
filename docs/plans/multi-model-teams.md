# Implementation Plan: Multi-Model Review on Synthex+ Teams + Standing Review Pools

## Overview

Implements `docs/reqs/multi-model-teams.md`. Bundles two features sharing architecture and config surface: **Feature A** — multi-model orchestrator runs alongside the native team in `/synthex-plus:team-review` (FR-MMT3/4/19/20/21); **Feature B** — standing review pools created via three new synthex-plus commands, with `/review-code` and `/performance-audit` discovering and routing to matching pools (FR-MMT5–18, FR-MMT22–32). Both off by default; existing Synthex+ behavior unchanged when disabled. Depends on `docs/plans/multi-model-review.md` (parent) shipping the orchestrator agent, canonical finding schema, adapter contract, and command-agnostic audit writer; foundation here can run concurrently with parent's Phase 5+, but Feature-A integration gates on parent's Phase 6. Feature B is independent of the parent.

## Decisions

| # | Decision | Context | Rationale |
|---|----------|---------|-----------|
| D1 | **Bundle as one plan; sequence Feature A before Feature B.** Phase 1 = foundation; Phases 2–4 = Feature A; Phases 5–7 = Feature B; Phase 8 = cross-cutting. | Interview row 1 | A is closed-scope; B introduces standing-pool lifecycle complexity. Multi-model-on-pool variant (A∩B) gates on A. |
| D2 | **Parent-plan dependencies are explicit prerequisites.** Blocks on parent's Task 1 (canonical finding schema), Task 4 (adapter contract), Phase 3 milestones 3.1–3.3 (orchestrator + consolidation), Milestone 4.0 (command-agnostic audit writer). Foundation here runs concurrently with parent's Phase 5+; Feature-A integration phases gate on parent's Phase 6. | Interview row 2; FR-MMT2 | Parent ships orchestrator + audit writer once; this plan reuses verbatim. Concurrent Phase 1 reduces calendar time. |
| D3 | **Architecture = Option B (orchestrator beside the team).** Native team unchanged; orchestrator instantiated in host session alongside; pulls native findings from team mailbox; owns canonical consolidation; team Lead becomes pass-through publisher of orchestrator's report. | FR-MMT3, locked pre-interview | Option A doubles adapter complexity, Option C conflates Lead workflow with consolidation. |
| D4 | **Lead suppression = spawn-time prompt augmentation (not runtime detection).** Implemented as a labeled prose overlay section in `templates/review.md` titled `### Multi-Model Conditional Overlay (apply when multi_model=true)` containing FR-MMT4 suppression instructions. Lead's spawn prompt receives this section verbatim when `multi_model: true`. | FR-MMT4, locked pre-interview | Race-free; verifiable by inspecting composed spawn prompt. |
| D5 | **FR-MMT20 native-reviewer structured-output contract = template-only change.** Reviewer JSON-envelope clause added to the `### Multi-Model Conditional Overlay` section in `templates/review.md`. The four v1-supported reviewer agent files are NOT modified. JSON envelope = canonical finding schema from parent's Task 1 verbatim. | FR-MMT20(a-d), interview row 3 | Preserves byte-identical behavior of standard `/synthex:review-code`. Tests validate composed spawn prompt + mailbox shape; not agent files. |
| D6 | **Pool storage paths NOT user-configurable in v1.** `~/.claude/teams/standing/` and `~/.claude/tasks/standing/` are hardcoded and form the discovery convention. | FR-MMT6 storage_root comment | Discovery would need separate path-resolution; cross-session lifetime depends on path consistency. |
| D7 | **Index-entry schema (FR-MMT9b) denormalizes `pool_state` and `last_active_at` from per-pool `config.json`.** Pool Lead writes both `config.json` (canonical) and `index.json` (cache) on every state transition; reconciliation favors `config.json`. | FR-MMT9b, NFR-MMT3 (< 100ms discovery for 10 pools) | Avoids N filesystem reads per discovery. |
| D8 | **Cross-session locking = `mkdir`-based POSIX atomic directory creation.** Acquire via `mkdir ~/.claude/teams/standing/.index.lock`; release via `rmdir`. 10s wait, 100ms polling; abort with documented stale-lock cleanup hint. | FR-MMT9a, locked pre-interview | Only atomic primitive available through Bash tool without runtime code. |
| D9 | **Lazy TTL enforcement, no daemon.** TTL eligibility checked at every discovery-bearing operation. Two-step cleanup classifies pool by `last_active_at` staleness ("probably alive" → shutdown signal + drain; "probably dead" → FR-MMT22 stale-pool path). 5-minute hardcoded freshness threshold per FR-MMT13. | FR-MMT13, locked pre-interview | No new daemon; pool may outlive nominal TTL (documented). |
| D10 | **v1 routing scope = `/review-code` + `/performance-audit` only.** The other 5 standard Synthex commands are documented as v2 extension points. | FR-MMT15; interview row 6 | Default standing-pool roster doesn't cover other commands' planning-role reviewers; hit rate ~0%. |
| D11 | **Routing semantics default = prefer-with-fallback (silent fall-through).** `explicit-pool-required` is a config-only opt-in (no per-invocation flag in v1, per OQ-2). | FR-MMT17 | Friendliest default for users transitioning into pool usage. |
| D12 | **Three new standing-pool commands ship in one milestone (5.1).** `start-review-team`, `stop-review-team`, `list-teams` together with `plugin.json` registration in a single coordinated PR. | Interview row 4 | Tightly coupled lifecycle UX; coordinated `plugin.json` write avoids three-way merge conflict. |
| D13 | **Testing calibration matches parent plan's D11.** Layer 1 schema validators for every new agent/command/artifact; Layer 2 fixtures for orchestrator-team bridge, pool routing/discovery, lifecycle, FAIL re-review under multi-model, FR-MMT24 recovery, FR-MMT22 stale-pool cleanup, FR-MMT14a draining; Layer 3 (semantic eval for `/team-review --multi-model`) deferred to post-v1 fast-follow alongside parent's Milestone 7.3. | Interview row 5; NFR-MMT6 | Bridge correctness, routing edge cases, lifecycle race conditions are highest-value targets. |
| D14 | **Documentation lives at `docs/specs/multi-model-teams/`** — `architecture.md`, `pool-lifecycle.md`, `routing.md`, `recovery.md`. User-facing design doc at `plugins/synthex-plus/docs/standing-pools.md` per NFR-MMT8. | Interview row 7; NFR-MMT8 | Mirrors parent plan's D15 split-by-concern pattern. |
| D15 | **Multi-model preflight (FR-MMT9 step 5) reuses parent's preflight subroutine** from parent plan Task 21 verbatim. | FR-MMT9 step 5 | Single source of truth for which-CLI / auth / family-diversity / aggregator-tier checks. |
| D16 | **Pool spawn cost-warning trigger (NFR-MMT2) is a single condition.** Trigger when `reviewer_count >= 4 OR (reviewer_count >= 2 AND ttl_minutes > 240)`. One-line message displayed before spawn confirmation in FR-MMT9 step 10. | NFR-MMT2 | PRD-locked. |
| D17 | **Per-finding attribution telemetry (FR-MMT30a) is opt-out, defaulting to `true`.** Config flag `multi_model_review.audit.record_finding_attribution_telemetry` lives in `.synthex/config.yaml` (parent's namespace), NOT `.synthex-plus/config.yaml`. Schema follows FR-MMT30a verbatim. | FR-MMT6 cross-file resolution; FR-MMT30a | Standard Synthex audit-config namespace; synthex-plus does NOT define a duplicate key. |
| D18 | **Pool name validation (FR-MMT9 step 3) lives in `start-review-team.md` before any filesystem write.** Regex `^[a-z0-9][a-z0-9-]{0,47}$`; case-insensitive existence check; reserved names `index`, `standing`, leading `.`. Verbatim error per FR-MMT9 step 3. | FR-MMT9 step 3 | Validates before lock acquisition; bad names never leave partial state. |
| D19 | **FR-MMT24 per-task recovery dedup partial pass = Stage 1 + Stage 2 only.** Recovery reviewer's appended findings run through orchestrator's Stage 1 (fingerprint dedup) + Stage 2 (lexical dedup) against already-consolidated output. Stages 3–6 NOT re-run. Reuses parent plan's Stages 1+2 as a "partial dedup" entry point. | FR-MMT24 multi-model dedup gap fix | Preserves "lightweight merge" cost guarantee (~5% of full); avoids changing finalized severity/CoVe outcomes. |
| D20 | **Audit artifact extensions (FR-MMT30/30a) extend parent's Milestone 4.0 audit writer.** No new writer; parent's writer is parameterized by command name AND optional `team_metadata` / `pool_routing` / `recovery` / `finding_attribution_telemetry` blocks. Schema validator extended in this plan. | D2; FR-MMT30/30a; parent D20 | Parent locked the writer as command-agnostic; this plan extends with feature-specific blocks. |
| D21 | **`team-init` updates (FR-MMT27) insert at parent's Step 5/6 boundary** — after config write, before guidance output. Two new sections ("Standing review pools (optional)", "Multi-model in /team-review (optional)"). Step 7 guidance gains the three new commands when `standing_pools.enabled: true`. | FR-MMT27 insertion point | Co-locates questions with config write so answers persist in same operation. |
| D22 | **Synthex+ template overlay mechanism = labeled prose sections, not a Handlebars-style rendering layer.** `templates/review.md` exposes overlays as explicit Markdown sections (e.g., `### Multi-Model Conditional Overlay (apply when multi_model=true)`). Commands compose teammate spawn prompts by reading `templates/review.md` and conditionally including the relevant overlay sections **verbatim** when their flags resolve true. No rendering engine; the host model interprets conditional inclusion via workflow markdown. Test surface = raw-string match on what the command writes into the spawn-prompt blob. | Architect cycle 1 finding; user-confirmed reframe (path b) | Synthex+ has no Handlebars/Mustache layer; fabricating one is out of scope. Locks the convention to prevent recurring confusion. |
| D23 | **`lifecycle.submission_timeout_seconds: 300` is a top-level sibling of `standing_pools:` in `plugins/synthex-plus/config/defaults.yaml`.** NOT nested under `standing_pools.lifecycle.*`. | Tech Lead cycle 1 finding; FR-MMT16a | The setting governs submission polling for any command submitting to a pool — not a pool-config knob. Matches existing convention for cross-cutting lifecycle controls. |
| D24 | **NFR-MMT5 wall-clock parallelism verification deferred to Phase 10 (Layer 3).** v1 release accepts NFR-MMT5 as "verified by structural assertion" — Task 18 records sequencing only and asserts FR-MMT21 step 2 parallelism instruction is present in workflow markdown. Live wall-clock fixture (Task 77) ships post-v1, mirroring parent Task 23/61a precedent. | Architect cycle 1 finding; parent precedent | Live multi-model wall-clock measurement is expensive and flaky in CI. |
| D25 | **NFR-MMT7 user-visible string copy locked verbatim in this plan and embedded in Task 55 body.** The four user-visible strings are reproduced word-for-word inside Task 55. Identical strings reused in Task 57 for `/performance-audit`. | Designer cycle 1 finding; FR-MMT7 | Two commands authoring strings independently invites UX drift. |
| D26 | **FR-MMT5b identity-confirm and FR-MMT20 JSON-envelope overlay re-issued per task via SendMessage, not solely via spawn-prompt.** The Pool Lead embeds the FR-MMT5b identity-confirm instruction (re-read agent file before beginning review work) and the FR-MMT20 JSON-envelope clause in each per-task `SendMessage` to pool reviewers. Spawn-prompt overlays are still composed (D22) but are not treated as durable for behavioral enforcement in long-lived pools. | Task 26 spike; FR-MMT5b; FR-MMT20 | Spawn-prompt content lives in conversation history (not system prompt) and is subject to lossy compaction summary when a long-running reviewer accumulates sufficient context. Confirmed via `backendType: "in-process"` architecture and empirical test. Per-task `SendMessage` is always in post-compaction context, making overlay durability immune to compaction. Complexity M — one additional SendMessage per task assignment. |

## Open Questions

PRD-level OQs (OQ-2, 4, 5, 7, 8) are inherited from `docs/reqs/multi-model-teams.md` §10 and NOT duplicated here. Below are implementation-specific uncertainties surfaced during planning.

| # | Question | Impact | Status |
|---|----------|--------|--------|
| Q1 | Does parent's Task 21 (preflight subroutine) expose its `which`-and-auth check as a callable subroutine, or inline-only inside the orchestrator agent? D15 assumes callable. If inline-only, Feature B's `/start-review-team --multi-model` (FR-MMT9 step 5) must duplicate the logic. | Affects whether Task 18 is S or M. | Open — confirm with parent owner before Phase 5. |
| Q2 | Does the `Teammate` API expose a way to read a teammate's spawn prompt at runtime, or only at spawn time? Affects testability of FR-MMT4's "verifiable by inspecting the prompt" criterion (Task 14). | If runtime read unavailable, Layer 1 test inspects the *composed spawn-prompt blob*. Plan adopts composed-prompt-inspection per D22. | Open — confirm; composed-prompt-inspection is the safer default. |
| Q3 | Is parent's canonical finding schema authored as JSON Schema with full enum coverage for `source.source_type`? FR-MMT20 adds `native-team`; FR-MMT24 adds `native-recovery`. Coordinated by Task 2a. | If parent's enum is closed, this plan must coordinate a parent-schema PR before Phase 1 ends. | Open — Task 2a is the explicit gate. |
| Q4 | The PRD's "Verify Teammate API idle behavior" spike (PRD §8 Assumption 2) is gated on Anthropic-internal Teammate API specs. Should the spike block all of Feature B, or only Milestone 4.1? Sub-questions: (a) hard idle timeouts shorter than `ttl_minutes`; (b) cross-session lifetime; (c) per-teammate resource ceilings; (d) **spawn-prompt overlay durability across auto-compaction events on a hours-idle teammate.** | If hard idle timeouts exist, FR-MMT5 may need a heartbeat. If compaction evicts overlay content, FR-MMT5b mitigation has no trigger. | Open — gates Milestone 3.2 entirety (Feature B Phases 3–8); Phases 1–2 ship independently. **Risk-gating note replicated in Phase 3.2 preamble.** |

---

## Phase 1 — Foundation: Configuration, Templates, Audit Schema Extensions

Establishes the substrate for both features. No user-visible value yet; all milestones unblock downstream work. **Can run concurrently with parent's Phase 5+** — depends only on parent's Task 1 (schema) and Task 4 (adapter contract) which complete in parent's Phase 1.

### Milestone 1.1: synthex-plus configuration schema and per-feature config keys

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 0 | Capture golden-snapshot fixtures of pre-feature behavior for `/team-review` (no `multi_model_review` config; default native-only) and for `/synthex:review-code` and `/synthex:performance-audit` running with no `standing_pools` section. Store under `tests/__snapshots__/multi-model-teams/baseline/`. **Snapshots capture deterministic envelope only** (template structure, Lead consolidation shape, audit-file presence/path); LLM finding bodies redacted to `<<finding-body>>` per parent Task 0 pattern. Used as regression baseline for FR-MMT3 acceptance criterion 8, FR-MR23-style byte-identical assertion, and NFR-MMT1. | S | None | blocked (parent Task 0 pattern not yet established) |
| 1 | Extend `plugins/synthex-plus/config/defaults.yaml` to add the entire `standing_pools:` section per FR-MMT6, with all **nine** keys (`enabled`, `ttl_minutes`, `default_name`, `default_reviewers`, `default_multi_model`, `storage_root`, `tasks_root`, `routing_mode`, `matching_mode`) and verbatim inline documentation per the PRD code block. Also add `lifecycle.submission_timeout_seconds: 300` **as a top-level sibling of `standing_pools:`** per D23. Include a section-header comment documenting cross-file resolution rules (D17/FR-MMT6): `standing_pools.*` from `.synthex-plus/config.yaml` only; `multi_model_review.*` from `.synthex/config.yaml` only; no merge. _(Plan-text fix: PRD lists 9 keys, plan originally said 8 — corrected during execution.)_ | S | None | done (iter 1) |
| 2 | Add `multi_model_review.per_command.team_review.{enabled,strict_mode}` keys and `multi_model_review.audit.record_finding_attribution_telemetry` (default `true`, per FR-MMT30a/FR-MMT6) to `plugins/synthex/config/defaults.yaml`. Inline comment for `record_finding_attribution_telemetry` explains the privacy-sensitive opt-out rationale. **Coordinate with parent Task 2** — same file; either land as follow-up PR after parent Task 2 ships, or land both in the same PR. | S | Parent Task 2; Task 2a (gate) | blocked (parent Task 2 not done) |
| 2a | **Coordinate parent canonical-finding schema enum extension (Q3 resolution).** Confirm with parent plan owner that the canonical finding schema's `source.source_type` enum permits both `native-team` (FR-MMT20) and `native-recovery` (FR-MMT24). If closed, open parent-plan PR extending it before this plan's Task 2 lands. Phase 1 cannot close until both values are in parent's schema and re-validated by parent's Task 7 validator. | S | Parent Task 1 | blocked (parent Task 1 not done) |
| 3 | Author plan-side architecture skeleton at `docs/specs/multi-model-teams/architecture.md` (Phase 8 Task 65 replaces with full doc). **Skeleton includes all normative content from the start** — schemas, contracts, procedures; only narrative prose, examples, and cross-references are added in Phase 8. Covers: Option B rationale, native-team-vs-orchestrator separation, two-consolidation-surfaces contract (FR-MMT4), cross-session lifetime model (FR-MMT5a), forward references to forthcoming docs. Includes "Related documentation" section at top with links to `pool-lifecycle.md`, `routing.md`, `recovery.md`, `standing-pools.md`. Begins with `## Status: Skeleton`. | M | Parent Task 1 | blocked (parent Task 1 not done) |

**Task 0 Acceptance Criteria:**
- `[T]` Snapshot files exist for `/team-review` and the two v1 routing-enabled commands with no relevant config sections present
- `[T]` Snapshots load via existing `tests/helpers/snapshot-manager.ts`
- `[T]` Redaction replaces all finding bodies with `<<finding-body>>`; verified by raw-string scan
- `[T]` `/team-review` snapshot records absence of any `multi-model-review-orchestrator` Task invocation in trace (FR-MMT3 criterion 8)
- `[T]` Redaction strategy referenced from Task 14, 27, 28 byte-comparison criteria

**Task 1 Acceptance Criteria:**
- `[T]` `defaults.yaml` parses as valid YAML
- `[T]` Existing config consumers pass tests without changes (NFR-MMT1)
- `[T]` All eight `standing_pools.*` keys present with documented defaults
- `[T]` `lifecycle.submission_timeout_seconds: 300` present as top-level sibling per D23
- `[T]` Section-header comment documents cross-file resolution rules with at least one example
- `[H]` Each `standing_pools.*` key has at least one inline-comment sentence explaining its semantics

**Task 2 Acceptance Criteria:**
- `[T]` `.synthex/config.yaml` defaults parses as valid YAML
- `[T]` `multi_model_review.per_command.team_review.enabled` defaults to `false`
- `[T]` `multi_model_review.audit.record_finding_attribution_telemetry` defaults to `true`
- `[T]` Parent's existing `multi_model_review:` consumers pass tests unchanged

**Task 2a Acceptance Criteria:**
- `[T]` Parent's canonical finding schema accepts both `native-team` and `native-recovery` as valid `source.source_type` enum values (verified against parent's Task 7 validator)
- `[H]` If enum was closed, parent-plan PR opened and merged before Task 2 lands; PR linked from this task's status notes
- `[T]` Q3 marked Resolved with reference to parent PR or task

**Task 3 Acceptance Criteria:**
- `[H]` Doc covers Option B rationale, native-team-vs-orchestrator boundaries, two-consolidation-surfaces contract, cross-session lifetime
- `[H]` "Related documentation" section at top includes links to `pool-lifecycle.md`, `routing.md`, `recovery.md`, `standing-pools.md`
- `[T]` Doc contains `## Status: Skeleton` header that Task 65 replaces
- `[T]` Cross-references to FR-MMT numbers accurate
- `[T]` Skeleton includes all normative schemas/contracts/procedures (narrative prose deferred to Task 65)

**Parallelizable:** Tasks 0, 1, 3 independent. Task 2 sequences after parent Task 2 (or co-PRs). Task 2a parallels 0/1/3 but gates Task 2 close.
**Milestone Value:** Configuration surface for both features in place. Baseline snapshots ready. Architecture skeleton with normative content anchors forthcoming work. Parent enum coordination resolved.

### Milestone 1.2: Template overlays — Lead suppression, reviewer envelope, identity confirm

Per **D22**, `templates/review.md` exposes overlays as labeled prose sections (no rendering layer). Commands compose spawn prompts by including the relevant overlay sections verbatim when flags resolve.

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 4 | Add a labeled prose section `### Multi-Model Conditional Overlay (apply when multi_model=true)` to `plugins/synthex-plus/templates/review.md` containing both: **(a) Lead-suppression** — verbatim per FR-MMT4 step 1 (Lead waits for `orchestrator-report` mailbox message; does NOT produce its own consolidated report; surfaces orchestrator output verbatim). **(b) Reviewer JSON-envelope** — verbatim per FR-MMT20 (reviewer's mailbox message MUST include both `report_markdown` and `findings_json` conforming to canonical finding schema; empty `findings` array if PASS). The overlay is a single Markdown subtree under the heading; commands include it verbatim into Lead and reviewer spawn prompts when `multi_model: true`. **No template engine — composition is via raw inclusion as instructed by command workflow markdown.** | M | Task 1 | done (iter 1) |
| 5 | Add `### Standing Pool Identity Confirm Overlay (apply when standing=true)` to `templates/review.md` for the FR-MMT5b identity-confirm step: each pool teammate unconditionally re-reads its own agent file (e.g., `plugins/synthex/agents/code-reviewer.md`) before beginning review work on each newly-claimed task. One Read per task transition; cost rationale documented inline as PRD FR-MMT5b verbatim text. Composed verbatim into pool teammate spawn prompts when `standing: true`. | S | Task 1 | done (iter 1) |
| 6 | Update `plugins/synthex-plus/templates/_skeleton.md` to document the prose-overlay convention: how labeled overlay sections (`### <Name> Overlay (apply when <flag>=true)`) are added, when each fires, and how command workflow markdown is responsible for verbatim inclusion when flags resolve. Reference both Task 4 and Task 5 overlays. Document there is no rendering engine. | S | Tasks 4, 5 | done (iter 1) |

**Task 4 Acceptance Criteria:**
- `[T]` Overlay heading `### Multi-Model Conditional Overlay (apply when multi_model=true)` present (raw-string check)
- `[T]` Lead-suppression text matches FR-MMT4 step 1 verbatim (raw-string match)
- `[T]` Reviewer JSON-envelope text matches FR-MMT20 verbatim (raw-string match on "BOTH (a) your normal markdown review report AND (b) a JSON envelope")
- `[H]` Overlay is a single contiguous Markdown subtree (no scattered fragments)
- `[T]` `/team-review` baseline snapshot byte-identical when no commands include the overlay (template parses cleanly with overlay present-but-not-included)

**Task 5 Acceptance Criteria:**
- `[T]` Overlay heading `### Standing Pool Identity Confirm Overlay (apply when standing=true)` present (raw-string check)
- `[T]` Section instructs unconditional Read of agent file at task-claim time (raw-string check)
- `[T]` Section text matches PRD FR-MMT5b verbatim (raw-string check)
- `[H]` Section positioned/labeled so commands include it at the per-task workflow point (fires on each claimed task, not at spawn)

**Task 6 Acceptance Criteria:**
- `[H]` `_skeleton.md` documents the labeled-prose-overlay convention with examples referencing Tasks 4 and 5
- `[T]` Skeleton makes explicit there is no rendering engine — composition is verbatim inclusion by command workflow markdown
- `[T]` Non-breaking for existing implementation/planning/refine templates (verified by reading those templates)

**Parallelizable:** Tasks 4 and 5 concurrent. Task 6 follows.
**Milestone Value:** Template overlay substrate for Feature A's Lead suppression and native-reviewer envelope in place. Standing-pool identity-confirm overlay ready for Feature B. No behavior change yet.

---

## Phase 2 — Feature A: Multi-Model on /team-review (Bridge and Orchestrator Integration)

Wires the multi-model-review-orchestrator into `/team-review`. Depends on parent's Phase 3 (orchestrator + consolidation pipeline).

### Milestone 2.1: Orchestrator-team bridge — pulling native findings

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 7 | Author `plugins/synthex-plus/agents/team-orchestrator-bridge.md` — Haiku-backed utility agent (per ADR-002) that exposes the FR-MMT3 step 5 bridge: read native teammate mailbox messages from `~/.claude/teams/<team-name>/inboxes/lead/<reviewer>-<timestamp>.json`, parse `findings_json.findings` per FR-MMT20 mailbox shape, validate against canonical finding schema (parent Task 1), normalize to canonical envelope with `source.source_type: "native-team"`. Implements FR-MMT20 bridge rules 1–5. **Terminology:** uses "Pool Lead" only when describing standing-pool variant; for ephemeral team variant uses "Lead". | L | Phase 1; parent Phase 3 (orchestrator); parent Task 1 | pending |
| 8 | Add `team-orchestrator-bridge` to `plugins/synthex-plus/.claude-plugin/plugin.json` agents array. (synthex-plus's current `plugin.json` has no `agents` array; this task creates it.) **Tasks 33 and 36 extend this same array; all three additions land in coordinated PRs to avoid array-overwrite races.** | S | Task 7 | pending |
| 9 | Author Layer 1 schema validator at `tests/schemas/team-orchestrator-bridge.ts` validating: (a) bridge input shape; (b) bridge output — array of canonical findings each with `source.source_type: "native-team"`. Vitest with inline samples. (Flat `tests/schemas/` path per Cross-Cutting Notes.) | M | Task 7; parent Task 1 | pending |
| 10 | Author Layer 2 fixtures at `tests/fixtures/multi-model-teams/bridge/`: (a) `well-formed-mailbox/` — two reviewers each emit complete `findings_json`; bridge produces canonical envelope with both reviewers' findings; attribution preserved. (b) `malformed-findings-json/` — one reviewer's `findings_json` unparseable; bridge sends one clarification and on second failure marks contribution as `parse_failed`; second reviewer flows through. (c) `missing-findings-json/` — one reviewer's mailbox lacks `findings_json` entirely; bridge follows same one-retry-then-`parse_failed` pattern. | M | Tasks 7, 9 | pending |

**Task 7 Acceptance Criteria:**
- `[T]` Agent declares Haiku model (utility-layer per ADR-002)
- `[T]` Documents bridge rules 1–5 from FR-MMT20 verbatim (raw-string match each)
- `[T]` Output envelope conforms to parent's adapter contract (Task 4) — verified side-by-side
- `[T]` Output findings carry `source.source_type: "native-team"` (Task 9 validates)
- `[H]` Bridge does NOT summarize, truncate, or filter findings — explicit rule in markdown (raw-string check)
- `[T]` Terminology: "Pool Lead" only in standing-pool descriptions; bare "Lead" in ephemeral team descriptions

**Task 8 Acceptance Criteria:**
- `[T]` `plugin.json` parses; agents array exists and includes `team-orchestrator-bridge`
- `[T]` PR coordinates with Tasks 33, 36 (or sequences explicitly) — see Cross-Cutting Notes

**Task 9 Acceptance Criteria:**
- `[T]` Validator catches outputs with findings missing `source.source_type` or wrong value
- `[T]` Validator accepts well-formed envelope from FR-MMT20 mailbox shape sample
- `[T]` Validator at flat path `tests/schemas/team-orchestrator-bridge.ts`

**Task 10 Acceptance Criteria:**
- `[T]` Fixture (a): bridge produces 2 reviewers × N findings, correctly attributed with `source.source_type: "native-team"`
- `[T]` Fixture (b): exactly one clarification SendMessage, second-failure marked `parse_failed`; well-formed reviewer flows through
- `[T]` Fixture (c): missing-`findings_json` exercises identical retry-then-`parse_failed` path

**Parallelizable:** Tasks 7 and 9 in parallel after Phase 1 + parent's Phase 3. Tasks 8 and 10 follow.
**Milestone Value:** Orchestrator can ingest native team findings without touching reviewer agent files.

### Milestone 2.2: /team-review command — multi-model parameter, overlay composition, and orchestrator wire-up

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 11 | Update `plugins/synthex-plus/commands/team-review.md` to accept the `multi_model` parameter per FR-MMT19. Resolution chain: command parameter > `multi_model_review.per_command.team_review.enabled` > `multi_model_review.enabled` > `false`. Add a parameter table row and a workflow step. **Insertion point:** add the resolution step immediately after the existing "Load Configuration" step; name it `Resolve multi-model state` and reference it from later steps by that name (NOT by step number — current numbering is in flux). | S | Phase 1; parent Phase 6 (init must surface `multi_model_review` first) | pending |
| 12 | Update `team-review.md` Compose-team-creation-prompt step (refer by behavioral name) with **explicit overlay-composition logic per D22**: when `multi_model: true`, the command MUST include the `### Multi-Model Conditional Overlay (apply when multi_model=true)` section from `templates/review.md` **verbatim** in BOTH the Lead's spawn prompt AND each reviewer's spawn prompt (overlay contains both sub-instructions; host model routes per role). When `multi_model: false`, overlay is omitted. **No template-rendering layer; composition is verbatim Markdown insertion.** Acceptance verifies the composed spawn-prompt blob (raw-string match), not a rendered template output. | M | Tasks 4, 11 | pending |
| 13 | Update `team-review.md` workflow with a new sub-step (after team creation, before verification): when `multi_model: true`, instantiate the parent plan's `multi-model-review-orchestrator` agent in the host session via the Task tool. Pass: artifact (diff scope), native-reviewer list, command name = `team-review`, config override flags. Orchestrator runs in parallel with the team's review work (FR-MMT21 step 2). Document the orchestrator's run-mode: NOT spawned as a teammate; runs via Task tool from the host session (FR-MMT3 criterion 2). **Insert by behavioral position, not step number.** | M | Task 11; parent Phase 3 | pending |
| 14 | Update `team-review.md` Consolidate step (refer by behavioral name "Consolidate") to bypass the Lead's natural consolidation when `multi_model: true`. Per FR-MMT21 step 8, Lead's role becomes "publish the orchestrator's report verbatim." After orchestrator completes (Task 13), it writes its report to `~/.claude/teams/<team-name>/inboxes/lead/orchestrator-report-<timestamp>.json`; Lead's spawn prompt (composed per Task 12 with multi-model overlay) waits for and surfaces this. | M | Tasks 4, 13 | pending |
| 15 | Update `team-review.md` FAIL re-review loop (behavioral name "FAIL re-review loop") to invoke the orchestrator on each FAIL cycle per FR-MMT21 step 9. Each cycle re-runs both native team review AND orchestrator. Add a one-line cost-guidance comment "~2-3× per-cycle token cost vs native-only FAIL cycles" (PRD-locked language). | S | Tasks 13, 14 | pending |
| 16 | Add multi-model-pool roster validation to `team-review.md` Read-the-review-template step (behavioral name "Read template"), per FR-MMT20 "Pool-spawn-time validation". If `multi_model: true` AND any active reviewer is outside the v1-supported set (`code-reviewer, security-reviewer, design-system-agent, performance-engineer`), abort with the verbatim FR-MMT20 error: `"Multi-model mode is not supported for reviewer '<name>' in v1. Supported reviewers for multi-model pools: code-reviewer, security-reviewer, design-system-agent, performance-engineer. Either remove this reviewer from the roster, or omit --multi-model."` **Sequenced after Task 11 to avoid same-file edit conflicts.** | S | Task 11 | pending |

**Task 11 Acceptance Criteria:**
- `[T]` `multi_model` parameter in parameter table
- `[T]` Resolution chain in correct order; verified by mutating each step in test config
- `[T]` `team-review multi_model=true` enables regardless of config (FR-MMT19 criterion 1)
- `[T]` `team-review multi_model=false` disables regardless of config (FR-MMT19 criterion 2)
- `[T]` Sub-step named `Resolve multi-model state` (raw-string check)

**Task 12 Acceptance Criteria:**
- `[T]` Workflow markdown contains explicit instruction to include `### Multi-Model Conditional Overlay (apply when multi_model=true)` section verbatim from `templates/review.md` (raw-string check)
- `[T]` Composed Lead spawn prompt contains FR-MMT4 suppression text verbatim when `multi_model: true` (Task 19 fixture; Q2 resolution: prompt-blob inspection)
- `[T]` Composed Lead spawn prompt does NOT contain FR-MMT4 suppression text when `multi_model: false` (Task 19 baseline)
- `[T]` Composed reviewer spawn prompts contain FR-MMT20 envelope text verbatim when `multi_model: true`
- `[T]` Workflow text states "no template engine; verbatim Markdown inclusion" (raw-string check) per D22

**Task 13 Acceptance Criteria:**
- `[T]` Orchestrator instantiated via Task tool, NOT via `Teammate` API (raw-string check — no `Teammate` invocation under multi-model branch)
- `[T]` Workflow contains FR-MMT21 step 2 parallelism instruction verbatim (raw-string match on "runs in parallel with team execution"); wall-clock parallelism deferred to Phase 10 Task 77 per D24
- `[T]` Orchestrator receives the four required inputs

**Task 14 Acceptance Criteria:**
- `[T]` Consolidate step branches on `multi_model: true`; multi-model branch consumes orchestrator's mailbox-posted report
- `[T]` Multi-model branch produces exactly one consolidated report (orchestrator's); verified by Task 19
- `[T]` Native-only branch byte-identical to baseline (Task 0)

**Task 15 Acceptance Criteria:**
- `[T]` FAIL loop re-invokes orchestrator on each cycle
- `[T]` Cost-guidance comment contains verbatim "~2-3×" language (raw-string check)

**Task 16 Acceptance Criteria:**
- `[T]` Roster validation runs before team creation (no `Teammate` spawn on validation failure)
- `[T]` Verbatim FR-MMT20 error message (raw-string check)
- `[T]` Validation skipped when `multi_model: false`
- `[T]` Sequenced after Task 11

**Parallelizable:** Task 11 first; Task 16 sequences after 11 (same-file). Tasks 12, 13 sequence after 11. Tasks 14, 15 sequence after 13.
**Milestone Value:** `/team-review --multi-model` end-to-end functional. Native-only path byte-identical to baseline.

### Milestone 2.3: Feature A integration testing

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 17 | Author Layer 1 validator extension at `tests/schemas/team-review-multi-model.ts` validating: (a) **composed Lead spawn-prompt blob** contains FR-MMT4 suppression text verbatim when `multi_model: true` (Q2 — assert against the spawn-prompt blob the command produces, NOT a live teammate, NOT a "rendered template" — per D22); (b) composed reviewer spawn-prompt blobs contain FR-MMT20 envelope clause verbatim; (c) team-review output (multi-model branch) matches `## Code Review Report` shape from parent's Task 22 orchestrator-output validator. Vitest. | M | Tasks 4, 12, 14; parent Task 22 | pending |
| 18 | Layer 2 fixture at `tests/fixtures/multi-model-teams/team-review/multi-model-enabled/`: 2 native reviewers (code-reviewer + security-reviewer) + 2 external (codex + gemini, recorded). Asserts: (a) native and external run in parallel — sequencing only per D24; wall-clock deferred to Phase 10 Task 77; (b) orchestrator pulls native findings via bridge; (c) unified report is the only consolidated output (Lead's mailbox contains exactly one); (d) report matches `## Code Review Report` with attribution split between `native-team` and `external`; (e) audit artifact includes `team_metadata` block (validates against extended schema from Phase 8 Task 61). | L | Tasks 11–16, 17 | pending |
| 19 | Layer 2 fixture at `tests/fixtures/multi-model-teams/team-review/multi-model-disabled/`: same 2 native reviewers, multi-model disabled. Asserts: (a) byte-identical to Task 0 baseline; (b) **no** `multi-model-review-orchestrator` Task invocation in trace (FR-MMT3 criterion 8 regression); (c) Lead produces its own consolidated report; (d) **composed reviewer spawn-prompt blobs do NOT contain FR-MMT20 envelope clause** (raw-string negative match per D22). | M | Tasks 11–16, 17 | pending |
| 20 | Layer 2 fixture at `tests/fixtures/multi-model-teams/team-review/cross-domain-enrichment/`: multi-model enabled; one reviewer sends a cross-domain mailbox message to security-reviewer mid-review. Asserts: (a) cross-domain mailbox messages still flow under multi-model (FR-MMT4 "Kept" responsibility); (b) receiving reviewer's `findings_json` reflects the cross-domain context; (c) orchestrator's input findings carry the cross-domain context already embedded (orchestrator does not separately consume them). | M | Task 18 | pending |
| 21 | Layer 2 fixture at `tests/fixtures/multi-model-teams/team-review/fail-reviewer-roster/`: `team-review --multi-model` invoked with `quality-engineer` in roster. Asserts abort before team spawn with verbatim FR-MMT20 error message. | S | Task 16 | pending |

**Task 17 Acceptance Criteria:**
- `[T]` Validator inspects **composed spawn-prompt blob** (the string the command writes when spawning Lead/reviewers) for FR-MMT4 suppression verbatim (Q2 resolution: composed-prompt-blob, not live teammate, not "rendered template")
- `[T]` Validator inspects composed reviewer spawn-prompt blobs for FR-MMT20 envelope clause verbatim
- `[T]` Validator extends parent's orchestrator-output validator without re-implementing it

**Task 18 Acceptance Criteria:**
- `[T]` Multi-model-enabled fixture produces exactly one consolidated report (orchestrator's)
- `[T]` Lead's mailbox contains exactly one `orchestrator-report-*.json`; no Lead-side consolidated-report file
- `[T]` Unified report attributes findings to both `native-team` and `external` source-types (FR-MMT4 criterion 6)
- `[T]` Audit artifact includes `team_metadata` block (validates via Task 61's extended schema)
- `[T]` Wall-clock parallelism deferred to Phase 10 per D24; Layer 2 records sequencing only

**Task 19 Acceptance Criteria:**
- `[T]` Output byte-identical to Task 0 baseline (after redaction)
- `[T]` Trace contains zero `multi-model-review-orchestrator` Task invocations
- `[T]` Lead produces its own consolidated report
- `[T]` Composed reviewer spawn prompt blobs do NOT contain FR-MMT20 envelope text (raw-string negative match)

**Task 20 Acceptance Criteria:**
- `[T]` Cross-domain mailbox message between code-reviewer and security-reviewer present in trace
- `[T]` Receiving reviewer's `findings_json` includes cross-domain context
- `[T]` Orchestrator input findings reflect cross-domain enrichment in `description`/`evidence` fields

**Task 21 Acceptance Criteria:**
- `[T]` Fixture aborts with verbatim FR-MMT20 error (raw-string match)
- `[T]` No team spawned on filesystem (post-test directory check)

**Parallelizable:** Tasks 17 and 19 in parallel. Tasks 18, 20, 21 sequence after 17.
**Milestone Value:** Feature A end-to-end verified across enabled/disabled/cross-domain/error-roster paths. `/team-review --multi-model` ships.

---

## Phase 3 — Feature B: Pool Storage and Lifecycle Foundation

Standing-pool storage layout, index schema, locking primitive, lifecycle state machine. No commands yet — pure infrastructure.

### Milestone 3.1: Index schema, locking primitive, and pool-config schema

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 22 | Author normative schema doc at `docs/specs/multi-model-teams/pool-lifecycle.md` covering: pool `config.json` schema (FR-MMT7 verbatim — `name`, `standing`, `reviewers`, `multi_model`, `ttl_minutes`, `spawn_timestamp`, `host_pid`, `host_session_id`, `last_active_at`, `pool_state`); index entry schema (FR-MMT9b verbatim); state machine (`idle ↔ active`, `* → draining → stopping → removed`); writer-ordering rules for `last_active_at` (max-semantics per FR-MMT12); dual-write Pool-Lead responsibility (FR-MMT9b verbatim); reconciliation rule (`config.json` canonical, index.json cache). **Skeleton includes all normative schemas, contracts, and procedures from the start;** narrative deferred to Task 66. Begins with `## Status: Skeleton`. **Terminology:** "Pool Lead" exclusively. | M | Phase 1 | done (iter 2) |
| 23 | Author Layer 1 schema validator at `tests/schemas/standing-pool-config.ts` validating per-pool `config.json`: required fields, `pool_state` enum (`idle`, `active`, `draining`, `stopping`), `last_active_at` ISO-8601 UTC, `ttl_minutes >= 0`. Vitest with inline samples. | M | Task 22 | done (iter 2) — 44 tests passing |
| 24 | Author Layer 1 schema validator at `tests/schemas/standing-pool-index.ts` validating `index.json`: top-level `pools` array; each entry has `name`, `pool_state`, `last_active_at`, `metadata_dir`. Vitest with inline samples covering all four `pool_state` values. | M | Task 22 | done (iter 2) — 35 tests passing |
| 25 | Author cross-session locking primitive doc at `docs/specs/multi-model-teams/pool-lifecycle.md#locking` (sub-section of Task 22). Documents D8/FR-MMT9a: `mkdir`-based atomic acquisition; 10s wait, 100ms polling; verbatim stale-lock cleanup error. Reusable across Phase 5 commands and Phase 6 Pool-Lead writes. | S | Task 22 | done (iter 2) |

**Task 22 Acceptance Criteria:**
- `[H]` Doc covers all six topics (config schema, index schema, state machine, max-semantics, dual-write, reconciliation) with full normative content
- `[T]` `## Status: Skeleton` header
- `[T]` All FR-MMT references accurate
- `[T]` Terminology: only "Pool Lead" used (raw-string scan for bare "Lead"/"team Lead" returns zero hits)

**Task 23 Acceptance Criteria:**
- `[T]` Validator rejects config missing required fields
- `[T]` Validator rejects unknown `pool_state` values
- `[T]` Validator rejects `last_active_at` not in ISO-8601 UTC
- `[T]` Validator accepts FR-MMT7 normative example verbatim

**Task 24 Acceptance Criteria:**
- `[T]` Validator rejects entries missing `pool_state` or `last_active_at` (FR-MMT9b denormalization)
- `[T]` Validator accepts FR-MMT9b normative example verbatim
- `[T]` Validator catches `pools` array shape errors
- `[T]` All four `pool_state` values covered in inline samples

**Task 25 Acceptance Criteria:**
- `[T]` Sub-section documents `mkdir`/`rmdir` atomic semantics
- `[H]` Verbatim stale-lock cleanup error message present
- `[T]` 10-second timeout and 100ms polling cadence documented

**Parallelizable:** Tasks 23, 24 in parallel after 22. Task 25 in parallel with 23/24.
**Milestone Value:** Storage contracts in place. Future tasks build against documented schemas with validators ready.

### Milestone 3.2: Pool Lead — standing-pool lifecycle behaviors

**RISK GATE — READ BEFORE STARTING:** Task 26's spike (PRD §8 Assumption 2) is a **go/no-go gate for Feature B in its entirety**. If the Teammate API imposes hard idle timeouts shorter than `ttl_minutes`, OR if auto-compaction evicts spawn-prompt overlay content on long-idle teammates, Feature B (~50 tasks) is at risk of full descope to v2. Spike outcome **must** be promoted to a new D-row before Tasks 27+ start.

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 26 | **Pre-implementation spike (PRD §8 Assumption 2): "Verify Teammate API idle behavior."** Confirm: (a) hard idle timeouts on teammate sessions; (b) cross-session lifetime past spawning host; (c) per-teammate resource ceilings; **(d) whether spawn-prompt overlays (FR-MMT5b identity-confirm; FR-MMT20 envelope) persist as durable prompt context across auto-compaction events on a hours-idle teammate, or whether compaction evicts the spawn-prompt content. If compaction evicts, FR-MMT5b mitigation has no trigger.** Document at `docs/specs/multi-model-teams/teammate-api-spike.md`. **GATING:** if hard idle timeouts < default `ttl_minutes` (60), revisit FR-MMT5 (heartbeat) or descope Feature B; if compaction evicts overlay, revisit FR-MMT5b mitigation or descope.<br><br>**Candidate FR-MMT5b mitigations gated on Q4(d) outcome (spike promotes ONE to a new D-row):** (a) **Pool Lead re-issues identity-confirm via `SendMessage` per task assignment** — embeds the FR-MMT5b instruction in each per-task `SendMessage`, ensuring it's in post-compaction context for the next task; complexity M. (b) **Narrow FR-MMT5b scope to short-lived pools** — define TTL ceiling X (e.g., ≤ 60 min) below which the overlay is empirically durable per spike; reject `--multi-model` for `ttl_minutes > X`; complexity S. (c) **Descope multi-model-on-pools from v1** — keep multi-model on `/team-review` only; remove `--multi-model` from `start-review-team.md`; complexity L (last resort). | M | None | done (iter 5) — all four sub-questions answered; [H] approved by user 2026-04-26. (a) No hard timeout within 37-min window; identity intact on wake; default 60-min TTL safe. (b) Does not survive host exit (backendType: "in-process" confirmed); already handled by FR-MMT22. (c) No blocking limits for 2–4 reviewer rosters. (d) NOT reliably durable across compaction → D26 selected: Pool Lead re-issues identity-confirm + FR-MMT20 envelope per task via SendMessage. Gating outcome: proceed with Feature B; no descoping. [T] D26 row added above. Spike doc at docs/specs/multi-model-teams/teammate-api-spike.md. |
| 27 | Add `### Standing Pool Lifecycle Overlay (apply when standing=true)` to `templates/review.md` covering Pool-Lead behaviors per FR-MMT5/12/14/9b: (a) on each TeammateIdle, update pool's `last_active_at` using `max(existing, new)`; dual-write to `config.json` (canonical) and `index.json` (cache, under `.index.lock`); **debounce: write `last_active_at` at most once per 30 seconds even if multiple TeammateIdle events fire — bounds Bash subprocess cost and helps meet NFR-MMT2 5000-tokens/min target on long-idle pools;** (b) skip the natural "shutdown when task list empties" path; (c) on shutdown signal arrival, transition `pool_state` to `draining` (atomic write); (d) wait for in-flight tasks (subject to `lifecycle.stuck_task_timeout_minutes`, default 30); (e) on drain completion, transition to `stopping` then exit. Composed verbatim into Pool-Lead spawn prompts (NOT reviewer prompts). **Terminology:** "Pool Lead" exclusively. | L | Tasks 22, 25, 26 | done (iter 5) — [H] approved by user. 22 [T] tests in tests/schemas/lifecycle-overlay.test.ts. Test→criterion: heading exact-string; (a)–(e) responsibility presence; "max(existing, new)" phrase; config.json+index.json dual-write; "at most once per 30 seconds" debounce; mkdir/.index.lock locking; FR-MMT12/9b/14/5b/20 refs; 4 "Pool Lead" terminology negative scans. |
| 28 | Update `plugins/synthex-plus/hooks/teammate-idle-gate.md` to handle standing pools per FR-MMT12. Hook reads team's `config.json`, branches on `standing: true`: (a) if standing, report idle but do NOT trigger dismissal; update `last_active_at` per max-semantics dual-write (Task 27); (b) if non-standing, behavior unchanged. Hook interface unchanged. | M | Task 27 | done (iter 5) — 25 [T] tests in tests/schemas/idle-gate-standing.test.ts. Test→criterion: [T1] reads config.json + standing field + FR-MMT12 ref; [T2] standing:true branch present; [T3] no dismissal/shutdown on standing path; [T4] max(existing,new) phrase + comparison logic; [T5] config.json.tmp+rename; [T6] .index.lock mkdir/rmdir; [T7] .index.json.tmp+rename; [T8] 30s debounce; [T9] non-standing path unchanged (4 tests: unchanged phrase, dismissal notification, allow_cross_functional, exit 2); [T10] crash-safety ordering; [T11] exit 0 on standing path; [T12] standing:false routes to non-standing. |
| 29 | Layer 2 fixture at `tests/fixtures/multi-model-teams/pool-lifecycle/idle-and-claim/`: spawn 2-reviewer pool; submit no work; observe TeammateIdle hook fires and updates `last_active_at`; submit a task; observe `pool_state` `idle → active`; complete task; observe `active → idle`; verify `last_active_at` monotonically non-decreasing across all writes. | M | Tasks 27, 28 | done (iter 5) — 41 [T] tests in tests/schemas/idle-and-claim.test.ts + tests/fixtures/multi-model-teams/pool-lifecycle/idle-and-claim/ (scenario.md, fixture.json, assertions.ts). Test→criterion: [T1] last_active_at strictly non-decreasing across all writes; [T2] pool_state transitions match expected idle→active→idle sequence; [T3] pool does NOT shut down when task list empties. |
| 30a | Layer 2 fixture at `tests/fixtures/multi-model-teams/pool-lifecycle/draining-state-transition/`: spawn pool with one in-flight task; trigger TTL expiration; observe Pool Lead transitions to `draining`; observe Pool Lead refuses new task assignment after TTL fires while in-flight tasks remain; observe in-flight task completes; observe `draining → stopping`; observe pool exits and removed from `index.json`. **Pool-Lead-side only — submitter-side rejection is Task 30b in Phase 4.** | M | Tasks 27, 28 | done (iter 5) — 26 [T] tests in tests/schemas/draining-state-transition.test.ts + tests/fixtures/multi-model-teams/pool-lifecycle/draining-state-transition/ (scenario.md, fixture.json, assertions.ts). Test→criterion: [T1] in-flight task completes before pool shuts down (FR-MMT14); [T2] pool_state: draining visible during drain window; [T3] Pool Lead refuses new task after TTL fires with in-flight tasks; [T4] post-shutdown: index entry removed, metadata dir cleaned up. |

**Task 26 Acceptance Criteria:**
- `[H]` Spike doc documents API behavior for all four sub-questions
- `[H]` Doc explicitly states gating outcome ("proceed as-is" OR "revisit FR-MMT5 with heartbeat" OR "revisit FR-MMT5b mitigation" OR "descope Feature B")
- `[T]` New D-row added to plan reflecting spike outcome before Milestone 3.2 continues

**Task 27 Acceptance Criteria:**
- `[T]` Overlay heading `### Standing Pool Lifecycle Overlay (apply when standing=true)` present (raw-string check)
- `[T]` Section covers all five lifecycle responsibilities (a–e)
- `[T]` Section documents max-semantics for `last_active_at` (raw-string check on "max(existing, new)")
- `[T]` Section documents dual-write requirement
- `[T]` Section documents debouncing with literal "at most once per 30 seconds" (raw-string check; N=30 locked, no "e.g.")
- `[T]` Section uses `mkdir`-based locking from Task 25 for index writes
- `[H]` Section contains verbatim text matching FR-MMT5/12/14/9b acceptance criteria
- `[T]` Terminology: "Pool Lead" only (raw-string scan)

**Task 28 Acceptance Criteria:**
- `[T]` Hook branches on `standing: true` from team `config.json`
- `[T]` Standing-pool branch updates `last_active_at` per max-semantics dual-write
- `[T]` Non-standing branch unchanged (verified by NFR-MMT1 zero-config snapshot)

**Task 29 Acceptance Criteria:**
- `[T]` `last_active_at` strictly non-decreasing across all writes (max-semantics correctness)
- `[T]` `pool_state` transitions match expected sequence
- `[T]` Pool does NOT shut down when task list empties

**Task 30a Acceptance Criteria:**
- `[T]` In-flight task at TTL expiration completes before pool shuts down (FR-MMT14 criterion 1)
- `[T]` `pool_state: draining` visible during drain window (FR-MMT14 criterion 2)
- `[T]` Pool Lead transitions to `draining` and refuses new task assignment after TTL fires with in-flight tasks
- `[T]` Post-shutdown: index entry removed, metadata dir cleaned up
- Note: end-to-end submitter-side rejection verified by Task 30b (Phase 4.2)

**Parallelizable:** Task 26 (spike) blocks Tasks 27+. Tasks 27 and 28 sequence. Tasks 29 and 30a follow.
**Milestone Value:** Pools can spawn, idle indefinitely, transition correctly through all four states, and drain gracefully (Pool-Lead-side).

---

## Phase 4 — Feature B: Discovery, Routing, and Report Envelope

Discovery procedure, prefer-with-fallback routing, FR-MMT16 task submission, FR-MMT16a polling/timeout/envelope. Independent of Phase 3 lifecycle work — depends only on Phase 3.1 schemas. **Discovery logic is INLINE in submitting commands (NOT a Haiku agent) per Architect cycle 1 finding — wrapping pure mechanical filter logic in a Task-tool LLM invocation would blow the NFR-MMT3 < 500ms cold-case routing budget.**

### Milestone 4.1: Discovery procedure and routing semantics

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 31 | Author normative routing doc at `docs/specs/multi-model-teams/routing.md` covering FR-MMT15 (discovery procedure verbatim, including required-reviewer-set per command), FR-MMT16 (submission — UUID filenames, atomic `.tmp`+rename, mailbox notification, report-to convention), FR-MMT16a (envelope shape verbatim, polling timeout = `lifecycle.submission_timeout_seconds`), FR-MMT17 (prefer-with-fallback verbatim including notification text, explicit-pool-required verbatim error). **Skeleton includes all normative procedures, schemas, and verbatim copy from the start;** narrative deferred to Task 67. Documents **inline-discovery convention**: submitting commands run discovery inline as a workflow step, reading `~/.claude/teams/standing/index.json` directly. Begins with `## Status: Skeleton`. **Terminology:** "Pool Lead" exclusively. | M | Phase 1, Phase 3.1 | done (iter 2) — 16 [T] tests in `tests/schemas/routing-md.test.ts`; [H] approved by user. Test→criterion linkage: status header / FR refs (8 tests) / no-TODO / verbatim FR-MMT17 routing notification / verbatim FR-MMT16a timeout substring / verbatim explicit-pool-required first line / "Pool Lead" terminology (3 negative tests). |
| 32 | Author cleanup-only Haiku-backed utility agent `plugins/synthex-plus/agents/standing-pool-cleanup.md` (renamed from prior `standing-pool-router` to reflect narrowed scope). Discovery is now inline in submitting commands; this agent ONLY handles FR-MMT13/FR-MMT22 stale-pool cleanup (multi-step coordinated filesystem ops under index lock). Inputs: pool name. Behavior: acquire lock, remove index entry, remove metadata dir if present, release lock, return cleanup result. **The discovery filter step itself runs inline in Tasks 54 and 57 — NOT in this agent.** | M | Tasks 22, 25, 31 | done (iter 3) — 22 [T] tests in `tests/schemas/standing-pool-cleanup.test.ts`. Test→criterion linkage: `model: haiku` frontmatter; section headings; FR-MMT13/22 + `.index.lock` citations; `removed`/`not-found`/`lock-failed` enum values; negative scope scan (no discovery/filter/router/routing in positive sections); "Pool Lead" terminology. |
| 33 | Add `standing-pool-cleanup` to `plugin.json` agents array (extend from Task 8). **Coordinated PR with Tasks 8 and 36 to avoid `agents` array merge conflicts.** | S | Task 32; Task 8 | pending |
| 34 | Author Layer 1 schema validator at `tests/schemas/standing-pool-cleanup.ts` validating cleanup-agent output: result enum (`removed`, `not-found`, `lock-failed`), error reason on failure. Also validate **inline-discovery output shape** from Tasks 54/57: `{routing_decision: "routed-to-pool" | "fell-back-no-pool" | "fell-back-roster-mismatch" | "fell-back-pool-draining" | "fell-back-pool-stale", pool_name?: string, multi_model?: bool, match_rationale?: string, would_have_routed?: object}`. | M | Task 32 | done (iter 4) — 50 [T] tests in `tests/schemas/standing-pool-cleanup-output.test.ts`. Validator module exports `validateCleanupResult` + `validateInlineDiscoveryOutput` + `ROUTING_DECISION_VALUES` (all 7 enum values). Test→criterion: cleanup-result rejects missing fields; conditional-field validation per `routing_decision`; `would_have_routed` accepted when present; full enum coverage. |
| 34a-pre | **Layer 2 synthetic discovery latency smoke check** at `tests/fixtures/multi-model-teams/routing/latency-smoke/` — validates inline-discovery output schema is producible from a Bash subprocess reading a 10-pool `index.json` in < 100 ms. Catches NFR-MMT3 regression at the **discovery primitive layer** (no consumer command needed). Records CI-stable methodology (wall-clock around subprocess, multiple runs, P95 reported). End-to-end fixture (Task 34a) runs in Phase 7. | M | Task 32 | done (iter 4) — 7 [T] tests in tests/schemas/discovery-latency-smoke.test.ts. P50 = 7ms, P95 = 9ms (8× headroom under NFR-MMT3 100ms budget). Test→criterion linkage: [T1+T4] subprocess output correctness (6 tests: valid JSON, routed-to-pool exact match, fell-back-no-pool, covers-mode ordering, exact-mode superset rejection, enum value coverage); [T2] P95 < 100ms (1 test). All 4 [T] criteria met. No [H] criteria. |

**Task 31 Acceptance Criteria:**
- `[H]` Doc covers all four FRs (FR-MMT15/16/16a/17) with normative verbatim text
- `[H]` Doc documents inline-discovery convention (per Architect cycle 1 finding)
- `[T]` `## Status: Skeleton` header
- `[T]` All FR-MMT references accurate
- `[T]` Skeleton includes all normative content (no "TODO: fill in PRD copy")
- `[T]` Terminology: only "Pool Lead" used

**Task 32 Acceptance Criteria:**
- `[T]` Agent declares Haiku model
- `[T]` Documented scope is cleanup ONLY (raw-string check — no "discovery"/"filter" responsibilities)
- `[T]` Triggers FR-MMT13/FR-MMT22 cleanup atomically under lock (raw-string reference)
- `[T]` Returns structured cleanup result for caller

**Task 33 Acceptance Criteria:**
- `[T]` `plugin.json` parses; agent registered
- `[T]` PR coordinates with Tasks 8 and 36 — see Cross-Cutting Notes

**Task 34 Acceptance Criteria:**
- `[T]` Validator rejects cleanup outputs missing required fields
- `[T]` Validator validates inline-discovery output: conditional fields per `routing_decision` (e.g., `pool_name` required when `routed-to-pool`)
- `[T]` Validator accepts `would_have_routed` block when present
- `[T]` Output enum covers all six FR-MMT30 `routing_decision` values (less `skipped-routing-mode-explicit` and `fell-back-timeout` added by callers)

**Task 34a-pre Acceptance Criteria:**
- `[T]` Smoke fixture exercises Bash subprocess reading synthetic 10-pool `index.json` and emitting inline-discovery output per Task 34 schema
- `[T]` Subprocess P95 < 100 ms across multiple runs
- `[T]` Methodology documented in fixture README
- `[T]` Independent of Tasks 54/57 (no consumer command invoked)

**Parallelizable:** Tasks 31 and 32 in parallel. Tasks 33 and 34 follow. Task 34a-pre after 32.
**Milestone Value:** Cleanup primitive available. Discovery convention documented for inline use. Discovery-primitive latency catch covered by Task 34a-pre; full end-to-end in Phase 7 by Task 34a.

### Milestone 4.2: Submission mechanism and report envelope

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 35 | Author Haiku-backed utility agent `plugins/synthex-plus/agents/standing-pool-submitter.md` exposing FR-MMT16 + FR-MMT16a. Inputs: pool name, review tasks, report-to path, `submission_timeout_seconds` (top-level per D23). Behavior: (a) re-read pool's `config.json`; if `pool_state: draining` or `stopping`, return `routing_decision: "fell-back-pool-draining"` (FR-MMT14a step 1); (b) write each task as `<uuid>.json.tmp` + rename to `~/.claude/tasks/standing/<name>/`; (c) write mailbox notification to `~/.claude/teams/standing/<name>/inboxes/lead/<uuid>.json`; (d) poll the report-to path every 2s with backoff to 10s; (e) on success, return parsed envelope; (f) on `lifecycle.submission_timeout_seconds` timeout, mark tasks `abandoned`, emit verbatim FR-MMT16a one-line note, return `routing_decision: "fell-back-timeout"`. **Submitter does NOT own FR-MMT24 recovery** — recovery is the caller's responsibility per D14/FR-MMT24 (see Task 48). Submitter's responsibility ends at returning the envelope. | L | Tasks 22, 31; Phase 3.2 (draining state) | done (iter 5) — 33 [T] tests in tests/schemas/standing-pool-submitter.test.ts. Test→criterion: [T1] model: haiku frontmatter (2 tests); [T2] config.json re-read + draining/stopping check + FR-MMT14a ref (5 tests); [T3] .tmp+rename for tasks + mailbox + envelope (6 tests); [T4] UUID-based filenames (4 tests); [T5] poll every 2s + backoff to 10s (4 tests); [T6] verbatim timeout note fragments (5 tests); [T7] no FR-MMT24 recovery ownership + no Recovery heading (5 tests); FR-MMT18 race doc (2 tests). |
| 36 | Add `standing-pool-submitter` to `plugin.json`. **Coordinated PR with Tasks 8 and 33.** | S | Task 35; Task 8 | pending |
| 37 | Author Layer 1 validator at `tests/schemas/pool-report-envelope.ts` validating FR-MMT16a envelope: `status` enum (`success | failed`); `report` non-null when success, null when failed; `error.code`/`error.message` non-null when failed, null when success; `metadata` block with `pool_name`, `multi_model`, `task_uuids`, `completed_at`. Vitest with samples for both `status` values. | M | Task 31 | done (iter 4) — 50 [T] tests in tests/schemas/pool-report-envelope.test.ts. Test→criterion linkage: [T1] missing-required-fields (6 tests) + status-conditional violations (11 tests); [T2] valid SUCCESS_ENVELOPE sample + valid FAILED_ENVELOPE sample (9 tests total for both status values); [T3] task_uuids non-empty-array enforcement (6 tests: rejects missing, empty [], string type, non-string elements; accepts single + three UUIDs). Exports: validateReportEnvelope, ENVELOPE_STATUS_VALUES, KNOWN_ERROR_CODES. |
| 38 | Layer 2 fixture at `tests/fixtures/multi-model-teams/routing/discovery-and-submit/`: spawn `code-reviewer + security-reviewer` pool; standard command needs same set (covers); inline discovery (Task 54) returns `routed-to-pool`; submitter writes 2 task files atomically, mailbox notification posted; pool processes, writes envelope to report-to path; submitter reads envelope; returns `status: success`. Asserts: UUID-based filenames; `.tmp`+rename pattern verifiable from filesystem trace; report-to uses unique-per-submission UUID. | L | Tasks 35, 37; Phase 3.2; Phase 5 (Task 41 spawns the pool) | pending |
| 39 | Layer 2 fixture at `tests/fixtures/multi-model-teams/routing/concurrent-submitters/`: two simulated submitting commands write to same pool concurrently. Asserts: both succeed; each receives correct envelope at its own report-to path (no cross-contamination); pool serializes via file-based task list (FR-MMT18 criterion). | M | Task 38 | pending |
| 40 | Layer 2 fixture at `tests/fixtures/multi-model-teams/routing/timeout/`: spawn pool that intentionally hangs; submitter polls; after timeout, asserts: tasks marked `abandoned`; verbatim FR-MMT16a one-line note emitted; routing decision = `fell-back-timeout`. | M | Tasks 35, 37; Phase 5 | pending |
| 30b | Layer 2 fixture at `tests/fixtures/multi-model-teams/pool-lifecycle/draining-end-to-end/` (split from former Task 30): spawn pool with one in-flight task; trigger TTL expiration; observe Pool Lead transitions to `draining` (verified separately by Task 30a); **submitter receives drain state and rejects new submission with `routing_decision: "fell-back-pool-draining"` per FR-MMT14a**; observe in-flight task completes; observe submitter's caller falls back per `prefer-with-fallback`. | M | Task 30a; Task 35; Phase 5 | pending |

**Task 35 Acceptance Criteria:**
- `[T]` Agent declares Haiku model
- `[T]` Re-reads pool `config.json` before each submission to detect `draining`/`stopping` (FR-MMT14a step 1, raw-string check)
- `[T]` Atomic write pattern (`.tmp` + rename) for tasks AND mailbox notifications AND report-to envelope
- `[T]` UUID-based filenames for tasks, mailbox messages, and report-to path
- `[T]` Polling: 2s with backoff to 10s (raw-string check)
- `[T]` Timeout fallback emits verbatim FR-MMT16a one-line note (raw-string check)
- `[T]` Submitter does NOT own FR-MMT24 recovery (raw-string check — no "recovery" responsibilities); recovery is caller's per Task 48

**Task 36 Acceptance Criteria:**
- `[T]` `plugin.json` parses; agent registered
- `[T]` PR coordinates with Tasks 8 and 33

**Task 37 Acceptance Criteria:**
- `[T]` Validator catches envelopes missing required fields per `status`
- `[T]` Both `status: success` and `status: failed` samples validated
- `[T]` `metadata.task_uuids` is non-empty array

**Task 38 Acceptance Criteria:**
- `[T]` Discovery returns `routed-to-pool` with `match_rationale` mentioning `covers` (use ASCII alternative such as `superset-of` or `covers` in addition to `⊇`)
- `[T]` Tasks visible at expected paths with UUID filenames
- `[T]` `.tmp`+rename verifiable from filesystem trace (no partial writes)
- `[T]` Submitter receives well-formed envelope; report content non-null

**Task 39 Acceptance Criteria:**
- `[T]` Both submissions complete (both `status: success`)
- `[T]` Each submitter's report-to path contains its own envelope (no cross-contamination)
- `[T]` Pool's task list shows tasks processed in arrival order (FR-MMT18)

**Task 40 Acceptance Criteria:**
- `[T]` Pool task statuses transition to `abandoned` after timeout
- `[T]` Verbatim FR-MMT16a one-line note emitted (raw-string check)
- `[T]` Submitter routing-decision = `fell-back-timeout`

**Task 30b Acceptance Criteria:**
- `[T]` Submitter receives drain state and rejects new submission with `routing_decision: "fell-back-pool-draining"` (FR-MMT14a verification)
- `[T]` Caller falls back per `prefer-with-fallback` mode
- `[T]` In-flight tasks complete normally; pool removed from `index.json` after drain

**Parallelizable:** Tasks 35 and 37 in parallel. Tasks 36, 38, 39, 40, 30b follow.
**Milestone Value:** Submission pipeline complete with timeout handling and end-to-end drain rejection.

---

## Phase 5 — Feature B: Standing-Pool Commands

Three new synthex-plus commands. Bundled in one milestone per D12. **Producer-side: spawns/stops/lists pools. Does NOT depend on Phase 4 (consumer-side) — only on Phase 3.** This unblocks Phase 5 to start in parallel with Phase 4.

### Milestone 5.1: start-review-team, stop-review-team, list-teams

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 41 | Author `plugins/synthex-plus/commands/start-review-team.md` per FR-MMT9 (10-step workflow). Implements: parameter table (5 params); pre-flight checks adapted from `team-init` Step 2-4; parameter resolution with config defaults (silent fallback); pool name validation per D18; roster validation against existing Synthex agent files; multi-model preflight via D15 reuse of parent Task 21 (or duplicate logic if Q1 resolves to inline-only); cross-session lock acquisition per Task 25; team spawn via `Teammate` API with name `standing/<name>`; pool metadata write (config.json per Task 22, initial `pool_state: idle`, `last_active_at` = spawn timestamp) + index update (atomic, dual-write); pool teammates idle and emit "pool ready"; user confirmation with cost-warning trigger per D16/NFR-MMT2.

**Step 7 (Spawn the team) — overlay-composition logic per D22:** When composing each pool teammate's spawn prompt: (a) ALWAYS include `### Standing Pool Identity Confirm Overlay (apply when standing=true)` verbatim (overlay applies because every pool teammate has `standing: true`); (b) When `multi_model: true`: additionally compose Pool Lead's spawn prompt with `### Multi-Model Conditional Overlay (apply when multi_model=true)` verbatim (Lead-suppression); compose each pool reviewer's spawn prompt with the same overlay verbatim (JSON-envelope); (c) compose Pool Lead's spawn prompt with `### Standing Pool Lifecycle Overlay (apply when standing=true)` from Task 27 verbatim (Pool-Lead-only — NOT in reviewer prompts).

**Step 10:** confirmation includes `submission_timeout_seconds` (top-level per D23) alongside TTL.

**Cost advisory verbatim copy** per D16/NFR-MMT2: `"Heads up: this pool will keep {reviewer_count} reviewers idle for up to {ttl_minutes} minutes. Estimated idle cost: ~{cost_estimate}. Continue?"` (interpolated; embed verbatim in command body and in Task 46(e) fixture). | L | Phase 3; parent Phase 3 (multi-model preflight) | pending |
| 42 | Author `plugins/synthex-plus/commands/stop-review-team.md` per FR-MMT10. Implements: parameter table (`name`, `all`, `force`); resolve target pools (interactive prompt via `AskUserQuestion` if no flags, with verbatim FR-MMT10 step 1 prompt); **when invoked with no args, display the standing-pools section of the `/list-teams` table format BEFORE the prompt**; in-flight task warning unless `--force`; send shutdown via `SendMessage` to Pool Lead with `type: shutdown`; wait up to 30s for cleanup with verbatim 30s-elapsed message per FR-MMT10 step 4; update index per Task 25 lock semantics; per-pool status confirmation. **Terminology:** "Pool Lead" only. | L | Phase 3 (Pool Lead drain logic — Task 27) | pending |
| 43 | Author `plugins/synthex-plus/commands/list-teams.md` per FR-MMT11. Implements: enumerate non-standing teams from `~/.claude/teams/` (excluding `standing/`); enumerate standing pools from `~/.claude/teams/standing/index.json`; gather per-team metadata; display in two-section table (standing first, non-standing second) per FR-MMT11 verbatim; State column with four enumerated values; TTL Remaining always integer; State-value reference footnote in interactive output; friendly empty-list message. | M | Phase 3 | pending |
| 44 | Update `plugins/synthex-plus/.claude-plugin/plugin.json` to register all three new commands in `commands` array. **Single coordinated PR with Tasks 41–43.** Bump synthex-plus plugin version per CLAUDE.md release rules (deferred to Phase 9 Task 72). | S | Tasks 41, 42, 43 | pending |
| 45 | Author Layer 1 schema validators: (a) `tests/schemas/start-review-team-output.ts` — confirmation output shape, cost-warning conditional per D16, `submission_timeout_seconds` row; (b) `tests/schemas/list-teams-output.ts` — table column structure, State enum (all four including `stopping`), TTL integer-ness; (c) `tests/schemas/stop-review-team-output.ts` — per-pool status messages, pre-prompt table display (no-args path). Vitest with normal and edge-path samples. | M | Tasks 41, 42, 43 | pending |
| 46 | Layer 2 fixtures at `tests/fixtures/multi-model-teams/commands/`: (a) `start-default/` — verifies `config.json` and `index.json` written; **pool teammates' composed spawn prompts contain `### Standing Pool Identity Confirm Overlay` verbatim**. (b) `start-multi-model/` — verifies preflight (D15) and warning-level results trigger Continue prompt; **Pool Lead spawn prompt contains all three overlays verbatim; pool reviewer spawn prompts contain identity-confirm + multi-model verbatim, but NOT Lifecycle**. (c) `start-invalid-name/` — regex-validation reject before any FS write. (d) `start-duplicate-name/` — duplicate-name abort with FR-MMT9 hint. (e) `start-cost-warning/` — 4-reviewer pool triggers D16 cost advisory (raw-string match on Task 41 verbatim). (f) `stop-with-inflight/` — `--force` overrides in-flight warning. (g) `list-empty/` — friendly empty message. (h) `list-with-mixed-states/` — State column renders for ALL FOUR `pool_state` values; **sub-scenario:** a fixture with a pool whose `config.json` has `pool_state: stopping` exercises the live `list-teams` path. (i) `stop-no-args-interactive/` — invokes `/stop-review-team` with no args; standing-pools table displayed BEFORE prompt; user picks pool; pool stops. (j) `stop-no-args-cancel/` — same as (i); user cancels; verifies no changes (index.json unchanged, no shutdown signal). | L | Tasks 41–45 | pending |

**Task 41 Acceptance Criteria:**
- `[T]` All 10 workflow steps from FR-MMT9 present
- `[T]` Pool name validation regex matches FR-MMT9 step 3 verbatim; verbatim error present
- `[T]` Multi-model preflight reuses parent's preflight per D15 (raw-string check; conditional on Q1)
- `[T]` Cross-session lock uses `mkdir`-based primitive from Task 25
- `[T]` `config.json` written with `pool_state: idle` and `last_active_at` = spawn timestamp
- `[T]` Index update is atomic (`.tmp`+rename) under lock
- `[T]` Cost advisory verbatim text embedded in command body (raw-string check); verified by Task 46(e)
- `[T]` Step 7 contains explicit overlay-composition instructions per D22 (raw-string match on the four overlay-inclusion clauses): standing identity-confirm always for all teammates; multi-model overlay for Pool Lead and reviewers when `multi_model: true`; lifecycle overlay for Pool Lead only
- `[T]` Step 10 confirmation includes `submission_timeout_seconds` alongside TTL (raw-string check)
- `[H]` Pool roster scope note from FR-MMT9 present
- `[T]` Terminology: "Pool Lead" used (raw-string scan)

**Task 42 Acceptance Criteria:**
- `[T]` Three parameter signatures supported (`name`, `all`, `force`)
- `[T]` Interactive prompt via `AskUserQuestion` with verbatim FR-MMT10 step 1 text
- `[T]` No-args path: standing-pools section of `/list-teams` table displayed BEFORE prompt — verified by Task 46(i)
- `[T]` In-flight warning shown unless `--force`
- `[T]` Shutdown signal via `SendMessage` to Pool Lead
- `[T]` 30s timeout produces verbatim FR-MMT10 step 4 message
- `[T]` Index update uses Task 25 lock semantics
- `[T]` Force-cleanup hint includes manual paths
- `[T]` Terminology: "Pool Lead" only

**Task 43 Acceptance Criteria:**
- `[T]` Both team types enumerated (standing + non-standing)
- `[T]` Table layout matches FR-MMT11 verbatim
- `[T]` State column appears for standing pools with one of four documented values
- `[T]` TTL Remaining always integer
- `[T]` State-value-reference footnote in interactive output
- `[T]` Empty-list friendly message present
- `[T]` All four `pool_state` values render correctly (verified by Task 46(h))

**Task 44 Acceptance Criteria:**
- `[T]` `plugin.json` parses; all three commands registered
- `[T]` Existing five commands unaffected (NFR-MMT1)

**Task 45 Acceptance Criteria:**
- `[T]` All three validators pass on inline samples
- `[T]` Validators catch missing required fields and enum violations
- `[T]` `list-teams` validator covers all four `pool_state` values
- `[T]` `start-review-team` validator confirms `submission_timeout_seconds` in confirmation

**Task 46 Acceptance Criteria:**
- `[T]` All ten fixtures (a–j) produce expected outputs
- `[T]` Fixture (a): pool teammate spawn prompts contain `### Standing Pool Identity Confirm Overlay` verbatim
- `[T]` Fixture (b): Pool Lead spawn prompt contains all three overlays verbatim; reviewers contain identity-confirm + multi-model verbatim, but NOT Lifecycle (raw-string negative match)
- `[T]` Fixture (b): preflight warning triggers Continue prompt; `n` aborts cleanly
- `[T]` Fixture (c): regex-validation aborts before any FS write
- `[T]` Fixture (e): cost advisory raw-string matches Task 41 verbatim
- `[T]` Fixture (h): all four `pool_state` values render correctly
- `[T]` Fixture (i): standing-pools table displayed before prompt; pool stops gracefully
- `[T]` Fixture (j): cancel leaves index.json unchanged and sends no shutdown signal

**Parallelizable:** Tasks 41, 42, 43 in parallel (within `concurrent_tasks: 3`). Task 44 sequences after all three. Tasks 45 and 46 follow.
**Milestone Value:** All three pool-lifecycle commands ship together. Users can spawn, inspect, and stop standing pools.

---

## Phase 6 — Cross-Cutting: Failure Handling, Stale-Pool Cleanup, One-Team-Per-Session

Failure-handling FRs and synthex-plus one-team-per-session check exemption for standing pools.

### Milestone 6.1: Stale-pool cleanup, recovery path, one-team-per-session exemption

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 47 | Implement FR-MMT22 stale-pool cleanup as a sub-section in **Task 31's `routing.md` (`## Stale-Pool Cleanup`)** that calls into the cleanup-only Haiku agent (Task 32). Handles both detection conditions (metadata dir missing OR `last_active_at` older than `max(ttl_minutes, 24h)`): inline discovery in Tasks 54/57 detects; invokes `standing-pool-cleanup`; emit one-time-per-session warning per **verbatim FR-MMT22 step 5 message: `"Standing pool '{name}' was stale and has been cleaned up. {fallback_action}."`** (embed verbatim in command body — distinct from FR-MMT28 orphan warning). Continues with routing decision per `routing_mode`. **Note: orphan-scan path (Task 49) reuses this cleanup but emits FR-MMT28 warning instead.** | M | Tasks 31, 32; Phase 3.1 | pending |
| 48 | **Reframe per Architect cycle 1 finding:** FR-MMT24 per-task fallback recovery is the **submitting command's host session** responsibility (NOT `standing-pool-submitter.md`). Submitter's responsibility ends at returning the envelope (Task 35). This task: (1) authors shared spec at `docs/specs/multi-model-teams/recovery.md` documenting FR-MMT24 verbatim including: failed-reviewer-name extraction from envelope `error.message`; spawn fresh native sub-agent for that reviewer only via Task tool in submitting command's host session (same way command would spawn in non-pool mode); wait for fresh sub-agent's findings (markdown + `findings_json` if multi-model); lightweight merge per FR-MMT24 step 4 — append to surviving findings, NO full re-consolidation; for multi-model pools, run partial dedup per D19 — Stages 1+2 from parent reused as "partial dedup" entry point; emit unified report with FR-MMT24 step 5 header and `source.source_type: "native-recovery"` for recovered findings. (2) Adds workflow steps to `review-code.md` (Task 54) and `performance-audit.md` (Task 57) referencing `recovery.md`; recovery invoked when envelope `status: failed` with `error.code: reviewer_crashed`. **Skeleton includes all normative procedure from the start.** Begins with `## Status: Skeleton`. | L | Task 35; parent Phase 3.2 (Stages 1, 2 reusable — reference exact parent task numbers in PR description) | pending |
| 49 | Update synthex-plus's one-team-per-session check (currently in `team-implement.md:77-82` and equivalents) to count only non-standing teams per FR-MMT26. Exempt paths under `~/.claude/teams/standing/`. Update orphan-detection scanner per FR-MMT28 to: (a) exclude `~/.claude/teams/standing/` from existing one-team-per-session orphan check; (b) add separate scan of `~/.claude/teams/standing/` applying standing-pool orphan rule (BOTH TTL elapsed AND `last_active_at` more than 24h old); orphan scan reuses Task 47's cleanup but emits the **verbatim FR-MMT28 standing-pool orphan warning** (a distinct verbatim string from FR-MMT22 in Task 47 — do NOT reuse FR-MMT22's wording). **Cross-reference Task 47:** confirm distinct strings; document that FR-MMT22 (in-session stale) and FR-MMT28 (init-time orphan) emit different verbatim warnings. **Suppression scope:** FR-MMT22's one-time-per-session suppression does NOT suppress orphan warnings during `team-init` scan. | M | Phase 3, Task 47 | pending |
| 50 | Layer 2 fixture at `tests/fixtures/multi-model-teams/failure-handling/stale-pool/`: (a) metadata dir missing → cleanup runs, verbatim FR-MMT22 step 5 warning; (b) `last_active_at` more than 24h ago → cleanup runs, verbatim warning; (c) warning fires once per session per stale pool (run discovery twice, verify only one warning); (d) `prefer-with-fallback` mode continues without erroring; (e) `explicit-pool-required` mode aborts after cleanup leaves no matching pool; (f) FR-MMT22 in-session warning vs FR-MMT28 orphan-scan warning emit distinct strings (raw-string check both, assert non-equal). | L | Task 47; Task 49 | pending |
| 51 | Layer 2 fixture at `tests/fixtures/multi-model-teams/failure-handling/recovery-native-only/`: native-only pool with `code-reviewer + security-reviewer`; code-reviewer crashes mid-task; security-reviewer completes; submitter receives `status: failed`; **submitting command's host session** spawns fresh `code-reviewer` per `recovery.md` (Task 48); merges via simple append; unified report header indicates recovery; recovered findings carry `source.source_type: "native-recovery"`. | M | Task 48; Tasks 54, 57 | pending |
| 52 | Layer 2 fixture at `tests/fixtures/multi-model-teams/failure-handling/recovery-multi-model/`: multi-model pool 2 native + 2 external; native code-reviewer crashes; submitting command triggers recovery per `recovery.md`; fresh native code-reviewer produces markdown + `findings_json`; D19 partial dedup (Stages 1+2 only) runs against already-consolidated output; recovered findings either merged (gaining `native-recovery` attribution) or emitted as new entries. Asserts: Stage 3+ NOT re-run (verifiable by absence of CoVe LLM calls in trace). | M | Task 48; parent Phase 3.2 | pending |
| 53 | Layer 2 fixture at `tests/fixtures/multi-model-teams/failure-handling/one-team-per-session/`: spawn standing pool; spawn `/team-review` (non-standing); both succeed (FR-MMT26 criterion 2); spawn second `/team-review`; aborted with original error (FR-MMT26 criterion 3, message unchanged). | S | Task 49 | pending |

**Task 47 Acceptance Criteria:**
- `[T]` Cleanup procedure documented in `routing.md` and invokes Task 32's cleanup agent
- `[T]` Atomic: index entry and metadata dir removed under lock (delegated to cleanup agent)
- `[T]` One-time-per-session warning suppression implemented (raw-string mention of "transient marker in calling session's state")
- `[T]` Verbatim FR-MMT22 step 5 warning embedded in command-side workflow markdown (raw-string check)

**Task 48 Acceptance Criteria:**
- `[T]` `docs/specs/multi-model-teams/recovery.md` created with `## Status: Skeleton` (Phase 8 final pass per Task 65/66/67 pattern)
- `[T]` Doc covers: failed reviewer name extraction; fresh sub-agent invocation via Task tool from submitting command's host session (NOT submitter agent); lightweight merge / D19 partial dedup; recovered-finding attribution; report header verbatim per FR-MMT24 step 5
- `[T]` `review-code.md` and `performance-audit.md` reference `recovery.md` and invoke recovery on `status: failed` (raw-string check on each)
- `[T]` Multi-model partial dedup (D19) reuses parent's Stage 1+Stage 2 entry point — explicit reference to parent's task numbers in `recovery.md`
- `[T]` Stages 3–6 NOT re-run in recovery (raw-string check; verified by Task 52)
- `[T]` Recovered findings carry `source.source_type: "native-recovery"` (Task 51/52 verify)
- `[T]` Report header includes verbatim FR-MMT24 step 5 recovery indication
- `[T]` `standing-pool-submitter.md` (Task 35) does NOT contain recovery logic (raw-string negative check)

**Task 49 Acceptance Criteria:**
- `[T]` One-team-per-session check excludes `~/.claude/teams/standing/`
- `[T]` Orphan scanner has two passes: existing (excluding standing) + new (standing-pool orphan rule)
- `[T]` Standing-pool orphan warning matches verbatim FR-MMT28 text (distinct from FR-MMT22 step 5 — raw-string non-equal check between Task 47 and Task 49 strings)
- `[T]` Original one-team-per-session error message unchanged for non-standing-team conflict
- `[T]` Suppression scope clarified: FR-MMT22 in-session marker does NOT suppress FR-MMT28 orphan warnings

**Task 50 Acceptance Criteria:**
- `[T]` All six sub-cases produce expected outputs
- `[T]` Fixture (c): only one warning across two same-session discoveries
- `[T]` Fixtures (d) and (e): correct routing-mode-specific behavior
- `[T]` Fixture (f): FR-MMT22 and FR-MMT28 verbatim strings non-equal

**Task 51 Acceptance Criteria:**
- `[T]` Surviving findings preserved; recovered findings appended
- `[T]` Recovered findings carry `source.source_type: "native-recovery"`
- `[T]` Report header verbatim per FR-MMT24 step 5
- `[T]` Recovery invoked from submitting command's host session (verifiable by trace — Task tool spawn comes from `/review-code` not from submitter)

**Task 52 Acceptance Criteria:**
- `[T]` D19 partial dedup runs Stages 1+2 only (verified by trace — no CoVe LLM calls observed)
- `[T]` Recovery findings either merged into existing canonical findings (gaining `native-recovery` attribution alongside existing source attributions) or emitted as new entries
- `[T]` Cost evidence: trace shows < 10% of full re-consolidation pipeline

**Task 53 Acceptance Criteria:**
- `[T]` Standing pool + non-standing team coexist
- `[T]` Second non-standing team spawn aborts with unchanged error message

**Parallelizable:** Tasks 47, 48, 49 in parallel after predecessors. Tasks 50, 51, 52, 53 follow respective implementations.
**Milestone Value:** All failure paths covered. System degrades gracefully. Recovery correctly owned by the submitting command's host session per FR-MMT24.

---

## Phase 7 — Routing Integration: /review-code and /performance-audit

Wires Phase 4 discovery + submitter primitives into the two v1 routing-enabled commands. **Phase 7 dependencies:** Phase 4 (discovery + submitter), Phase 5 (commands that spawn the pools — fixtures need real pools), Phase 6 (cleanup + recovery).

### Milestone 7.1: /synthex:review-code routing integration

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 54 | Update `plugins/synthex/commands/review-code.md` to add discovery + routing + recovery integration. **Per Architect cycle 1 finding, discovery is INLINE in this command's workflow markdown — NOT a Haiku agent invocation. The cleanup-only `standing-pool-cleanup` agent (Task 32) is invoked by the inline discovery step on stale-pool detection.**

Step sequence: (a) compute required-reviewer-set per FR-MMT15 normative chain (`--reviewers` flag → `code_review.reviewers` → hardcoded fallback); (b) **inline discovery sub-step**: read `~/.claude/teams/standing/index.json` directly via Read tool; filter pools by required-reviewer-set + matching_mode + ttl_minutes; on expired pool observed during filter, invoke `standing-pool-cleanup` agent inline; produce inline-discovery output per Task 34 schema; (c) on `routing_decision: routed-to-pool`, invoke `standing-pool-submitter` agent with the routed pool, native task list, report-to path; (d) on `routed-to-pool`, emit **verbatim FR-MMT17 routing notification: `"Routing to standing pool '{pool_name}' (multi-model: {yes|no})."`** (interpolated; embed verbatim in command body); (e) on any `fell-back-*`: silent fall-back in `prefer-with-fallback`, abort with verbatim FR-MMT17 explicit-pool-required error in `explicit-pool-required`; (f) on routed-to-pool, when envelope `status: failed`, **invoke FR-MMT24 recovery per `recovery.md` (Task 48) — recovery owned by THIS command's host session, not by submitter**.

Discovery is conditional on `standing_pools.enabled: true` from `.synthex-plus/config.yaml`. | L | Phase 4, Phase 5, Phase 6 | pending |
| 55 | **NFR-MMT7 pool-routed output template — verbatim copy locked here per D25.** Add the four required user-visible items to `review-code.md`. Embed verbatim:

**Item 1 (routing confirmation, per FR-MMT17, owned by Task 54 step d):** `"Routing to standing pool '{pool_name}' (multi-model: {yes|no})."`

**Item 2 (submission confirmation, when submitter is invoked):** `"Submitted task '{uuid}' to pool '{pool_name}'. Polling for completion (timeout: {timeout}s)."`

**Item 3 (waiting indicator, every 30s while polling, suppressed when stdout is not a TTY — CI-friendly default; omitted when wait < 60s):** `"Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete..."`

**Item 4 (provenance line in report header):** `"Review path: standing pool '{pool_name}' (multi-model: {yes|no})."`

Item 1 acceptance is covered by FR-MMT17 acceptance via Task 54. Items 2, 3, 4 each get `[T]` raw-string acceptance below. | M | Task 54 | pending |
| 56 | Layer 2 fixtures at `tests/fixtures/multi-model-teams/routing/review-code/`: (a) `pool-match-native-only/` — pool with `code-reviewer + security-reviewer`, command needs same set, `prefer-with-fallback`; routes; receives report; verbatim notification with `multi-model: no`. (b) `pool-match-multi-model/` — same but pool has `--multi-model`; notification emits `multi-model: yes`; report carries multi-model attribution. (c) `no-pool-fallback/` — no pool; silent fall-through; report byte-identical to baseline (Task 0). (d) `roster-mismatch-fallback/` — pool exists but missing required reviewer; falls back; audit records `fell-back-roster-mismatch`. (e) `explicit-pool-required-abort/` — `routing_mode: explicit-pool-required` + no matching pool; abort with verbatim FR-MMT17 error. (f) `pool-draining-fallback/` — pool in `draining`; submitter detects via re-read, returns `fell-back-pool-draining`; command falls back; audit records decision. **(g) `tty-suppressed-waiting-indicator/`** — wait > 60s; stdout not TTY (CI sim); waiting indicator (NFR-MMT7 item 3) suppressed; submission completes. (h) `waiting-indicator-tty/` — wait > 60s; stdout IS TTY; indicator emits at 30s cadence with verbatim Task 55 text. (i) `wait-under-60s/` — submission completes < 60s on TTY; indicator NOT emitted (per Task 55 60s threshold). | L | Tasks 54, 55; Phase 5 | pending |

**Task 54 Acceptance Criteria:**
- `[T]` Discovery runs at command-invocation time per FR-MMT15 criterion 1
- `[T]` Discovery is INLINE in workflow (raw-string check — no `standing-pool-router` agent invocation)
- `[T]` `standing-pool-cleanup` agent invoked inline on stale-pool detection during filter
- `[T]` Required-reviewer-set chain matches FR-MMT15 normative for `/review-code`
- `[T]` Discovery conditional on `standing_pools.enabled: true`; when disabled, command runs identically to today (FR-MMT15 criterion 8 — implicit)
- `[T]` Verbatim FR-MMT17 routing notification embedded (raw-string check) — Item 1 of NFR-MMT7
- `[T]` Verbatim FR-MMT17 explicit-pool-required error on no-match in that mode (raw-string check)
- `[T]` Recovery path invoked on `status: failed` — owned by THIS command's host session per `recovery.md` (Task 48), NOT by submitter

**Task 55 Acceptance Criteria:**
- `[T]` Item 2 (submission confirmation) verbatim text present (raw-string match)
- `[T]` Item 3 (waiting indicator) verbatim text present (raw-string match)
- `[T]` Item 4 (provenance line) verbatim text present (raw-string match)
- `[T]` Item 3 conditional logic: suppressed when stdout not TTY (raw-string check); omitted when wait < 60s (raw-string check)
- Note: Item 1 verified by Task 54 criterion 6.

**Task 56 Acceptance Criteria:**
- `[T]` All nine sub-cases produce expected outputs
- `[T]` Fixture (a): verbatim notification with `multi-model: no` suffix
- `[T]` Fixture (b): verbatim notification with `multi-model: yes`; report attribution split
- `[T]` Fixture (c): byte-identical to Task 0 baseline for `/review-code`
- `[T]` Fixture (e): verbatim FR-MMT17 error
- `[T]` Fixture (f): submitter re-read of `config.json` exercised; `fell-back-pool-draining` audit value present
- `[T]` Fixture (g): waiting indicator suppressed when stdout not TTY (raw-string negative check)
- `[T]` Fixture (h): waiting indicator emits with verbatim Task 55 item 3 text on TTY
- `[T]` Fixture (i): waiting indicator NOT emitted when wait < 60s

**Parallelizable:** Tasks 54 and 55 sequence; Task 56 follows.
**Milestone Value:** `/review-code` is pool-routing capable. Users with standing pools see speedup; users without see today's behavior unchanged.

### Milestone 7.2: /synthex:performance-audit routing integration

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 57 | Update `plugins/synthex/commands/performance-audit.md` to add discovery + routing + recovery from Task 54 (same pattern; INLINE). Required-reviewer-set is **static** per FR-MMT15 normative — hardcoded `[performance-engineer]`; no `--reviewers` flag, no `performance_audit.reviewers` config. Same flow as Task 54; same recovery via `recovery.md` (Task 48). NFR-MMT7 output template applied per Task 55 — **identical verbatim copy reused for all four items** (NOT independently authored — see D25). | M | Tasks 54, 55; Phase 5 | pending |
| 58 | Layer 2 fixtures at `tests/fixtures/multi-model-teams/routing/performance-audit/`: (a) `pool-match/` — pool with `performance-engineer` (single-reviewer roster, `covers` match against `[performance-engineer]`); routes; receives report. (b) `no-pool-fallback/` — no matching pool; silent fall-through; report byte-identical to baseline (Task 0). (c) `roster-mismatch/` — pool with only `code-reviewer + security-reviewer` doesn't cover `[performance-engineer]`; falls back. | M | Task 57; Phase 5 | pending |
| 34a | **Deferred status — runs after Phase 7 ships.** Full end-to-end Layer 2 latency fixture at `tests/fixtures/multi-model-teams/routing/latency/` asserting NFR-MMT3 across the live submitting-command path. Three sub-cases: 0/1/10 indexed pools. Asserts: discovery step (inline read + filter) < 100 ms across all sub-cases; end-to-end cold-case routing overhead with `standing_pools.enabled: true` < 500 ms (full path through `/review-code` and `/performance-audit`). Records CI-stable methodology (wall-clock around discovery substep AND full routing decision, multiple runs, P95 reported). Complements Task 34a-pre (discovery-primitive layer, Phase 4); this closes the end-to-end NFR-MMT3 contract once consumer commands exist. | M | Tasks 32, 54, 57 | pending |

**Task 57 Acceptance Criteria:**
- `[T]` Discovery uses static required set `[performance-engineer]`
- `[T]` Discovery is INLINE in workflow (raw-string check; no `standing-pool-router` invocation)
- `[T]` Same routing semantics as Task 54
- `[T]` NFR-MMT7 output template applied with verbatim copy reused from Task 55 (raw-string match same strings — NO independent authoring per D25)
- `[T]` Recovery via `recovery.md` (Task 48)

**Task 58 Acceptance Criteria:**
- `[T]` All three fixtures produce expected outputs
- `[T]` Fixture (b): byte-identical to Task 0 baseline for `/performance-audit`

**Task 34a Acceptance Criteria (deferred — runs after Phase 7 ships):**
- `[T]` Discovery step P95 < 100 ms across 0/1/10 pools through full submitting-command path (NFR-MMT3)
- `[T]` Cold-case routing overhead end-to-end P95 < 500 ms with `standing_pools.enabled: true` (NFR-MMT3)
- `[T]` Methodology documented in fixture README
- `[T]` Complements Task 34a-pre (Phase 4 primitive); Task 34a covers full submitter path

**Parallelizable:** Tasks 57 and 58 sequence after Milestone 7.1. Task 34a runs after 54 and 57 land.
**Milestone Value:** Both v1 routing-enabled commands ship. Other 5 commands unaffected (D10). NFR-MMT3 end-to-end verified by Task 34a.

---

## Phase 8 — Audit Extensions, Discoverability, Documentation

Extends parent's audit writer with team/pool/recovery blocks. Surfaces both features at init time. Ships final docs.

### Milestone 8.1: Audit artifact extensions

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 59 | Extend parent's audit writer (parent plan Task 39) to accept three optional blocks per FR-MMT30: `team_metadata` (present when `/team-review` with multi-model active per FR-MMT3), `pool_routing` (REQUIRED on every audit emitted by routing-enabled commands), `recovery` (present when FR-MMT24 fired). Extend writer's input schema (parent's writer is parameterized; this adds three optional named blocks). Per FR-MMT30 normative schema verbatim. | M | Phase 2, Phase 7; parent Task 39 | pending |
| 60 | Implement FR-MMT30a per-finding attribution telemetry as a fourth optional block: `finding_attribution_telemetry` array, gated by `multi_model_review.audit.record_finding_attribution_telemetry` (default `true` per Task 2). Schema per FR-MMT30a verbatim (`consolidated_finding_id`, `raised_by[]`, `consensus_count`, `minority_of_one`). | M | Task 59; Task 2; Task 60a | pending |
| 60a | **Coordinate parent orchestrator update for per-finding attribution data flow.** Parent's `multi-model-review-orchestrator.md` Stage 1+2 dedup must retain a `raised_by[]` map per consolidated finding (each entry: `reviewer_id`, `family`, `source_type`) and surface to the audit writer. Without this upstream change, Task 60 cannot populate `raised_by[]`. Coordinate as a parent-plan PR landing before Task 60. **Related to Q3.** | S | Parent Stages 1+2 (orchestrator implementation) | pending |
| 61 | Extend parent's `tests/schemas/audit-artifact.ts` validator (parent Task 40) to validate the four new optional blocks. Vitest cases for each. Validate `pool_routing.routing_decision` enum covers all FR-MMT30 values; validate `finding_attribution_telemetry` presence/absence per config flag. | M | Tasks 59, 60 | pending |
| 62 | Layer 2 fixture extensions: (a) Task 18 (multi-model `/team-review` enabled) → audit contains `team_metadata`; (b) Task 56(a) (pool-match `/review-code`) → audit contains `pool_routing.routing_decision: "routed-to-pool"`; (c) Task 56(c) (no-pool-fallback) → audit contains `pool_routing.routing_decision: "fell-back-no-pool"`; (d) Task 51 (recovery) → audit contains `recovery.occurred: true`; (e) any multi-model fixture with `record_finding_attribution_telemetry: true` → audit contains `finding_attribution_telemetry`; with flag `false` → block absent. | L | Tasks 59, 60, 61 | pending |

**Task 59 Acceptance Criteria:**
- `[T]` Writer accepts three new optional blocks; existing parent tests (Task 40) pass unchanged
- `[T]` `team_metadata` schema matches FR-MMT30 verbatim
- `[T]` `pool_routing` REQUIRED on every audit emitted by `/review-code` and `/performance-audit` (FR-MMT30 criterion 4)
- `[T]` Cross_domain_messages count and per-message metadata present in `team_metadata`
- `[H]` A developer unfamiliar with FR-MMT15 matching semantics can read `pool_routing` and understand why the routing decision was made; `match_rationale` examples use ASCII-friendly notation (e.g., `superset-of` or `covers`) as alternative to `⊇`

**Task 60 Acceptance Criteria:**
- `[T]` `finding_attribution_telemetry` present when flag `true` (default)
- `[T]` Block omitted entirely when flag `false`; rest of audit unchanged
- `[T]` Each entry includes `consolidated_finding_id`, `raised_by[]`, `consensus_count`, `minority_of_one`
- `[T]` `raised_by[]` correctly populated from upstream orchestrator data (Task 60a precondition)
- `[T]` `minority_of_one: true` correctly identifies findings that survived FR-MR14b demotion path

**Task 60a Acceptance Criteria:**
- `[T]` Parent plan PR opened and merged extending orchestrator Stage 1+2 to retain `raised_by[]` map
- `[T]` Parent's audit-writer integration accepts the map as input
- `[H]` Coordination documented in this task's PR description with parent task numbers

**Task 61 Acceptance Criteria:**
- `[T]` Validator catches malformed blocks
- `[T]` Validator validates `routing_decision` enum coverage (all FR-MMT30 values)
- `[T]` Validator handles block presence/absence per config flag

**Task 62 Acceptance Criteria:**
- `[T]` All five sub-cases produce expected audit artifacts
- `[T]` Validator passes on each generated audit file

**Parallelizable:** Task 60a runs in parallel with 59/60 (parent coordination is independent of writer authoring). Tasks 59 and 60 sequence (60 depends on 59 and 60a). Task 61 follows. Task 62 fixtures follow.
**Milestone Value:** Audit pipeline complete with team/pool/recovery/attribution blocks.

### Milestone 8.2: team-init updates and documentation

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 63 | Update `plugins/synthex-plus/commands/team-init.md` per FR-MMT27 (D21 — after Step 5, before Step 7). Add two sections: (a) "Standing review pools (optional)" — describe briefly; `AskUserQuestion` with Enable/Skip; on Enable, write `standing_pools.enabled: true` to `.synthex-plus/config.yaml`; (b) "Multi-model in /team-review (optional)" — describe Feature A; defer to parent's init prompt for underlying `multi_model_review` setup; offer to enable `multi_model_review.per_command.team_review.enabled: true` if user already enabled `multi_model_review.enabled: true`. Update Step 7 guidance template to add three new commands when `standing_pools.enabled: true` with **verbatim one-line descriptions:**
- `start-review-team — Spawn a standing review pool for persistent reviewer reuse across commands`
- `stop-review-team — Stop a standing review pool gracefully (drains in-flight tasks)`
- `list-teams — List all active teams and standing pools with status, roster, and TTL remaining`

**Skip default:** Both new prompts default to Skip (Enter without text = Skip). **Non-interactive (CI):** TTY check analogous to NFR-MMT7 item 3 — when stdout is not a TTY, both prompts auto-select Skip without blocking. The "Available templates" section is unchanged. | M | Phase 5; parent Phase 6 (init updates) | pending |
| 64 | Layer 2 fixture at `tests/fixtures/multi-model-teams/init/`: (a) skip both → config unchanged. (b) enable standing pools, skip multi-model → `standing_pools.enabled: true` written; no pool spawned (FR-MMT27 criterion 3); Step 7 lists three new commands with verbatim descriptions. (c) enable both → both config keys written; Step 7 updated. (d) non-interactive (TTY=false) → both prompts auto-skip; no config changes; no blocking. (e) interactive default (Enter without text) → prompt treats as Skip. | M | Task 63 | pending |
| 65 | Final pass on `docs/specs/multi-model-teams/architecture.md` (replaces Task 3 skeleton per `## Status: Final`). Adds narrative prose, examples, cross-references to normative content already in skeleton. Covers: Option B, two-consolidation-surfaces (FR-MMT4), bridge mechanism (FR-MMT20), cross-session lifetime (FR-MMT5a), identity drift (FR-MMT5b), state machine, audit-artifact extensions, deferred-Stage-3 inheritance from parent. Cross-references to parent's architecture doc. **Related documentation** section at top with links to `pool-lifecycle.md`, `routing.md`, `recovery.md`, `standing-pools.md`. | L | Phase 6 | pending |
| 66 | Final pass on `docs/specs/multi-model-teams/pool-lifecycle.md` (replaces Task 22 skeleton). Adds narrative prose, examples, cross-references. Covers: per-pool `config.json` schema (FR-MMT7), index entry schema (FR-MMT9b), state machine, TTL semantics (FR-MMT13), draining (FR-MMT14a), stale-pool detection (FR-MMT22), recovery (cross-reference `recovery.md`), one-team-per-session exemption (FR-MMT26), orphan classification (FR-MMT28). Related documentation section at top. | L | Phase 6 | pending |
| 67 | Final pass on `docs/specs/multi-model-teams/routing.md` (replaces Task 31 skeleton). Adds narrative prose, examples, cross-references. Covers: discovery (FR-MMT15 with v1 scope per D10, INLINE-discovery convention), submission (FR-MMT16), envelope (FR-MMT16a), prefer-with-fallback (FR-MMT17), explicit-pool-required, race conditions (FR-MMT18), output template (NFR-MMT7), v2 extension points per D10. Related documentation section at top. | L | Phase 7 | pending |
| 67a | Final pass on `docs/specs/multi-model-teams/recovery.md` (replaces Task 48 skeleton). Covers: trigger (envelope `status: failed` with `error.code: reviewer_crashed`), failed-reviewer-name extraction, fresh sub-agent spawn from submitting command's host session via Task tool, lightweight merge for native-only, D19 partial dedup (Stages 1+2) for multi-model, `source.source_type: "native-recovery"` attribution, FR-MMT24 step 5 report header. Related documentation section at top. | M | Phase 6 | pending |
| 68 | Author user-facing design doc at `plugins/synthex-plus/docs/standing-pools.md` per NFR-MMT8. Audience: end-users. Covers: what standing pools are, when to use, three commands with examples, configuration overview, multi-model variant, troubleshooting (orphans, stale pools, manual cleanup). Cross-references all four `docs/specs/multi-model-teams/*.md` docs. Includes empirical idle-cost measurement placeholder per NFR-MMT2 criterion 1 (filled after dogfooding per PRD §7.1a). | L | Tasks 65, 66, 67, 67a | pending |
| 69 | Update `plugins/synthex-plus/README.md` per NFR-MMT8: add commands and link to `docs/standing-pools.md`; one-paragraph overview of Feature A and Feature B; off-by-default statement; cross-reference to architecture doc. | S | Task 68 | pending |
| 70 | Update `plugins/synthex/README.md` per NFR-MMT8: note pool routing in `/review-code` and `/performance-audit`; cross-reference to standing-pools doc; explicit "off by default unless synthex-plus is initialized with `standing_pools.enabled: true`" statement. | S | Task 68 | pending |
| 71 | Update root `CLAUDE.md` per NFR-MMT8: add `start-review-team`, `stop-review-team`, `list-teams` to synthex-plus commands table; describe pool routing in standard commands; reference new doc directory. | S | Task 68 | pending |

**Task 63 Acceptance Criteria:**
- `[T]` Both new sections present at FR-MMT27 insertion point (after Step 5, before Step 7)
- `[T]` Standing-pool section uses `AskUserQuestion` with Enable/Skip
- `[T]` Multi-model section defers to parent's init prompt (raw-string reference)
- `[T]` Step 7 conditionally lists three new commands per FR-MMT27 criterion 4
- `[T]` Three new descriptions present verbatim (raw-string match each line)
- `[T]` Skip-default: Enter without text = Skip
- `[T]` Non-interactive auto-skip: when stdout not TTY, both prompts auto-Skip without blocking
- `[T]` TTY-check instruction present in command markdown (raw-string check)
- `[H]` Skip leaves config unchanged

**Task 64 Acceptance Criteria:**
- `[T]` All five fixtures produce expected config-file states / Step-7 outputs
- `[T]` Fixture (b): no pool spawned; Step 7 lists three new commands with verbatim descriptions
- `[T]` Fixture (c): both config keys present in resulting `.synthex-plus/config.yaml` and `.synthex/config.yaml`
- `[T]` Fixture (d): non-interactive auto-skip exercised
- `[T]` Fixture (e): Enter-key default-skip exercised

**Task 65 Acceptance Criteria:**
- `[H]` Doc covers all eight architectural concerns
- `[T]` `## Status: Skeleton` replaced with `## Status: Final`
- `[T]` Cross-references to FR-MMT and FR-MR numbers accurate
- `[T]` Cross-reference to `docs/specs/multi-model-review/architecture.md` present
- `[H]` Related documentation section at top with links to `pool-lifecycle.md`, `routing.md`, `recovery.md`, `standing-pools.md`

**Task 66 Acceptance Criteria:**
- `[H]` Doc covers all nine lifecycle concerns
- `[T]` `## Status: Skeleton` replaced with `## Status: Final`
- `[T]` Recovery cross-reference points to `recovery.md` (D14/D19 documented there)
- `[H]` Related documentation section at top

**Task 67 Acceptance Criteria:**
- `[H]` Doc covers all eight routing concerns
- `[T]` `## Status: Skeleton` replaced with `## Status: Final`
- `[T]` v2 extension points (5 deferred commands) documented per D10
- `[T]` Inline-discovery convention documented
- `[H]` Related documentation section at top

**Task 67a Acceptance Criteria:**
- `[H]` Doc covers full recovery procedure with FR-MMT24 verbatim references
- `[T]` `## Status: Skeleton` replaced with `## Status: Final`
- `[T]` D19 partial-dedup documented
- `[H]` Related documentation section at top

**Task 68 Acceptance Criteria:**
- `[H]` User-facing audience appropriate (not implementer-focused)
- `[H]` Three-command walkthrough with examples
- `[T]` Empirical idle-cost placeholder section present per NFR-MMT2
- `[T]` Cross-references to all four spec docs

**Task 69 Acceptance Criteria:**
- `[H]` Synthex-plus README has the four required elements per NFR-MMT8
- `[T]` Links resolve

**Task 70 Acceptance Criteria:**
- `[H]` Synthex README mentions pool routing
- `[T]` Off-by-default statement present
- `[T]` Cross-reference to standing-pools doc resolves

**Task 71 Acceptance Criteria:**
- `[T]` Three new commands appear in synthex-plus commands table
- `[T]` Pool routing documented in standard commands section
- `[T]` Reference to new doc directory present

**Parallelizable:** Tasks 63 and 65/66/67/67a in parallel. Task 68 follows the four spec docs. Tasks 69, 70, 71 in parallel after Task 68.
**Milestone Value:** Both features discoverable, fully documented, shipped. End-of-Phase-8 = MVP ship-ready (modulo Phase 9 release).

---

## Phase 9 — Release

### Milestone 9.1: Version bumps, changelog, dogfooding handoff

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 72 | Bump `plugins/synthex-plus/.claude-plugin/plugin.json` version per CLAUDE.md release rules. | S | Phase 8 | pending |
| 72a | **Bump `plugins/synthex/.claude-plugin/plugin.json` version** per CLAUDE.md — required because Tasks 54 and 57 modified `plugins/synthex/commands/review-code.md` and `plugins/synthex/commands/performance-audit.md`. Without this bump, users on the base Synthex plugin won't see an upgrade signal. | S | Phase 8 | pending |
| 73 | Bump top-level `.claude-plugin/marketplace.json` version AND **BOTH the synthex-plus AND synthex entries' versions** per CLAUDE.md (both plugins changed). | S | Tasks 72, 72a | pending |
| 74 | Add `CHANGELOG.md` entry covering all FR-MMT features shipped in v1, with link reference at the bottom. Mentions: standing-pool functionality (3 new synthex-plus commands), multi-model on `/team-review`, **pool routing for `/review-code` and `/performance-audit` (in synthex base plugin)**, audit extensions (team/pool/recovery/attribution), `team-init` updates. **Mentions `~/.claude/teams/standing/` storage path.** Note: the `mkdir -p ~/.claude` hint is included only if pre-flight verification (LOW finding) confirms Claude Code does not guarantee `~/.claude/` exists at command runtime; otherwise omitted. | S | Tasks 72, 72a, 73 | pending |
| 75 | Set up dogfooding cohort per PRD §7.1a contract. Owner: PM. Coordinate ≥ 3 internal users; ≥ 2 weeks sustained usage; create empty `docs/retros/multi-model-teams-dogfooding.md` with measurement template (Pool routing hit rate, Wall-clock speedup, Multi-model finding-quality lift, Adoption rate, Fallback rate, Cross-session pool usage per PRD §7.2). Tech-lead-owned: confirm audit-driven measurements (FR-MMT30 routing decision enum, FR-MMT30a finding attribution telemetry) capture data automatically. | M | Phase 8 | pending |

**Task 72 Acceptance Criteria:**
- `[T]` Synchronized version with Task 73
- `[T]` Valid JSON

**Task 72a Acceptance Criteria:**
- `[T]` Synchronized version with Task 73
- `[T]` Valid JSON
- `[T]` Synthex base bumped because `/review-code` and `/performance-audit` were modified

**Task 73 Acceptance Criteria:**
- `[T]` Top-level marketplace version bumped
- `[T]` BOTH synthex-plus AND synthex entries' versions bumped to match Tasks 72 and 72a
- `[T]` Valid JSON

**Task 74 Acceptance Criteria:**
- `[H]` Changelog follows existing format
- `[H]` Mentions all listed features including pool routing in synthex base
- `[H]` Mentions `~/.claude/teams/standing/` storage path
- `[T]` `mkdir -p ~/.claude` hint included or omitted per LOW-finding verification

**Task 75 Acceptance Criteria:**
- `[H]` Dogfooding cohort identified (≥ 3 internal users)
- `[H]` Empty retro doc at `docs/retros/multi-model-teams-dogfooding.md` with measurement template
- `[H]` Tech lead confirmed audit-artifact instrumentation captures all six PRD §7.2 metrics

**Parallelizable:** Tasks 72 and 72a in parallel. Task 73 sequences after both. Task 74 follows. Task 75 in parallel.
**Milestone Value:** v1 released. Both plugin manifests bumped correctly. Dogfooding cohort ready.

---

## Phase 10 — Follow-Up: Layer 3 Semantic Eval

Lower-priority post-v1 work. Ships alongside parent's Milestone 7.3. **NFR-MMT5 wall-clock parallelism verification lives here per D24** (deferred from Phase 2).

### Milestone 10.1: Layer 3 semantic eval

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 76 | Author Layer 3 LLM-as-judge promptfoo entries for `/team-review --multi-model` consolidated reports per NFR-MMT6 Layer 3. Corpus of 5–10 real multi-model team reviews; judge prompt asks "would a human accept this consolidation?" and "are findings correctly attributed across native team and external sources?". | L | Phase 9 | pending |
| 77 | Author Layer 3 wall-clock parallelism eval (NFR-MMT5 — deferred per D24) — live invocation of multi-model `/team-review` with 2 native + 2 external; assert wall-clock ≤ 1.2× max(slowest native, slowest external) + orchestrator overhead. Tagged manual-trigger-only per CLAUDE.md (mirrors parent Task 61a precedent). | M | Task 76 | pending |
| 78 | Establish quality baseline; document expected pass rate; gate future PRs on regression. | M | Tasks 76, 77 | pending |

**Task 76 Acceptance Criteria:**
- `[H]` 5+ scenarios in corpus
- `[H]` Judge prompt elicits scoring with reasoning
- `[H]` Attribution check explicit in judge prompt

**Task 77 Acceptance Criteria:**
- `[H]` Wall-clock entry: measured wall-clock for live multi-model `/team-review` within 1.2× max(slowest native, slowest external) + overhead
- `[T]` Tagged manual-trigger-only; excluded from per-PR Layer 1 + Layer 2 default suite

**Task 78 Acceptance Criteria:**
- `[H]` Baseline documented in `docs/specs/multi-model-teams/test-baseline.md`
- `[H]` CI integration planned (manual-trigger only)

**Parallelizable:** Sequential.
**Milestone Value:** Quality regression protection beyond schema and behavioral tests.

---

## Cross-Cutting Notes for Engineering

- **No runtime code:** Per CLAUDE.md, all agents and commands are markdown invoked by Claude Code. Subprocess invocation (e.g., `mkdir`-based locking, `git diff` reads) happens via Bash tool from agent prompts.
- **Test path convention:** Add new validators **flat under `tests/schemas/`** (NOT a subdirectory) — matching existing `tests/schemas/code-reviewer.ts`, `tests/schemas/audit-artifact.ts`. Reuse parent patterns from `tests/schemas/code-reviewer.ts` (reviewer validator extension) and `tests/schemas/audit-artifact.ts` (extension by additional optional blocks).
- **Concurrent task limit:** Plan respects `concurrent_tasks: 3` per milestone. Phase 5's command-authoring tasks (41, 42, 43) parallelize within the limit, with single coordinated PR (Task 44) for `plugin.json`.
- **`plugin.json` scheduling — CRITICAL:** Tasks 8, 33, 36, 44 modify `plugins/synthex-plus/.claude-plugin/plugin.json`. Tasks 8, 33, 36 add to `agents` array (which currently doesn't exist — Task 8 creates it). Task 44 adds to `commands`. **Coordinate to avoid array-overwrite races.** Bundle Tasks 8, 33, 36 in a single coordinated PR; Task 44 stands alone (no overlap).
- **Template overlay convention (D22) — terminology:** "Overlay" = a labeled prose section in `templates/review.md` (e.g., `### Multi-Model Conditional Overlay (apply when multi_model=true)`). "Composition" = the verbatim Markdown insertion that command workflow markdown instructs the host model to perform. **No rendering engine, no Handlebars, no Mustache.** Test surface = raw-string match on the composed spawn-prompt blob.
- **Terminology — Pool Lead vs Lead vs orchestrator:** PRD §3 establishes "Pool Lead" (capitalized) as canonical for a standing-pool team's Lead, distinct from ephemeral-team "Lead" and parent's "orchestrator." **Phase 3+ task bodies and acceptance use "Pool Lead" exclusively when referring to the standing-pool team's Lead;** reserve unqualified "Lead" for ephemeral-team Lead in Phases 1–2.3. Tasks 7, 14, 22, 27, 28, 35, 42, 47, 49 carry explicit terminology checks.
- **`[H]`-bearing tasks scheduling:** Tasks 7, 22, 31, 41, 65, 66, 67, 67a, 68 carry significant `[H]` content requiring human sign-off. Schedule first in their parallel batches.
- **OQ resolution checkpoints:** Q1 before Phase 5 Task 41 (multi-model preflight). Q2 during Milestone 2.3 (Task 17 — assert against composed spawn-prompt blob per D22). Q3 before Task 2 lands (Task 2a is the explicit gate). Q4 (Teammate API spike) gates Milestone 3.2 Task 26, which gates Tasks 27+; spike outcome must be promoted to a D-row.
- **Inherited terminology (parent plan):** Canonical term for finding-producing party is **"proposer."** Use **"reviewer"** only for config keys (`reviewers:`) or user-facing labels. Bridge agent, cleanup agent, submitter agent, and `architecture.md` MUST use "proposer" in technical descriptions and "native team"/"external" in source-type descriptions.
- **`design-system-agent` naming:** PRD's "Designer" is colloquial. Tasks 16, 41, 71 use `design-system-agent`.
- **D-row invariants:** New tasks must respect (D3) Option B; (D4) spawn-time Lead suppression; (D5) template-only FR-MMT20 contract (NO agent file edits); (D9) lazy TTL no daemon; (D10) v1 routing scope = 2 commands; (D17) `record_finding_attribution_telemetry` in `.synthex/config.yaml` namespace; (D19) recovery dedup uses Stages 1+2 only; (D22) prose-overlay convention; (D23) `lifecycle.submission_timeout_seconds` top-level in synthex-plus defaults; (D24) NFR-MMT5 wall-clock deferred to Phase 10; (D25) NFR-MMT7 verbatim copy locked in Task 55. Any task that loosens these requires a new superseding D-row.
- **Parent plan coordination:** Tasks reusing parent deliverables must reference parent's task numbers in PR descriptions: Tasks 7, 32, 35, 48 (canonical schema, adapter contract, audit writer, Stages 1+2 reuse); Task 2 (same file as parent's Task 2); Task 2a (canonical-finding enum extension); Task 59 (extends parent's Task 39); Task 60a (extends parent's orchestrator Stage 1+2 to retain `raised_by[]`); Task 61 (extends parent's Task 40); Task 63 (defers to parent's init prompt).

---

End of draft. Returned to orchestrator for Plan Linter and Peer Review steps.

**Files referenced (absolute paths):**
- PRD: `/Users/ajbrown/Projects/bluminal/claude-plugins/docs/reqs/multi-model-teams.md`
- Parent PRD: `/Users/ajbrown/Projects/bluminal/claude-plugins/docs/reqs/multi-model-review.md`
- Parent plan: `/Users/ajbrown/Projects/bluminal/claude-plugins/docs/plans/multi-model-review.md`
- Plan output target (do NOT write yet): `/Users/ajbrown/Projects/bluminal/claude-plugins/docs/plans/multi-model-teams.md`
- Synthex+ manifest: `/Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex-plus/.claude-plugin/plugin.json`
- Synthex+ config defaults: `/Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex-plus/config/defaults.yaml`
- Review template: `/Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex-plus/templates/review.md`
- Template skeleton: `/Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex-plus/templates/_skeleton.md`
- team-review command: `/Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex-plus/commands/team-review.md`
- team-init command: `/Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex-plus/commands/team-init.md`
- Synthex base manifest: `/Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex/.claude-plugin/plugin.json`
- review-code command: `/Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex/commands/review-code.md`
- performance-audit command: `/Users/ajbrown/Projects/bluminal/claude-plugins/plugins/synthex/commands/performance-audit.md`

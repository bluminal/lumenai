# Implementation Plan: Multi-Model Review Orchestration

## Overview

Implements `docs/reqs/multi-model-review.md` — the multi-model review orchestrator that fans review prompts out to multiple LLM-family proposers via CLI adapters, then consolidates findings into one deduplicated, severity-reconciled, attributed list. Ships off by default and CLI-only (no API keys in Synthex). v1 covers `review-code` (with complexity gating) and `write-implementation-plan` integrations across the v1 adapter set; remaining commands and advanced consolidation features defer to v2.

## Decisions

| # | Decision | Context | Rationale |
|---|----------|---------|-----------|
| D1 | Sequenced command integration: `review-code` (Phase 4), then `write-implementation-plan` (Phase 5) | I1 | Complete one full integration end-to-end before starting the second; complexity gate is the biggest unknown and only applies to `review-code` |
| D2 | v1 adapter set = Codex + Gemini + Ollama; fast-follow = llm + bedrock + claude | I2 | Cover hosted-OpenAI, hosted-Google, local-model personas; defer escape-hatch and specialty adapters |
| D3 | Orchestrator agent is Sonnet-backed (FR-MR11); all adapter agents are Haiku-backed (FR-MR7) | ADR-001 | Consolidation requires reasoning; adapters are mechanical wrappers |
| D4 | Adapter agents follow the existing utility-layer pattern | ADR-002 | Consistent with existing utility-agent conventions; not user-invokable |
| D5 | Context bundle assembly is the orchestrator's responsibility, executed once per invocation, identical for every reviewer (FR-MR28) | PRD architecture | Single source of truth prevents per-reviewer drift |
| D6 | Native + external proposers run in a single parallel Task batch (FR-MR12) | PRD design | Structural fallback (FR-MR17) requires natives' findings in hand when externals fail |
| D7 | **Superseded by D17.** | Cycle-1 review | — |
| D8 | **Superseded by D18.** | Cycle-1 review | — |
| D9 | Complexity gate ships in v1 with PRD-specified defaults; gate decision cached per review-loop invocation (cycle 0 only) | FR-MR21a, FR-MR21 step 8 | Per PRD spec; prevents oscillation |
| D10 | Audit artifact captures bundle manifest, per-reviewer results, aggregator trace, chosen-path metadata in v1; comparative "missed-issue" instrumentation deferred to v2 | I4, OQ-7 | Enough data to tune thresholds; comparative instrumentation contradicts the gate's cost-saving purpose |
| D11 | Layer 1 schema tests for every new agent. Layer 2 behavioral tests for: orchestrator (all consolidation stages), Codex adapter, Gemini and Ollama success paths, both command integrations, audit artifact, init flow. Layer 3 deferred to Phase 7. | I6, NFR-MR7 | Calibrated to risk: orchestrator consolidation and external-output parsing are highest-risk |
| D12 | Strict mode and `include_native_reviewers` defaults match PRD exactly; per-command override patterns documented in `init` and `defaults.yaml` comments only | I8, FR-MR18 | PRD-specified |
| D13 | All new adapter `.md` files live in `plugins/synthex/agents/`; orchestrator agent lives there too | CLAUDE.md conventions | Consistent with existing utility agents |
| D14 | New agents registered in `plugin.json`; release bumps `marketplace.json` and `plugin.json` versions per CLAUDE.md release process | CLAUDE.md release rules | Required for plugin upgrade detection |
| D15 | Documentation lives at `docs/specs/multi-model-review/` (a directory) — `architecture.md`, `adapter-recipes.md`, `failure-modes.md`, `adapter-contract.md` | NFR-MR9 | Splitting an 880-line PRD's design doc by concern keeps each file scannable |
| D16 | Standalone-plugin packaging is out of scope for v1 | I7 | Reduces v1 risk; revisit based on demand |
| D17 | **Aggregator `auto` resolution follows FR-MR15 tier table.** v1 strict total order (highest → lowest): **Claude Opus > GPT-5 > Claude Sonnet > Gemini 2.5 Pro > DeepSeek V3 > Qwen 32B**. Deterministic given any reviewer list (no ties). When the strongest configured proposer is also a reviewer, the aggregator invocation is a separate freshly-spawned CLI call with the judge-mode system prompt (FR-MR15). When no flagship matches, fall back to the host Claude session (FR-MR17 / OQ-6 (b)). Tier ordering tracks the PRD's example verbatim — any deviation requires a superseding D-row. | Cycle-1 architect: D7 contradicted FR-MR15; cycle-2 H1: prior tie ("Sonnet ≈ GPT-5") broke determinism. | PRD is source of truth. Strict total order makes `auto` deterministic and testable. |
| D18 | **Stage 4 LLM tiebreaker bounded by a textual pre-filter and a per-CONSOLIDATION cap.** Pre-filter: candidate pairs must share ≥30% normalized-title Jaccard before reaching the LLM judge. Hard cap: ≤ K Stage-4 LLM calls per consolidation (summed across all `(file, symbol)` buckets), K = `multi_model_review.consolidation.stage4.max_calls_per_consolidation` (default 25). When the cap fires mid-consolidation, remaining buckets' candidates are left unmerged and a single audit warning records the total skipped pair count. | Cycle-1 architect: D8 redefinition was unbounded N²; cycle-2 H3: prior wording confused per-consolidation vs per-bucket (10× cost difference). | Per-consolidation cap matches the config key and provides a hard global ceiling regardless of bucket distribution. Stays within v1 scope (no embeddings); Phase 7 Stage 3 replaces the pre-filter with embedding similarity. |
| D19 | **Q4 promoted to decision.** Audit-artifact validation uses Layer 1 schema validator per Task 40 (no separate snapshot comparison). | Cycle-1 architect | Task 40 already commits to Layer 1; listing as Open Question created false ambiguity. |
| D20 | **Audit writer is command-agnostic from day one and lives in shared infrastructure (Milestone 4.0).** Parameterized by command name and reused by Phase 4 and Phase 5 without modification. | Cycle-1 tech-lead: Task 39 risked review-code-specific implementation needing Phase 5 retrofit | Removes retrofit risk; keeps audit format identical across commands. |
| D21 | **Path-and-reason header has a machine-readable format with three invariants.** (1) Begins `Review path:`. (2) Parenthetical reason clause follows. (3) `reviewers:` suffix states `N native` and, when externals were attempted, `+ M external` (or `, M external <qualifier>` for the failed-externals variant). Literal regex: `Review path: [^()]+\([^)]+; reviewers: \d+ native(?:\s*[+,]\s*\d+ external(?:\s+\w+)?)?\)`. | Cycle-1 designer: examples weren't binding; cycle-2 H2: prior invariant #3 mandated `N native + M external` and contradicted PRD examples 4, 5, 6. | Without a binding format, Task 37 had no spec to validate against. Loosened invariant #3 admits all six PRD examples while preserving determinism. |
| D22 | **Init pre-validates auth before showing the "Enable with detected CLIs" option label.** Lightweight auth checks run during the detection scan; the option label only includes CLIs that pass both `which` AND auth. CLIs detected but unauthenticated are surfaced separately with remediation hints. | Cycle-1 designer: post-confirm auth errors are poor UX | Avoids the post-confirm error path entirely. Maintains <2s preflight target by short-circuiting auth checks (single command, fail-fast). |

## Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| Q1 | (OQ-2 follow-up) If `llm embed` is unavailable, should v1's Stage 3 milestone require `llm embed` or fall back to host-session embedding? | Affects whether the embedding milestone has an install precondition. Recommend: decide before starting the embedding milestone. | Open |
| Q2 | Does the v1 Ollama adapter recommend a specific default model, or only document FR-MR1 "flagship-class" guidance? | Affects adapter-recipe documentation. Recommend: document "flagship-class options known good as of <date>" with caveat. | Open |
| Q3 | When the host Claude session is the aggregator, does "judge-mode system prompt" require a separate sub-agent invocation or inline application? | Inline is simpler, separate is more bias-resistant. Recommend: inline for v1 with note in `failure-modes.md`. **Note:** when D17 picks an external proposer, judge-mode is packaged into that adapter call (no inline path). | Open |
| Q4 | ~~Audit-artifact validation approach.~~ **Resolved → D19.** | — | Resolved |
| Q5 | Do adapter `.md` files declare their family inline (matching `family:` config) or only describe the family they default to? | Affects FR-MR4 family-diversity preflight. Recommend: inline declaration as default, user `family:` override as escape hatch. | Open |
| Q6 | (OQ-6) Aggregator failure handling — pick (b) host-session fallback per PRD? **Note:** D17 commits to (b) when the tier table yields no match; this question now narrowly addresses runtime failure of a tier-selected aggregator CLI. | Affects orchestrator failure-path implementation. Recommend: (b). | Open |

## Phase 1 — Foundation: Schema, Context, Configuration

Establishes the substrate every adapter and integration depends on. No user-visible value yet; all milestones unblock downstream work.

### Milestone 1.1: Canonical Schema, Configuration Schema, and Baseline Snapshots
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 0 | Capture golden-snapshot fixtures for pre-feature behavior of `review-code` and `write-implementation-plan` (no `multi_model_review` config). Store under `tests/__snapshots__/multi-model-review/baseline/`. **Snapshots capture only the deterministic envelope** — path-and-reason header (when present), per-reviewer table structure, decision-flow log lines, exit status, file-write paths and counts. **LLM-generated finding text is excluded via a redaction step that replaces finding bodies with `<<finding-body>>` placeholders before snapshot.** Used as the regression baseline for FR-MR23 byte-identical assertions in Tasks 38(a) and 45(b). | S | None | done |
| 1 | Author canonical finding schema as a JSON Schema document at `plugins/synthex/agents/_shared/canonical-finding-schema.md` (markdown wrapper around JSON Schema). Covers all FR-MR13 fields and constrains `finding_id` to forbid line numbers. | S | None | done |
| 2 | Extend `plugins/synthex/config/defaults.yaml` to add the entire `multi_model_review:` block per FR-MR5, plus `audit:` subsection from FR-MR24, plus the new `consolidation.stage4.max_calls_per_consolidation` key from D18. Include inline comments mirroring PRD commentary (especially `strict_mode`, `include_native_reviewers`, per-command patterns). Document each `always_escalate_paths` default (auth, payments, billing, migrations, security, secrets, crypto) with one-sentence justification. | S | None | done |
| 3 | Author `docs/specs/multi-model-review/architecture.md` (initial skeleton): proposer-plus-aggregator architecture, native-vs-external distinction, parallel fan-out shape, context bundle role, pointers to forthcoming adapter-recipes and failure-modes docs. | M | Task 1 | done |
| 4 | Author the canonical adapter input/output envelope contract at `docs/specs/multi-model-review/adapter-contract.md` (FR-MR9). Includes envelope JSON Schema for the `Output` shape (status enum, error_code enum, findings array, usage object, raw_output_path). | S | Task 1 | done |

**Task 0 Acceptance Criteria:**
- `[T]` Snapshot files exist for both commands with empty/unset `multi_model_review` config
- `[T]` Snapshots load via existing `tests/helpers/snapshot-manager.ts`
- `[T]` Redaction step replaces all finding bodies with `<<finding-body>>` placeholder; verified by raw-string scan confirming no real finding text leaks
- `[T]` Redaction strategy referenced from Tasks 38(a) and 45(b) byte-comparison criteria

**Task 0 Completion Note:** Done. Baseline snapshots at `tests/__snapshots__/multi-model-review/baseline/` for `review-code` and `write-implementation-plan` + `redaction-strategy.md`. 8 tests in `baseline-snapshots.test.ts`. All 4 `[T]` criteria pass with linked tests. Commit `a1e0ee6`.

**Task 1 Acceptance Criteria:**
- `[T]` Schema file exists; validates a sample canonical finding
- `[T]` A finding with a line number in `finding_id` fails validation

**Task 1 Completion Note:** Done. Canonical finding schema at `plugins/synthex/agents/_shared/canonical-finding-schema.md` (FR-MR13, D17, D18 references). Validator at `tests/schemas/canonical-finding.ts`. 27 tests in `canonical-finding.test.ts`. Both `[T]` criteria pass: schema validates a sample finding; finding with line number in `finding_id` (`:42`, `L42`, `line_42` patterns) fails. Commit `0a9188d`.

**Task 2 Acceptance Criteria:**
- `[T]` `defaults.yaml` parses as valid YAML
- `[T]` Existing config consumers pass their tests without changes
- `[T]` File contains at least one inline comment per new top-level key in `multi_model_review:` (raw-string verified)
- `[T]` `consolidation.stage4.max_calls_per_consolidation` key present with default 25 (D18)
- `[H]` Each `always_escalate_paths` default has a one-sentence rationale comment

**Task 2 Completion Note:** Done. `multi_model_review:` block added to `plugins/synthex/config/defaults.yaml` per FR-MR5/FR-MR24/D18. 22 tests in `defaults-yaml-mmr.test.ts`, all passing. All `[T]` criteria pass; `[H]` criterion (always_escalate_paths inline rationale comments for auth/payments/billing/migrations/security/secrets/crypto) verified via test suite and approved during execution. Commit `bdc8e6c`.

**Task 3 Acceptance Criteria:**
- `[H]` Each of 6 architecture concerns has at least one paragraph or diagram; doc is sufficient for an engineer to understand fan-out and consolidation without reading the PRD
- `[T]` Doc contains `## Status: Skeleton` header that Task 49 replaces with `## Status: Final`
- `[T]` Cross-references to FR-MR numbers are accurate

**Task 3 Completion Note:** Done. `docs/specs/multi-model-review/architecture.md` skeleton created with 6 architecture concerns (Proposer-plus-Aggregator, Native vs. External, Parallel Fan-Out with ASCII diagram, Context Bundle, Audit Artifact, Forthcoming Docs). 28 tests in `architecture-md.test.ts`. Both `[T]` criteria pass; `[H]` criterion (6 concerns each have ≥1 paragraph or diagram, sufficient for engineer to understand without PRD) approved during execution. Commit `cb27d55`.

**Task 4 Acceptance Criteria:**
- `[T]` Adapter contract Schema validates the example envelope from FR-MR9
- `[T]` Rejects an envelope missing `status` or with unknown `error_code`

**Task 4 Completion Note:** Done. `docs/specs/multi-model-review/adapter-contract.md` with input/output envelope, all 7 FR-MR16 error_code enum values + retry semantics, 4 worked examples, validation surface. Validator at `tests/schemas/adapter-contract.ts`. 16 tests in `adapter-contract.test.ts`. Both `[T]` criteria pass: validates all 4 example envelopes; rejects missing status, unknown error_code, success+non-null error_code, failed without error_code. Commit `f483b08`.

**Parallelizable:** Tasks 0, 1, 2, 3 can run concurrently (Task 0 is independent). Task 4 depends on Task 1.
**Milestone Value:** Configuration surface and finding-shape contracts exist; baseline snapshots in place for FR-MR23 regression. Adapter and orchestrator authors can build against stable interfaces.

### Milestone 1.2: Context Bundle Assembly Subroutine
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 5 | Author `plugins/synthex/agents/context-bundle-assembler.md` — Haiku-backed utility agent that assembles the FR-MR28 context bundle from a request shape (artifact path, touched files, project config). Implements assembly order (artifact → conventions → touched files → specs → overview), per-file size cap with Haiku summarization, total bundle cap with iterative summarization, the spec-matching heuristic per OQ-8 (filename-substring match for v1, with `context.spec_map` override hook), and the "narrow scope" error path when the artifact alone exceeds `max_bundle_bytes`. | L | Task 1, Task 2 | done |
| 6 | Add `context-bundle-assembler` to `plugins/synthex/.claude-plugin/plugin.json` agents array. | S | Task 5 | done |
| 7 | Author Layer 1 schema validator at `tests/schemas/context-bundle.ts` validating bundle manifest shape (artifact present, file list, summarized-vs-verbatim flags, total bytes ≤ cap). Add Vitest suite with inline samples. | M | Task 5 | done |
| 8 | Add Layer 2 behavioral fixtures at `tests/fixtures/multi-model-review/context-bundle/`: (a) `oversized-bundle/` with > 500 KB of touched-file content; asserts bundle stays ≤ `max_bundle_bytes` and largest files are summarized. (b) `artifact-as-largest-file/` where artifact itself exceeds `max_file_bytes`; asserts agent emits "narrow scope" error rather than summarizing the artifact. (c) `oversized-artifact/` where artifact alone exceeds `max_bundle_bytes`; asserts same error path. | M | Task 5, Task 7 | done |

**Task 5 Acceptance Criteria:**
- `[T]` Agent definition specifies inputs/outputs in canonical envelope shape
- `[H]` Documents assembly order, size-cap algorithm, spec-matching heuristic, artifact-too-large error path
- `[T]` Markdown rule explicitly forbids summarizing the artifact (raw-string check on .md content)

**Task 5 Completion Note:** Done. `plugins/synthex/agents/context-bundle-assembler.md` Haiku-backed utility agent (FR-MR28, D5, OQ-8). 19 structural tests in `context-bundle-assembler-md.test.ts`. Both `[T]` criteria pass; `[H]` (assembly order, size-cap, spec-matching, narrow-scope error documented) approved during execution. Commit `4e8101e`.

**Task 6 Acceptance Criteria:**
- `[T]` `plugin.json` parses; new agent appears in agents array

**Task 6 Completion Note:** Done. `context-bundle-assembler` registered in `plugins/synthex/.claude-plugin/plugin.json` agents array. 5 tests in `synthex-plugin-json.test.ts`. `[T]` criterion passes (plugin.json parses, agent registered, file exists). Commit `a1ab7ee`.

**Task 7 Acceptance Criteria:**
- `[T]` Validator catches manifests missing artifact, missing file list, or exceeding total cap
- `[T]` Test suite passes

**Task 7 Completion Note:** Done. Validator at `tests/schemas/context-bundle.ts` (status enum, manifest shape, file entry validation, optional cap enforcement). 24 tests in `context-bundle.test.ts`. Both `[T]` criteria pass: catches missing artifact/files/cap-exceeded; full suite green. Commit `2bbbcb5`.

**Task 8 Acceptance Criteria:**
- `[T]` Fixture (a): bundle stays ≤ `max_bundle_bytes`; manifest correctly identifies summarized-vs-verbatim files
- `[H]` Fixture (b): artifact-as-largest-file produces "narrow scope" error (not silent summary)
- `[H]` Fixture (c): oversized-artifact produces "narrow scope" error

**Task 8 Completion Note:** Done. 3 scenario fixtures under `tests/fixtures/multi-model-review/context-bundle/`: oversized-bundle (iterative summarization, artifact verbatim), artifact-as-largest-file (narrow_scope_required when artifact > max_file_bytes), oversized-artifact (narrow_scope_required when artifact > max_bundle_bytes). 48 tests in `context-bundle-fixtures.test.ts`. `[T]` (fixture a) passes; both `[H]` criteria (fixtures b and c — narrow scope error not silent summary) approved during execution. Commit `8133416`.

**Parallelizable:** Tasks 5 and 6 are sequential. Task 7 starts after Task 5. Task 8 depends on 5 and 7.
**Milestone Value:** Every adapter and the orchestrator can call a single, tested context-bundle subroutine. Eliminates per-reviewer bundle drift (D5).

## Phase 2 — Adapter Layer (v1 Set)

The three v1 adapters per D2 (Codex, Gemini, Ollama). All three are independent and depend only on Phase 1 outputs, so they parallelize on `.md` authoring. **Scheduling note:** Tasks 10, 14, 17 each modify `plugin.json` — they must land in a single PR or serialize to avoid three-way merge conflicts.

### Milestone 2.1: Codex Adapter (Reference Implementation)
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 9 | Author `plugins/synthex/agents/codex-review-prompter.md` per FR-MR8 + FR-MR10. Documents: CLI invocation (`codex exec --json --sandbox read-only --approval-mode never`), capability tier (`agentic`), default family (`openai`), CLI presence check via `which codex`, output parsing for `codex exec --json` envelope, retry-once on parse failure with appended clarification, normalization to canonical envelope, install one-liner, auth setup pointer (`codex login`), known gotchas. **Schedule first in parallel batch** ([H] criteria). | L | Phase 1 | done |
| 10 | Add `codex-review-prompter` to `plugin.json` agents array. **Coordinate with Tasks 14, 17.** | S | Task 9 | done |
| 11 | Author Layer 1 schema validator at `tests/schemas/adapter-envelope.ts` (shared across all adapters) validating the Output envelope shape. Vitest suite. **Soft-dep on Task 9:** can be drafted against Task 4's envelope schema; inline sample assertions finalized once Task 9's recorded envelope exists. | M | Task 4 (hard); Task 9 (soft) | done |
| 12 | Author Layer 2 behavioral fixture at `tests/fixtures/multi-model-review/adapters/codex/`: (a) recorded successful codex output, (b) recorded malformed output triggering retry, (c) recorded auth-failure output, (d) `cli_missing` simulation. Cached outputs verify each error_code surfaces correctly. | M | Tasks 9, 11 | done |

**Task 9 Acceptance Criteria:**
- `[T]` Agent definition includes every FR-MR8 responsibility numbered 1–8
- `[T]` Declares `capability_tier: agentic` and `family: openai`
- `[T]` Documents the exact sandbox flag set per FR-MR26
- `[H]` Install one-liner is a single shell command
- `[H]` Adapter output envelope conforms to `adapter-contract.md` (Task 4) — verified by author reading both side-by-side

**Task 9 Completion Notes:** Done. `plugins/synthex/agents/codex-review-prompter.md` Haiku adapter (FR-MR8/9/10/26). 30 tests in `codex-adapter-md.test.ts`. All 3 `[T]` criteria pass; both `[H]` criteria (single-shell install one-liner `npm install -g @openai/codex`; envelope conformance to adapter-contract.md) approved during execution. Commit `3b9fe77`.

**Task 10 Acceptance Criteria:**
- `[T]` `plugin.json` parses; agent registered

**Task 10 Completion Notes:** Done. `codex-review-prompter` registered in `plugins/synthex/.claude-plugin/plugin.json` agents array (bundled PR with 14, 17 per Phase 2 scheduling note). 14 tests in `synthex-plugin-json.test.ts`. Commit `dc66971`.

**Task 11 Acceptance Criteria:**
- `[T]` Validator rejects envelopes missing `status`, with unknown `error_code`, or with `finding_id` containing line numbers

**Task 11 Completion Notes:** Done. Shared `tests/schemas/adapter-envelope.ts` validator composing Task 4's envelope + Task 1's canonical-finding validators. Surfaces per-finding errors with `findings[INDEX]:` prefix. 26 tests in `adapter-envelope.test.ts`. `[T]` criterion passes (rejects missing status, unknown error_code, finding_id with line numbers in 3 forms). Commit `99f1a13`.

**Task 12 Acceptance Criteria:**
- `[T]` Fixture run produces canonical envelope
- `[T]` Malformed-output exercises retry-then-fail path with `error_code: parse_failed`
- `[T]` Missing-CLI fixture produces `error_code: cli_missing`
- `[T]` Auth-failure fixture produces `error_code: cli_auth_failed`
- `[T]` Documented sandbox-flag set in `codex-review-prompter.md` is a substring of the recorded invocation string (FR-MR26 parity)

**Task 12 Completion Notes:** Done. 4 Layer 2 fixtures under `tests/fixtures/multi-model-review/adapters/codex/` (successful, malformed-output-retry, auth-failure, cli-missing). Each contains fixture.json + expected_envelope.json + scenario.md; successful adds recorded-cli-invocation.txt for FR-MR26 parity. 42 tests in `codex-fixtures.test.ts`. All 5 `[T]` criteria pass (canonical envelope; parse_failed retry-then-fail; cli_missing; cli_auth_failed; sandbox-flag substring parity). Commit `876a1ca`.

**Parallelizable:** Task 11 can run in parallel with Task 9. Tasks 10 and 12 follow Task 9.
**Milestone Value:** First adapter end-to-end. Establishes the pattern for the remaining two.

### Milestone 2.2: Gemini Adapter
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 13 | Author `plugins/synthex/agents/gemini-review-prompter.md` per FR-MR8 + FR-MR10. Same structure as Codex; CLI is `gemini -p --output-format json`; `agentic` tier; family `google`; sandbox flags per FR-MR26 (read-only equivalent); install one-liner; `gcloud auth list` for auth check. **Schedule first in parallel batch** ([H] criteria). | M | Milestone 2.1 (pattern reference) | done |
| 14 | Add `gemini-review-prompter` to `plugin.json`. **Coordinate with Tasks 10, 17.** | S | Task 13 | done |
| 15 | Layer 1 schema validation reuses `adapter-envelope.ts` from Task 11 — add Vitest test asserting Gemini's recorded sample envelope passes. | S | Tasks 11, 13 | done |
| 15a | Layer 2 success-path fixture at `tests/fixtures/multi-model-review/adapters/gemini/successful/`: recorded successful gemini output. Surfaces Gemini-specific output-parsing quirks. | S | Tasks 13, 15 | done |

**Task 13 Acceptance Criteria:**
- `[T]` Same FR-MR8 checklist as Codex
- `[T]` Declares `family: google`, `capability_tier: agentic`
- `[H]` Documents Gemini-specific output-parsing quirks
- `[H]` Adapter envelope conforms to `adapter-contract.md`

**Task 13 Completion Notes:** Done. `plugins/synthex/agents/gemini-review-prompter.md` Haiku adapter. CLI: `gemini -p --output-format json --readonly`. 40 tests in `gemini-adapter-md.test.ts`. All `[T]` criteria pass; both `[H]` criteria (gemini-specific quirks: markdown-fence-wrapped JSON, NDJSON streaming chunks, findings:null↔[], trailing commas; envelope conformance) approved during execution. Commit `0386353`.

**Task 14 Acceptance Criteria:**
- `[T]` `plugin.json` parses; agent registered

**Task 14 Completion Notes:** Done. `gemini-review-prompter` registered (bundled with 10, 17). Tests as Task 10. Commit `dc66971`.

**Task 15 Acceptance Criteria:**
- `[T]` Recorded Gemini sample envelope passes validator

**Task 15 Completion Notes:** Done. `tests/schemas/gemini-envelope.test.ts` — synthetic Gemini envelope (2 findings; family=google; source_type=external; usage with input/output tokens). 8 tests, all passing. `[T]` criterion passes (envelope passes shared validator). Commit `62f4c65`.

**Task 15a Acceptance Criteria:**
- `[T]` Successful Gemini fixture produces canonical envelope
- `[T]` Documented sandbox-flag set is a substring of the recorded invocation string

**Task 15a Completion Notes:** Done. Layer 2 fixture at `tests/fixtures/multi-model-review/adapters/gemini/successful/` exercises markdown-fence quirk (gotcha #1) — raw_cli_response_with_quirks contains ```json fences; expected_envelope strips them. 16 tests in `gemini-fixtures.test.ts`. Both `[T]` criteria pass (canonical envelope; sandbox flag `--readonly` substring parity). Commit `f27283e`.

**Parallelizable:** All Milestone 2.2 tasks parallelize with Milestone 2.3 tasks (modulo `plugin.json` coordination).
**Milestone Value:** Second adapter (different family) operational with success-path coverage.

### Milestone 2.3: Ollama Adapter
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 16 | Author `plugins/synthex/agents/ollama-review-prompter.md` per FR-MR8 + FR-MR10. CLI is `ollama run` + HTTP API with `format: <schema>`; capability tier `text-only` (bundle is the only context); family `local-<model>` (dynamic family pattern based on configured model); install one-liner; no auth check (local). Document the v1 recommended-default-model question (Q2) inline as a TBD with placeholder. **Schedule first in parallel batch** ([H] criteria). | M | Milestone 2.1 (pattern reference) | done |
| 17 | Add `ollama-review-prompter` to `plugin.json`. **Coordinate with Tasks 10, 14.** | S | Task 16 | done |
| 18 | Layer 1: Vitest test asserting Ollama recorded sample envelope passes the shared validator. Specific assertion that `text-only` adapters produce envelopes without agentic-tier-only metadata. | S | Tasks 11, 16 | done |
| 18a | Layer 2 success-path fixture at `tests/fixtures/multi-model-review/adapters/ollama/successful/`: recorded successful ollama output (text-only tier — bundle-only context). | S | Tasks 16, 18 | done |

**Task 16 Acceptance Criteria:**
- `[T]` FR-MR8 checklist
- `[T]` Declares `family: local-<model>` (placeholder pattern; resolved at orchestrator-time from user config)
- `[T]` Declares `capability_tier: text-only`
- `[H]` Install one-liner is `curl -fsSL https://ollama.com/install.sh | sh` (or current canonical)
- `[H]` Adapter envelope conforms to `adapter-contract.md`

**Task 16 Completion Notes:** Done. `plugins/synthex/agents/ollama-review-prompter.md` Haiku adapter. text-only tier; family `local-<model>` dynamic placeholder; HTTP API at localhost:11434/api/generate with `format: <schema>`; no auth (local); sandbox N/A documented. Q2 TBD with flagship-class options. 36 tests in `ollama-adapter-md.test.ts`. All `[T]` criteria pass; both `[H]` criteria (canonical install one-liner `curl -fsSL https://ollama.com/install.sh | sh`; envelope conformance) approved during execution. Commit `86d5591`.

**Task 17 Acceptance Criteria:**
- `[T]` `plugin.json` parses; agent registered

**Task 17 Completion Notes:** Done. `ollama-review-prompter` registered (bundled with 10, 14). Tests as Task 10. Commit `dc66971`.

**Task 18 Acceptance Criteria:**
- `[T]` Validator passes Ollama envelope
- `[T]` Text-only-specific assertions pass

**Task 18 Completion Notes:** Done. `tests/schemas/ollama-envelope.test.ts` — synthetic Ollama envelope with text-only-tier specifics (family follows `local-<model>` pattern; usage from prompt_eval_count/eval_count; no agentic-tier metadata). 13 tests, all passing. Both `[T]` criteria pass (validator passes; text-only-specific assertions pass). Commit `9c4e3c9`.

**Task 18a Acceptance Criteria:**
- `[T]` Successful Ollama fixture produces canonical envelope
- `[T]` Documented invocation string in `ollama-review-prompter.md` matches the recorded invocation (FR-MR26 parity; sandbox flags N/A for local)

**Task 18a Completion Notes:** Done. Layer 2 fixture at `tests/fixtures/multi-model-review/adapters/ollama/successful/` (text-only tier; HTTP API; usage mapping prompt_eval_count→input_tokens, eval_count→output_tokens; `source.family: local-qwen2.5-coder` dynamic). 17 tests in `ollama-fixtures.test.ts`. Both `[T]` criteria pass (canonical envelope; FR-MR26 HTTP API endpoint substring parity in lieu of sandbox flags which are N/A). Commit `277dd76`.

**Parallelizable:** All three adapter milestones (2.1, 2.2, 2.3) run concurrently after Phase 1 — assign one engineer per adapter; cross-adapter coordination only for shared validator (Task 11) and `plugin.json` write contention (Tasks 10, 14, 17 serialize or single PR).
**Milestone Value:** v1 adapter set complete. Three external families covered (OpenAI, Google, local) plus Anthropic via natives = four total. Sufficient for FR-MR4 family diversity.

## Phase 3 — Orchestrator and Consolidation Pipeline

The orchestrator agent and the consolidation pipeline stages that ship in v1 (Stages 1, 2, 4, 5, 6 per D18 — Stage 4 now bounded). Stage 3 (embedding-based) is a follow-up in Phase 7.

### Milestone 3.1: Orchestrator Agent — Fan-Out and Bundle Delivery
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 19 | Author `plugins/synthex/agents/multi-model-review-orchestrator.md` (Sonnet-backed per FR-MR11). Initial scope: accept caller input (artifact, native-reviewer list, command name, config override flags), call `context-bundle-assembler`, fan out to native sub-agents AND configured external adapters in a single parallel Task batch (FR-MR12), enforce per-reviewer timeouts, collect results into the unified envelope, return to caller. **Specifies (1) exact JSON shape per adapter Task call (FR-MR9 verbatim), (2) native sub-agent context shape (today's context plus `output_schema` requirement so natives emit canonical findings), (3) collection mechanism (await all batch resolutions, concatenate findings into unified envelope).** Includes the FR-MR15 tier-table resolver per D17 and the cloud-surface remediation path per NFR-MR2. **No consolidation yet** — that's Milestone 3.2. | L | Phase 2 (any one adapter), Milestone 1.2, Task 1, Task 4 | done |
| 20 | Add `multi-model-review-orchestrator` to `plugin.json`. | S | Task 19 | done |
| 21 | Author preflight subroutine inline in the orchestrator (FR-MR20): `which` per adapter, lightweight auth check where supported, `min_family_diversity` count (counting natives as `anthropic`), `min_proposers_to_proceed` ≤ enabled count, aggregator resolution check (D17 tier-table walk). Failures block; warnings continue. Self-preference warning fires as a separate condition from family-diversity warning. **All `which` and auth checks dispatch concurrently in a single parallel Bash batch; preflight wall-clock is bounded by the slowest single check + collation overhead.** | M | Task 19 | done |
| 22 | Author Layer 1 validator at `tests/schemas/orchestrator-output.ts` validating the orchestrator's unified output: per-reviewer status table (native + external clearly separated), aggregated findings list, path-and-reason header. Vitest suite. | M | Task 19 | done |
| 23 | Author Layer 2 behavioral fixture for parallel fan-out at `tests/fixtures/multi-model-review/orchestrator/parallel-fanout/`: 2 native + 2 external proposers (recorded). Two assertions: (1) **structural** — orchestrator's `.md` explicitly instructs single-batch parallel fan-out with no inter-reviewer dependency, verified by raw-string match on FR-MR12 phrasing; (2) **output** — total outputs include all 4 reviewers' findings. Wall-clock fan-out verification deferred to Milestone 7.3 (Task 61a) where uncached live invocations exercise real parallelism — cached promptfoo replays at near-zero latency, so wall-clock measured here would reflect playback rather than orchestrator parallelism. | M | Tasks 19, 22 | done |
| 23a | Author Layer 2 behavioral fixture at `tests/fixtures/multi-model-review/orchestrator/all-externals-fail/`: 2 native + 2 external proposers, both externals return `error_code: cli_missing` or `cli_failed`. Asserts FR-MR17 native-only continuation: no abort, warning emitted, audit-artifact continuation event recorded. | M | Tasks 19, 22 | done |
| 23b | Author Layer 2 behavioral fixture at `tests/fixtures/multi-model-review/orchestrator/all-natives-fail/`: 2 native + 2 external, both natives return error envelopes (timeout or sub-agent failure) and `include_native_reviewers: true`. Asserts a critical-warning string distinct from the standard external-failure warning is emitted; audit continuation-event entry distinguishes native-failure from external-failure. **Warning copy:** `"All native Synthex reviewers failed. Cannot continue — multi-model review has no findings to consolidate. Check sub-agent error logs."` | M | Tasks 19, 22 | done |
| 23c | Author Layer 2 behavioral fixture at `tests/fixtures/multi-model-review/orchestrator/cloud-surface/`: simulated environment where `which` for all configured CLIs fails (cloud/web surface, no host bash). Asserts orchestrator emits a single clear remediation error pointing at setup-script docs, not a per-CLI `cli_missing` cascade. | S | Tasks 19, 22 | done |

**Task 19 Acceptance Criteria:**
- `[T]` Agent declares Sonnet model
- `[T]` Documents fan-out pattern with explicit single-batch requirement and FR-MR12 phrasing verbatim
- `[T]` Specifies the three sub-section requirements (adapter Task-call JSON shape, native context shape with `output_schema`, collection mechanism)
- `[T]` Respects `include_native_reviewers: false` (skips natives)
- `[T]` Surfaces native and external failures identically in the per-reviewer status table; emits a distinct critical warning when ALL natives fail (verified by Task 23b)
- `[T]` Cloud-surface remediation message documented (verified by Task 23c)

**Task 19 Completion Note:** Done. `plugins/synthex/agents/multi-model-review-orchestrator.md` Sonnet-backed orchestrator (initial scope: fan-out + bundle delivery). Step 3 contains FR-MR12 verbatim 'single parallel Task batch'. All 6 failure surfaces documented (single-batch fan-out; D17 tier table; FR-MR17 all-externals/all-natives/cloud-surface continuation events with verbatim warning text). 28 tests in `orchestrator-md.test.ts`. All 6 `[T]` criteria pass. Commit `863cd85`.

**Task 20 Acceptance Criteria:**
- `[T]` `plugin.json` parses; agent registered

**Task 20 Completion Note:** Done. `multi-model-review-orchestrator` registered in synthex `plugin.json` agents array (5 entries total). 20 tests in `synthex-plugin-json.test.ts`. `[T]` criterion passes. Commit `98fd3ca`.

**Task 21 Acceptance Criteria:**
- `[T]` Preflight runs in < 2 sec on a 3-adapter config (PRD acceptance)
- `[T]` All `which` and auth checks dispatch concurrently in a single parallel Bash batch (raw-string match on orchestrator markdown; latency upper-bounded by slowest single check)
- `[T]` Emits family-diversity warning when `unique_families < min_family_diversity`
- `[T]` Emits a separate self-preference warning when aggregator family equals the family of the only non-anthropic proposer (even if `min_family_diversity ≥ 2` is satisfied)
- `[T]` Resolves `aggregator.command: auto` deterministically against a fixed reviewer list, walking the D17 tier table
- `[T]` Preflight summary string matches FR-MR20 pattern `N reviewers configured, M available, K families, aggregator: <name>` (regex-asserted)

**Task 21 Completion Note:** Done. Step 0 — Preflight (FR-MR20) inserted before Step 1 in `multi-model-review-orchestrator.md`. Concurrent which/auth Bash batch (verbatim); < 2s on 3-adapter config; family-diversity warning; self-preference warning (independent firing); min_proposers_to_proceed block; D17 tier-table walk; FR-MR20 summary regex `N reviewers configured, M available, K families, aggregator:`. 18 tests in `orchestrator-preflight.test.ts` + 28 regression tests in `orchestrator-md.test.ts` still passing. All 6 `[T]` criteria pass. Commit `5b273f4`.

**Task 22 Acceptance Criteria:**
- `[T]` Validator catches outputs missing path-and-reason header (D21 regex), missing per-reviewer table, or with attribution omitted

**Task 22 Completion Note:** Done. `tests/schemas/orchestrator-output.ts` validator (composing canonical-finding from Task 1; D21 PATH_AND_REASON_HEADER_REGEX exported for Task 37). 31 tests in `orchestrator-output.test.ts`. `[T]` criterion passes (rejects missing path-and-reason header, missing per-reviewer table, attribution omission). Commit `e89f3b8`.

**Task 23 Acceptance Criteria:**
- `[T]` Orchestrator's `.md` contains FR-MR12 phrasing verbatim (raw-string match on single-batch parallel fan-out instruction)
- `[T]` Total outputs include all 4 reviewers' findings
- `[T]` Wall-clock verification deferred to Milestone 7.3 (Task 61a) — explicit forward-reference comment in fixture README

**Task 23 Completion Note:** Done. Layer 2 fixture at `tests/fixtures/multi-model-review/orchestrator/parallel-fanout/` (4 files: fixture.json, expected_envelope.json, scenario.md, README.md). 2 native + 2 external; 7 findings (2+1+2+2 split); D21 header; aggregator: tier-table to codex. Wall-clock verification deferred to Task 61a (forward-reference comment in README). 27 tests in `orchestrator-fanout-fixture.test.ts`. All 3 `[T]` criteria pass. Commit `71884b9`.

**Task 23a Acceptance Criteria:**
- `[T]` All-externals-fail fixture produces unified output containing only native findings
- `[T]` Visible warning text emitted (`"All external reviewers failed; continuing with natives only"`)
- `[T]` Audit continuation event recorded with per-external `error_code`

**Task 23a Completion Note:** Done. Layer 2 fixture at `tests/fixtures/multi-model-review/orchestrator/all-externals-fail/`. 2 natives success + 2 externals failed (cli_missing, cli_failed). All findings native-only; D21 header uses `'2 native, 0 external succeeded'` qualifier; host-fallback aggregator; continuation_event with per-external error codes. 14 tests in `orchestrator-externals-fail-fixture.test.ts`. All 3 `[T]` criteria pass (FR-MR17 native-only continuation; verbatim warning string; per-external error_code in audit details). Commit `95db8ce`.

**Task 23b Acceptance Criteria:**
- `[T]` All-natives-fail fixture produces critical-warning string distinct from all-externals-fail warning
- `[T]` Warning string matches expected copy (raw-string asserted)
- `[T]` Audit continuation event entry distinguishes native-failure from external-failure

**Task 23b Completion Note:** Done. Layer 2 fixture at `tests/fixtures/multi-model-review/orchestrator/all-natives-fail/`. 2 natives failed (timeout, sub_agent_failure) + 2 externals returned successfully (same Task batch). findings: [] (critical stop). continuation_event.type = all-natives-failed. CRITICAL warning text distinct from all-externals-failed warning (both verified verbatim). 29 tests in `orchestrator-natives-fail-fixture.test.ts`. All 3 `[T]` criteria pass. Commit `537d615`.

**Task 23c Acceptance Criteria:**
- `[T]` Cloud-surface fixture produces a single remediation error (not per-CLI cascade)
- `[T]` Error message references the setup-script docs path

**Task 23c Completion Note:** Done. Layer 2 fixture at `tests/fixtures/multi-model-review/orchestrator/cloud-surface/`. All 3 externals fail with cli_missing on cloud surface; per_reviewer_results has 3 cli_missing entries (audit purposes) but continuation_event.details is a SINGLE remediation string referencing `adapter-recipes.md` — NOT a per-CLI cascade. 33 tests in `orchestrator-cloud-surface-fixture.test.ts`. Both `[T]` criteria pass (single remediation; setup-script docs reference). Commit `b99eefb`.

**Parallelizable:** Task 22 can be drafted in parallel with Tasks 19 and 21. Tasks 20, 23, 23a, 23b, 23c are sequential after their predecessors; 23/23a/23b/23c can be authored in parallel as fixtures.
**Milestone Value:** Orchestrator can fan out to native + external proposers, return raw aggregated results, surface failure and cloud-surface paths cleanly. **Not yet useful end-to-end** — proves the structural foundation (D6, FR-MR12, FR-MR17, NFR-MR2).

### Milestone 3.2: Consolidation Pipeline — Stages 1, 2, 4
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 24 | Add Stage 1 fingerprint dedup to the orchestrator (FR-MR14). Group by exact `finding_id`; collapse groups into single consolidated finding with all contributors recorded. | M | Milestone 3.1 | done |
| 25 | Add Stage 2 lexical dedup within `(file, symbol)` buckets (FR-MR14). Jaccard similarity on normalized title tokens; merge above configurable threshold (default 0.8). | M | Task 24 | done |
| 26 | Add Stage 4 LLM-tiebreaker per D18 (bounded). Pre-filter and per-consolidation cap as defined in D18. **Position randomization** mitigates bias: tiebreaker prompt presents the two findings in alternating order across adjacent invocations; agent's markdown documents this as a behavioral rule alternating based on `(invocation_counter mod 2)`. | M | Task 25 | done |
| 27 | Add Layer 2 fixtures at `tests/fixtures/multi-model-review/consolidation/stage1-2-4/`: planted exact-id duplicates (Stage 1), planted near-duplicate titles (Stage 2), planted ambiguous pairs (Stage 4), **planted N=10 same-bucket scenario** plus a multi-bucket scenario with cumulative pairs > K (asserts total Stage-4 calls per consolidation ≤ K per D18, asserts the single audit warning records total skipped pair count across all buckets). Cached outputs assert correct merges and contributor lists. | M | Tasks 24–26 | done |

**Task 24 Acceptance Criteria:**
- `[T]` Two findings sharing `finding_id` collapse to one with both contributors listed
- `[T]` Finding fingerprint never includes line numbers (validated against Task 1 schema)

**Task 24 Completion Note:** Done. Stage 1 fingerprint dedup added as Step 8a in `multi-model-review-orchestrator.md`. Group by exact `finding_id`; collapse to one consolidated finding with `raised_by[]` populated; finding_id MUST NOT contain line numbers (Task 1 schema cross-reference). Both `[T]` criteria pass via tests in `orchestrator-consolidation.test.ts`. Bundled commit `6801d59`.

**Task 25 Acceptance Criteria:**
- `[T]` Jaccard threshold is configurable
- `[T]` Merge produces a consolidated finding preserving the highest-severity description

**Task 25 Completion Note:** Done. Stage 2 lexical dedup added as Step 8b. Jaccard on normalized title tokens within `(file, symbol)` buckets; threshold from `config.multi_model_review.consolidation.stage2_jaccard_threshold` (default 0.8); merge preserves highest-severity description. Both `[T]` criteria pass. Bundled commit `6801d59`.

**Task 26 Acceptance Criteria:**
- `[T]` Pre-filter (≥30% Jaccard) applied before any LLM call
- `[T]` Total Stage-4 LLM-call count across all buckets in a single consolidation never exceeds `stage4.max_calls_per_consolidation`. When the cap is reached mid-consolidation, remaining buckets' candidates are left unmerged and a single audit warning records the total skipped pair count.
- `[T]` Position-randomization rule documented in orchestrator markdown (raw-string match for "alternating order")
- `[H]` Position randomization operationally verified during semantic eval (Milestone 7.3, Task 61a): two adjacent live invocations of Stage 4 with the same ambiguous pair confirmed to present findings in reversed order. Not expected in Layer 2 cached fixtures (deterministic cache keys return identical replay).

**Task 26 Completion Note:** Done. Stage 4 LLM tiebreaker added as Step 8c (D18 BOUNDED). Pre-filter ≥30% Jaccard; per-consolidation cap from `max_calls_per_consolidation` (default 25); cap exhaustion → remaining pairs unmerged + single audit warning records total skipped count; position-randomization documented (`alternating order` per `invocation_counter mod 2`). 3 `[T]` criteria pass; `[H]` (operational position-randomization verification) deferred to Task 61a per its own description. Bundled commit `6801d59`.

**Task 27 Acceptance Criteria:**
- `[T]` All planted scenarios merge correctly
- `[T]` Non-duplicate findings remain distinct
- `[T]` Multi-bucket scenario: total Stage-4 calls per consolidation ≤ K; bounded behavior verified across buckets, not within a single bucket
- `[T]` When the per-consolidation cap fires, exactly one audit warning is emitted recording total skipped pair count

**Task 27 Completion Note:** Done. 5 scenario fixtures under `tests/fixtures/multi-model-review/consolidation/stage1-2-4/`: stage1-fingerprint-dedup, stage2-lexical-dedup, stage4-llm-tiebreaker, stage4-cap-single-bucket-N10, stage4-cap-multi-bucket-cumulative. Each fixture exercises documented Stage 1/2/4 behavior. Multi-bucket fixture proves D18 cap is PER-CONSOLIDATION (25 dispatched across 4 buckets, 15 skipped, single audit warning aggregates). 71 tests in `consolidation-fixtures.test.ts`. All 4 `[T]` criteria pass. Commit `a4eddc8`.

**Parallelizable:** Sequential — stages depend on each other in pipeline order. Task 27 fixture can be authored in parallel with Tasks 25–26.
**Milestone Value:** Orchestrator now produces a deduplicated findings list with bounded cost/latency. End-to-end usable for ensembles where embedding-based Stage 3 isn't critical.

### Milestone 3.3: Severity Reconciliation, Contradiction Detection, Minority-of-One
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 28 | Add Stage 5 severity reconciliation (FR-MR14a): unanimous → use; one-level diff → max + record range; two-or-more diff → CoT judge step with reasoning recorded. Per-reviewer severities preserved in output. | M | Milestone 3.1 (Task 22), Milestone 3.2 | pending |
| 29a | **Contradiction scanner.** Add the contradiction-detection scan (FR-MR14): scan dedup'd findings for mutually incompatible claims at the same location. **"Same location":** same `file` AND same `symbol`, OR (when symbol is null) same `file` AND finding ranges overlap or are within 5 lines. Output: list of candidate contradiction pairs flagged for adjudication. | M | Task 28 | pending |
| 29b | **CoVe adjudicator.** For each candidate pair from 29a, run Chain-of-Verification per [arXiv:2309.11495]: re-read artifact independently, answer the underlying question, mark loser as `superseded_by_verification`. Output schema change: findings carry `superseded_by_verification: true|false` and a `verification_reasoning` field. | M | Task 29a | pending |
| 30 | Add minority-of-one demotion (FR-MR14b): single-reviewer findings demoted one severity level UNLESS category is `security` OR reviewer flagged high confidence. Never dropped. | S | Task 28 | pending |
| 31 | Add aggregator bias-mitigation (FR-MR15): position-randomization across per-reviewer findings before aggregation; judge-mode system prompt embedded in orchestrator's reasoning prompt for inline-aggregator path; **when `aggregator.command` resolves to an external adapter (per D17), the judge-mode system prompt is packaged into the adapter invocation, not assumed inline**; self-preference warning cross-referenced from preflight. | M | Tasks 28–30 | pending |
| 32 | Layer 2 fixtures at `tests/fixtures/multi-model-review/consolidation/`: (a) one-level severity disagreement → max + range; (b) two-level → judge step with reasoning; (c) planted contradiction pair detected by 29a + CoVe (29b) selects winner; (c2) **separate fixture for 29a alone**: planted contradiction at "same file + same symbol" detected; planted near-contradiction at "same file, 7 lines apart" NOT detected (boundary check); (d) minority-of-one security → not demoted; (e) minority-of-one non-security → demoted; (f) **external aggregator** fixture: `aggregator.command: codex-review-prompter`, asserts judge-mode prompt is packaged into the codex Task call (raw-string match in recorded prompt). | L | Tasks 28–31 | pending |

**Task 28 Acceptance Criteria:**
- `[T]` Unanimous severity passes through
- `[T]` One-level disagreement uses max and records the range
- `[T]` Two-level disagreement triggers judge step with reasoning text in output

**Task 29a Acceptance Criteria:**
- `[T]` Same `file` + same `symbol` pair identified as contradiction candidate
- `[T]` Same `file`, no `symbol`, ranges within 5 lines → identified as candidate
- `[T]` Same `file`, no `symbol`, ranges 7+ lines apart → NOT identified (boundary)
- `[T]` Output is a list of candidate pairs; no severity changes yet

**Task 29b Acceptance Criteria:**
- `[T]` CoVe pass produces an independent verdict per candidate pair
- `[T]` Loser marked `superseded_by_verification: true` with `verification_reasoning` populated
- `[T]` Both findings remain visible in output

**Task 30 Acceptance Criteria:**
- `[T]` Single-reviewer non-security finding demoted by exactly one level
- `[T]` Security single-reviewer finding NOT demoted
- `[T]` High-confidence flag overrides demotion
- `[T]` Never dropped

**Task 31 Acceptance Criteria:**
- `[T]` Position-randomization seed varies across invocations (sample 10 runs, confirm order variation)
- `[T]` Judge-mode prompt phrase appears in inline aggregation prompt when host is aggregator
- `[T]` When `aggregator.command` resolves to an external adapter, judge-mode prompt is packaged into the adapter invocation (verified by Task 32(f))

**Task 32 Acceptance Criteria:**
- `[T]` All planted scenarios produce correct outputs
- `[T]` 29a boundary checks pass
- `[T]` External-aggregator fixture (f) shows judge-mode prompt embedded in adapter Task call

**Parallelizable:** Tasks 28 and 30 can run concurrently. Task 29a depends on Task 28; 29b depends on 29a. Task 31 follows the others. Task 32 fixture can be authored in parallel with Tasks 28–31.
**Milestone Value:** Consolidation pipeline is feature-complete for v1 (5 of 6 stages; Stage 3 in Phase 7). Orchestrator output now matches PRD's full canonical-finding-with-attribution shape.

## Phase 4 — review-code Integration

Wires the orchestrator into the existing `review-code` command. Milestone 4.0 ships the command-agnostic shared infrastructure; Milestone 4.1 wires `review-code`; Milestone 4.2 adds the cross-cutting credential-scope test.

### Milestone 4.0: Shared Audit Infrastructure (command-agnostic)

Per D20, the audit-artifact writer is built command-agnostic from day one and lives here. Phase 5 reuses without modification.

| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 39 | **Implement command-agnostic audit-artifact writer per FR-MR24.** Parameterized by command name. File naming: `<YYYY-MM-DD>-<command>-<short-hash>.md`. Output path from `multi_model_review.audit.output_path` (default `docs/reviews/`). All 7 sections populated per FR-MR24. **Per-reviewer audit rows surface the envelope's `usage` object verbatim in a structured sub-block** (NFR-MR4). Skip-write when `audit.enabled: false`. Reused by Phase 4 and Phase 5. Considered complete-and-verified only once Task 40's tests pass. | M | Milestone 3.3 | pending |
| 40 | Layer 1 schema validator at `tests/schemas/audit-artifact.ts` covering required sections (invocation metadata, config snapshot, preflight result, per-reviewer results split native/external, consolidated findings with attribution, aggregator trace, continuation event when applicable). Vitest tests with inline samples for both `review-code` and `write-implementation-plan` command values. | M | Task 39 | pending |

**Task 39 Acceptance Criteria:**
- `[T]` Audit writer parameterized by command name (Task 40 provides automated proof)
- `[T]` File naming works for both `review-code` and `write-implementation-plan` (verified by Task 40)
- `[T]` File written to configured path on every invocation when `audit.enabled: true`
- `[T]` File omitted when `false`
- `[T]` File contains all 7 FR-MR24 sections (verified by Task 40)
- `[T]` Per-reviewer audit rows surface envelope's `usage` object verbatim (NFR-MR4)
- `[H]` A sample audit file generated from a Layer 2 fixture is human-readable and suffices to reconstruct: which reviewers ran, which failed and why, what the path-and-reason decision was, top 3 consolidated findings — manual inspection during authoring (FR-MR24 self-contained criterion)

**Task 40 Acceptance Criteria:**
- `[T]` Validator catches files missing required sections
- `[T]` Catches missing native-vs-external separation
- `[T]` Tests cover both command values in filenames
- `[T]` Validator asserts each external-reviewer entry includes a `usage` block (`input_tokens`, `output_tokens`) when the source envelope provided one; entries without usage are explicitly marked `usage: not_reported` (NFR-MR4)

**Parallelizable:** Tasks 39 and 40 can be drafted in parallel.
**Milestone Value:** Audit writer exists once and is reusable across command integrations. Eliminates Phase 5 retrofit risk identified in cycle-1 review.

### Milestone 4.1: review-code Command Update
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 33a | **Decision-framework skeleton.** Update `plugins/synthex/commands/review-code.md` to add the FR-MR21 8-step decision-order skeleton with stubs for both branches (multi-model and native-only). Document path-and-reason header format spec per D21. **Verifiable independently** — does not yet wire the orchestrator. | M | Milestone 3.3 | pending |
| 33b | **Wire orchestrator into multi-model branch.** Replace the 33a multi-model stub with an actual `multi-model-review-orchestrator` invocation. Native-only branch continues to call today's review-code logic byte-identically. | M | Task 33a, Milestone 3.3 | pending |
| 34 | Implement complexity gate logic inline per FR-MR21a: read config, compute `lines_changed` and `files_touched` from diff, check `always_escalate_paths` globs, decide native-only vs multi-model. Cache the gate decision for the loop's duration to prevent oscillation (FR-MR21 step 8 / D9). | M | Task 33a | pending |
| 35 | Add `--multi-model` and `--no-multi-model` invocation flags per FR-MR6; flags override both master switch and per-command config. | S | Task 33a | pending |
| 36 | **Document path-and-reason header format spec per D21** in `review-code.md`: the three invariants and literal regex from D21. Two sub-formats:
  - With externals attempted: `reviewers: N native + M external` (PRD examples 1, 2, 3) OR `reviewers: N native, M external <qualifier>` (PRD example 6, e.g., "0 external succeeded").
  - Native-only: `reviewers: N native` (PRD examples 4, 5).
Six PRD example variants are example renderings of the spec, not the contract. | S | Task 33a | pending |
| 37 | Layer 1 schema validator update at `tests/schemas/code-reviewer.ts` (existing) to additionally validate the path-and-reason header against the D21 regex. Vitest test for each of the six PRD example renderings — including the two no-externals variants (`reviewers: 2 native`) and the failed-externals variant (`reviewers: 2 native, 0 external succeeded`). | M | Task 36 | pending |
| 38 | Layer 2 fixtures at `tests/fixtures/multi-model-review/review-code/`: (a) trivial diff (12 lines, 1 file) → native-only path, byte-identical to the **redacted baseline snapshot** from Task 0; (b) above-threshold diff (127 lines) → multi-model path; (c) below-threshold diff but auth path → multi-model path via escalate-glob; (d) `--multi-model` overrides disabled config; (e) `--no-multi-model` overrides enabled config; (f) all-externals-fail fixture exercises FR-MR17 native-only continuation with warning (links Task 23a to command level). | L | Tasks 33b, 34–37 | pending |

**Task 33a Acceptance Criteria:**
- `[T]` Decision order matches FR-MR21 verbatim (steps 1–8)
- `[T]` Both branches present as stubs; no orchestrator invocation yet (verified by Task 38(a) regression against baseline)
- `[T]` Stub for multi-model branch contains a clearly labeled placeholder (e.g., `<!-- orchestrator invocation: TODO in Task 33b -->`) — raw-string match before Task 33b begins

**Task 33b Acceptance Criteria:**
- `[T]` Multi-model branch invokes the orchestrator with the resolved config
- `[T]` Native-only branch byte-identical to today's review-code on the redacted baseline (Task 38(a) snapshot diff against Task 0 baseline)

**Task 34 Acceptance Criteria:**
- `[T]` Gate threshold values come from config (verified by mutating threshold in test config)
- `[T]` Gate decision computed once per invocation, not per loop cycle

**Task 35 Acceptance Criteria:**
- `[T]` Both flags work
- `[T]` Flag value overrides resolved-config value in all combinations

**Task 36 Acceptance Criteria:**
- `[T]` Format spec documented in `review-code.md` with the three invariants (matches D21 exactly)
- `[T]` Literal regex provided; admits all six PRD example renderings

**Task 37 Acceptance Criteria:**
- `[T]` Validator rejects outputs missing the header
- `[T]` Validator rejects headers failing the D21 regex
- `[T]` Recognizes all six PRD example variants — explicit per-variant test cases for: 3 with-externals, 2 native-only (`reviewers: 2 native`), 1 failed-externals (`reviewers: 2 native, 0 external succeeded`)

**Task 38 Acceptance Criteria:**
- `[T]` All six fixtures produce expected paths and outputs
- `[T]` Fixture (a) byte-identical to the **redacted** Task 0 baseline (FR-MR23 regression)
- `[T]` Fixture (f) FR-MR17 continuation produces visible warning text and audit-artifact entries

**Parallelizable:** Tasks 33a, 34, 35, 36 can run in parallel after Milestone 3.3 (33a is prerequisite for 33b only). Task 37 follows 36. Task 38 follows all.
**Milestone Value:** `review-code` is multi-model-capable end-to-end. Users can run `/review-code --multi-model` and get a consolidated multi-family review. Default behavior preserved.

### Milestone 4.2: Cross-Cutting Credential-Scope Test
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 41 | **Cross-cutting Layer 2 credential-leak test (FR-MR2).** Invoke review-code with multi-model enabled. Grep ALL paths the orchestrator writes during a representative invocation: audit file, raw-output files at `raw_output_path`, orchestrator stderr, `.synthex/config.yaml` after init, the bundle manifest. Pattern set: `sk-`, `AIzaSy`, `AWS_SECRET`, `AWS_ACCESS_KEY_ID`, OAuth bearer prefixes (`Bearer `, `bearer_`), `xoxb-`, `glpat-`, `ghp_`, `gho_`. | M | Milestone 4.0, Milestone 4.1 | pending |

**Task 41 Acceptance Criteria:**
- `[T]` Audit file contains expected sections
- `[T]` Grep across audit + raw-output + stderr + config + bundle-manifest for the expanded credential pattern set returns nothing
- `[T]` Test runs in CI as part of Layer 2 suite

**Parallelizable:** Single task.
**Milestone Value:** Reviews are auditable AND verified credential-clean across the full set of files Synthex writes. Closes FR-MR2 acceptance.

## Phase 5 — write-implementation-plan Integration

Adds multi-model review to the plan-review step. Reuses orchestrator from Phase 3 AND audit writer from Milestone 4.0. Does **not** add a complexity gate (per FR-MR22).

### Milestone 5.1: write-implementation-plan Command Update
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 42 | Update `plugins/synthex/commands/write-implementation-plan.md` plan-review step: when multi-model is active, invoke `multi-model-review-orchestrator` with native sub-agents (Architect + `design-system-agent` + Tech Lead) AND external adapters in single parallel batch. PM agent receives consolidated findings in unchanged shape. **Note:** Task can begin after Phase 3; does not strictly require Phase 4. Coordinate with Phase 4 owners on Task 39 (Milestone 4.0) ownership when Phases 4 and 5 ship simultaneously. | L | Phase 3 (orchestrator), Milestone 4.0 (audit writer) | pending |
| 43 | Add `--multi-model` / `--no-multi-model` invocation flags per FR-MR6. | S | Task 42 | pending |
| 44 | Document that `plan-linter` (pre-review structural check) is unaffected — runs before orchestrator as today. | S | Task 42 | pending |
| 45 | Layer 2 fixture at `tests/fixtures/multi-model-review/write-implementation-plan/`: (a) draft plan + multi-model enabled → orchestrator invoked, native + external in one batch, PM receives consolidated findings; (b) multi-model disabled → byte-identical to the **redacted** Task 0 baseline (FR-MR23 regression). | L | Tasks 42–44, Task 0 | pending |
| 46 | Audit-artifact writer (Task 39, command-agnostic) reused; add Layer 2 assertion that audit file is written for write-implementation-plan invocations with the FR-MR24 file-naming pattern. | S | Task 45, Milestone 4.0 | pending |

**Task 42 Acceptance Criteria:**
- `[T]` Multi-model active → orchestrator invoked with the three native reviewers (Architect, `design-system-agent`, Tech Lead) + configured externals
- `[T]` PM receives a single consolidated findings list with attribution
- `[T]` PM's decision-and-revision flow unchanged (plan-scribe still applies edits)

**Task 43 Acceptance Criteria:**
- `[T]` Flags work as in Milestone 4.1

**Task 44 Acceptance Criteria:**
- `[H]` Doc text states `plan-linter` runs before orchestrator

**Task 45 Acceptance Criteria:**
- `[T]` Multi-model fixture produces consolidated findings with both native and external attribution
- `[T]` Disabled fixture is byte-identical to the **redacted** Task 0 baseline (FR-MR23 regression)

**Task 46 Acceptance Criteria:**
- `[T]` Audit file present at expected path for the plan invocation
- `[T]` Audit file lists Architect, `design-system-agent`, and Tech Lead in the native reviewers section (not code-reviewer or security-reviewer)

**Parallelizable:** Tasks 43 and 44 can run in parallel with Task 42. Tasks 45 and 46 depend on the integration tasks.
**Milestone Value:** `write-implementation-plan` is multi-model-capable. Both v1 commands now have the feature; FR-MR21 + FR-MR22 fully shipped.

## Phase 6 — Init Discoverability and Documentation

Surface the feature to new users at init time; ship the user-facing docs.

### Milestone 6.1: Init Command Updates
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 47 | Update `plugins/synthex/commands/init.md` to add the multi-model-review prompt section per FR-MR19. **Detection scan:** for each candidate CLI (codex, gemini, ollama, llm, aws, claude), run `which` AND a lightweight auth check (per D22). **All `which` and auth checks dispatch concurrently in a single parallel Bash batch — preflight wall-clock bounded by slowest single check + collation overhead.** Emit a progress indicator (e.g., `"Detecting installed CLIs..."`) before beginning auth checks. **Auth checks that exit 0 are treated as authenticated regardless of advisory text on stdout/stderr.** Bucket results into three groups: detected-and-authenticated, detected-but-unauthenticated, not-detected. **Three options surfaced via `AskUserQuestion`:** (1) "Enable with detected CLIs" (lists only authenticated CLIs by name) — only includes CLIs that pass both checks; (2) "Enable later (show snippet)" — prints commented-out `multi_model_review:` YAML snippet per FR-MR5 with detected CLIs as commented-out reviewers; (3) "Skip". Surface unauthenticated CLIs separately with remediation hints (e.g., "Detected but unauthenticated: gemini — run `gcloud auth login` to enable"). Surface FR-MR27 data-transmission warning before writing `enabled: true`. **Warning copy matches the data-handling guidance style of init.md's concurrent-tasks prompt:** names categories transmitted (code/diffs/plans), references local-only alternatives (Ollama/Bedrock), does not promise data handling Synthex cannot guarantee. Run preflight if enabled. **Preflight summary** uses FR-MR20 format. **Preflight failure during init prints remediation but does not abort init.** When "Enable with detected" is chosen, create `docs/reviews/` if not present and surface in confirmation output. | M | Phase 4, Phase 5 | pending |
| 48 | Layer 2 fixture exercising all three init paths: (a) enabled-with-detected (mixed authenticated + unauthenticated CLIs in scan), (b) enabled-later-with-snippet, (c) skip. Cached outputs assert correct config writes (or no writes for skip), correct option-label phrasing for unauthenticated CLIs, syntactically valid YAML in printed snippet. | M | Task 47 | pending |

**Task 47 Acceptance Criteria:**
- `[T]` CLI detection runs both `which` AND a lightweight auth check per CLI (D22)
- `[T]` All checks dispatch concurrently in a single parallel Bash batch (raw-string match on init.md; latency upper-bounded by slowest single check)
- `[T]` "Enable with detected CLIs" option label only includes CLIs that pass both checks
- `[T]` Unauthenticated CLIs surfaced separately with remediation hints
- `[H]` Three options surfaced via `AskUserQuestion`
- `[H]` Detection scan emits a progress indicator before beginning auth checks
- `[T]` Auth checks exiting 0 are treated as authenticated regardless of advisory text
- `[T]` Data-transmission warning text appears before `enabled: true` is written
- `[H]` Warning copy matches data-handling guidance style of init.md's concurrent-tasks prompt
- `[T]` "Enable with detected" writes a config matching authenticated CLIs only
- `[T]` Preflight runs and reports summary in FR-MR20 format
- `[T]` Preflight failure prints remediation but does not abort init
- `[T]` `docs/reviews/` created and appears in init confirmation output when "Enable with detected" chosen

**Task 48 Acceptance Criteria:**
- `[T]` Each path produces expected config-file state
- `[T]` "Skip" path produces no `multi_model_review` section
- `[T]` "Enable later" snippet is syntactically valid YAML, includes detected CLIs as commented-out reviewers, begins with `multi_model_review:` as top-level key (verified by YAML parse)
- `[T]` "Enable with detected" with mixed scan correctly excludes unauthenticated CLIs

**Parallelizable:** Task 48 follows Task 47.
**Milestone Value:** New users discover the feature at init time; can opt in safely. Auth-precheck eliminates the post-confirm error path. Preserves zero-config default.

### Milestone 6.2: Documentation
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 49 | Author `docs/specs/multi-model-review/architecture.md` (final, replacing Phase 1 skeleton — replaces `## Status: Skeleton` with `## Status: Final`) — full architecture covering proposers, aggregator (D17 tier table), parallel fan-out, context bundle, consolidation pipeline (5 of 6 stages in v1 including D18 Stage 4 bounding), failure handling, deferred-Stage-3 path. Documents v1 vs. v2 explicitly. | L | Phase 5 | pending |
| 50 | Author `docs/specs/multi-model-review/adapter-recipes.md` documenting each v1 adapter: install one-liner, auth setup, recommended flagship model, sandbox flags, known gotchas. Include "writing a new adapter" section per NFR-MR5. **Schedule first in milestone batch** ([H] criteria). | M | Phase 2, Task 49 | pending |
| 51 | Author `docs/specs/multi-model-review/failure-modes.md` documenting graceful degradation, strict mode, all error_code values (FR-MR16), the FR-MR17 native-only continuation, the all-natives-fail critical-warning case (Task 23b), the cloud-surface remediation (Task 23c, NFR-MR2), and the OQ-6 aggregator-failure fallback (Q6 = (b) per PRD). | M | Phase 3, Task 49 | pending |
| 52 | Update `README.md` to add a "Multi-model review" section: (1) one sentence describing the feature, (2) one sentence on the primary benefit (correlated-error blind spots), (3) the off-by-default statement, (4) link to architecture doc and adapter recipes. | S | Task 49 | pending |
| 53 | Update `CLAUDE.md` agent table: add `multi-model-review-orchestrator` (Orchestration Layer) and the v1 adapters + `context-bundle-assembler` (Utility Layer). Add `init`, `review-code`, `write-implementation-plan` command-table updates noting multi-model integration. Use `design-system-agent` (not "Designer") consistently. | S | Phase 5 | pending |

**Task 49 Acceptance Criteria:**
- `[H]` Doc covers all FR-MR architectural concerns
- `[T]` Cross-references to FR-MR numbers are accurate
- `[H]` Documents v1 vs. v2 explicitly
- `[T]` `## Status: Skeleton` replaced with `## Status: Final`

**Task 50 Acceptance Criteria:**
- `[H]` Each v1 adapter documented
- `[H]` Install one-liners are tested commands (manual verification on macOS + Linux)
- `[H]` "Writing a new adapter" follows NFR-MR5 (markdown-only, no orchestrator changes required)

**Task 51 Acceptance Criteria:**
- `[T]` All FR-MR16 error_code values documented
- `[H]` FR-MR17 continuation flow described (both externals-fail and natives-fail variants)
- `[H]` Cloud-surface remediation documented
- `[H]` Aggregator-failure fallback recommendation documented (Q6 = (b))

**Task 52 Acceptance Criteria:**
- `[H]` README section contains the four required elements
- `[T]` Links resolve

**Task 53 Acceptance Criteria:**
- `[T]` New agents appear in agent table
- `[T]` Command table notes integration
- `[T]` Uses `design-system-agent` consistently

**Parallelizable:** Tasks 49–53 all parallelize after their predecessors. Tasks 50 and 51 can run concurrently; 52 and 53 in parallel after 49.
**Observational Outcomes:** `[O]` First-week post-merge: at least one external user successfully follows the docs to enable multi-model review without a support question (validates discoverability quality).
**Milestone Value:** Feature is discoverable, documented, and fully shipped to v1 scope. End-of-Phase-6 = MVP ship-ready.

## Phase 7 — Follow-Up: Stage 3 Embedding Dedup, Fast-Follow Adapters, Layer 3 Tests

Lower-priority but planned work that ships in subsequent releases. Not required for v1. **Phase 8 depends on Phase 6 only — Phase 7 milestones ship in a subsequent release.**

### Milestone 7.1: Stage 3 Semantic Dedup
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 54 | Resolve Q1 (Stage 3 fallback): decide between requiring `llm embed` vs. host-session embedding fallback. Document decision as a new D-row. | S | Phase 6 | pending |
| 55 | Implement Stage 3 between current Stages 2 and 4: cosine similarity on title+description embeddings; merge above 0.85; pairs in [0.7, 0.85) flow to existing Stage 4 LLM tiebreaker. **Replaces D18's textual pre-filter with embedding similarity** as the primary Stage 4 input gate. The D18 max-calls cap remains. | M | Task 54 | pending |
| 56 | Layer 2 fixture: planted semantically-similar findings (different wording, same meaning) → merged at Stage 3. | M | Task 55 | pending |

**Task 54 Acceptance Criteria:**
- `[H]` Decision documented

**Task 55 Acceptance Criteria:**
- `[T]` Stage 3 runs between 2 and 4 in pipeline order
- `[T]` Threshold configurable
- `[T]` Embedding source matches Q1 resolution
- `[T]` D18 max-calls cap continues to apply at Stage 4

**Task 56 Acceptance Criteria:**
- `[T]` Planted semantic duplicates merge
- `[T]` Truly distinct findings remain separate

**Parallelizable:** Sequential.
**Milestone Value:** Consolidation pipeline reaches full PRD scope. Reduces near-duplicate noise in consolidated reports.

### Milestone 7.2: Fast-Follow Adapters
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 57 | Author `llm-review-prompter.md` per FR-MR8 + FR-MR10. Universal escape-hatch (50+ providers via `llm` plugins). `text-only` tier. Family inferred from model-ID prefix. | M | Phase 6 | pending |
| 58 | Author `bedrock-review-prompter.md` per FR-MR8 + FR-MR10. AWS Bedrock CLI. `text-only` tier. Family inferred from Bedrock model ID. | M | Phase 6 | pending |
| 59 | Author `claude-review-prompter.md` per FR-MR8 + FR-MR10. Specialty adapter (use only for second Anthropic voice with different model than host session). `agentic` tier. Family `anthropic`. Doc explicitly notes "not in default-recommended set" per FR-MR10. | M | Phase 6 | pending |
| 60 | Add all three to `plugin.json` (single PR). Layer 1 validator tests for each via shared validator. **NFR-MR5 verification:** each of Tasks 57–59 implemented in exactly 3 file changes (adapter `.md` + `plugin.json` entry + adapter-recipes doc entry). Any orchestrator change required during 57–59 is treated as a defect against the extensibility contract. | S | Tasks 57–59 | pending |

**Task 57 Acceptance Criteria:**
- `[T]` FR-MR8 checklist
- `[T]` Correct tier and family declarations

**Task 58 Acceptance Criteria:**
- `[T]` FR-MR8 checklist
- `[T]` Correct tier and family declarations

**Task 59 Acceptance Criteria:**
- `[T]` FR-MR8 checklist
- `[T]` Correct tier and family declarations
- `[T]` Doc explicitly notes specialty status

**Task 60 Acceptance Criteria:**
- `[T]` All three registered
- `[T]` Envelope validator passes for all
- `[T]` Each of Tasks 57–59 implemented in exactly 3 file changes; PR diff verified

**Parallelizable:** Tasks 57, 58, 59 are independent — three engineers can author concurrently. Task 60 is the integration step.
**Milestone Value:** Adapter set covers all PRD-listed v1 options. Bedrock and `llm` cover users who can't or won't install per-vendor CLIs. NFR-MR5 extensibility verified empirically.

### Milestone 7.3: Layer 3 Semantic Eval
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 61 | Author Layer 3 LLM-as-judge promptfoo entries for orchestrator: corpus of 5–10 real multi-reviewer scenarios; judge prompt asks "would a human accept this consolidation?". **Includes a Task-call-sequencing semantic eval** covering the FR-MR12 single-batch property (the verifiability gap noted in cycle-1 review against Task 23). | L | Phase 6 | pending |
| 61a | **Runtime-only orchestrator behavioral checks (Layer 3, live invocation).** Author Layer 3 promptfoo entries for two orchestrator behaviors that cannot be verified against cached fixtures: (1) **Wall-clock parallel fan-out** — issue a real 4-proposer fan-out (2 native + 2 external, real CLIs) and assert wall-clock latency is within 1.5× the slowest single proposer's measured latency (NFR-MR3); pads the cycle-1 deferral of Task 23's wall-clock assertion. (2) **Position randomization in Stage 4** — invoke the Stage 4 tiebreaker twice in succession with the same ambiguous pair; assert the two recorded prompts present the findings in reversed order (verifies Task 26's randomization rule operationally). Live invocations bypass cache by definition; entries are tagged manual-trigger-only per CLAUDE.md testing pyramid. | M | Task 61 | pending |
| 62 | Establish quality baseline; document expected pass rate; gate future PRs on regression. | M | Tasks 61, 61a | pending |

**Task 61 Acceptance Criteria:**
- `[H]` Promptfoo entries authored; corpus of 5+ scenarios
- `[H]` Judge prompt elicits scoring with reasoning
- `[H]` Includes Task-call-sequencing eval for FR-MR12 verification

**Task 61a Acceptance Criteria:**
- `[H]` Wall-clock entry: measured wall-clock for 4-proposer live fan-out within 1.5× the slowest single proposer's latency (NFR-MR3); recorded as Layer 3 metric, not asserted on cached fixtures
- `[H]` Position-randomization entry: two adjacent live invocations of Stage 4 tiebreaker with the same ambiguous pair present findings in reversed order
- `[T]` Both entries tagged manual-trigger-only and excluded from per-PR Layer 1 + Layer 2 default suite

**Task 62 Acceptance Criteria:**
- `[H]` Baseline documented in `docs/specs/multi-model-review/test-baseline.md`
- `[H]` CI integration planned (manual-trigger only per CLAUDE.md testing pyramid)

**Parallelizable:** Sequential — Task 61a depends on Task 61's promptfoo scaffolding; Task 62 depends on both.
**Milestone Value:** Quality regression protection beyond schema and behavioral tests. Validates aggregator quality, FR-MR12 single-batch property, parallel-fan-out wall-clock (NFR-MR3), and Stage 4 position-randomization holistically — runtime-only behaviors deferred from Layer 2 cached fixtures.

## Phase 8 — Release

**Phase 8 depends on Phase 6 only.** Phase 7 milestones are v2 fast-follow work shipping in a subsequent release.

### Milestone 8.1: Version Bumps and Changelog
| # | Task | Complexity | Dependencies | Status |
|---|------|-----------|--------------|--------|
| 63 | Bump `plugins/synthex/.claude-plugin/plugin.json` version. | S | Phase 6 | pending |
| 64 | Bump top-level `.claude-plugin/marketplace.json` version AND the synthex-plugin entry's version per CLAUDE.md release rules. | S | Task 63 | pending |
| 65 | Add `CHANGELOG.md` entry covering all FR-MR features shipped in v1, with link reference at the bottom. Mentions `multi_model_review` config addition, new orchestrator + adapter agents, `init` updates, audit artifacts, complexity gate. **Mentions `docs/reviews/` as default audit output directory and notes users should add it to `.gitignore` if they prefer not to commit review artifacts.** | S | Tasks 63–64 | pending |

**Task 63 Acceptance Criteria:**
- `[T]` Synchronized new version string with Task 64
- `[T]` Valid JSON

**Task 64 Acceptance Criteria:**
- `[T]` Both top-level version and synthex entry version match Task 63
- `[T]` Valid JSON

**Task 65 Acceptance Criteria:**
- `[H]` Changelog entry follows existing format
- `[H]` Mentions `multi_model_review` config addition, new orchestrator + adapter agents, `init` updates, audit artifacts, complexity gate
- `[H]` Mentions `docs/reviews/` as default audit output directory and `.gitignore` recommendation

**Parallelizable:** Sequential.
**Milestone Value:** Release shipped. Plugin upgrade detection works for users.

## Cross-Cutting Notes for Engineering

- **No runtime code:** Per CLAUDE.md, all agents and the orchestrator are markdown definitions invoked by Claude Code. Subprocess invocation happens via the Bash tool from within agent prompts.
- **Test execution lives in `tests/`:** Add `tests/schemas/multi-model-review/` for new validators; reuse patterns from `tests/schemas/architect.ts` (dual-mode example) and `tests/schemas/code-reviewer.ts`.
- **Family attribution:** Every adapter declares `family:` inline in its markdown (Q5 default-with-override pattern; user `family:` config is the override). Native sub-agents are `anthropic` by virtue of running in the host Claude session — orchestrator preflight derives this without per-native config.
- **Sandbox flags:** Each adapter `.md` MUST document the exact sandbox-flag set per FR-MR26. Adapter integration tests (Tasks 12, 15a, 18a) include an assertion that documented flags match the actual invocation string.
- **Concurrent task limit:** Plan respects `concurrent_tasks: 3` per milestone. Phase 2's three adapter milestones in parallel = three concurrent **engineers**, each working a single milestone's tasks sequentially. Within a single milestone, no more than 3 tasks run in parallel.
- **Phase 2 plugin.json scheduling:** Tasks 10, 14, 17 each modify `plugin.json` (three-way merge conflict risk). **Resolution:** (a) land all three registrations in a single coordinated PR, or (b) rebase the registration tasks in sequence after the corresponding adapter `.md` lands.
- **`[H]`-bearing tasks scheduling:** Tasks 9, 13, 16, 50 carry `[H]` criteria requiring human sign-off. Schedule first in their parallel batches so sign-off doesn't block downstream work.
- **OQ resolution checkpoints:** Q1 must be resolved before starting Milestone 7.1. Q3 should be resolved during Milestone 3.3 (Task 31). Q5 should be resolved during Milestone 2.1 (Task 9) — recommendation: inline declaration as default.
- **Terminology rule:** Canonical term for finding-producing party is **"proposer."** Use **"reviewer"** only for config keys (`reviewers:` in `defaults.yaml`) or user-facing labels (init-prompt copy, audit-artifact section headers). Adapter `.md` files and `architecture.md` MUST use "proposer" in technical descriptions.
- **`design-system-agent` naming:** The native plan reviewer is `design-system-agent.md`. The PRD's "Designer" is colloquial. Tasks 42, 47, 53 and engineering-facing docs use `design-system-agent`.
- **D17 / D18 / D21 invariants:** New tasks must respect (D17) the FR-MR15 strict-total-order tier table for aggregator `auto`; (D18) the bounded Stage 4 contract (pre-filter + per-consolidation max-calls cap, NOT per-bucket); and (D21) the path-and-reason header literal regex admitting all six PRD example variants. Any task that loosens these requires a new superseding D-row.

## Status: Final

# Architecture — Multi-Model Review Orchestration

> Final architecture for the multi-model review feature. Replaces the Phase 1 skeleton (Task 3). Normative source of truth for the proposer-plus-aggregator design, parallel fan-out, consolidation pipeline, failure handling, and v1/v2 scope boundary.

## Related Documentation

- [`adapter-contract.md`](./adapter-contract.md) — Canonical adapter input/output envelope contract (Task 4, FR-MR9)
- `adapter-recipes.md` — Per-adapter install/auth/gotchas (forthcoming, Task 50)
- `failure-modes.md` — Graceful degradation, error_code reference, fallback paths (forthcoming, Task 51)
- [`../../../plugins/synthex/agents/_shared/canonical-finding-schema.md`](../../../plugins/synthex/agents/_shared/canonical-finding-schema.md) — Finding schema (Task 1, FR-MR13)
- [`../../../plugins/synthex/agents/multi-model-review-orchestrator.md`](../../../plugins/synthex/agents/multi-model-review-orchestrator.md) — Orchestrator implementation (FR-MR11)
- [`../../../plugins/synthex/agents/audit-artifact-writer.md`](../../../plugins/synthex/agents/audit-artifact-writer.md) — Audit artifact writer (FR-MR24, D20)

---

## 1. Overview

Multi-model review orchestration fans review prompts out to multiple LLM-family proposers via CLI adapters, then consolidates findings into a single deduplicated, severity-reconciled, attributed list.

**Off by default.** The feature requires explicit opt-in via `.synthex/config.yaml` (`multi_model_review.enabled: true`). This prevents unexpected latency and cost for users who have not configured it. When `multi_model_review.enabled: false` (or `--no-multi-model` is passed), commands produce byte-identical output to their pre-feature behavior — this is a hard invariant enforced by FR-MR23 regression baselines.

**CLI-only.** No API keys are held by Synthex. Each external provider is invoked through its own CLI tool (e.g., `codex`, `gemini`, `ollama`). This keeps Synthex credential-free and lets users control authentication through their own tooling.

**v1 scope.** Two commands integrate with multi-model review in v1:
- `/synthex:review-code` — with complexity gating per FR-MR21a (8-step decision order, configurable threshold)
- `/synthex:write-implementation-plan` — for the plan-review step, with no complexity gate per FR-MR22

The architecture is **proposer-plus-aggregator**: many proposers emit candidate findings in parallel; one aggregator consolidates them through a staged pipeline. This document describes that architecture end-to-end.

---

## 2. Proposer-plus-Aggregator Architecture

The core design is a two-phase pipeline driven by the Multi-Model Review Orchestrator (Sonnet-backed per FR-MR11, D3):

**Phase 1 — Proposal (parallel):** Every configured proposer is invoked once with the same context bundle. Each emits a list of canonical findings per the schema in `canonical-finding-schema.md` (FR-MR13). Proposers run concurrently; no proposer waits on another.

**Phase 2 — Consolidation (sequential pipeline):** The aggregator (resolved per the FR-MR15 strict-total-order tier table, D17) consolidates findings through up to 6 stages. In v1, 5 of 6 stages run. Stage 3 (embedding-based semantic dedup) is deferred to Phase 7.

### Why proposer-plus-aggregator?

Three alternative patterns were considered and rejected:

**Pairwise debate** — each pair of proposers debates their findings and converges. Rejected: adds latency proportional to O(n^2) without measurable quality improvement on review tasks.

**Majority vote** — findings are kept only when a majority of proposers raised them. Rejected: produces false negatives. A single proposer's correct, rare finding (e.g., a subtle security vulnerability that only a security-specialized model catches) gets outvoted. The multi-model feature exists precisely to catch what any single model misses.

**Sequential chaining** — each proposer reads the previous proposer's findings and builds on them. Rejected: introduces order-dependency bias and eliminates the ability to detect when proposers independently agree (the strongest quality signal).

The proposer-plus-aggregator pattern preserves single-source signal, eliminates structural bias from ordering, and enables independent-agreement detection through the `raised_by[]` attribution in the consolidated envelope.

---

## 3. Native vs. External Proposers

Both kinds of proposer emit canonical findings in the same envelope shape (FR-MR9). The orchestrator treats them uniformly downstream — same `per_reviewer_results` array, same consolidation pipeline. The operational distinction is:

| Aspect | Native sub-agents | External adapters |
|--------|------------------|-------------------|
| Family | `anthropic` | `openai`, `google`, `local-<model>`, etc. |
| Invocation | Task tool -> sub-agent | Bash subprocess via `*-review-prompter.md` agent |
| Context access | Full host-session context + bundle | Bundle only (CLI surface) |
| Failure modes | Sub-agent error -> captured in unified envelope | `cli_missing` / `cli_auth_failed` / `cli_failed` / `parse_failed` / `timeout` per FR-MR16 |
| Source attribution | `source.source_type: "native-team"` | `source.source_type: "external"` |
| Recovery path | Sub-agent re-spawn via host session | FR-MR17 native-only continuation (see Section 8) |

The `source.source_type` field in every finding is the definitive downstream marker. Nothing else in the consolidation pipeline treats native and external findings differently — dedup, severity reconciliation, and minority-of-one demotion operate identically on both.

The `source.family` field drives the D17 tier table (aggregator selection) and the FR-MR15 family-diversity check. Native proposers always report `family: "anthropic"`.

---

## 4. Parallel Fan-Out (FR-MR12, D6)

All proposers — native sub-agents and external CLI adapters — run in **a single parallel Task batch** (FR-MR12 verbatim: "Native and external proposers run in a single parallel Task batch"). There is one batch dispatch; all proposers resolve concurrently within it.

```
+---------------------------------------------+
|       multi-model-review-orchestrator        |
|           (Sonnet, FR-MR11 / D3)             |
+------------------+---------------------------+
                   |
              (single Task batch -- D6)
                   |
   +---------------+---------------+-----------+
   |               |               |           |
   v               v               v           v
[native-1]    [native-2]      [codex]      [gemini]
 Native         Native        External     External
 Anthropic      Anthropic     openai       google
(code-rev)    (security-rev) (ext adapter) (ext adapter)
   |               |               |           |
   +---------------+---------------+-----------+
                   |
          [unified envelope]
          (per_reviewer_results[]
           + all findings[])
                   |
                   v
      [aggregator -- D17 tier table]
      (FR-MR15; host-fallback when no flagship)
                   |
                   v
      [consolidation pipeline stages]
       Stage 1: fingerprint dedup (FR-MR14)
       Stage 2: lexical dedup / Jaccard (FR-MR14)
       [Stage 3: embedding dedup -- deferred Phase 7]
       Stage 4: LLM tiebreaker D18-bounded (FR-MR14)
       Stage 5: severity reconciliation (FR-MR14a)
       Stage 5b: contradiction scan + CoVe (FR-MR14)
       Stage 6: minority-of-one demotion (FR-MR14b)
                   |
                   v
      [consolidated findings]
       (raised_by[] attributed; NFR-MR4 usage)
```

The single-batch property is structurally required for FR-MR17's native-only continuation guarantee: when an external proposer fails, the native findings are already in hand because all proposers ran in the same batch. If proposers were serialized, an early external failure could delay or eliminate native findings.

### Per-reviewer timeouts (FR-MR12)

Each proposer Task call is bound by `per_reviewer_timeout_seconds` (default 180s). A timeout fires as an error envelope with `error_code: "timeout"` — it is NOT an orchestrator-level failure. One slow proposer cannot block the rest of the batch.

Preflight CLI presence and auth checks (FR-MR20) are also dispatched concurrently in a single parallel Bash batch. Preflight target: complete in < 2 seconds on a 3-adapter config.

---

## 5. Aggregator Resolution (FR-MR15, D17)

The aggregator is responsible for the final consolidation judgments — Stage 4 LLM tiebreaker calls and, on the inline path, the aggregation prompt itself. Aggregator selection is deterministic: given a fixed set of configured proposers, the same aggregator is always selected.

### D17 strict total-order tier table

When `aggregator.command` is set to `"auto"`, the orchestrator walks this tier table (highest to lowest) and picks the **first** tier that has a matching configured proposer:

| Tier | Model | Family |
|------|-------|--------|
| 1 | Claude Opus | anthropic |
| 2 | GPT-5 | openai |
| 3 | Claude Sonnet | anthropic |
| 4 | Gemini 2.5 Pro | google |
| 5 | DeepSeek V3 | local/deepseek |
| 6 | Qwen 32B | local/qwen |

The tier ordering is the D17 normative total order. Any change to the ordering requires a superseding D-row; the orchestrator `.md` is updated to match.

**Example resolution:** config has `codex-review-prompter` (GPT-5, Tier 2) and `gemini-review-prompter` (Gemini 2.5 Pro, Tier 4) as proposers. Aggregator `auto` resolves to `codex-review-prompter` because Tier 2 (GPT-5) outranks Tier 4. The resolved aggregator is invoked as a separate fresh CLI call with the judge-mode system prompt.

### Host-fallback

If no configured proposer matches any tier-table entry (e.g., all adapters are Ollama with non-flagship models), the orchestrator falls back to the **host Claude session** as the aggregator (FR-MR17 / OQ-6 (b)). The resolved aggregator name, its resolution source (`"configured"` | `"tier-table"` | `"host-fallback"`), and the path-and-reason header (D21) are all recorded in the unified envelope and audit artifact.

### Judge-mode prompt (FR-MR15 bias mitigation)

When the aggregator is the host Claude session (host-fallback path), the orchestrator's reasoning prompt **embeds a judge-mode system prompt** instructing impartial, evidence-first adjudication. The phrase `"judge-mode"` appears verbatim in the inline aggregation prompt. The prompt instructs: evaluate each finding on its own merits, free of attribution bias; position randomization has been applied to the input.

When the aggregator is an external adapter (D17 tier-table path), the judge-mode system prompt is **packaged into the adapter Task call** as `config.judge_mode_prompt`. The adapter surfaces it to the underlying CLI as a system message.

A self-preference warning fires (preflight Step 0c) when the aggregator family equals the family of the only non-anthropic proposer. The warning is advisory; it does not block execution.

---

## 6. Context Bundle (D5, FR-MR28)

The context bundle is the orchestrator's single source of truth for what every proposer sees. It is assembled **once per invocation** and delivered **identically** to every proposer. This eliminates per-reviewer drift — no proposer sees a different version of the artifact, conventions, or specs.

The `context-bundle-assembler` agent (Task 5, Haiku-backed) handles assembly in this order:

1. **Artifact** — the diff or plan being reviewed (never summarized; see below)
2. **Project conventions** — CLAUDE.md, .eslintrc, .prettierrc, etc. per `context.convention_paths`
3. **Touched files** — full content where size permits; Haiku-summarized where `max_file_bytes` exceeded
4. **Referenced specs** — matched by filename-substring heuristic per OQ-8; overridable via `context.spec_map`
5. **Total bundle cap** — iterative summarization keeps total under `max_bundle_bytes`

**Artifact integrity rule:** when the artifact alone exceeds `max_bundle_bytes`, the assembler emits `error_code: "narrow_scope_required"` and stops. The artifact is the object under review — summarizing it would corrupt the review. The caller decides whether to retry with a narrower scope (e.g., a single file instead of a full diff).

The bundle includes a `manifest` object recording which files were verbatim vs. summarized, total bytes, and the spec map used. This manifest feeds Section 2 of the audit artifact (FR-MR24).

---

## 7. Consolidation Pipeline (5 of 6 Stages in v1)

After the unified envelope is assembled and failure handling is applied (see Section 8), the orchestrator runs the consolidation pipeline on the `findings[]` array. Stages execute **in sequence**; no stage is skipped.

**v1 runs 5 of 6 stages:** Stages 1, 2, 4, 5, 5b, and 6. Stage 3 (embedding-based semantic dedup) is deferred to Phase 7 (see Section 10).

### Stage 1 — Fingerprint Dedup by `finding_id` (FR-MR14)

Group all findings by exact `finding_id`. Collapse each group to one consolidated finding; record all contributors in `raised_by[]`.

A finding whose `finding_id` contains a line number (pattern `:\d+|L\d+|line[-_]\d+`) violates the canonical-finding-schema constraint (FR-MR13) — it is surfaced in the audit artifact as a schema error, not silently merged.

**Example:** 4 findings with IDs `[A, A, B, C]` (two reviewers raised A independently) collapse to 3 consolidated findings: A with 2 `raised_by` entries, B and C with 1 each.

### Stage 2 — Lexical Dedup within `(file, symbol)` Buckets (FR-MR14)

Group Stage 1 output by `(file, symbol)` tuple. Within each bucket, compare normalized title tokens via Jaccard similarity. Merge pairs whose Jaccard score is at or above `consolidation.stage2_jaccard_threshold` (default 0.8, configurable — never hardcoded).

Tokenization: lowercase title, remove stopwords, split on whitespace/punctuation, compare token sets. When merging, the consolidated finding preserves the highest-severity description; both reviewers contribute to `raised_by[]`.

### Stage 3 — Embedding-Based Semantic Dedup (DEFERRED to Phase 7)

Stage 3 would use `llm embed` to catch near-duplicate findings whose titles are lexically dissimilar but semantically equivalent. Not implemented in v1. The Stage 4 pre-filter (>=30% Jaccard) serves as a proxy boundary for v1. Phase 7 integration depends on resolving OQ-Q1 (`llm embed` availability). See Section 10 for the deferred path.

### Stage 4 — LLM Tiebreaker, D18-Bounded (FR-MR14)

For candidate pairs remaining after Stages 1 and 2, apply the LLM judge — but strictly bounded per D18:

**D18 pre-filter:** candidate pairs MUST share >=30% normalized-title Jaccard before reaching the LLM. This 30% gate is distinct from Stage 2's merge threshold (0.8). Stage 2 merges high-confidence pairs; Stage 4's lower gate controls which ambiguous pairs warrant LLM adjudication.

**Per-consolidation cap:** total Stage 4 LLM calls across all `(file, symbol)` buckets in a single consolidation run MUST NOT exceed `consolidation.stage4.max_calls_per_consolidation` (default 25, configurable, never hardcoded).

When the cap fires mid-consolidation, remaining candidate pairs are left unmerged. A single audit warning records the total skipped count (only one warning per consolidation run, regardless of how many buckets are skipped).

**Position randomization (FR-MR15 bias mitigation):** when two findings are submitted to the LLM judge, their presentation order alternates based on `(invocation_counter mod 2)`. Even-numbered calls present finding A first; odd-numbered calls present finding B first. This prevents systematic positional advantage across a consolidation run.

### Stage 5 — Severity Reconciliation (FR-MR14a)

For each consolidated finding with multiple per-reviewer severities in `raised_by[]`:

- **Unanimous:** all reviewers agree on severity — use unchanged.
- **One-level diff** (e.g., `{high, medium}`): use **max** severity (high). Record `severity_range: { min, max }` for audit. No judge step.
- **Two-or-more level diff** (e.g., `{critical, low}`): trigger a CoT judge step. Record `severity_reasoning` with the judge's chain of thought. Use the judge's chosen severity.

Per-reviewer severities are preserved in `raised_by[].severity`; the top-level `severity` field is the reconciled value.

### Stage 5b — Contradiction Scan + Chain-of-Verification (FR-MR14)

**Contradiction scanner:** scan deduplicated findings for mutually incompatible claims at the same location. Same-location definition: same file AND same symbol, OR (when `symbol === null`) same file AND line ranges overlap or are within 5 lines. Findings at the same file with no symbol whose `line_range` start/end values are 7 or more lines apart are NOT candidates. Produces candidate pairs for adjudication; non-candidates pass through unchanged.

**Chain-of-Verification adjudicator (arXiv:2309.11495):** for each candidate pair, the CoVe adjudicator (1) re-reads the artifact independently of the findings, (2) formulates the underlying question both findings answer differently, (3) produces an independent verdict, (4) marks the LOSING finding with `superseded_by_verification: true` and populates `verification_reasoning` with the full CoVe reasoning chain.

Both findings remain visible in output. The losing finding is marked, not dropped.

### Stage 6 — Minority-of-One Demotion (FR-MR14b)

For each consolidated finding where `raised_by.length === 1`:

- If `category === "security"` — **do not demote** (security single-source findings are preserved at original severity)
- If `confidence === "high"` (reviewer-flagged) — **do not demote**
- Otherwise — demote severity by exactly one level:
  - `critical` -> `high`
  - `high` -> `medium`
  - `medium` -> `low`
  - `low` -> `low` (floor — never dropped)

**Findings are NEVER dropped.** Demotion adjusts severity only. The finding remains in the output envelope at the demoted severity.

---

## 8. Failure Handling (FR-MR16, FR-MR17, NFR-MR2)

Failure handling occurs after collection (Step 5 in the orchestrator workflow). Three failure surfaces are defined; each has distinct behavior and verbatim warning text.

### error_code enum (FR-MR16)

External adapter failures surface one of these `error_code` values:

| Code | Meaning | Retry? |
|------|---------|--------|
| `cli_missing` | CLI not installed or not in PATH | No (terminal) |
| `cli_auth_failed` | CLI is installed but not authenticated | No (terminal) |
| `cli_failed` | CLI ran but returned non-zero exit | No |
| `parse_failed` | Output could not be parsed as canonical envelope; retried once with clarification prompt | Once |
| `timeout` | Per-reviewer timeout fired | No |
| `sandbox_violation` | CLI attempted a forbidden operation | No (terminal) |
| `unknown_error` | Catch-all for unexpected failures | No |

Adapters MUST NOT introduce new error_code values without updating FR-MR16 and `adapter-contract.md`.

### All externals failed (FR-MR17)

When every external adapter returns `status: "failed"`, the orchestrator emits:
> "All external reviewers failed; continuing with natives only"

Sets `continuation_event.type = "all-externals-failed"`. Consolidation continues with native findings only. This is the primary justification for the single-batch fan-out (D6) — native findings are already in hand when externals fail.

### All natives failed (FR-MR17)

When every native sub-agent returns `status: "failed"` (with `include_native_reviewers: true`), the orchestrator emits a CRITICAL warning:
> "All native Synthex reviewers failed. Cannot continue -- multi-model review has no findings to consolidate. Check sub-agent error logs."

Sets `continuation_event.type = "all-natives-failed"`. Stops — no consolidation possible. Returns the unified envelope with `findings: []`. This warning is DISTINCT from the all-externals-failed warning and surfaces as a CRITICAL severity event in the audit artifact.

### Cloud surface — no CLIs available (NFR-MR2)

When every configured external adapter returns `error_code: "cli_missing"`, the orchestrator emits a single remediation error (NOT one error per CLI):
> "Multi-model review cannot run on this surface -- no external review CLIs are available. See docs/specs/multi-model-review/adapter-recipes.md for setup, or run on a host with the configured CLIs installed."

Sets `continuation_event.type = "cloud-surface-no-clis"`. This fires specifically on cloud-hosted surfaces (e.g., Vercel, GitHub Actions runners) where provider CLIs are not pre-installed. Emitting one message avoids cascading per-CLI noise.

All three failure surfaces are captured in Section 7 of the audit artifact. The path-and-reason header (D21) reflects the continuation outcome — e.g., `"Review path: multi-model (auth path escalated; reviewers: 2 native, 0 external succeeded)"`.

---

## 9. Audit Artifact (FR-MR24, D20)

Every multi-model review invocation writes a self-contained audit artifact. The file is written by the `audit-artifact-writer` agent (Task 39, Haiku-backed, Milestone 4.0).

### Command-agnostic design (D20)

The audit writer is parameterized by `command` and reused without modification across `/review-code` and `/write-implementation-plan`. This was an explicit architectural decision (D20) to prevent a Phase 5 retrofit: a review-code-specific writer in Phase 4 would require duplication or refactoring when plan review landed in Phase 5.

### File naming and location

Output directory: `multi_model_review.audit.output_path` (default `docs/reviews/`).
Filename pattern: `<YYYY-MM-DD>-<command>-<short-hash>.md`

Examples:
- `2026-04-27-review-code-a1b2c3d.md`
- `2026-04-27-write-implementation-plan-f4e5d6c.md`

The filename pattern is identical across both commands; only the `<command>` substring varies.

### 7 required sections (FR-MR24)

1. **Invocation metadata** — command, target, timestamp, short hash, config file path
2. **Config snapshot** — resolved `multi_model_review` block as fenced YAML
3. **Preflight result** — per-CLI presence/auth checks (FR-MR20), family-diversity and self-preference warnings, aggregator resolution source
4. **Per-reviewer results** — markdown table split into native/external sub-sections; `usage` objects verbatim per NFR-MR4 (when CLI does not report usage: `usage: not_reported` explicitly)
5. **Consolidated findings with attribution** — severity, category, title, file, symbol, `raised_by[]`, `severity_range`, `severity_reasoning`, `superseded_by_verification`, `verification_reasoning`
6. **Aggregator trace** — aggregator name and resolution source, Stage 4 calls dispatched/skipped (including any cap-hit audit warning), position-randomization seed, judge-mode prompt indicator (inline vs. external-packaged per D17)
7. **Continuation event** — present only when `continuation_event !== null`; type, details, per-reviewer error codes that triggered the event

Section 7 is omitted when `continuation_event === null`. The other 6 sections are mandatory in every audit file. Writes are atomic (`.tmp` then rename) per Synthex conventions.

When `audit.enabled: false`, the writer skips file creation and returns immediately. The orchestrator continues normally.

---

## 10. v1 vs. v2 Scope

| Feature area | v1 (current) | v2 (Phase 7+) |
|---|---|---|
| Orchestrator consolidation stages | 5 of 6: Stages 1, 2, 4, 5, 5b, 6 | Stage 3 (embedding dedup via `llm embed`; deferred per OQ-Q1) |
| Adapter set (D2) | Codex (openai), Gemini (google), Ollama (local) | Fast-follow: `llm`, Bedrock, native-claude adapters |
| Command integrations | `/review-code` (FR-MR21a complexity gate) + `/write-implementation-plan` (FR-MR22, no gate) | Additional commands as scope expands |
| Aggregator inline path | Host Claude session with judge-mode prompt embedded inline (Q3 partial: inline for v1) | Separate sub-agent invocation for host-aggregator path |
| Layer 3 evals | Not in scope | Promptfoo eval suite for consolidation quality (Task 61a) |
| Observability | Audit artifact 7 sections (FR-MR24, D20) | Comparative "missed-issue" instrumentation (D10) |
| Packaging | Plugin-internal only (D16) | Standalone plugin packaging (D16 deferred) |
| Wall-clock verification | Structural single-batch assertion (Task 23) | Layer 3 wall-clock check for full 6-stage pipeline (Task 61a, Phase 7) |

### Stage 3 deferred path (Phase 7)

Stage 3 embedding-based semantic dedup is intentionally absent from v1. The deferred implementation path is:

1. **Resolve OQ-Q1:** determine whether `llm embed` is a required install precondition or whether host-session embedding suffices.
2. **Insert Stage 3** between Stages 2 and 4 in the orchestrator pipeline. Stage 3 computes embedding similarity between `(file, symbol)` bucket candidates and merges pairs above a configurable cosine threshold.
3. **Relax Stage 4 pre-filter:** the >=30% Jaccard pre-filter becomes redundant once Stage 3 covers semantic similarity. The pre-filter can be relaxed or removed post-Stage-3 integration.
4. **Add Layer 3 verification (Task 61a, Milestone 7.3):** wall-clock check verifying the full 6-stage pipeline runs within the NFR-MR4 latency budget.

The orchestrator `.md` records this explicitly: "v1 ships Stages 1, 2, 4, 5, 5b, 6. Stage 3 lands in Phase 7 alongside `llm embed` integration."

---

## 11. Cross-References to Forthcoming Documentation

### `adapter-contract.md` (Task 4) — available now

Canonical adapter input/output envelope (FR-MR9). Every `*-review-prompter.md` must conform. Covers: input shape (command, context_bundle, config), output shape (status, error_code, findings[], usage, raw_output_path), error_code enum (FR-MR16), retry semantics for `parse_failed`, validation surface enforced by `tests/schemas/adapter-envelope.ts` (Task 11).

### `adapter-recipes.md` (Task 50) — forthcoming

Per-adapter reference guide. Covers: install one-liners, auth setup, recommended models, known gotchas, and a "writing a new adapter" guide per NFR-MR5. This is the document referenced in the NFR-MR2 cloud-surface remediation message.

### `failure-modes.md` (Task 51) — forthcoming

Complete failure mode reference. Covers: all FR-MR16 error_code values with trigger conditions and retry semantics, FR-MR17 continuation flows with decision trees, cloud-surface (NFR-MR2) remediation steps by platform, aggregator-failure fallback paths, and OQ-Q6 (runtime failure of a tier-selected aggregator CLI after D17 selection). Q3's remaining narrow question (separate sub-agent invocation for host-aggregator in v2) is documented here.

---

## Appendix: Key Decision Summary

| Decision | Outcome | Rationale |
|---|---|---|
| D5 | Context bundle assembled once, identical for all proposers | Eliminates per-reviewer drift; single source of truth (FR-MR28) |
| D6 | Single parallel Task batch for all proposers | Required for FR-MR17 native-only continuation guarantee; native findings are in hand when externals fail |
| D17 | Aggregator `auto` follows strict total-order tier table; host-fallback when no flagship matches | Deterministic, testable, PRD-specified order (FR-MR15) |
| D18 | Stage 4 bounded by >=30% Jaccard pre-filter + per-consolidation cap (default 25) | Hard global ceiling on LLM calls regardless of bucket distribution; no accidental N^2 cost |
| D20 | Audit writer command-agnostic from day one, parameterized by command | Eliminates Phase 5 retrofit risk; FR-MR24 audit format identical across review-code and write-implementation-plan |
| D21 | Path-and-reason header has machine-readable format with literal regex | Required for Task 22 and Task 37 validators; admits all six PRD examples |
| D22 | Init pre-validates auth before showing "Enable with detected CLIs" option label | Avoids post-confirm error path; maintains <2s preflight target (FR-MR20) |

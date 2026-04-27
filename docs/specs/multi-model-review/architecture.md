## Status: Skeleton

# Architecture — Multi-Model Review Orchestration

> Initial architecture skeleton for the multi-model review feature. Replaced by full architecture in Task 49 (Phase 6, Milestone 6.2). Normative content lands here in skeleton form; narrative/tutorial expansion comes later.

## Related Documentation

- [`adapter-contract.md`](./adapter-contract.md) — Canonical adapter input/output envelope contract (Task 4, FR-MR9)
- `adapter-recipes.md` — Per-adapter install/auth/gotchas (forthcoming, Task 50)
- `failure-modes.md` — Graceful degradation, error_code reference, fallback paths (forthcoming, Task 51)
- [`../../../plugins/synthex/agents/_shared/canonical-finding-schema.md`](../../../plugins/synthex/agents/_shared/canonical-finding-schema.md) — Finding schema (Task 1, FR-MR13)

## Overview

Multi-model review orchestration fans review prompts out to multiple LLM-family proposers via CLI adapters, then consolidates findings into a single deduplicated, severity-reconciled, attributed list. Off by default. CLI-only (no API keys held by Synthex). v1 scope: `/review-code` (with complexity gating per FR-MR21a) and `/write-implementation-plan` (no gating per FR-MR22).

The architecture is **proposer-plus-aggregator**: many proposers emit candidate findings in parallel; one aggregator consolidates. The proposer set is heterogeneous — native Synthex sub-agents (Anthropic family) AND external CLI adapters (OpenAI/Google/local) — but the orchestrator treats them uniformly under FR-MR12's single-batch parallel-fan-out shape.

---

## 1. Proposer-plus-Aggregator Architecture

The orchestrator (Sonnet-backed per FR-MR11; D3) drives a two-phase pipeline:

1. **Proposal phase (parallel):** Every configured proposer is invoked once with the same context bundle. Each emits a list of canonical findings (per `canonical-finding-schema.md`).
2. **Aggregation phase (sequential):** The aggregator (resolved per the FR-MR15 strict-total-order tier table; D17) consolidates findings through a 6-stage pipeline:
   - Stage 1 — fingerprint dedup by `finding_id` (FR-MR14)
   - Stage 2 — lexical Jaccard merge within `(file, symbol)` buckets (FR-MR14)
   - Stage 3 — embedding-based semantic dedup (Phase 7 follow-up; not in v1)
   - Stage 4 — LLM tiebreaker, **bounded** by D18 pre-filter + per-consolidation max-calls cap
   - Stage 5 — severity reconciliation (FR-MR14a)
   - Stage 5b — contradiction scan + Chain-of-Verification adjudication (FR-MR14)
   - Stage 6 — minority-of-one demotion (FR-MR14b; security-exempt)

v1 ships Stages 1, 2, 4, 5, 5b, 6. Stage 3 lands in Phase 7 alongside `llm embed` integration.

### Why proposer-plus-aggregator (not pairwise debate or majority vote)

Multi-model debate adds latency without clear quality lift on review tasks. Majority vote on findings produces false negatives — a single proposer's correct rare finding gets outvoted. The aggregator pattern preserves single-source signal while consolidating duplicates.

---

## 2. Native vs. External Distinction

Both kinds of proposer emit canonical findings; the orchestrator treats them uniformly. The distinction is operational:

| Aspect | Native sub-agents | External adapters |
|--------|------------------|-------------------|
| Family | Anthropic (host Claude session) | Configured per adapter (`openai`, `google`, `local-<model>`, etc.) |
| Invocation | Task tool → sub-agent | Bash subprocess via adapter `*-review-prompter.md` |
| Context | Full host-session context + bundle | Bundle only (CLI surface area) |
| Failure mode | Sub-agent error → captured in unified envelope | `cli_missing` / `cli_auth_failed` / `parse_failed` per FR-MR16 |
| Source attribution | `source.source_type: "native-team"` | `source.source_type: "external"` |
| Recovery | Re-spawn from host (FR-MMT24 in standing-pool path) | Surface error_code; FR-MR17 native-only continuation |

Per FR-MR17, when **all** externals fail, the orchestrator continues with native-only findings and emits a warning. When **all** natives fail (with `include_native_reviewers: true`), the orchestrator emits a critical warning and stops — no consolidation possible (Task 23b).

---

## 3. Parallel Fan-Out (FR-MR12, D6)

Native + external proposers run in **a single parallel Task batch** — one batch dispatch, all proposers resolve concurrently. This is the structural foundation for FR-MR17's native-only continuation: when an external fails, the natives' findings are already in hand because they ran in the same batch.

Sequencing matters: the orchestrator MUST NOT serialize proposers, gate one on another, or fall back to a sequential pattern when an early proposer errors. The single-batch property is verified by raw-string match on the orchestrator's `.md` (Task 23 structural assertion) and by Layer 3 wall-clock check (Task 61a).

```
┌────────────────────────────────┐
│  multi-model-review-orchestrator│
└────────────┬───────────────────┘
             │ (single Task batch)
   ┌─────────┴────────┬──────────┬──────────┐
   ▼                  ▼          ▼          ▼
[native-1]      [native-2]   [codex]    [gemini]
 (Anthropic)     (Anthropic)  (openai)   (google)
   │                  │          │          │
   └──────┬───────────┴──────────┴──────────┘
          ▼
  [unified envelope]
          │
          ▼
  [aggregator (D17 tier table)]
          │
          ▼
  [consolidated findings]
```

### Per-reviewer timeouts

Each proposer is bound by a per-reviewer timeout. Timeouts surface as error envelopes (not orchestrator-level failures), so one slow proposer cannot block the rest of the batch from completing.

---

## 4. Context Bundle (D5, FR-MR28)

The context bundle is **the orchestrator's responsibility, executed once per invocation, identical for every proposer**. This eliminates per-reviewer drift: every proposer sees the same artifact, conventions, touched files, specs, and overview.

The `context-bundle-assembler` agent (Task 5, Haiku-backed) handles assembly:

1. Read artifact (the diff or plan being reviewed)
2. Read project conventions (CLAUDE.md, .eslintrc, .prettierrc, etc. per config)
3. Read touched files (full content where size permits; summarized where it doesn't)
4. Read referenced specs (filename-substring match per OQ-8; `context.spec_map` override)
5. Compose into a bundle ≤ `max_bundle_bytes`

When the artifact alone exceeds `max_bundle_bytes`, the assembler emits a "narrow scope" error rather than summarizing the artifact (the artifact is the thing under review — summarizing it would corrupt the review).

---

## 5. Audit Artifact (FR-MR24, D20)

Every multi-model invocation writes a self-contained audit artifact to `multi_model_review.audit.output_path` (default `docs/reviews/`). Filename pattern: `<YYYY-MM-DD>-<command>-<short-hash>.md`.

The audit writer (Task 39, Milestone 4.0) is **command-agnostic from day one** per D20: parameterized by command name and reused unchanged across `/review-code` and `/write-implementation-plan`. This eliminates the Phase 5 retrofit risk identified in cycle-1 review.

The audit captures:

1. Invocation metadata (command, target, timestamp)
2. Config snapshot (the resolved `multi_model_review` block)
3. Preflight result (per-CLI which/auth, family-diversity, aggregator selection)
4. Per-reviewer results (split native vs. external, with `usage` objects per NFR-MR4)
5. Consolidated findings with attribution (`raised_by[]`)
6. Aggregator trace (which stages fired, how many merges, any tiebreaker decisions)
7. Continuation events (FR-MR17 fallbacks, partial failures)

---

## 6. Forthcoming Docs

- **`adapter-contract.md`** (Task 4): Canonical adapter input/output envelope. Every adapter `.md` must conform.
- **`adapter-recipes.md`** (Task 50): Per-adapter install/auth/recommended-model/gotchas. Includes "writing a new adapter" guide per NFR-MR5.
- **`failure-modes.md`** (Task 51): All FR-MR16 error_code values; FR-MR17 continuation flows; cloud-surface remediation; aggregator-failure fallback.

The skeleton above provides the structural backbone these docs reference. Task 49 (Phase 6) replaces this skeleton with the full architecture, including:

- Cross-session lifetime and host-process model
- v1 vs. v2 scope explicitly enumerated
- Deferred-Stage-3 implementation path
- D17 tier table walked example
- Detailed proposer/aggregator failure path diagrams

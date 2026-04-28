## Status: Skeleton

# Multi-Model Teams — Architecture

> Initial architecture skeleton for the synthex-plus multi-model-teams feature. Adds two capabilities on top of the parent `multi-model-review` orchestrator: (1) **Feature A** — multi-model in `/team-review`; (2) **Feature B** — standing review pools for `/review-code` and `/performance-audit`. Replaced by Task 65's final pass.

## Related Documentation

- [`routing.md`](./routing.md) — discovery, submission, routing-mode reference (Task 31)
- [`recovery.md`](./recovery.md) — FR-MMT24 per-task fallback recovery (Task 48)
- [`pool-lifecycle.md`](./pool-lifecycle.md) — pool storage schemas, state machine, locking (Task 29)
- Parent: [`../multi-model-review/architecture.md`](../multi-model-review/architecture.md) — orchestrator + adapter layer that this plan builds on
- `standing-pools.md` (forthcoming user-facing doc, Task 68)

---

## 1. Overview

This plan adds two synthex-plus features on top of the v0.5.0 multi-model-review orchestrator:

**Feature A — Multi-model `/team-review`:** when `multi_model_review.per_command.team_review.enabled: true`, the synthex-plus `/team-review` command consolidates findings via the parent orchestrator instead of the team Lead agent. Native team-review reviewers PLUS external CLI adapters fan out in parallel; the orchestrator's full 6-stage consolidation pipeline produces the unified envelope. Bridge agent (`team-orchestrator-bridge`, Task 7) marshals between team-review's per-teammate finding shape and the orchestrator's input contract.

**Feature B — Standing review pools:** users can spawn long-running reviewer pools (`/start-review-team`) that survive across multiple `/review-code` and `/performance-audit` invocations. Subsequent invocations route to a matching pool via inline discovery (FR-MMT15) instead of spawning fresh reviewers. Pool lifecycle managed via three commands: `/start-review-team`, `/stop-review-team`, `/list-teams`. Storage at `~/.claude/teams/standing/<name>/`; coordinated via `.index.lock` mkdir-based locking (D27).

## 2. Feature A: Multi-Model in /team-review (FR-MMT1, FR-MMT3)

The team-review command currently runs reviewers as Synthex sub-agents under a Lead agent that consolidates. Feature A replaces the Lead's consolidation with the parent orchestrator's pipeline:

```
┌──────────────────────┐
│  /team-review        │
└──────┬───────────────┘
       │
       ▼ (when multi_model is true)
┌──────────────────────┐
│ team-orchestrator-   │  ← Task 7 bridge
│ bridge               │
└──────┬───────────────┘
       │ (per FR-MMT20 envelope)
       ▼
┌──────────────────────┐
│ multi-model-review-  │  ← parent orchestrator
│ orchestrator         │     (full 6-stage pipeline)
└──────┬───────────────┘
       │
       ▼
[unified consolidated envelope with raised_by[]]
```

The bridge's responsibility (FR-MMT4 / D22): marshal team-review's per-teammate finding inputs into the orchestrator's input contract (`command: "team-review"`, native_reviewers list, external adapters from config, context bundle); receive the unified envelope back; surface to the team-review caller.

## 3. Feature B: Standing Review Pools (FR-MMT5 — FR-MMT22)

Pools are persistent reviewer teams stored at `~/.claude/teams/standing/<name>/`. Each pool has:

- `config.json` — canonical state (roster, pool_state, multi_model flag, last_active_at, ttl_minutes)
- `index.json` — fast-lookup cache (read by inline discovery in <100ms per NFR-MMT3)
- Mailbox + task list directories for inter-Pool-Lead/teammate coordination

State machine (D27): `idle → active → draining → stopping → (gone)`. Stale pools (idle past TTL or whose host process died per FR-MMT7) are detected and cleaned up via `standing-pool-cleanup` agent.

### 3.1 Routing (FR-MMT15-17)

Submitting commands (`/review-code`, `/performance-audit`) read `index.json` inline (no sub-agent — NFR-MMT3 latency budget), filter by required-reviewer-set + matching_mode + ttl/state, and either route to a matching pool (via `standing-pool-submitter` agent) or fall back to fresh-spawn review per `routing_mode`. See `routing.md` for the full contract.

### 3.2 Submission + Recovery (FR-MMT16, FR-MMT24)

Tasks submitted atomically (`<uuid>.json.tmp` + rename); mailbox notification to Pool Lead; report-to path polled with backoff. On `status: failed` with `error_code: reviewer_crashed`, FR-MMT24 recovery spawns a fresh native sub-agent in the host session to replace the failed reviewer. See `recovery.md`.

### 3.3 Lifecycle (FR-MMT9-14)

Pools have a Pool Lead that manages task assignment, drain, and shutdown. Idle hour identity drift mitigated via FR-MMT5b unconditional re-read on each task claim. Shutdown signal triggers drain; pool exits cleanly when in-flight tasks complete or stuck-task timeout fires. See `pool-lifecycle.md`.

## 4. Audit Artifact Extensions (FR-MMT30, FR-MMT30a)

The parent's `audit-artifact-writer` adds three optional blocks for multi-model-teams:

- `team_metadata` — present when `/team-review` runs in multi-model mode
- `pool_routing` — REQUIRED on every audit emitted by routing-enabled commands; records routing_decision per FR-MMT30 enum
- `recovery` — present when FR-MMT24 fallback fired

Plus a fourth optional block per FR-MMT30a:

- `finding_attribution_telemetry` — gated by `multi_model_review.audit.record_finding_attribution_telemetry: true` (default true). Captures per-consolidated-finding `raised_by[]`, `consensus_count`, `minority_of_one` for post-hoc reliability analysis.

## 5. v1 Scope vs Future Work

v1 (this plan):
- Feature A: bridge + /team-review multi-model integration
- Feature B: 3 commands + lifecycle + routing + recovery + audit extensions

Future (post-v1):
- Plan-review and refine-requirements integrations (extension points referenced in routing.md §1.1)
- Cross-session pool sharing (only same-host in v1 per FR-MMT26)
- Layer 3 evals for team-review consolidation quality

## 6. Forthcoming Docs

- `standing-pools.md` (Task 68) — user-facing design doc covering all three commands + multi-model pool variant
- README + CLAUDE.md updates for synthex-plus (Tasks 69-71)

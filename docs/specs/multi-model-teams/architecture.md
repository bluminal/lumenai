## Status: Final

# Multi-Model Teams — Architecture

> Final architecture for the synthex-plus multi-model-teams feature. Adds two capabilities on top of the parent `multi-model-review` orchestrator: (1) **Feature A** — multi-model in `/team-review`; (2) **Feature B** — standing review pools for `/review-code` and `/performance-audit`. This document covers Option B rationale, the Feature A bridge mechanism (FR-MMT20), cross-session pool lifetime (FR-MMT5a), identity drift mitigation (FR-MMT5b), pool state machine, audit-artifact extensions (FR-MMT30/30a), and deferred Stage 3 inheritance.

## Related Documentation

- [`pool-lifecycle.md`](pool-lifecycle.md) — Pool state machine, storage layout, locking primitive, and lifecycle event sequence
- [`routing.md`](routing.md) — Pool discovery, TTL enforcement, routing mode semantics
- [`recovery.md`](recovery.md) — FR-MMT24 per-task recovery and native-recovery dedup partial pass
- [`standing-pools.md`](../../../plugins/synthex-plus/docs/standing-pools.md) — User-facing design guide for standing review pools
- [Parent: multi-model-review architecture](../../specs/multi-model-review/architecture.md) — Parent plan architecture reference

---

## 1. Overview

This plan adds two synthex-plus features on top of the v0.5.0 multi-model-review orchestrator:

**Feature A — Multi-model `/team-review`:** when `multi_model_review.per_command.team_review.enabled: true`, the synthex-plus `/team-review` command consolidates findings via the parent orchestrator instead of the team Lead agent. Native team-review reviewers PLUS external CLI adapters fan out in parallel; the orchestrator's full 6-stage consolidation pipeline produces the unified envelope. Bridge agent (`team-orchestrator-bridge`, Task 7) marshals between team-review's per-teammate finding shape and the orchestrator's input contract.

**Feature B — Standing review pools:** users can spawn long-running reviewer pools (`/start-review-team`) that survive across multiple `/review-code` and `/performance-audit` invocations. Subsequent invocations route to a matching pool via inline discovery (FR-MMT15) instead of spawning fresh reviewers. Pool lifecycle managed via three commands: `/start-review-team`, `/stop-review-team`, `/list-teams`. Storage at `~/.claude/teams/standing/<name>/`; coordinated via `.index.lock` mkdir-based locking (D27).

## 2. Option B — Orchestrator Beside the Team (FR-MMT1, FR-MMT3)

Three architectural options were evaluated for adding multi-model consolidation to `/team-review`:

- **Option A — Adapter wrappers on teammates:** wrap each native teammate as an adapter so the parent orchestrator can call them directly. Rejected because adapters are designed as one-shot CLI invocations; wrapping stateful sub-agents behind that interface breaks their conversation-context model and makes multi-turn interaction impossible.
- **Option B — Orchestrator beside the team (chosen):** a bridge agent (`team-orchestrator-bridge`) sits between the team-review caller and the parent orchestrator. The team's Lead retains its original workflow-management role (task assignment, turn scheduling, dependency tracking); the orchestrator handles only the consolidation phase it was designed for.
- **Option C — Lead absorbs orchestrator logic:** the Lead agent is extended to run the full 6-stage consolidation pipeline itself. Rejected because it conflates two distinct responsibilities — workflow coordination and finding consolidation — in a single agent, complicating both maintenance and the parent plan's upgrade path.

Option B was chosen because it preserves the clean separation established in the parent architecture (D3: Lead owns workflow, orchestrator owns consolidation) while adding zero new responsibilities to either existing agent.

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

## 3. Feature A Bridge — Two Consolidation Surfaces (FR-MMT4, FR-MMT20)

The bridge mechanism is the normative implementation of FR-MMT20, which requires that native reviewers emit findings as both the human-readable markdown teammates already produce **and** as a parallel JSON envelope in the canonical finding schema (FR-MR13). The dual-emit approach is critical: without it, the orchestrator would need a per-reviewer Haiku-backed normalizer to parse markdown into structured findings on the fly. That per-reviewer normalization introduces drift — each call to a small normalizer model produces slightly different field mappings, making `raised_by[]` attribution unreliable across consolidation runs.

By having native reviewers emit the JSON envelope alongside their markdown output, the bridge can forward structured findings directly to the orchestrator's input contract without any intermediate normalization step. This preserves the parent plan's guarantee that all proposers — native and external — enter the consolidation pipeline in identical shape. The two consolidation surfaces referred to in FR-MMT4 are: (1) the team Lead's existing per-teammate markdown consolidation (unchanged, still runs for backward-compatible output); and (2) the orchestrator's 6-stage pipeline (new, runs in parallel when multi-model is enabled).

## 4. Feature B: Standing Review Pools (FR-MMT5 — FR-MMT22)

Pools are persistent reviewer teams stored at `~/.claude/teams/standing/<name>/`. Each pool has:

- `config.json` — canonical state (roster, pool_state, multi_model flag, last_active_at, ttl_minutes)
- `index.json` — fast-lookup cache (read by inline discovery in <100ms per NFR-MMT3)
- Mailbox + task list directories for inter-Pool-Lead/teammate coordination

### 4.1 Cross-Session Lifetime and Host-PID Tracking (FR-MMT5a, FR-MMT22)

The cross-session constraint comes directly from FR-MMT5a: a standing pool must survive past the Claude Code session that created it and remain routable in subsequent sessions by the same user on the same host. This is why pools use `backendType: in-process` — the Pool Lead and teammates run as sub-agents of the spawning session's process, and the host process must remain alive for the pool to accept work. The `host_pid` field in `config.json` is the mechanism that makes orphan detection possible: when a submitting command's inline discovery finds a pool in `idle` or `active` state, it checks whether the recorded `host_pid` is still alive before routing to it (FR-MMT22). A pool whose host process has exited is stale; the `standing-pool-cleanup` agent marks it `removed` and the fallback path takes over. This avoids the failure mode of silently routing work to a pool that will never report back.

State machine (D27): `idle → active → draining → stopping → (gone)`. Stale pools (idle past TTL or whose host process died per FR-MMT7) are detected and cleaned up via `standing-pool-cleanup` agent. See [`pool-lifecycle.md`](pool-lifecycle.md) for the full state machine, storage schemas, and locking contract.

### 4.2 Routing (FR-MMT15-17)

Submitting commands (`/review-code`, `/performance-audit`) read `index.json` inline (no sub-agent — NFR-MMT3 latency budget), filter by required-reviewer-set + matching_mode + ttl/state, and either route to a matching pool (via `standing-pool-submitter` agent) or fall back to fresh-spawn review per `routing_mode`. See [`routing.md`](routing.md) for the full contract.

### 4.3 Submission + Recovery (FR-MMT16, FR-MMT24)

Tasks submitted atomically (`<uuid>.json.tmp` + rename); mailbox notification to Pool Lead; report-to path polled with backoff. On `status: failed` with `error_code: reviewer_crashed`, FR-MMT24 recovery spawns a fresh native sub-agent in the host session to replace the failed reviewer. See [`recovery.md`](recovery.md).

### 4.4 Lifecycle (FR-MMT9-14)

Pools have a Pool Lead that manages task assignment, drain, and shutdown. See [`pool-lifecycle.md`](pool-lifecycle.md) for the normative lifecycle event sequence, writer-ordering rules, and locking primitive.

## 5. Identity Drift Mitigation (FR-MMT5b)

Long-lived pools introduce a risk specific to sub-agent architectures: compaction. Claude Code's context compaction can summarize conversation history and replace earlier messages, including the sub-agent's spawn prompt, with a compressed summary. When the spawn prompt is replaced, the sub-agent loses the precise role definition it was initialized with — its behavior drifts toward generic assistant responses rather than specialized reviewer behavior. This was documented in D26.

FR-MMT5b's mitigation is unconditional re-read on each task claim: before a Pool Lead assigns a task to a teammate, it re-reads the teammate's full role definition from its source file (not from conversation history). This means the role definition lives in the filesystem rather than in conversation history, so compaction cannot remove it. The re-read happens at claim time, not at spawn time, because spawn-time injection into the system prompt would be lost along with the rest of the system prompt if the process were resumed after compaction. Injecting at each task claim is the one point in the lifecycle that is guaranteed to occur after any compaction event.

## 6. Audit Artifact Extensions (FR-MMT30, FR-MMT30a)

The parent's `audit-artifact-writer` adds three optional blocks for multi-model-teams. These extensions are additive — they do not change the parent's audit schema for commands that do not use multi-model-teams features. Full schema definitions and writer contracts are in Task 61 (audit-artifact-writer update spec).

- `team_metadata` — present when `/team-review` runs in multi-model mode
- `pool_routing` — REQUIRED on every audit emitted by routing-enabled commands; records routing_decision per FR-MMT30 enum
- `recovery` — present when FR-MMT24 fallback fired

Plus a fourth optional block per FR-MMT30a:

- `finding_attribution_telemetry` — gated by `multi_model_review.audit.record_finding_attribution_telemetry: true` (default true). Captures per-consolidated-finding `raised_by[]`, `consensus_count`, `minority_of_one` for post-hoc reliability analysis.

## 7. Deferred Stage 3 Inheritance

The parent plan's 6-stage consolidation pipeline defers Stage 3 (embedding-based semantic dedup) to Phase 7 of the parent roadmap. This plan inherits that deferral: when the parent implements Stage 3, standing pool consolidation (Feature A) gains it automatically because both use the same orchestrator pipeline. No additional work is required in this plan to enable Stage 3 for team-review; it will be enabled by the parent's Phase 7 implementation. See [parent architecture](../../specs/multi-model-review/architecture.md) §2 for the full pipeline stage breakdown.

## 8. Inherited Architecture

This plan builds directly on top of the proposer-plus-aggregator design documented in [`docs/specs/multi-model-review/architecture.md`](../../specs/multi-model-review/architecture.md). The key inherited invariants are:

- All proposers (native sub-agents and external CLI adapters) emit findings in the canonical finding schema (FR-MR13) before entering the consolidation pipeline.
- The aggregator tier is resolved per the FR-MR15 strict-total-order tier table (D17): flagship models consolidate, never fast/cheap models.
- The `raised_by[]` attribution in the consolidated envelope is preserved end-to-end; this plan extends it with `consensus_count` and `minority_of_one` via FR-MMT30a.
- Stage 3 (embedding dedup) is deferred in both the parent and this plan; all other stages run in v1.

Operators who have configured the parent feature (`multi_model_review.enabled: true`) in `.synthex/config.yaml` do not need additional configuration to use Feature B's standing pools. Feature A (`per_command.team_review.enabled: true`) requires the additional per-command flag documented in the routing section.

## 9. v1 Scope vs Future Work

v1 (this plan):
- Feature A: bridge + /team-review multi-model integration
- Feature B: 3 commands + lifecycle + routing + recovery + audit extensions

Future (post-v1):
- Plan-review and refine-requirements integrations (extension points referenced in routing.md §1.1)
- Cross-session pool sharing (only same-host in v1 per FR-MMT26)
- Layer 3 evals for team-review consolidation quality

## 10. Forthcoming Docs

- `standing-pools.md` (Task 68) — user-facing design doc covering all three commands + multi-model pool variant
- README + CLAUDE.md updates for synthex-plus (Tasks 69-71)

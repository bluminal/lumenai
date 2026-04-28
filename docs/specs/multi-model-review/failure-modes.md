# Failure Modes — Graceful Degradation & Recovery

> Reference for every failure mode in the multi-model review pipeline. Documents error codes, continuation paths, strict mode, cloud-surface remediation, and aggregator-failure fallback.

## Status: Final

## Related Docs

- [`adapter-contract.md`](./adapter-contract.md) — error_code enum source of truth (FR-MR16)
- [`architecture.md`](./architecture.md) — overall pipeline + failure-handling section
- [`adapter-recipes.md`](./adapter-recipes.md) — per-adapter known gotchas

---

## 1. Graceful Degradation Principle

Multi-model review is **off by default** and **fail-soft when on**. The default failure response is graceful degradation — continue with whatever proposers responded successfully, surface a warning, and record the failure in the audit artifact.

The exceptions are:
1. **Strict mode** — fail-hard if any proposer fails (configurable via `multi_model_review.strict_mode: true`)
2. **All natives failed** — CRITICAL stop (cannot consolidate; per FR-MR17)
3. **Cloud surface** — single remediation message instead of per-CLI cascade

---

## 2. error_code Enum (FR-MR16)

When an adapter returns `status: "failed"`, `error_code` MUST be one of these 7 values:

| Value | Meaning | Trigger | Retry behavior |
|-------|---------|---------|---------------|
| `cli_missing` | Adapter's CLI not installed or not in PATH | `which <cli>` returns non-zero | Terminal — no retry |
| `cli_auth_failed` | CLI installed but not authenticated | Adapter-specific auth check fails | Terminal — no retry |
| `cli_failed` | CLI ran but returned non-zero exit | Subprocess exited non-zero | NOT auto-retried; surfaces to FR-MR17 |
| `parse_failed` | CLI output unparseable into canonical envelope | JSON parse error or schema mismatch after retry | One retry with appended clarification; then terminal |
| `timeout` | Adapter exceeded per-reviewer timeout | Per-reviewer timeout fires | NOT auto-retried; surfaces to FR-MR17 |
| `sandbox_violation` | CLI attempted operation forbidden by sandbox | Sandbox enforcement | Terminal — no retry |
| `unknown_error` | Catch-all for unexpected failures | Last-resort fallback | NOT auto-retried |

**Adapters MUST NOT introduce new error_code values.** Any new failure mode requires updating FR-MR16 AND `adapter-contract.md`.

---

## 3. FR-MR17 Native-Only Continuation

When **all configured external adapters fail** (every external returns `status: "failed"` for any reason), the orchestrator emits this verbatim warning and continues with native-only consolidation:

> `"All external reviewers failed; continuing with natives only"`

Set `continuation_event.type = "all-externals-failed"` in the unified envelope. Native findings are still valid; consolidation runs on natives only.

### Strict mode override

When `multi_model_review.strict_mode: true`, the orchestrator does NOT continue on partial external failure. It blocks with a strict-mode-violated error instead. Default strict_mode is `false` (per FR-MR18).

### Audit recording

The audit artifact's continuation_event section records:
- Per-external `error_code`
- Verbatim warning text
- Whether the consolidated review proceeded

---

## 4. All-Natives-Failed CRITICAL Path

When **all native reviewers fail** AND `include_native_reviewers: true`, the orchestrator emits this verbatim CRITICAL warning and STOPS:

> `"All native Synthex reviewers failed. Cannot continue — multi-model review has no findings to consolidate. Check sub-agent error logs."`

This warning is DISTINCT from the all-externals-failed warning. The unified envelope has `continuation_event.type = "all-natives-failed"`, `findings: []`, and the CRITICAL warning surfaces in the audit artifact.

The reasoning: if natives failed, the safety net (FR-MR17 fallback to native-only) is gone. Continuing with externals only could surface findings the user has no native baseline for; better to stop and surface the failure.

---

## 5. Cloud-Surface Remediation (NFR-MR2)

When the orchestrator runs on a cloud surface where ALL `which <cli>` checks fail (no host bash; cloud/web environment), it emits a SINGLE remediation message — NOT a per-CLI cascade:

> `"Multi-model review cannot run on this surface — no external review CLIs are available. See docs/specs/multi-model-review/adapter-recipes.md for setup, or run on a host with the configured CLIs installed."`

Set `continuation_event.type = "cloud-surface-no-clis"`. The audit's `per_reviewer_results` still records each external as `error_code: cli_missing` (for audit purposes), but the user-visible event is the single remediation.

---

## 6. Aggregator-Failure Fallback (Q6, OQ-6)

When the resolved aggregator (per D17 tier table) FAILS at runtime — e.g., the chosen external CLI errors out mid-aggregation — fall back to the **host Claude session** as the aggregator (per Q6 = (b)).

This is distinct from the D17 tier-walk-empty case (where no flagship matches the configured proposer set; same fallback applies — host session). Q6 specifically addresses the case where a TIER-RESOLVED aggregator FAILS at runtime.

The host-fallback aggregator runs with the same judge-mode system prompt (inline). The audit `aggregator_resolution.source` field records the fallback:
- `tier-table` — original D17 resolution (this fails)
- `host-fallback` — fallback after tier-resolved aggregator failed (post-Q6 fallback)

---

## 7. Strict Mode (FR-MR18)

`multi_model_review.strict_mode: false` (default per D12) — graceful degradation across all failure modes.

`multi_model_review.strict_mode: true` — fail-hard on:
- Any external returning `status: "failed"` (no native-only continuation)
- Family diversity below `min_family_diversity` at preflight
- `min_proposers_to_proceed` not met at preflight
- Aggregator resolution failure at runtime

Strict mode is intended for production code-review pipelines where partial coverage is unacceptable. Most users want default (lenient) mode.

---

## 8. Failure-Mode Decision Tree

```
Adapter returns status: "failed" with error_code: <X>
  ├── Is strict_mode enabled?
  │   ├── Yes → fail-hard with strict-mode-violated error
  │   └── No → continue to next branch
  ├── Is this the LAST external? (i.e., all others also failed)
  │   ├── Yes → emit FR-MR17 warning + set continuation_event.type = "all-externals-failed" + native-only consolidation
  │   └── No → record in per_reviewer_results; consolidate available
  └── Is this a native sub-agent? AND all other natives also failed AND include_native_reviewers: true?
      ├── Yes → emit CRITICAL warning + set continuation_event.type = "all-natives-failed" + STOP
      └── No → record in per_reviewer_results; consolidate available
```

Cloud-surface (all `which <cli>` fail) is a separate pre-fan-out check; the decision tree above doesn't apply.

---

## Source Authority

- FR-MR16 (error_code enum — 7 values; no new values permitted)
- FR-MR17 (native-only continuation; all-externals-failed; all-natives-failed CRITICAL stop; cloud-surface)
- FR-MR18 (strict_mode default false; fail-hard conditions)
- NFR-MR2 (cloud-surface single remediation — not per-CLI cascade)
- D12 (strict_mode default)
- D17 (aggregator tier table; host-fallback when tier-walk yields no match)
- Q6 / OQ-6 (aggregator runtime failure → host-fallback; answer = (b))
- [`adapter-contract.md`](./adapter-contract.md) — canonical error_code table (FR-MR16 source of truth)
- `multi-model-review-orchestrator.md` Step 6 — FR-MR17 verbatim warning texts and continuation logic

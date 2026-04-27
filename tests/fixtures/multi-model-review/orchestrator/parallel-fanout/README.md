# Parallel Fan-Out Fixture

Layer 2 fixture for the multi-model review orchestrator's single-batch parallel
dispatch (FR-MR12 / D6). Tests that a 2-native + 2-external proposer configuration
produces a unified envelope containing all 4 reviewers' findings.

## Wall-Clock Verification — Deferred to Milestone 7.3 Task 61a

> **NOTE:** This fixture does NOT verify real wall-clock parallelism.
> Cached/promptfoo fixtures replay at near-zero latency and cannot distinguish
> a truly parallel batch from sequential serial dispatch.
>
> Wall-clock fan-out verification is deferred to **Milestone 7.3 Task 61a**.
> That task will instrument live orchestrator invocations and assert that the
> total elapsed time is bounded by `max(per_reviewer_latency) + collation_overhead`
> rather than `sum(per_reviewer_latency)`.

## What This Fixture Does Cover

- Structural assertion: `plugins/synthex/agents/multi-model-review-orchestrator.md`
  contains the FR-MR12 verbatim phrase `"single parallel Task batch"`.
- Output assertion: `expected_envelope.json` has exactly 4 entries in
  `per_reviewer_results` (2 `native-team` + 2 `external`) and 7 findings total.
- Every finding carries proper `source` attribution (`reviewer_id`, `family`,
  `source_type`) matching one of the 4 proposers.
- `path_and_reason_header` matches the D21 regex.
- `aggregator_resolution` resolves to `codex-review-prompter` via `tier-table`.
- `continuation_event` is `null` (all proposers succeeded; no failure path triggered).

## Related Tasks

- **Task 21** — Preflight (Step 0) implementation in the orchestrator agent
- **Task 22** — `orchestrator-output.ts` schema validator
- **Task 23a** — all-externals-failed continuation fixture
- **Task 23b** — all-natives-failed continuation fixture
- **Task 23c** — cloud-surface-no-clis continuation fixture
- **Milestone 7.3 Task 61a** — Wall-clock fan-out latency verification (deferred)

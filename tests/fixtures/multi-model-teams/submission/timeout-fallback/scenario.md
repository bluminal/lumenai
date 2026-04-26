# Scenario: timeout-fallback

## Summary

The standing-pool-submitter submits tasks to `slow-pool` and enters its polling loop.
The pool never writes a report envelope to the report-to path within the configured
`submission_timeout_seconds` (30s). The elapsed time (35s) exceeds the timeout. The
submitter executes the timeout path defined in FR-MMT16a §3.4.

## What This Fixture Tests

### Polling timeout triggers the fallback path

The submitter polls the report-to path (`~/.claude/tasks/standing/slow-pool/reports/<report_uuid>.json`)
every 2 seconds with exponential backoff (max 10 seconds between polls), per FR-MMT16a §3.4.
When `elapsed_seconds` (35) exceeds `submission_timeout_seconds` (30), the polling loop exits
and the timeout path fires.

### Tasks are marked abandoned on timeout

Before returning the fallback routing decision, the submitter writes `"status": "abandoned"`
to each submitted task file using the `.tmp` + rename atomic pattern (FR-MMT16a §3.4 step 1).
This allows the Pool Lead to detect in-flight tasks that the caller is no longer waiting on
and stop work on them.

### Verbatim one-line timeout note is emitted (FR-MMT16a §3.4 step 3)

The submitter emits exactly:

```
Pool 'slow-pool' did not return a report within 30s; falling back to fresh-spawn review.
```

The note substitutes `{name}` with `pool_name` ("slow-pool") and `{timeout}` with
`submission_timeout_seconds` (30). The verbatim text is specified in
`plugins/synthex-plus/agents/standing-pool-submitter.md` Step 6 and
`docs/specs/multi-model-teams/routing.md` §3.4.

### Routing decision is `fell-back-timeout`

The submitter returns `{ "routing_decision": "fell-back-timeout" }`. This is one of the
seven routing decision values in ROUTING_DECISION_VALUES (standing-pool-cleanup.ts).

### Calling command treats this as fallback and spawns fresh reviewers

The calling command (`/synthex:review-code` or `/synthex:performance-audit`) receives
`fell-back-timeout` and, under `prefer-with-fallback` routing mode, proceeds to spawn
fresh sub-agents for the required reviewers. The user experience is equivalent to a
no-pool fallback — the pool submission was attempted but the pool was too slow.

## Inputs

- `pool_name`: "slow-pool"
- `pool_roster`: ["code-reviewer", "security-reviewer"]
- `pool_state`: "idle" (pool was found healthy at discovery time)
- `submission_timeout_seconds`: 30
- `submitted_tasks`: two tasks (Code review, Security review)
- `pool_response`: "none" — the pool never writes a report envelope
- `elapsed_seconds`: 35 — exceeds the 30s timeout

## Expected Outputs

- `routing_decision`: "fell-back-timeout"
- `tasks_marked_abandoned`: true — all submitted tasks have `status: "abandoned"` written back
- `verbatim_timeout_note`: `"Pool 'slow-pool' did not return a report within 30s; falling back to fresh-spawn review."`
- `fresh_spawn_triggered`: true — caller proceeds with fresh reviewer sub-agents

## Assertions

- `expected.routing_decision === "fell-back-timeout"`
- `expected.routing_decision` is in ROUTING_DECISION_VALUES
- `expected.tasks_marked_abandoned === true`
- `expected.verbatim_timeout_note` matches the pattern from standing-pool-submitter.md Step 6
- `expected.fresh_spawn_triggered === true`
- `setup.elapsed_seconds > setup.submission_timeout_seconds` (fixture is internally consistent)
- `plugins/synthex-plus/agents/standing-pool-submitter.md` contains the verbatim timeout note

## Acceptance Criteria Covered

- FR-MMT16a §3.4 step 1: tasks are marked abandoned on timeout
- FR-MMT16a §3.4 step 3: verbatim one-line note is emitted with correct substitution
- FR-MMT16a §3.4: routing decision `fell-back-timeout` is returned
- `fell-back-timeout` is a valid member of ROUTING_DECISION_VALUES
- Fixture is internally consistent: elapsed > timeout

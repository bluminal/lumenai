# Scenario (b): wip-multi-model-disabled

## Overview

A draft implementation plan is submitted with `multi_model_review.enabled: false`.
The command falls through to the native-only path: the orchestrator is not invoked,
no external adapters are called, and the output should be byte-identical to the
redacted Task 0 baseline captured before the multi-model-review feature was integrated.

## Decision-Flow

- Config check: `multi_model_review.enabled === false` → skip orchestrator
- Command continues with native reviewers only: architect, design-system-agent, tech-lead
- No audit artifact written (audit disabled when multi_model_review is off)
- Output format identical to pre-MMR baseline

## FR-MR23 Regression Check

This fixture serves as the regression baseline for FR-MR23: disabling multi-model review
must produce output that is structurally and semantically equivalent to the Task 0 snapshot.
Empirical byte-identity is deferred to runtime; the fixture asserts the intent.

The Task 0 baseline is located at:
`tests/__snapshots__/multi-model-review/baseline/write-implementation-plan-baseline.snapshot.md`

## Assertions

- `orchestrator_invoked: false`
- `native_only_path: true`
- `byte_identical_to_baseline: true` (fixture-level assertion; runtime verification required)
- `baseline_snapshot_path` exists on disk

## Fixture Files

| File | Purpose |
|------|---------|
| `fixture.json` | Input config, expected outcomes + baseline snapshot path |
| `scenario.md` | This document |

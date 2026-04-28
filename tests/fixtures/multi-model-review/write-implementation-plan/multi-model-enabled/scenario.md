# Scenario (a): wip-multi-model-enabled

## Overview

A draft implementation plan is submitted for review with `multi_model_review.enabled: true`
and `per_command.write_implementation_plan.enabled: true`. The command is
`/synthex:write-implementation-plan` with both `requirements_path` and `draft_plan_path`
inputs supplied.

## Orchestrator Dispatch

Since multi-model is globally enabled and enabled for the `write_implementation_plan` command,
the orchestrator is invoked with the full reviewer set:

**Native reviewers (3):** architect, design-system-agent, tech-lead  
**External adapters (2):** codex-review-prompter (openai), gemini-review-prompter (google)

All five reviewers receive the plan context bundle and return findings independently.

## Expected Behavior

- `path_and_reason_header`: `"Review path: multi-model (plan review; reviewers: 3 native + 2 external)"`
- Three native reviewers run in parallel: architect, design-system-agent, tech-lead
- Two external adapters invoked: codex-review-prompter + gemini-review-prompter
- All five complete successfully; 6 findings consolidated
- PM receives the unified consolidated envelope with attribution from both native (anthropic)
  and external (openai/google) families
- `audit_file_written: true` — an audit artifact is written to `docs/reviews/`
- `continuation_event`: null

## Finding Attribution

One finding (`plan.missing-rollback-strategy`) is raised by both architect (native) and
codex-review-prompter (external), demonstrating cross-family convergence. Its `raised_by`
array carries entries for both sources — mixed attribution.

Other findings are each raised by a single reviewer:
- `plan.underdefined-data-migration` → architect
- `plan.design-token-gap` → design-system-agent
- `plan.acceptance-criteria-vague` → tech-lead
- `plan.missing-rollback-strategy` (external view) → codex-review-prompter
- `plan.missing-monitoring-observability` → gemini-review-prompter

## Assertions

- `orchestrator_invoked: true`
- `per_reviewer_results` has exactly 5 entries (3 native + 2 external)
- All 3 native reviewers (`architect`, `design-system-agent`, `tech-lead`) present in per_reviewer_results
- Both external adapters present in per_reviewer_results
- `findings` array has 6 entries
- At least one finding's `raised_by` array contains entries from BOTH anthropic AND openai/google families
- `validateOrchestratorOutput` passes on the envelope
- Audit file expected at path matching `<YYYY-MM-DD>-write-implementation-plan-<hash>.md`

## Fixture Files

| File | Purpose |
|------|---------|
| `fixture.json` | Input config, expected outcomes |
| `expected_envelope.json` | Expected unified envelope (5 per_reviewer_results, 6 findings) |
| `scenario.md` | This document |
| `audit-file-sample.md` | Sample audit artifact for Task 46 audit-reuse assertion |

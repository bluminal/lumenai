# Fixture (f): external-aggregator-judge-mode

## What this tests

When `aggregator.command` resolves to an external adapter (`codex-review-prompter`), the orchestrator's Step 8g bias-mitigation logic packages the judge-mode system prompt into the adapter Task call's `config.judge_mode_prompt` field.

## Setup

- `aggregator.command: codex-review-prompter` (explicitly configured — "configured" source, not tier-table)
- 4 consolidated findings ready for aggregation in `src/payments/checkoutFlow.ts`
- The orchestrator must produce a Task call to `codex-review-prompter` with `judge_mode_prompt` in the config

## Expected behavior (Step 8g, external-aggregator path)

1. Aggregator resolves to `codex-review-prompter` (source: "configured").
2. Orchestrator prepares the FR-MR9 input envelope for the codex adapter.
3. Into the `config` block of that envelope, orchestrator injects:
   ```json
   "judge_mode_prompt": "You are acting as an impartial judge consolidating findings from multiple reviewers. Evaluate each finding on its merits, free of attribution bias. Position randomization has been applied to the input."
   ```
4. The recorded Task call in `recorded-task-call.json` contains this field at `task_call.input.config.judge_mode_prompt`.

## Acceptance assertions

- `recorded-task-call.json` exists and is valid JSON
- `recorded_task_call.task_call.input.config.judge_mode_prompt` is a non-empty string
- `judge_mode_prompt` value exactly matches the text documented in `plugins/synthex/agents/multi-model-review-orchestrator.md`
- `plugins/synthex/agents/multi-model-review-orchestrator.md` contains the literal string `judge_mode_prompt`
- `plugins/synthex/agents/multi-model-review-orchestrator.md` contains "external-aggregator" or "external adapter" path documentation

## FR/Spec reference

- FR-MR15: Aggregator bias mitigation — Step 8g external-aggregator path
- Task 31: Aggregator bias mitigation implementation
- Task 32(f): This fixture

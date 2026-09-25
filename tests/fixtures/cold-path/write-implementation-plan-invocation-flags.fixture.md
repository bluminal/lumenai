### Invocation Flags (FR-MR6)

The command accepts two mutually exclusive flags:
- `--multi-model` — force multi-model plan review regardless of config
- `--no-multi-model` — force native-only plan review regardless of config

Flag value overrides BOTH the master `multi_model_review.enabled` config AND the per-command `multi_model_review.per_command.write_implementation_plan.enabled` config.

When neither flag is set, the resolved config determines the path. **No complexity gate is consulted (FR-MR22)** — when multi-model is enabled (by config or flag), the orchestrator runs.

> **Contrast with `review-code`:** `review-code` has a complexity gate (FR-MR21a) that can skip multi-model for trivial diffs. `write-implementation-plan` has NO complexity gate — plans are always substantive enough to warrant full multi-model review when enabled. This distinction is explicit per FR-MR22.

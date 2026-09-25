# Multi-Model Plan Review — Invocation Flags and Orchestrator Contract (FR-MR6, FR-MR22)

Cold-path detail for `/synthex:write-implementation-plan` (FR-HM5, D17, Task 14). Read when multi-model plan review is active — see "Step 6a: Resolve Multi-Model Branch" in `plugins/synthex/commands/write-implementation-plan.md`, which also keeps Steps 1-5.5 and the native-only reviewer path (FR-MR23, byte-identical to baseline). This is not a standalone command — it has no frontmatter and is never registered in `plugin.json`.

### Invocation Flags (FR-MR6)

The command accepts two mutually exclusive flags:
- `--multi-model` — force multi-model plan review regardless of config
- `--no-multi-model` — force native-only plan review regardless of config

Flag value overrides BOTH the master `multi_model_review.enabled` config AND the per-command `multi_model_review.per_command.write_implementation_plan.enabled` config.

When neither flag is set, the resolved config determines the path. **No complexity gate is consulted (FR-MR22)** — when multi-model is enabled (by config or flag), the orchestrator runs.

> **Contrast with `review-code`:** `review-code` has a complexity gate (FR-MR21a) that can skip multi-model for trivial diffs. `write-implementation-plan` has NO complexity gate — plans are always substantive enough to warrant full multi-model review when enabled. This distinction is explicit per FR-MR22.

### Step 6a — Multi-Model Active: Invoke Orchestrator

**Multi-model active → invoke orchestrator:**

When multi-model is active, invoke the `multi-model-review-orchestrator` agent with:
- `command: "write-implementation-plan"`
- `artifact_path` = the current draft plan path
- `native_reviewers: ["architect", "design-system-agent", "tech-lead"]` (the three native plan reviewers)
- `config` = the resolved `multi_model_review` block (from `.synthex/config.yaml` merged onto `defaults.yaml`)
- `per_reviewer_timeout_seconds` = from `multi_model_review.per_reviewer_timeout_seconds` config (default 180)

The orchestrator fans out to the three native reviewers AND all configured external adapters in a single parallel Task batch (FR-MR12), runs the full consolidation pipeline (Stages 1, 2, 4, 5, 5b, 6), and returns a unified consolidated envelope with `findings[]` attributed by reviewer.

Receive the unified consolidated envelope and pass its consolidated findings list directly to the Product Manager (Step 6d). The PM receives a single consolidated findings list with attribution — it does NOT process raw per-reviewer outputs.

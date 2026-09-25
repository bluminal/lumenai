**Multi-model active → invoke orchestrator:**

When multi-model is active, invoke the `multi-model-review-orchestrator` agent with:
- `command: "write-implementation-plan"`
- `artifact_path` = the current draft plan path
- `native_reviewers: ["architect", "design-system-agent", "tech-lead"]` (the three native plan reviewers)
- `config` = the resolved `multi_model_review` block (from `.synthex/config.yaml` merged onto `defaults.yaml`)
- `per_reviewer_timeout_seconds` = from `multi_model_review.per_reviewer_timeout_seconds` config (default 180)

The orchestrator fans out to the three native reviewers AND all configured external adapters in a single parallel Task batch (FR-MR12), runs the full consolidation pipeline (Stages 1, 2, 4, 5, 5b, 6), and returns a unified consolidated envelope with `findings[]` attributed by reviewer.

Receive the unified consolidated envelope and pass its consolidated findings list directly to the Product Manager (Step 6d). The PM receives a single consolidated findings list with attribution — it does NOT process raw per-reviewer outputs.

**Step 4 — Complexity gate (FR-MR21a)**

If multi-model is enabled at this point, evaluate the complexity gate (see "### Complexity Gate (FR-MR21a)" below):
- If the diff is classified as **trivial** by the gate AND no `--multi-model` flag was passed → take the **native-only branch** (multi-model branch is a no-op for this invocation, per FR-MR21a).
- The `--multi-model` flag bypasses the gate entirely — if the flag is set, skip directly to Step 5.

**Step 5 — Multi-model branch: invoke orchestrator**

Else (multi-model enabled AND gate passes, or `--multi-model` flag set) → take the **multi-model branch**: invoke the `multi-model-review-orchestrator` agent.

When the decision framework selects the multi-model branch, invoke the `multi-model-review-orchestrator` agent (Task 19) with the resolved input contract:
- `command: "review-code"`
- `artifact_path` from the target parameter
- `touched_files` computed from the diff
- `native_reviewers` from `code_review.reviewers` config (or `--reviewers` flag)
- `config`: the resolved `multi_model_review` block
- `per_reviewer_timeout_seconds`: from `multi_model_review.per_reviewer_timeout_seconds` (default 180)

The orchestrator returns the unified consolidated envelope. Render its `report` field as the command's final output, prefixed with the path-and-reason header per D21 (Step 7 below).

Native-only branch continues to call today's review-code logic byte-identically (FR-MR23 regression — verified by Task 38(a) snapshot diff against Task 0 baseline).

**Step 6 — Cache the gate decision (D9)**

The gate decision computed in Steps 1–4 is cached for the entire review-loop's duration. Subsequent cycles within the same review-loop invocation reuse the cached decision without re-evaluating the complexity gate. This prevents oscillation when the diff hasn't changed but the loop iterates (e.g., re-reviews after fixes).

**Step 7 — Render path-and-reason header (D21)**

Render the **path-and-reason header** per the D21 spec (see "### Path-and-Reason Header Spec (D21)" below). This header is prepended to the command's final output regardless of which branch was taken.

**Step 8 — Emit consolidated review**

Emit the consolidated review per the chosen branch:
- **Multi-model branch:** surface the orchestrator's `report` field, prefixed with the D21 header.
- **Native-only branch:** surface the review from the native workflow, prefixed with the D21 header.


# Multi-Model Review Decision Framework — Steps 4-8 and Complexity Gate (FR-MR21, FR-MR21a)

Cold-path detail for `/synthex:review-code`'s FR-MR21 8-step decision order (FR-HM5, D17). Read only when multi-model review is enabled after Steps 1-3 (config + flags) resolve; the gate that includes this file, plus Steps 1-3, the Invocation Flags (FR-MR6), and the Path-and-Reason Header Spec (D21), live at `plugins/synthex/commands/review-code.md`. This is not a standalone command — it has no frontmatter and is never registered in `plugin.json`.

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

---

### Complexity Gate (FR-MR21a)

The complexity gate decides whether multi-model review is warranted for a given diff. Read from `multi_model_review.per_command.review_code.complexity_gate`:
- `threshold_lines_changed: 50` (default)
- `threshold_files_touched: 3` (default)
- `always_escalate_paths: [<glob list>]` — paths that ALWAYS escalate to multi-model regardless of size

**Decision:**
1. Compute `lines_changed` and `files_touched` from the diff
2. Check `always_escalate_paths` — if ANY changed file matches ANY glob, ESCALATE to multi-model immediately
3. Otherwise: if `lines_changed >= threshold_lines_changed` OR `files_touched >= threshold_files_touched` → multi-model
4. Otherwise → native-only

**Cached for the loop's duration (D9):** The gate decision is computed ONCE at the start of the review and cached for all cycles within the same review-loop invocation. This prevents oscillation when the diff hasn't changed but the loop iterates (e.g., re-reviews after fixes).


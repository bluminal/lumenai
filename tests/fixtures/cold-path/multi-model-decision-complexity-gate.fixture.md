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


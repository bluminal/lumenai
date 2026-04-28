# Fixture: multi-model-disabled

Same 2 native reviewers as multi-model-enabled, but multi_model=false.

Key assertions (regression):
- No multi-model-review-orchestrator Task invocation (FR-MMT3 criterion 8)
- Composed reviewer spawn prompts do NOT contain FR-MMT20 envelope clause (D22 negative match)
- Lead produces its own consolidated report (no orchestrator mailbox message waited for)
- Output byte-identical to Task 0 baseline schema

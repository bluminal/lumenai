# Fixture: multi-model-enabled

Two native reviewers (code-reviewer, security-reviewer) + two external reviewers (codex, gemini).
multi_model=true resolved from per-command config.

Key assertions:
- Exactly one orchestrator-report in Lead's mailbox (no Lead-side consolidated-report)
- Unified report attributes findings to both native-team and external source_types
- SQL injection finding raised_by both security-reviewer [native-team] and codex [external]
- Audit artifact includes team_metadata block (Task 61 schema validation)
- D24: wall-clock parallelism deferred to Phase 10; this fixture records sequencing only

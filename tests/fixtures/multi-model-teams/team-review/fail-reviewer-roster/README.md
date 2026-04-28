# Fixture: fail-reviewer-roster

team-review invoked with --multi-model and quality-engineer in the roster.
quality-engineer is not in the v1-supported set for multi-model mode.

The command aborts before team spawn (Step 5a-validation) with the verbatim
FR-MMT20 error message. No team is created, no .active-team file is written.

Asserts:
- outcome: "abort"
- team_spawned: false (no Teammate API call)
- error_message matches FR-MMT20 verbatim exactly

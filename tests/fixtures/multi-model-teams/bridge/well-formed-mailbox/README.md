# Fixture: well-formed-mailbox

Two reviewers (code-reviewer + security-reviewer) each emit complete findings_json in their
mailbox messages. Bridge produces a canonical envelope with both reviewers' findings,
attribution preserved, all with source.source_type: "native-team".

Asserts:
- 2 reviewers × 1 finding each = 2 total findings
- Both per_reviewer_results entries have status: "success"
- All findings carry source.source_type: "native-team"
- report_markdown preserved verbatim per reviewer

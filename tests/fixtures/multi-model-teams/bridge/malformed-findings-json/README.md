# Fixture: malformed-findings-json

One reviewer (code-reviewer) sends a mailbox message with findings_json as a non-object string
(unparseable as the expected findings schema). The bridge sends exactly one clarification
SendMessage to code-reviewer. On the second failure (or if the team is no longer active),
marks code-reviewer as parse_failed. The well-formed reviewer (security-reviewer) flows through.

Asserts:
- Exactly one clarification SendMessage sent to code-reviewer
- code-reviewer per_reviewer_results: status "failed", error_code "parse_failed"
- security-reviewer per_reviewer_results: status "success", findings_count 1
- Only security-reviewer's findings in output findings[]

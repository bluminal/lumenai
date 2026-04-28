# Fixture: missing-findings-json

One reviewer (code-reviewer) sends a mailbox message entirely missing the findings_json field.
The bridge treats this identically to the malformed case: sends one clarification SendMessage,
then marks as parse_failed on second failure. The well-formed reviewer flows through unchanged.

Asserts:
- Same retry-then-parse_failed path as malformed-findings-json
- code-reviewer: parse_failed; security-reviewer: success
- Only security-reviewer's findings in output

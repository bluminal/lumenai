# review-engine fixtures

`live-run-t57-cross-reviewer-duplicates.json` — the 8 real CRITICAL/HIGH
findings `code-reviewer` and `security-reviewer` returned in cycle 2 of the
Task 57 `[H]` live run against a planted-issue diff to `src/users.js`
(hardcoded API key, a SQL-injection regression, a swallowed-error retry
loop, and a secret leaked to an arbitrary caller-supplied URL). Captured
from the workflow's `journal.jsonl` (the two `agent()` results labeled
`code-reviewer` and `security-reviewer` under the `Native Review` phase).

This is defect 3 from the live-run report: the two reviewers described the
same 4 issues with different `finding_id`, `title`, and `category` values,
so the engine rendered 8 CRITICAL/HIGH entries instead of 4.
`tests/schemas/review-engine-renderer.test.ts` asserts `dedupeFindings`
collapses this fixture to exactly 4 consolidated findings, each attributed
to both reviewers.

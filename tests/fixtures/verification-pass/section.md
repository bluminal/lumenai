## Verification Pass (CRITICAL/HIGH only, top 5)

Gated on `code_review.verification: prose|off` (default `off`; when `off`,
skip this section entirely). When `prose`: for each CRITICAL or HIGH finding,
up to the top 5 ranked by severity, verify it — use an LSP tool
(definition/references/diagnostics) if one is in your tool list, otherwise
grep for the symbol's references. Never block the review on verification;
log when the top-5 cap fires. Render the result as a
`- **Verification:** CONFIRMED (lsp|grep) | PLAUSIBLE (none)` line inside the
finding's existing `#### [SEV] Title` block.

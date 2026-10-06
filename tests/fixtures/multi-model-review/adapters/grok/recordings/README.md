# Grok spike recordings (Task 67)

Sanitized live recordings from the multi-model-review Phase 9 CLI spike, made with Grok CLI 1.0.46 on 2026-10-05. The full write-up is `docs/specs/multi-model-review/spike-grok-cursor.md`. Task 68 uses these recordings instead of synthetic fixtures wherever a case was recorded.

Each directory holds:

| File | Contents |
|------|----------|
| `argv.txt` | The exact argv, shell-quoted with `printf %q` (no argument contains a space) |
| `stdout.json` | The CLI's stdout, sanitized |
| `stderr.txt` | The CLI's stderr (empty when nothing was printed) |
| `exit_code` | The CLI's exit code |
| `README.md` | The run's purpose and the expected runner mapping |

**Isolation for every run:** `HOME=<scratch>/home`, the real `GROK_HOME` (keeps the grok.com session), `GROK_DISABLE_AUTOUPDATER=1`, all ten `GROK_CLAUDE_*` and `GROK_CURSOR_*` compat variables set to `0`, and `XAI_API_KEY`, `GROK_CONFIG` and `GROK_FOLDER_TRUST` unset. The cwd was the scratch dir, which held only `prompt.txt`.

**Sanitization:** `sessionId` and `requestId` are `<redacted-id>`, and the `thought` field's content is `<redacted-thought>`. The scratch dir `/private/tmp/synthex-grok.XXXXXX` is `<scratch>`. No canary token, account id, email or credential appears in any file; `grok-spike-recordings.test.ts` enforces this with a scan.

| Directory | Case | Expected runner result |
|-----------|------|------------------------|
| `g2-review-success` | Normal review, text path | `success`, 4 findings |
| `g3-json-schema-structured-output` | Normal review with `--json-schema` | `success`, 3 findings from `structuredOutput` |
| `g4-adversarial-prose-refusal` | Prompt injection; the model refused in prose | `parse_failed` after one retry |
| `g7-max-turns-cancelled` | `--max-turns 1`; a denied tool attempt used the only turn | `cli_failed` (incomplete-run guard) |
| `g8-denied-tool-then-answer` | Same prompt as G7 with `--max-turns 3` | `end_turn` on turn 2; text path gives `parse_failed` (prose preamble) |
| `g9-unknown-model-error` | Invalid `-m` | `cli_failed` |
| `sandbox-read-only-refused` | `--sandbox read-only` on macOS with a symlinked `/var/run/docker.sock` | One retry without `--sandbox`, plus a warning |

# Compat canary tool-probe fixtures (Task 23)

These are **authored**, not captured, transcripts. No
`SYNTHEX_COMPAT_CODEX_API_KEY` / `SYNTHEX_COMPAT_OPENCODE_API_KEY` (or the
runner's `SYNTHEX_COMPAT_CANARY_CREDENTIAL`) was available in the
environment where Task 23 was implemented, so the authenticated canary
could not be run live. Each fixture is a best-effort transcript matching
the "attempt" definitions documented in `tests/compat/lib/tool-probes.mjs`,
used only to unit-test the probe assertion functions
(`tests/schemas/compat-canary-tool-probes.test.ts`). The first
authenticated canary run on `main` is the live confirmation that Codex's
app-server `item/completed` stream and OpenCode's `--format json` event
stream actually take the shapes assumed here; until then, treat these as
"the code does what we say it does," not "the host behaves this way."

## Files

- `codex-workflow-step-{pass,violation}.json` — a `{ id, items }` object
  shaped like one entry of `runCodexProbeTurns`' return value
  (`tests/compat/lib/codex-app-server.mjs`). `pass` has one `error` item
  reporting an unknown `Workflow` tool (attempted once, then skipped);
  `violation` has two (attempted, then retried).
- `codex-no-injected-context-{pass,violation}.json` — same shape. `pass`
  has a `command_execution` item reading `GEMINI.md`; `violation` has only
  an `agent_message` claiming the context was already injected (no
  file-read-shaped item at all).
- `opencode-workflow-step-{pass,violation}.json` and
  `opencode-no-injected-context-{pass,violation}.json` — a `{ id, output }`
  object where `output` is the line-delimited-JSON text
  `countOpenCodeToolAttempts` / `opencodeReadInjectedContextFile` parse,
  matching what `runCommandAsync('opencode', ['run', ..., '--format',
  'json'], ...)` would capture as combined stdout+stderr.

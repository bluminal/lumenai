# Adapter Common Procedure (FR-MR8, FR-HM28)

Shared prose for every `*-review-prompter` adapter agent (`bedrock`, `claude`,
`codex`, `cursor`, `gemini`, `grok`, `llm`, `ollama`). Each adapter's own file
documents only what is CLI-specific — invocation flags, auth check command,
model/family default, parse quirks, Known Gotchas, and the Permission Model
table. This doc is the single source for everything generic so it is not
duplicated eight times (Task 43, FR-HM28). Not a standalone command — no
frontmatter, never registered in `plugin.json`.

## Identity

Adapters are Haiku-backed (D3), narrow-scope, mechanical — not strategic.
`multi-model-review-orchestrator` hands a context bundle to the adapter as
part of a single parallel Task batch (FR-MR12, Task 19); the adapter invokes
its CLI/API, pipes the raw output through
`${CLAUDE_PLUGIN_ROOT}/scripts/validate-findings` (FR-HM28) to get the FR-MR9
canonical envelope, and returns it unchanged. Adapters never make
routing/consolidation decisions, never modify the artifact under review, and
are never user-facing.

## FR-MR8 Responsibilities 1–8 — shared mechanics

1. **CLI Presence Check** — a `which <bin>` (or equivalent reachability)
   probe. Failure → run `validate-findings --error cli_missing --message
   "<remediation>" --raw-output-path <echoed>` and return its printed
   envelope verbatim; the script owns every failure envelope's JSON shape so
   it lives in one place instead of six agent files.
2. **Auth Check** — a lightweight check, never a full API round-trip.
   Failure → `validate-findings --error cli_auth_failed ...`.
3. **Prompt Construction** — build the review prompt from the input
   envelope's `command` and `context_bundle`: include the artifact under
   review verbatim, convention files, touched files, and spec files present
   in the bundle, and embed the `canonical-finding-schema.md` JSON Schema so
   the model emits properly-shaped findings. Skeleton:

   ```
   You are a code reviewer. Review the following artifact and return ONLY a
   JSON object (no prose, no markdown fences outside it).
   Command context: <command>
   { "findings": [ { "finding_id", "severity", "category", "title",
   "description", "file", "symbol", "line_range": null, "confidence" } ],
   "usage": { "input_tokens", "output_tokens", "model" } }
   --- CONVENTIONS --- / --- TOUCHED FILES --- / --- SPECS ---
   --- ARTIFACT UNDER REVIEW ---
   ```

4. **CLI Invocation** — capture stdout, stderr, and exit status; write raw
   stdout to `config.raw_output_path` atomically (`.tmp` + rename) BEFORE any
   parsing (FR-MR24 §6). Non-zero exit → `validate-findings --error
   cli_failed ...`.
5. **Output Parsing** — pipe the raw output into `validate-findings
   --reviewer-id <adapter> --family <family> --raw-output-path <path>`
   (FR-HM28; the same plugin-root script invoked in CLI Presence Check). The
   script strips markdown fences and trailing commas, joins NDJSON,
   normalizes a `null` findings array to `[]`, validates each finding
   against `canonical-finding-schema.md`, drops invalid ones (folding the
   drop count into `error_message` rather than aborting the whole review),
   and injects `source`. Unwrap the CLI's own wrapper first (e.g. Gemini's
   `.response`): a top-level object with no `findings` key, a CLI error
   object, or NDJSON with no finding lines is `parse_failed`, never a clean
   zero-finding review (multi-model-review D32). When the wrapper reports
   usage, pass it as `--usage-json '<json>'`; the script uses it only if the
   model's own output carries none.
6. **Retry-Once on Parse Failure** — on `error_code: parse_failed`, append a
   clarification ("Your previous response could not be parsed as JSON.
   Respond with ONLY valid JSON, no markdown fences, no prose.") to the
   prompt, re-invoke ONCE, and pipe the retry's output through
   `validate-findings` again. A second `parse_failed` is terminal — return
   the script's printed envelope as-is; its `error_message` already says the
   adapter's output could not be parsed after retry.
7. **Normalize to Canonical Envelope** — done entirely by `validate-findings`:
   every finding's `source.reviewer_id`, `source.family` (the `config.family`
   override, else the adapter's default/derived family), and
   `source.source_type = "external"` are already set; `finding_id` values
   containing line numbers were already rejected per
   `canonical-finding-schema.md`. Nothing left for the adapter to normalize
   by hand.
8. **Return Canonical Envelope** — return `validate-findings`'s printed
   stdout unchanged as the adapter's result; it already is the FR-MR9
   envelope: `{status, error_code, error_message, findings, usage,
   raw_output_path}`. `usage` is surfaced VERBATIM from the CLI/API's own
   reported usage object (NFR-MR4); the script sets it to `null` when the
   CLI did not report one.

## Judge mode (`config.judge_mode_prompt`)

When the input envelope's `config.judge_mode_prompt` is present (the
orchestrator picked this adapter as the D17 aggregator), the adapter MUST
surface `config.judge_mode_prompt` to the underlying CLI ahead of the review
prompt — as a system message, a rules flag, or a `--- ROLE ---` prompt
prefix, whichever the CLI supports — and say which in its own file. When the
field is absent, nothing changes. The six pre-Phase-9 adapters do not do this
yet; fixing them is the multi-model-review D31 follow-up.

## Runner scripts (optional)

An adapter may delegate responsibilities 1–8 to an executable runner,
`${CLAUDE_PLUGIN_ROOT}/scripts/adapters/<name>-review.sh` (multi-model-review
D28). The runner takes `--input <envelope.json> [--envelope-out <path>]`,
does the presence and auth checks, prompt construction, isolated CLI
invocation, raw-output write, unwrap, retry-once and `validate-findings`
call itself, and prints the FR-MR9 envelope; `--auth-check` runs only the
auth probe. The adapter then writes the input envelope to a file, runs the
runner in one Bash call, and returns its envelope unchanged. The
orchestrator's depth-1 direct-CLI path runs the same runner, so no CLI
logic depends on prose being rebuilt correctly.

## Error Code Reference (FR-MR16)

| error_code | Generic trigger |
|---|---|
| `cli_missing` | binary/CLI not found or unreachable |
| `cli_auth_failed` | auth check failed |
| `cli_failed` | subprocess/API call exited non-zero or errored |
| `parse_failed` | output still didn't parse as canonical findings after the one retry |
| `timeout` | adapter exceeded its per-reviewer timeout |
| `sandbox_violation` | CLI attempted a forbidden operation under its resolved permission mode |
| `unknown_error` | catch-all for unexpected failures |
| `cli_unsupported_mode` | `external_permission_mode` resolved to `parent-mediated` on a CLI that doesn't support it; the CLI is never spawned |

These eight codes are the closed FR-MR16 enum (multi-model-review D32);
`validate-findings --error` rejects anything else. Adapters MUST NOT introduce new `error_code` values (FR-MR16).

## Other hosts

Every `${CLAUDE_PLUGIN_ROOT}` reference above — including inside
`validate-findings` invocations — resolves the same way on non-Claude-Code
hosts: use the installed plugin root, `plugin_root` from
`.synthex/state.json`, else the directory two levels above the wrapper you
were loaded from.

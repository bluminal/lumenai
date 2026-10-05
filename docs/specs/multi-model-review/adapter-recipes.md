# Adapter Recipes — v1 Adapter Set

> Per-adapter install, auth, sandbox, recommended-model, and gotcha guides for the v1 adapters (Codex, Gemini, Ollama), the fast-follow adapters (llm, Bedrock, Claude) and the Phase 9 adapters (Grok, §8). Plus a "writing a new adapter" guide per NFR-MR5 (§7).

## Status: Final

## Related Docs

- [`adapter-contract.md`](./adapter-contract.md) — canonical envelope every adapter must conform to
- [`architecture.md`](./architecture.md) — overall multi-model review architecture
- [`failure-modes.md`](./failure-modes.md) — error_code reference and fallback flows

---

## 1. Codex (OpenAI / Codex CLI)

### Install one-liner

```bash
npm install -g @openai/codex
```

### Auth setup

```bash
codex login
```

Authenticates via OpenAI account (ChatGPT login or API key). Credentials live under `$CODEX_HOME` (default `~/.codex`). The adapter's auth check is:

```bash
codex login status
```

It exits 0 when authenticated and 1 otherwise, and makes no model call. Judge it by exit code: the `Logged in using ...` / `Not logged in` line goes to **stderr**, and stdout is empty. It reports stored credentials only, so when `CODEX_API_KEY` or `OPENAI_API_KEY` is set (common in CI) it prints `Not logged in` although `codex exec` would work; the adapter skips the check in that case. There is no `auth` subcommand: an `auth status` check fails with "unrecognized subcommand". Token expiry is handled by treating a 401 from `codex exec` as `cli_auth_failed`.

### Recommended flagship model

`gpt-5` (as of 2026-04). Per D17 tier table: GPT-5 is tier 2 (after Claude Opus). Set via `multi_model_review.per_reviewer.codex-review-prompter.model`.

### Sandbox flags (FR-MR26)

```bash
codex exec --sandbox read-only --ephemeral --skip-git-repo-check --json [-m <model>] \
  --output-schema <plugin_root>/agents/_shared/codex-findings.schema.json \
  -o <last-message-file> - < <prompt-file>
```

- `--sandbox read-only` — model-generated commands can read the repo but never write
- `--ephemeral` — no Codex session is persisted to disk
- `--json` — JSONL event stream on stdout (the last `turn.completed` event carries token usage)
- `--output-schema` — Codex enforces the strict findings schema on its final message; `-o` writes that message to a file
- `-` — prompt read from stdin (context bundles can reach 200 KB)

`codex exec` is non-interactive and never asks for approval, so there is no approval flag: `codex exec` has no `--approval-mode`, and it rejects `-a`/`--ask-for-approval` (that is a top-level `codex` flag only). `--sandbox read-only` is MANDATORY. The Layer 2 fixture (Task 12) asserts the documented flag set is a substring of the recorded invocation string, and `tests/schemas/codex-cli-flags.test.ts` checks every documented `codex` subcommand and flag against captured `codex --help` output (`tests/fixtures/cli-help/codex/`).

**Strict output schema.** Codex structured output requires a strict JSON Schema: every property listed in `required` (optional ones made nullable) and `additionalProperties: false` at every object level. The canonical finding schema does not satisfy that, so the adapter passes `plugins/synthex/agents/_shared/codex-findings.schema.json` (the model-authored canonical fields only — no `source`, which `validate-findings` injects). `tests/schemas/codex-findings-schema.test.ts` keeps it in parity with `canonical-finding.schema.json`; `validate-findings` still enforces the full canonical rules afterwards.

### Known gotchas

1. **Flag order:** all flags precede the `-` prompt argument.
2. **No approval flag exists for `codex exec`:** earlier revisions of this recipe passed an `--approval-mode` flag, which current Codex CLI (verified on 0.160.0) does not accept on `exec` (and `-a never` is rejected there too). `codex exec` never blocks on approval prompts.
3. **Output location:** the schema-shaped answer is in the `-o` last-message file; if it is empty, fall back to the last `agent_message` `item.completed` event's `item.text` in the JSONL stream. Codex writes an empty `-o` file when a turn ends without an agent message, so a missing answer must fail closed (`parse_failed`), never become a zero-findings success.
4. **Optional model flag in shell:** write it as one word, `${MODEL:+--model="$MODEL"}`. The two-word `${MODEL:+-m "$MODEL"}` stays a single argument in zsh (the macOS default shell), which Codex reads as `--model " <model>"`.
5. **Auth token expiry:** Tokens can expire silently; treat 401 from `codex exec` as `cli_auth_failed`.
6. **Permission modes:** `parent-mediated` (the default) runs as read-only with one WARN line, because Pattern 3 is not yet built on the real `codex app-server` protocol (`initialize`, `thread/start`, `turn/start`, `item/*/requestApproval`). `sandbox-yolo` runs the same `codex exec` command inside `sandbox-exec`/`bwrap` with `--sandbox danger-full-access` (nested Seatbelt fails).

---

## 2. Gemini (Google / Gemini CLI)

### Install one-liner

```bash
npm install -g @google/gemini-cli
```

(or current canonical install path; verify with `which gemini` after install)

### Auth setup

Primary: export `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in the environment. Fallback, for
Code Assist / OAuth users with no API key:

```bash
gcloud auth login
```

The adapter checks auth via `GEMINI_API_KEY`/`GOOGLE_API_KEY` first; only if neither is set
does it fall back to `gcloud auth list` — exit 0 with non-empty output means authenticated
(Task 25 / FR-HM44).

### Recommended flagship model

`gemini-2.5-pro` (as of 2026-04). Per D17 tier table: tier 4 (after Claude Sonnet). Set via `multi_model_review.per_reviewer.gemini-review-prompter.model`.

### Sandbox flags (FR-MR26)

- `--approval-mode default` — headless (`-p`) invocation under `default` approval mode denies
  and excludes every tool that requires confirmation (shell exec, file writes, etc.), since
  there is no TTY to confirm on. This is Gemini's read-only guarantee (Task 25 / FR-HM44).
  There is no dedicated `--readonly` or `--no-tools` flag in the Gemini CLI — an earlier
  adapter revision assumed one existed; it did not.

### Known gotchas

1. **Markdown-fence-wrapped JSON:** Gemini sometimes wraps JSON output in `` ```json ... ``` `` even with `--output-format json` set. The adapter strips fences before parsing.
2. **NDJSON streaming:** Some model configurations return line-delimited JSON chunks instead of a single envelope. The adapter concatenates and re-parses.
3. **`findings: null` vs `[]`:** Gemini may emit `null` for empty findings; the adapter normalizes to `[]`.
4. **Trailing commas in JSON:** Some output paths emit JSON with trailing commas; the adapter strips before parsing.

---

## 3. Ollama (Local model — qwen, llama, deepseek, etc.)

### Install one-liner

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Auth setup

**No authentication required** — Ollama runs locally.

### Recommended flagship model (Q2 — TBD)

> **Q2 (Open Question):** Should v1 recommend a specific Ollama model, or only document FR-MR1 "flagship-class" guidance?
>
> **Current recommendation (as of 2026-04):** flagship-class options known good:
> - `qwen2.5-coder:32b` — strong code-focused performance
> - `deepseek-v3` — strong general reasoning
> - `llama3.2` — broadly capable, smaller footprint
>
> Final default model TBD pending Q2 resolution. Until resolved, users specify their preferred model via `multi_model_review.per_reviewer.ollama-review-prompter.model` in `.synthex/config.yaml`.

### Sandbox flags

**N/A for local execution.** Ollama runs as a local server with no remote network or filesystem access beyond model storage. Per FR-MR26, the parity assertion (Task 18a) checks the documented HTTP API call shape instead of sandbox flag substrings.

### Known gotchas

1. **Server must be running:** `ollama serve` (or launchd/systemd service). Adapter doesn't auto-start.
2. **Model must be pulled:** `ollama pull <model>` before first use.
3. **Schema-formatted output requires Ollama ≥ 0.5.0:** older versions ignore the schema and emit free-form JSON.
4. **GPU memory pressure:** Large models on consumer GPUs can OOM; treat HTTP 500 with "out of memory" as `cli_failed` with remediation hint suggesting smaller model.

---

## 4. llm (Universal Escape-Hatch)

### Install one-liner

```bash
pip install llm
```

Or, for isolated installation (recommended):

```bash
pipx install llm
```

### Auth setup

**Per-plugin — no single global auth command.** Set API keys per provider:

```bash
llm keys set openai          # set OPENAI_API_KEY
llm keys set anthropic       # set ANTHROPIC_API_KEY
llm keys set mistral         # set MISTRAL_API_KEY
```

Auth is per-plugin; missing-key errors surface as `cli_failed` from `llm` itself rather than `cli_auth_failed`.

### Recommended models

Any model the user has installed via `llm install <plugin>`. The `llm` CLI supports 50+ providers via plugins (OpenAI, Anthropic, Google, Mistral, Cohere, Meta, and more). Install the plugin for your target provider first:

```bash
llm install llm-anthropic     # for Claude models
llm install llm-mistral       # for Mistral/Mixtral models
llm install llm-gemini        # for Gemini models
```

OpenAI is built-in (no separate install needed).

### Sandbox flags

**N/A — `llm` is a stateless CLI; no filesystem access beyond reading the prompt from stdin or argument.** Per FR-MR26, sandbox flags are not applicable. The `llm` CLI operates as a stateless subprocess: reads prompt, calls provider API, writes response to stdout. No filesystem reads or writes beyond stdin/stdout.

### Known gotchas

1. **Plugin per provider:** The `llm` CLI requires a separate plugin install for most providers: `llm install llm-anthropic`, `llm install llm-mistral`, etc. Missing plugin → `cli_failed`.
2. **`-s` flag varies by version:** Newer `llm` versions support system prompts via `-s`; older versions require `--system`. If `-s` causes an "unrecognized option" error, fall back to `--system`.
3. **No native sandbox:** `llm` runs as a user process with no filesystem access beyond stdin/stdout. Sandbox flags do not apply (FR-MR26 N/A).
4. **Usage reporting is plugin-dependent:** Not all `llm` provider plugins report token counts. When usage is unavailable, set `usage: null` in the canonical envelope per NFR-MR4.

---

## 5. Bedrock (AWS)

### Install one-liner

```bash
pip install awscli
```

On macOS with Homebrew:

```bash
brew install awscli
```

After installation, configure credentials:

```bash
aws configure
```

### Auth setup

```bash
aws sts get-caller-identity
```

Returns `{"Account": "...", "UserId": "...", "Arn": "..."}` when credentials are valid. Credentials can be configured via environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`), `~/.aws/credentials`, IAM role, or AWS SSO.

### Recommended flagship model

`anthropic.claude-3-opus-20240229-v1:0` (as of 2026-04). Set via `multi_model_review.per_reviewer.bedrock-review-prompter.model`.

### Sandbox flags

**N/A — the `aws` CLI runs as the configured OS user using AWS credentials (env vars, `~/.aws/credentials`, or IAM role). No subprocess sandboxing to configure.** Per FR-MR26, authorization is handled entirely through AWS IAM and credential resolution.

### Known gotchas

1. **Per-family request body shape:** Bedrock requires different JSON request bodies per model family. Anthropic uses `messages` + `anthropic_version`; Meta uses `prompt` string; Cohere uses `message` + `chat_history`. Passing the wrong request shape returns HTTP 400 (`ValidationException`).
2. **Region must be set:** `aws bedrock-runtime` requires a region. Set `AWS_REGION` (or `AWS_DEFAULT_REGION`) to a supported region (e.g., `us-east-1`, `us-west-2`).
3. **Model access opt-in required:** AWS Bedrock requires explicit model-access opt-in in the AWS console before the API will work. Navigate to AWS console → Amazon Bedrock → Model access → enable the desired model. A 403 `AccessDeniedException` is treated as `cli_auth_failed`.
4. **`/tmp` output file cleanup:** The AWS CLI writes Bedrock's response to a local file (`/tmp/bedrock-output-<uuid>.json`). The adapter MUST delete it after reading to avoid leaking potentially sensitive output.

---

## 6. Claude (Specialty Anthropic Second-Voice)

> ⚠️ **NOT in the default-recommended set per FR-MR10.** This is a SPECIALTY adapter intended only for deliberate second-Anthropic-voice scenarios (e.g., host is Sonnet, adapter targets Opus). Adding it alongside a host Anthropic session reduces family-diversity score. Must be opted in explicitly.

### Install one-liner

```bash
npm install -g @anthropic-ai/claude-code
```

### Auth setup

```bash
claude auth status
```

Verify authentication status. Because this adapter shares the same credential store as the host Claude Code session, re-authentication is typically not required when running as a sub-agent within an existing Claude Code session.

### Recommended flagship model

Any Anthropic model DIFFERENT from the host session model (e.g., if host is `claude-sonnet-4-6`, target `claude-opus-4-5`). Set via `multi_model_review.per_reviewer.claude-review-prompter.model`. Using the same model as the host provides no diversity benefit.

### Sandbox flags (FR-MR26)

```bash
--permission-mode acceptEdits --tools ""
```

- `--permission-mode acceptEdits` — restricts autonomous operations to file edits only (no shell execution)
- `--tools ""` — disables all built-in tools (Bash, file read/write), forcing text-only response

This is the Claude CLI's equivalent of Codex's `codex exec --sandbox read-only` (which never prompts for approval). Semantic intent is identical; flag names differ.

### Known gotchas

1. **Self-preference risk:** When the host session is also Anthropic, this adapter adds to the Anthropic count without adding family diversity. The orchestrator's preflight emits a self-preference warning (FR-MR15) when applicable.
2. **Model must differ from host:** If the same model is configured for both host and adapter, the adapter runs but provides no diversity benefit — it is a misconfiguration. The orchestrator's preflight diversity check is the enforcement point.
3. **Auth shared with host:** `claude` uses the same credential store as the Claude Code session. A non-zero `claude auth status` exit is only a genuine auth failure when running outside an established session context.
4. **Sandbox flag variance from Codex:** Claude CLI does not expose Codex's `--sandbox read-only`. The equivalent is `--permission-mode acceptEdits --tools ""`. Verify against `claude --help` when upgrading the Claude CLI.

---

## 7. Writing a New Adapter (NFR-MR5)

Per NFR-MR5, new adapters are added by authoring **a single new agent markdown file** under `plugins/synthex/agents/<name>-review-prompter.md`. NO orchestrator code changes required.

### Required steps

1. **Author the agent markdown** — copy `codex-review-prompter.md` as a template. Required sections:
   - Frontmatter: `model: haiku`
   - Identity (1 paragraph)
   - Capability tier (`agentic` | `text-only`) and default family
   - CLI invocation (per FR-MR26 if agentic — sandbox flags)
   - Behavior steps 1-8 (per FR-MR8 — CLI presence check, auth check, prompt construction, CLI invocation, output parsing, retry-once, normalize, return)
   - Install one-liner + auth setup + known gotchas
   - Source authority (FR-MR8/9/10/16; FR-MR26 if agentic; D3; NFR-MR4)

2. **Register in `plugin.json`** — add the agent path to the `agents` array.

3. **Update `adapter-recipes.md` (this file)** — add a new section for the adapter following the structure above.

That's 3 file changes total — adapter `.md`, `plugin.json` entry, recipes doc entry. Per Task 60 NFR-MR5 verification: any orchestrator change required during a new-adapter PR is treated as a defect against the extensibility contract.

### Pattern reference

The Codex adapter is the reference implementation — its structure should be the template. Variations:
- **Text-only adapters** (Ollama-style): no sandbox flags; `text-only` tier; family may be dynamic (`local-<model>`).
- **No-auth adapters** (Ollama-style): step 2 (auth check) is N/A; document this explicitly.

### Anti-patterns

- **Do NOT** introduce new error_code values without updating FR-MR16 + adapter-contract.md.
- **Do NOT** modify the orchestrator to special-case the new adapter. The adapter envelope is the contract; the orchestrator treats all adapters uniformly.
- **Do NOT** store API keys in adapter agent prose. Adapters delegate auth to the underlying CLI's native auth flow.

---

## 8. Grok (xAI / Grok Build CLI)

`grok-review-prompter` is a thin agent: every CLI step lives in the runner `plugins/synthex/scripts/adapters/grok-review.sh` (multi-model-review D28), which the orchestrator's depth-1 path runs too. It is a `text-only` proposer (D25): the model gets no file, shell, web or MCP tools, and the bundle inlined in the prompt is its only context. Default family `xai`; a configured model that does not start with `grok-` gives `unknown` unless `per_reviewer.grok-review-prompter.family` is set. Evidence for every flag below is the Task 67 spike, `docs/specs/multi-model-review/spike-grok-cursor.md` (Grok CLI 1.0.46).

### Install one-liner

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
```

Grok's bundled docs document only this installer (and a PowerShell one); there is no npm path (U11).

### Auth setup

```bash
grok login
```

Sign in with a grok.com session. The adapter's auth check is the runner's `--auth-check`, which runs `grok models` (it sends no prompt) under the same isolation as a review and reads the first line:

| Exit | Meaning |
|---|---|
| 0 | `You are logged in with grok.com.` (a session) |
| 10 | `grok` is not on PATH |
| 11 | Not authenticated, an unrecognised first line, no answer within the bound, or a scratch dir that could not be entered so grok was not run (fails closed; `grok models` exit codes are not relied on, U9) |
| 12 | Only `XAI_API_KEY` (or `GROK_CODE_XAI_API_KEY`) is available and per-token billing is not opted into |

The probe is bounded by min(30 s, the review budget) in both modes. In `--input` mode the budget clock starts before the probe, so a slow probe leaves less time for the review, and a probe that uses up the whole budget gives `timeout`.

**Billing (D26).** `XAI_API_KEY` bills per token, and so does its backward-compatible alias `GROK_CODE_XAI_API_KEY`, which grok also reads. The runner unsets both for every grok call unless `multi_model_review.per_reviewer.grok-review-prompter.allow_api_key_billing: true`, so no review is usage-billed by surprise, whichever credential grok prefers (U6).

### Recommended flagship model

The account default (`grok-4.7` at spike time). Leave `per_reviewer.grok-review-prompter.model` unset to use it; the runner passes `-m` only when a model is configured. The wrapper's `modelUsage` is keyed by the serving model (`grok-4.7-build`), and that key is what lands in `usage.model` (NFR-MR4). A wrapper with `usage` but no `modelUsage` gets the configured model (the `-m` value) instead, else `null`. Grok is not in the D17 tier table, so `auto` never picks it as the aggregator; when it is configured as the aggregator, the runner passes `judge_mode_prompt` through `--rules` (D31).

### Sandbox flags (FR-MR26)

The runner's argv (scratch path shown as `<W>`):

```bash
grok --prompt-file <W>/prompt.txt --output-format json \
  --json-schema '<agents/_shared/codex-findings.schema.json, minified>' \
  --disallowed-tools read_file,grep,list_dir,run_terminal_cmd,run_terminal_command,search_replace,write_file,web_search,web_fetch,todo_write,task,spawn_subagent,memory_search,search_tool,use_tool,Agent \
  --deny '*' --deny 'mcp__*' --permission-mode dontAsk --sandbox read-only \
  --no-subagents --disable-web-search --max-turns 3 [-m <model>] [--rules <judge_mode_prompt>]
```

- `--disallowed-tools` removes every built-in tool: the names the 1.0.46 spike ran with, plus every built-in that grok's own user guide names (`run_terminal_command`, `spawn_subagent`, `memory_search`, and the MCP meta-tools `search_tool` and `use_tool`). Unknown names are accepted silently (U1), so a name that a given version lacks costs nothing. `--deny '*'` denies any tool that is left, and `--deny 'mcp__*'` every MCP tool. This removal is the read-only guarantee (U1, U2).
- `--permission-mode dontAsk`, `--no-subagents` and `--disable-web-search` are defence in depth.
- `--json-schema` (D33) uses the same strict findings schema as the Codex adapter (every property required, optional ones nullable, `additionalProperties: false`, no `source`). The answer lands in `structuredOutput`; the runner reads that first and falls back to `.text` only when it is absent (U10).
- `--max-turns 3` (D36): a denied tool attempt consumes a turn, so 1 is unsafe (U26).
- `--sandbox read-only` (D34). On macOS it restricts only writes. **Fallback:** where `/var/run/docker.sock` is a symlink (OrbStack, Docker Desktop), grok 1.0.46 refuses to start with "could not resolve runtime-socket deny path … endpoint is a symlink … Refusing to start with its protections missing". On exactly that refusal the runner retries once without `--sandbox` and logs a warning on stderr and in `<raw>.stderr.log` (never in `error_message`). Any other refusal is `cli_failed`. The refusal comes before any prompt is sent, so the retry costs nothing.
- Never `--yolo`, `--always-approve`, `--permission-mode bypassPermissions`, `--trust` or `-p`.

**Isolation (Task 67 evidence).** Every grok call runs from a fresh `mktemp -d /tmp/synthex-grok.XXXXXX` dir, canonicalised and removed by a trap. The subshell that execs grok enters it with `cd || exit 125` and then checks that `pwd -P` is still that dir, because errexit does not cover the auth probe (it runs as `auth_probe || rc=$?`). A failed check runs no grok: `unknown_error`, or exit 11 for `--auth-check`. Each call also gets `HOME=<W>/home`, the real `GROK_HOME` (it holds the OAuth session), `GROK_DISABLE_AUTOUPDATER=1`, `GROK_MEMORY=0` (the process-wide memory force-disable, which config cannot override: no memory index from the user's other sessions is injected, and the reviewed code is never written to `$GROK_HOME/memory`), every `GROK_CLAUDE_*_ENABLED` and `GROK_CURSOR_*_ENABLED` set to `0`, and `GROK_CONFIG`, `GROK_FOLDER_TRUST` and `GROK_SANDBOX` unset. In the spike, under these settings: an adversarial prompt could not write a file, read a canary outside the scratch dir or call an MCP tool (G4); a planted project hook in the untrusted scratch dir did not fire (G6); `grok inspect` listed 0 MCP servers and 0 plugins, with every Claude and Cursor compat source disabled (U8).

**Output mapping.** Raw stdout goes to `config.raw_output_path` atomically before parsing. A `{type:"error"}` object is `cli_failed` (`cli_auth_failed` when it names a login problem). Then the incomplete-run guard (D36, Risk 15): a `stopReason` other than exactly `end_turn` (absent included), or `max turns reached` on stderr, is `cli_failed` and the run's text is never parsed, because it can be `{"findings": []}` for code that was never reviewed. node or jq makes the exact comparison, so `"end_turn\n"` and `" end_turn"` fail too. Such a run that also exits non-zero with a login error on stderr is `cli_auth_failed`, still before any parsing. Otherwise the unwrapped answer goes to `validate-findings --usage-json` with the wrapper's `usage.input_tokens`, `usage.output_tokens` and `modelUsage` key. `parse_failed` is retried once. The wall-clock guard is `per_reviewer_timeout_seconds` minus 10, clamped to the host shell cap minus 15 when there is no `--envelope-out` (`timeout`, a partial raw is kept); it covers the auth probe as well as the review. A `raw_output_path` that cannot be written gives `unknown_error` before any grok call; exit 130 is `cli_failed`; `parent-mediated` is `cli_unsupported_mode` without spawning grok (D29). If the runner itself gets SIGINT or SIGTERM, it stops grok, keeps any partial raw output, prints a `cli_failed` envelope ("grok-review.sh was interrupted; the code was not reviewed.") and writes it to `--envelope-out`, then exits 130 or 143.

### Known gotchas

1. **User hooks run (D35).** Hooks in `$GROK_HOME/hooks`, and in plugins installed there (possibly Synthex via `.grok-plugin`), fire once per review subprocess. No per-run switch exists, and isolating `GROK_HOME` would lose the login. They are the user's own trusted hooks and run as they would for a manual `grok` run. The runner never edits hook config, including `~/.grok/disabled-hooks`.
2. **Sandbox refusal on Docker hosts (D34).** See the fallback above. The profile's child-network block is a no-op on macOS; tool removal is the real guarantee.
3. **Billing.** Session reviews still report `total_cost_usd`; it stays in the raw output only. Each `parse_failed` retry and each extra turn is another call.
4. **Self-review.** On a Grok host the native reviewers are xAI as well, so a grok proposer adds no real family diversity (Task 71 fixes the accounting).
5. **Latency.** `--json-schema` took 65 s against 21 s on the text path in the spike (one sample each). A host that cannot background the runner gets a 105 s clamp (U22) and may see `timeout`.
6. **CLI drift.** The runner sets `GROK_DISABLE_AUTOUPDATER=1`. After a version bump, re-capture the help fixtures under `tests/fixtures/multi-model-review/adapters/grok/cli-help/`; `grok-review-runner-behavioral.test.ts` fails on a flag the help no longer lists.
7. **Headless docs use `--yolo`.** The runner never does; never copy a docs example into a reviewer config.

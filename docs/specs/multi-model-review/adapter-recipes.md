# Adapter Recipes — v1 Adapter Set

> Per-adapter install, auth, sandbox, recommended-model, and gotcha guides for the v1 adapters (Codex, Gemini, Ollama). Plus a "writing a new adapter" guide per NFR-MR5.

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

Authenticates via OpenAI account. Token stored in `~/.config/codex/auth.json`. Token expiry handled by treating 401 from `codex exec` as `cli_auth_failed`.

### Recommended flagship model

`gpt-5` (as of 2026-04). Per D17 tier table: GPT-5 is tier 2 (after Claude Opus). Set via `multi_model_review.per_reviewer.codex-review-prompter.model`.

### Sandbox flags (FR-MR26)

- `--sandbox read-only` — file system access is read-only
- `--approval-mode never` — no interactive approvals; fail-fast instead

These flags are MANDATORY. The Layer 2 fixture (Task 12) asserts the documented flag set is a substring of the recorded invocation string.

### Known gotchas

1. **Sandbox flag order:** `--sandbox` must precede the prompt; older CLI versions don't reorder.
2. **`--approval-mode never` is required:** Without it the CLI may block on file-write approval prompts.
3. **JSON envelope variations:** Codex may wrap findings in `response.message.content[0].text` rather than at the top level; the adapter handles both.
4. **Auth token expiry:** Tokens can expire silently; treat 401 from `codex exec` as `cli_auth_failed`.

---

## 2. Gemini (Google / Gemini CLI)

### Install one-liner

```bash
npm install -g @google/gemini-cli
```

(or current canonical install path; verify with `which gemini` after install)

### Auth setup

```bash
gcloud auth login
```

The adapter checks auth via `gcloud auth list` — exit 0 with non-empty output means authenticated.

### Recommended flagship model

`gemini-2.5-pro` (as of 2026-04). Per D17 tier table: tier 4 (after Claude Sonnet). Set via `multi_model_review.per_reviewer.gemini-review-prompter.model`.

### Sandbox flags (FR-MR26)

- `--readonly` — read-only filesystem access (Gemini's read-only flag form)

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

This is the Claude CLI's equivalent of Codex's `--sandbox read-only --approval-mode never`. Semantic intent is identical; flag names differ.

### Known gotchas

1. **Self-preference risk:** When the host session is also Anthropic, this adapter adds to the Anthropic count without adding family diversity. The orchestrator's preflight emits a self-preference warning (FR-MR15) when applicable.
2. **Model must differ from host:** If the same model is configured for both host and adapter, the adapter runs but provides no diversity benefit — it is a misconfiguration. The orchestrator's preflight diversity check is the enforcement point.
3. **Auth shared with host:** `claude` uses the same credential store as the Claude Code session. A non-zero `claude auth status` exit is only a genuine auth failure when running outside an established session context.
4. **Sandbox flag variance from Codex:** Claude CLI does not expose `--sandbox read-only` or `--approval-mode never`. The equivalent is `--permission-mode acceptEdits --tools ""`. Verify against `claude --help` when upgrading the Claude CLI.

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

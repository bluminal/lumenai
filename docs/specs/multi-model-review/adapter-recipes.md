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

## 4. Writing a New Adapter (NFR-MR5)

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

---
model: haiku
---

# Configure Multi-Model Review

Configure (or re-configure) multi-model review for this project. Multi-model review fans review prompts out to multiple LLM-family proposers (OpenAI, Google, xAI, local Ollama, etc.) and consolidates findings into a single attributed list. This catches errors a single model would miss.

This command is the standalone wizard for the `multi_model_review` block in `.synthex/config.yaml`. It is invoked:

- Directly by the user via `/synthex:configure-multi-model` (re-runnable any time).
- As a subroutine from `/synthex:init` Step 4 during fresh project initialization.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `config_path` | Where the config file lives | `.synthex/config.yaml` | No |

## Workflow

### 0. Re-entry Check (idempotency)

Read `@{config_path}` (default `.synthex/config.yaml`).

- **If the file does not exist:** skip to Step 1. The wizard runs in fresh-configuration mode.
- **If the file exists and the `multi_model_review` top-level key is absent:** skip to Step 1. Treat as fresh configuration.
- **If the file exists and `multi_model_review.enabled: false` is present:** skip to Step 1. The user previously opted out, but they invoked this command to reconsider; treat as fresh configuration but preserve any other keys in the existing block when writing.
- **If the file exists and `multi_model_review.enabled: true` is present:** surface the current settings and present re-entry options via `AskUserQuestion`:

> **Multi-model review is already enabled.**
>
> Current configuration:
>
> - `enabled: true`
> - `reviewers: [<list from config>]`
> - `aggregator.command: <value from config>`
>
> What would you like to do?
>
> 1. **Re-run the wizard** — re-detect installed CLIs and overwrite `multi_model_review.reviewers`, keeping any manual opt-in adapter already in the list (Step 1d). The data-transmission warning (Step 1c) will be re-displayed before any write.
> 2. **Reset to disabled** — set `multi_model_review.enabled: false` (preserve the rest of the block, per D-UO5). The user can re-enable later by re-running this wizard.
> 3. **Leave as-is** — exit without changes.

Apply the chosen option:

- **Re-run the wizard:** proceed to Step 1.
- **Reset to disabled:** edit `@{config_path}` so that `multi_model_review.enabled: false`. Do NOT delete the `multi_model_review` block — the explicit `false` value is the signal that the user opted out (D-UO5). Print a one-line confirmation: `Multi-model review disabled. Re-run /synthex:configure-multi-model to re-enable.` Exit.
- **Leave as-is:** print `No changes made.` Exit.

### 1. Configure Multi-Model Review (optional)

Prompt the user to opt in to multi-model review. Off by default; this step allows the user to enable it.

#### 1a. Detection Scan

Emit a progress indicator before beginning:

```
Detecting installed CLIs...
```

For each candidate CLI in `[codex, gemini, ollama, llm, aws, claude, grok, cursor-agent]`, run BOTH a presence (`which`) check AND a lightweight auth check per the adapter's documented auth check command (D22 — auth pre-validation).

**Host id (for Step 1b).** Determine the host id from where you are running, not from a separate environment read: it is the id the wrapper's `SYNTHEX_HOST` step tells you to export (`grok` when you run in Grok Build, and likewise `codex`, `gemini`, `opencode`, `hermes`); on Claude Code it is empty. Export it in the same Bash command as the runner auth checks (`export SYNTHEX_HOST=<id>; ...`). Do not decide it from a separate `echo $SYNTHEX_HOST`: shell state does not carry over between tool calls, so that read is usually empty even on Grok.

| CLI | Presence check | Auth check command |
|-----|---------------|--------------------|
| `codex` | `which codex` | `codex login status` |
| `gemini` | `which gemini` | `gcloud auth list` |
| `ollama` | `which ollama` | `curl -sf http://localhost:11434/api/tags > /dev/null` |
| `llm` | `which llm` | `llm keys list` |
| `aws` | `which aws` | `aws sts get-caller-identity --output text` |
| `claude` | `which claude` | `claude --version` |
| `grok` | `command -v grok` | the Grok runner's `--auth-check` (below) |
| `cursor-agent` | `command -v cursor-agent` | the Cursor runner's `--auth-check` (below) |

Never check for, or run, a binary named `agent`: the Cursor installer's second name for `cursor-agent` can be Grok's binary.

The `grok` auth check is `"${CLAUDE_PLUGIN_ROOT}/scripts/adapters/grok-review.sh" --auth-check`, which runs `grok models` under the review isolation and sends no prompt. On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

The `cursor-agent` auth check is `"${CLAUDE_PLUGIN_ROOT}/scripts/adapters/cursor-review.sh" --auth-check`, which runs the model and family guard, then `cursor-agent status --format json`, and sends no prompt. On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from.

**All presence and auth checks dispatch concurrently in a single parallel Bash batch** — preflight wall-clock is bounded by the slowest single check + collation overhead, not by the sum of per-CLI latencies.

For the first six CLIs, auth checks that exit 0 are treated as authenticated regardless of advisory text on stdout/stderr. Only the exit code determines the auth result.

For `grok` and `cursor-agent`, read the runner's exit code (exit codes 0, 10, 11 and 12):

- **0** — authenticated (grok: a grok.com session, or `XAI_API_KEY` with `per_reviewer.grok-review-prompter.allow_api_key_billing: true`, which bills per token; cursor-agent: logged in). The grok check prints `grok: authenticated` in both grok cases.
- **10** — the binary is not on PATH: treat as not-detected.
- **11** — not authenticated (any other exit code counts as 11). Remediation: `grok login` / `cursor-agent login`.
- **12** — detected, but unusable without a config change. grok: only `XAI_API_KEY` (or `GROK_CODE_XAI_API_KEY`) is available and `per_reviewer.grok-review-prompter.allow_api_key_billing` is not `true`. cursor-agent: no explicit non-Auto `per_reviewer.cursor-review-prompter.model` and `family` are configured, or only `CURSOR_API_KEY` is available and `per_reviewer.cursor-review-prompter.allow_api_key_billing` is not `true`. The Cursor model and family guard runs before `cursor-agent status`, so when it fails the check has not seen the login state. Exit 12 always lands in the manual bucket, never in detected-and-authenticated.

Bucket results into four groups after collation. Each CLI lands in exactly one group; a CLI that matches the manual bucket goes there and nowhere else:

- **detected-and-authenticated** — presence check AND auth check both exited 0, and the CLI is not in the manual bucket below
- **detected-but-unauthenticated** — presence check exited 0; auth check exited non-zero (grok: exit 11), and the CLI is not in the manual bucket below (`cursor-agent` never lands here)
- **detected — opt in manually** — `cursor-agent` whenever it is detected, whatever its auth exit (D43); `grok` on auth exit 12, and `grok` whenever the host id is `grok`
- **not-detected** — presence check exited non-zero (grok and cursor-agent: also auth exit 10)

**CLI-to-adapter mapping.** `multi_model_review.reviewers` holds adapter names, not CLI names. Use this table whenever the wizard writes or prints a reviewer:

| CLI | Adapter name (the `reviewers` entry) |
|-----|--------------------------------------|
| `codex` | `codex-review-prompter` |
| `gemini` | `gemini-review-prompter` |
| `ollama` | `ollama-review-prompter` |
| `llm` | `llm-review-prompter` |
| `aws` | `bedrock-review-prompter` |
| `claude` | `claude-review-prompter` |
| `grok` | `grok-review-prompter` |
| `cursor-agent` | `cursor-review-prompter` |

#### 1b. Surface Three Options via AskUserQuestion

Use the `AskUserQuestion` tool to present the options:

> **Enable multi-model review (optional)?**
>
> Multi-model review fans review prompts out to multiple LLM-family proposers (OpenAI, Google, xAI, local Ollama, etc.) and consolidates findings into a single attributed list. This catches errors a single model would miss. Off by default; opt in by selecting one of the options below.
>
> Detection results: detected-and-authenticated [`<list of authenticated CLIs>`]; detected-but-unauthenticated [`<list with remediation hints>`]; detected — opt in manually [`<list>`]; not-detected [`<list>`].
>
> 1. **Enable with detected CLIs** — write `multi_model_review.enabled: true` + `reviewers: [<adapter names of ONLY authenticated CLIs>]` to `.synthex/config.yaml` (a re-run also keeps manual opt-in adapters already in `reviewers`; Step 1d). Option label lists ONLY authenticated CLIs (D22 — option only includes CLIs that pass both `which` AND auth check), never a manual opt-in CLI. When the config sets `per_reviewer.grok-review-prompter.allow_api_key_billing: true`, show grok in the label as `grok (may bill XAI_API_KEY per token)`.
> 2. **Enable later (show snippet)** — print a commented-out `multi_model_review:` YAML snippet matching the `multi_model_review:` block structure from `defaults.yaml`; detected CLIs appear as commented-out reviewers. User can uncomment when ready.
> 3. **Skip** — do not write any `multi_model_review` config. Default behavior preserved.

Print the two text listings below as plain text BEFORE asking the question, so the user reads them before choosing.

If the detection results include detected-but-unauthenticated CLIs, surface them SEPARATELY with remediation hints (per D22 — e.g., `"Detected but unauthenticated: gemini — run \`gcloud auth login\` to enable"`).

**Detected — opt in manually.** If that bucket is non-empty, print this listing as plain text before the question. It is NOT an option and adds no question; Option 1 never adds anything in it (a re-run only keeps what is already in `reviewers`; Step 1d). `cursor-agent` is always listed when detected (D43). Print one line per entry that applies (for `cursor-agent`, exactly one of its four lines):

- `cursor-agent` without both model and family in the config (any auth exit): `Detected: cursor-agent — opt in manually. Add cursor-review-prompter to reviewers and set per_reviewer.cursor-review-prompter.model (a named slug from cursor-agent models, never auto) and .family (the slug's vendor, e.g. openai for gpt-*). Named models need a paid Cursor plan: on the Free plan every Cursor review fails, and the auth check cannot see the plan. Then run cursor-agent login if you are not logged in: until model and family are set, the auth check stops before it can see your login.`
- `cursor-agent` with model and family set, auth exit 0: `Detected: cursor-agent — logged in, model and family set. Opt in manually: add cursor-review-prompter to reviewers. Named models need a paid Cursor plan: on the Free plan every Cursor review fails, and the auth check cannot see the plan.`
- `cursor-agent` with model and family set, auth exit 11: `Detected: cursor-agent — not logged in. Run cursor-agent login, then add cursor-review-prompter to reviewers.`
- `cursor-agent` with model and family set, auth exit 12: `Detected: cursor-agent — only CURSOR_API_KEY is available. Run cursor-agent login, or opt in with per_reviewer.cursor-review-prompter.allow_api_key_billing: true; every Cursor review and retry is then billed per request to that key.`
- `grok` on auth exit 12: `Detected: grok — only an xAI API key is available. Run grok login to use your grok.com session, or opt in with per_reviewer.grok-review-prompter.allow_api_key_billing: true; every Grok review and retry is then billed per token to that key.`
- `grok` when the host id is `grok` (self-review note): `Detected: grok — this session runs on Grok, so the native reviewers are already xAI models. A grok reviewer would have Grok review its own family's work, which adds no family diversity (preflight may still count it as a separate family). Add grok-review-prompter by hand only if you want a second xAI voice.`

If no CLIs are detected-and-authenticated, option 1 is still presented but its label reads "Enable with detected CLIs (none currently authenticated — authenticate a CLI first)". The option remains available; the user can still choose it and fix auth afterward.

#### 1c. Data-Transmission Warning (FR-MR27)

BEFORE writing `enabled: true` to config (option 1 only), surface the following warning verbatim:

> **Heads up — data transmission**
>
> Multi-model review sends your code, diffs, and (for write-implementation-plan) draft plan markdown to the configured external CLIs. Each CLI relays this content to its underlying provider (OpenAI, Google, xAI, Cursor, etc.) per the provider's terms of service. Synthex does not store, log, or modify this content beyond what's needed to invoke the CLI.
>
> Grok (xAI) and Cursor reviewers also:
>
> - **Run your hooks.** Grok user and plugin hooks in `$GROK_HOME` run once per Grok review. Hooks your Cursor loads, apparently including Claude Code hooks, run once per Cursor review. Synthex never edits hook configuration.
> - **Cursor is a second hop.** Cursor forwards each review to the vendor behind the model you pick, so both Cursor's and that vendor's terms apply. Models marked `(NO ZDR)` in `cursor-agent models` have no zero data retention.
> - **Cursor billing.** Cursor reviews draw on your Cursor plan and can spill into on-demand usage; every call, retries included, adds about 16k tokens of Cursor's own context.
> - **Cursor local state.** Cursor stores a transcript and a chat copy of each review under `~/.cursor`; the runner deletes that run's entries after the run.
>
> If you need to keep all review content local, configure ONLY local-model adapters (Ollama, Bedrock with on-prem model) and remove hosted-model adapters from `reviewers`.

Proceed to write the config only after this warning is displayed. (The Grok and Cursor bullets come from multi-model-review D35, D41 and D42; recipes §8–§9 have the details.)

#### 1d. Apply the Chosen Option

**Option 1 — Enable with detected CLIs:**

1. Display the data-transmission warning (step 1c).
2. Write the following keys to `.synthex/config.yaml`:
   - `multi_model_review.enabled: true`
   - `multi_model_review.reviewers: [<adapter names>]` — `reviewers` holds adapter names, never CLI names: map each CLI through the Step 1a table (e.g. `codex` → `codex-review-prompter`). Write authenticated CLIs only: the CLIs that passed both the presence check AND the auth check (D22) and are not in the "detected — opt in manually" bucket. Do NOT include detected-but-unauthenticated CLIs or manual opt-in CLIs in this list.
   - **Re-run: keep manual opt-ins.** When the existing `multi_model_review.reviewers` already holds the adapter of a CLI that is in this run's "detected — opt in manually" bucket (`cursor-review-prompter`; `grok-review-prompter` when grok is in that bucket), keep it: write the authenticated adapters first, then each kept entry in its existing order, without duplicates. Print one line per kept entry, e.g. `Kept cursor-review-prompter (manual opt-in)`. The user added it by hand, so the wizard never removes it; to remove it, edit `reviewers` or choose Reset to disabled.
3. Run the orchestrator's preflight subroutine (FR-MR20). Report the preflight summary in FR-MR20 format:
   - `N reviewers configured, M available, K families, aggregator: <name>`
   - **Preflight failure during init prints remediation but does NOT abort init.** The user can fix CLI auth and re-run preflight later.
4. Create `docs/reviews/` via `mkdir -p docs/reviews/` if not already present. Surface this in the confirmation output (e.g., `"Created docs/reviews/ for audit artifacts"`).

**Option 2 — Enable later (show snippet):**

Print the following commented-out YAML snippet (structure matches the `multi_model_review:` block in `defaults.yaml`) to the terminal so the user can copy it into `.synthex/config.yaml` when ready:

```yaml
# multi_model_review:
#   enabled: true
#   reviewers:
#     # - codex-review-prompter      # OpenAI / Codex CLI  (codex login)
#     # - gemini-review-prompter     # Google / gcloud     (gcloud auth login)
#     # - ollama-review-prompter     # Local model         (ollama serve)
#     # - grok-review-prompter       # xAI / Grok CLI      (grok login)
#     # - cursor-review-prompter     # Cursor Agent CLI    (cursor-agent login; paid plan)
#   per_reviewer:
#     grok-review-prompter:
#       allow_api_key_billing: false   # true bills XAI_API_KEY per token
#     cursor-review-prompter:
#       model: gpt-5.6-sol-high        # placeholder: a named slug from `cursor-agent models`, never auto
#       family: openai                 # placeholder: the slug's vendor
#       allow_api_key_billing: false   # true bills CURSOR_API_KEY per request
#   aggregator:
#     command: auto   # a Cursor reviewer with a flagship slug can win auto; pin another adapter (see defaults.yaml)
```

Detected CLIs appear as commented-out reviewers in the snippet. Do NOT write any `multi_model_review` keys to `.synthex/config.yaml`.

**Option 3 — Skip:**

Do not write any `multi_model_review` config. The feature remains disabled (default behavior preserved per FR-MR23).

#### Anti-pattern: do NOT write API keys to config

Synthex is CLI-only. The config does NOT contain API keys. Auth is the responsibility of each CLI's native auth flow (`codex login`, `gcloud auth login`, `ollama serve`, `grok login`, `cursor-agent login`, etc.). Never prompt for or store API keys during configuration. `allow_api_key_billing` is a boolean opt-in, not a key, and the wizard never sets it to `true`.

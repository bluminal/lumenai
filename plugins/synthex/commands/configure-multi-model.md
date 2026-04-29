---
model: haiku
---

# Configure Multi-Model Review

Configure (or re-configure) multi-model review for this project. Multi-model review fans review prompts out to multiple LLM-family proposers (OpenAI, Google, local Ollama, etc.) and consolidates findings into a single attributed list. This catches errors a single model would miss.

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
> 1. **Re-run the wizard** — re-detect installed CLIs and overwrite `multi_model_review.reviewers`. The data-transmission warning (Step 1c) will be re-displayed before any write.
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

For each candidate CLI in `[codex, gemini, ollama, llm, aws, claude]`, run BOTH a `which` check AND a lightweight auth check per the adapter's documented auth check command (D22 — auth pre-validation):

| CLI | `which` check | Auth check command |
|-----|---------------|--------------------|
| `codex` | `which codex` | `codex auth status` |
| `gemini` | `which gemini` | `gcloud auth list` |
| `ollama` | `which ollama` | `curl -sf http://localhost:11434/api/tags > /dev/null` |
| `llm` | `which llm` | `llm keys list` |
| `aws` | `which aws` | `aws sts get-caller-identity --output text` |
| `claude` | `which claude` | `claude --version` |

**All `which` and auth checks dispatch concurrently in a single parallel Bash batch** — preflight wall-clock is bounded by the slowest single check + collation overhead, not by the sum of per-CLI latencies.

Auth checks that exit 0 are treated as authenticated regardless of advisory text on stdout/stderr. Only the exit code determines the auth result.

Bucket results into three groups after collation:

- **detected-and-authenticated** — `which` AND auth check both exited 0
- **detected-but-unauthenticated** — `which` exited 0; auth check exited non-zero
- **not-detected** — `which` exited non-zero

#### 1b. Surface Three Options via AskUserQuestion

Use the `AskUserQuestion` tool to present the options:

> **Enable multi-model review (optional)?**
>
> Multi-model review fans review prompts out to multiple LLM-family proposers (OpenAI, Google, local Ollama, etc.) and consolidates findings into a single attributed list. This catches errors a single model would miss. Off by default; opt in by selecting one of the options below.
>
> Detection results: detected-and-authenticated [`<list of authenticated CLIs>`]; detected-but-unauthenticated [`<list with remediation hints>`]; not-detected [`<list>`].
>
> 1. **Enable with detected CLIs** — write `multi_model_review.enabled: true` + `reviewers: [<ONLY authenticated CLIs by name>]` to `.synthex/config.yaml`. Option label lists ONLY authenticated CLIs (D22 — option only includes CLIs that pass both `which` AND auth check).
> 2. **Enable later (show snippet)** — print a commented-out `multi_model_review:` YAML snippet matching the `multi_model_review:` block structure from `defaults.yaml`; detected CLIs appear as commented-out reviewers. User can uncomment when ready.
> 3. **Skip** — do not write any `multi_model_review` config. Default behavior preserved.

If the detection results include detected-but-unauthenticated CLIs, surface them SEPARATELY with remediation hints (per D22 — e.g., `"Detected but unauthenticated: gemini — run \`gcloud auth login\` to enable"`).

If no CLIs are detected-and-authenticated, option 1 is still presented but its label reads "Enable with detected CLIs (none currently authenticated — authenticate a CLI first)". The option remains available; the user can still choose it and fix auth afterward.

#### 1c. Data-Transmission Warning (FR-MR27)

BEFORE writing `enabled: true` to config (option 1 only), surface the following warning verbatim:

> **Heads up — data transmission**
>
> Multi-model review sends your code, diffs, and (for write-implementation-plan) draft plan markdown to the configured external CLIs. Each CLI relays this content to its underlying provider (OpenAI, Google, etc.) per the provider's terms of service. Synthex does not store, log, or modify this content beyond what's needed to invoke the CLI.
>
> If you need to keep all review content local, configure ONLY local-model adapters (Ollama, Bedrock with on-prem model) and remove hosted-model adapters from `reviewers`.

Proceed to write the config only after this warning is displayed.

#### 1d. Apply the Chosen Option

**Option 1 — Enable with detected CLIs:**

1. Display the data-transmission warning (step 1c).
2. Write the following keys to `.synthex/config.yaml`:
   - `multi_model_review.enabled: true`
   - `multi_model_review.reviewers: [<authenticated CLIs only>]` — list contains ONLY the CLIs that passed both `which` AND auth check (D22). Do NOT include detected-but-unauthenticated CLIs in this list.
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
#   aggregator:
#     command: auto
```

Detected CLIs appear as commented-out reviewers in the snippet. Do NOT write any `multi_model_review` keys to `.synthex/config.yaml`.

**Option 3 — Skip:**

Do not write any `multi_model_review` config. The feature remains disabled (default behavior preserved per FR-MR23).

#### Anti-pattern: do NOT write API keys to config

Synthex is CLI-only. The config does NOT contain API keys. Auth is the responsibility of each CLI's native auth flow (`codex login`, `gcloud auth login`, `ollama serve`, etc.). Never prompt for or store API keys during configuration.

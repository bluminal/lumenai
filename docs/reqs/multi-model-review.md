# Product Requirements Document: Multimodal Review Orchestration

## 1. Vision & Purpose

**Why this exists:** Synthex's review commands (`review-code`, `write-implementation-plan`, `refine-requirements`, `write-rfc`, `reliability-review`, `performance-audit`) currently run all reviewers on a single model family — the Claude model that hosts the session. This is a known failure mode: same-family models share blind spots (correlated errors, [arXiv:2506.07962](https://arxiv.org/html/2506.07962v1)), so a single-family review ensemble has a ceiling that no amount of additional Claude reviewers can raise.

**Multimodal review** breaks that ceiling by fanning review prompts out to multiple LLM families (Claude, GPT, Gemini, local open-source models) and consolidating the results into one deduplicated, severity-reconciled, attributed findings list. The pattern is modeled on Cloudflare's production "Review Coordinator" architecture and Mixture-of-Agents ([arXiv:2406.04692](https://arxiv.org/abs/2406.04692)), which show measurable lift over single-model review when model family diversity is enforced.

**Design commitment:** the feature ships **off by default** and is **CLI-only** — Synthex never touches provider API keys, and each external reviewer runs through the developer's existing CLI (`codex`, `gemini`, `ollama`, `llm`, `aws bedrock-runtime`, etc.). This inherits the developer's configured auth, MCP servers, approval modes, and model routing for free, and keeps Synthex's credential surface area at zero.

**The Multimodal Review Orchestrator** is the new agent introduced by this PRD. It accepts a review artifact (diff, plan, PRD, RFC, etc.) from a calling agent or command, invokes N configured **provider adapter agents** in parallel, consolidates their findings, and returns a single unified review with per-finding attribution and consensus metadata.

---

## 2. Target Users / Personas

| Persona | Description | Primary Need |
|---------|-------------|--------------|
| **Quality-Conscious Developer** | Uses Synthex for code review and wants higher recall on bugs, security issues, and design flaws | Multi-family ensemble review that catches what a single model misses |
| **Regulated-Industry Lead** | Works in fintech/healthcare/gov where review rigor is a compliance concern | Auditable review trail with attribution to multiple independent reviewers |
| **Cost-Conscious Solo Developer** | Wants multi-model review without vendor lock-in or new credentials | CLI-based setup that reuses existing tool installs and auth |
| **Local-First Developer** | Runs models locally (Ollama, llamafile) for privacy or offline work | First-class local model support alongside hosted providers |
| **Automation Operator** | Runs Synthex commands in CI or scheduled loops | Predictable failure behavior — flaky CLIs must not break automation |

---

## 3. Terminology

| Term | Definition |
|------|------------|
| **Multimodal review** | Review orchestrated across multiple LLM families. ("Multi-model" is the more technically precise term; "multimodal" is used throughout Synthex for consistency with the branch and user terminology, and does not refer to vision/audio modalities.) |
| **Proposer** | An external LLM invoked via a CLI adapter that produces a set of review findings. Cheap/fast models (Sonnet, GPT-5-mini, Gemini Flash, local Qwen). |
| **Aggregator** | The LLM that consolidates all proposers' findings into a single output — handles dedup, severity reconciliation, contradiction resolution, and attribution. A stronger model (Opus, GPT-5, Gemini Ultra) or, by default, the host Claude session. |
| **Adapter agent** | A Haiku-backed Synthex utility agent that wraps a specific provider CLI (`codex-review-prompter`, `gemini-review-prompter`, etc.). Handles invocation, output parsing, and normalization to the canonical finding schema. |
| **Orchestrator agent** | `multimodal-review-orchestrator` — the new Synthex agent that drives the full flow: fan-out to adapters, consolidation, return to caller. |
| **Canonical finding** | A normalized finding record produced by any adapter, conforming to the shared JSON schema (see FR-MR13). |
| **Consensus badge** | Metadata on each consolidated finding indicating how many reviewers (and which families) flagged it (e.g., "3/4 · Claude+GPT+Gemini"). |
| **Strict mode** | A configuration option (off by default) that makes any proposer failure abort the entire review instead of degrading gracefully. |
| **Fallback** | Behavior when all configured proposers fail: the orchestrator returns control to the native single-model review path (existing Synthex reviewers on the host Claude), surfacing the fallback to the user. |

---

## 4. Functional Requirements

### 4.1 Core Architecture

**FR-MR1: Two-tier orchestration**

The system uses a **proposers-plus-aggregator** architecture:

1. **Proposer tier:** N external LLMs (one per configured reviewer) each produce independent review findings on the same artifact. Proposers run in parallel. The model per proposer should be fast/cheap-leaning (Sonnet-class, GPT-5-mini, Gemini Flash, local Qwen) — exact choice is governed by whatever the user's CLI config selects.
2. **Aggregator tier:** A single stronger model consolidates proposer outputs (dedup, severity reconciliation, contradiction resolution) and emits one consolidated findings list.

**Acceptance Criteria:**
- Proposer invocations are fan-out parallel, not sequential
- Aggregator runs exactly once per review cycle, after all proposers have returned (or timed out)
- The aggregator is a distinct step from any individual proposer, even when the aggregator model family overlaps with a proposer family

**FR-MR2: CLI-only provider integration**

All proposer invocations shell out to CLI tools installed on the user's host. Synthex does not:
- Store, read, or transmit provider API keys
- Make direct HTTP calls to provider APIs
- Bundle provider SDKs

**Acceptance Criteria:**
- Each adapter agent invokes its target CLI via Bash with the CLI's documented non-interactive mode
- No provider credentials appear in Synthex config, environment, or logs
- On a machine with no provider CLIs installed, the feature fails cleanly (see FR-MR17) rather than attempting a direct API call

**FR-MR3: Off by default**

Multimodal review is disabled unless the user explicitly enables it in `.synthex/config.yaml`. The zero-config experience is unchanged from today: single-model review using the host Claude session.

**Acceptance Criteria:**
- With no `multimodal_review` section in the user's config, all review commands behave identically to their pre-feature behavior
- Enabling the feature requires both a config entry AND at least one configured reviewer passing preflight validation

**FR-MR4: Model family diversity**

The orchestrator enforces a minimum of **two distinct model families** in the proposer pool when multimodal mode is active. Configurations with only one family produce a warning at preflight and a repeated warning on the first invocation. This mitigates the correlated-errors failure mode ([arXiv:2506.07962](https://arxiv.org/html/2506.07962v1)).

**Acceptance Criteria:**
- Preflight detects family diversity from adapter metadata (each adapter declares its family)
- Single-family configurations are warned, not blocked — users retain the ability to opt into lower diversity
- The warning includes a one-sentence explanation of why diversity matters

---

### 4.2 Configuration

**FR-MR5: Configuration schema**

A new top-level section in `.synthex/config.yaml`:

```yaml
multimodal_review:
  enabled: false                    # Master switch. Default: false.
  strict_mode: false                # See FR-MR17. Default: false.
  min_family_diversity: 2           # See FR-MR4. Default: 2.
  min_proposers_to_proceed: 1       # See FR-MR16. Default: 1.
  aggregator:
    command: auto                   # "auto" picks the strongest available from the reviewer list.
                                    # Or set to an explicit adapter name: claude, codex, gemini, etc.
    model: auto                     # Optional: pin a specific model within the chosen CLI.
  reviewers:
    - name: claude-opus             # User-facing label, must be unique
      adapter: claude-review-prompter
      model: claude-opus-4-7
      family: anthropic
      enabled: true
    - name: gpt-5
      adapter: codex-review-prompter
      model: gpt-5
      family: openai
      enabled: true
    - name: gemini-2-5-pro
      adapter: gemini-review-prompter
      model: gemini-2.5-pro
      family: google
      enabled: true
    # - name: local-qwen
    #   adapter: llm-review-prompter
    #   model: ollama/qwen2.5-coder:32b
    #   family: local-qwen
    #   enabled: false
  per_command:
    review_code:
      enabled: true                 # Per-command override of the master switch
      strict_mode: false
    write_implementation_plan:
      enabled: true
    refine_requirements:
      enabled: false                # Opt out per-command even when master is on
  audit:
    enabled: true
    output_path: docs/reviews        # Where to write the audit artifact (FR-MR24)
```

**Resolution order:** `per_command.<cmd>.<setting>` > `multimodal_review.<setting>` > hardcoded default.

**FR-MR6: Per-command invocation override**

Each multimodal-capable command accepts an explicit flag/parameter to override config at invocation time:

- `--multimodal` / `multimodal: true` — force multimodal review on for this invocation
- `--no-multimodal` / `multimodal: false` — force single-model review for this invocation
- Default (no flag): use the resolved config value

**Acceptance Criteria:**
- The flag overrides both the master switch and any `per_command` entry
- A user with multimodal disabled can run a one-off multimodal review with `--multimodal`
- A user with multimodal enabled can run a one-off single-model review with `--no-multimodal`

---

### 4.3 Provider Adapter Agents

**FR-MR7: Adapter layer**

A new row in the Synthex agent hierarchy: the **Review Adapter Layer**. Each adapter is a Haiku-backed utility agent (consistent with `findings-consolidator`, `plan-linter`, `plan-scribe`). Adapters are not invoked directly by users; they are invoked only by the multimodal-review-orchestrator.

**FR-MR8: Adapter responsibilities**

Every adapter must:

1. **Detect CLI presence** via `which <cli>` before invocation. On miss, return a structured `cli_missing` error with the install one-liner and documentation URL.
2. **Construct the non-interactive invocation** with the correct flags to disable TUI, approval prompts, file-edit tools, and streaming (where appropriate). Each adapter documents the exact flag set it uses.
3. **Compose the reviewer prompt** from the canonical input (role, artifact, context, output schema) per FR-MR9.
4. **Capture stdout cleanly** — strip ANSI codes, banners, and non-content prelude/postlude.
5. **Parse the provider-specific envelope** (JSON for `codex exec --json`, `claude -p --output-format json`, `gemini --output-format json`, Ollama HTTP, etc.) into the canonical finding schema (FR-MR13).
6. **Retry once** on malformed output with a clarification appended to the prompt ("Your previous response did not conform to the required schema; emit ONLY the JSON envelope described above."). On second failure, return a `parse_failed` error.
7. **Return a normalized result envelope** (FR-MR9) to the orchestrator. Always return — never raise or leave the caller hanging.
8. **Surface cost/token counts** when the CLI reports them (best-effort; not required).

**FR-MR9: Adapter input/output contract**

**Input (passed by the orchestrator, via a JSON blob on the adapter's invocation prompt):**

```json
{
  "role": "security-reviewer",
  "artifact_path": "/tmp/multimodal-review-<uuid>.md",
  "context": {
    "project_root": "/path/to/repo",
    "specs_paths": ["docs/specs/"],
    "convention_sources": ["CLAUDE.md"],
    "config_subset": { "...": "..." }
  },
  "output_schema": { "...": "JSON schema for the canonical finding list" },
  "cli_config": {
    "command": ["codex", "exec", "--json", "--sandbox", "read-only"],
    "model": "gpt-5",
    "timeout_seconds": 180
  }
}
```

**Output (returned to the orchestrator):**

```json
{
  "reviewer_id": "gpt-5 (codex)",
  "family": "openai",
  "status": "ok | partial | failed",
  "error": null,
  "error_code": "cli_missing | cli_auth_failed | cli_timeout | parse_failed | cli_error | null",
  "findings": [
    {
      "finding_id": "security/auth/missing-csrf",
      "title": "Missing CSRF protection on state-changing endpoint",
      "severity": "high",
      "category": "security",
      "file": "src/api/auth.ts",
      "line_range": [42, 58],
      "symbol": "loginHandler",
      "description": "...",
      "evidence": "...",
      "recommendation": "..."
    }
  ],
  "usage": {
    "input_tokens": 12847,
    "output_tokens": 1420,
    "reported_cost_usd": null
  },
  "raw_output_path": "/tmp/multimodal-raw-<uuid>-<reviewer>.txt"
}
```

**Acceptance Criteria:**
- All adapters emit this exact envelope shape
- `finding_id` uses the canonical form `<category>/<subcategory>/<rule-slug>` — NEVER includes line numbers (per SAST dedup best practice)
- `raw_output_path` is always populated so the orchestrator can audit/re-parse if needed

**FR-MR10: First-class adapter set (v1)**

The initial adapter set ships with the plugin and covers the providers users are most likely to already have installed:

| Adapter | Wraps | Covers | Default Family |
|---------|-------|--------|----------------|
| `claude-review-prompter` | `claude -p --output-format json` | Anthropic (Sonnet/Opus/Haiku), including Bedrock/Vertex routing via env vars | `anthropic` |
| `codex-review-prompter` | `codex exec --json --sandbox read-only` | OpenAI (GPT-5, o-series); also any OpenAI-compatible base URL the user has configured in Codex | `openai` |
| `gemini-review-prompter` | `gemini -p --output-format json` | Google (Gemini 2.5/3) | `google` |
| `ollama-review-prompter` | `ollama run` + HTTP API with `format: <schema>` | Any local Ollama model (Llama, Qwen, DeepSeek, Gemma, Mistral) | `local-<model>` |
| `llm-review-prompter` | `llm -m <model> --schema <file>` | Universal adapter — 50+ providers via `llm` plugins (OpenRouter, Groq, Mistral, Cohere, Bedrock) | Inferred from the `llm` model ID prefix |
| `bedrock-review-prompter` | `aws bedrock-runtime invoke-model` | AWS Bedrock (Claude, Llama, Nova, Titan, Mistral) — for users with AWS creds but no per-vendor CLI | Inferred from Bedrock model ID |

**Acceptance Criteria:**
- Each adapter has its own `.md` definition in `plugins/synthex/agents/`
- Each adapter is listed in `plugins/synthex/.claude-plugin/plugin.json`
- Each adapter's file documents: the CLI invocation shape, auth expectations, output parsing logic, known gotchas, and install one-liner

---

### 4.4 Orchestrator Agent

**FR-MR11: Multimodal Review Orchestrator**

A new agent — `multimodal-review-orchestrator` — is introduced. It is invoked by review commands (or by calling agents directly) whenever multimodal mode is active. It is a **Sonnet-backed** agent (not Haiku) because its consolidation work involves non-trivial reasoning: severity judgement, contradiction detection, CoVe verification.

**FR-MR12: Parallel fan-out**

The orchestrator invokes all enabled adapter agents in parallel via the Task tool. Each adapter runs independently and does not see other adapters' outputs.

**Acceptance Criteria:**
- All adapter invocations are launched in a single batch (parallel Task calls)
- The orchestrator waits for all adapters to complete (or timeout) before beginning consolidation
- Adapter timeouts are enforced per-adapter, not globally — one slow adapter does not stall faster ones beyond their own timeout

**FR-MR13: Canonical finding schema**

All findings flow through the orchestrator in a single canonical schema:

```json
{
  "finding_id": "<category>/<subcategory>/<rule-slug>",
  "title": "<short human-readable title>",
  "severity": "critical | high | medium | low",
  "category": "<top-level category: security | correctness | performance | ...>",
  "file": "<file path or null>",
  "line_range": [start, end] or null,
  "symbol": "<function/class name or null>",
  "description": "<what's wrong>",
  "evidence": "<quoted code or plan text that supports the finding>",
  "recommendation": "<suggested fix>"
}
```

The `finding_id` MUST NOT include line numbers. Line numbers are recorded in `line_range` only; using them in the fingerprint breaks dedup across refactors and is the documented failure mode in SAST tools (Checkmarx SimilarityId, Semgrep fingerprint, GitLab SAST).

**FR-MR14: Consolidation pipeline**

The orchestrator consolidates proposer outputs through a four-stage pipeline, with a fifth reconciliation step:

**Stage 1 — Fingerprint dedup (mechanical):**
Group findings by exact `finding_id` match. A group becomes a single consolidated finding.

**Stage 2 — Lexical dedup within co-located buckets:**
For findings sharing the same `(file, symbol)` tuple but different `finding_id`, compute title similarity (Jaccard on normalized tokens, or MinHash for larger sets). Merge pairs with similarity above a configured threshold (default: 0.8).

**Stage 3 — Semantic dedup within co-located buckets:**
For remaining pairs in the same `(file, symbol)` bucket, compute cosine similarity on title+description embeddings. Merge pairs above a configured threshold (default: 0.85). Implementation note: the orchestrator may call a lightweight embedding model via `llm embed` or request an embedding from the host Claude session, whichever is available.

**Stage 4 — LLM tiebreaker for ambiguous pairs:**
For pairs above 0.7 but below 0.85 embedding similarity, the orchestrator asks itself (the aggregator LLM): "Are these two findings reporting the same issue? Answer only 'duplicate' or 'distinct'." Position is randomized across the two findings to mitigate position bias.

**Stage 5 — Severity reconciliation (FR-MR14a):**

After dedup, every consolidated finding carries N severities (one per contributing reviewer). Resolution:

- **If all contributors agree:** use the agreed severity.
- **If contributors disagree by exactly one level** (e.g., medium vs. high): take the **max** and record the range in the output.
- **If contributors disagree by two or more levels** (e.g., low vs. high): trigger the **judge step** — the orchestrator emits a short CoT prompt to itself referencing the diff and the disagreement, and selects a severity with written reasoning. The original per-reviewer severities are always preserved in the output.

**Stage 6 — Contradiction detection and CoVe verification:**

After dedup and severity reconciliation, the orchestrator scans for **contradictions** — pairs of findings that make mutually incompatible claims about the same location (e.g., "add retry logic here" vs. "don't retry here — not idempotent"). Contradictions are not duplicates; they require adjudication.

For each contradiction, the orchestrator performs a **Chain-of-Verification** pass ([arXiv:2309.11495](https://arxiv.org/abs/2309.11495)): it re-reads the relevant portion of the artifact independently of the contradicting reviewer texts, answers the underlying verification question (e.g., "is this operation idempotent?"), and keeps the finding consistent with its independent analysis. The other finding is preserved in the output but marked `superseded_by_verification` with the reasoning. Both remain visible to the user; only the severity and prominence differ.

**FR-MR14b: Never drop minority-of-one findings**

A finding flagged by only one reviewer is **never dropped** on the basis of low consensus alone. Minority-of-one findings are demoted one severity level (critical→high, high→medium, medium→low, low→low) UNLESS the finding is `security` category (never demoted) OR the reviewer has explicitly high confidence. This implements the committee-effect mitigation noted in the design research: sharp insights from a single model are disproportionately valuable and must not be averaged away.

**FR-MR15: Aggregator identity and bias mitigation**

The aggregator is configurable (`multimodal_review.aggregator.command`). Default behavior:

- **`auto`:** select the strongest proposer in the configured list by a hardcoded tier table (Opus > GPT-5 > Gemini Ultra > Sonnet > GPT-5-mini > ...). If the strongest proposer is also a reviewer, the aggregator invocation uses a separate, freshly-spawned CLI call with a judge-mode system prompt.
- **Explicit:** the user names a specific adapter (e.g., `claude-review-prompter` with `model: claude-opus-4-7`).

**Bias mitigation applied by the orchestrator regardless of choice:**
1. **Position randomization** — the order in which per-reviewer findings are presented to the aggregator is randomized per invocation.
2. **Judge-mode system prompt** — explicit instructions to the aggregator to weigh findings on their merits, cite per-reviewer attribution in the output, and never prefer findings from any specific reviewer.
3. **Author-judge separation warning** — if the selected aggregator family is also the only proposer family, preflight emits a warning explaining self-preference bias.

**Acceptance Criteria:**
- `aggregator.command: auto` resolves deterministically given a configured reviewer list
- Every aggregator invocation includes the randomization and system prompt above
- Self-preference bias is detectable and warned about in config validation

---

### 4.5 Failure Handling and Degradation

This section is the most documentation-heavy part of the PRD because its behavior directly affects automation loops and hands-off CI flows. Users must understand exactly what happens when a reviewer CLI fails, and the trade-off between resilience (default) and strictness (opt-in).

**FR-MR16: Graceful degradation (default behavior)**

When `strict_mode: false` (default), the orchestrator handles proposer failures as follows:

1. **Per-reviewer failure categories:**
   - `cli_missing` — `which` returned nothing. Skip reviewer, record `error_code: cli_missing`.
   - `cli_auth_failed` — CLI reports unauthenticated (e.g., `codex login` not run, expired token). Skip reviewer, record `error_code: cli_auth_failed`.
   - `cli_timeout` — adapter exceeded its per-reviewer timeout. Skip reviewer, record `error_code: cli_timeout`.
   - `parse_failed` — adapter could not parse CLI output into the canonical schema even after one retry. Skip reviewer, record `error_code: parse_failed`.
   - `cli_error` — CLI exited non-zero for any other reason. Skip reviewer, record `error_code: cli_error` with stderr excerpt.

2. **Degradation threshold:** the review proceeds as long as **at least `min_proposers_to_proceed`** (default: 1) reviewers succeed. The default of 1 is deliberately permissive — a review with even one successful multimodal reviewer is still more useful than nothing, and multimodal mode is opt-in in the first place.

3. **If ALL proposers fail:** the orchestrator falls back to the **native single-model review path** (FR-MR17) and surfaces the fallback prominently in the output.

4. **Family-diversity warning on degradation:** if degradation drops the successful reviewer count below `min_family_diversity`, emit a warning on the output but continue. The warning is a soft nudge, not a block.

**Acceptance Criteria:**
- Each failure category produces a distinct, machine-readable `error_code`
- The user-facing output lists every failed reviewer with its error category and a remediation hint
- The review never silently drops a failed reviewer — failures are always reported

**FR-MR17: Fallback to native single-model review**

When all configured proposers fail AND `strict_mode: false`, the orchestrator does NOT abort. Instead it:

1. Emits a prominent warning to the user: "All multimodal reviewers failed. Falling back to single-model review using the host Claude session."
2. Lists each failed reviewer with its error code and remediation hint.
3. Hands control to the command's pre-existing native review path (e.g., `review-code` invokes Code Reviewer + Security Reviewer on Claude, exactly as today).
4. The audit artifact (FR-MR24) records the failure, the fallback decision, and which single-model reviewers ran.

This fallback ensures that enabling multimodal review never makes a command less reliable than single-model review. The worst-case outcome is "same quality as before, with a warning."

**Acceptance Criteria:**
- Fallback triggers only when all proposers fail AND strict mode is off
- The user sees a visible warning, not a silent fallback
- The audit artifact records both the failure and the fallback
- Fallback uses the exact same native reviewer set that would have been used if multimodal were disabled

**FR-MR18: Strict mode**

When `strict_mode: true`, the orchestrator treats ANY proposer failure as fatal: the command aborts with a non-zero exit signal and surfaces the full list of failed reviewers.

**Why this matters — documentation for users:**

Strict mode is intended for workflows where review quality is a compliance or correctness invariant — a security-sensitive merge, a regulated-industry change gate, a manual review where a silent degradation would hide the fact that some reviewers never ran. In those contexts, "proceed with what we have" is the WRONG behavior; the reviewer failing means the human needs to know now, fix the CLI, and re-run.

**Why it's off by default — documentation for users:**

Strict mode is off by default because it can **break hands-off automation loops**. Reviewer CLIs fail for mundane reasons that are not the developer's fault: transient provider outages, rate limits, expired OAuth tokens, a network glitch, an updated CLI with a changed flag. A CI pipeline running `/review-code` on every PR, or a scheduled `/next-priority` loop, will break unpredictably if strict mode is on. The default behavior — degrade gracefully, surface the failure in the report — preserves automation while making failures visible.

**When to turn strict mode ON:**
- You require a complete review as a hard precondition for a downstream action (e.g., auto-merge, deploy approval)
- Your workflow has a human in the loop who will re-run on failure
- You are in an interactive development context where transient failures are acceptable to surface

**When to keep strict mode OFF:**
- You run Synthex commands in CI, cron, or other unattended automation
- You want review to be best-effort — "better a partial review than no review"
- You prefer to see failed reviewers in the output and triage them asynchronously

**Per-command override:** `per_command.<cmd>.strict_mode` can override the global setting. A common configuration pattern is: strict mode ON for `write-implementation-plan` (high-stakes, interactive), strict mode OFF for `review-code` in CI (automated, want best-effort).

**Acceptance Criteria:**
- `strict_mode: true` aborts on the first proposer failure (or, at orchestrator discretion, after all proposers have returned, to give a complete failure report)
- The abort produces a clear, actionable error message listing all failed reviewers
- The strict-mode setting is documented in `defaults.yaml` with commentary matching the explanation above
- The `init` command's configuration guide references strict mode and its trade-offs

---

### 4.6 Discoverability

**FR-MR19: `init` command advertises the feature**

The `init` command is updated to introduce multimodal review during project setup. Because the feature is off by default and requires external CLI configuration, discoverability depends on the user learning about it at init time.

**Changes to `init`:**

1. After the existing concurrent-tasks prompt, add a new section: **"Multimodal review (optional)"**.
2. Briefly describe the feature: "Synthex can run reviews across multiple LLM families (Claude, GPT, Gemini, local models) via CLIs you already have installed. Off by default."
3. Detect locally-available CLIs via `which` for each first-class adapter (FR-MR10) and report which are installed.
4. Use `AskUserQuestion` to ask whether to enable multimodal review with the detected CLIs as defaults. Options:
   - "Enable with detected CLIs" — writes `multimodal_review.enabled: true` and reviewers matching detected CLIs
   - "Enable later (show config snippet)" — leaves `enabled: false` and prints a commented-out config snippet with setup instructions
   - "Skip" — no changes, no snippet
5. If the user enables it, run the preflight validation once (FR-MR20) and show the result.

**Acceptance Criteria:**
- `init` detects installed CLIs without asking the user to enumerate them
- Users who skip the prompt get no configuration changes and no surprises
- Users who enable the feature get a config that works, including sensible defaults for `aggregator` and `strict_mode`
- The init output includes a link/reference to the full docs for multimodal review

**FR-MR20: Preflight validation**

A preflight check runs on every multimodal-review invocation AND at the end of `init` if the feature was enabled. Preflight:

1. Confirms every configured reviewer's adapter has its CLI available (`which`).
2. For CLIs that support a lightweight auth check (e.g., `codex whoami`, `gcloud auth list`, `aws sts get-caller-identity`), attempts that check and records the result.
3. Confirms `min_family_diversity` is met (or emits the warning per FR-MR4).
4. Confirms `min_proposers_to_proceed` ≤ number of enabled reviewers.
5. Validates `aggregator.command: auto` resolves to a real adapter in the reviewer list (or that an explicit aggregator is in the list).
6. Reports a summary: `N reviewers configured, M available, K families, aggregator: <name>`.

Preflight failures (not warnings) block the invocation with a clear remediation message. Warnings do not block.

**Acceptance Criteria:**
- Preflight runs in < 2 seconds on a reasonable config
- Preflight output is machine-parseable (for future automation) and human-readable
- Preflight never modifies user config

---

### 4.7 Command Integration

**FR-MR21: `review-code` integration (v1 scope)**

`review-code` is updated to detect and use multimodal review when enabled:

1. After Step 1 (Load Configuration), the command checks `multimodal_review.per_command.review_code.enabled` (or the `--multimodal` / `--no-multimodal` override).
2. If multimodal is active:
   - The command invokes `multimodal-review-orchestrator` with the diff and context as the artifact.
   - The orchestrator's consolidated findings replace the native Code Reviewer + Security Reviewer (+ optional Performance Engineer) output in the unified report.
   - The unified report format (`## Code Review Report`) is preserved; the reviewer table shows one row per multimodal reviewer plus a synthetic "Aggregator" row.
3. If multimodal is inactive (or falls back per FR-MR17): behavior is unchanged from today.
4. The review loop (Step 6) continues to work: on FAIL verdict, the command re-invokes the orchestrator with the updated diff on the next cycle.

**Acceptance Criteria:**
- `review-code --multimodal` runs multimodal mode even if disabled in config
- `review-code --no-multimodal` runs native mode even if enabled in config
- The unified report shows per-reviewer verdicts (PASS/WARN/FAIL) and counts for each multimodal reviewer
- Design-system compliance for UI changes (today's automatic behavior) continues to run even in multimodal mode, as a separate Synthex-native review (design-system is a specialized advisory role, not a generic review)

**FR-MR22: `write-implementation-plan` integration (v1 scope)**

`write-implementation-plan` is updated similarly:

1. The plan review step (currently runs Architect, Designer, Tech Lead as reviewers) becomes multimodal-aware.
2. When multimodal is active, the orchestrator is invoked with the draft plan as the artifact. The reviewer **role** remains "plan reviewer" — but the orchestrator fans out to the configured external LLM reviewers rather than spawning Synthex's Architect/Designer/Tech Lead sub-agents.
3. **Important role-mapping question (Open Question OQ-1):** should each external model play the "plan reviewer" generalist role, or should each external model receive a different Synthex reviewer prompt (one plays Architect, one plays Designer, etc.)? The PRD defers this to implementation with a preference for the first option (every external model reviews as a generalist) because (a) it keeps the orchestrator simple, (b) it preserves the canonical comparison "did model X see issue Y that model Z missed", and (c) role-specific prompting can be added later without breaking this pattern.
4. The Product Manager's decision-and-revision flow (invoking `plan-scribe` to apply decided edits) is unchanged.

**Acceptance Criteria:**
- Multimodal plan review produces findings in the same structure Architect/Designer/Tech Lead would
- The PM agent receives consolidated findings identical in shape to today's output
- `plan-linter` (pre-review structural check) is unaffected — it runs before the orchestrator, as today

**FR-MR23: Command behavior when multimodal is inactive**

Every command touched by this PRD must preserve its current behavior when `multimodal_review.enabled: false` OR when `--no-multimodal` is passed. Test coverage must include a regression test that asserts identical output for a representative fixture with multimodal disabled.

**Acceptance Criteria:**
- Disabling multimodal produces byte-identical command behavior to today (modulo non-deterministic LLM outputs)
- Enabling multimodal then disabling it returns to pre-enablement behavior

---

### 4.8 Audit Artifact

**FR-MR24: Review audit file**

Every multimodal review invocation writes an audit file to `docs/reviews/` (configurable). File naming: `<YYYY-MM-DD>-<command>-<short-hash>.md`.

Contents:

1. **Invocation metadata** — command, target/artifact, timestamp, git commit, Synthex version
2. **Configuration snapshot** — the resolved `multimodal_review` config used for this invocation (strict mode, reviewers, aggregator)
3. **Preflight result** — which CLIs were available, family diversity, warnings
4. **Per-reviewer results** — for each proposer: status, error code if any, finding count, token usage, raw output path (under `/tmp` or a per-run subdirectory)
5. **Consolidated findings** — the final output, same format as returned to the caller
6. **Aggregator trace** — which findings were merged, which were flagged as contradictions, which triggered the severity judge, which were demoted as minority-of-one
7. **Fallback event** (if applicable) — failure trigger, fallback path taken

**Acceptance Criteria:**
- Audit files are written for every invocation, including failed ones
- Audit files are self-contained — a reader can reconstruct exactly what happened from the file alone
- Audit files do NOT contain provider API keys, tokens, or any secret material (CLIs handle auth; Synthex never sees secrets, so this is a design-invariant guarantee rather than a filter)
- The `audit.enabled: false` configuration disables audit file creation for users with privacy or disk-space concerns

---

### 4.9 Security and Safety

**FR-MR25: No credential handling**

Per FR-MR2, Synthex never handles provider credentials. This is both a security property and a documentation property: the PRD must state explicitly that users configure their CLIs (via `codex login`, `gemini auth`, `aws configure`, etc.) independently of Synthex, and that Synthex relies on the CLI's existing auth state.

**FR-MR26: Subprocess sandboxing**

Each adapter invocation MUST use the CLI's most restrictive non-interactive sandbox mode to prevent the external LLM from making unintended changes to the developer's machine:

- `codex exec` — `--sandbox read-only --approval-mode never`
- `claude -p` — `--permission-mode plan` (plan-only) OR `--disallowed-tools Edit,Write,Bash` when a tool-shaped CLI is unavoidable
- `gemini` — equivalent read-only flag set
- `opencode run` — `--mode plan` or equivalent
- Ollama / `llm` / direct SDK CLIs — no agentic tools, so sandboxing is a non-issue

Adapter definitions document their exact sandbox flag set. Review prompts instruct the reviewer LLM that it is operating in read-only mode and that its job is to emit findings, not to modify files.

**Acceptance Criteria:**
- No adapter can, through normal operation, cause the reviewer LLM to edit files, run destructive shell commands, or persist state outside `/tmp`
- Sandbox flags are verified in adapter integration tests against each supported CLI
- If a CLI removes or changes a sandbox flag, the adapter fails fast with a clear error rather than invoking unsafely

**FR-MR27: Artifact redaction guidance**

Because artifacts (diffs, plans) are sent to external providers, the PRD surfaces — but does not solve — the concern that sensitive code or requirements may be transmitted. The solution is documentation, not enforcement:

- The `init` discoverability prompt (FR-MR19) includes a warning: "Multimodal review sends your code/plans/PRD to the configured external providers. Confirm this matches your organization's data-handling policy."
- The audit artifact (FR-MR24) records which providers received the content.
- The `reviewers` list in config supports an `enabled: false` pattern for quickly disabling a provider (e.g., if you want to exclude hosted providers from a sensitive review).

Organizations with hard data-residency requirements should configure only local reviewers (Ollama, llamafile via `llm`, or Bedrock in their controlled VPC). The PRD does NOT attempt automated PII/secret redaction of artifacts in v1 — this is deferred to future work.

**Acceptance Criteria:**
- `init` surfaces the data-transmission warning before writing `enabled: true`
- Documentation explicitly calls out local-only configurations for privacy-sensitive use
- The `docs/reviews/` audit trail is sufficient for a reader to audit what was sent where

---

## 5. Non-Functional Requirements

**NFR-MR1: Zero-config compatibility**
Users with no `multimodal_review` section in their config see exactly today's behavior across all review commands. Adding the section and setting `enabled: false` is also a no-op. No silent opt-ins, ever.

**NFR-MR2: Platform support**
The feature works on all Claude Code surfaces that expose host bash: CLI, desktop app in local session, IDE extensions backed by either. It degrades gracefully — with a clear error — on cloud/web surfaces where host CLIs are not reachable unless the user has configured setup scripts to install them.

**NFR-MR3: Parallel execution**
Proposer invocations run in parallel. The end-to-end wall-clock time of a multimodal review should approximate `max(per-reviewer times) + aggregator time`, not the sum.

**NFR-MR4: Cost transparency**
The audit artifact reports token usage per reviewer when the CLI provides it. Synthex itself does not compute costs (rates vary by provider/plan); users consult their provider billing dashboards. The documentation must set expectations: multimodal review is strictly more expensive than single-model review, and the cost is borne by the user through their existing provider relationships.

**NFR-MR5: Extensibility**
Adding a new adapter requires only: creating `<adapter>-review-prompter.md` in `plugins/synthex/agents/`, registering it in `plugin.json`, and documenting its CLI. No changes to the orchestrator are required provided the adapter conforms to FR-MR9.

**NFR-MR6: Consistent output contract**
The orchestrator's returned findings conform to the same canonical schema as native reviewer findings, so any downstream consumer (a command's consolidated report, `findings-consolidator`, the PM's plan-revision flow) works identically regardless of whether multimodal was used.

**NFR-MR7: Testability**
Every adapter and the orchestrator must be testable under the existing three-layer testing pyramid (schemas/behavioral/semantic per `CLAUDE.md`):
- **Layer 1 (schema):** validate adapter output envelopes against the canonical schema; validate orchestrator output structure.
- **Layer 2 (behavioral):** cached-output tests with planted conflicting findings to verify dedup, severity reconciliation, contradiction handling, fallback.
- **Layer 3 (semantic):** LLM-as-judge against a corpus of real multi-reviewer findings to verify the aggregator produces consolidated output that a human would accept.
Adapter tests must NOT require the real CLI to be present in CI — they use recorded fixture outputs for each CLI family.

**NFR-MR8: Observability**
The orchestrator logs every major decision (dedup merges, severity judge invocations, contradiction detections, fallback triggers) to the audit artifact. Log format is structured (markdown sections with finding IDs) so future tooling can diff audit files across runs.

**NFR-MR9: Documentation**
`README.md`, `CLAUDE.md`, and `config/defaults.yaml` must all be updated. The `init` command's configuration guide must include a dedicated multimodal review section. A dedicated `docs/specs/multimodal-review.md` design document covers the architecture for future contributors.

---

## 6. Out of Scope

Deferred to future work:

- **Custom OpenAI-compatible endpoints as a first-class feature.** Users can reach these today by configuring their CLI of choice (Codex, Opencode, `llm`) with a custom base URL — Synthex inherits that transparently. A first-class "custom endpoint" adapter is deferred because it adds config surface and credential-handling responsibility for no benefit over the CLI-inheritance path.
- **Automated PII/secret redaction of artifacts before transmission.** Users select trusted providers or local-only configurations; Synthex does not perform content filtering in v1.
- **Agent-to-Agent (A2A) protocol support.** Claude Code has no native A2A client or server; the idiomatic workaround is an MCP↔A2A bridge MCP server the user installs independently. Users can configure a custom reviewer whose "command" shells to `curl` against a bridge endpoint if they want to experiment; Synthex does not build this in.
- **Cost tracking and budgets.** Synthex does not track or enforce per-invocation spend limits. Users rely on provider dashboards and their own CLI-level controls.
- **Historical reviewer calibration / weighted voting.** The consolidation pipeline treats all configured reviewers as equal-weight. Weighting by historical correctness would require a feedback-capture mechanism that does not yet exist.
- **Multi-round debate between proposers.** The Du et al. multi-agent debate pattern ([arXiv:2305.14325](https://arxiv.org/abs/2305.14325)) is attractive but adds latency and cost that are hard to justify in v1. Chain-of-Verification on contradictions (FR-MR14, Stage 6) is the v1 approximation.
- **Automatic role assignment** (e.g., GPT plays security-reviewer, Gemini plays code-reviewer). V1 uses the "every external model plays the same role" pattern per FR-MR22.
- **Web app / cloud session support out-of-the-box.** Users of claude.ai/code or desktop cloud sessions must configure setup scripts to install their chosen CLIs; this is documentation, not plugin logic.
- **Commands beyond `review-code` and `write-implementation-plan`.** The remaining review-capable commands (`refine-requirements`, `write-rfc`, `reliability-review`, `performance-audit`) are candidates for v2.

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| All adapter agents in v1 adapter set have complete, unambiguous definitions | 100% |
| Orchestrator produces canonical-schema output for every successful invocation | Verified via Layer 1 schema tests |
| `review-code --multimodal` runs proposer CLIs in parallel | Verified via wall-clock timing on representative fixture |
| Dedup pipeline correctly merges duplicate findings across reviewers | Verified via Layer 2 behavioral fixtures with planted duplicates |
| Severity reconciliation correctly takes max on 1-level disagreement, triggers judge on 2+ level disagreement | Verified via Layer 2 behavioral fixtures with planted disagreements |
| Graceful degradation: review proceeds when 1 of N reviewers fails | Verified via Layer 2 fixture where one adapter is forced to `cli_missing` |
| Fallback: review falls back to native single-model when all reviewers fail | Verified via Layer 2 fixture where all adapters are forced to fail |
| Strict mode aborts on first proposer failure | Verified via Layer 2 fixture |
| `init` detects installed CLIs and offers enable/skip options | Verified via interactive-mode manual test |
| Disabling multimodal via config OR `--no-multimodal` produces today's behavior | Verified via regression fixture |
| Audit artifact is written for every invocation | Verified via file-system check after fixture runs |
| No provider credentials appear in audit artifacts, logs, or config | Verified via test asserting no secret-like tokens appear in sample audits |

---

## 8. Assumptions & Constraints

**Assumptions:**
- Developers who opt in have at least one non-Claude CLI installed (`codex`, `gemini`, `ollama`, or `llm`). Users with only `claude` installed get a single-family warning but can still use the feature for ensembling across Claude models (not recommended but not blocked).
- Non-interactive mode flags on the target CLIs are stable enough to depend on. Documented adapter flag sets will be updated as CLIs evolve; CI adapter tests catch breakage.
- Each CLI's JSON/structured output mode is sufficient to produce findings conforming to the canonical schema when the reviewer LLM is prompted with the schema explicitly.
- The host Claude session has enough context budget to run the orchestrator (Sonnet-class reasoning over N proposer outputs). For extreme fan-out, the orchestrator may stream consolidated batches; this is an implementation detail, not a spec item.

**Constraints:**
- Per CLAUDE.md: no runtime code — all agents (orchestrator, adapters) are prompt-based markdown definitions invoked by Claude Code. Shelling to CLIs happens via the Bash tool from within those agent prompts.
- The plugin system's version-detection requires bumping `marketplace.json` and `plugin.json` on release (per CLAUDE.md) — this PRD's implementation must include that bump.
- Claude Code on cloud/web surfaces cannot reach host CLIs directly; this is a documented limitation, not a defect to fix in v1.
- Claude Code has no native A2A client/server support; CLI shelling is the only integration path for v1.

---

## 9. Future Work / Extension Points

- **v2 commands:** extend multimodal review to `refine-requirements`, `write-rfc`, `reliability-review`, `performance-audit`
- **Role-specialized proposers:** allow per-reviewer role prompts (GPT plays security-reviewer, Gemini plays code-reviewer) as a configuration option
- **Custom OpenAI-compatible endpoints:** optional first-class config item with clear OpenAI Chat Completions spec requirement, gated on user demand
- **Cost budgets per invocation:** `max_cost_usd` with pre-invocation estimation
- **Weighted voting by historical calibration:** feedback capture + per-reviewer reliability scoring
- **Multi-round debate** between proposers for high-stakes reviews
- **A2A support** via documented MCP bridge pattern
- **Embedding-model selection:** expose the embedding model used in Stage 3 dedup as a config item
- **Artifact redaction hooks:** pre-transmission filter points so users can plug in their own redaction logic

---

## 10. Open Questions

**OQ-1: Role mapping for external reviewers.**
Per FR-MR22, v1 uses "every external reviewer plays the same generalist role." Should we offer an opt-in config where each external reviewer plays a distinct Synthex role (GPT plays Architect, Gemini plays Designer, etc.)? Defer to v2; decide based on v1 user feedback.

**OQ-2: Embedding model source.**
Stage 3 dedup needs an embedding model. Options: (a) call `llm embed` if present, (b) request embeddings from the host Claude session via a structured prompt, (c) skip semantic dedup if neither is available and rely on stages 1, 2, 4. Recommend (a) with fallback to (c); revisit if it turns out to be a quality gap.

**OQ-3: Handling very large artifacts.**
A 2000-line diff may exceed some CLI context windows. Should the orchestrator auto-chunk? Or error with guidance to reduce scope? Recommend error-with-guidance for v1 (matches today's `max_diff_lines: 300` warning pattern in `review-code`). Auto-chunking is future work because it interacts with dedup across chunks.

**OQ-4: Aggregator model family overlap.**
If the aggregator's family is the same as the only non-Claude proposer's family (e.g., GPT-5 aggregator over GPT-5-mini + Claude proposers), is that acceptable? Per FR-MR15 we warn but don't block. Should we block in `strict_mode`? Defer — revisit if users hit self-preference issues in practice.

**OQ-5: Handling reviewer-specific quirks in prompts.**
Some models respond better to specific prompting patterns (Gemini prefers XML-tagged structure; GPT-5 prefers concise instruction). Should adapter prompts be model-family-specific? Recommend a shared canonical prompt in v1 with per-adapter `prompt_style` config field reserved for v2.

**OQ-6: Aggregator failure.**
What if the aggregator CLI itself fails? Options: (a) fall back to `findings-consolidator` (the existing Haiku-backed utility) for mechanical dedup without judgement, (b) fall back to the host Claude session as emergency aggregator, (c) abort with a clear error. Recommend (b) as the most resilient; document as part of FR-MR17 in the implementation plan.

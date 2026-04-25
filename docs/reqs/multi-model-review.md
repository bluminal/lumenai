# Product Requirements Document: Multi-Model Review Orchestration

## 1. Vision & Purpose

**Why this exists:** Synthex's review commands (`review-code`, `write-implementation-plan`, `refine-requirements`, `write-rfc`, `reliability-review`, `performance-audit`) currently run all reviewers on a single model family — the Claude model that hosts the session. This is a known failure mode: same-family models share blind spots (correlated errors, [arXiv:2506.07962](https://arxiv.org/html/2506.07962v1)), so a single-family review ensemble has a ceiling that no amount of additional Claude reviewers can raise.

**Multi-model review** breaks that ceiling by fanning review prompts out to multiple LLM families (Claude, GPT, Gemini, local open-source models) and consolidating the results into one deduplicated, severity-reconciled, attributed findings list. The pattern is modeled on Cloudflare's production "Review Coordinator" architecture and Mixture-of-Agents ([arXiv:2406.04692](https://arxiv.org/abs/2406.04692)), which show measurable lift over single-model review when model family diversity is enforced.

**Design commitment:** the feature ships **off by default** and is **CLI-only** — Synthex never touches provider API keys, and each external reviewer runs through the developer's existing CLI (`codex`, `gemini`, `ollama`, `llm`, `aws bedrock-runtime`, etc.). This inherits the developer's configured auth, MCP servers, approval modes, and model routing for free, and keeps Synthex's credential surface area at zero.

**The Multi-Model Review Orchestrator** is the new agent introduced by this PRD. It accepts a review artifact (diff, plan, PRD, RFC, etc.) from a calling agent or command, invokes N configured **provider adapter agents** in parallel, consolidates their findings, and returns a single unified review with per-finding attribution and consensus metadata.

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
| **Multi-model review** | Review orchestrated across multiple LLM families (Claude, GPT, Gemini, local open-source models, etc.) — one review per configured model, then consolidated. Not related to multimodal input (vision/audio); "multi-model" here means multiple language models. |
| **Proposer** | A reviewer in the multi-model ensemble that produces independent findings on the artifact. May be a **native reviewer** (Synthex sub-agent in the host Claude session) or an **external reviewer** (a non-Anthropic-CLI model reached via shelling out). All proposers — native and external — should be flagship reasoning-capable models (Claude Sonnet/Opus host, GPT-5 via Codex, Gemini 2.5 Pro via Gemini CLI, DeepSeek V3.x, Qwen 2.5 Coder 32B+, etc.). The aggregator cannot recover issues that no proposer flagged, so each proposer slot is high-value. |
| **Native reviewer** | A Synthex sub-agent invoked via the Task tool in the host Claude session — `code-reviewer`, `security-reviewer`, `architect`, `designer`, `tech-lead`, `performance-engineer`, etc. These already run today as part of every review command; multi-model mode does not replace them — it adds external proposers alongside them. Native reviewers count as the `anthropic` family for diversity purposes. |
| **External reviewer** | A non-host-session model reached via a CLI adapter (`codex-review-prompter`, `gemini-review-prompter`, `ollama-review-prompter`, `llm-review-prompter`, `bedrock-review-prompter`, etc.). These are added by enabling multi-model mode and configuring the `reviewers` list. The `claude-review-prompter` adapter exists for users who want a specific Claude model that differs from the host session (e.g., host is Sonnet but you want Opus as a second Anthropic voice), but is not part of the default-recommended set because the native reviewers already cover the Anthropic family. |
| **Aggregator** | The LLM that consolidates all proposers' findings into a single output — handles dedup, severity reconciliation, contradiction resolution, and attribution. Its task is judging among findings, not producing them, so it does not need to be markedly stronger than the proposers — but it must be at least as strong as the weakest proposer to avoid information loss. By default the orchestrator (running in the host Claude session) is the aggregator; users can name an explicit external aggregator. |
| **Adapter agent** | A Haiku-backed Synthex utility agent that wraps a specific provider CLI (`codex-review-prompter`, `gemini-review-prompter`, etc.). Handles invocation, output parsing, and normalization to the canonical finding schema. Only external reviewers go through adapters; native reviewers run directly via the Task tool. |
| **Orchestrator agent** | `multi-model-review-orchestrator` — the new Synthex agent that drives the full flow: fan-out to both native sub-agents (via Task) and external adapters (via Task → Bash), consolidation, return to caller. |
| **Canonical finding** | A normalized finding record produced by any reviewer (native or external), conforming to the shared JSON schema (see FR-MR13). Native reviewers already produce structured findings today; the orchestrator normalizes them into the canonical schema alongside external findings. |
| **Consensus badge** | Metadata on each consolidated finding indicating how many reviewers (and which families) flagged it (e.g., "3/4 · Anthropic+OpenAI+Google"). Native reviewers contribute to the Anthropic family count. |
| **Strict mode** | A configuration option (off by default) that makes any external reviewer failure abort the entire review instead of degrading gracefully. Native reviewer failures are not subject to strict mode — those are command-level failures handled the same way as today. |
| **Fallback** | Behavior when all external reviewers fail: the orchestrator continues with the native reviewers' findings (which were collected in the same parallel cycle) and emits a warning. Because natives always run, the worst case of multi-model mode is "same as today's review, with a warning that the externals didn't contribute." |
| **Capability tier** | An external adapter's declared ability to access files beyond the pre-assembled context bundle. Two values: `agentic` (CLI supports tool-use — can read additional files in the sandboxed workspace) or `text-only` (prompt-in/text-out — works strictly from the bundle). Declared in each adapter's markdown definition, used by the orchestrator to decide what context to deliver. Native reviewers always have full Synthex tool access in the host session and do not need a tier classification. |
| **Context bundle** | The orchestrator-assembled package of review context (diff + touched files + relevant specs + CLAUDE.md + optional overview) passed to every external reviewer regardless of tier. Native reviewers receive context the same way they do today (full session access); the bundle is built specifically to level the playing field for external reviewers. Size-limited via Haiku summarization when it exceeds the configured byte cap. |
| **Complexity gate** | A pre-orchestration check (currently only in `review-code`) that decides whether the diff is complex enough to add external reviewers on top of the always-running native reviewers. Below the gate: native-only path (today's behavior). Above the gate: native + external in parallel. Overridable per-invocation with `--multi-model` / `--no-multi-model`. |
| **Native-only mode** | What runs when multi-model is disabled, the complexity gate doesn't fire, or `include_native_reviewers` is the only enabled source. Identical to today's review behavior — Synthex sub-agents only, no external CLI invocation. |

---

## 4. Functional Requirements

### 4.1 Core Architecture

**FR-MR1: Two-tier orchestration with native + external proposers**

The system uses a **proposers-plus-aggregator** architecture, where the proposer pool is **additive**: it consists of (a) the native Synthex sub-agents that already review for the calling command today, plus (b) any configured external CLI reviewers. Multi-model mode does not replace the natives — it adds external voices alongside them.

1. **Proposer tier (additive: native + external):**
   - **Native proposers** — Synthex sub-agents invoked via the Task tool in the host Claude session. Which sub-agents participate is determined by the calling command (e.g., `/review-code` invokes `code-reviewer` + `security-reviewer` + optional `performance-engineer`; `/write-implementation-plan` invokes `architect` + `designer` + `tech-lead`). These run today and continue to run with multi-model mode enabled — multi-model adds to them, never replaces them.
   - **External proposers** — non-host-session models reached through CLI adapters (`codex-review-prompter`, `gemini-review-prompter`, `ollama-review-prompter`, `llm-review-prompter`, `bedrock-review-prompter`, etc.). Configured by the user in `multi_model_review.reviewers`.
   - All proposers — native and external — run **in parallel** as a single fan-out batch. They never see each other's output; that independence is what makes the ensemble diagnostic.
   - Every proposer should be a **flagship reasoning-capable model** (Claude Sonnet/Opus for natives via the host session, GPT-5 via Codex, Gemini 2.5 Pro via Gemini CLI, DeepSeek V3.x, Qwen 2.5 Coder 32B+ via Ollama, etc.). Code review is a "find subtle issues" task; cheap models systematically under-detect, and the aggregator cannot recover findings no proposer flagged. Each slot is high-value.
   - **Extended-thinking / reasoning modes** (Claude extended thinking, GPT-5 / o-series reasoning tokens, Gemini 2.5 thinking mode) should be enabled where the CLI supports them. The host Claude session inherits whatever extended-thinking the user has configured at the Claude Code level; external CLIs inherit their own defaults.
   - Synthex never overrides the user's CLI model selection or extended-thinking configuration. Documented adapter recipes recommend flagship-class invocations as defaults.
2. **Aggregator tier:** A single model consolidates all proposer outputs (native + external) into one canonical findings list — handles dedup, severity reconciliation, contradiction resolution, attribution. The aggregator's job is *judgement among existing findings*, not original analysis, so it does not need to be markedly stronger than the proposers — but it must be at least as capable as the weakest proposer to avoid information loss when summarizing. **By default the aggregator is the host Claude session itself** (the orchestrator agent runs the consolidation pipeline directly, no extra CLI invocation); explicit external aggregator selection is supported via `multi_model_review.aggregator.command` (FR-MR15).

**Acceptance Criteria:**
- Native sub-agents and external adapters are launched in a single parallel batch — not natives-then-externals or vice versa
- The orchestrator collects findings from both sources and feeds them to a single consolidation pipeline
- When multi-model mode is disabled, only the native sub-agents run (today's behavior, byte-identical)
- Aggregator runs exactly once per review cycle, after all proposers have returned (or timed out)
- Adapter documentation recommends a flagship default model + extended-thinking flags where applicable; documentation explicitly warns against using small/cheap variants for the proposer role

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

Multi-model review is disabled unless the user explicitly enables it in `.synthex/config.yaml`. The zero-config experience is unchanged from today: single-model review using the host Claude session.

**Acceptance Criteria:**
- With no `multi_model_review` section in the user's config, all review commands behave identically to their pre-feature behavior
- Enabling the feature requires both a config entry AND at least one configured reviewer passing preflight validation

**FR-MR4: Model family diversity**

The orchestrator enforces a minimum of **two distinct model families** across the combined proposer pool (native + external) when multi-model mode is active. Configurations with only one family produce a warning at preflight and a repeated warning on the first invocation. This mitigates the correlated-errors failure mode ([arXiv:2506.07962](https://arxiv.org/html/2506.07962v1)).

**Family attribution:**
- **Native reviewers** count as the `anthropic` family (they all run on the host Claude session).
- **External reviewers** declare their family in their adapter metadata (`openai` for Codex, `google` for Gemini, `local-<model>` for Ollama, etc.).
- A default configuration of "native reviewers + Codex (GPT-5) + Gemini" already satisfies the 2-family minimum (Anthropic + OpenAI + Google = 3 families) without needing the optional `claude-review-prompter` adapter.

**Acceptance Criteria:**
- Preflight counts the host Claude session's family (`anthropic`) as one family member by virtue of native reviewers running there
- Preflight detects external family diversity from adapter metadata (each adapter declares its family)
- Single-family configurations (e.g., natives only, or natives + only `claude-review-prompter`) are warned, not blocked — users retain the ability to opt into lower diversity
- The warning includes a one-sentence explanation of why diversity matters

---

### 4.2 Configuration

**FR-MR5: Configuration schema**

A new top-level section in `.synthex/config.yaml`:

```yaml
multi_model_review:
  enabled: false                    # Master switch. Default: false.
  strict_mode: false                # See FR-MR17. Default: false.
  min_family_diversity: 2           # See FR-MR4. Default: 2.
  min_proposers_to_proceed: 1       # See FR-MR16. Default: 1 (NOT counting native reviewers).
  include_native_reviewers: true    # Always include the command's native Synthex sub-agents
                                    # in the multi-model ensemble alongside external CLIs.
                                    # Default: true. Set to false ONLY when you want a
                                    # pure-external "second opinion" review with no Anthropic
                                    # voice from the host session — see FR-MR1.
  aggregator:
    command: auto                   # "auto" picks the host Claude session as aggregator
                                    # (no extra CLI invocation). Set to an explicit adapter
                                    # (e.g., codex-review-prompter) to use an external aggregator.
    model: auto                     # Optional: pin a specific model within the chosen CLI.
  # External reviewers added to the ensemble alongside the always-running native sub-agents.
  # The native reviewers (code-reviewer, security-reviewer, architect, designer, tech-lead, etc.)
  # are NOT listed here — they are determined by the calling command and run automatically.
  reviewers:
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
    # The claude-review-prompter adapter exists but is NOT recommended in the default
    # set — the native reviewers already cover the Anthropic family via the host
    # Claude session. Use it only if you want a *different* Anthropic model (e.g.,
    # host is Sonnet, you want Opus as a second Anthropic voice):
    # - name: claude-opus-second-opinion
    #   adapter: claude-review-prompter
    #   model: claude-opus-4-7
    #   family: anthropic
    #   enabled: false
  per_command:
    review_code:
      enabled: true                 # Per-command override of the master switch
      strict_mode: false
      # Complexity gate — only spend multi-model cost when the change warrants it.
      # Below the threshold, review-code falls through to native single-model review.
      # Users can still force multi-model with --multi-model (or skip with --no-multi-model).
      complexity_gate:
        mode: auto                  # auto | always | never
        threshold_lines: 50         # combined added + removed lines across the diff
        threshold_files: 3          # distinct files touched by the diff
        always_escalate_paths:      # glob patterns — any match forces multi-model regardless of size
          - "**/auth/**"
          - "**/authn/**"
          - "**/authz/**"
          - "**/payment*/**"
          - "**/payments/**"
          - "**/billing/**"
          - "**/migrations/**"
          - "**/security/**"
          - "**/secrets/**"
          - "**/crypto/**"
    write_implementation_plan:
      enabled: true                 # No complexity gate — plans are always high-stakes.
    refine_requirements:
      enabled: false                # Opt out per-command even when master is on
  context:
    # Context bundle delivered to every reviewer. See FR-MR28.
    max_bundle_bytes: 204800        # 200 KB cap; bundle is compressed by Haiku summaries above this
    max_file_bytes: 65536           # 64 KB per-file cap; larger files are summarized, not verbatim
    include_touched_files: true     # full file contents for every file in the diff
    include_specs: true             # files under documents.specs matching touched paths
    include_overview: true          # README.md or docs/overview.md (bounded)
    include_convention_sources: true  # CLAUDE.md and code_review.convention_sources
  audit:
    enabled: true
    output_path: docs/reviews       # Where to write the audit artifact (FR-MR24)
```

**Resolution order:** `per_command.<cmd>.<setting>` > `multi_model_review.<setting>` > hardcoded default.

**FR-MR6: Per-command invocation override**

Each multi-model-capable command accepts an explicit flag/parameter to override config at invocation time:

- `--multi-model` / `multi-model: true` — force multi-model review on for this invocation
- `--no-multi-model` / `multi-model: false` — force single-model review for this invocation
- Default (no flag): use the resolved config value

**Acceptance Criteria:**
- The flag overrides both the master switch and any `per_command` entry
- A user with multi-model disabled can run a one-off multi-model review with `--multi-model`
- A user with multi-model enabled can run a one-off single-model review with `--no-multi-model`

---

### 4.3 Provider Adapter Agents

**FR-MR7: Adapter layer**

A new row in the Synthex agent hierarchy: the **Review Adapter Layer**. Each adapter is a Haiku-backed utility agent (consistent with `findings-consolidator`, `plan-linter`, `plan-scribe`). Adapters are not invoked directly by users; they are invoked only by the multi-model-review-orchestrator.

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
  "artifact_path": "/tmp/multi-model-review-<uuid>.md",
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
  "raw_output_path": "/tmp/multi-model-raw-<uuid>-<reviewer>.txt"
}
```

**Acceptance Criteria:**
- All adapters emit this exact envelope shape
- `finding_id` uses the canonical form `<category>/<subcategory>/<rule-slug>` — NEVER includes line numbers (per SAST dedup best practice)
- `raw_output_path` is always populated so the orchestrator can audit/re-parse if needed

**FR-MR10: First-class adapter set (v1)**

The initial adapter set ships with the plugin and covers the external providers users are most likely to already have installed. **The Anthropic family is covered by the native Synthex sub-agents in the host Claude session** (FR-MR1) — the `claude-review-prompter` adapter is included for users who explicitly want a *different* Anthropic model than the one hosting the session, but it is not part of the default-recommended ensemble.

| Adapter | Default in ensemble? | Wraps | Covers | Default Family | Capability Tier |
|---------|----------------------|-------|--------|----------------|-----------------|
| `codex-review-prompter` | **Yes (recommended)** | `codex exec --json --sandbox read-only` | OpenAI (GPT-5, o-series); also any OpenAI-compatible base URL the user has configured in Codex | `openai` | `agentic` |
| `gemini-review-prompter` | **Yes (recommended)** | `gemini -p --output-format json` | Google (Gemini 2.5/3) | `google` | `agentic` |
| `ollama-review-prompter` | Yes (for local-only configs) | `ollama run` + HTTP API with `format: <schema>` | Any local Ollama model (Llama, Qwen, DeepSeek, Gemma, Mistral) | `local-<model>` | `text-only` |
| `llm-review-prompter` | Optional (universal escape hatch) | `llm -m <model> --schema <file>` | Universal adapter — 50+ providers via `llm` plugins (OpenRouter, Groq, Mistral, Cohere, Bedrock) | Inferred from the `llm` model ID prefix | `text-only` |
| `bedrock-review-prompter` | Optional (for users on AWS) | `aws bedrock-runtime invoke-model` | AWS Bedrock (Claude, Llama, Nova, Titan, Mistral) — for users with AWS creds but no per-vendor CLI | Inferred from Bedrock model ID | `text-only` |
| `claude-review-prompter` | **No (specialty)** — see note below | `claude -p --output-format json` | Anthropic (Sonnet/Opus/Haiku), including Bedrock/Vertex routing via env vars | `anthropic` | `agentic` |

**On `claude-review-prompter`:** the native Synthex sub-agents already cover the Anthropic family by running in the host Claude session — they have role-specialized prompts, full Synthex context (CLAUDE.md, project specs, conventions), and direct Task-tool access. A generic `claude -p` subprocess does not have that specialization and would also pay for a fresh CLI invocation. Only configure `claude-review-prompter` if you want a *different* Anthropic model than the host session's model — e.g., the host is Sonnet and you want Opus as a second Anthropic voice for a high-stakes review. Otherwise, leave it out.

**Capability tier matters** because it controls how the orchestrator delivers context (FR-MR28). Agentic-tier external reviewers receive the context bundle AND read-only access to the sandboxed workspace (they can follow imports, check sibling files, read additional specs). Text-only-tier external reviewers receive the context bundle alone — no file access — so bundle completeness and summarization quality directly determine the upper bound of their review quality. Native reviewers do not have a tier classification because they always have full Synthex tool access in the host session.

**Acceptance Criteria:**
- Each adapter has its own `.md` definition in `plugins/synthex/agents/`
- Each adapter is listed in `plugins/synthex/.claude-plugin/plugin.json`
- Each adapter's file documents: the CLI invocation shape, auth expectations, output parsing logic, known gotchas, and install one-liner

---

### 4.4 Orchestrator Agent

**FR-MR11: Multi-Model Review Orchestrator**

A new agent — `multi-model-review-orchestrator` — is introduced. It is invoked by review commands (or by calling agents directly) whenever multi-model mode is active. It is a **Sonnet-backed** agent (not Haiku) because its consolidation work involves non-trivial reasoning: severity judgement, contradiction detection, CoVe verification.

**FR-MR12: Parallel fan-out (native + external in one batch)**

The orchestrator invokes both kinds of proposers in a single parallel fan-out batch via the Task tool:

1. **Native sub-agents** for the calling command (e.g., `code-reviewer` + `security-reviewer` for `/review-code`; `architect` + `designer` + `tech-lead` for `/write-implementation-plan`). These are determined by the calling command and resolved at orchestrator entry — the orchestrator does not invent the native list, it accepts it from the caller.
2. **External adapter agents** for every enabled entry in `multi_model_review.reviewers`. Each adapter is itself a Task-tool invocation that internally shells out to the external CLI via Bash.

All proposers run in one batch and do not see each other's output. After the slowest proposer returns (or times out), the orchestrator runs consolidation against the combined finding set.

**Acceptance Criteria:**
- Native sub-agent invocations and external adapter invocations are launched in the same parallel batch (a single set of Task tool calls), not in two sequential phases
- The orchestrator waits for all proposers to complete (or timeout) before beginning consolidation
- Per-proposer timeouts are enforced individually — one slow proposer does not stall faster ones beyond its own timeout
- A native sub-agent failure (e.g., context-window error, output-parse failure) is reported in the unified output the same way an external failure would be — no hidden differences in how natives vs externals surface errors
- When `include_native_reviewers: false`, only external proposers are launched (the orchestrator still runs but with a smaller pool)
- When multi-model mode is disabled or the complexity gate doesn't fire, the orchestrator is not invoked at all — the calling command runs its native sub-agents directly as it does today

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

The aggregator is configurable (`multi_model_review.aggregator.command`). Default behavior:

- **`auto`:** select the strongest proposer in the configured list by a hardcoded tier table (e.g., Claude Opus > GPT-5 > Gemini 2.5 Pro Ultra > Claude Sonnet > Gemini 2.5 Pro > DeepSeek V3 > ...). The table only ranks among flagship models — small/cheap variants (`gpt-5-mini`, `gemini-flash`, etc.) are not represented because they are not recommended as proposers (see FR-MR1) and therefore should not be selected as aggregators either. If the strongest proposer is also a reviewer, the aggregator invocation uses a separate, freshly-spawned CLI call with a judge-mode system prompt.
- **Explicit:** the user names a specific adapter (e.g., `claude-review-prompter` with `model: claude-opus-4-7`).

**Bias mitigation applied by the orchestrator regardless of choice:**
1. **Position randomization** — the order in which per-reviewer findings are presented to the aggregator is randomized per invocation.
2. **Judge-mode system prompt** — explicit instructions to the aggregator to weigh findings on their merits, cite per-reviewer attribution in the output, and never prefer findings from any specific reviewer.
3. **Author-judge separation warning** — if the selected aggregator family is also the only proposer family, preflight emits a warning explaining self-preference bias.

**Acceptance Criteria:**
- `aggregator.command: auto` resolves deterministically given a configured reviewer list
- Every aggregator invocation includes the randomization and system prompt above
- Self-preference bias is detectable and warned about in config validation

**FR-MR28: Context provisioning**

Reviewers produce findings against a review artifact (diff, plan, PRD), but **quality of review is bounded by quality of context**. A reviewer that only sees a 50-line diff hunk cannot flag "this duplicates a utility in `src/utils/helpers.ts`" or "this violates the auth pattern in `docs/specs/auth.md`." Worse, the CLIs we shell out to have **different file-access capabilities**:

- **Agentic-tier CLIs** (`claude -p`, `codex exec`, `gemini -p`, `opencode run`) can read additional files in their sandboxed working directory via native tool-use.
- **Text-only-tier CLIs** (`ollama`, `llm`, `aws bedrock-runtime`, `mods`) cannot read files at all — they are pure prompt-in/text-out.

If the orchestrator did nothing to level this, text-only reviewers would systematically under-review context-sensitive issues. The orchestrator therefore pre-assembles a **context bundle** delivered to *every* reviewer regardless of tier, and additionally permits agentic reviewers to explore beyond the bundle when they need to. This ensures text-only reviewers have meaningful context without forcing every reviewer into a lowest-common-denominator prompt shape.

**Context bundle contents (assembled by the orchestrator once per invocation):**

1. **The review artifact itself** — always verbatim. Diff for `review-code`, draft plan for `write-implementation-plan`, etc.
2. **Touched-file expansion** — for each file in the diff, the full current file contents (not just the hunk). Subject to `context.max_file_bytes` (default 64 KB). Files larger than the cap are replaced by a Haiku-produced summary that preserves: the file's exports, its top-level structure, and any regions neighboring the diff hunks.
3. **Matching specs** — files under `documents.specs` (default `docs/specs/`) whose filename or path relates to any touched path. A simple heuristic: include `docs/specs/auth.md` when `src/auth/**` is in the diff. Up to `context.max_bundle_bytes / 4` total spec content.
4. **Convention sources** — `CLAUDE.md` and any paths in `code_review.convention_sources` (e.g., `.eslintrc`, `.prettierrc`).
5. **Project overview (optional)** — `README.md` or `docs/overview.md`, bounded to a small excerpt.
6. **Capability-tier note** — for agentic reviewers only, an appendix: "You are operating in a read-only sandbox rooted at the project root. You MAY read additional files if you need them to complete the review. You MUST NOT modify any file." Text-only reviewers do not see this appendix.

**Bundle size management:**

The bundle has a hard cap at `context.max_bundle_bytes` (default 200 KB). The orchestrator's assembly process is:

1. Add the artifact (always, uncompressed).
2. Add convention sources (always, uncompressed — small).
3. Add touched-file contents; summarize any file over `max_file_bytes` via Haiku.
4. Add matching specs until spec budget is hit.
5. Add overview excerpt.
6. If total exceeds `max_bundle_bytes`, compress iteratively: summarize the largest still-verbatim file, re-measure, repeat until under the cap. Never summarize the artifact itself; if the artifact alone exceeds the cap, emit an error asking the user to narrow scope (consistent with `max_diff_lines` behavior in `review-code`).

**What gets sent to each reviewer:**

| Reviewer tier | Sends | Additional capability |
|---------------|-------|------------------------|
| `agentic` | Full context bundle + capability-tier note | MAY read additional files in the sandbox (read-only) |
| `text-only` | Full context bundle (no capability-tier note) | Cannot read any additional files — bundle is final |

The orchestrator tells reviewers in their system prompt which tier they are operating at, so they do not hallucinate exploration they cannot actually do.

**Audit trail:**

The context bundle (or a manifest of what it contained: file list, which files were summarized, total bytes) is written to the audit artifact (FR-MR24) for reproducibility. Secrets / credentials: the bundle is assembled from files the orchestrator can already read — Synthex does not introduce new access paths.

**Trade-off statement (documentation):**

Text-only reviewers inherently produce lower-quality reviews on "this code elsewhere does X" types of findings because they cannot pull in files the bundle didn't anticipate. The v1 bundle heuristics (touched files + matching specs + conventions) cover the vast majority of review-relevant context. Users who need the strongest possible review quality should configure at least one agentic-tier reviewer; users who prefer local/privacy-sensitive reviewers (Ollama, llamafile) accept this trade-off knowingly.

**Acceptance Criteria:**
- Every adapter declares its `capability_tier` in its markdown definition; the orchestrator reads this to decide what to send
- The context bundle is assembled once per invocation and passed identically to every reviewer; there is no per-reviewer bundle divergence
- Bundle size never exceeds `context.max_bundle_bytes` in practice (verified via Layer 2 behavioral test with large fixture)
- When a file is summarized due to size, the summary is generated by the Haiku-backed `findings-consolidator` or a similar utility agent — never by the proposer CLIs themselves
- Agentic reviewers receive the capability-tier note; text-only reviewers do not
- The audit artifact records, at minimum: bundle size, file count, list of files that were summarized vs. sent verbatim
- If the review artifact alone exceeds `max_bundle_bytes`, the orchestrator emits a clear error with remediation (e.g., "Diff is 320 KB; narrow scope with `target=<file>` or split into smaller reviews"), not a silent truncation

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

2. **External-reviewer degradation threshold:** the review proceeds with whatever external reviewers succeeded, as long as **at least `min_proposers_to_proceed`** external reviewers succeeded (default: 1). This setting counts external reviewers only — native reviewers are not subject to this threshold because they are not what's at risk of failing transiently.

3. **If ALL external reviewers fail (and strict_mode is off):** the orchestrator does NOT abort. Because native reviewers ran in the same parallel batch (FR-MR12), their findings are already in hand. The orchestrator continues with the native findings only — see FR-MR17.

4. **Family-diversity warning on degradation:** if external failures drop the surviving family count below `min_family_diversity`, emit a warning on the output but continue. The warning is a soft nudge, not a block.

5. **Native reviewer failure handling:** native sub-agents can also fail (context-window error, output-parse failure, etc.). These are surfaced the same way external failures are — listed in the unified report with an error code. They do NOT trigger external-fallback logic; they are command-level errors and the surviving native + external set proceeds. If ALL native reviewers fail AND `include_native_reviewers: true`, that is a more serious condition and the orchestrator emits a critical warning that the Anthropic perspective is missing entirely from the consolidation.

**Acceptance Criteria:**
- Each failure category produces a distinct, machine-readable `error_code`
- The user-facing output lists every failed reviewer (native or external) with its error category and a remediation hint
- The review never silently drops a failed reviewer — failures are always reported
- `min_proposers_to_proceed` applies to external reviewers only; native reviewer count is reported separately in degradation logging

**FR-MR17: Continuation with natives only when externals all fail**

When all configured external reviewers fail AND `strict_mode: false`, the orchestrator does NOT abort and does NOT need to re-run anything. Because native reviewers ran in the same parallel fan-out batch (FR-MR12), their findings are already collected. The orchestrator simply:

1. Emits a prominent warning to the user: "All external multi-model reviewers failed. Continuing with native Synthex reviewers only — the consolidated review reflects only the Anthropic perspective."
2. Lists each failed external reviewer with its error code and remediation hint.
3. Runs the consolidation pipeline on the native findings alone (which is mostly a no-op — native reviewers already produce well-structured findings; consolidation just normalizes them and emits the standard report shape).
4. The audit artifact (FR-MR24) records the failure of each external reviewer and the fact that the review completed on natives only.

This fallback ensures that enabling multi-model mode **never makes a command less reliable than today's single-model behavior**. The worst case is "today's review behavior, plus a warning that you didn't get the multi-model lift you configured for." There is no separate fallback CLI path or re-run — the safety net is structural, baked into the parallel fan-out shape.

If `include_native_reviewers: false` AND all external reviewers fail, the orchestrator has nothing to consolidate. In that case it reports the total failure to the user with all error codes, and the calling command decides how to handle (typically: report the failure as the review verdict and let the user retry).

**Acceptance Criteria:**
- Continuation triggers automatically when all externals fail AND strict mode is off AND at least one native reviewer succeeded — no new CLI invocations needed
- The user sees a visible warning, not a silent continuation
- The audit artifact records both the external failures and the native-only continuation
- The continuation uses the native sub-agent results from the same review cycle — there is no second round of native invocations
- When `include_native_reviewers: false` AND all externals fail, the command surfaces the total failure as a review error rather than producing an empty report

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

The `init` command is updated to introduce multi-model review during project setup. Because the feature is off by default and requires external CLI configuration, discoverability depends on the user learning about it at init time.

**Changes to `init`:**

1. After the existing concurrent-tasks prompt, add a new section: **"Multi-model review (optional)"**.
2. Briefly describe the feature: "Synthex can run reviews across multiple LLM families (Claude, GPT, Gemini, local models) via CLIs you already have installed. Off by default."
3. Detect locally-available CLIs via `which` for each first-class adapter (FR-MR10) and report which are installed.
4. Use `AskUserQuestion` to ask whether to enable multi-model review with the detected CLIs as defaults. Options:
   - "Enable with detected CLIs" — writes `multi_model_review.enabled: true` and reviewers matching detected CLIs
   - "Enable later (show config snippet)" — leaves `enabled: false` and prints a commented-out config snippet with setup instructions
   - "Skip" — no changes, no snippet
5. If the user enables it, run the preflight validation once (FR-MR20) and show the result.

**Acceptance Criteria:**
- `init` detects installed CLIs without asking the user to enumerate them
- Users who skip the prompt get no configuration changes and no surprises
- Users who enable the feature get a config that works, including sensible defaults for `aggregator` and `strict_mode`
- The init output includes a link/reference to the full docs for multi-model review

**FR-MR20: Preflight validation**

A preflight check runs on every multi-model-review invocation AND at the end of `init` if the feature was enabled. Preflight:

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

**FR-MR21: `review-code` integration (v1 scope) — with complexity gating**

`review-code` is updated to detect and use multi-model review *selectively*. Multi-model review is expensive (N provider invocations + 1 aggregator) and adds latency; running it on every tiny diff slows hands-off development with no quality gain, because small changes rarely surface cross-reviewer disagreement. The command therefore applies a **complexity gate** after loading configuration: only diffs above the threshold trigger the orchestrator; smaller diffs fall through to the existing native single-model path.

**Decision order (applied in sequence after Step 1 Load Configuration):**

1. **Explicit override wins.**
   - `--no-multi-model` → always use native single-model review, skip all multi-model logic below.
   - `--multi-model` → always use multi-model review, skip the gate below.

2. **Master switch.** If `multi_model_review.enabled: false` OR `multi_model_review.per_command.review_code.enabled: false`, use native-only review (today's behavior — Code Reviewer + Security Reviewer + optional Performance Engineer; no externals).

3. **Complexity gate (FR-MR21a).** The command reads `multi_model_review.per_command.review_code.complexity_gate`:

   - `mode: never` → always use native-only review (externals never added)
   - `mode: always` → always run native + external (skip the gate; same as `--multi-model`)
   - `mode: auto` (default) → apply the heuristic:
     - Compute diff metrics: `lines_changed = added + removed`, `files_touched = distinct files in diff`
     - If `lines_changed > threshold_lines`, add externals
     - Else if `files_touched > threshold_files`, add externals
     - Else if any file matches any glob in `always_escalate_paths`, add externals
     - Else native-only (today's behavior)

4. **Multi-model path (gate triggered or `--multi-model`):**
   - Invoke `multi-model-review-orchestrator`, which fans out to **both** the native sub-agents (Code Reviewer + Security Reviewer + optional Performance Engineer) AND the external adapters configured in `multi_model_review.reviewers` (e.g., Codex, Gemini) — all in one parallel batch (FR-MR12).
   - Native sub-agents run with their existing prompts and full Synthex context. External adapters run with the context bundle (FR-MR28).
   - The orchestrator consolidates findings from all sources into a single unified report.
   - The unified report format (`## Code Review Report`) is preserved; the reviewer table shows one row per native reviewer AND one row per external reviewer (e.g., "Code Reviewer", "Security Reviewer", "GPT-5 (Codex)", "Gemini 2.5 Pro").

5. **Native-only path (gate not triggered or `--no-multi-model`):**
   - Behavior is byte-identical to today's `review-code` — Code Reviewer + Security Reviewer + optional Performance Engineer run via the existing single-model path. The orchestrator is not invoked at all.

6. **Always transparent.** The unified report's header states which path ran and why, in one line:
   - `Review path: native + external multi-model (complexity gate triggered: 127 lines changed > 50; reviewers: 2 native + 2 external)`
   - `Review path: native + external multi-model (forced by --multi-model flag; reviewers: 2 native + 3 external)`
   - `Review path: native + external multi-model (always_escalate match: src/auth/session.ts; reviewers: 2 native + 2 external)`
   - `Review path: native only (diff below complexity threshold: 12 lines across 1 file; reviewers: 2 native)`
   - `Review path: native only (multi-model disabled in config; reviewers: 2 native)`
   - `Review path: native only (all external reviewers failed — see error log; reviewers: 2 native, 0 external succeeded)`

7. **Continuation when externals fail.** If the orchestrator fires and all external reviewers fail (FR-MR17), the unified report still completes using the native sub-agents' findings (which were collected in the same parallel cycle) and emits a warning. This is *not* a separate fallback re-run — there is no extra cost or latency to the failure path.

8. **Review loop continues to work:** on FAIL verdict, the command re-invokes whichever path was chosen with the updated diff. Note that the gate decision is made once per `review-code` invocation, not per loop cycle — if a fix pushes a diff from 48 lines to 52 lines mid-loop, the loop still uses the path chosen at the start. This prevents oscillation.

**Acceptance Criteria:**
- `review-code --multi-model` adds external reviewers to the native ensemble even if disabled in config or below the complexity gate
- `review-code --no-multi-model` runs native-only even if enabled and above the gate (no externals invoked)
- `mode: auto` adds externals on diffs > threshold_lines, diffs touching > threshold_files files, or diffs matching any always_escalate_paths glob — verified with planted fixtures for each trigger
- `mode: never` disables external reviewers entirely for `review-code` without unsetting the master switch (useful for cost-sensitive CI)
- When externals are added, native sub-agents continue to run unchanged — verified by snapshot regression test that native findings are present in the unified report alongside external findings
- The unified report header always states which path ran and why, in the documented format
- Design-system compliance for UI changes (today's automatic behavior) continues to run regardless of path — the design-system agent is a specialized advisory role, not a generic reviewer, and is always invoked on UI diffs
- The complexity gate decision is cached for the duration of the review loop to prevent oscillation between paths mid-loop

**FR-MR22: `write-implementation-plan` integration (v1 scope)**

`write-implementation-plan` is updated similarly to `review-code`, with one key difference: there is no complexity gate. Plans are inherently high-stakes and a small plan is not a good reason to skip multi-model review.

1. The plan review step (currently runs Architect + Designer + Tech Lead as native sub-agents) becomes multi-model-aware.
2. **When multi-model is active**, the orchestrator is invoked with the draft plan as the artifact. The orchestrator fans out to **both** the native sub-agents (Architect + Designer + Tech Lead) AND the configured external adapters in one parallel batch.
3. **Native sub-agents keep their role-specialized prompts.** Architect reviews architecture; Designer reviews design; Tech Lead reviews task clarity. Each emits findings in the canonical schema.
4. **External reviewers play a generalist "plan reviewer" role.** This is per-Open-Question OQ-1 — for v1, every external model reviews as a generalist. Role-specialization for externals is deferred to v2.
5. **Consolidation merges all findings** — the PM agent receives a single consolidated list as it does today, with attribution showing which native or external reviewer raised each finding.
6. **When multi-model is inactive**, behavior is byte-identical to today's plan review — only the native sub-agents run.
7. The Product Manager's decision-and-revision flow (invoking `plan-scribe` to apply decided edits) is unchanged.

**Acceptance Criteria:**
- Native Architect + Designer + Tech Lead sub-agents run unchanged on every invocation, regardless of whether externals are added
- When multi-model is active, external reviewers run in parallel alongside the natives in a single fan-out batch
- The PM agent receives consolidated findings in the same shape it does today, with per-finding attribution distinguishing native and external sources
- `plan-linter` (pre-review structural check) is unaffected — it runs before the orchestrator, as today
- Disabling multi-model produces byte-identical behavior to today (native-only)

**FR-MR23: Command behavior when multi-model is inactive**

Every command touched by this PRD must preserve its current behavior when `multi_model_review.enabled: false` OR when `--no-multi-model` is passed. Test coverage must include a regression test that asserts identical output for a representative fixture with multi-model disabled.

**Acceptance Criteria:**
- Disabling multi-model produces byte-identical command behavior to today (modulo non-deterministic LLM outputs)
- Enabling multi-model then disabling it returns to pre-enablement behavior

---

### 4.8 Audit Artifact

**FR-MR24: Review audit file**

Every multi-model review invocation writes an audit file to `docs/reviews/` (configurable). File naming: `<YYYY-MM-DD>-<command>-<short-hash>.md`.

Contents:

1. **Invocation metadata** — command, target/artifact, timestamp, git commit, Synthex version
2. **Configuration snapshot** — the resolved `multi_model_review` config used for this invocation (strict mode, `include_native_reviewers` setting, external reviewers list, aggregator)
3. **Preflight result** — which external CLIs were available, family diversity (counting natives), warnings
4. **Per-reviewer results** — separated into two sections:
   - **Native reviewers** — for each Synthex sub-agent invoked: name, status, finding count
   - **External reviewers** — for each external proposer: name, family, status, error code if any, finding count, token usage, raw output path (under `/tmp` or a per-run subdirectory)
5. **Consolidated findings** — the final output, same format as returned to the caller, with each finding's attribution showing whether it came from a native or external reviewer (or both)
6. **Aggregator trace** — which findings were merged, which were flagged as contradictions, which triggered the severity judge, which were demoted as minority-of-one
7. **Continuation event** (if applicable) — list of failed external reviewers, the decision to continue with natives only, family-diversity warning if applicable

**Acceptance Criteria:**
- Audit files are written for every invocation, including ones where some or all externals failed
- Native and external reviewer sections are clearly separated in the audit so a reader can quickly answer "which natives ran" vs "which externals ran"
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

- The `init` discoverability prompt (FR-MR19) includes a warning: "Multi-model review sends your code/plans/PRD to the configured external providers. Confirm this matches your organization's data-handling policy."
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
Users with no `multi_model_review` section in their config see exactly today's behavior across all review commands. Adding the section and setting `enabled: false` is also a no-op. No silent opt-ins, ever.

**NFR-MR2: Platform support**
The feature works on all Claude Code surfaces that expose host bash: CLI, desktop app in local session, IDE extensions backed by either. It degrades gracefully — with a clear error — on cloud/web surfaces where host CLIs are not reachable unless the user has configured setup scripts to install them.

**NFR-MR3: Parallel execution**
Proposer invocations run in parallel. The end-to-end wall-clock time of a multi-model review should approximate `max(per-reviewer times) + aggregator time`, not the sum.

**NFR-MR4: Cost transparency**
The audit artifact reports token usage per reviewer when the CLI provides it. Synthex itself does not compute costs (rates vary by provider/plan); users consult their provider billing dashboards. The documentation must set expectations: multi-model review is strictly more expensive than single-model review, and the cost is borne by the user through their existing provider relationships.

**NFR-MR5: Extensibility**
Adding a new adapter requires only: creating `<adapter>-review-prompter.md` in `plugins/synthex/agents/`, registering it in `plugin.json`, and documenting its CLI. No changes to the orchestrator are required provided the adapter conforms to FR-MR9.

**NFR-MR6: Consistent output contract**
The orchestrator's returned findings conform to the same canonical schema as native reviewer findings, so any downstream consumer (a command's consolidated report, `findings-consolidator`, the PM's plan-revision flow) works identically regardless of whether multi-model was used.

**NFR-MR7: Testability**
Every adapter and the orchestrator must be testable under the existing three-layer testing pyramid (schemas/behavioral/semantic per `CLAUDE.md`):
- **Layer 1 (schema):** validate adapter output envelopes against the canonical schema; validate orchestrator output structure.
- **Layer 2 (behavioral):** cached-output tests with planted conflicting findings to verify dedup, severity reconciliation, contradiction handling, fallback.
- **Layer 3 (semantic):** LLM-as-judge against a corpus of real multi-reviewer findings to verify the aggregator produces consolidated output that a human would accept.
Adapter tests must NOT require the real CLI to be present in CI — they use recorded fixture outputs for each CLI family.

**NFR-MR8: Observability**
The orchestrator logs every major decision (dedup merges, severity judge invocations, contradiction detections, fallback triggers) to the audit artifact. Log format is structured (markdown sections with finding IDs) so future tooling can diff audit files across runs.

**NFR-MR9: Documentation**
`README.md`, `CLAUDE.md`, and `config/defaults.yaml` must all be updated. The `init` command's configuration guide must include a dedicated multi-model review section. A dedicated `docs/specs/multi-model-review.md` design document covers the architecture for future contributors.

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
| `review-code --multi-model` runs proposer CLIs in parallel | Verified via wall-clock timing on representative fixture |
| Dedup pipeline correctly merges duplicate findings across reviewers | Verified via Layer 2 behavioral fixtures with planted duplicates |
| Severity reconciliation correctly takes max on 1-level disagreement, triggers judge on 2+ level disagreement | Verified via Layer 2 behavioral fixtures with planted disagreements |
| Graceful degradation: review proceeds when 1 of N reviewers fails | Verified via Layer 2 fixture where one adapter is forced to `cli_missing` |
| Fallback: review falls back to native single-model when all reviewers fail | Verified via Layer 2 fixture where all adapters are forced to fail |
| Strict mode aborts on first proposer failure | Verified via Layer 2 fixture |
| `init` detects installed CLIs and offers enable/skip options | Verified via interactive-mode manual test |
| Disabling multi-model via config OR `--no-multi-model` produces today's behavior | Verified via regression fixture |
| Audit artifact is written for every invocation | Verified via file-system check after fixture runs |
| No provider credentials appear in audit artifacts, logs, or config | Verified via test asserting no secret-like tokens appear in sample audits |
| Complexity gate triggers multi-model on diffs > threshold_lines | Verified via Layer 2 fixture |
| Complexity gate triggers multi-model on diffs matching always_escalate_paths | Verified via Layer 2 fixture (trivial diff to src/auth/**) |
| Complexity gate falls through to native review on trivial diffs | Verified via Layer 2 fixture (< threshold_lines, no escalate match) |
| Unified report header declares the chosen review path and reason | Verified via Layer 1 schema test against fixture outputs |
| Context bundle stays under max_bundle_bytes for oversized fixture | Verified via Layer 2 fixture with 500+ KB of touched-file content |
| Text-only reviewer receives context bundle without capability-tier note | Verified via Layer 2 behavioral test inspecting rendered prompt |
| Agentic reviewer receives capability-tier note | Verified via Layer 2 behavioral test inspecting rendered prompt |

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

- **v2 commands:** extend multi-model review to `refine-requirements`, `write-rfc`, `reliability-review`, `performance-audit`
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
If the aggregator's family is the same as the only non-Claude proposer's family (e.g., a GPT-5 aggregator judging an ensemble of GPT-5 + Claude Sonnet proposers, where the only non-Claude voice is GPT-5), is that acceptable? Per FR-MR15 we warn but don't block. Should we block in `strict_mode`? Defer — revisit if users hit self-preference issues in practice.

**OQ-5: Handling reviewer-specific quirks in prompts.**
Some models respond better to specific prompting patterns (Gemini prefers XML-tagged structure; GPT-5 prefers concise instruction). Should adapter prompts be model-family-specific? Recommend a shared canonical prompt in v1 with per-adapter `prompt_style` config field reserved for v2.

**OQ-6: Aggregator failure.**
What if the aggregator CLI itself fails? Options: (a) fall back to `findings-consolidator` (the existing Haiku-backed utility) for mechanical dedup without judgement, (b) fall back to the host Claude session as emergency aggregator, (c) abort with a clear error. Recommend (b) as the most resilient; document as part of FR-MR17 in the implementation plan.

**OQ-7: Complexity gate threshold tuning.**
The v1 defaults (`threshold_lines: 50`, `threshold_files: 3`, plus escalate-paths for auth/payments/migrations/security) are informed guesses, not measured values. After v1 ships, instrument the audit artifact to capture (a) chosen path, (b) whether multi-model found issues native review would have missed, (c) whether native review missed issues that a separately-run multi-model review would have caught. Re-tune the defaults based on this evidence. Consider exposing a `complexity_gate.mode: auto-ml` in v2 that uses a Haiku classifier rather than a hand-coded heuristic — deferred until we have enough data to train/evaluate it.

**OQ-8: Spec-file matching heuristic.**
FR-MR28 says the bundle includes "specs files matching touched paths" but does not define the matching rule. Options: (a) simple filename-substring match (`src/auth/**` touches include `docs/specs/auth.md`), (b) embedding similarity between touched-file path and spec content, (c) explicit mapping in config (`context.spec_map`). Recommend (a) for v1 with (c) as an override, because (b) adds an embedding call before every review which is cost-sensitive. Re-evaluate if users complain about irrelevant specs being included or relevant specs being missed.

**OQ-9: Context bundle caching.**
For a review loop that runs multiple cycles (FR-MR21 step 8), the context bundle from cycle 1 is mostly the same as cycle 2 — only the diff and touched files have changed. Should we cache the non-diff parts (specs, conventions, overview) across loop cycles to save Haiku summarization cost? Recommend cache-by-hash-of-content for v2; v1 reassembles each cycle (simpler, consistent, correct).

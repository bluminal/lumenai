# Multi-Model Review

> Run code, plan, and PRD reviews across multiple LLM families in parallel — Claude, GPT, Gemini, local Ollama models, anything reachable through a CLI on your machine. Get one consolidated, deduplicated, attributed review from the ensemble. Catch the issues that any single model would miss.

---

## Table of contents

1. [What this is](#what-this-is)
2. [The problem this solves](#the-problem-this-solves)
3. [Why now — the technical inflection](#why-now--the-technical-inflection)
4. [How it works](#how-it-works)
5. [Quick start](#quick-start)
6. [The complexity gate — when multi-model fires](#the-complexity-gate--when-multi-model-fires)
7. [Configuration reference](#configuration-reference)
8. [Provider setup](#provider-setup)
9. [Failure handling and strict mode](#failure-handling-and-strict-mode)
10. [Cost considerations](#cost-considerations)
11. [Privacy, data residency, and what gets sent where](#privacy-data-residency-and-what-gets-sent-where)
12. [The audit trail](#the-audit-trail)
13. [Troubleshooting](#troubleshooting)
14. [Comparison to alternatives](#comparison-to-alternatives)
15. [What's evolving — three-tier review](#whats-evolving--three-tier-review)
16. [The path to a standalone plugin](#the-path-to-a-standalone-plugin)
17. [Research and references](#research-and-references)
18. [Glossary](#glossary)
19. [FAQ](#faq)

---

## What this is

Multi-model review is a Synthex feature that takes a review artifact — a code diff, an implementation plan, a PRD, an RFC — and fans it out to **multiple LLM families running in parallel** through CLIs you already have installed (`claude`, `codex`, `gemini`, `ollama`, `llm`, `aws bedrock-runtime`, etc.). An orchestrator then consolidates all of their feedback into a single deduplicated, severity-reconciled, attributed review.

The shape, in one diagram:

```
                       Review request (diff, plan, PRD, …)
                                       │
                                       ▼
                  ┌──────────────────────────────────────┐
                  │  multi-model-review-orchestrator     │  Sonnet-backed
                  │  (parallel fan-out + consolidation)  │  Synthex agent
                  └──────────────────────────────────────┘
                                       │
            ┌──────────────┬───────────┼───────────┬──────────────┐
            ▼              ▼           ▼           ▼              ▼
    ┌──────────────┐ ┌───────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐
    │ claude-      │ │ codex-    │ │ gemini-│ │ ollama-│ │ bedrock-     │  Haiku-backed
    │ adapter      │ │ adapter   │ │ adapter│ │ adapter│ │ adapter      │  adapter agents
    └──────────────┘ └───────────┘ └────────┘ └────────┘ └──────────────┘
            │              │           │           │              │
            ▼              ▼           ▼           ▼              ▼
       claude -p     codex exec    gemini -p   ollama run    aws bedrock-
                                                              runtime …
            │              │           │           │              │
            ▼              ▼           ▼           ▼              ▼
       Anthropic       OpenAI      Google      Local         AWS Bedrock
       (Claude)        (GPT-5)     (Gemini)    (Qwen,        (Claude, Llama,
                                               Llama, …)     Nova, …)
                                       │
                                       ▼
                  ┌──────────────────────────────────────┐
                  │  Consolidation pipeline              │
                  │   • fingerprint dedup                │
                  │   • lexical / semantic dedup         │
                  │   • severity reconciliation          │
                  │   • Chain-of-Verification on         │
                  │     contradictions                   │
                  │   • per-finding attribution          │
                  └──────────────────────────────────────┘
                                       │
                                       ▼
                          One unified review report
                          + audit artifact in docs/reviews/
```

It is **off by default** and **CLI-only** — Synthex never touches provider API keys. Each external reviewer runs through the user's existing CLI installation, inheriting whatever auth, MCP servers, approval modes, and routing they've already configured.

---

## The problem this solves

### Single-model review has a quality ceiling

Synthex's review commands today (`/review-code`, `/write-implementation-plan`, `/refine-requirements`, `/write-rfc`, `/reliability-review`, `/performance-audit`) all run their reviewers on a single LLM family — whichever Claude model is hosting the session. This is the standard architecture for AI code review tools (Claude Code itself, Cursor, Copilot, Greptile, CodeRabbit's default), and it has a known and well-documented failure mode: **same-family models share blind spots**.

A 2025 study ([arXiv:2506.07962](https://arxiv.org/html/2506.07962v1)) measured pairwise error correlation across LLMs and found that **almost every pair agrees on errors more than chance**, with same-family pairs (GPT-4 + GPT-4o, Claude Sonnet + Claude Opus) sharing the most blind spots. Stacking three Claude reviewers does not multiply detection — it largely re-confirms the same misses.

In practice this means:

- A subtle null-deref the Anthropic family is collectively miscalibrated about will not be caught by any number of additional Claude reviewers, no matter how senior.
- A security pattern that GPT was trained to over-trust (or under-trust) will produce a consistent same-direction error across all GPT-class reviewers.
- "Reviewing harder" with the same model gets you diminishing returns asymptotically.

The only way through this ceiling is **family diversity**: get the same artifact in front of meaningfully different models — different architectures, different training data, different RLHF preference shaping — and consolidate.

### Why this matters for a startup-org-chart plugin

Synthex's premise is that a software organization's quality comes from having the right roles in the room, each with a real perspective. The plugin's existing agents (Tech Lead, Code Reviewer, Security Reviewer, SRE, Architect, Performance Engineer, Design System Agent, etc.) operationalize that for an AI org chart.

But there's an unspoken axis the existing roles can't address on their own: every one of them is the same underlying model. A "Senior Code Reviewer" prompt and a "Security Reviewer" prompt running on the same Claude weights are two voices in the same head. Multi-model review adds the missing axis — **independent voices, not just independent prompts**.

In a real engineering org you would never staff your code review process with three engineers all from the same bootcamp class who learned from the same instructor. Multi-model review is the AI equivalent of getting a security review from someone trained at a different shop.

### The cost of missed bugs vs. the cost of multi-model review

Multi-model review costs more per review than single-model — strictly more LLM calls, strictly more wall-clock time. The honest case for it has to engage with that:

- **One missed CRITICAL bug** in production typically costs an org tens of engineer-hours (triage + diagnosis + fix + postmortem + customer communication), often a five-figure dollar amount in lost revenue / SLA breach / churn, and sometimes a six-or-seven-figure amount if it's a security or data-integrity issue.
- **One multi-model review** of the change that introduced it — three flagship models in parallel through their CLIs — costs cents to single-digit dollars, and adds maybe 30–90 seconds of latency.
- The break-even is therefore not "every review must catch a bug" — it's "this approach must catch one extra meaningful bug per N reviews to pay for itself."

The published evidence (Mixture-of-Agents [arXiv:2406.04692](https://arxiv.org/abs/2406.04692), Cloudflare's coordinator pattern, Greptile's benchmark numbers) all point at multi-model lift in the high single digits to low double digits of additional issues caught compared to single-model baselines. That's well above the break-even at any plausible cost ratio.

The complexity gate (see below) ensures we don't pay this cost for trivial changes where the lift wouldn't apply anyway.

---

## Why now — the technical inflection

Multi-model review as a *concept* has been around since the first Mixture-of-Agents paper. What has changed in the last 18 months is the **operational substrate**:

1. **Every major model vendor now ships a flagship CLI** with a non-interactive headless mode and structured output. `claude -p`, `codex exec --json`, `gemini -p --output-format json`, `ollama run`, `llm -m <model> --schema`, `aws bedrock-runtime invoke-model`. Two years ago, calling GPT from Claude Code meant building an HTTP client, handling auth, managing retries, dealing with format drift. Today it means shelling out to a tool the developer already has installed and parsing one JSON envelope.
2. **Developer machines now routinely host 3+ vendor CLIs simultaneously.** A typical AI-engineering setup in 2026 has Claude Code, Codex, and at least one of Gemini / Ollama / Cursor installed concurrently. The "install N SDKs and manage N API keys" friction that killed earlier multi-model attempts is gone — the developer's existing tool installs *are* the integration layer.
3. **Local model inference has caught up enough to be a real third voice.** Qwen 2.5 Coder 32B, DeepSeek V3, and Llama-class models running in Ollama produce reviews that meaningfully add to a Claude+GPT ensemble without privacy concerns or per-call cost.
4. **Extended-thinking / reasoning modes are widely available** (Claude extended thinking, GPT-5 / o-series reasoning tokens, Gemini 2.5 thinking). Code review is the canonical task that benefits from reasoning depth, and modern flagship CLIs expose it cleanly.

Combine these four shifts and a CLI-orchestrated multi-model review system becomes practical to ship as a thin plugin with no provider integration code, no credential storage, no SDK bundling — exactly the shape this feature takes.

---

## How it works

### The agents involved

| Layer | Agent | Model | Role |
|-------|-------|-------|------|
| Calling agent | e.g., `tech-lead`, `product-manager`, or a command like `/review-code` | (existing) | Hands a review artifact to the orchestrator |
| Orchestrator | `multi-model-review-orchestrator` | Sonnet | Fans out to adapters in parallel, runs the consolidation pipeline, returns one unified review |
| Adapter (one per provider) | `claude-review-prompter`, `codex-review-prompter`, `gemini-review-prompter`, `ollama-review-prompter`, `llm-review-prompter`, `bedrock-review-prompter` | Haiku | Wraps a specific CLI; handles invocation, output parsing, error normalization |
| Proposer (the actual external LLM) | Claude Opus, GPT-5, Gemini 2.5 Pro, Qwen 2.5 Coder, etc. | (whichever the user's CLI selects) | Reads the artifact, emits structured findings |
| Aggregator | One of the proposers, picked automatically or by config | (the strongest proposer by default) | Takes the consolidated draft from the orchestrator and produces the final judgement on contested findings |

### The proposer / aggregator split

The orchestrator follows a **Mixture-of-Agents** ([arXiv:2406.04692](https://arxiv.org/abs/2406.04692)) two-tier shape, also used in production by [Cloudflare's AI Code Review coordinator](https://blog.cloudflare.com/ai-code-review/), [Ellipsis.dev](https://www.ellipsis.dev/blog/how-we-built-ellipsis), and [Qodo Merge](https://qodo-merge-docs.qodo.ai/):

- **Proposers** independently produce findings on the same artifact. They never see each other's work — that's the whole point. Independence is what makes their disagreements diagnostic and their agreements meaningful.
- **The aggregator** sees all proposer outputs together and produces the final consolidated review — handles dedup, severity reconciliation, contradiction handling, attribution.

A common misconception is "use cheap proposers and a strong aggregator." That is **not** what the published architectures do, and not what this design does. The aggregator can only consolidate what proposers produce; if a proposer misses a subtle bug, the aggregator cannot recover it. Each proposer slot is high-value and should be a flagship reasoning-capable model. The aggregator's job is *judgement among existing findings* — that is a lighter task than producing them, so the aggregator does not need to be markedly stronger than the proposers, but must be at least as capable as the weakest proposer to avoid information loss.

### The consolidation pipeline

Once all proposers have returned, the orchestrator runs a six-stage consolidation pipeline:

1. **Fingerprint dedup (mechanical).** Findings that share an exact `finding_id` (`<category>/<subcategory>/<rule-slug>`) are grouped. One in, one out. This is the cheap fast majority of dedup.
2. **Lexical dedup within co-located buckets.** For findings that share a `(file, symbol)` tuple but have different `finding_id`s, compute title similarity (Jaccard / MinHash). Above 0.8 → merge.
3. **Semantic dedup within co-located buckets.** For the remainder, compute cosine similarity on title+description embeddings. Above 0.85 → merge.
4. **LLM tiebreaker for ambiguous pairs.** For pairs above 0.7 but below 0.85 embedding similarity, the orchestrator asks itself: "Are these the same issue?" with position randomized.
5. **Severity reconciliation.** When reviewers agree → use the agreed severity. When they disagree by one level → take the max, record the range. When they disagree by two or more → trigger a judge step with chain-of-thought reasoning.
6. **Contradiction detection + Chain-of-Verification.** When two findings make opposing claims about the same location ("add retry" vs. "don't retry — not idempotent"), the orchestrator re-reads the relevant artifact section *independently* of either reviewer's prose ([CoVe, arXiv:2309.11495](https://arxiv.org/abs/2309.11495)) and adjudicates against the source rather than the writing.

Findings flagged by only one reviewer are **never dropped** on the basis of low consensus — they are demoted one severity level (security findings excepted) and surfaced with attribution. The committee effect that erases sharp single-source insights is a known multi-agent failure mode; this design specifically guards against it.

Every consolidated finding carries:

- **Attribution** — which reviewers raised it, e.g., `flagged by: Claude Opus, Gemini 2.5 Pro`
- **Consensus badge** — e.g., `2/3 reviewers · Anthropic+Google`
- **Severity range** — when reviewers disagreed, the original per-reviewer severities are preserved, e.g., `severity: high (range: medium–high)`

### Research backing the design choices

This is not a hand-waved architecture. Each major design decision maps to specific published research or a published production system:

| Design choice | Source |
|---------------|--------|
| Two-tier proposer/aggregator | [Mixture-of-Agents (arXiv:2406.04692)](https://arxiv.org/abs/2406.04692), [Together MoA blog](https://www.together.ai/blog/together-moa) — measured +7.6 pt on AlpacaEval over single-model |
| Family diversity requirement | [Correlated Errors in LLMs (arXiv:2506.07962)](https://arxiv.org/html/2506.07962v1) — same-family pairs share blind spots more than chance |
| Coordinator-style aggregation | [Cloudflare's AI Code Review architecture](https://blog.cloudflare.com/ai-code-review/) |
| 4-stage dedup with canonical fingerprint | [DefectDojo SAST dedup](https://github.com/DefectDojo/django-DefectDojo/issues/1500), [Checkmarx SimilarityId](https://gitlab.com/gitlab-org/gitlab/-/issues/299589), [BigCode MinHash-LSH](https://huggingface.co/blog/dedup), [GPTrace embedding dedup (arXiv:2512.01609)](https://www.arxiv.org/pdf/2512.01609) |
| Severity reconciliation with judge escalation | [G-Eval CoT scoring](https://deepeval.com/docs/metrics-llm-evals), [LLM-as-judge bias studies (arXiv:2306.05685)](https://arxiv.org/abs/2306.05685) |
| Chain-of-Verification on contradictions | [CoVe (arXiv:2309.11495)](https://arxiv.org/abs/2309.11495) — decoupled verification reduces hallucination propagation |
| Never-drop minority-of-one | [Group-shift / committee effect literature](https://ideas.repec.org/p/pen/papers/16-015.html) — aggregation systematically erases sharp minority insights |
| Per-finding attribution | [Trust dynamics in AI advice (Frontiers Psychology review)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1390182/full) — attribution increases thoughtful utilization without opacity costs |

The full research synthesis lives in the implementation plan and the PRD (`docs/reqs/multi-model-review.md`).

### Capability tiers — agentic vs text-only adapters

CLIs are not equivalent. They differ in a way that has direct quality implications for review:

- **Agentic CLIs** (`claude -p`, `codex exec`, `gemini -p`, `opencode run`) support tool-use natively. They can read additional files in their sandboxed working directory, follow imports, check sibling code, look up specs.
- **Text-only CLIs** (`ollama`, `llm`, `aws bedrock-runtime`, `mods`) are pure prompt-in / text-out. They cannot read files at all — whatever context they're going to get, they get in their initial prompt.

Without intervention, this would systematically disadvantage text-only reviewers on context-sensitive findings ("this duplicates a utility in `src/utils/helpers.ts`", "this violates the auth pattern in `docs/specs/auth.md`"). The orchestrator levels the field by **pre-assembling a context bundle** for every reviewer regardless of tier — diff + full contents of touched files + matching specs + CLAUDE.md + optional project overview. Agentic reviewers get that bundle *plus* read-only sandbox access for further exploration; text-only reviewers get the bundle alone. Bundle is size-capped (200 KB default) with Haiku-driven file summarization above the cap.

This means text-only models like Ollama-hosted Qwen produce meaningfully useful reviews — not just shallow surface-level commentary on the diff hunk. It also means users with strict data-residency requirements can run a fully local-only configuration (Ollama proposers, Ollama aggregator) and still get genuine multi-model review, just within their own infrastructure.

# Scenario: Parallel Fan-Out (2 Native + 2 External)

## What Is Tested

This fixture verifies the structural properties of FR-MR12 single-batch fan-out:
all four proposers (2 native Anthropic + 2 external) contribute findings to a single
unified envelope under the orchestrator's parallel dispatch contract.

## Proposers

- **code-reviewer** — native-team, family: anthropic (2 findings)
- **security-reviewer** — native-team, family: anthropic (1 finding)
- **codex-review-prompter** — external, family: openai (2 findings)
- **gemini-review-prompter** — external, family: google (2 findings)

Total findings: 7 (split 2+1+2+2).

## FR / Design Decisions Exercised

- **FR-MR12** — "Native and external proposers run in a single parallel Task batch."
  Structural check: the orchestrator `.md` contains the verbatim phrase
  `"single parallel Task batch"`.
- **D6** — single-batch Task dispatch primitive.
- **D21** — path-and-reason header regex:
  `Review path: multi-model (above-threshold diff; reviewers: 2 native + 2 external)`.
- **D17 / FR-MR15** — aggregator resolved via tier table to `codex-review-prompter`
  (GPT-5 / openai ranks above Gemini 2.5 Pro in the D17 strict total-order).
- **FR-MR9** — per-reviewer attribution: every finding carries `source.reviewer_id`,
  `source.family`, and `source.source_type`.

## Wall-Clock Fan-Out Verification — Explicitly Deferred

Cached fixtures do NOT exercise real parallelism: promptfoo replays at near-zero
latency regardless of whether the proposers were dispatched concurrently or serially.

**Wall-clock fan-out verification is explicitly deferred to Milestone 7.3 Task 61a.**
That task will instrument real invocations and assert that all proposers complete
within a wall-clock window no wider than the slowest single-proposer latency plus a
small collation overhead — not the SUM of per-proposer latencies.

## Family Diversity

Three distinct LLM families participate:
- `anthropic` (code-reviewer, security-reviewer)
- `openai` (codex-review-prompter)
- `google` (gemini-review-prompter)

This satisfies the `min_family_diversity` requirement of 2 (default) with headroom.

## Fixture Files

- `fixture.json` — scenario metadata and input parameters
- `expected_envelope.json` — complete unified envelope the orchestrator must produce
- `scenario.md` — this file; narrative description of what is verified
- `README.md` — forward-reference comment for deferred wall-clock verification

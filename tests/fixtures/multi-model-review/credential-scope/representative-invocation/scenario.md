# Scenario: FR-MR2 Cross-Cutting Credential-Leak Contract

## What This Scenario Proves

Every output path Synthex writes during a multi-model review must be credential-clean.
This is the **FR-MR2 cross-cutting contract**: no secret material may appear in any
file or stream the orchestrator produces, regardless of the content it received as input.

## The 5 Output Path Categories

Synthex's multi-model review pipeline writes to five distinct path categories:

1. **Audit file** — the per-invocation markdown artifact written by `audit-artifact-writer`
   to `config.audit.output_path`. Contains invocation metadata, config snapshot, preflight
   result, per-reviewer table, findings with attribution, aggregator trace, and (optionally)
   continuation event. This file is the primary observability artifact and is shared with
   reviewers and stored in version control.

2. **Raw output files** — one JSON file per external adapter, written to
   `config.audit.raw_output_path` by each `*-review-prompter`. Contains the adapter's
   raw findings, model, usage counters, and status. These files feed post-hoc debugging
   and cost analysis.

3. **Orchestrator stderr** — the orchestrator emits structured log lines to stderr covering
   preflight, fan-out progress, stage-by-stage consolidation counts, and the final audit
   path. Consumed by CI pipelines and terminal operators.

4. **`.synthex/config.yaml` after init** — the project-level config file written by
   `synthex init`. Contains routing configuration, adapter selection, complexity gate
   thresholds, and audit output paths. It is intentionally free of authentication material
   because Synthex uses CLI-based external reviewers — credentials are managed by each CLI
   tool independently, never by Synthex.

5. **Bundle manifest** — written by `context-bundle-assembler`, records file paths,
   sizes, summarization flags, and diff stats for every file included in the context bundle.
   The manifest contains metadata only — no file contents — so credential strings present
   in source files cannot propagate through the manifest path.

## The Credential Pattern Set

The test scans every output file for the following patterns (representative of real-world
credential prefixes across major providers):

| Pattern | Provider / Type |
|---------|----------------|
| `sk-` | OpenAI API key prefix |
| `AIzaSy` | Google Cloud / Firebase API key prefix |
| `AWS_SECRET` | AWS secret access key variable name |
| `AWS_ACCESS_KEY_ID` | AWS access key ID variable name |
| `Bearer ` | HTTP Authorization header token bearer prefix |
| `bearer_` | Generic bearer token variable prefix |
| `xoxb-` | Slack bot token prefix |
| `glpat-` | GitLab personal access token prefix |
| `ghp_` | GitHub personal access token prefix |
| `gho_` | GitHub OAuth token prefix |

## The Empirical Proof

The test in `tests/schemas/credential-leak.test.ts` performs a literal string scan of
all six sample output files against all ten patterns. Zero matches is the required outcome.
This is not a probabilistic or heuristic assertion — it is a deterministic grep that fails
immediately if any pattern appears in any file.

60 assertions (10 patterns × 6 files) constitute the empirical proof of FR-MR2 compliance
for a representative invocation. The pattern set is extensible: adding a pattern to
`fixture.json`'s `credential_pattern_set` automatically adds 6 assertions to the suite.

## Why This Test Belongs in Layer 2

Layer 2 (the `tests/schemas/` suite) validates cross-cutting contracts and schema
invariants that span multiple agents. FR-MR2 is exactly such a contract: it cuts across
the audit writer, every adapter, the orchestrator's own logging, the init command, and the
bundle assembler. No single agent's own test suite can prove this cross-agent invariant.
Placing the credential-leak test in Layer 2 ensures it runs on every CI push alongside
all other schema and contract tests.

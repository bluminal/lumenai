# Multi-Model Teams — Layer 3 Quality Baseline

This document establishes the expected pass rate, regression gating policy, and operating procedure for the Layer 3 semantic evaluations in `tests/promptfoo/multi-model-teams/`. It satisfies Task 78 of the multi-model-teams implementation plan (Phase 10).

## Scope

Two evaluation suites in this directory:

| Suite | File | Tests | Trigger |
|-------|------|-------|---------|
| Consolidation judge | `team-review-consolidation-judge.yaml` | 5 (S-MMT-01..S-MMT-05) | Manual (cached corpus) |
| Wall-clock parallelism | `wall-clock-parallelism.yaml` | 1 (S-MMT-RT-01) | Manual (live CLIs + Synthex+ teams) |

Both suites are tagged `manual-trigger-only` and excluded from per-PR Layer 1+2 default execution per the CLAUDE.md testing pyramid.

## Expected pass rate

### Consolidation judge (cached corpus)

| Scenario | Expected verdict | Score floor | Failure-mode interpretation |
|----------|------------------|-------------|-----------------------------|
| S-MMT-01 (native + external dedup) | PASS | ≥ 0.7 | Failure ⇒ raised_by[] attribution broken or severity-reconciliation rule regressed |
| S-MMT-02 (cross-domain enrichment) | PASS | ≥ 0.7 | Failure ⇒ cross_domain flag dropped or category routing rewritten by reviewer's nominal domain |
| S-MMT-03 (Lead suppression) | PASS | ≥ 0.7 | Failure ⇒ Lead authoring competing report or paraphrasing orchestrator output |
| S-MMT-04 (FAIL re-review cycle) | PASS | ≥ 0.7 | Failure ⇒ orchestrator not re-running per cycle, or cycle output aggregating prior cycles |
| S-MMT-05 (roster validation abort) | PASS | ≥ 0.7 | Failure ⇒ unsupported reviewer not rejected pre-spawn, or side-effects observed before validation |

**Expected aggregate pass rate: 5/5 (100%) on the canonical corpus** with `claude-3-5-sonnet` as judge at `temperature=0.0`.

The judge LLM has temperature 0.0 for determinism; minor wording drift in the corpus or in the orchestrator's documented behavior is acceptable as long as the assertion text in each `llm-rubric` block remains aligned with the rubric's claim.

### Wall-clock parallelism (live)

Single test S-MMT-RT-01 with 4 proposers (2 native via mailbox bridge + 2 external CLIs).

| Metric | Target | Soft floor (warn) | Hard floor (fail) |
|--------|--------|-------------------|-------------------|
| `wall_clock / max(slowest_native, slowest_external)` | ≤ 1.05 (idealized parallelism) | ≤ 1.15 | ≤ 1.20 + overhead |

The 1.20 hard floor is the NFR-MMT5 budget; values above this indicate sequential or partial-sequential execution. The 1.15 soft floor is a regression early-warning — investigate scheduler changes if wall-clock drifts above 1.15× without an architectural change explanation.

**Expected verdict: PASS**, with an attached metrics dump showing wall-clock, slowest_native, slowest_external, and orchestrator_overhead. The PR description for any change touching the orchestrator pipeline, the bridge, or external adapter invocation MUST include this metrics dump.

## Regression gating

Layer 3 is **NOT** part of the default per-PR test gate (per CLAUDE.md testing pyramid: per-PR = Layer 1 only). Regression gating for these suites is policy-based:

1. **Consolidation judge** — gated on PRs that touch any of the following:
   - `plugins/synthex/agents/multi-model-review-orchestrator.md`
   - `plugins/synthex-plus/agents/team-orchestrator-bridge.md`
   - `plugins/synthex-plus/templates/review.md` (multi-model overlay sections)
   - `plugins/synthex-plus/commands/team-review.md` (Steps 5b-4, 5g, 9-pre — the multi-model branch points)
   - The corpus files in `tests/promptfoo/multi-model-teams/corpus/`.

   The reviewing engineer MUST run `npx promptfoo eval --config tests/promptfoo/multi-model-teams/team-review-consolidation-judge.yaml` and attach the result summary to the PR description. Any S-MMT-XX scenario falling below threshold blocks merge.

2. **Wall-clock parallelism** — gated on PRs that touch:
   - The fan-out logic in `multi-model-review-orchestrator.md`
   - The mailbox-poll cycle in `team-orchestrator-bridge.md`
   - Any external adapter agent file (`*-review-prompter.md`)

   The reviewing engineer MUST run the live eval against authenticated codex + gemini and attach the metrics dump (per-reviewer latencies, wall-clock, overhead). Drift above 1.15× soft floor warrants investigation; ≥ 1.20× hard floor blocks merge.

## Operating procedure

### Running the consolidation judge (cached, fast)

Requires: `claude-3-5-sonnet` API access (set `ANTHROPIC_API_KEY`), no other CLIs needed.

```sh
cd tests
npx promptfoo eval \
  --config promptfoo/multi-model-teams/team-review-consolidation-judge.yaml
```

Cost: 5 judge invocations × ~500 tokens output × `claude-3-5-sonnet` rate. Order of magnitude $0.10–$0.30 per run.

### Running the wall-clock parallelism test (live, expensive)

Requires: codex CLI authenticated (`codex auth status` exits 0), gemini CLI authenticated (`gcloud auth list` shows active credentials), `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, and a project with `.synthex-plus/config.yaml` allowing multi-model team-review.

```sh
cd tests
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 \
  npx promptfoo eval \
    --config promptfoo/multi-model-teams/wall-clock-parallelism.yaml
```

Cost: 1 live `/team-review --multi-model` invocation against a real artifact. Token cost dominated by the 4 proposers (~50–200K tokens depending on artifact size). Wall-clock 30s–3min.

The harness must populate `result.metadata` with `per_reviewer_latencies_ms{native[],external[]}`, `fan_out_wall_clock_ms`, and `orchestrator_overhead_ms` — see the test's `assert.value` JS comments for the exact contract.

## Updating the corpus

When adding a new corpus file:

1. Author the JSON in `corpus/NN-<slug>.json` (sequential numbering).
2. Add a corresponding `S-MMT-NN` test entry to `team-review-consolidation-judge.yaml`.
3. Update this document's "Expected pass rate" table with the new scenario's expected verdict and failure-mode interpretation.
4. Run the suite locally and confirm all scenarios PASS (including the new one).

When removing a corpus file (e.g., scenario obsoleted by an architectural change):

1. Remove the JSON file.
2. Remove the corresponding `S-MMT-NN` entry from the judge yaml.
3. **Do not renumber** existing entries — preserve historical scenario IDs for diff readability and changelog stability.
4. Update this document.

## Source authority

- Plan: `docs/plans/multi-model-teams.md` Phase 10
- Tasks: 76 (consolidation judge), 77 (wall-clock parallelism), 78 (this baseline doc)
- NFR-MMT5 (parallelism budget; deferred per D24)
- NFR-MMT6 (Layer 3 semantic eval requirement)
- CLAUDE.md testing pyramid (Layer 3 manual-trigger convention)
- Parent precedent: `tests/promptfoo/multi-model-review/orchestrator-{consolidation-judge,runtime-checks}.yaml`

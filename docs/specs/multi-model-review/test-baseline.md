# Test Baseline — Layer 3 Quality Gate

> Quality regression protection beyond Layer 1 schema and Layer 2 behavioral tests.
> Baseline scoring + CI integration plan for the Layer 3 promptfoo evals.

## Status: Final

## Layer 3 Eval Coverage

The Layer 3 suite covers behaviors that cached Layer 1/2 fixtures cannot verify by
definition — LLM output quality and runtime-only orchestration properties.

| Eval | Verifies | Manual-trigger? |
|------|----------|----------------|
| `orchestrator-consolidation-judge.yaml` (Task 61) — S-MMR-01 through S-MMR-05 | LLM-as-judge: would a human accept the orchestration's consolidation across 5 corpus scenarios? | Yes (cached corpus, LLM judge) |
| `orchestrator-consolidation-judge.yaml` (Task 61) — S-MMR-06 FR-MR12 trace eval | Task-call sequencing — all proposers dispatched in a single parallel batch, no inter-reviewer dependencies (FR-MR12) | Yes (cached trace) |
| `orchestrator-runtime-checks.yaml` (Task 61a) — S-MMR-RT-01 wall-clock | NFR-MR3: 4-proposer fan-out wall-clock ≤ 1.5× slowest single proposer | Yes (LIVE CLI required: codex + gemini) |
| `orchestrator-runtime-checks.yaml` (Task 61a) — S-MMR-RT-02 position randomization | Task 26: Stage 4 tiebreaker prompts alternate finding order across adjacent invocations (FR-MR15) | Yes (LIVE CLI required) |

## Quality Baseline

### Expected pass rates

**`orchestrator-consolidation-judge.yaml` — consolidation quality (S-MMR-01 through S-MMR-05):**
- Target: ≥ 80% of corpus scenarios PASS the LLM-as-judge rubric (4 of 5 scenarios; allowing 1 false-negative from judge variance).
- Per-scenario threshold: 0.7 (set in YAML `threshold` field).
- Established baseline: 5/5 scenarios expected PASS as of initial corpus authoring (April 2026).
- A drop to 3/5 or below constitutes a regression requiring investigation.

**`orchestrator-consolidation-judge.yaml` — FR-MR12 single-batch eval (S-MMR-06):**
- Target: 100% PASS.
- This is structural: the trace either shows single-batch dispatch or it does not. A FAIL indicates an orchestrator regression that MUST be fixed before release.
- Threshold: 0.9 (set in YAML `threshold` field; the judge is evaluating a deterministic trace, not subjective quality).

**`orchestrator-runtime-checks.yaml` — NFR-MR3 wall-clock (S-MMR-RT-01):**
- Target: 100% PASS (wall-clock ≤ 1.5× slowest single proposer).
- ONE retry is permitted under flaky network conditions (e.g., external CLI latency spike). If the retry also fails, treat as a regression.
- A FAIL indicates that the orchestrator is serializing proposers rather than running them in parallel, which violates NFR-MR3.

**`orchestrator-runtime-checks.yaml` — position-randomization (S-MMR-RT-02):**
- Target: 100% PASS.
- The alternating-order rule (`invocation_counter mod 2`) is deterministic per design. A FAIL indicates the randomization logic is broken or was inadvertently removed.

### Baseline summary table

| Test ID | Description | Expected result | Threshold | Retry policy |
|---------|-------------|----------------|-----------|-------------|
| S-MMR-01 | Security CSRF consolidation | PASS | 0.7 | None |
| S-MMR-02 | Performance N+1 consolidation | PASS | 0.7 | None |
| S-MMR-03 | Correctness race condition (CoVe) | PASS | 0.7 | None |
| S-MMR-04 | Design tokens consolidation | PASS | 0.7 | None |
| S-MMR-05 | Plan review consolidation | PASS | 0.7 | None |
| S-MMR-06 | FR-MR12 single-batch trace | PASS | 0.9 | None |
| S-MMR-RT-01 | NFR-MR3 wall-clock fan-out | PASS | — (JS assertion) | 1 retry on network flake |
| S-MMR-RT-02 | Task 26 position randomization | PASS | — (JS assertion) | None |

## CI Integration Plan

Per CLAUDE.md testing pyramid: Layer 3 evals are **manual-trigger only** — they do NOT
run on every PR and are NOT included in the per-PR Layer 1+2 default suite.

### Trigger points

- **Per-release (required):** Run the full Layer 3 suite against the release candidate
  before tagging the version. Block the release if:
  - Any S-MMR-0x consolidation scenario drops below threshold 0.7, AND the corpus pass
    rate falls below 80% (4 of 5).
  - S-MMR-06 (FR-MR12 trace) fails (100% required).
  - S-MMR-RT-01 (NFR-MR3 wall-clock) fails after one retry.
  - S-MMR-RT-02 (position randomization) fails.

- **Per-quarter:** Refresh the corpus (scenarios 01–05) with newer multi-reviewer
  scenarios drawn from production audit logs. Recompute the expected pass rates and
  update the baseline summary table above.

- **Ad-hoc:** Run when investigating a quality regression report — e.g., a user reports
  that consolidated findings are incorrectly attributed or severity reconciliation seems
  wrong.

### Prerequisites

```bash
# Install promptfoo
npm install -g promptfoo

# Verify Anthropic API key (judge uses claude-3-5-sonnet)
echo $ANTHROPIC_API_KEY

# For runtime-check evals (S-MMR-RT-01, S-MMR-RT-02) — live CLIs required:
which codex   # must exit 0
which gemini  # must exit 0
```

See `docs/specs/multi-model-review/adapter-recipes.md` for adapter installation guides.

### Run commands

```bash
# Run consolidation-judge evals (cached corpus, no live CLI needed)
npx promptfoo eval --config tests/promptfoo/multi-model-review/orchestrator-consolidation-judge.yaml

# Run runtime-check evals (live CLI required)
npx promptfoo eval --config tests/promptfoo/multi-model-review/orchestrator-runtime-checks.yaml

# Run both Layer 3 evals together
npx promptfoo eval \
  --config tests/promptfoo/multi-model-review/orchestrator-consolidation-judge.yaml \
  --config tests/promptfoo/multi-model-review/orchestrator-runtime-checks.yaml
```

## Regression Policy

If a future PR causes any Layer 3 eval to drop below baseline:

1. The PR author runs the full Layer 3 suite locally and captures the failure output.
2. The author either:
   - **Fixes the regression** — restores the failing eval to passing and re-runs to confirm, OR
   - **Documents the baseline shift** — updates this file with the new expected pass rates,
     a justification for why the lower bar is acceptable, and the date of the change.
3. PR review must **explicitly approve** any baseline shift documented in this file.
   Undocumented baseline drops are treated as regressions and block merge.

## Source Authority

- NFR-MR6 (consistent output contract — Layer 3 verifies end-to-end quality)
- NFR-MR7 (testability — Layer 3 semantic eval requirement)
- NFR-MR3 (parallel execution wall-clock bound)
- FR-MR12 (single-batch parallel fan-out — verbatim: "Native and external proposers run in a single parallel Task batch.")
- FR-MR14 / FR-MR14a / FR-MR14b (dedup pipeline, severity reconciliation, minority-of-one demotion)
- FR-MR15 (aggregator bias mitigation, Stage 4 alternating order)
- Task 26 (Stage 4 position-randomization implementation)
- Task 61 (consolidation-judge corpus authoring)
- Task 61a (runtime-checks authoring — NFR-MR3 wall-clock + position-randomization)
- Task 62 (this document — baseline establishment and CI integration plan)
- CLAUDE.md (testing pyramid: Layer 3 manual-trigger convention)

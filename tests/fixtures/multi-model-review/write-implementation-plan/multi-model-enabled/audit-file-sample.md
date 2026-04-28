# Multi-Model Review Audit

## 1. Invocation Metadata
- Command: write-implementation-plan
- Target: docs/plans/sample-feature-draft.md
- Requirements: docs/reqs/sample-feature.md
- Timestamp: 2026-04-26T10:00:00Z
- Short hash: a3f9e12b

## 2. Config Snapshot
```yaml
multi_model_review:
  enabled: true
  include_native_reviewers: true
  reviewers:
    - codex-review-prompter
    - gemini-review-prompter
  per_command:
    write_implementation_plan:
      enabled: true
  audit:
    enabled: true
    output_path: docs/reviews/
```

## 3. Preflight Result
5 reviewers configured, 5 available, 2 families (anthropic + openai + google), aggregator: findings-consolidator (source: configured)

## 4. Per-Reviewer Results

### Native reviewers
| Reviewer ID | Family | Status | Findings | Usage |
|-------------|--------|--------|----------|-------|
| architect | anthropic | success | 2 | usage: not_reported |
| design-system-agent | anthropic | success | 1 | usage: not_reported |
| tech-lead | anthropic | success | 1 | usage: not_reported |

### External reviewers
| Reviewer ID | Family | Status | Findings | Usage |
|-------------|--------|--------|----------|-------|
| codex-review-prompter | openai | success | 1 | input_tokens: 4812, output_tokens: 389 |
| gemini-review-prompter | google | success | 1 | input_tokens: 4650, output_tokens: 342 |

## 5. Consolidated Findings with Attribution
- `plan.missing-rollback-strategy` (severity: high) — raised_by: architect (anthropic/native-team), codex-review-prompter (openai/external)
- `plan.underdefined-data-migration` (severity: high) — raised_by: architect (anthropic/native-team)
- `plan.design-token-gap` (severity: medium) — raised_by: design-system-agent (anthropic/native-team)
- `plan.acceptance-criteria-vague` (severity: medium) — raised_by: tech-lead (anthropic/native-team)
- `plan.missing-rollback-strategy` [external view] (severity: high) — raised_by: codex-review-prompter (openai/external)
- `plan.missing-monitoring-observability` (severity: medium) — raised_by: gemini-review-prompter (google/external)

## 6. Aggregator Trace
Aggregator: findings-consolidator (source: configured)
Stage 4 dispatch count: 5 (3 native + 2 external)
Deduplication: 1 finding merged across architect and codex-review-prompter (`plan.missing-rollback-strategy`)
Final consolidated finding count: 6

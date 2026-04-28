# Multi-Model Review Audit

## 1. Invocation Metadata
- Command: review-code
- Target: staged changes
- Timestamp: 2026-04-26T09:14:22Z
- Short hash: d4f8a2e
- Config file path: .synthex/config.yaml

## 2. Config Snapshot

```yaml
multi_model_review:
  enabled: true
  strict_mode: false
  include_native_reviewers: true
  min_family_diversity: 2
  min_proposers_to_proceed: 2
  reviewers:
    - codex-review-prompter
    - gemini-review-prompter
  aggregator:
    command: codex-review-prompter
  consolidation:
    stage2_jaccard_threshold: 0.8
    stage4:
      max_calls_per_consolidation: 25
  audit:
    enabled: true
    output_path: docs/reviews/
    raw_output_path: docs/reviews/raw/
```

## 3. Preflight Result
4 reviewers configured, 4 available, 3 families, aggregator: codex-review-prompter

- CLI presence check: codex — found (/usr/local/bin/codex)
- CLI auth check: codex — authenticated (exit 0)
- CLI presence check: gemini — found (/usr/local/bin/gemini)
- CLI auth check: gemini — authenticated (exit 0)
- Family diversity: 3 unique families (anthropic, openai, google) — threshold met (min: 2)
- Aggregator resolution source: configured

## 4. Per-Reviewer Results

### Native reviewers
| Reviewer ID | Source Type | Family | Status | Findings Count | Error Code | Usage |
|-------------|-------------|--------|--------|----------------|------------|-------|
| code-reviewer | native-team | anthropic | success | 3 | null | usage: not_reported |
| security-reviewer | native-team | anthropic | success | 1 | null | usage: not_reported |

### External reviewers
| Reviewer ID | Source Type | Family | Status | Findings Count | Error Code | Usage |
|-------------|-------------|--------|--------|----------------|------------|-------|
| codex-review-prompter | external | openai | success | 4 | null | input_tokens: 5120, output_tokens: 384 |
| gemini-review-prompter | external | google | success | 3 | null | input_tokens: 4876, output_tokens: 297 |

## 5. Consolidated Findings with Attribution

### Finding 1
- **Severity:** high
- **Category:** security
- **Title:** Missing input validation on user-supplied path parameter
- **File:** src/controllers/userController.ts
- **Symbol:** handleGetUser
- **raised_by:**
  - { reviewer_id: code-reviewer, family: anthropic, source_type: native-team }
  - { reviewer_id: codex-review-prompter, family: openai, source_type: external }
- **superseded_by_verification:** false

### Finding 2
- **Severity:** medium
- **Category:** correctness
- **Title:** Unhandled promise rejection in repository layer
- **File:** src/repositories/userRepository.ts
- **Symbol:** findById
- **raised_by:**
  - { reviewer_id: code-reviewer, family: anthropic, source_type: native-team }
- **superseded_by_verification:** false

### Finding 3
- **Severity:** low
- **Category:** style
- **Title:** Redundant null check before optional chaining
- **File:** src/models/user.ts
- **Symbol:** toDTO
- **raised_by:**
  - { reviewer_id: gemini-review-prompter, family: google, source_type: external }
- **superseded_by_verification:** false

## 6. Aggregator Trace
- Aggregator name: codex-review-prompter
- Resolution source: configured
- Stage 4 LLM-tiebreaker calls dispatched: 1
- Stage 4 LLM-tiebreaker calls skipped (cap): 0
- Position-randomization seed: 3 (invocation counter mod findings length)
- Judge-mode prompt indicator: external-packaged (adapter received judge_mode_prompt field)

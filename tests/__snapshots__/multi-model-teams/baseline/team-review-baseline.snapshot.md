# Baseline snapshot: /team-review (pre-multi-model-teams)

## Invocation

- Command: /team-review
- Target: staged changes
- Template: review (plugin default)
- Config: `multi_model_review` NOT set; `standing_pools` NOT set (feature off)
- Date: <YYYY-MM-DD redacted>

## Decision-flow log

- Step 1: Load configuration — `.synthex-plus/config.yaml` absent; using plugin
  defaults (`teams.default_review_template: review`,
  `cost_guidance.show_cost_comparison: true`)
- Step 2: Determine review scope — staged changes via `git diff --cached`
- Step 3: Pre-flight checks — one-team-per-session check passed; no active teams
- Step 4: Cost estimate displayed; user confirmed
- Step 5a: Read template — `plugins/synthex-plus/templates/review.md` loaded;
  active roles resolved: code-reviewer, security-reviewer
- Step 5b: Compose spawn prompts — read-on-spawn pattern applied; no
  multi-model overlay (feature off); no standing-pool overlay (feature off)
- Step 5c: Auto-compaction guidance included
- Step 5d: Team name: `review-<short-hash redacted>`
- Step 5f: Team created via `Teammate` API
- Step 6: Review tasks created on shared task list (one per reviewer role)
- Step 7: Reviewers claim and execute tasks concurrently
- Step 8: Lead monitors task list; all tasks complete
- Step 9: Lead consolidates findings — verdict precedence: FAIL > WARN > PASS
- Step 10: Consolidated report presented; no review loop triggered
  (verdict: <<verdict>>)

## Per-reviewer status table

| Reviewer | Verdict | Findings |
|----------|---------|----------|
| code-reviewer | <<verdict>> | <<count>> |
| security-reviewer | <<verdict>> | <<count>> |

## Consolidated findings

### CRITICAL
<<finding-body>>

### HIGH
<<finding-body>>

### MEDIUM
<<finding-body>>

### LOW
<<finding-body>>

---

### What's Done Well
<<finding-body>>

---

### Summary
<<finding-body>>

## Trace: multi-model-review-orchestrator invocations

(none — `multi_model_review` is not configured; FR-MMT3 criterion 8 baseline)

## File writes

- (none — team-review does not write artifacts when multi-model-review is off)

## Exit status: 0

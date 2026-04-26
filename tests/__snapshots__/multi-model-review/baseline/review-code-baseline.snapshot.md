# Baseline snapshot: /synthex:review-code (pre-multi-model-review)

## Invocation
- Command: /synthex:review-code
- Target: staged changes
- Config: multi_model_review NOT set (feature off)
- Date: <YYYY-MM-DD redacted>

## Decision-flow log
- Step 1: Load configuration — `.synthex/config.yaml` absent; using plugin defaults (code-reviewer, security-reviewer)
- Step 2: Determine review scope — staged changes via `git diff --cached`
- Step 3: Gather context — CLAUDE.md read; `.eslintrc`, `.prettierrc` scanned for conventions
- Step 4: Launch reviewers in parallel: code-reviewer, security-reviewer
- Step 5: Consolidate via findings-consolidator (Haiku) — dedup, group by file/location, sort by severity
- Step 6: Review loop not triggered (verdict: <<verdict>>)
- Step 7: Present results

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

## File writes
- (none — review-code does not write artifacts when multi_model_review is off)

## Exit status: 0

# Fixture (c): contradiction-cove-adjudicated

## What this tests

Stage 5b contradiction scan (Task 29a) detects a mutually incompatible pair, and CoVe (Task 29b) adjudicates by picking the winner. The loser is marked with `superseded_by_verification: true` but both findings remain visible.

## Setup

Two findings in `src/auth/storeCredentials.ts` → `storeCredentials` (same file + same symbol):
- **Finding A** (`security.storeCredentials.uses-bcrypt`): "Credential storage uses bcrypt correctly" — claims password is hashed
- **Finding B** (`security.storeCredentials.plaintext-password`): "Passwords stored in plaintext" — claims password is NOT hashed

These claims are mutually incompatible: the same code path cannot both use bcrypt AND store plaintext.

## Expected behavior

### Task 29a (contradiction scanner)
- Detects F1 + F2 as a contradiction candidate pair (same file + same symbol).
- Records `detection_reason: "same_file_same_symbol"`.

### Task 29b (CoVe adjudicator)
- Performs chain-of-verification by examining the actual code.
- Finds bcrypt.hash() call at line 17 — confirms Finding A is accurate.
- Picks Finding A as winner; Finding B as loser.

### Output
- **Both findings remain in the output array** (loser is NOT removed).
- Finding A: `superseded_by_verification: false` (winner, unmodified).
- Finding B: `superseded_by_verification: true`, `verification_reasoning: "<CoVe rationale>"`.

## Acceptance assertions

- `expected_stage5b_output.findings_count == 2`
- Winner finding has `superseded_by_verification: false`
- Loser finding has `superseded_by_verification: true`
- Loser finding has `verification_reasoning` as a non-empty string
- `stage5b_29a_detection.contradiction_pairs_found` has 1 entry
- That pair entry has `detection_reason: "same_file_same_symbol"`

## FR/Spec reference

- FR-MR14b: Stage 5b contradiction scan + CoVe
- Task 29a: Contradiction scanner
- Task 29b: CoVe adjudicator

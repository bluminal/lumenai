## Code Review Verdict: FAIL

### Summary
One CRITICAL correctness issue found.

### Findings

#### [CRITICAL] Unhandled null dereference in getUser()
- **Category:** Correctness
- **Location:** src/services/user-service.ts:42
- **Issue:** `user.profile.email` is accessed without a null check on `profile`.
- **Why this matters:** Throws at runtime whenever a user has no profile, taking down the request.
- **Suggestion:** Add an optional chain or explicit guard before accessing `profile.email`.

### What's Done Well
Test coverage for the happy path is thorough.

### Recommendations
Add a regression test for the no-profile case.

# Scenario: Codex `app-server` id-mismatch — adapter drops mismatched response (Pattern 3)

**Adapter:** `codex-review-prompter`
**Permission mode:** `parent-mediated` (Pattern 3 / ADR-003 / D27 / FR-MMT21)
**Test surface:** JSON-RPC `id` correlation rule from Task 85 — adapter MUST verify `response.id == pending_request.id` before writing the response to Codex's stdin.

## Flow under test

1. Codex emits a `requestApproval` with `id: "req-001"` (proposing to read `src/secrets/keys.ts`).
2. Adapter surfaces the request to the parent via the fenced `codex-approval-request` block.
3. The orchestrator (or a misrouted SendMessage) returns a decision with `id: "req-002"` — a STALE / WRONG id that does NOT match the outstanding request.
4. **Adapter MUST detect the mismatch, log a WARN, and DROP the mismatched response.** The adapter does NOT write the mismatched response to Codex's stdin (which would otherwise approve a different tool invocation than intended).
5. Adapter continues waiting for the correctly-correlated response.
6. The orchestrator subsequently sends the correct decision with `id: "req-001"`.
7. Adapter writes the correlated response to Codex's stdin and the review proceeds normally.

## Why this matters

Without id correlation, a stale or misrouted decision could approve a different tool invocation than the parent session intended. This is a TOCTOU-style confusion attack vector — security MEDIUM #2 from the team-review (CWE-345 Insufficient Verification of Data Authenticity). The fixture pins the documented contract: id-mismatch responses are dropped, not silently accepted.

The fixture also exercises the "queued requests" assumption documented in Step 4 of requestApproval Proxying ("continues reading stdout for the next message"). Multiple `requestApproval` messages may queue on stdout before the parent responds; the adapter must use id correlation rather than positional ordering to match decisions to requests.

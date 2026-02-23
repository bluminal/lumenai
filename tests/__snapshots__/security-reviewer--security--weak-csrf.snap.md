## Security Review: `account.ts` + `session.ts`

### Overall Verdict: ❌ FAIL

This code has **6 HIGH severity findings** that must be resolved before merging. Here's the breakdown:

---

## 🔴 HIGH — Must Fix Before Merge

| ID | Finding | Fix Effort |
|----|---------|------------|
| **F-001** | **No re-authentication before `/delete`** — stolen session cookie = instant account deletion, only gated by a string comparison | Low |
| **F-002** | **Password change doesn't invalidate other sessions** — an attacker who hijacked a session retains access even after the victim changes their password | Low |
| **F-003** | **Zero rate limiting on all 3 endpoints** — `/password` can be brute-forced at full network speed | Low |
| **F-004** | **Account deletion is not atomic** — 3 separate queries with no transaction; a crash mid-delete leaves corrupted state | Low |
| **F-005** | **Session cookie missing `secure: true`** — session token transmitted over plain HTTP | Trivial |
| **F-006** | **Session cookie missing `sameSite`** — all 3 routes are CSRF-vulnerable; a malicious page can trigger account deletion with one fetch | Trivial |

**F-005 and F-006 are single-line fixes with HIGH severity — patch these immediately:**

```typescript
cookie: {
  maxAge: 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // ADD THIS
  sameSite: 'strict',                            // ADD THIS
},
```

---

## 🟡 MEDIUM

- **F-007** — `!newEmail.includes('@')` accepts `"@"`, `"a@"`, etc. Use `zod` or a real email validator.
- **F-008** — 8-character minimum is too weak. NIST recommends 12+. Also add a 128-char max to prevent bcrypt DoS.
- **F-009** — `await import('bcrypt')` inside a request handler. Move it to the top-level import.

## 🔵 LOW / INFO

- **F-010** — `"Current password is incorrect"` confirms account existence to attackers.
- **F-011** — `process.env.SESSION_SECRET!` will silently start with `undefined`. Validate at startup.
- **F-012** — New email is immediately activated without verification. Consider a pending-email + token flow.

---

## ✅ What Was Done Well

- **Parameterized queries everywhere** — no SQL injection risk
- **`authenticate` middleware at router level** — no route is reachable unauthenticated
- **bcrypt with cost factor 12** — a solid choice
- **`httpOnly: true`** on the session cookie
- **`resave: false`, `saveUninitialized: false`** — correct production settings
- **Soft-delete pattern** — preserves audit trail and referential integrity
- **No PII in logs** — error messages don't leak hashes or passwords

---

The parameterized SQL and auth middleware show solid fundamentals. The HIGH findings are all fixable with low effort — address the two trivial cookie flags now, then layer in rate limiting, session invalidation on password change, re-auth on delete, and a DB transaction for the deletion flow before this ships.

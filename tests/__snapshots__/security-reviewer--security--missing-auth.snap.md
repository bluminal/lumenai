## Security Review: `src/routes/admin.ts` — **FAIL** 🚨

This PR **must not be merged**. The security reviewer identified **2 critical, 3 high, and 2 medium** findings.

---

### Critical (Block Merge Immediately)

#### F-01 — No Authentication or Authorization on Any Endpoint
Every route in this file is fully public. Anyone on the internet can call these endpoints without a token, session, or any credential. The codebase already has working `authenticate` and `requireRole` middleware used on other routes — they were simply never applied here.

**Fix:** Add middleware to the router and the mount point in `app.ts`:
```typescript
// In admin.ts
router.use(authenticate);
router.use(requireRole('admin'));

// In app.ts  
app.use('/api/admin', authenticate, requireRole('admin'), adminRouter);
```

#### F-02 — Unrestricted `super_admin` Privilege Escalation
The role-update endpoint allows *anyone* (currently unauthenticated, but even post-fix) to promote any user to `super_admin`. There is no privilege ceiling — a compromised `admin` token can create unlimited super-admins.

**Fix:** Require `super_admin` to call this endpoint, and remove `super_admin` from the assignable roles list.

---

### High (Fix Within This Sprint)

| # | Finding |
|---|---------|
| F-03 | **Unlimited PII export** — `?limit=999999` dumps the entire `users` table. Enforce `MAX_PAGE_SIZE = 100`. |
| F-04 | **Insufficient audit logging** — Role changes log the target but not *who made the change* or the previous role. Add `actorId`, `actorIp`, and `previousRole`. |
| F-05 | **User ID enumeration oracle** — Differential 404 responses allow iterating over valid user IDs. |

---

### Medium (Harden Before Release)

| # | Finding |
|---|---------|
| F-06 | **No rate limiting** on admin routes — add `express-rate-limit` at the `/api/admin` prefix. |
| F-07 | **Unvalidated `id` parameter** — non-UUID/non-integer values hit the database and return 500s instead of 400s. Validate format before querying. |

---

The security reviewer provided a complete corrected implementation of `admin.ts` and the `app.ts` mount. The two P0 findings alone represent a **fully unauthenticated path to compromise every user account and self-escalate to the highest privilege tier in the system**. Do not ship this.

## Security Review — **FAIL** 🚨 Hard Block, Do Not Merge

The security reviewer identified **2 critical (P0)** and **3 high (P1)** issues across the diff. Here's a summary:

---

### 🔴 P0 — Critical (Must fix immediately)

**1. Hardcoded Stripe Live Secret Key** (`src/config/payments.ts`, line 6)
```typescript
secretKey: 'sk_live_4eC39HqLyjWDarjtT1zdp7dc',  // ← COMPROMISED
```
- This is a **production `sk_live_` key** hardcoded in source. Anyone who has cloned this repo has it.
- **Immediate action:** Rotate the key in the Stripe Dashboard **right now**, audit for unauthorized activity, then purge from git history with `git filter-repo`.
- Fix: use `requireEnv('STRIPE_SECRET_KEY')` just like the other two env vars.

**2. Unauthenticated DELETE Endpoint** (`src/routes/catalog.ts`, lines 55–69)
```typescript
router.delete('/:id', async (req, res) => { ... })  // ← No auth!
```
- Anyone on the internet can loop through IDs and wipe your entire catalog. The `POST` handler correctly uses `authenticate, requireRole('admin')` — the `DELETE` was simply forgotten.
- Fix: Add `authenticate, requireRole('admin')` to the DELETE route.

---

### 🟠 P1 — High

| Issue | File | Fix |
|---|---|---|
| Error messages leak DB internals to clients | `catalog.ts` | Return generic messages; log details server-side only |
| No input validation on `POST /` (`price`, `imageUrl`, `specs`) | `catalog.ts` | Add Zod schema validation |
| `target="_blank"` missing `rel="noopener noreferrer"` (tab-napping) | `ExternalLinks.tsx` | Add `rel="noopener noreferrer"` |

---

### 🟡 P2 — Medium

- `GET /:id` lacks type validation on the `id` param (pass `parseInt` before querying)
- DELETE audit log missing `deletedBy: req.user.id` once auth is added

---

**The Stripe key must be rotated before anything else — treat it as compromised right now.**

## Security Review: `src/routes/products.ts`

### Verdict: ⚠️ WARN

The code has a solid security foundation, but **one high-severity issue must be fixed before production deployment**, plus two medium findings to address within the sprint.

---

### ✅ What's Done Well

- **Parameterized queries** — No SQL injection risk; all values use positional parameters (`$1`, `$2`, `$3`)
- **Authentication on all routes** — `authenticate` middleware applied to every handler; no unauthenticated read paths
- **Zod input validation** — UUID enforcement on path params, type coercion with bounds on query params
- **Rate limiting router-wide** — Applied via `router.use()` before any route handlers; cannot be bypassed
- **Helmet applied** — Standard security headers configured
- **Generic 500 messages** — Internal errors don't leak stack traces or DB details to clients
- **Pagination cap** — `limit` is capped at 100, preventing unbounded queries

---

### 🔴 P1 — High: Missing Authorization / BOLA (Fix Before Deploy)

**OWASP API3:2023 — Broken Object Level Authorization**

Authentication (who you are) is enforced, but authorization (what you're allowed to see) is not. Any authenticated user can read **any** product UUID in the database — including products belonging to other tenants or organizations.

**Fix:** Scope queries to the requesting user's tenant:

```typescript
// GET / — filter by tenant
WHERE tenant_id = $1 AND ($2::text IS NULL OR category = $2)

// GET /:id — verify ownership (return 404 for both "not found" and "not yours")
WHERE id = $1 AND tenant_id = $2
```

---

### 🟡 P2 — Medium: Zod Error Details Exposed on List Endpoint

The `GET /` handler forwards raw `error.issues` to the client, revealing your internal validation schema. The `GET /:id` handler correctly returns only a generic message — this should match.

**Fix:**
```typescript
if (error instanceof z.ZodError) {
  logger.warn('Invalid query params', { issues: error.issues }); // Log internally
  res.status(400).json({ error: 'Invalid query parameters' }); // Generic to client
  return;
}
```

---

### 🟡 P2 — Medium: Rate Limiter Bypass Risk Behind Proxies

IP-based rate limiting will key off the **proxy's IP** (e.g., `127.0.0.1`) if Express isn't configured to trust the forwarding chain, effectively sharing the 100-req/15min limit across all users.

**Fix:** Configure `trust proxy` in your Express app entry point:
```typescript
app.set('trust proxy', 1);
```

And consider keying the limiter on the authenticated user ID (since these are authenticated routes) instead of IP for more precise enforcement.

---

### 🔵 P3 — Low Findings

| # | Finding | Recommendation |
|---|---------|----------------|
| 1 | Unused `next: NextFunction` — errors not forwarded to centralized handler | Remove param or call `next(error)` for 500s |
| 2 | No typed contract on `req.user` from `authenticate` — silent failure risk if middleware changes | Add a typed `AuthenticatedRequest` interface with runtime assertion |

---

### Priority Summary

| Priority | Action |
|----------|--------|
| 🔴 **Before deploy** | Add tenant-scoped authorization to both queries |
| 🟡 **This sprint** | Strip Zod details from `GET /` response; configure `trust proxy` |
| 🔵 **Next release** | Type `req.user` contract; decide on centralized vs. inline error handling |

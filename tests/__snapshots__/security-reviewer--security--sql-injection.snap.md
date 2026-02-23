## Security Review Result: ❌ FAIL — Do Not Merge

The security reviewer identified **7 vulnerabilities** across this diff, including **3 Critical SQL injections** that alone are sufficient to block this PR.

---

### 🔴 Critical (P0) — Block Immediately

**Finding 1 – SQL Injection: `GET /:id`**
```ts
// VULNERABLE
const query = `SELECT ... WHERE id = ${req.params.id}`;

// FIX — use parameterized query
db.query('SELECT ... WHERE id = $1', [parseInt(req.params.id, 10)]);
```

**Finding 2 – SQL Injection: `GET /search`** (worst offender — 3 injectable params)
```ts
// VULNERABLE
query += ` AND name LIKE '%${name}%'`;
query += ` AND email = '${email}'`;
query += ` AND role = '${role}'`;

// FIX — use a params accumulator
const conditions = ['1=1'];
const params = [];
if (name) { conditions.push(`name ILIKE $${params.length + 1}`); params.push(`%${name}%`); }
// ... etc.
db.query(`SELECT ... WHERE ${conditions.join(' AND ')} LIMIT 50`, params);
```

**Finding 3 – SQL Injection: `POST /:id/notes`** (request body is highest-risk surface)
```ts
// VULNERABLE — content from req.body goes straight into SQL
VALUES ('${userId}', '${content}', '${req.user.id}', NOW())

// FIX
db.query(`INSERT INTO user_notes ... VALUES ($1, $2, $3, NOW())`, [userId, content, req.user.id]);
```

---

### 🟠 High (P1) — Required Before Merge

**Finding 4 – IDOR / Missing Authorization**: Any authenticated user can read or write notes for *any* user ID. No ownership or tenant scope check exists. On a multi-tenant platform with youth data, this is a COPPA exposure.

**Finding 5 – Route Shadowing Bug**: `/search` is registered *after* `/:id`, so `GET /api/users/search` is matched as `id = "search"` and the search endpoint is **permanently unreachable**. Swap the registration order.

---

### 🟡 Medium (P2) — Recommended Before Merge

| # | Finding | Fix |
|---|---------|-----|
| 6 | No input validation on `content` body field | Add `zod` schema validation |
| 7 | Unbounded search — no rate limit, no required params | Require ≥1 param; add `express-rate-limit` |

---

### Required Actions Before Merge
1. ✅ Replace all string-interpolated SQL with parameterized queries (P0)
2. ✅ Fix route registration order — `/search` before `/:id` (P1)
3. ✅ Add authorization checks to prevent cross-user access (P1)

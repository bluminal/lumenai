# Stage 3 Semantic Dedup — Scenario Description

## Scenario: `stage3-semantic-dedup`

### What this fixture demonstrates

Two semantically-identical findings (different wording, same root cause) are planted in the same `(file, symbol)` bucket. A third, truly distinct finding lives in a different bucket. Stage 3 embedding-based semantic dedup merges the first pair and leaves the third finding untouched.

### Input

Three findings across two buckets:

| Index | finding_id | file | symbol | severity | source |
|-------|-----------|------|--------|----------|--------|
| 0 | `perf.api.fetchUsers.n-plus-one` | `src/api/users.ts` | `fetchUsers` | medium | native-team (code-reviewer) |
| 1 | `perf.api.fetchUsers.lazy-loading` | `src/api/users.ts` | `fetchUsers` | high | external (codex-review-prompter) |
| 2 | `security.auth.handleLogin.csrf` | `src/auth/handleLogin.ts` | `handleLogin` | high | native-team (security-reviewer) |

Findings 0 and 1 share `(file: src/api/users.ts, symbol: fetchUsers)` — same bucket.
Finding 2 is in a separate bucket.

### Simulated cosine similarities

- Finding 0 vs Finding 1: **0.91** — semantically near-identical (N+1 query / lazy-load per-user round-trip)
- Finding 0 vs Finding 2: **0.12** — completely unrelated (performance vs. security)
- Finding 1 vs Finding 2: **0.08** — completely unrelated

### Stage 3 outcome

**Merged pairs (cosine ≥ 0.85):**
- Findings 0 + 1 merge automatically (cosine 0.91 ≥ 0.85 threshold).
- Merged severity = `high` (max of `medium` + `high`).
- `raised_by[]` contains both `code-reviewer` (anthropic/native-team) and `codex-review-prompter` (openai/external).

**Forwarded to Stage 4 (cosine in [0.7, 0.85)):**
- None. Both cross-bucket pairs (cosine 0.12 and 0.08) fall below the 0.7 floor.

**Left unmerged:**
- Finding 2 (`security.auth.handleLogin.csrf`) passes through untouched — no pair partner in its bucket.

**Final finding count:** 2 (merged N+1 finding + CSRF finding).

**Stage 3 calls dispatched:** 1 (one host-session embedding computation for the `fetchUsers` bucket).

### Embedding source

`host-session` — D23 fallback path. `llm embed --version` probe returned an error (CLI or plugin unavailable), so the host Claude session computed embeddings inline via its native embedding capability.

The audit artifact records: `stage3_embedding_source: "host-session"`.

### D18 cap status

0 Stage 4 LLM calls dispatched (no pairs fell in the [0.7, 0.85) forwarding window). The D18 per-consolidation cap (default 25) is unaffected.

### Key invariants verified by the Layer 2 test

1. Planted semantic duplicates (cosine 0.91 ≥ 0.85) merge at Stage 3.
2. Merged severity is `high` — the maximum of the two contributing severities.
3. Truly distinct findings (cosine 0.12 / 0.08 < 0.7 floor) remain separate and are NOT forwarded to Stage 4.
4. Host-session embedding source used (D23 fallback when `llm embed` unavailable).
5. `forwarded_to_stage4` is empty — no pairs in the [0.7, 0.85) window.
6. `final_findings_count === 2` (3 input → 2 after Stage 3 merge).
7. D18 cap is unaffected (0 Stage 4 calls).

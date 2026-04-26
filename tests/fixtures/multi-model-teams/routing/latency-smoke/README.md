# Discovery Latency Smoke Fixture (Task 34a-pre)

## Purpose

This fixture catches NFR-MMT3 regressions at the **discovery-primitive layer**: the mechanical
file-I/O step inside FR-MMT15 that reads one `index.json`, filters pools by required-reviewer-set
and matching-mode, and picks the first match by name sort order.

The fixture verifies that a Bash subprocess implementing this primitive can complete in **P95 < 100 ms**
on a local filesystem when reading a synthetic 10-pool `index.json`. It does NOT test any consumer
command (`/review-code`, `/performance-audit`) and does NOT invoke any LLM or agent.

### Relationship to NFR-MMT3

NFR-MMT3 defines two latency budgets:
- **< 100 ms** — discovery primitive (Bash subprocess reading `index.json`). This fixture targets this tier.
- **< 500 ms** — full end-to-end command path including routing decision, submission prep, and notification. Task 34a (Phase 7) will add an end-to-end fixture against this budget once Tasks 54/57 (`/review-code`, `/performance-audit`) integrate the discovery primitive.

---

## Contents

| File | Purpose |
|------|---------|
| `generate-fixture.sh` | Generates a synthetic `index.json` with 10 pool entries conforming to FR-MMT9b |
| `discovery-primitive.sh` | Reference implementation of the FR-MMT15 discovery filter primitive |
| `README.md` | This methodology document |
| `tmp/` | Ephemeral directory created and deleted per test run (gitignored) |

The Vitest test file is at `tests/schemas/discovery-latency-smoke.test.ts` (co-located with
other Layer 1 schema tests, per the `vitest.config.ts` include pattern `schemas/**/*.test.ts`).

---

## Methodology

The methodology below is precise enough for a future contributor to reproduce the results by reading
only this README.

### Step 1: Generate the synthetic fixture

```bash
./generate-fixture.sh /path/to/output/index.json
```

Writes a 10-pool `index.json` with the following roster distribution (designed to give the filter
real work: varied superset/disjoint rosters):

| Pool(s) | Reviewers | Count |
|---------|-----------|-------|
| `review-pool-01` – `review-pool-04` | `code-reviewer`, `security-reviewer` | 4 |
| `review-pool-05` – `review-pool-07` | `code-reviewer`, `security-reviewer`, `design-system-agent` | 3 |
| `review-pool-08` – `review-pool-09` | `performance-engineer` | 2 |
| `review-pool-10` | `code-reviewer` | 1 |

All pools have `standing: true` and `last_active_at` set to 5–15 minutes ago (well within any
reasonable TTL). No pool is in `draining` or `stopping` state — all 10 are eligible for the filter
step to process.

### Step 2: Run the discovery primitive as a Bash subprocess

```bash
./discovery-primitive.sh <index.json> <required-reviewers> <matching-mode> <ttl-minutes>
# e.g.:
./discovery-primitive.sh /path/to/index.json "code-reviewer,security-reviewer" "covers" "60"
```

The script reads `index.json`, applies the FR-MMT15 §1.3 filter (skip draining/stopping, skip
TTL-expired, apply matching mode, sort by name, pick first), and writes one JSON object to stdout:

```json
{"routing_decision":"routed-to-pool","pool_name":"review-pool-01","multi_model":false,"match_rationale":"covers: pool [code-reviewer, security-reviewer] satisfies required [code-reviewer, security-reviewer]"}
```

or, when no pool matches:

```json
{"routing_decision":"fell-back-no-pool"}
```

### Step 3: Measure wall-clock latency in TypeScript

The Vitest test in `tests/schemas/discovery-latency-smoke.test.ts` wraps the subprocess with
`performance.now()` calls for sub-millisecond precision:

```ts
const t0 = performance.now();
const result = spawnSync('bash', [PRIMITIVE_SCRIPT, ...args], { encoding: 'utf-8' });
const t1 = performance.now();
const ms = t1 - t0;
```

`child_process.spawnSync` is used (not `exec`) so timing is clean: `t1 - t0` captures spawn
overhead + Bash startup + jq execution + stdout flush — the full wall-clock cost a submitting
command would pay in production.

### Step 4: Statistical methodology

- **N = 20** total iterations
- **Discard first 2** as warmup — amortizes cold filesystem-cache jitter on the first read of `index.json`
- **Measure 18** iterations; sort ascending
- **Compute P50, P95, P99, max** from the 18 samples using the nearest-rank ceiling method
- **Assert P95 < 100 ms**
- **Print all percentiles** to stdout via `console.log` so CI log artifacts preserve the methodology and measured values

### Step 5: Validate output schema

Each subprocess invocation's stdout is also parsed and checked:
- Valid JSON
- `routing_decision` field present and one of the seven enum values
- `pool_name`, `multi_model`, `match_rationale` present when `routing_decision` is `"routed-to-pool"`

The seven valid `routing_decision` values (reproduced from Task 34 spec inline — see note below):

```
"routed-to-pool" | "fell-back-no-pool" | "fell-back-roster-mismatch"
| "fell-back-pool-draining" | "fell-back-pool-stale"
| "fell-back-timeout" | "skipped-routing-mode-explicit"
```

> **Schema import note:** Task 34 owns the canonical `InlineDiscoveryOutput` schema validator at
> `tests/schemas/standing-pool-cleanup.ts`. This fixture reproduces the enum values inline because
> Task 34 and Task 34a-pre are in parallel PRs. Once Task 34 lands, future iterations of this test
> may import and reuse Task 34's `validateInlineDiscoveryOutput()` in place of the inline check.

---

## CI Stability Notes

**Why N=20 with 2 warmup discarded:**
The first one or two `spawnSync` calls may hit a cold OS filesystem buffer cache for `index.json`.
Discarding 2 warmup iterations amortizes this jitter so the measured P50/P95 reflect steady-state
performance rather than cache-cold overhead.

**Why P95 and not max:**
Maximum observed latency can be skewed by transient OS events: GC pauses in the Node.js process,
OS scheduling preemption, or CI infrastructure load spikes. P95 is robust against single-iteration
outliers while still catching regressions that affect most invocations.

**Why a synthetic 10-pool index (not a real project's pools):**
Synthetic data keeps the file size bounded (~10 KB) so the benchmark measures logic latency
(Bash startup + jq filter) rather than large-file I/O. NFR-MMT3 specifies "up to ~10 pools" as
the design-point for the < 100 ms budget; this fixture holds that constant.

**Why this test is NOT marked slow or skipped under CI:**
The full 20-iteration test completes in approximately 400–600 ms on a typical macOS developer
machine (about 20 ms per subprocess iteration). This is well within the Layer 1 "every PR, zero
LLM cost" cadence target. The test does not invoke any LLM, does not require network access,
and produces no side effects outside its own `tmp/` directory.

**jq vs. python3 fallback:**
`discovery-primitive.sh` detects `jq` availability at runtime. If `jq` is absent, it falls back
to a `python3` one-liner that produces identical output. Both paths pass the < 100 ms P95 budget
on a typical macOS developer environment (`jq` measured ~17 ms P95; `python3` fallback is slightly
higher but well under budget). If neither `jq` nor `python3` is available, the script will exit
with a non-zero status and the test will fail with an informative error.

---

## Acceptance Criteria Coverage

| Criterion | Where verified |
|-----------|----------------|
| [T1] Subprocess reads synthetic 10-pool `index.json` and emits inline-discovery output per Task 34 schema | `tests/schemas/discovery-latency-smoke.test.ts` — correctness describe block |
| [T2] Subprocess P95 < 100 ms across multiple runs | `tests/schemas/discovery-latency-smoke.test.ts` — latency describe block |
| [T3] Methodology documented | This README (purpose, scripts, N=20 methodology, CI stability notes) |
| [T4] Independent of Tasks 54/57: no consumer command invoked, no LLM, no agent | `discovery-primitive.sh` — pure Bash + jq/python3; no network; no Claude invocation |

---

## Running the Test

```bash
cd /path/to/repo/tests
npx vitest run schemas/discovery-latency-smoke.test.ts --reporter verbose
```

Expected output excerpt:

```
  Discovery primitive latency (N=18 measured, 2 warmup discarded):
    P50 = 16.xx ms
    P95 = 20.xx ms  [budget: < 100 ms]
    P99 = 22.xx ms
    max = 25.xx ms
```

---

## Future Work

This fixture covers the **discovery-primitive layer only** (FR-MMT15 steps 2–4). Task 34a (Phase 7)
adds the **end-to-end consumer-command latency fixture** against the NFR-MMT3 < 500 ms budget once
Tasks 54/57 (`/review-code`, `/performance-audit`) have integrated the discovery primitive into their
workflow. The end-to-end fixture will exercise the full path: discovery → pool routing decision →
submission prep → Pool Lead notification write — without a real Pool Lead process running.

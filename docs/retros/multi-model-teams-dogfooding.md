# Multi-Model Teams — Dogfooding Retro

**Status:** Pending (v0.2.0/v0.5.1 released; dogfooding period starting)  
**Owner:** PM + Tech Lead  
**Target duration:** ≥ 2 weeks sustained usage  
**Target cohort:** ≥ 3 internal users

## Cohort

> Fill in before dogfooding begins.

| User | Role | Primary use case |
|------|------|-----------------|
| TBD | — | — |
| TBD | — | — |
| TBD | — | — |

## Instrumentation Confirmation

Tech lead confirmed (2026-04-26): the following audit-artifact fields capture PRD §7.2 metrics automatically:

| Metric | Audit field | Captured automatically |
|--------|-------------|----------------------|
| Pool routing hit rate | `pool_routing.routing_decision` (FR-MMT30) | Yes — emitted on every `/review-code` and `/performance-audit` invocation |
| Wall-clock speedup | `team_metadata.review_wall_clock_ms` | Yes — recorded per review invocation |
| Multi-model finding-quality lift | `team_metadata.multi_model` + consolidated `findings[]` | Yes — per-finding source attribution (FR-MMT30a) |
| Adoption rate | count of invocations with `pool_routing.routed_to_pool: true` | Yes — derivable from audit artifacts |
| Fallback rate | count of invocations with `pool_routing.routing_decision: fallback` | Yes — FR-MMT30 `routing_decision` enum |
| Cross-session pool usage | `host_pid` staleness on discovery | Yes — stale-pool detection logs in audit artifact |

## Measurements

> Fill in after ≥ 2 weeks of sustained usage.

### Pool Routing Hit Rate

- Target: > 80% of `/review-code` invocations route to a pool (when pool is running)
- Measured: _pending_

### Wall-Clock Speedup

- Baseline: cold-start `/review-code` time (from pre-dogfooding audit artifacts)
- With pool: pool-routed review time
- Measured speedup: _pending_

### Multi-Model Finding-Quality Lift

- Baseline: native-only `/team-review` findings
- With multi-model: findings with `raised_by` from multiple families
- Cross-reviewer dedup rate: _pending_
- Novel findings from external adapters: _pending_

### Adoption Rate

- % of team members using standing pools after 2 weeks: _pending_

### Fallback Rate

- % of pool-routing attempts that fell back to direct review (pool unavailable): _pending_

### Cross-Session Pool Usage

- % of sessions where pool was already running from a prior session: _pending_  
  (Expected: 0% — pools don't survive host session exit per FR-MMT5a/D6b)

## Empirical Idle Cost

> Supersedes the placeholder in `plugins/synthex-plus/docs/standing-pools.md` when filled.

- Measured idle token cost per minute (2-reviewer default pool): _pending_
- NFR-MMT2 budget: ≤ 5,000 tokens/min pool-maintenance overhead
- Actual: _pending_

## Learnings and Retro Notes

> Fill in after dogfooding concludes.

_Pending._

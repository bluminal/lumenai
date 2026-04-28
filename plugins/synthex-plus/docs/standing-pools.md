# Standing Review Pools

Standing review pools let you keep a team of code reviewers running in the background, ready to pick up review requests immediately — no cold-start delay.

When you submit a review to a standing pool, a reviewer that's already warmed up claims the task and starts working. When all reviewers finish, you get a consolidated report in the same format as `/synthex:review-code` or `/synthex:performance-audit`.

> **Beta feature.** Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. See [README](../README.md) for setup.

## When to Use Standing Pools

Standing pools pay off when you review frequently and cold-start latency matters:

- High-velocity teams running `/review-code` multiple times per hour
- Pre-commit hooks where review latency is user-visible
- Projects that want a warmer, more consistent reviewer identity across reviews

For occasional reviews (less than a few per day), stick with the default `/synthex:review-code` — the pool spawn cost is not worth it at low frequency.

## Quick Start

### 1. Start a pool

```bash
/synthex-plus:start-review-team my-pool
```

This creates a standing pool named `my-pool` with the default reviewers (`code-reviewer` and `security-reviewer`). The pool starts in the background and keeps reviewers warm.

### 2. Submit reviews

Once the pool is running, `/synthex:review-code` automatically routes to it:

```bash
/synthex:review-code
```

No flags required — Synthex detects the running pool and routes your review to it. You can confirm routing by watching for `Routing to standing pool: my-pool` in the output.

### 3. Stop the pool

```bash
/synthex-plus:stop-review-team my-pool
```

This sends a graceful shutdown signal. In-flight reviews complete before the pool stops.

## Commands

### `/synthex-plus:start-review-team <name>`

Creates and starts a named standing review pool.

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--reviewers <list>` | Comma-separated reviewer names | `code-reviewer,security-reviewer` |
| `--multi-model` | Enable multi-model orchestration alongside the pool | `false` |
| `--ttl <minutes>` | Idle TTL before automatic shutdown | `60` |

**Examples:**

```bash
# Default pool with 2 reviewers
/synthex-plus:start-review-team my-pool

# Pool with performance reviewer included
/synthex-plus:start-review-team my-pool --reviewers code-reviewer,security-reviewer,performance-engineer

# Multi-model pool (requires external CLI adapters configured)
/synthex-plus:start-review-team my-pool --multi-model

# Long-lived pool (4 hours idle TTL)
/synthex-plus:start-review-team my-pool --ttl 240
```

### `/synthex-plus:stop-review-team <name>`

Gracefully shuts down a standing pool.

```bash
/synthex-plus:stop-review-team my-pool
```

In-flight reviews complete first. If a reviewer is stuck for more than `lifecycle.stuck_task_timeout_minutes` (default: 30 min), it's marked abandoned and shutdown proceeds.

### `/synthex-plus:list-teams`

Shows all running and recently stopped pools.

```bash
/synthex-plus:list-teams
```

Example output:

```
Standing review pools:
  my-pool       idle    last active: 4 minutes ago    reviewers: code-reviewer, security-reviewer
  old-pool      stopping  last active: 62 minutes ago  (TTL expired)
```

## Configuration

Pool defaults live in `.synthex-plus/config.yaml` under `standing_pools:`:

```yaml
standing_pools:
  enabled: false               # off by default; enable to activate pool routing
  ttl_minutes: 60              # idle time before auto-shutdown
  default_name: review-pool    # pool name used when no explicit name given
  default_reviewers:           # reviewers spawned in every new pool
    - code-reviewer
    - security-reviewer
  default_multi_model: false   # whether new pools run with multi-model enabled
  routing_mode: prefer-with-fallback  # fall through to direct review if no pool available
  matching_mode: covers        # how to match requests to pools
```

To enable pool routing globally:

```yaml
# .synthex-plus/config.yaml
standing_pools:
  enabled: true
```

## Multi-Model Pools

When you start a pool with `--multi-model`, each review also runs the `multi-model-review-orchestrator` alongside the native reviewers. External adapters (Codex, Gemini, etc.) run in parallel with the pool reviewers and findings are consolidated into a single report.

```bash
/synthex-plus:start-review-team my-pool --multi-model
```

**Reviewer requirements:** Only these four reviewers support multi-model mode in v1: `code-reviewer`, `security-reviewer`, `design-system-agent`, `performance-engineer`. Other reviewers (e.g., `quality-engineer`) are not compatible with multi-model pools in v1.

**Cost:** Multi-model reviews cost roughly 2–3× a native-only review, depending on how many external adapters are configured.

## Troubleshooting

### Pool not routing reviews

Check that `standing_pools.enabled: true` is set in `.synthex-plus/config.yaml`. By default, pool routing is off — you must opt in.

Also verify the pool is still running:
```bash
/synthex-plus:list-teams
```

If the pool shows `stopping` or is absent, restart it with `/synthex-plus:start-review-team`.

### Orphaned pool (pool metadata exists but reviewers are unresponsive)

If you see a pool in `list-teams` but reviews aren't completing, the pool may have lost its reviewers (e.g., the host Claude Code session was closed). Stop and restart:

```bash
/synthex-plus:stop-review-team my-pool   # sends shutdown; pool cleans up its own state
/synthex-plus:start-review-team my-pool  # fresh pool
```

For stuck pools that won't stop cleanly, you can manually remove pool state:
```bash
rm -rf ~/.claude/teams/standing/my-pool/
```

Then remove the pool's entry from `~/.claude/teams/standing/index.json` manually.

### Stale pool from a previous Claude Code session

Pools don't survive past the host Claude Code session that spawned them (`backendType: in-process`). When you reopen Claude Code, any previously running pools are stale. Synthex detects stale pools automatically (via `host_pid` check) and routes through them to fresh reviewers if needed, or falls back to direct review.

## Idle Cost

> **Measurement pending.** The idle token cost per minute for a default 2-reviewer pool will be documented here after the v1 dogfooding period (PRD §7.1a / NFR-MMT2 criterion 1). Preliminary architectural analysis: Pool Lead debounces `last_active_at` writes to ≤ 1 write per 30 seconds at idle, bounding maintenance overhead to ≤ 200 tokens/min. Empirical measurements from the dogfooding cohort will replace this estimate.

## Implementation References

For implementers and contributors, the normative specifications are:

- [`docs/specs/multi-model-teams/architecture.md`](../../../docs/specs/multi-model-teams/architecture.md) — Option B architecture, bridge mechanism, cross-session lifetime model
- [`docs/specs/multi-model-teams/pool-lifecycle.md`](../../../docs/specs/multi-model-teams/pool-lifecycle.md) — Pool state machine, storage layout, locking primitive
- [`docs/specs/multi-model-teams/routing.md`](../../../docs/specs/multi-model-teams/routing.md) — Pool discovery, TTL enforcement, routing mode semantics
- [`docs/specs/multi-model-teams/recovery.md`](../../../docs/specs/multi-model-teams/recovery.md) — FR-MMT24 per-task recovery and native-recovery dedup partial pass

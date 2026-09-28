---
model: haiku
---

# Configure Standing Review Pools

Configure (or re-configure) standing review pool routing for this project. Standing pools keep reviewers warm between reviews — useful when you run many code reviews per session and want to amortize the reviewer spawn cost.

This command is the standalone first-run wizard for the `standing_pools` block in `.synthex/config.yaml`. It is invoked:

- Directly by the user via `/synthex:configure-teams` (re-runnable any time).
- By the upgrade-nudge SessionStart hook to onboard existing users to standing-pool routing.

It does NOT duplicate `/init` — `/init` performs the broader project initialization (config seed, docs directories, commit-convention detection). This wizard configures only the standing-pools sub-feature. It always writes `.synthex/config.yaml`; it never writes the legacy `.synthex-plus/config.yaml`, which every reader falls back to for one major version with a deprecation warning (D6, D23) — see Step 0 for how this wizard still recognizes a project only configured there.

Per D11 (docs/plans/harness-modernization.md), this command is **ungated** — unlike `start-review-team`, `stop-review-team`, and `list-teams`, it never checks for an Agent Teams tool capability. It only writes config, so a mixed-host team must be able to author it from any host, including hosts that will never spawn or join a pool themselves.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `config_path` | Where the config file lives | `.synthex/config.yaml` | No |

## Workflow

### 0. Re-entry Check (idempotency)

Read `@{config_path}` (default `.synthex/config.yaml`). If it does not exist or has no `standing_pools` key, also check the legacy `.synthex-plus/config.yaml` for one, per the D6 fallback (kept for one major version with a deprecation warning): if THAT file has a `standing_pools` block, treat this as re-entry (surface its current settings per the table below) rather than fresh configuration — but any write in Step 4 still always targets `.synthex/config.yaml` (D23), never the legacy file.

- **If neither `.synthex/config.yaml` nor a legacy `standing_pools` block exists:** print `.synthex/config.yaml not found. Run /init first to initialize the project.` Exit. This wizard configures a sub-feature; it does not seed the file.
- **If the file exists and the `standing_pools` top-level key is absent:** skip to Step 1. Treat as fresh configuration of the sub-feature.
- **If the file exists and `standing_pools.enabled: false` is present:** skip to Step 1. The user previously opted out, but they invoked this command to reconsider; preserve any other `standing_pools.*` keys in the existing block when writing.
- **If the file exists and `standing_pools.enabled: true` is present:** surface the current settings and present re-entry options via `AskUserQuestion`:

> **Standing review pools are already enabled.**
>
> Current configuration:
>
> - `enabled: true`
> - `routing_mode: <value from config>`
> - `matching_mode: <value from config>`
>
> What would you like to do?
>
> 1. **Re-run the wizard** — re-prompt for routing and matching modes; overwrite existing values.
> 2. **Reset to disabled** — set `standing_pools.enabled: false` (preserve the rest of the block, per D-UO5). Pool routing stops; existing pools are not touched.
> 3. **Leave as-is** — exit without changes.

Apply the chosen option:

- **Re-run the wizard:** proceed to Step 1.
- **Reset to disabled:** edit `@{config_path}` so that `standing_pools.enabled: false`. Do NOT delete the `standing_pools` block — the explicit `false` value is the signal that the user opted out (D-UO5). Print: `Standing pool routing disabled. Existing pools (if any) keep running until /synthex:stop-review-team or TTL reaping. Re-run /synthex:configure-teams to re-enable.` Exit.
- **Leave as-is:** print `No changes made.` Exit.

### 1. Enable Standing Review Pools?

Use the `AskUserQuestion` tool:

> **Enable standing review pools (optional)?**
>
> Standing review pools keep reviewers warm between reviews. When enabled, `/synthex:review-code` and `/synthex:performance-audit` automatically route to a running pool instead of spawning fresh sub-agents per invocation.
>
> 1. **Enable** — write `standing_pools.enabled: true` to `.synthex/config.yaml`. The wizard will then ask for routing and matching modes.
> 2. **Skip** — do not write any `standing_pools` config (or, if re-running and previously enabled, leave behavior unchanged from Step 0).

On **Skip**:
- Do not write any `standing_pools.*` keys.
- Print `Standing pool routing not enabled. Run /synthex:configure-teams to enable later.` and exit.

On **Enable**: proceed to Step 2.

### 2. Routing Mode

Use the `AskUserQuestion` tool:

> **How should commands route when no matching pool exists?**
>
> 1. **prefer-with-fallback** (default) — when a matching pool exists, route to it; otherwise spawn fresh sub-agents (today's behavior). Silent fallback.
> 2. **explicit-pool-required** — when a matching pool exists, route to it; otherwise abort with a "no matching pool" error and a hint to run `/synthex:start-review-team`. For teams that want to enforce pool usage and catch misconfigurations.

Record the chosen value as `routing_mode_choice`.

### 3. Matching Mode

Use the `AskUserQuestion` tool:

> **How strict should pool matching be?**
>
> 1. **covers** (default) — a pool's roster only needs to be a superset of the command's required reviewers. A pool with `[code-reviewer, security-reviewer, performance-engineer]` matches a command requesting `[code-reviewer, security-reviewer]`.
> 2. **exact** — pool roster must equal the command's required reviewers exactly. Use when you want strict 1:1 routing.

Record the chosen value as `matching_mode_choice`.

### 4. Apply

Write the following keys to `@{config_path}`:

- `standing_pools.enabled: true`
- `standing_pools.routing_mode: <routing_mode_choice>`
- `standing_pools.matching_mode: <matching_mode_choice>`

Do NOT spawn any pool now (FR-MMT27 criterion 3 — pool spawning is the user's separate decision via `/synthex:start-review-team`).

Do NOT modify any other `standing_pools.*` keys (e.g., `default_reviewers`, `ttl_minutes`, `default_name`). Those have sensible defaults in `defaults.yaml`; users override them by editing the config file directly.

Print:

```
Standing pool routing enabled.

  routing_mode:  <routing_mode_choice>
  matching_mode: <matching_mode_choice>

Next steps:
  /synthex:start-review-team   — spawn a standing pool when ready
  /synthex:list-teams          — see running pools
  /synthex:stop-review-team    — gracefully stop a pool

Routing fires automatically from /synthex:review-code and /synthex:performance-audit when a matching pool is running.
```

## Anti-pattern: do NOT spawn a pool

This wizard configures the `standing_pools` block. It does NOT spawn a pool. Pool spawning is a deliberate user action via `/synthex:start-review-team` because pools consume tokens for as long as they are alive. Auto-spawning at configure-time would surprise users with running infrastructure they did not request.

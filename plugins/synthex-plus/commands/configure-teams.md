---
model: haiku
---

# Configure Standing Review Pools

Configure (or re-configure) standing review pool routing for this project. Standing pools keep reviewers warm between reviews — useful when you run many code reviews per session and want to amortize the reviewer spawn cost.

This command is the standalone first-run wizard for the `standing_pools` block in `.synthex-plus/config.yaml`. It is invoked:

- Directly by the user via `/synthex-plus:configure-teams` (re-runnable any time).
- By the upgrade-nudge SessionStart hook to onboard existing users to standing-pool routing.

It does NOT duplicate `/synthex-plus:team-init` — `team-init` performs the broader plugin initialization (Synthex dependency check, experimental-flag check, orphan detection, full config seed). This wizard configures only the standing-pools sub-feature.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `config_path` | Where the config file lives | `.synthex-plus/config.yaml` | No |

## Workflow

### 0. Re-entry Check (idempotency)

Read `@{config_path}` (default `.synthex-plus/config.yaml`).

- **If the file does not exist:** print `.synthex-plus/config.yaml not found. Run /synthex-plus:team-init first to initialize the plugin.` Exit. This wizard configures a sub-feature; it does not seed the file.
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
- **Reset to disabled:** edit `@{config_path}` so that `standing_pools.enabled: false`. Do NOT delete the `standing_pools` block — the explicit `false` value is the signal that the user opted out (D-UO5). Print: `Standing pool routing disabled. Existing pools (if any) keep running until /synthex-plus:stop-review-team or TTL reaping. Re-run /synthex-plus:configure-teams to re-enable.` Exit.
- **Leave as-is:** print `No changes made.` Exit.

### 1. Enable Standing Review Pools?

Use the `AskUserQuestion` tool:

> **Enable standing review pools (optional)?**
>
> Standing review pools keep reviewers warm between reviews. When enabled, `/synthex:review-code` and `/synthex:performance-audit` automatically route to a running pool instead of spawning fresh sub-agents per invocation.
>
> 1. **Enable** — write `standing_pools.enabled: true` to `.synthex-plus/config.yaml`. The wizard will then ask for routing and matching modes.
> 2. **Skip** — do not write any `standing_pools` config (or, if re-running and previously enabled, leave behavior unchanged from Step 0).

On **Skip**:
- Do not write any `standing_pools.*` keys.
- Print `Standing pool routing not enabled. Run /synthex-plus:configure-teams to enable later.` and exit.

On **Enable**: proceed to Step 2.

### 2. Routing Mode

Use the `AskUserQuestion` tool:

> **How should commands route when no matching pool exists?**
>
> 1. **prefer-with-fallback** (default) — when a matching pool exists, route to it; otherwise spawn fresh sub-agents (today's behavior). Silent fallback.
> 2. **explicit-pool-required** — when a matching pool exists, route to it; otherwise abort with a "no matching pool" error and a hint to run `/synthex-plus:start-review-team`. For teams that want to enforce pool usage and catch misconfigurations.

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

Do NOT spawn any pool now (FR-MMT27 criterion 3 — pool spawning is the user's separate decision via `/synthex-plus:start-review-team`).

Do NOT modify any other `standing_pools.*` keys (e.g., `default_reviewers`, `ttl_minutes`, `default_name`). Those have sensible defaults in `defaults.yaml`; users override them by editing the config file directly.

Print:

```
Standing pool routing enabled.

  routing_mode:  <routing_mode_choice>
  matching_mode: <matching_mode_choice>

Next steps:
  /synthex-plus:start-review-team   — spawn a standing pool when ready
  /synthex-plus:list-teams          — see running pools
  /synthex-plus:stop-review-team    — gracefully stop a pool

Routing fires automatically from /synthex:review-code and /synthex:performance-audit when a matching pool is running.
```

## Anti-pattern: do NOT spawn a pool

This wizard configures the `standing_pools` block. It does NOT spawn a pool. Pool spawning is a deliberate user action via `/synthex-plus:start-review-team` because pools consume tokens for as long as they are alive. Auto-spawning at configure-time would surprise users with running infrastructure they did not request.

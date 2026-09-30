# Standing Pool Discovery and Routing (FR-MMT15)

Cold-path detail for `/synthex:review-code` Step 1b (FR-HM5, D17). Read only when `standing_pools.enabled: true` resolves per the D6 fallback (Step 1b's own gate line in `plugins/synthex/commands/review-code.md`, which is what actually includes this file, spells out the fallback). This is not a standalone command — it has no frontmatter and is never registered in `plugin.json`.

This step executes at command-invocation time, before any diff resolution or reviewer spawning.

#### 1b-i. Compute Required-Reviewer-Set

Resolve the required reviewer set per the FR-MMT15 normative chain:
1. If `--reviewers` flag was passed at invocation, use that list.
2. Else if `code_review.reviewers` is set in `.synthex/config.yaml`, use that value.
3. Else use the hardcoded fallback: `[code-reviewer, security-reviewer]`.

#### 1b-ii. Inline Discovery (FR-MMT15)

Read `~/.claude/teams/standing/index.json` directly via the Read tool. If the file does not exist or is empty, treat discovery as "no pool found" and apply the routing-mode rules in §1b-iv.

Filter pools in the index:
- `standing: true`
- `pool_state` is NOT `draining` or `stopping`
- TTL has not expired: `now - last_active_at < ttl_minutes * 60`

**Stale-pool detection (FR-MMT22):** During filtering, if a pool meets EITHER stale condition:
  - Condition 1: The pool's `metadata_dir` no longer exists on disk
  - Condition 2: `last_active_at` is older than `max(ttl_minutes minutes, 24 hours)`
  → Invoke the `standing-pool-cleanup` agent at `plugins/synthex/agents/standing-pool-cleanup.md` with the pool name and detection reason.
  → Emit this verbatim one-time-per-session warning (substituting pool name and fallback action): `"Standing pool '{name}' was stale and has been cleaned up. {fallback_action}."`
  → Treat the cleaned-up pool as absent.

Apply matching mode from `standing_pools.matching_mode` (default: `covers`):
- `covers` — pool roster must be a **superset** of the required-reviewer-set
- `exact` — pool roster must **equal** the required-reviewer-set

Pick the **first matching pool** by name sort order. Produce the inline-discovery output:

```json
{
  "routing_decision": "routed-to-pool" | "fell-back-no-pool" | "fell-back-roster-mismatch" | "fell-back-pool-draining" | "fell-back-pool-stale",
  "pool_name": "<pool name if matched>",
  "multi_model": true | false,
  "match_rationale": "<brief explanation of why this pool was selected>"
}
```

#### 1b-iii. Route to Pool

**If `routing_decision: routed-to-pool`:**

1. Emit the verbatim FR-MMT17 routing notification (interpolated):
   > `"Routing to standing pool '{pool_name}' (multi-model: {yes|no})."`

2. Prepare the task descriptions for the pool reviewers. Each reviewer in the required-reviewer-set gets a separate task:
   - `subject`: e.g., `"Code review: {target description}"`
   - `description`: the diff scope, files to review, relevant specs, and the reviewer's specific focus area (same context that would be passed to a fresh-spawn reviewer in Step 4)

3. Invoke the `standing-pool-submitter` agent at `plugins/synthex/agents/standing-pool-submitter.md` with:
   ```json
   {
     "pool_name": "<matched pool name>",
     "tasks": [<one task object per reviewer in the required set>],
     "submission_timeout_seconds": "<from lifecycle.submission_timeout_seconds config, default 300>"
   }
   ```

4. Emit the verbatim submission confirmation (interpolated with actual uuid and pool_name):
   > `"Submitted task '{uuid}' to pool '{pool_name}'. Polling for completion (timeout: {timeout}s)."`

5. While the submitter is polling: if the expected wait is >= 60s AND stdout is a TTY, emit the verbatim waiting indicator every 30 seconds:
   > `"Pool '{pool_name}' working: {tasks_complete}/{tasks_total} tasks complete..."`

   **Suppressed when stdout is not a TTY (CI-friendly). Not emitted when expected wait < 60s.**

6. **On submitter return:**

   a. **If submitter returns `routing_decision: fell-back-pool-draining` or `routing_decision: fell-back-timeout`:**
      - Apply routing mode per §1b-iv (silent fallback in `prefer-with-fallback`; abort with no-pool error in `explicit-pool-required`).

   b. **If submitter returns envelope with `status: success`:**
      - Prepend the verbatim provenance line to the report header:
        > `"Review path: standing pool '{pool_name}' (multi-model: {yes|no})."`
      - Surface the `report` field from the envelope as the command's final consolidated review report.
      - **Skip Steps 2–7 entirely** (the pool handled the review). Present the report directly.

   c. **If submitter returns envelope with `status: failed` AND `error.code: reviewer_crashed`:**
      - Invoke FR-MMT24 recovery per `docs/specs/multi-model-teams/recovery.md`:
        1. Extract failed reviewer name from `error.message` ("Reviewer {name} did not complete: {reason}")
        2. Spawn fresh native sub-agent for the failed reviewer via Task tool (same inputs as Step 4 would use)
        3. Wait for fresh sub-agent's findings
        4. Lightweight merge: append recovered findings to surviving findings from envelope
        5. For multi-model pools: apply D19 partial dedup (Stages 1+2 only — fingerprint + lexical dedup)
        6. Recovered findings carry `source.source_type: "native-recovery"`
        7. Prepend verbatim header: `"Note: reviewer {name} was recovered from a pool failure. Results below include recovered findings."`
        8. Surface merged report as final output. **Skip Steps 2–7.**

   d. **If submitter returns envelope with `status: failed` AND `error.code` is `pool_lead_crashed`, `drain_timed_out`, or similar terminal error (NOT `reviewer_crashed`):**
      - These are terminal failures. Fall through to fresh-spawn review (continue to Step 2).
      - Note to user: the pool returned a terminal error; running fresh-spawn review instead.

#### 1b-iv. Routing Mode Semantics

Apply `standing_pools.routing_mode` (default: `prefer-with-fallback`). Resolve `standing_pools.*` from `.synthex/config.yaml`; if it is not defined there, fall back for one major version to the legacy `.synthex-plus/config.yaml` and print a deprecation warning (D6) -- migrate to `.synthex/config.yaml` before the next major release.

**`prefer-with-fallback` (default):**
- If `routing_decision` is any `fell-back-*`: proceed silently to Step 2 (fresh-spawn review). No error.

**`explicit-pool-required`:**
- If no matching pool found, abort with this verbatim error (substituting the actual required reviewer list comma-joined):
  ```
  No standing pool matches the required reviewers (code-reviewer, security-reviewer).
  Routing mode is 'explicit-pool-required', so this command will not fall back to
  fresh-spawn reviewers. To proceed, either:
    1. Start a matching pool:
         /synthex:start-review-team --reviewers code-reviewer,security-reviewer
    2. Change routing_mode to 'prefer-with-fallback' in .synthex/config.yaml
  ```

## Capability Ladder (FR-HM21)

`/synthex:review-code` and `/synthex:performance-audit` select their reviewer-orchestration strategy by walking this ladder, in order, at every invocation. Selection is always by tool presence, checked fresh each time — never by host name, and never by matching a feature name that only coincidentally resembles a Claude tool name on some other host.

1. **Pool routing.** If `SendMessage` and `ListAgents` are in your tool list, and `standing_pools.enabled` resolves to `true` (per the D6 fallback above), and a matching pool is running: route to the pool. This is §1b above, in full.
2. **Workflow engine.** If a `Workflow` tool is in your tool list and `code_review.engine: workflow` is set in `.synthex/config.yaml`: hand the review to FR-HM16's engine by calling `Workflow {"name": "synthex:review-code-engine"}`, which runs the script shipped at `plugins/synthex/workflows/review-code-engine.js` (Task 57) -- auto-discovered from the plugin's `workflows/` directory with no `plugin.json` entry, per the Task 9 spike's discovery path. The workflow is deliberately **not** named `review-code`: a plugin workflow's `meta.name` registers as the slash command `<plugin>:<name>` and SHADOWS a same-named plugin command entirely, so a workflow literally named `review-code` would make `/synthex:review-code` stop loading `commands/review-code.md` at all -- see the Task 9 addendum in `docs/specs/harness-modernization/spikes.md` and `tests/schemas/workflow-names.test.ts`. **Resolve the condition deterministically -- never from this paragraph's wording alone.** If `Bash` is in your tool list, run `${CLAUDE_PLUGIN_ROOT}/scripts/lib/config-get.sh code_review.engine prose` and read its stdout. Otherwise (the FR-HM3 "in your tool list ... otherwise" shape every other ladder level uses), Read `.synthex/config.yaml` directly, falling back to the plugin's `config/defaults.yaml`, and take the literal `code_review.engine` value (default `prose` when absent). **Do NOT call `Workflow` unless that resolved value is exactly `workflow` AND a `Workflow` tool is in your tool list.** This command's own instruction to call `Workflow` under that condition is the opt-in the Workflow tool's contract requires (D31) — a committed config key alone is not an opt-in, and no per-session confirmation is asked. Headless runs additionally need a `Workflow(synthex:review-code-engine)` permission allow rule (or auto/bypass mode), since there is no one present to answer an interactive prompt. On any invocation where the condition above does not hold -- the resolved value is not exactly `workflow`, or no `Workflow` tool is in your tool list -- this level degrades cleanly: skip it, print this one-line notice once, and continue down the ladder to level 3: "code_review.engine is set to workflow, but no Workflow tool is in your tool list, so this review is running the prose path instead -- see the capability ladder in docs/standing-pool-routing.md."
3. **Parallel subagent fan-out.** Otherwise, if a tool named `Agent`, `Task`, `task`, `spawn_agent`, or `delegate_task` is in your tool list: launch every required reviewer in one turn and consolidate their findings via the prose consolidation path (the findings-consolidator step each command already documents). On a depth-1 host, when the command is already running inside a subagent and a nested spawn at this level is refused, apply the depth-1 inline rule below instead of falling through to level 4.
4. **Sequential reviewers.** Otherwise: run the required reviewers one at a time in the same turn, in the order they are configured. This is today's baseline — it always works, so it is the ladder's floor, not a degraded mode. When this is the level actually reached, the reason is: "No parallel-subagent tool (Agent, Task, task, spawn_agent, or delegate_task) is in your tool list, so reviewers run sequentially instead of fanned out in one turn -- see the capability ladder in docs/standing-pool-routing.md."

**Depth-1 inline rule (FR-HM42):** on a depth-1 host, when the command is already running inside a subagent and a spawn at level 3 is refused, perform the reviewer roles inline in this session instead of falling to level 4 — the command still completes the review in one turn, it just performs the reviewer roles itself rather than spawning them out.

**Level 2's `Workflow` `args` contract (Task 57):** pass `{reviewed, date, diffText, projectContext, reviewers, reviewLoops, multiModel, cycle, priorCycleSummary}`. `reviewed` and `diffText` reflect the actual scope Step 2 resolved (e.g. "unstaged changes" when nothing is staged -- never a hardcoded "staged changes"). `date` is today's date (`YYYY-MM-DD`): Workflow scripts cannot call `Date.now()`, so the caller supplies it from its own turn. A single `Workflow` call runs exactly one review cycle and returns -- a script cannot wait for a human to apply fixes between cycles. The command's own Review Loop (`review-code.md` Step 6) owns the fix-and-re-review loop across turns: on a FAIL verdict it re-invokes `Workflow {"name": "synthex:review-code-engine"}` for the next cycle, passing the incremented `cycle` number and a compact summary of unresolved findings from the prior cycle as `priorCycleSummary` -- the same inputs Step 6c already assembles for fresh reviewer subagents on the prose path.

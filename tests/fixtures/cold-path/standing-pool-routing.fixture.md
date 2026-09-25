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
  → Invoke the `standing-pool-cleanup` agent at `plugins/synthex-plus/agents/standing-pool-cleanup.md` with the pool name and detection reason.
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

3. Invoke the `standing-pool-submitter` agent at `plugins/synthex-plus/agents/standing-pool-submitter.md` with:
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

Apply `standing_pools.routing_mode` from `.synthex-plus/config.yaml` (default: `prefer-with-fallback`):

**`prefer-with-fallback` (default):**
- If `routing_decision` is any `fell-back-*`: proceed silently to Step 2 (fresh-spawn review). No error.

**`explicit-pool-required`:**
- If no matching pool found, abort with this verbatim error (substituting the actual required reviewer list comma-joined):
  ```
  No standing pool matches the required reviewers (code-reviewer, security-reviewer).
  Routing mode is 'explicit-pool-required', so this command will not fall back to
  fresh-spawn reviewers. To proceed, either:
    1. Start a matching pool:
         /synthex-plus:start-review-team --reviewers code-reviewer,security-reviewer
    2. Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml
  ```

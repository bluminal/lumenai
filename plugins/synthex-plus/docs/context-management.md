# Context Window Management

How Synthex+ manages context pressure during long-running team sessions.

Agent Teams sessions run longer than typical subagent invocations. Each teammate operates in an independent context window that accumulates tool outputs, file reads, and conversation history over the course of a milestone. Without active management, context fills up, compaction fires unpredictably, and teammates lose track of prior work. Synthex+ addresses this through three mechanisms: milestone scoping, progressive summarization, and auto-compaction guidance.

---

## Milestone Scope Limits (FR-CW1)

Each `team-implement` invocation targets a **single milestone**. This is the primary context management lever -- it bounds the total volume of work (and therefore context consumption) per session.

| Setting | Default | Location |
|---------|---------|----------|
| `lifecycle.max_tasks_per_invocation` | 15 | `config/defaults.yaml` |

**How it works:**

- During Step 2 (Read Implementation Plan), the command counts actionable tasks in the target milestone.
- If the count exceeds `max_tasks_per_invocation`, a warning is displayed suggesting the milestone be split into sub-milestones.
- This is a **soft limit** -- the command proceeds regardless, but the warning signals that context pressure is likely.

**Why single-milestone scoping matters:**

- Keeps the lead's task list, progress summaries, and plan synchronization within a bounded scope
- Provides a natural checkpoint between invocations where context resets cleanly
- Milestones with 10-15 tasks are the sweet spot: enough parallelism to justify teams, small enough to complete within one session's context budget

**When to split:** If a milestone has more than 15 tasks, split it into sub-milestones (e.g., 2.1a and 2.1b) in the implementation plan before invoking `team-implement`.

---

## Progressive Summarization (FR-CW2)

The lead produces periodic summaries that compress completed work into a compact record, freeing context capacity for remaining tasks.

| Setting | Value |
|---------|-------|
| Frequency | Every 3-5 completed tasks |
| Format | Progress Report Format (see `output-formats.md`) |
| Authority | Summary is the authoritative record after production |

**What each summary captures:**

- Task subjects and key outcomes (what was completed)
- Decisions made during execution (why it was done that way)
- Files created or modified (what changed on disk)
- Remaining work count and active blockers (what is left)

**How it frees context:**

After a summary is produced, detailed task output from the summarized batch (tool call results, file diffs, review findings) can be dropped from the lead's working memory. The summary preserves the essential information in compressed form. This mirrors the existing Synthex convention of summarizing when plans exceed 1500 lines.

**Summarization is lead-only.** Teammates do not produce their own summaries. They report completion details via `TaskUpdate` and `SendMessage`; the lead consolidates these into the periodic summary.

---

## Auto-Compaction Behavior (FR-CW3)

Claude Code automatically compacts conversation context when the window fills. This is not under Synthex+ control -- it is a platform behavior. Synthex+ mitigates its impact through spawn prompt guidance and durable records.

**What happens during compaction:**

- The teammate's earlier conversation history is compressed or truncated
- Detailed memory of previous tool calls, file contents, and reasoning may be lost
- The teammate continues operating but with reduced recall of earlier work

**Spawn prompt guidance (Step 5c):**

Every teammate receives the following guidance in their creation prompt:

- Your conversation context may be compacted during long-running sessions
- The shared task list is your durable memory -- always check it before starting new work
- The lead's periodic summaries are the authoritative history of team progress
- When in doubt about prior state, check the task list and mailbox before re-doing work

This guidance sets expectations upfront so teammates do not waste tokens re-discovering state that is already recorded on the task list.

---

## Task Descriptions as Durable Records

Task descriptions on the shared task list are the most compaction-resistant information source available to teammates. Unlike conversation context (which compacts) or file reads (which consume tokens to repeat), task descriptions persist in the task list and are cheap to re-read.

**What makes task descriptions durable:**

| Property | Conversation context | Task descriptions |
|----------|---------------------|-------------------|
| Survives compaction | No | Yes |
| Cost to re-read | High (re-read files, re-run tools) | Low (single `TaskGet` call) |
| Updated by | Automatic (compaction) | Explicit (`TaskUpdate`) |
| Authoritative | No (may be stale after compaction) | Yes (always current) |

**What the lead writes into task descriptions (Step 7b):** CLAUDE.md reference, spec file pointers (or inline content in `full` context mode), acceptance criteria from the plan, inter-task integration points, and complexity grade (S/M/L).

**What teammates write back on completion:** Files modified, key decisions, and any scope deviations. This completion data feeds into the lead's progressive summaries and the final plan synchronization (Step 9).

---

## Configuration Reference

All context management settings in `.synthex-plus/config.yaml`:

| Setting | Default | Effect |
|---------|---------|--------|
| `lifecycle.max_tasks_per_invocation` | 15 | Soft limit on tasks per milestone; warns when exceeded |
| `task_list.context_mode` | `references` | `references` = pointers to files (cheaper); `full` = inline content (faster) |
| `task_list.max_concurrent_tasks` | 5 | Soft limit on simultaneous in-progress tasks |
| `lifecycle.stuck_task_timeout_minutes` | 30 | Minutes before lead intervenes on stalled tasks |

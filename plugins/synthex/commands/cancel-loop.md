---
model: haiku
---

# Cancel one or all native-looping loops

Mark a running loop as cancelled. The cancel is **polled at the iteration boundary** by the looping command (FR-NL31) — a loop that's mid-iteration when you cancel it will finish that iteration's work, then exit cleanly on the next boundary check. Worst case: one iteration delay.

Idempotent — running this command twice on the same loop is safe. Cancel of a loop in any terminal status is a no-op with a confirmation message.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `loop_id` | Loop-id slug to cancel (positional). | — | Required unless `--all` |
| `--all` | Cancel every running loop in `<project>/.synthex/loops/`. Mutually exclusive with `loop_id`. | off | — |

## Workflow

### 1. Resolve project root and loops directory

`project_root` = `$CLAUDE_PROJECT_DIR` if set, else `pwd`. `loops_dir` = `<project_root>/.synthex/loops`.

### 2. Refusal paths

Apply these refusals **in order**. Each prints one line to stderr and exits non-zero.

- **Neither `loop_id` nor `--all` supplied** — refuse: `Usage: /synthex:cancel-loop <loop-id> | --all`.
- **Both `loop_id` and `--all` supplied** — refuse: `loop_id and --all are mutually exclusive.`
- **`loops_dir` does not exist** — print exactly: `No loops in this project.` and exit 0. (Not a refusal; mirrors FR-NL30 / E16 idempotency.)

### 3. Single-loop cancel path (`loop_id` supplied)

1. Path = `<loops_dir>/<loop_id>.json`. If it does not exist, refuse with: `No loop found: <loop_id>. Run /synthex:list-loops to see loops in this project.` (FR-NL40 analog)
2. Read and parse the file. Validate against the FR-NL8 schema (use `tests/schemas/loop-state-file.ts` informally — refuse with a clear error if the file is corrupt or has an unknown `schema_version`).
3. Inspect `status`:
   - If `status == "running"`: mutate to `status: "cancelled"`, `exited_at: <UTC ISO 8601 now>`, `exit_reason: "Cancelled by /synthex:cancel-loop"`, `last_updated` updated. Write atomically (`<state-file>.tmp.<pid>` + `mv -f`). Print: `Cancelled loop "<loop_id>" (was at iteration <iteration>/<max_iterations>).` Exit 0.
   - If `status` is already terminal (`completed`, `cancelled`, `max-iterations-reached`, `crashed`): do NOT mutate. Print: `Loop "<loop_id>" is already <status> — nothing to do.` Exit 0 (FR-NL29 idempotency).

### 4. Cancel-all path (`--all` supplied)

1. Enumerate `<loops_dir>/*.json` (skip `.archive/`). For each file:
   - Parse. Skip silently if corrupt (the next list-loops invocation will surface the warning).
   - If `status == "running"`: mutate as in step 3 above. Collect the loop-id and the iteration progress for the summary.
2. After processing all files, print one line per cancelled loop:

```
Cancelled (<N>):
  <loop_id>    was at iter <iteration>/<max_iterations>
  <loop_id>    was at iter <iteration>/<max_iterations>
  …
```

3. If no loops were cancelled (zero running), print exactly: `No running loops to cancel.` Exit 0 (E16 / FR-NL30 idempotency).

### 5. Effect on in-flight iterations

Cancellation does NOT interrupt an iteration that is currently executing. The looping command's iteration body checks `status` at the next iteration boundary (FR-NL14 step 7) and exits when it sees `cancelled`. The user sees the loop stop within at most one more iteration's worth of work.

## Atomic write contract

Every state-file mutation MUST be atomic to avoid corrupting state in flight:

1. Read the current state file into memory.
2. Apply the field-level mutations in memory (`status`, `exited_at`, `exit_reason`, `last_updated`).
3. Write the new JSON to `<state-file>.tmp.<pid>`.
4. `mv -f <state-file>.tmp.<pid> <state-file>` (POSIX-atomic rename).

If the atomic rename fails (e.g., filesystem error), refuse with the underlying error and exit non-zero. Do NOT leave a partial `.tmp.<pid>` file (best-effort cleanup).

## Anti-patterns

- **Do NOT delete the state file.** Terminal-status state files are archived (D-NL10) on the next loop invocation that touches `.synthex/loops/`. Cancellation leaves the file in place with `status: "cancelled"`; archival happens later.
- **Do NOT prompt the user.** No `AskUserQuestion`. No interactive flow.
- **Do NOT mutate a terminal-status loop.** Idempotency requires no-op behavior for already-terminal state.
- **Do NOT touch loops in `.archive/`.** They are historical.

## See also

- [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md) — full iteration framework spec.
- `/synthex:loop` — start or resume a loop.
- `/synthex:list-loops` — enumerate running and recent loops.
- Plan: `docs/plans/native-looping.md` (Task 10, FR-NL29–FR-NL31).

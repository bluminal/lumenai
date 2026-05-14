---
model: haiku
---

# List native-looping loops in this project

Enumerate every loop tracked in `<project>/.synthex/loops/` — running first, then recent terminal-status loops. Output is short, human-readable, and consistent (FR-NL32 / FR-NL33).

Loops in `.synthex/loops/.archive/` are excluded by default — they are historical and already finished. To inspect the archive, list the directory directly.

This command takes no arguments. It is read-only — it does NOT mutate any state file.

## Workflow

### 1. Resolve project root

`project_root` = `$CLAUDE_PROJECT_DIR` if set, else `pwd`. `loops_dir` = `<project_root>/.synthex/loops`.

### 2. Handle missing directory

If `<loops_dir>` does not exist, print exactly:

```
No loops in this project.
```

Exit 0 (E15).

### 3. Enumerate state files

List every `*.json` directly under `<loops_dir>` (do NOT recurse; the `.archive/` subdirectory is intentionally skipped). Skip any file that cannot be parsed as JSON (corrupt file — surface it in a `WARNINGS` block at the bottom; never abort).

### 4. Bucket and sort

Bucket each parsed state file by `status`:

- **RUNNING** — `status == "running"`. Sort by `last_updated` descending (most-recently-touched first).
- **TERMINAL** — `status` in `{"completed", "cancelled", "max-iterations-reached", "crashed"}`. Sort by `exited_at` descending (most-recently-finished first). Cap at the 20 most recent (FR-NL33); if more exist, note the truncation count.

### 5. Format and print

Use this exact output shape (matching FR-NL32):

```
RUNNING (<N>):
  <loop_id>    iter <iteration>/<max_iterations>    started <relative time>    session <short-session-id-or-"(none, resumable)">
  …

COMPLETED (<M>):
  <loop_id>    <terminal-status-label>    iter <iteration>/<max_iterations>    finished <relative time>
  …
```

Rules:

- `<terminal-status-label>` is one of: `completed (promise)`, `cancelled`, `max-iterations`, `crashed`.
- Relative time uses short forms: `5m ago`, `2h ago`, `3d ago`. Computed from now − `started_at` (RUNNING) or now − `exited_at` (TERMINAL).
- `<short-session-id>` is the first 8 chars of `session_id`. If `session_id` is `null`, print `(none, resumable)`.
- Two spaces between columns; lines align by inspection — no fancy column padding required.
- Print the `RUNNING` block first, then a blank line, then `COMPLETED`. Omit a block entirely if its count is 0.
- If both blocks are empty (directory exists but is empty), print `No loops in this project.` and exit 0.
- If TERMINAL was truncated to 20, append a final line: `… and <truncated> more terminal loops (see .synthex/loops/.archive/).` (FR-NL33)

### 6. Optional: WARNINGS block

If any state files failed to parse OR are missing required fields (use the schema validator at `tests/schemas/loop-state-file.ts` informally — list the file as malformed without erroring), print after the main output:

```
WARNINGS:
  <relative-path>    <one-line-reason>
```

This is best-effort surfacing for users to clean up by hand. Do NOT auto-mutate malformed files.

## Examples

### Example 1: 2 running, 3 finished

```
RUNNING (2):
  next-priority-3f2a    iter 5/20    started 2h ago    session abc12345
  team-implement-7e1d   iter 11/30   started 4h ago    session (none, resumable)

COMPLETED (3):
  refine-requirements-9b22  completed (promise)  iter 3/20    finished 1h ago
  loop-write-rfc-1a08       max-iterations       iter 20/20   finished 30m ago
  team-plan-4c66            cancelled            iter 6/15    finished 5m ago
```

### Example 2: Empty project

```
No loops in this project.
```

### Example 3: Only terminal loops, no running

```
COMPLETED (2):
  loop-3f2a    completed (promise)  iter 4/20    finished 1d ago
  loop-7e1d    cancelled            iter 2/20    finished 1d ago
```

(Skip the empty RUNNING block.)

### Example 4: Truncation note

```
COMPLETED (20):
  <20 lines>
… and 7 more terminal loops (see .synthex/loops/.archive/).
```

## Anti-patterns

- **Do NOT mutate any state file.** This command is read-only.
- **Do NOT recurse into `.archive/`.** Archived loops are historical; surfacing them in the active list defeats the archive's purpose.
- **Do NOT prompt the user.** No `AskUserQuestion`. No interactive flow.
- **Do NOT fail on a single corrupt file.** Skip it and emit a one-line warning at the bottom.

## See also

- [`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md) — full iteration framework spec.
- `/synthex:loop` — start or resume a loop.
- `/synthex:cancel-loop <loop-id>` / `--all` — cancel one or all running loops.
- Plan: `docs/plans/native-looping.md` (Task 8, FR-NL32–FR-NL33).

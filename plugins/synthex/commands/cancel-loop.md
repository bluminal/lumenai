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

## Workflow (FR-HM18 — one Bash call)

Run `plugins/synthex/scripts/loop-step.sh cancel <loop_id>` or `... cancel --all` (resolved from the installed plugin root — Claude Code: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/loop-step.sh" cancel ...`) as ONE Bash call. On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if `${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: `plugin_root` from `.synthex/state.json`, else the directory two levels above the wrapper you were loaded from. Print its stdout/stderr to the user verbatim. That single call implements everything the rest of this section documents: the refusal paths, the single-loop and `--all` mutation logic, and the atomic write contract.

### Refusal paths (both live in the script)

- **Neither `loop_id` nor `--all` supplied** — refuse: `Usage: /synthex:cancel-loop <loop-id> | --all`.
- **Both `loop_id` and `--all` supplied** — refuse: `loop_id and --all are mutually exclusive.`
- **`loops_dir` does not exist** — print exactly: `No loops in this project.` and exit 0. (Not a refusal; mirrors FR-NL30 / E16 idempotency.)

### Single-loop cancel path (`loop_id` supplied)

1. If `<loops_dir>/<loop_id>.json` does not exist, refuse with: `No loop found: <loop_id>. Run /synthex:list-loops to see loops in this project.` (FR-NL40 analog)
2. The file is validated against the FR-NL8 schema (the same contract `tests/schemas/loop-state-file.ts` checks) — a corrupt file or an unknown `schema_version` refuses with a clear error.
3. `status` is inspected:
   - If `status == "running"`: mutate to `status: "cancelled"`, `exited_at: <UTC ISO 8601 now>`, `exit_reason: "Cancelled by /synthex:cancel-loop"`, `last_updated` updated. Written atomically (`<state-file>.tmp.<pid>` + `mv -f`). Prints: `Cancelled loop "<loop_id>" (was at iteration <iteration>/<max_iterations>).` Exits 0.
   - If `status` is already terminal (`completed`, `cancelled`, `max-iterations-reached`, `crashed`): does NOT mutate. Prints: `Loop "<loop_id>" is already <status> — nothing to do.` Exit 0 (FR-NL29 idempotency). The loop just cancelled by THIS invocation, or a previously-terminal one being re-targeted, is excluded from this same invocation's archive scan so repeated cancels of the same id stay idempotent rather than racing the archive hygiene pass.

### Cancel-all path (`--all` supplied)

1. Enumerates `<loops_dir>/*.json` (skips `.archive/`). For each file:
   - Parses. Skips silently if corrupt (the next `list-loops` invocation surfaces the warning).
   - If `status == "running"`: mutates as in the single-loop path above. Collects the loop-id and the iteration progress for the summary.
2. After processing all files, prints one line per cancelled loop:

```
Cancelled (<N>):
  <loop_id>    was at iter <iteration>/<max_iterations>
  <loop_id>    was at iter <iteration>/<max_iterations>
  …
```

3. If no loops were cancelled (zero running), prints exactly: `No running loops to cancel.` Exits 0 (E16 / FR-NL30 idempotency).

### Effect on in-flight iterations

Cancellation does NOT interrupt an iteration that is currently executing. The looping command's next call to `loop-step.sh advance` (or `hold`) sees `status: "cancelled"` and exits non-zero, so the loop's iteration loop stops. The user sees the loop stop within at most one more iteration's worth of work.

## Atomic write contract (implemented by loop-step.sh)

Every state-file mutation is atomic, so it cannot corrupt state in flight:

1. Read the current state file into memory.
2. Apply the field-level mutations in memory (`status`, `exited_at`, `exit_reason`, `last_updated`).
3. Write the new JSON to `<state-file>.tmp.<pid>`.
4. `mv -f <state-file>.tmp.<pid> <state-file>` (POSIX-atomic rename).

If the atomic rename fails (e.g., filesystem error), the script refuses with the underlying error and exits non-zero. It does NOT leave a partial `.tmp.<pid>` file (best-effort cleanup).

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

# ADR-003: Native Stop-Hook-Driven Looping

## Status
Accepted

## Date
2026-05-27

## Context

Synthex's native looping primitive (`/synthex:loop`, and the `--loop` flag on `next-priority` and the team commands) lets a command iterate until a completion promise is emitted or `--max-iterations` is reached. The framework is specified in `plugins/synthex/docs/native-looping.md` and was designed around **simulated same-turn continuation**: the model is instructed to re-enter the iteration body *in the same assistant turn* and to never end its turn until it emits `<promise>…</promise>`. The harness does not re-invoke the model between iterations, so under this design any unguarded turn-end silently kills the loop.

This design is fragile against the model's strongest behavioral prior — checking in with the user at a natural decision point. In practice, loops complete a handful of iterations and then stop, ending the turn with a hand-off like *"The loop is still running at iteration 15/20. Want me to resume it now?"* This is the single most common loop-breakdown pattern, and the looping docs already carry escalating prose warnings against it (`loop.md` Anti-patterns, `next-priority.md` "Imperative Loop Protocol"). Prose loses to the prior over many iterations.

A runtime backstop already exists: `plugins/synthex/scripts/loop-advance-gate.sh`, a `Stop` hook (registered in `hooks/hooks.json`) that blocks the turn-end when a loop is `running` and the last assistant message contains neither the iteration marker nor the promise. It was introduced as the fix in commit `f68bd52` ("prevent silent --loop drop-out after one iteration"). But it has two structural weaknesses:

1. **It yields after a single block.** Lines 29–30 copy the generic Stop-hook guard from the Claude Code docs — exit early when `stop_hook_active == true`. That guard is correct for a one-shot validator but wrong for a loop engine: the gate blocks once, the model re-emits the same hand-off, the gate sees `stop_hook_active` and allows the stop. The loop dies on the model's second attempt.
2. **Resumed loops are unprotected.** The gate matches the loop's `session_id` against the Stop event's `session_id` (`loop-advance-gate.sh:46`), but `loop.md` §3 resume never refreshes `session_id`. A loop resumed in a new session — common for a 20-iteration run spanning sessions — has a stale `session_id`, the match fails, and the gate silently allows every stop.

An investigation of the Claude Code changelog and docs (v2.1.152, the version installed) surfaced native primitives that do at the harness level what Synthex simulates. Empirical and documentary findings:

- **`/goal`** ("keep working across turns until a condition is met") is documented as *"a wrapper around a session-scoped prompt-based Stop hook."* It expects the model to end its turn each iteration and re-drives it via the hook — the opposite of "never end your turn." This is the same architecture Synthex's gate already uses, done correctly. `/goal` is one-per-session, restored on `--resume` with counters reset, and **cannot be set programmatically by a running command** (it is user-typed or a top-level `-p` prompt; no goal-setter is exposed to the model).
- **Native `/loop`** is interval polling (1-minute floor, 7-day expiry, wakeup-driven re-invocation). Robust against turn-ends, but the wrong shape for back-to-back backlog execution. Reserved as a possible future "babysit/monitor" command, not a replacement for `--loop`.
- **The consecutive-block cap.** The harness overrides a Stop hook "after it blocks **8 times in a row without progress**" (default 8, override via `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`, confirmed unset locally so the default governs). The **"without progress"** clause is decisive: blocks separated by real work do not accumulate toward the cap, so a loop whose iterations do genuine work never trips it.
- **Prompt- and agent-based Stop hooks** (`type: "prompt"` / `type: "agent"`) exist. The canonical doc example is literally a `Stop` hook that asks *"Check if all tasks are complete. If not, respond with {ok:false, reason:…}"* — Synthex's exact use case. Agent hooks can run tools (e.g., execute the test suite) before deciding.
- Hooks can be **session-scoped via skill/agent frontmatter** ("only run when that component is active … cleaned up when it finishes").

(The one item we could not measure live — the exact block count and reset behavior via a nested headless session — was blocked because Claude Code auth is macOS-Keychain-gated and unreachable from a spawned process. We rely on the documented "8 in a row without progress" semantics instead.)

## Decision

Stop simulating cross-turn continuation. Adopt the **native Stop-hook-driven, turn-per-iteration execution model** — the same model `/goal` is built on — and make the existing Synthex `Stop` hook the loop engine rather than a one-shot backstop.

### 1. Turn-per-iteration is the contract; the gate is the re-invoker

A `--loop` command does one iteration's work and may end its turn. The `Stop` hook re-drives the next iteration by blocking with a `reason`. Ending a turn mid-loop is no longer a failure mode — it is recovered. Same-turn continuation remains *permitted* (it is marginally cheaper given prompt caching) but is no longer load-bearing, and the looping docs stop presenting it as the thing that keeps the loop alive.

### 2. Keep a command-type (shell) Stop hook — do not switch to prompt/agent type

Synthex already has a crisp, deterministic completion signal: the `<promise>` tag and the state file's `status`. A shell hook decides mechanically at **zero extra LLM cost and zero eval flakiness**. A prompt/agent hook (the `/goal` substrate) is the right tool only when completion is *fuzzy*; Synthex's is not. Prompt/agent hooks are recorded as a documented future option — specifically, an **agent-based** Stop hook for `next-priority` that runs the plan's `[T]` tests to verify done-ness rather than trusting a self-emitted promise.

### 3. Fix the gate logic

Rewrite `loop-advance-gate.sh` so that, for a `running` loop matching the current session:

- **Remove the blanket `stop_hook_active` early-exit.** Replace it with a per-loop `consecutive_stop_blocks` counter persisted in the state file. The counter **resets to 0 whenever the loop's `iteration` advances** (progress), and increments on each no-progress block. The gate stops blocking once the counter reaches a configurable cap kept **below the harness's 8** (default 7), so Synthex relinquishes control deterministically rather than being force-stopped with a warning.
- **Allow the stop** (exit 0) only when one of: `status` is terminal (the command flipped it to `completed` / `max-iterations-reached` / `cancelled`); the promise tag is present in the last assistant message; or the last assistant turn is a **pending `AskUserQuestion`** (the `[H]`-criteria human-approval escape — the model is legitimately awaiting required input and must not be force-continued).
- Otherwise **block** with a `reason` that tells the model to perform the next iteration (boundary check → increment + persist counter → print marker → run the workflow → emit the promise when done).

### 4. Fix `session_id` on resume

`loop.md` §3 and `next-priority.md` resume MUST refresh the state file's `session_id` to the current session on every `--resume` / `--resume-last`, so resumed loops remain protected by the gate.

### 5. State schema: additive, no version bump

`consecutive_stop_blocks` (and an internal `last_gate_iteration` if needed) are added as **optional** fields read with a default of `0`. `schema_version` stays `1` so in-flight loops and `--resume` are unaffected.

## Consequences

### Positive

- **The loop stops fighting the model.** Turn-ends are recovered by the gate instead of silently killing the loop. The primary failure mode (hand-off-and-stop) is eliminated for in-session loops and, with the `session_id` fix, for resumed loops too.
- **Robust by construction, cheap to run.** The decision is mechanical (promise / status / counter) — no per-turn LLM evaluation cost, unlike `/goal`. The harness's "8 without progress" cap is the ultimate runaway guard; Synthex's own sub-8 counter relinquishes first, deterministically.
- **Compaction-safety comes for free where it matters.** Loop state already lives in `.synthex/loops/<id>.json`; the gate re-derives everything from disk, so auto-compaction of the conversation cannot break re-invocation.
- **`[H]` gates are safe.** The pending-`AskUserQuestion` escape prevents the gate from force-continuing past a required human approval.
- **Less prose to lose.** The "never end your turn" imperative is downgraded from load-bearing to advisory, shrinking the most error-prone part of the looping docs.
- **Retains every Synthex feature.** Multi-loop per project, named loops, `--resume`/`--resume-last`, `--loop-isolated`, `cancel`/`cancel-all`, archive — all preserved, unlike adopting `/goal` wholesale.

### Negative

- **Up to `cap` wasted turns when genuinely stuck.** If the model truly cannot advance (and it is not a recognized `AskUserQuestion` pause), the gate blocks up to the sub-8 cap before relinquishing. Bounded and far better than a silent single-iteration death, but noisier.
- **Unverified `AskUserQuestion`/`Stop` interaction.** It is likely that the `Stop` hook does not fire while an `AskUserQuestion` is pending (the `Notification` event covers waiting-for-input), in which case the escape is redundant insurance. We could not confirm this empirically (Keychain-gated auth). The defensive transcript check is implemented regardless.
- **Relies on documented but unmeasured cap semantics.** "8 in a row without progress" and what exactly resets the harness's internal counter are documented, not locally measured. Synthex's own counter is the primary control specifically to avoid depending on the harness's opaque reset rule.
- **Slight per-iteration overhead vs pure same-turn looping.** Turn-per-iteration crosses more turn boundaries; prompt caching makes this minor, but it is non-zero.

### Neutral

- **State schema gains optional fields** with no `schema_version` bump; resume and in-flight loops are unaffected.
- **Hook remains a thin shell shim.** Consistent with the Synthex+ hook design principle (logic in the markdown spec, mechanics in the shim).
- **Coexists with the in-flight Ralph Loop removal.** This decision is orthogonal to the concurrent removal of the external `ralph-loop` dependency and does not touch it.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| **Adopt `/goal` wholesale** | Harness-owned continuation; fresh evaluator decides "done"; status UI; deletes most of `native-looping.md`. | One goal per session — loses multi-loop, named loops, `--loop-isolated`, `cancel-all`, resume-by-id. Cannot be set programmatically by a command, so `--loop` could not invoke it seamlessly. Per-turn Haiku eval cost. | The feature-set regression and the inability to set it from within a command are disqualifying. We instead adopt the *model* `/goal` validates while keeping Synthex's richer surface. |
| **Re-platform onto native `/loop`** | Wakeup-driven re-invocation is inherently turn-end-safe; resumable. | Interval polling with a 1-minute floor and 7-day expiry — wrong shape for back-to-back backlog execution. | Injecting ≥60s of dead air between every task defeats the point of `next-priority --loop`. Reserved for a future monitor/babysit command. |
| **Keep the one-shot backstop; just harden the prose** | Minimal change. | Does not address the root cause: the gate yields after one block and prose cannot override the model's turn-ending prior. | This is essentially the status quo after `f68bd52`, which still exhibits the failure in the field. |
| **Switch the gate to a prompt/agent-based Stop hook now** | Native `/goal` substrate; an agent hook could run `[T]` tests to verify completion. | Adds a Haiku (or subagent) call on every turn-end for a decision that is already mechanical via the promise/status signal. Eval flakiness on a control path. | Deferred as a future enhancement specifically for fuzzy completion (e.g., test-verified done-ness in `next-priority`), not for the general mechanical case. |
| **Remove the gate; rely solely on the harness 8-block cap** | No Synthex-side counter to maintain. | The harness cap force-stops with a warning and depends on opaque "without progress" reset semantics; no `[H]` escape; no resume protection. | Synthex needs deterministic, sub-cap control and the human-approval escape; leaning entirely on the harness is too coarse. |

## References

- ADR-001: Model Selection for Synthex Agents and Commands (`docs/specs/decisions/ADR-001-model-selection.md`)
- ADR-002: Haiku Sub-Agent Decomposition for Opus Agents (`docs/specs/decisions/ADR-002-haiku-subagent-decomposition.md`)
- Stop hook + spec: `plugins/synthex/scripts/loop-advance-gate.sh`, `plugins/synthex/hooks/loop-advance-gate.md`, `plugins/synthex/hooks/hooks.json`
- Looping framework: `plugins/synthex/docs/native-looping.md`; commands `plugins/synthex/commands/loop.md`, `next-priority.md`
- Prior fix attempt: commit `f68bd52` ("fix(synthex): prevent silent --loop drop-out after one iteration")
- Claude Code v2.1.152 (installed). Relevant changelog: `/goal` (2.1.139); native `/loop` (2.1.72, .116, .140, .147); Stop-hook block cap (2.1.147); Stop/SubagentStop `background_tasks`/`session_crons` input (2.1.145)
- Docs: [Keep Claude working toward a goal](https://code.claude.com/docs/en/goal); [Run prompts on a schedule (`/loop`)](https://code.claude.com/docs/en/scheduled-tasks); [Automate workflows with hooks (prompt/agent hooks, block cap)](https://code.claude.com/docs/en/hooks-guide); [Hooks reference](https://code.claude.com/docs/en/hooks)

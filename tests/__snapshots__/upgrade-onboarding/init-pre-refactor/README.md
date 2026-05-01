# Pre-refactor `init.md` baseline

`init.md` in this directory is `plugins/synthex/commands/init.md` as it stood at commit `5505e48` — the synthex 0.5.3 hotfix, immediately before Phase 1 of the upgrade-onboarding plan refactored Step 4 into a standalone `/synthex:configure-multi-model` wizard.

## Purpose

Phase 1 Task 3 had a `[T]` acceptance criterion: *"Layer 1 baseline snapshot of `init`'s observable output on a fresh project remains byte-identical to the pre-refactor capture."*

The "byte-identical" promise is about **observable behavior** when running `init` end-to-end, not about the source bytes of `init.md`. The refactor was deliberate — Step 4 collapsed from ~100 lines to a 1-line stub delegating to `configure-multi-model.md`, with the wizard content extracted verbatim into the new file.

This snapshot lets a future reviewer reconstruct the pre-refactor source if they need to verify that the wizard content moved without semantic drift.

## How the byte-identical-observable-behavior promise is enforced

The current `init.md` (post-refactor) + `configure-multi-model.md` together must produce the same observable behavior as the pre-refactor `init.md` did standalone. This is enforced by:

1. **`tests/schemas/init-multimodel-md.test.ts`** — verifies the wizard content (CLI detection, auth checks, three-option `AskUserQuestion`, FR-MR27 warning, option apply logic) is present in `configure-multi-model.md` with its anchors renumbered 4a→1a etc. (D-UO9: anchors preserved verbatim except for the leading number).

2. **`tests/schemas/configure-multi-model.test.ts`** — verifies the new idempotency Step 0 layered on top, plus structural properties (frontmatter, AskUserQuestion count).

3. **The 4 init.md structural-ordering tests** in `init-multimodel-md.test.ts` (using `INIT_MD_HOST_PATH`) — verify `init.md` Step 4 is positioned correctly between Step 3 (concurrent tasks) and Step 5 (.gitignore), and that the post-refactor stub still references the wizard.

Together those three test groups establish that:

- The wizard's content moved to a new file without loss.
- `init.md` still invokes the wizard at the same workflow position.
- The wizard adds idempotency on top, but its core fresh-init path is byte-identical to the pre-refactor Step 4.

## Source

Captured retroactively via:

```
git show 5505e48:plugins/synthex/commands/init.md > init.md
```

Commit `5505e48` is the synthex 0.5.3 hotfix (`fix(init): use Read+Write tools instead of cp for config seeding`), the last commit before Phase 1 of upgrade-onboarding shipped (commit `cc14be0`).

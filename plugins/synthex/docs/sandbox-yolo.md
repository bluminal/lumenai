# Sandbox-Yolo Spawn Confirmation (ADR-003 / D27 / FR-MMT21)

Cold-path detail for `/synthex:review-code` Step 1c (FR-HM5, D17). Read unconditionally after pool routing and the multi-model decision are resolved; the gate that includes this file lives at `plugins/synthex/commands/review-code.md`. This is not a standalone command — it has no frontmatter and is never registered in `plugin.json`.

### 1c. Sandbox-Yolo Spawn Confirmation (ADR-003 / D27 / FR-MMT21)

After routing is resolved (and the multi-model decision below has been made), enumerate every external CLI that will participate in this review — either via fan-out to a routed standing pool's external reviewers (1b) OR via the orchestrator's external proposers when the multi-model branch fires (see "Multi-Model Review Decision Framework" below). For each such CLI, look up `multi_model_review.external_permission_mode.<cli-name>` from `.synthex/config.yaml` (falling back to `plugins/synthex/config/defaults.yaml`).

**If any CLI in the resolved roster has `sandbox-yolo` configured**, display ONE warning line per such CLI, verbatim:

```
⚠ <cli-name> is configured in sandbox-yolo mode — CLI will run with full tool permissions inside an OS sandbox.
```

Then prompt the user, requiring explicit confirmation before continuing:

```
Continue review with sandbox-yolo CLI(s)? [y/N]
```

Default is **N** (Enter without input = no). On `n` or empty input, abort the review cleanly without invoking any reviewer. On `y`, continue.

**When stdin is not a TTY** (CI, scripted invocation, stdin redirected from `/dev/null`), treat as default-N and abort cleanly without prompting. This mirrors the TTY guard documented for the waiting indicator and prevents unbounded CI hangs on the unanswerable prompt. Detect non-TTY stdin before reading the prompt; do NOT block waiting for input that will never arrive.

**Skip this step entirely** when no CLI in the resolved roster has `sandbox-yolo` configured (i.e., all CLIs resolve to `read-only` or `parent-mediated`). The check is a no-op in the default safe configuration. Native-only invocations (no externals at all) also skip this step.

The verbatim warning string above is locked by **D25 / NFR-MMT7** (user-visible string copy locked verbatim) and is identical to the strings used by `/synthex-plus:start-review-team` and `/synthex:performance-audit`.

---


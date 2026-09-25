# Sandbox-Yolo Spawn Confirmation (ADR-003 / D27 / FR-MMT21)

Cold-path detail for Step 1c of both `/synthex:review-code` and `/synthex:performance-audit` (FR-HM5, D17, Task 14). Read unconditionally after pool routing (and, for `review-code`, the multi-model decision) are resolved; the gate that includes this file lives in each command's own `.md`. This is not a standalone command — it has no frontmatter and is never registered in `plugin.json`.

Task 13 moved `review-code`'s Step 1c here first; Task 14 (FR-HM5) found the two commands' Step 1c bodies verbatim-identical except for command-specific words ("review" vs "audit", the sibling command named in the closing D25/NFR-MMT7 sentence, and a couple of `review-code`-specific cross-references to its multi-model decision framework), so rather than fork a second doc, both variants are kept here verbatim and each command's gate points at this one file. **Follow the section below that matches the command that sent you here** — do not mix language from the other section.

## review-code variant

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

## performance-audit variant

### 1c. Sandbox-Yolo Spawn Confirmation (ADR-003 / D27 / FR-MMT21)

After routing is resolved (Step 1b), enumerate every external CLI that will participate in this audit — either via fan-out to a routed standing pool's external reviewers OR via the orchestrator's external proposers when the multi-model branch fires for performance review. For each such CLI, look up `multi_model_review.external_permission_mode.<cli-name>` from `.synthex/config.yaml` (falling back to `plugins/synthex/config/defaults.yaml`).

**If any CLI in the resolved roster has `sandbox-yolo` configured**, display ONE warning line per such CLI, verbatim:

```
⚠ <cli-name> is configured in sandbox-yolo mode — CLI will run with full tool permissions inside an OS sandbox.
```

Then prompt the user, requiring explicit confirmation before continuing:

```
Continue audit with sandbox-yolo CLI(s)? [y/N]
```

Default is **N** (Enter without input = no). On `n` or empty input, abort the audit cleanly without invoking any reviewer. On `y`, continue to Step 2.

**When stdin is not a TTY** (CI, scripted invocation, stdin redirected from `/dev/null`), treat as default-N and abort cleanly without prompting. This mirrors the TTY guard documented for the waiting indicator and prevents unbounded CI hangs on the unanswerable prompt. Detect non-TTY stdin before reading the prompt; do NOT block waiting for input that will never arrive.

**Skip this step entirely** when no CLI in the resolved roster has `sandbox-yolo` configured (i.e., all CLIs resolve to `read-only` or `parent-mediated`). The check is a no-op in the default safe configuration. Native-only invocations (no externals at all) also skip this step.

The verbatim warning string above is locked by **D25 / NFR-MMT7** (user-visible string copy locked verbatim) and is identical to the strings used by `/synthex-plus:start-review-team` and `/synthex:review-code`.

---


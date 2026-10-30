# Prompt-File Reviewers

A `reviewers` entry can point at a markdown prompt file in the project instead
of naming a Synthex agent. The file's body becomes a reviewer that runs
alongside the named ones, and its findings are deduped, severity-ranked and
attributed in the same report.

This exists so a project that already maintains a review prompt — a CI guardian
prompt, a house checklist, a domain rule set — can run it as part of a Synthex
review without rewriting it as a plugin agent.

## Configuration

Accepted in every native reviewer block: `code_review.reviewers`,
`implementation_plan.reviewers`, `refine_requirements.reviewers`.

```yaml
code_review:
  reviewers:
    - code-reviewer
    - security-reviewer
    - prompt: .github/scripts/pr-guardian/prompt.md
      id: pr-guardian        # optional; here it would default to `pr-guardian` anyway
      enabled: true          # optional; defaults to true
```

| Key | Required | Meaning |
|-----|----------|---------|
| `prompt` | yes | Path to the prompt file, relative to the project root. Absolute paths and paths escaping the project root are rejected. |
| `id` | no | Attribution label in the report and in `reviewer_id` on each finding. Falls back to the frontmatter `name`; then, when the filename is a generic one (`prompt.md`, `review.md`, `index.md`), the name of the directory holding it; otherwise the filename without its extension. A prompt is conventionally stored as `<tool>/prompt.md`, where the directory is the name worth reporting. |
| `enabled` | no | `false` skips the reviewer, matching `- agent:` entries. |

`- prompt:` and `- agent:` entries mix freely in one list. In blocks that
support `focus:` (`implementation_plan`, `refine_requirements`), a `focus:` on a
`prompt:` entry is appended to the borrowed prompt the same way.

## Frontmatter

The file may carry YAML frontmatter between `---` fences. Only `name` is read,
as the `id` fallback — a prompt written for CI usually has none, so expect the
directory-name fallback above to be what names the reviewer. Every other field — `description`, `model`, `tools`,
anything project-specific — is ignored rather than rejected, so a prompt written
for another runner stays valid here.

A file with no frontmatter is fine. The whole file is the prompt body.

## How it runs

1. The command resolves the path, reads the file, and strips the frontmatter.
   The workflow engine cannot do this itself: `review-code-engine.js` has no
   `fs`, so the command passes the body in as `promptBody` on the reviewer entry
   (D33 — the command performs every side-effecting step).
2. The body runs as a plain sub-agent, not as a plugin agent. There is no
   `agentType` to give it.
3. Synthex appends its findings contract to the body — the same output shape the
   host command already requires of its other reviewers. For `review-code` that
   is the canonical finding schema
   (`agents/_shared/canonical-finding.schema.json`) plus positives and a summary,
   with no verdict field; `refine-requirements` and `write-implementation-plan`
   each append their own reviewer format instead. Where the borrowed prompt
   specifies its own output format, the appended contract wins.
4. On the multi-model branch the command launches them alongside the
   orchestrator and merges their findings into its report
   (`docs/multi-model-decision.md`); a review routed to a standing pool does
   not run them at all (`docs/standing-pool-routing.md`).
5. Findings flow through `findings-consolidator` with every other reviewer's, so
   they dedupe against them, contribute to the PASS/WARN/FAIL verdict, and
   appear under the same severity headings.

### Read-only

A borrowed prompt is often written for CI, where posting a comment or calling
`gh` is the point. The appended contract tells the reviewer to apply the review
criteria but ignore any instruction to post, write, or otherwise act. Treat this
as a convention, not a sandbox: a prompt that insists on a side effect and is
given tools to perform one can still perform it.

Review prompt files the way you review any code that runs in your repo.

## Failure modes

All of these degrade rather than abort the review, so one bad entry never costs
you the reviewers that did work:

| Condition | Behavior |
|-----------|----------|
| File does not exist, or is unreadable | Skip the reviewer, warn naming the path, continue with the rest. |
| Path is absolute or escapes the project root | Skip the reviewer, warn, continue. |
| File is empty, or is only frontmatter | Skip the reviewer, warn, continue. |
| Reviewer returns nothing, or ignores the contract | Same as a named reviewer that fails: `FAIL (no response)` in the reviewer table. |

A review that ends up with no usable reviewers at all reports that rather than
emitting an empty PASS.

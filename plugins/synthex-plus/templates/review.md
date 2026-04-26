# Review Team Template

> Deep, multi-perspective review of large or high-risk changesets -- teams-optimized equivalent of Synthex's `review-code` command where reviewers benefit from independent context and inter-reviewer discussion.

## Purpose

- Enables concurrent, independent review across code quality, security, performance, and design dimensions with full agent context per reviewer, unlike the sequential subagent invocations in `review-code`.
- Optimized for large or high-risk changesets where cross-domain discovery matters -- a reviewer spotting issues in another reviewer's domain can message them directly rather than silently noting it in their own report.
- Consolidation produces a single unified verdict with traceable findings from every reviewer, enforcing FAIL > WARN > PASS precedence so nothing slips through.

## Agent References

| Role | Synthex Agent | Required | Team-Specific Behavioral Overlay |
|------|--------------|----------|----------------------------------|
| Lead | Command orchestrator (not an agent) | Yes | Mailbox: receives findings from all reviewers; sends consolidation requests when all review tasks complete. Task list: creates one review task per active reviewer role, each scoped to the diff/files under review plus the reviewer's specific focus area. Reporting: produces consolidated review report with unified verdict (FAIL > WARN > PASS) after all reviewers complete. |
| Craftsmanship | `plugins/synthex/agents/code-reviewer.md` | Yes | Mailbox: sends findings to Lead on task completion; messages Security directly (SendMessage, type: "message") when discovering potential security issues in code quality context (e.g., unsafe patterns, missing input validation). Task list: claims the code review task, produces findings in standard Synthex code-reviewer output format. |
| Security | `plugins/synthex/agents/security-reviewer.md` | Yes | Mailbox: sends findings to Lead on task completion; messages Craftsmanship directly (SendMessage, type: "message") when security findings overlap with code quality (e.g., insecure patterns that are also convention violations). Task list: claims the security review task, produces findings in standard Synthex security-reviewer output format. |
| Performance | `plugins/synthex/agents/performance-engineer.md` | No | Mailbox: sends findings to Lead on task completion. Task list: claims the performance review task, produces findings in standard Synthex performance-engineer output format. Only spawned when explicitly requested via command flag or when `review.include_performance` is enabled in project config. |
| Design | `plugins/synthex/agents/design-system-agent.md` | No | Mailbox: sends findings to Lead on task completion; messages Craftsmanship directly (SendMessage, type: "message") when design violations overlap with code structure (e.g., hardcoded values that should use design tokens). Task list: claims the design review task, produces findings in standard Synthex design-system-agent output format. Automatically included when the changeset includes frontend files (`.tsx`, `.jsx`, `.css`, `.scss`). |

### Spawn Pattern (read-on-spawn)

Each teammate's spawn prompt follows this structure:

1. **Identity:** "Read your full agent definition at `{agent file path}` and adopt it as your identity"
   - The teammate reads the complete Synthex agent markdown file as its first action
   - This gives the teammate full behavioral fidelity: expertise, output format, severity frameworks, behavioral rules
   - No condensed summaries or inline identities -- the canonical agent file IS the identity

2. **Overlay:** Team-specific behavioral instructions from the overlay column above
   - Mailbox usage conventions (when to send messages, to whom, expected format)
   - Task list conventions (how to claim tasks, report completion, flag blockers)
   - Communication patterns (who this role coordinates with directly, reporting cadence)
   - These overlay instructions layer ON TOP of the base agent identity -- they do not replace it

3. **Context:** Review-specific context
   - CLAUDE.md and project-level conventions
   - The diff or changeset under review (files, line ranges, commit range)
   - Relevant specifications and design documents referenced by the changed code
   - Any reviewer-specific focus instructions the lead provides at task creation time

## Communication Patterns

- Lead creates one review task per active reviewer role on the shared task list. Each task includes the diff scope, files to review, relevant specs, and the reviewer's specific focus area. Reviewers are notified via task list updates.
- Reviewers work independently and concurrently on their assigned review tasks. Each reviewer sends findings to the Lead via SendMessage (type: "message") upon task completion, using their standard Synthex output format.
- Cross-domain discovery: when a reviewer finds something in another reviewer's domain, they message the relevant teammate directly via SendMessage (type: "message") with the finding details and file location. The receiving reviewer incorporates the tip into their own review. Example: Craftsmanship spots a potential SQL injection -- messages Security with the file path and code snippet.
- Lead consolidates after all review tasks complete. Consolidation applies verdict precedence: if any reviewer returns FAIL, the consolidated verdict is FAIL. If no FAIL but any WARN, consolidated verdict is WARN. Only if all reviewers return PASS is the consolidated verdict PASS.

## Task Decomposition Guidance

- Lead creates one review task per active reviewer role using TaskCreate. Each task description includes: the diff scope (commit range or file list), files to review, relevant spec links, and the reviewer's specific focus area (e.g., "Review for code quality, conventions, and reuse opportunities").
- All review tasks are independent with no `addBlockedBy` dependencies -- reviewers work in parallel. The only sequencing is that Lead consolidation happens after all review tasks reach "completed" status.
- Task descriptions follow the `references` context mode (pointers to files and specs, not full inline content). Each task description includes the diff command or file paths so the reviewer can read the changeset directly.
- Reviewers claim their task via TaskUpdate (status: "in_progress", owner: teammate name). On completion, reviewers mark the task as completed via TaskUpdate (status: "completed") and send their findings to the Lead via SendMessage.

## Quality Gates

- The review team IS the quality gate -- there is no separate hook-based review of review work. The consolidated verdict from the Lead is the final outcome.
- Verdict precedence is strictly enforced during consolidation: FAIL > WARN > PASS. A single FAIL from any reviewer results in a consolidated FAIL. WARN findings are documented and surfaced but do not override a PASS unless the finding meets the `review_loops.min_severity_to_address` threshold.
- When the consolidated verdict is FAIL, the Lead produces an actionable summary: which reviewer(s) failed, the specific findings requiring resolution, and recommended remediation steps. The caller decides whether to iterate (fix and re-review) or escalate.

## When to Use / When NOT to Use

**Use this template when:**

- Diff exceeds 500 lines of changed code
- Changes are security-sensitive (authentication, authorization, cryptography, secrets management, API surface changes)
- Changes span 5+ files across multiple modules or system layers
- Pre-release review requiring multi-perspective sign-off

**Do NOT use this template when:**

- Diff is under 200 lines with a single concern (use Synthex `review-code` instead)
- Routine bug fixes confined to 1-2 files (use Synthex `review-code` instead)
- Documentation-only or configuration-only changes (use Synthex `review-code` instead)

---

### Multi-Model Conditional Overlay (apply when multi_model=true)

> **Composition note (D22):** There is no rendering engine. This overlay is a labeled prose section.
> Commands compose teammate spawn prompts by reading this file and including the relevant overlay
> sections verbatim (raw inclusion) when their flags resolve true. The host model interprets
> conditional inclusion via command workflow markdown — not via Handlebars, Mustache, or any other
> template engine. Test surface = raw-string match on what the command writes into the spawn-prompt
> blob.

This overlay is included verbatim into the team Lead's spawn prompt AND into each native reviewer's
spawn prompt when `multi_model: true` is resolved for the team (per FR-MMT4/FR-MMT19 resolution
chain). It is a single contiguous Markdown subtree; no fragments are scattered elsewhere in this
file. Commands MUST include the entire subtree below — do not split or summarize.

#### Lead Suppression (FR-MMT4 step 1)

Include the following instruction verbatim in the team Lead's spawn prompt when multi_model=true:

> "Multi-model mode is active for this team. Do NOT produce your own consolidated review report. After all native reviewers' tasks reach `completed` status, wait for a message of type `orchestrator-report` in your mailbox at `~/.claude/teams/<team-name>/inboxes/lead/orchestrator-report-*.json`. When it arrives, surface its `report` field as the team's review output to the calling caller (and, in standing-pool mode, write the report to the requesting command's `report-to` path). Do not edit, summarize, or re-rank the orchestrator's report content."

**Rationale (FR-MMT4):** Without this suppression, two competing consolidated reports would surface
to the user (one from the team Lead, one from the orchestrator), creating ambiguity about which is
authoritative. The Lead's role under multi-model shifts to "publish the orchestrator's report" —
a pass-through, not a producer. Suppression is spawn-time (not runtime) to guarantee race-freedom:
the Lead never enters the natural consolidation code path when multi-model mode is active.

#### Reviewer JSON-Envelope (FR-MMT20)

Include the following instruction verbatim in each native reviewer's spawn prompt when multi_model=true:

> "This team is running in multi-model mode. When you send your findings to Lead, your mailbox message must include BOTH (a) your normal markdown review report AND (b) a JSON envelope conforming to the canonical finding schema (`multi-model-review.md` FR-MR13). The JSON goes in the message's `findings_json` field; the markdown goes in the message's `report_markdown` field. The JSON must include every finding from your markdown report — no summary, no truncation. If you would mark this review PASS, send an empty `findings` array."

**Rationale (FR-MMT20):** The orchestrator consumes native team findings via the canonical
finding schema to avoid per-reviewer ad-hoc parsing. The JSON envelope is emitted only when
`multi_model: true` is resolved; reviewers in standard non-multi-model invocations produce their
standard markdown report only (byte-identical behavior preserved). The `findings_json` field IS the
canonical finding schema from `multi-model-review.md` FR-MR13 — no new shape introduced here.
Agent definition files (`plugins/synthex/agents/*.md`) are NOT modified; this is a template-only
change (D5).

---

### Standing Pool Identity Confirm Overlay (apply when standing=true)

> **Composition note (D22):** There is no rendering engine. This overlay is a labeled prose section.
> Commands compose pool teammate spawn prompts by reading this file and including this overlay
> verbatim (raw inclusion) when `standing=true` resolves for the pool. The host model interprets
> conditional inclusion via command workflow markdown. This overlay fires **per task claim** (on
> each transition from idle → active), NOT once at pool spawn — include it at the per-task
> workflow point in the command's spawn prompt.

This overlay is included verbatim into each pool teammate's spawn prompt when `standing: true`.
It implements the idle-hour identity drift mitigation defined in FR-MMT5b.

#### Identity Confirm Step (FR-MMT5b)

Include the following instruction verbatim in each pool teammate's per-task workflow when standing=true:

Read-on-spawn (preserved per §8 Assumptions) means a pool teammate adopts its full Synthex agent
identity once at pool spawn and holds it for the pool's entire lifetime. For pools that idle for
hours (default `ttl_minutes: 60`; user-configurable up to `0` for indefinite), Claude Code
auto-compaction may evict portions of the teammate's context, including the agent definition itself.
To detect this without complicating the spawn path:

- Each pool teammate **unconditionally re-reads** its own agent file (e.g., `plugins/synthex/agents/code-reviewer.md`) before beginning review work on each newly-claimed task (transition from `idle` → `active`). No comparison is performed against the teammate's "current" understanding of its identity — post-compaction the teammate may not even retain a stable reference to compare against. The re-read itself is the fix: after compaction-evicted context is reloaded by the Read call, the teammate's effective agent definition is current. This is a single Read call; cost is negligible vs. a code review's typical token spend.
- The identity confirm step (the unconditional re-read) is part of the standing-pool variant of the review template (added to `templates/review.md` under a `{{#if standing}}…{{/if}}` block).

**Concrete instruction for teammates:** Before claiming and beginning work on each task from the
pool's task list, unconditionally re-read your own agent file at
`plugins/synthex/agents/<your-agent-name>.md` using the Read tool. Do this on every task claim,
not just the first one. Do not skip this step even if you believe your identity context is intact —
post-compaction state is not reliably introspectable.

**Cost rationale (FR-MMT5b verbatim):** This is a single Read call; cost is negligible vs. a code
review's typical token spend.

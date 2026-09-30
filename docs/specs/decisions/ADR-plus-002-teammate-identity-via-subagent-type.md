# ADR-plus-002: Teammate Identity via `agentType`/`subagent_type`, Reversing ADR-plus-001

## Status
Accepted

## Date
2026-09-28

## Context

ADR-plus-001 established **read-on-spawn**: a pool teammate's identity comes from an explicit
spawn-prompt instruction ("Read your full agent definition at `plugins/synthex/agents/<agent>.md`
and adopt it as your identity"). That decision was sound given what was known at the time, but it
created a durability problem once standing pools (Feature B) were designed: the spawn prompt is
delivered as part of the teammate's **initial user message**, which lives in conversation history,
not the system prompt. Claude Code's auto-compaction can lossily summarize conversation history
when a session's context fills up. A pool teammate that processes dozens of review tasks over
hours will eventually trigger compaction, and the read-on-spawn instruction (or an agent's adopted
identity) could in principle be summarized away.

The mitigation adopted for this, recorded as **D26** in
`docs/specs/multi-model-teams/teammate-api-spike.md` §6.3, was per-task re-issuance: the Pool Lead
re-sends the FR-MMT5b identity-confirm instruction (an unconditional re-read of the reviewer's
agent file) and the FR-MMT20 JSON-envelope clause in every per-task `SendMessage`, so the content
is always fresh in post-compaction context. This works, but it is expensive: on a three-reviewer
pool, every task re-pastes three full agent-file re-reads (12,964 + 14,411 + 9,271 = 36,646 bytes
for the `code-reviewer` / `security-reviewer` / `design-system-agent` default multi-model roster)
plus the FR-MMT5b/FR-MMT20 overlay instruction text, on top of the review's own diff and context.

FR-HM22 (`docs/reqs/harness-modernization.md`) proposed a different fix: spawn teammates with
`subagent_type: 'synthex:<agent>'` (the same mechanism Claude Code's `Agent` tool already uses for
one-shot subagent invocations) instead of instructing them to read their agent file. Task 11
(`docs/specs/harness-modernization/spikes.md` "Task 11 — OQ-9") spiked this for the `Agent`-tool
case and confirmed that `subagent_type` resolves a teammate's model, effort, and full system
prompt from the agent file, re-attached on **every request** as a spawn-time attachment outside
the message stream — not something embedded once in conversation history. That is architecturally
immune to conversation-history compaction, because compaction only rewrites the message stream;
it does not touch per-request attachments. Task 11 confirmed the identity half (model, system
prompt) but left the compaction half as a static argument only — no live compaction had been
observed.

Task 51 closed that gap: it forced a real compaction (`compact_boundary` event, confirmed in the
stream-json output) on a driver session that had spawned a named `synthex:code-reviewer`
subagent, then spawned a second subagent of the same type in the now-compacted session. The
`agentType`, model, effort, and the full system-prompt core block (12,786 bytes, sha256[:12]
`0c9d2a513de5`) were byte-identical before and after compaction. See "Task 51 — live-compaction
sub-check (FR-HM22)" in `docs/specs/harness-modernization/spikes.md` for the full evidence.

## Decision

Reverse ADR-plus-001 for every teammate role that maps to a Synthex agent file. Reviewer
teammates spawned by `/synthex:start-review-team` are now spawned with
`agentType: "synthex:<agent-name>"` set on the `spawnTeam` call, instead of a
"read your agent file" spawn-prompt instruction. This is implemented in:

- `plugins/synthex/commands/start-review-team.md` — Step 7's "Reviewer identity" paragraph and
  the "Reviewer Spawn Call" block now use `agentType`; Step 7c adds a `ListAgents`-based
  post-spawn identity verification (per the FR-HM22 acceptance criterion: verification must use
  `ListAgents`, not a read of `~/.claude/teams/standing/<name>/config.json`).
- `plugins/synthex/templates/review.md` — the "Spawn Pattern" subsection under Agent References
  now documents the `agentType` mechanism; the "Standing Pool Identity Confirm Overlay" section
  (FR-MMT5b) is deleted outright, and the "Per-Task Reviewer Re-Issuance (D26)" subsection under
  the Standing Pool Lifecycle Overlay is retired to a historical pointer (its identity-confirm
  half no longer applies; see Consequences below for what happens to its JSON-envelope half).
- `plugins/synthex/templates/_skeleton.md` — the canonical Spawn Pattern section documents
  `agentType` as the default for agent-file-backed roles, with read-on-spawn kept as the
  documented fallback for roles without a Synthex agent file (e.g. a Lead role, which is the
  command orchestrator and has no agent file) or for hosts whose team-spawn primitive does not
  accept `agentType`.

The Pool Lead is unaffected: it has no Synthex agent file (it is the command orchestrator, not an
agent), so it keeps its existing prompt-based spawn and the Standing Pool Lifecycle Overlay
unchanged.

### Fallback (detection + recovery)

If a host's `spawnTeam` does not accept an `agentType` parameter, or Step 7c's `ListAgents` check
shows a spawned reviewer's `agentType` as empty or mismatched, that reviewer's identity falls back
to the ADR-plus-001 read-on-spawn instruction, re-issued via `SendMessage` for that reviewer only,
and the fallback is noted in the pool's Step 10 spawn confirmation. This is documented at the point
of use in `start-review-team.md` Step 7c and in `templates/review.md`'s Spawn Pattern section and
`_skeleton.md`'s Fallback paragraph, rather than as a separate code path, since the fallback is a
single re-issued instruction, not a structural branch.

## Evidence

- **Task 11** (`docs/specs/harness-modernization/spikes.md`): a subagent spawned with
  `subagent_type: synthex:code-reviewer` carries `agentType: "synthex:code-reviewer"` in its
  meta, a spawn-time model attachment matching the agent file's `model:` pin, and a
  `prompt_snapshot` system prompt starting `# Code Reviewer\n\n## Identity`, byte-identical
  across two requests within the same (uncompacted) run.
- **Task 51** (`docs/specs/harness-modernization/spikes.md`, "Task 51 — live-compaction
  sub-check"): three tiny headless `claude -p` invocations against one resumed session —
  (1) spawn a named `synthex:code-reviewer` subagent and capture its `agentType`, model, effort,
  and system-prompt hash; (2) resume the session with `/compact`, confirming a real
  `compact_boundary` event fired; (3) resume again and spawn a second named
  `synthex:code-reviewer` subagent. All four identity-bearing fields
  (`agentType`, model `claude-sonnet-5`, `effort: medium`, system-prompt sha256[:12]
  `0c9d2a513de5`) were unchanged pre- vs. post-compaction. `ANTHROPIC_API_KEY` was confirmed
  unset before running (subscription auth, not usage-billed).
- **Residual unknown:** this evidence compacts the *driver* session that issues the spawn calls,
  not a long-lived pool teammate's own accumulated multi-task context. Forcing that specific
  scenario cheaply (within the task's ≤3-invocation budget) was not attempted — it would require
  accumulating tens of thousands of tokens of real task context first. The architectural argument
  (identity is a spawn-time attachment re-emitted per request, not conversation-history content)
  applies equally, since Agent Teams' teammate spawning is documented to use the same `agentType`
  resolution mechanism as the `Agent` tool's `subagent_type`, exercised directly here. Whether
  `spawnTeam` itself accepts an `agentType` parameter with identical semantics was not directly
  exercised in this spike (to keep it within budget); the fallback above covers the case where it
  does not.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| **Keep D26 per-task re-issuance (status quo)** | No new host-capability assumption; already implemented and tested (`lifecycle-overlay-synthex.test.ts`). | Re-pastes 36+ KB of agent-file content per task for a 3-reviewer pool (FR-HM22 AC: 35–50 KB). Ongoing per-task token cost for the life of every pool, not a one-time spawn cost. | The cost is recurring and scales with task count; Task 11 and Task 51 together provide the evidence needed to remove it. |
| **Keep read-on-spawn only at pool spawn time, drop the per-task re-issuance, without switching to `agentType`** | Simpler diff. | Task 26's own finding (`teammate-api-spike.md` §5) is that spawn-prompt content lives in conversation history and is not reliably durable across compaction — this was the reason D26 existed. Removing the per-task re-issuance without also moving identity out of conversation history reopens exactly the risk D26 mitigated. | Does not address the root cause; would be removing a mitigation without removing the risk it mitigates. |
| **`agentType` spawn, but keep per-task re-issuance as defense-in-depth** | Maximum safety margin. | Defeats the purpose — the whole point of `agentType` is that the per-task re-issuance is no longer needed for identity. Keeping both means paying the full 36+ KB per-task cost anyway, forfeiting the FR-HM22 acceptance criterion. | Directly contradicts the acceptance criterion this ADR exists to satisfy. |

## Consequences

### Positive

- **35–50 KB less context per standing-pool task** (FR-HM22 acceptance criterion; measured for
  the default 3-reviewer multi-model roster in `tests/schemas/pool-spawn-context-delta.test.ts`).
  This is a per-task saving, not one-time — it compounds over a pool's lifetime.
- **Simpler pool prose.** The "Standing Pool Identity Confirm Overlay" section and the identity
  half of "Per-Task Reviewer Re-Issuance" are gone; `start-review-team.md` no longer needs to
  compose and re-paste identity-confirm text into every per-task `SendMessage`.
- **Verification is now explicit and structural** (`ListAgents`), rather than implicit in an
  instruction the teammate is trusted to follow.

### Negative

- **New host-capability assumption.** This decision assumes `spawnTeam` (or whatever primitive
  Agent Teams uses to spawn a persistent teammate) accepts an `agentType`/`subagent_type`-shaped
  parameter with the same resolution semantics Task 11 and Task 51 observed for the `Agent` tool.
  This was not directly exercised for `spawnTeam` in either spike. Mitigation: the Step 7c
  `ListAgents` check catches a silent failure (empty/mismatched `agentType`) before any task is
  submitted, and the fallback re-issues the ADR-plus-001 instruction for the affected reviewer
  only.
- **Residual JSON-envelope compaction risk for long-idle multi-model pools.** FR-MMT20's
  JSON-envelope instruction is a team-specific behavioral overlay, not base agent identity, so it
  is not covered by the `agentType` durability argument — it is still delivered once, at spawn
  time, via the Multi-Model Conditional Overlay, and per-task re-issuance is not restored. A
  multi-model pool reviewer that idles long enough to trigger compaction between the spawn and a
  much later task could in principle lose the JSON-envelope instruction and revert to
  markdown-only output for that task. This is a smaller and rarer risk than the one this ADR
  removes (it affects only the JSON-envelope clause in multi-model pools, not model/effort/base
  identity in any pool), and is not blocking; it is noted here for a future task to pick up if
  dogfooding surfaces it.
- **Compaction of a long-lived pool teammate's own multi-task context remains architecturally
  argued, not directly observed.** Task 51 compacted the driver session that issues spawn calls,
  not a teammate that has itself been alive and accumulating context across dozens of tasks. See
  Evidence above.

### Neutral

- ADR-plus-001 is not deleted or marked Superseded in place; it remains the record of the original
  decision and its reasoning (the "single source of truth, zero maintenance overhead" argument for
  reading full agent files rather than compact summaries still holds — this ADR only changes *how*
  that file's content reaches the teammate, from an in-band Read instruction to an out-of-band
  spawn-time attachment). `_skeleton.md` keeps documenting read-on-spawn as the pattern for roles
  without an agent file.
- Templates outside `plugins/synthex/templates/` (i.e. `plugins/synthex-plus/templates/`) are out
  of scope for this ADR; they are addressed by the synthex-plus retirement tasks (54–55) per
  `docs/plans/harness-modernization.md` Phase 6.

## References

- FR-HM22: `docs/reqs/harness-modernization.md`
- Task 51: `docs/plans/harness-modernization.md` (Phase 6, Milestone 6.2)
- Task 11 spike: `docs/specs/harness-modernization/spikes.md` "Task 11 — OQ-9"
- Task 51 spike: `docs/specs/harness-modernization/spikes.md` "Task 51 — live-compaction sub-check"
- D26 and the original compaction-durability finding: `docs/specs/multi-model-teams/teammate-api-spike.md` §5–6
- ADR-plus-001: `docs/specs/decisions/ADR-plus-001-read-on-spawn.md`
- Updated prose: `plugins/synthex/commands/start-review-team.md`, `plugins/synthex/templates/review.md`, `plugins/synthex/templates/_skeleton.md`
- Context-delta test: `tests/schemas/pool-spawn-context-delta.test.ts`

# Implementation Plan: Synthex+

## Overview

Synthex+ extends Synthex with teams-optimized orchestration for sustained multi-agent collaboration via Claude Code's experimental Agent Teams API. This plan implements the PRD at `docs/reqs/plus.md`. Priority order: team-implement first (highest value, validates all core mechanisms), then team-review, then team-plan.

## Decisions

| # | Decision | Context | Rationale |
|---|----------|---------|-----------|
| D1 | Separate plugin at `plugins/synthex-plus/` | Plugin structure choice | Independent versioning, no Synthex modifications required (FR-CX1), clean install/uninstall |
| D2 | Read-on-spawn: teammates read full Synthex agent definitions at spawn time. See `docs/specs/decisions/ADR-plus-001-read-on-spawn.md` | How to represent agent expertise in teammate spawn prompts | Eliminates 11 hand-authored identity tasks. Spawn prompts reference the canonical agent file path (e.g., `plugins/synthex/agents/tech-lead.md`) and layer a team-specific behavioral overlay. Agents stay in sync with Synthex automatically |
| D3 | API spike before hook system | Hook events (TeammateIdle, TaskCompleted) are assumed from docs | If API doesn't match assumptions, Phase 3 needs redesign. Spike validates cheaply before building on unverified assumptions |
| D4 | Commands are markdown files, not programmatic API calls | Team creation mechanism | Consistent with Synthex's all-markdown-all-YAML pattern. Commands instruct the LLM to create teams via natural language |
| D5 | Hook scripts are thin shell shims (<20 lines) | Claude Code hooks require shell commands | Targeted exception to no-runtime-code constraint. Scripts contain no business logic -- just exit codes (0=pass, 2=block) |
| D6 | One team per session | Session management simplicity | Prevents resource conflicts and simplifies lifecycle management. Multi-team is explicitly out of scope |
| D7 | Only the lead writes to the implementation plan | Concurrent write prevention | Multiple teammates writing the plan creates merge conflicts and inconsistency |
| D8 | team-implement first, then team-review, then team-plan | Build order | team-implement exercises all core mechanisms (templates, task mapping, hooks, lifecycle). Subsequent commands reuse established patterns with less new work |
| D9 | Template skeleton defines canonical structure for all templates | Templates authored across 3 milestones need structural consistency | Skeleton defines heading levels, section ordering, and prose density. Agent references use a roles table with file paths rather than inline identities |
| D10 | Canonical output formats defined once in shared doc | Cost estimate and report formats appear in 3+ commands | Defining the same format independently in each command creates drift risk and makes updates error-prone |
| D11 | Spike is internal-only (not registered in plugin.json) | api-spike is a development tool, not a user command | Prevents users from running a one-time validation command that has no value outside initial development |

## Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| Q1 | Do `TeammateIdle` and `TaskCompleted` hook events exist in the live Agent Teams API? What are the exact event names? | Directly affects hooks.json config and shell shim design (Phase 3) | Open -- resolved by spike in M1.2 |
| Q2 | Is team metadata inspectable at `~/.claude/teams/{team-name}/config.json`? | Affects post-creation verification and orphan detection approach (prompt-based fallback if not) | Open -- resolved by spike in M1.2 |
| Q3 | Does `plan_approval` work as expected for teammates? | Affects how teammates get permission to execute tool calls | Open -- resolved by spike in M1.2 |
| Q4 | What is the exact team creation API surface? Natural language prompt to Claude Code, or structured API? | Affects how commands compose team creation instructions | Open -- resolved by spike in M1.2 |

---

## Phase 1: Foundation & API Validation

### Milestone 1.1: Plugin Scaffolding & Structural Anchors
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 1 | Create plugin directory structure: `plugins/synthex-plus/{.claude-plugin/,commands/,hooks/,scripts/,templates/,docs/,config/}` | S | None | FR-SP1 | pending |
| 2 | Write `plugins/synthex-plus/.claude-plugin/plugin.json` manifest with name, version, description, author, hooks field. Leave commands array empty (populated as commands are built). Do NOT register api-spike (D11) | S | None | FR-SP3 | pending |
| 3 | Write `plugins/synthex-plus/config/defaults.yaml` with all config sections from FR-CF1: teams, hooks, cost_guidance, review_loops, task_list, lifecycle, documents | M | None | FR-CF1 | pending |
| 4 | Register synthex-plus in `.claude-plugin/marketplace.json` as a second plugin entry with appropriate keywords | S | None | FR-CX3 | pending |
| 5 | Author template skeleton at `plugins/synthex-plus/templates/_skeleton.md` defining: exact heading levels (H2 for sections, H3 for subsections), section ordering (Purpose > Agent References > Communication Patterns > Task Decomposition Guidance > Quality Gates > When to Use / When NOT to Use), prose density expectations (bullets over paragraphs, max 3 sentences per guidance block). Agent References section defines roles table format: role name, Synthex agent file path (e.g., `plugins/synthex/agents/tech-lead.md`), optional/required flag, team-specific behavioral overlay notes (mailbox usage, task list conventions, communication patterns) | S | None | FR-TC1, D2 | pending |
| 6 | Define canonical output formats at `plugins/synthex-plus/docs/output-formats.md`: cost estimate display (both formulas using config values, labeled as approximate, user confirmation prompt, `show_cost_comparison: false` skip behavior), progress report format, completion report format. All commands reference this file instead of defining formats independently | M | None | FR-CG2, D10 | pending |

**Parallelizable:** All 6 tasks are independent.
**Milestone Value:** Plugin exists in the marketplace, installable alongside Synthex. Structural anchors ensure consistency across all subsequent template and command authoring.

### Milestone 1.2: Agent Teams API Spike
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 7 | Create spike brief at `docs/specs/spike-agent-teams-api.md` documenting what the spike validates: team creation mechanism, shared task list API, hook event names (TeammateIdle, TaskCompleted), team metadata inspection, teammate mailbox messaging, plan_approval behavior | S | None | Assumptions | pending |
| 8 | Write spike command `plugins/synthex-plus/commands/api-spike.md` (internal-only, NOT registered in plugin.json per D11) that instructs the agent to: (a) create a 2-member team with lead + one worker via natural language, (b) add tasks to shared task list with dependencies, (c) send a message between teammates, (d) mark a task complete and observe whether a TaskCompleted event fires, (e) observe whether TeammateIdle fires when a teammate has no tasks, (f) inspect team metadata at expected paths. **AC:** Q1 resolves to definitive event names (or "hooks unavailable"). Q2 produces a verified verification strategy. Q3 confirms/denies plan_approval. Q4 documents exact team creation mechanism | M | Task 7 | Assumptions | pending |
| 9 | After spike execution: update spike brief with findings, resolve Q1-Q4, update defaults.yaml if event names differ from assumptions. If hook events don't exist, document alternative approach and flag Phase 3 for redesign. **AC:** Q1-Q4 all have definitive answers documented in the spike brief | M | Task 8 | Assumptions | pending |
| 10 | Spike decision gate: confirm Phase 3 design is valid based on spike findings OR produce a revised M3 plan and update this implementation plan accordingly. Document go/no-go in spike brief. **This task blocks all M3.1 tasks** | S | Task 9 | Assumptions | pending |

**Parallelizable:** Task 7 can run parallel with M1.1 tasks. Tasks 8-10 are sequential.
**Milestone Value:** Validated understanding of Agent Teams API. All open questions resolved. Confidence to build on the API. Explicit gate before Phase 3 investment.

### Milestone 1.3: team-init Command
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 11 | Write `plugins/synthex-plus/commands/team-init.md` implementing FR-CF2: check Synthex installed, verify experimental flag, check for orphans (using verification strategy from spike Q2), create `.synthex-plus/config.yaml` from defaults, add to .gitignore, print summary of available commands/templates. **AC from FR-CF2:** warns (not fails) if Synthex missing, warns if experimental flag missing, detects/reports orphaned team resources, config includes setting comments | M | M1.1, spike Q2 result | FR-CF2 | pending |
| 12 | Add `team-init` to plugin.json commands array | S | Task 11 | FR-SP3 | pending |

**Parallelizable:** None within this milestone. Can overlap with M1.2 spike execution (Task 11 depends on Q2 resolution for orphan detection strategy).
**Milestone Value:** Users can initialize Synthex+ in their projects. Config framework operational.

---

## Phase 2: Implementation Team (team-implement) -- Core Value Delivery

### Milestone 2.1: Implementation Team Template
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 13 | Write `plugins/synthex-plus/templates/implementation.md` conforming to _skeleton.md: team name/purpose, agent references table (Lead=`plugins/synthex/agents/tech-lead.md`, Frontend=`plugins/synthex/agents/lead-frontend-engineer.md`, Quality=`plugins/synthex/agents/quality-engineer.md`, Reviewer=`plugins/synthex/agents/code-reviewer.md` + `plugins/synthex/agents/security-reviewer.md`), team-specific behavioral overlay per role (mailbox usage patterns, task list conventions, how each role communicates with the lead, acceptance criteria reporting), communication patterns, task decomposition guidance, quality gates. "When to use / when NOT to use" section uses concrete thresholds (e.g., "4+ hours estimated work", "multi-component spanning frontend + backend + tests") | L | Task 5 | FR-TC2, D2 | pending |

**Parallelizable:** Depends only on skeleton (Task 5).
**Milestone Value:** Implementation team template ready for use by the team-implement command.

### Milestone 2.2: team-implement Command -- Core Workflow
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 14 | Write `plugins/synthex-plus/commands/team-implement.md` -- parameters section: implementation_plan_path, template, milestone, config_path with defaults per FR-CMD1 | S | None | FR-CMD1 | pending |
| 15 | Write team-implement workflow step 1-2: load config (resolution: project > plugin defaults > hardcoded), read implementation plan, identify target milestone and tasks. Include milestone task count check against `lifecycle.max_tasks_per_invocation` (warn if >15) | M | Task 14 | FR-CMD1, FR-CW1 | pending |
| 16 | Write team-implement workflow step 3: pre-flight checks -- one-team-per-session check, Synthex dependency check, orphan detection (using verification strategy from spike Q2). Reference FR-LM1 behavior. Produce clear error messages for each failure mode | M | Task 15 | FR-LM1 | pending |
| 17 | Write team-implement workflow step 4: cost estimate display referencing canonical format in `plugins/synthex-plus/docs/output-formats.md`. Include caveat that formula assumes all teammates interact with all tasks -- conservative upper bound for implementation teams. **AC:** Displays both formulas using config values; labeled as approximate; user confirmation prompt present; `cost_guidance.show_cost_comparison: false` skips display | M | Task 15, Task 6 | FR-CG2 | pending |
| 18 | Write team-implement workflow step 5: team creation using read-on-spawn pattern -- read implementation template, compose spawn prompt for each teammate with: (1) agent file path reference instructing teammate to read the full Synthex agent definition and adopt it as their identity, (2) team-specific behavioral overlay from template (mailbox usage, task list conventions, communication patterns for this role), (3) milestone context + project context (CLAUDE.md, specs). Include auto-compaction guidance per FR-CW3. Illustrative spawn prompt structure: "Read your agent definition at `plugins/synthex/agents/tech-lead.md` and adopt it as your identity. Additionally, in this team: [team overlay from template -- mailbox patterns, reporting cadence, task claiming conventions]" | L | Task 13, Task 16, Task 17 | FR-TCM1, FR-CW3, D2 | pending |
| 19 | Write team-implement workflow step 6: post-creation verification -- inspect team metadata (or prompt-based fallback per Q2 resolution), verify expected roles present, handle missing optional/required roles per FR-TCM2 | M | Task 18 | FR-TCM2, FR-GD2 | pending |

**Parallelizable:** Tasks 16-17 can be drafted as independent sections after Task 15. All others sequential.
**Milestone Value:** team-implement can load a plan, run pre-flight, estimate cost, create a team with read-on-spawn, and verify formation.

### Milestone 2.3: team-implement -- Task Mapping & Execution
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 20 | Write team-implement workflow step 7: plan-to-task mapping instructions -- lead maps plan tasks to shared task list items, preserving dependency chains (blockedBy), enriching descriptions with context (CLAUDE.md reference, spec links, inter-task integration points, acceptance criteria, context budget guidance). Reference FR-TL1 and FR-TL3 | L | Task 19 | FR-TL1, FR-TL3 | pending |
| 21 | Write team-implement workflow step 8: execution coordination -- lead assigns tasks respecting dependencies, teammates execute independently, lead monitors progress. Include progressive summarization instructions (summarize every 3-5 completed tasks per FR-CW2) | M | Task 20 | FR-CW2 | pending |
| 22 | Write team-implement workflow step 9: progress synchronization -- only the lead writes to the implementation plan, teammates report via shared task list, lead consolidates at milestone boundaries. Discovered work captured in both systems. Reference FR-TL2 | M | Task 21 | FR-TL2 | pending |

**Parallelizable:** Sequential -- each step builds on the previous.
**Milestone Value:** team-implement can map a plan to tasks, coordinate execution, and sync progress.

### Milestone 2.4: team-implement -- Lifecycle Management
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 23 | Write team-implement workflow step 10: graceful shutdown -- lead summarizes completed work, non-lead teammates shut down first then lead, verify resource cleanup. Reference FR-LM2 | M | Task 22 | FR-LM2 | pending |
| 24 | Write team-implement error handling section: teammate failure detection and reassignment (FR-LM3 case 1), lead failure with best-effort cleanup (case 2), cleanup failure reporting (case 3), stuck task timeout intervention (case 4, configurable via `lifecycle.stuck_task_timeout_minutes`) | M | Task 23 | FR-LM3 | pending |
| 25 | Write team-implement graceful degradation: detect missing experimental flag, explain what's needed, offer fallback to `next-priority` command. Reference FR-GD1 | S | Task 24 | FR-GD1 | pending |
| 26 | Write team-implement orphan prevention: record team name at creation, remove at cleanup, detect orphans on next invocation (using verification strategy from spike Q2). Reference FR-LM4 | S | Task 24 | FR-LM4 | pending |
| 27 | Add `team-implement` to plugin.json commands array | S | Task 26 | FR-SP3 | pending |

**Parallelizable:** Tasks 25-26 can run concurrently after Task 24.
**Milestone Value:** team-implement is feature-complete with full lifecycle management. First Synthex+ command operational end-to-end.

---

## Phase 3: Quality Gate Hooks

### Milestone 3.1: Hook Infrastructure
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 28 | Write `plugins/synthex-plus/hooks/hooks.json` with TaskCompleted and TeammateIdle event definitions. Use event names validated by the Phase 1 spike (Task 9). Reference shell shims in `scripts/` | S | Task 10 (spike gate) | FR-HK1 | pending |
| 29 | Write `plugins/synthex-plus/scripts/task-completed-gate.sh`: thin shim (<20 lines), detect completed task type, exit 0 for pass, exit 2 for block. Include inline comments explaining the hook's purpose. After writing, run `chmod +x`. Verify git tracks as mode 100755 | S | Task 28 | FR-HK1, FR-HK2 | pending |
| 30 | Write `plugins/synthex-plus/scripts/teammate-idle-gate.sh`: thin shim (<20 lines), check for pending tasks matching idle teammate's role, exit 0 to allow idle, exit 2 to assign work. After writing, run `chmod +x`. Verify git tracks as mode 100755 | S | Task 28 | FR-HK1, FR-HK3 | pending |

**Parallelizable:** Tasks 29-30 are independent after Task 28. All blocked on spike decision gate (Task 10).
**Milestone Value:** Hook infrastructure in place. Shell shims ready for integration.

### Milestone 3.2: Hook Behavioral Documentation
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 31 | Write companion markdown `plugins/synthex-plus/hooks/task-completed-gate.md` documenting FR-HK2 behavior: work type detection logic, reviewer routing rules (code/frontend/infrastructure), FAIL verdict reopening with findings, PASS/WARN notification to lead. This is the behavioral reference that the prompt-mediated system uses | M | Task 29 | FR-HK2 | pending |
| 32 | Write companion markdown `plugins/synthex-plus/hooks/teammate-idle-gate.md` documenting FR-HK3 behavior: pending task matching by role, dependency chain respect, cross-functional help suggestion, dismissal notification to lead | M | Task 30 | FR-HK3 | pending |

**Parallelizable:** Tasks 31-32 are independent.
**Milestone Value:** Hooks are fully documented with behavioral logic in markdown (maintainable, testable) and thin shell entry points.

---

## Phase 4: Review & Planning Commands

### Milestone 4.1: Review Team
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 33 | Write `plugins/synthex-plus/templates/review.md` conforming to _skeleton.md: team name/purpose, agent references table (Lead=orchestrator, Craftsmanship=`plugins/synthex/agents/code-reviewer.md`, Security=`plugins/synthex/agents/security-reviewer.md`, Performance=`plugins/synthex/agents/performance-engineer.md` [optional], Design=`plugins/synthex/agents/design-system-agent.md` [auto for frontend]), team-specific behavioral overlay per role (cross-domain messaging pattern, how to send findings to other reviewers, consolidation rules FAIL>WARN>PASS). "When to use / when NOT to use" uses concrete thresholds (e.g., "500+ LOC diffs", "security-sensitive changes") | L | Task 5 | FR-TC3, D2 | pending |
| 34 | Write `plugins/synthex-plus/commands/team-review.md` -- core workflow: parameters (target, template, config_path), load config, determine scope, pre-flight, cost estimate (reference output-formats.md), create team using read-on-spawn pattern (agent file path + team overlay from template), reviewers execute concurrently, cross-domain messaging, lead consolidates. Reuse team-implement's lifecycle patterns (pre-flight, shutdown, orphan prevention) from M2.4 by reference. Graceful degradation fallback to `review-code` | L | Task 33, M2.4 (patterns) | FR-CMD2, FR-GD1, D2 | pending |
| 35 | Write team-review fix-and-re-review cycle as a section of team-review.md: persistent team re-assignment (same teammates review changed artifacts), changed-files-only scope for re-review, cycle counting against `review_loops.max_cycles`, explicit guidance on how teammates know which artifacts to re-examine (lead messages each reviewer with the specific changed files relevant to their domain) | M | Task 34 | FR-CMD2 | pending |
| 36 | Add `team-review` to plugin.json commands array | S | Task 35 | FR-SP3 | pending |

**Parallelizable:** Tasks 33 depends only on skeleton. Tasks 34-35 are sequential. Task 36 depends on 35.
**Milestone Value:** team-review command operational. Multi-perspective review with cross-domain communication and re-review cycles.

### Milestone 4.2: Planning Team
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 37 | Write `plugins/synthex-plus/templates/planning.md` conforming to _skeleton.md: team name/purpose, agent references table (Lead=`plugins/synthex/agents/product-manager.md`, Architect=`plugins/synthex/agents/architect.md`, Designer=`plugins/synthex/agents/design-system-agent.md`, Implementer=`plugins/synthex/agents/tech-lead.md`), team-specific behavioral overlay per role (concurrent review patterns, cross-concern messaging, PM consolidates feedback, architect defers to PM on requirements), communication patterns. "When to use / when NOT to use" uses concrete thresholds (e.g., "10+ requirements", "multi-phase plans") | L | Task 5 | FR-TC4, D2 | pending |
| 38 | Write `plugins/synthex-plus/commands/team-plan.md`: parameters (requirements_path, plan_path, template, config_path), full workflow (load config, read PRD, PM conducts user interview -- explicitly port this step from write-implementation-plan's workflow, PM drafts initial plan, pre-flight, cost estimate referencing output-formats.md, create team using read-on-spawn pattern, concurrent review, cross-cutting discussion, PM addresses feedback, compactness pass, cleanup). Reuse team-implement's lifecycle patterns from M2.4 by reference. Graceful degradation fallback to `write-implementation-plan` | L | Task 37, M2.4 (patterns) | FR-CMD3, FR-GD1, D2 | pending |
| 39 | Add `team-plan` to plugin.json commands array | S | Task 38 | FR-SP3 | pending |

**Parallelizable:** Task 37 depends only on skeleton. Tasks 38-39 are sequential.
**Milestone Value:** All 3 team commands operational. Full Synthex+ command surface complete.

---

## Phase 5: Documentation, Testing & Polish

### Milestone 5.1: Decision Guide, Documentation & README
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 40 | Write teams vs. subagents decision guide at `plugins/synthex-plus/docs/decision-guide.md` covering: factor table from FR-CG1 (task duration, communication needs, context continuity, parallelism, review depth, cost sensitivity) with concrete thresholds | M | M2.4 | FR-CG1 | pending |
| 41 | Embed decision guide summary in each team command's help text (brief version with pointer to full guide) | S | Task 40 | FR-CG1 | pending |
| 42 | Write context window management guide at `plugins/synthex-plus/docs/context-management.md`: milestone scope limits, progressive summarization, auto-compaction behavior, task description as durable record | S | M2.3 | FR-CW1-3 | pending |
| 43 | Write `plugins/synthex-plus/README.md`: prerequisites (Synthex installed, experimental flag), quick start (team-init, first team-implement), three commands with parameters and example invocations, cost model summary with pointer to decision guide, link to context management guide | M | M4.2 | -- | pending |

**Parallelizable:** Tasks 40-43 are independent.
**Milestone Value:** Users have clear guidance on when to use teams vs. subagents, how to manage context, and a comprehensive README for getting started.

### Milestone 5.2: Testing -- Schema Validators (Layer 1)
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 44 | Write schema validator `tests/schemas/synthex-plus/template.ts`: validate template structure (required sections per _skeleton.md: team name, purpose, agent references table, communication patterns, task decomposition guidance, quality gates, when to use / when NOT to use). Validate that agent references contain valid Synthex agent file paths (paths must match files in `plugins/synthex/agents/`), validate each role has a behavioral overlay section. **Study existing test patterns in `tests/schemas/` before writing** | M | M2.1, M4.1, M4.2 | FR-TS1 | pending |
| 45 | Write schema validator `tests/schemas/synthex-plus/hooks.ts`: validate hooks.json structure (event names, command paths, descriptions), verify script files exist and are executable (validate mode 100755 on script files) | S | M3.1 | FR-TS1 | pending |
| 46 | Write schema validator `tests/schemas/synthex-plus/command-output.ts`: validate team creation summaries (roles, team name, task count), progress reports, and completion reports against canonical formats in output-formats.md | M | M2.4, Task 6 | FR-TS1 | pending |
| 47 | Write Vitest test suites for all 3 validators with inline sample outputs. **Study existing test patterns in `tests/schemas/*.test.ts` first** | M | Tasks 44-46 | FR-TS1 | pending |
| 48 | Create test fixtures at `tests/fixtures/synthex-plus/`: sample templates, hooks.json, command output samples | M | Tasks 44-46 | FR-TS1 | pending |

**Parallelizable:** Tasks 44-46 are independent. Tasks 47-48 depend on all validators.
**Milestone Value:** Layer 1 tests run on every PR at zero LLM cost. Template, hook, and output format structure validated automatically.

### Milestone 5.3: Testing -- Behavioral & Integration (Layers 2-3)
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 49 | Write Layer 2 behavioral assertions for team-implement: team creation spawn prompt contains agent file path references and read-on-spawn instructions, cost estimate uses correct formula, pre-flight checks detect orphans and missing dependencies, lifecycle management instructions present. **Study existing Layer 2 patterns in `tests/promptfoo.config.yaml` first** | M | M5.2 | FR-TS2 | pending |
| 50 | Write Layer 2 behavioral assertions for team-review: cross-domain messaging pattern instructed, consolidated report format matches Synthex conventions, re-review cycles reuse existing team with changed-files-only scope | M | M5.2 | FR-TS2 | pending |
| 51 | Write Layer 2 behavioral assertions for team-plan: concurrent review instructed, PM retains authority, reviewer persistence across cycles, user interview step present | S | M5.2 | FR-TS2 | pending |
| 52 | Write Layer 3 integration scenarios: team-implement executes small milestone with correct task coordination, team-review produces cross-domain findings, team-plan maintains reviewer context across cycles | L | M5.2 | FR-TS3 | pending |
| 53 | Add Synthex+ test entries to `tests/promptfoo.config.yaml` for Layers 2-3 | S | Tasks 49-52 | FR-TS2-3 | pending |

**Parallelizable:** Tasks 49-51 are independent. Task 52 depends on Layer 2 completion. Task 53 depends on all.
**Milestone Value:** Full 3-layer testing pyramid for Synthex+. Behavioral correctness validated.

### Milestone 5.4: Final Polish
| # | Task | Complexity | Dependencies | Req | Status |
|---|------|-----------|--------------|-----|--------|
| 54 | Final review of plugin.json commands array -- verify all user-facing commands registered: team-init, team-implement, team-review, team-plan. Confirm api-spike is NOT registered (D11) | S | M4.2 | FR-SP3 | pending |
| 55 | Verify marketplace.json entry is complete and keywords differentiate from Synthex | S | Task 54 | FR-CX3 | pending |
| 56 | Verify defaults.yaml covers all configurable settings documented across all commands and hooks | S | Task 54 | FR-CF1 | pending |
| 57 | Verify no Synthex files were modified (FR-CX1 compliance check) | S | Task 54 | FR-CX1 | pending |
| 58 | Verify shared document paths in Synthex+ defaults match Synthex defaults (FR-CX2) | S | Task 54 | FR-CX2 | pending |

**Parallelizable:** All tasks 54-58 are independent.
**Milestone Value:** Synthex+ v0.1 complete. All PRD requirements addressed, all success metrics verifiable.

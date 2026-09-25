# Harness Modernization — Milestone 1.2 Spike Results

Milestone 1.2 spikes for `docs/plans/harness-modernization.md`. Question, Decision, and Evidence are verbatim from the spike journal (`wf_96dda30d-a93`); Method, Result, and Unknowns are condensed from it. `$SCRATCH` = `/private/tmp/claude-501/-Users-ajbrown-orca-workspaces-lumenai-New-Features/402d6879-3f63-4d3e-ade7-37b2b65eafff/scratchpad`.

| Task | OQ | Verdict | Fallback fired |
|---|---|---|---|
| 5 | OQ-1 | partial | no |
| 6 | OQ-2 | confirmed | yes |
| 7 | OQ-3/OQ-4 | partial | yes |
| 8 | OQ-7 | partial (install shape confirmed) | no |

## Task 5 — OQ-1: rename `skills/` to `portable-skills/` (FR-HM11)

### Question

Can the generated wrapper tree be renamed from skills/ to portable-skills/ so Claude Code stops auto-loading all 46 wrappers, while Codex, Grok, Gemini CLI, and OpenCode still find them?

### Method

Worktree `feature/task5-portable-skills-spike` (commit `af67de4`): `skillsRoot` → `portable-skills`, `git mv` of the 46 wrappers, regenerate + `--check`; repoint the Codex/Grok `skills` keys and every hard-coded `skills/` path; `vitest run schemas/`; `run-suite.mjs` offline (all) + activation (codex, gemini) in Docker; `claude --plugin-dir <path> plugin details synthex` A/B; Grok `plugin validate` / `install --trust` / `list --json` / `details` / `inspect --json`, a `grok -p` probe, one `--debug` run, then uninstall. User Grok and `~/.claude/plugins` state verified untouched.

### Result

**Verdict:** partial

Layer 1: 148 files / 4282 passed / 5 skipped; `--check` clean. Codex PASS (offline 46/46, activation 46/46). Gemini PASS (46/46 both) after a real `contract.mjs` fix: `validateSkillTree()` hardcoded the installed dir name, but Gemini always installs to `.gemini/skills/<id>/`; added a `skillsDirName` param. Claude Code CONFIRMED via `--plugin-dir`: `Skills (46)` / ~3,210 tok → `Skills (0)` / ~0 tok; `claude-offline.mjs` fails only on its stale 46 assertion (Task 21 flips it). OpenCode FAILS (0/46): discovery is hardcoded to `.claude/skills/**` and `.agents/skills/**`; a rename without `opencode.json` `skills.paths` is invisible. Grok INCONCLUSIVE: install copies the tree correctly, but a plugin-name collision with the Claude-marketplace `synthex` entry won scope precedence, and `skills_discovery` resolved no synthex skill from either tree.

### Decision

Do not do a blanket revert to skills/ (Q6's "keep skills/" fallback was not invoked) — the evidence doesn't support treating this as a uniform failure. Claude Code's FR-HM11 goal is directly confirmed achieved, and Codex + Gemini are fully unaffected (both fully PASS offline+activation on the rename alone). The rename should proceed as the Task 21 baseline, with two open items Task 21 must resolve rather than silently ignore: (a) OpenCode is a genuine, confirmed regression under a plain rename — Task 21 needs to either ship an opencode.json/.opencode config with `skills.paths: ["portable-skills"]` (unverified in this spike — flagged as a new open question) and prove it closes the gap, or explicitly accept the OpenCode gap per Q6's stated default ("accept and re-spike") and document it in the install recipe; (b) Grok's actual live-skill-discovery behavior from a Grok-native plugin install (as opposed to its apparent piggybacking on Claude Code's installed marketplace cache) was not cleanly isolated in this run because of a plugin-name collision in the test environment — Task 21 (or a re-spike) should re-test Grok with the pre-existing Claude-cache "synthex" entry absent/renamed to remove the collision, since the current signal is not strong evidence either way specific to the portable-skills/ rename.

### Fallback taken

Not taken (Q6 "keep `skills/`" not invoked). The rename proceeds as the Task 21 baseline; OpenCode and Grok carried as Task 21 sub-items and Q7.

### Evidence

**Claude Code A/B via --plugin-dir (baseline, skills/)**

```text
Component inventory
  Skills (46)  architect, audit-artifact-writer, ... write-rfc
  Agents (0)
  Hooks (2)  SessionStart, Stop ...
Projected token cost
  Always-on:   ~3,210 tok   added to every session
```

**Claude Code A/B via --plugin-dir (renamed, portable-skills/)**

```text
Component inventory
  Skills (0)
  Agents (0)
  Hooks (2)  SessionStart, Stop (harness-only — no model context cost)
Projected token cost
  Always-on:   ~0 tok   added to every session
```

**compat offline suite, per-harness complete events (rebuilt)**

```text
{"harness":"claude",...,"ok":false,..."error":"Claude component inventory is incomplete: ... Skills (0) ..."}
{"harness":"codex","phase":"complete","ok":true,"elapsedMs":199}
{"harness":"gemini","phase":"complete","ok":true,"elapsedMs":58390}
{"harness":"opencode",...,"ok":false,..."error":"OpenCode inventory is incomplete: architect, audit-artifact-writer, ... \n[... \"name\": \"customize-opencode\", ... \"External skills (auto-loaded) | `~/.claude/skills/<name>/SKILL.md`, `~/.agents/skills/<name>/SKILL.md`\" ...]"}
```

**compat activation suite, codex + gemini**

```text
{"harness":"codex","phase":"complete","ok":true,"profile":"activation","activated":46,"elapsedMs":1329}
{"harness":"gemini","phase":"complete","ok":true,"profile":"activation","activated":46,"elapsedMs":24376}
```

**gemini-offline.mjs bug found+fixed (Gemini's own fixed .gemini/skills/ convention)**

```text
error before fix: "ENOENT: no such file or directory, scandir '/workspace/.gemini/portable-skills'" ; debug-find showed the CLI had actually installed all 46 under /workspace/.gemini/skills/<id>/SKILL.md regardless of source dir name; fixed by adding an optional skillsDirName param to validateSkillTree(), passed as 'skills' only for that one Gemini-managed-location check
```

**Grok debug log: name collision with pre-existing Claude-cache synthex entry**

```text
scope precedence plugin_name=synthex winner=/Users/ajbrown/.claude/plugins/marketplaces/lumenai/plugins/synthex ... plugin discovered name=synthex scope=user root=/Users/ajbrown/.claude/plugins/marketplaces/lumenai/plugins/synthex skills=1 ... ; grok -p probe reply: "NONE" ; no skills_discovery line for any 'synthex' skill (old or new tree)
```

**Vitest Layer 1, post-fix**

```text
Test Files  148 passed (148)
     Tests  4282 passed | 5 skipped (4287)
```

### Plan updates applied

- Task 5 row + criteria (`**Result:**`, status unchanged); Task 21 row (sub-items: (a) OpenCode `opencode.json` `skills.paths` or accept the gap per Q6; (b) Grok re-test without the Claude-cache `synthex` collision); Task 21 criteria (flip `claude-offline.mjs` to expect 0, sweep three prose leftovers, OpenCode/Grok `[H]` checks); new Q7. README wording folded into the Task 21 OpenCode sub-item.

### Unknowns

- Whether an `opencode.json` `skills.paths: ["portable-skills"]` entry actually restores OpenCode discovery — not tested (the compat suite ships no opencode.json).
- Whether Grok's `.grok-plugin/plugin.json` skills field is honored for live discovery at all without a competing same-named Claude-marketplace plugin — confounded by the collision.
- Whether Grok v1.0.40 headless projects plugin-provided skills (vs personal `~/.claude/skills/*`) into a session's skill list at all — `skills_discovery` only fired for personal-scope files, for any plugin.
- Byte/token cost of the wrapper descriptions on Gemini/Codex/OpenCode system prompts was not re-measured (out of scope).

### Artifacts

- `$SCRATCH/worktrees/feature/task5-portable-skills-spike` (branch `feature/task5-portable-skills-spike`, commit `af67de4`, not merged); `$SCRATCH/spikes/task5/` (24 logs)

## Task 6 — OQ-2: command `description:` vs Codex skill migration (FR-HM14)

### Question

OQ-2 (FR-HM14): Does adding a frontmatter `description:` to a Synthex command make Codex's install-time commands/*.md → skill migration create duplicate skills next to the generated `skills/*/SKILL.md` wrappers, and does this happen on the pinned 0.154.0 as well as the local 0.156.1?

### Method

Repo untouched. Plugin copies with a `description:` on `star.md`, on `dismiss-upgrade-nudge.md` (3,017 B), and on a 140 B synthetic command; `spike.mjs` (mirrors `codex-activation.mjs`): local marketplace → `codex plugin add` → app-server `skills/list` → walk `$CODEX_HOME/plugins` for `SKILL.md` → remove. Local 0.156.1 (throwaway HOME/CODEX_HOME) and pinned 0.154.0 in the compat container. Read the codex-rs migration sources at rust-v0.154.0 / rust-v0.156.1 / main (byte-identical). No model calls.

### Result

**Verdict:** confirmed

Duplicates DO appear, identically on 0.154.0 and 0.156.1, when a command has a frontmatter `description:`, its rendered skill is ≤ 4,000 B, and its body has no `$ARGUMENTS`/`$N`/`{{…}}`/`` !` ``/`@token`. Counts (`skills/list` synthex:* / SKILL.md on disk): pristine 46/46; star.md+description 46/46 — only because star.md (4,392 B) exceeds `MAX_MIGRATED_COMMAND_SKILL_BYTES = 4_000` and is skipped silently; dismiss-upgrade-nudge.md+description 47/47 (`synthex:source-command-dismiss-upgrade-nudge` under `.codex-plugin/migrated-command-skills/`); tiny synthetic command 47/47. `store.rs` runs `migrate_plugin_commands` on every install unless a root Agent-Plugins `plugin.json` exists (Synthex has none). 1 of 18 commands is under the cap today; the prompt diet will add more. User Codex state unchanged.

### Decision

Commands stay description-free (D15 resolved: no command `description:`). Codex wrapper descriptions come from a generator-side description table in plugins/synthex/scripts/generate-codex-skills.mjs (Task 19); Task 28 adds `description:` to agents only, and agent wrappers source their description from that agent frontmatter. Add a Layer-1 guard that fails if any commands/*.md frontmatter contains `description:`, because Codex silently migrates any described command whose rendered skill is ≤ 4,000 bytes (the pending prompt diet makes more commands eligible). Task 19's Codex compat baseline must assert the skills/list count equals the wrapper count (46 today) so a migrated `source-command-*` duplicate is caught.

### Fallback taken

Taken: commands stay description-free; wrapper descriptions from a generator-side `COMMAND_DESCRIPTIONS` table (Task 19); `description:` on agents only (Task 28).

### Evidence

**logs/24-local-0.156.1-desc-small.jsonl (codex-cli 0.156.1, description on dismiss-upgrade-nudge.md)**

```text
"label": "desc-small", "version": "codex-cli 0.156.1", "totalSkills": 53, "synthexCount": 47, "skillMdOnDiskCount": 47, "skillMdOutsideSkillsDir": [".../plugins/cache/spike-desc-small/synthex/1.3.0/.codex-plugin/migrated-command-skills/source-command-dismiss-upgrade-nudge/SKILL.md"] — extra names: ['synthex:dismiss-upgrade-nudge', 'synthex:source-command-dismiss-upgrade-nudge']
```

**logs/31-container-0.154.0-desc-small.jsonl (pinned codex-cli 0.154.0 in compat container)**

```text
"label": "desc-small", "version": "codex-cli 0.154.0", "totalSkills": 53, "synthexCount": 47, "skillMdOnDiskCount": 47, "skillMdOutsideSkillsDir": ["/home/synthex-test/.codex/plugins/cache/spike-desc-small/synthex/1.3.0/.codex-plugin/migrated-command-skills/source-command-dismiss-upgrade-nudge/SKILL.md"] — extra names: ['synthex:dismiss-upgrade-nudge', 'synthex:source-command-dismiss-upgrade-nudge']
```

**logs/20-local-0.156.1-{pristine,desc}.jsonl and logs/30-container-0.154.0-{pristine,desc}.jsonl (star.md variant per task spec)**

```text
pristine 0.156.1: synthexCount 46, skillMdOnDiskCount 46; desc(star) 0.156.1: synthexCount 46, skillMdOnDiskCount 46; pristine 0.154.0: synthexCount 46; desc(star) 0.154.0: synthexCount 46. starRelated in every run = exactly one entry, name "synthex:star", path .../skills/star/SKILL.md. logs/25-local-0.156.1-desc-dump.jsonl: migratedDir None (the .codex-plugin/migrated-command-skills dir was never created for star.md).
```

**logs/25-local-0.156.1-desc-small-dump.jsonl — content of the migrated duplicate**

```text
---
name: "source-command-dismiss-upgrade-nudge"
description: "Spike OQ-2 probe - dismiss the upgrade nudge"
---

# source-command-dismiss-upgrade-nudge

Use this skill when the user asks to run the migrated source command `dismiss-upgrade-nudge`.

## Command Template

# Dismiss Synthex Upgrade Nudge

Silence the synthex SessionStart upgrade nudge for this project...
```

**src/main-command_migration_plugin.rs (byte-identical at rust-v0.154.0 and rust-v0.156.1; cmp output in shell log)**

```text
const PLUGIN_COMMANDS_DIR: &str = "commands";
const MAX_MIGRATED_COMMAND_SKILL_BYTES: usize = 4_000;
...
const PLUGIN_MIGRATION_PROFILE: CommandMigrationProfile = CommandMigrationProfile::new(
    PLUGIN_REWRITE_PROFILE,
    CommandDescriptionMode::RequireFrontmatter,
);
pub(crate) fn migrate_plugin_commands(plugin_root: &Path) -> io::Result<()> {
    ...
    let target_skills = migrated_command_skills_root(&absolute_plugin_root);
    ...
    import_command_sources(plugin_command_sources(plugin_root)?, &target_skills, PLUGIN_MIGRATION_PROFILE, CommandSkillSizeLimit::MaxBytes(MAX_MIGRATED_COMMAND_SKILL_BYTES))?;
```

**src/main-command_migration.rs lines 165-169 and 416-426 (silent skip gates)**

```text
if let CommandSkillSizeLimit::MaxBytes(max_bytes) = size_limit
    && rendered.len() > max_bytes
{
    continue;
}
...
fn has_unsupported_command_template_features(template: &str) -> bool {
    template.contains("$ARGUMENTS")
        || contains_numbered_argument_placeholder(template)
        || (template.contains("{{") && template.contains("}}"))
        || template.contains("!`")
        || template.contains("! `")
        || template.split_whitespace().any(|token| token.strip_prefix('@').is_some_and(|rest| !rest.is_empty()))
```

**src/rust-v0.154.0-store.rs lines 690-697 (identical in rust-v0.156.1-store.rs) — when migration runs**

```text
let is_agent_plugin = fs::read_to_string(staged_version_root.join("plugin.json"))
    .ok()
    .is_some_and(|contents| {
        agent_plugin_schema_status(&contents) == AgentPluginSchemaStatus::Supported
    });
if !is_agent_plugin && let Err(err) = migrate_plugin_commands(&staged_version_root) {
    tracing::warn!(%err, "failed to migrate plugin commands into skills");
}
```

**src/0.154.0-utils_plugins_src_lib.rs lines 44-53 (output location)**

```text
const PLUGIN_METADATA_DIR: &str = ".codex-plugin";
/// Directory containing commands converted into skills during plugin installation.
const MIGRATED_COMMAND_SKILLS_DIR: &str = "migrated-command-skills";
pub fn migrated_command_skills_root(plugin_root: &AbsolutePathBuf) -> AbsolutePathBuf {
    plugin_root.join(PLUGIN_METADATA_DIR).join(MIGRATED_COMMAND_SKILLS_DIR)
}
```

**Command byte sizes (wc -c plugins/synthex/commands/*.md)**

```text
3017 dismiss-upgrade-nudge.md
4328 write-adr.md
4392 star.md
4679 list-loops.md
4766 cancel-loop.md
5330 retrospective.md ... 28709 write-implementation-plan.md — only dismiss-upgrade-nudge.md is under the 4,000-byte cap today.
```

**User Codex state unchanged (logs/00-plugin-list-before.txt vs logs/51-plugin-list-final.txt; logs/03-user-config-toml-before.txt vs ~/.codex/config.toml)**

```text
PLUGIN LIST IDENTICAL
CONFIG IDENTICAL
PLUGINS DIR IDENTICAL — user's real install remains `synthex@lumenai  installed, enabled  1.3.0`; all spike installs used throwaway HOME/CODEX_HOME dirs and were removed with `codex plugin remove` + `codex plugin marketplace remove` (status 0 in every jsonl log).
```

### Plan updates applied

- Task 6 criteria (result appended, status unchanged); D15 (no command `description:`); Task 19 row + criteria (`COMMAND_DESCRIPTIONS` table; `[T]` no command `description:`, no `source-command-` in the Codex baseline); Task 28 row + criteria (`description:` on agents only, sourced from agent frontmatter).

### Unknowns

- Install route: all runs used `codex plugin add` from a local-path marketplace (plus the `.claude-plugin/marketplace.json` route on 0.156.1); the user's real `git` marketplace source was not exercised offline. `store.rs` puts the migration in the shared `replace_plugin_root_atomically` path, so it should apply equally — inferred from source, not observed.
- Model behaviour not tested: whether Codex prefers the migrated `source-command-*` skill over the wrapper for `$dismiss-upgrade-nudge`, or how the duplicate affects the 8,000-char skills-catalog budget beyond one extra line.
- The 4,000-byte cap applies to the rendered skill (header + rewritten body), so the source-file threshold is slightly lower; not binary-searched. The `@token` gate skips commands containing e.g. `@CLAUDE.md` even if small — commands that lose it in the prompt diet become eligible.
- Counts came from `codex plugin add --json` and app-server `skills/list`; the interactive TUI `/skills` picker was not checked.

### Artifacts

- `$SCRATCH/spikes/task6/` (`spike.mjs`, plugin copy variants, `logs/`, `src/`); Docker image `synthex-compat-codex:spike-0.154.0`. No repo files modified.

## Task 7 — OQ-3/OQ-4: Haiku 4.5 `effort:` and command `effort:` (FR-HM14, FR-HM17)

### Question

OQ-3: does Claude Haiku 4.5 accept the effort parameter (agent frontmatter `effort:` and CLI `--effort`)? OQ-4: does slash-command frontmatter honor `effort:`?

### Method

Claude Code 2.1.281 headless, throwaway project: agents `haiku-low` (`effort: low`), `haiku-high`, `sonnet-low` (control); command `lowcmd` (`effort: low`, `model: haiku`). Runs once each: `claude -p --model claude-haiku-4-5-20251001 --effort low|xhigh`, Sonnet 5 `--effort low`, the three sub-agent runs (sonnet-low under a parent `--effort high`), `/lowcmd`, and a `CLAUDE_EFFORT` echo probe on Haiku and Sonnet 5. Transcripts parsed with `parse.mjs` for `effort`/`perTurnEffort`; plus `claude --help`, `strings` on the binary, and the sub-agents / slash-commands / model-config docs.

### Result

**Verdict:** partial

OQ-3 REFUTED: Haiku 4.5 silently ignores effort on 2.1.281. `--effort low` / `xhigh` both exit 0 with "OK", but the transcript records have no `effort` key (`hasEffortKey:false`); the Sonnet 5 control records `"effort":"low"`. Thinking tokens 35 vs 24: noise. `CLAUDE_EFFORT`: Haiku `EFFORT=unset`, Sonnet 5 `EFFORT=low`. Sub-agents: haiku-low / haiku-high carry no `effort` key; sonnet-low records `"effort":"low"` under a `high` parent, so agent `effort:` is honored on Sonnet 5 and dropped on Haiku. The model-config table omits Haiku. No warning is ever surfaced. OQ-4 CONFIRMED: `/lowcmd` gives `"effort":"low","perTurnEffort":"low"` vs `medium` without a command. Side observation (one run): the command's `model: haiku` was NOT applied headless (turn ran on Opus 5.5).

### Decision

D15 fallback fires for OQ-3 only: no `effort:` on Haiku-backed utilities (it is a silent no-op), and FR-HM17 refuters run on Sonnet 5 (`model: sonnet`) at `effort: low`, which the sub-agent control proved is honored and visible in the transcript. OQ-4 passes: a command-level `effort:` key may ship on Claude Code, with the caveat that it only takes effect on models in the effort table (never Haiku). Do not rely on command-frontmatter `model:` in headless runs until the side observation is re-checked.

### Fallback taken

Taken for OQ-3 only: no `effort:` on Haiku utilities; FR-HM17 refuters on Sonnet 5 (`model: sonnet`) at `effort: low`. OQ-4: command `effort:` may ship (D15).

### Evidence

**Haiku CLI --effort low, transcript assistant record (fc3364d4)**

```text
assistant: {"model":"claude-haiku-4-5-20251001","perTurnEffort":null,"hasEffortKey":false,"keys":["perTurnEffort"],"thinking_tokens":35,"output_tokens":42,"content_types":["text"]}  (stderr empty, exit 0, result "OK")
```

**Haiku CLI --effort xhigh, transcript assistant record (4757fddd)**

```text
assistant: {"model":"claude-haiku-4-5-20251001","perTurnEffort":null,"hasEffortKey":false,"keys":["perTurnEffort"],"thinking_tokens":24,"output_tokens":31,"content_types":["text"]}  (stderr empty, exit 0, result "OK")
```

**Sonnet 5 CLI --effort low control, raw transcript line 23 (25061ec2)**

```text
"type":"assistant","uuid":"8322f3bd-ff87-4ef5-beb6-6fadb5c327f5","timestamp":"2026-09-24T12:11:03.045Z","effort":"low","perTurnEffort":null,"userType":"external","entrypoint":"sdk-cli"
```

**CLAUDE_EFFORT env probe (logs/env-haiku-low.json vs env-sonnet5-low.json)**

```text
Haiku 4.5 --effort low: {"result":"EFFORT=unset","models":["claude-haiku-4-5-20251001"],"err":false,"turns":3}
Sonnet 5 --effort low: {"result":"EFFORT=low","models":["claude-sonnet-5"],"err":false,"turns":2}
```

**haiku-low sub-agent transcript (1f463bcb/subagents/agent-a50c551b4d7719e17.jsonl); haiku-high identical shape**

```text
assistant: {"model":"claude-haiku-4-5-20251001","perTurnEffort":null,"agentId":"a50c551b4d7719e17","hasEffortKey":false,"keys":["perTurnEffort"],"thinking_tokens":231,"output_tokens":238,"content_types":["text"]}  meta: {"agentType":"haiku-low","description":"Reply OK","spawnDepth":1}
```

**sonnet-low sub-agent control (parent --effort high), 4b23e0f3/subagents/agent-aa8ebd0242a8cfc2f.jsonl**

```text
parent: assistant: {"model":"claude-sonnet-5","effort":"high","perTurnEffort":null,...}
sub-agent: assistant: {"model":"claude-sonnet-5","effort":"low","perTurnEffort":null,"agentId":"aa8ebd0242a8cfc2f","hasEffortKey":true,"keys":["effort","perTurnEffort"],"thinking_tokens":0,"output_tokens":4,"content_types":["text"]}
```

**/lowcmd (effort: low, model: haiku) raw transcript line 24 (c99d5827)**

```text
"requestId":"req_011CfNF3BBoqCLFb3JipBecV","attributionSkill":"lowcmd","type":"assistant","uuid":"a545d85b-fe12-4f99-9c2b-0ce8ca50a5b5","timestamp":"2026-09-24T12:12:00.404Z","advisorModel":"claude-opus-5-5","effort":"low","perTurnEffort":"low"  — message.model was claude-opus-5-5; line 14 attachment: {"type":"command_permissions","allowedTools":[],"model":"claude-haiku-4-5-20251001"}
```

**Baseline without a command, same project (1f463bcb, b3decf81 parents)**

```text
"advisorModel":"claude-opus-5-5","effort":"medium","perTurnEffort":"medium","userType":"external","entrypoint":"sdk-cli"
```

**claude --help (2.1.281), logs/help.txt line 81**

```text
--effort <level>                      Effort level for the current session (low, medium, high, xhigh, max)   [no per-model note]
```

**Binary strings, 2.1.281 (logs/binary-effort-context.txt)**

```text
'Active effort level for the current turn (e.g., "low", "medium", "high", "xhigh", "max"), after any silent downgrade for the selected model. Also exposed to hook commands and Bash as the CLAUDE_EFFORT env var.' ... 'Present for hooks that fire within a tool-use context ... on a model that supports the effort parameter; absent for session-lifecycle hooks and models without ef[fort support]' ... '[effort] model ${h.model} rejected output_config.effort; latching unsupported and retrying without it.' ... supportsEffort/supportedEffortLevels per model
```

**code.claude.com/docs/en/model-config, Adjust effort level**

```text
"The available effort levels depend on the model. Models not listed here do not support effort:" table rows: Fable 5.1/5 (low..max); Opus 5.5, Opus 5, Sonnet 5, Opus 4.8, Opus 4.7 (low..max); Opus 4.6 and Sonnet 4.6 (low, medium, high, max). Haiku is not listed. "If you set a level the active model does not support, Claude Code falls back to the highest supported level at or below the one you set."
```

**code.claude.com/docs/en/sub-agents frontmatter table**

```text
| `effort` | No | Effort level when this subagent is active. Overrides the session effort level. Default: inherits from session. Options: `low`, `medium`, `high`, `xhigh`, `max`; available levels depend on the model |
```

**code.claude.com/docs/en/slash-commands frontmatter table**

```text
| `effort` | No | Effort level when this skill is active. Overrides the session effort level. Default: inherits from session. Options: `low`, `medium`, `high`, `xhigh`, `max`; available levels depend on the model. |
```

### Plan updates applied

- Task 7 row (`**Result:**`, status unchanged); Task 30 row (no `effort:` on Haiku utilities); Task 58 row (refuters on Sonnet 5 at `effort: low`); D15 (command `effort:` ships on effort-table models only; command `model:` not relied on headless until re-checked).

### Unknowns

- Raw API request bodies are not logged, so whether Claude Code omits `output_config.effort` for Haiku up front or sends it and latches on rejection (the binary has both paths) is inferred; the observable outcome is the same: no effort applied, no error surfaced.
- Each configuration ran once with a trivial prompt; thinking-token counts cannot show a directional effect. The transcript `effort` key and `CLAUDE_EFFORT` are the evidence.
- Command `effort:` was verified only with the session on Opus 5.5 headless; not interactively, not with `context: fork`, not on Sonnet 5 (docs and the binary's per-model gate imply the same).
- Side observation needing its own check: `/lowcmd` frontmatter `model: haiku` did not switch the model headless (one run; out of scope).
- The sub-agent and `/lowcmd` runs used the default parent model (Opus 5.5); spend ≈ $1.30 across 9 sessions.

### Artifacts

- `$SCRATCH/spikes/task7/logs/` (CLI JSON, transcripts, env probes, binary strings, fixtures) and `parse.mjs`. Temp project deleted after archiving; no repo files changed.

## Task 8 — OQ-7: Hermes Agent install shape (FR-HM45)

**Verdict:** partial (discovery and install shape confirmed; runtime `skill_view` behaviour static-only). **Fallback fired:** no (the "whole tree + path rewrite" shape is the confirmed shape, not a fallback).

### Question
Does `hermes skills list` see skills under a project's `.agents/skills/`? Can the wrapper's `../../commands/<x>.md` link be followed, or must the whole plugin tree ship? Does Skills Guard flag Synthex files?

### Method
Hermes Agent v0.20.4 (2026.8.18), Python 3.11.16, install dir `~/.hermes/hermes-agent`. Temp project `$SCRATCH/spikes/task8/projA` (git-initialised) with the full `plugins/synthex` tree copied to `.agents/synthex/` and `.agents/skills` symlinked to `.agents/synthex/portable-skills` so each wrapper's `../../commands/<x>.md` resolves (`test -f` confirmed). Commands, each with `timeout` and stdin from `/dev/null`: `hermes skills list` before and after `hermes skills trust`; `hermes skills list --source local`; `hermes skills install --help`; `hermes skills inspect review-code`; a one-shot `hermes -z` against the locally configured Ollama provider (`ollama-launch`, `127.0.0.1:11434`). Source inspection of `tools/skill_utils.py`, `tools/skills_tool.py`, and `tools/skills_guard.py`; scan cache at `~/.hermes/cache/project_skill_scans/`. A whole-tree Skills Guard scan of `plugins/synthex` was run by the earlier (stalled) agent and its log reused.

### Result
1. **Discovery is gated on trust.** Before `hermes skills trust`, `hermes skills list` shows only builtin/profile skills. After trust: "46 project skill(s) will load in sessions started inside this repo (they take precedence over same-named profile skills)". `--source local` then lists all 46 wrappers (review-code, next-priority, architect, tech-lead, star all present). Trust is per git checkout and recorded in `skills.trusted_project_dirs`; non-interactive sessions inherit it.
2. **Per-skill local install is impossible.** `hermes skills install` takes only a registry identifier or an HTTPS URL to a SKILL.md; there is no local-path form. The whole plugin tree must be placed in the project, with `.agents/skills` pointing at the wrapper directory.
3. **Skills Guard applies to project skills at load, fail-closed.** `is_quarantined_project_skill()` quarantines any project skill whose scan verdict is `dangerous`; the scan cache shows all 46 wrapper folders as `safe` (0 dangerous). The whole-tree scan of `plugins/synthex` is `dangerous` (97 findings: 47 path_traversal, 30 agent_config_mod for `CLAUDE.md` references, 2 curl-pipe-shell in the Ollama adapter, unpinned npm/pip installs, AWS-dir access in the Bedrock adapter). Those findings live in `commands/` and `agents/`, which are **not** inside any skill folder in the symlink layout, so nothing is quarantined. Nesting the canonical files inside `.agents/skills/` would quarantine them.
4. **`skill_view` cannot follow `../../`.** `skill_view(name, path)` rejects any `..` component ("Path traversal ('..') is not allowed") and validates within the skill directory. The relative link in the wrapper must be followed with the general `read_file` tool against the resolved path. Project-tier skill dirs are added to the trusted set, so no "outside trusted skills directory" warning fires for them.
5. **The `portable-skills/` rename is neutral for Hermes**: it reads `.agents/skills/` regardless of the source directory name.
6. Live one-shot: timed out after 170 s with no output (local 120B model cold start); not repeated.

### Decision
Hermes install shape: copy the whole plugin tree to `<project>/.agents/synthex/`, symlink `<project>/.agents/skills` to `.agents/synthex/portable-skills`, never nest `commands/` or `agents/` inside a skill folder, and run `hermes skills trust` once per checkout. The Hermes wrapper text (Task 19 host row) must say "follow the `../../commands/` link with `read_file`; `skill_view` cannot read it". Compat adapter (Task 65): install mode `project-agent-skills` with that layout plus `hermes skills trust <fixture>`, inventory via `hermes skills list --source local` expecting 46 `local` rows, and an assertion that `$HERMES_HOME/cache/project_skill_scans/` holds 46 `safe` verdicts.

### Evidence
```
$ hermes skills trust
Trusted: .../spikes/task8/projA
46 project skill(s) will load in sessions started inside this repo (they take precedence over same-named profile skills).
```
```
$ hermes skills install --help
positional arguments:
  identifier           Skill identifier (e.g. openai/skills/skill-creator) or
                       a direct HTTP(S) URL to a SKILL.md file
```
```
tools/skill_utils.py
def is_quarantined_project_skill(skill_md) -> bool:
    """True when a project skill's scan verdict is ``dangerous``.
    Fail-closed: a scanner crash or missing scanner quarantines the skill
```
```
~/.hermes/cache/project_skill_scans/  → verdict counts: {'safe': 46}
```
```
tools/skills_tool.py:947-949
        if has_traversal_component(file_path):
            {"success": False, "error": "Path traversal ('..') is not allowed."}
```
```
06-guard-scan-main.log
WHOLE-TREE verdict=dangerous findings=97 :: synthex: dangerous — 97 finding(s) in exfiltration, network, persistence, structural, supply_chain, traversal
SUMMARY {"safe": 75, "caution": 1, "dangerous": 17}
```

### Unknowns
- Runtime behaviour of a real Hermes session following the wrapper (which tool the model picks, whether it loops) was not observed; the one-shot timed out on a cold local model.
- Hermes v0.21.4 (2026-09-21) was not tested; the local install is v0.20.4.
- Whether `hermes skills list` in a non-git directory finds project skills (find_project_root requires `.git`).

### Artifacts
`$SCRATCH/spikes/task8/` logs 00–15 (help output, discovery and quarantine source excerpts, guard scan, list before/after trust, one-shot). Temp project removed and its trust entry revoked after the spike. No repo files were changed.


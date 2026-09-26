/**
 * Build-time host data table (decision D9, docs/plans/harness-modernization.md).
 *
 * This is the single source of truth for the six harnesses Synthex targets
 * and how each one's tools relate to Claude Code's native tool names, per
 * the FR-HM12 table in docs/reqs/harness-modernization.md. Nothing in this
 * repo imports it yet -- Task 19 wires it into the generator so the tool
 * table in every wrapper is emitted verbatim from here instead of being
 * hand-copied prose (FR-HM12's "single constant" acceptance criterion).
 *
 * Scope note (FR-HM40): this module is build-time tooling, not a runtime
 * script, so it is excluded from the portable-script contract (bash or
 * `#!/usr/bin/env node`, no `python`, etc.) the same way the wrapper
 * generator itself is.
 */

/**
 * Claude Code's native tool names that every host entry below must map,
 * taken directly from the FR-HM12 table: the four tools/tool-groups that
 * get translated per host, plus the seven tools every non-Claude host skips
 * the step for (Workflow, Artifact, ScheduleWakeup, PushNotification,
 * ReportFindings, SendMessage, ListAgents).
 *
 * `Read`/`Edit`/`Write` and `Agent`/`Task` are listed as separate tool
 * names (rather than the PRD table's grouped "Read / Edit / Write" and
 * "Agent / Task" row labels) so every Claude tool name a wrapper might
 * reference has its own, independently checkable map entry.
 */
export const CLAUDE_TOOL_NAMES = Object.freeze([
  'Read',
  'Edit',
  'Write',
  'Bash',
  'Agent',
  'Task',
  'AskUserQuestion',
  'Workflow',
  'Artifact',
  'ScheduleWakeup',
  'PushNotification',
  'ReportFindings',
  'SendMessage',
  'ListAgents',
]);

/** The seven Claude tools every non-Claude host skips the step for (FR-HM12). */
export const SKIP_LIST_TOOL_NAMES = Object.freeze([
  'Workflow',
  'Artifact',
  'ScheduleWakeup',
  'PushNotification',
  'ReportFindings',
  'SendMessage',
  'ListAgents',
]);

const SKIP_THE_STEP = 'skip the step';

/**
 * Per-host tool-name map, one entry per `CLAUDE_TOOL_NAMES` name. Values are
 * copied verbatim from the FR-HM12 table cells (a shared value across a
 * grouped row, e.g. "Read / Edit / Write" or the skip-list row, is repeated
 * for each individual tool name in that group).
 *
 * @param {Record<string, string>} map
 * @returns {Readonly<Record<string, string>>}
 */
function toolMap(map) {
  for (const name of CLAUDE_TOOL_NAMES) {
    if (!(name in map)) {
      throw new Error(`host-matrix.mjs: missing tool map entry for "${name}"`);
    }
  }
  return Object.freeze({ ...map });
}

function skipListEntries(value) {
  return Object.fromEntries(SKIP_LIST_TOOL_NAMES.map((name) => [name, value]));
}

/**
 * The six harnesses Synthex targets, keyed by host id, in the order the
 * PRD and implementation plan introduce them (D9, D14, D27, FR-HM45).
 *
 * Each entry:
 * - `id` / `displayName`: stable identifier and prose name for docs/wrappers.
 * - `toolMap`: Claude tool name -> this host's closest tool (or translation
 *   instruction), one entry per `CLAUDE_TOOL_NAMES`, verbatim from FR-HM12.
 * - `gapMessages`: placeholder for the single-sourced documented-gap
 *   sentence (FR-HM24 / D11) printed by `start-review-team`,
 *   `stop-review-team`, and `list-teams` when a tool is absent. Populated by
 *   Task 47; left `null` until then.
 * - `hookAllowlist`: placeholder for this host's hook allowlist (Task 46,
 *   D25 -- e.g. Codex's generated `hooks/codex-hooks.json`, commit-lint
 *   only, Codex matcher). Populated by Task 46; left `null` until then.
 */
export const HOSTS = Object.freeze({
  claude: Object.freeze({
    id: 'claude',
    displayName: 'Claude Code',
    // Claude Code is the source of these tool names; no translation needed.
    toolMap: toolMap({
      Read: 'Read',
      Edit: 'Edit',
      Write: 'Write',
      Bash: 'Bash',
      Agent: 'Agent',
      Task: 'Task',
      AskUserQuestion: 'AskUserQuestion',
      ...skipListEntries('native; never skipped on Claude Code'),
    }),
    // TODO(Task 47, D11): populate GAP_MESSAGES once FR-HM24 lands.
    gapMessages: null,
    // TODO(Task 46, D25): populate the hook allowlist once Task 46 lands.
    hookAllowlist: null,
  }),

  codex: Object.freeze({
    id: 'codex',
    displayName: 'Codex CLI',
    toolMap: toolMap({
      Read: 'read',
      Edit: 'apply_patch',
      Write: 'write',
      Bash: 'shell',
      Agent: 'spawn_agent + wait_agent',
      Task: 'spawn_agent + wait_agent',
      AskUserQuestion:
        'request_user_input (plan mode only), else ask in chat and end the turn',
      ...skipListEntries(SKIP_THE_STEP),
    }),
    // TODO(Task 47, D11): populate GAP_MESSAGES once FR-HM24 lands.
    gapMessages: null,
    // TODO(Task 46, D25): populate the hook allowlist once Task 46 lands.
    hookAllowlist: null,
  }),

  gemini: Object.freeze({
    id: 'gemini',
    displayName: 'Gemini CLI',
    toolMap: toolMap({
      Read: 'read_file',
      Edit: 'replace',
      Write: 'write_file',
      Bash: 'run_shell_command',
      Agent: 'subagent tool, else activate_skill',
      Task: 'subagent tool, else activate_skill',
      AskUserQuestion: 'ask_user (denied headless)',
      ...skipListEntries(SKIP_THE_STEP),
    }),
    // TODO(Task 47, D11): populate GAP_MESSAGES once FR-HM24 lands.
    gapMessages: null,
    // TODO(Task 46, D25): populate the hook allowlist once Task 46 lands.
    hookAllowlist: null,
  }),

  opencode: Object.freeze({
    id: 'opencode',
    displayName: 'OpenCode',
    toolMap: toolMap({
      Read: 'read',
      Edit: 'edit',
      Write: 'write',
      Bash: 'bash',
      Agent: 'task',
      Task: 'task',
      AskUserQuestion: 'question (denied headless)',
      ...skipListEntries(SKIP_THE_STEP),
    }),
    // TODO(Task 47, D11): populate GAP_MESSAGES once FR-HM24 lands.
    gapMessages: null,
    // TODO(Task 46, D25): populate the hook allowlist once Task 46 lands.
    hookAllowlist: null,
  }),

  grok: Object.freeze({
    id: 'grok',
    displayName: 'Grok Build',
    toolMap: toolMap({
      Read: 'Read',
      Edit: 'search_replace',
      Write: 'Write',
      Bash: 'run_terminal_command',
      Agent: 'spawn_subagent / task',
      Task: 'spawn_subagent / task',
      AskUserQuestion: 'ask_user_question if listed, else ask in chat',
      ...skipListEntries(`${SKIP_THE_STEP}; never use Grok's /workflow`),
    }),
    // TODO(Task 47, D11): populate GAP_MESSAGES once FR-HM24 lands.
    gapMessages: null,
    // TODO(Task 46, D25): populate the hook allowlist once Task 46 lands.
    hookAllowlist: null,
  }),

  hermes: Object.freeze({
    id: 'hermes',
    displayName: 'Hermes Agent',
    toolMap: toolMap({
      Read: 'read_file',
      Edit: 'patch',
      Write: 'write_file',
      Bash: 'terminal',
      Agent: 'delegate_task',
      Task: 'delegate_task',
      AskUserQuestion: 'clarify (unsafe headless)',
      ...skipListEntries(SKIP_THE_STEP),
    }),
    // TODO(Task 47, D11): populate GAP_MESSAGES once FR-HM24 lands.
    gapMessages: null,
    // TODO(Task 46, D25): populate the hook allowlist once Task 46 lands.
    hookAllowlist: null,
  }),
});

/** Host ids in matrix declaration order. */
export const HOST_IDS = Object.freeze(Object.keys(HOSTS));

/**
 * The two FR-HM12 rules every wrapper renders as their own numbered steps,
 * verbatim, immediately after the tool-map table (Task 20). Single-sourced
 * here so `generate-codex-skills.mjs` never hand-copies the prose.
 */
export const RULE_SKIP_UNAVAILABLE_TOOL =
  'If a named tool does not exist, skip that step once and continue; never retry it.';
export const RULE_ADOPT_INLINE =
  'If the host refuses a nested subagent, adopt the role inline: read the `agents/` file and perform it in this session.';

/**
 * Task 8 finding (spikes.md): Hermes's `skill_view` tool rejects any `..`
 * path component, so the wrapper's own `../../commands/` or `../../agents/`
 * canonical-file link (step 1) cannot be opened with `skill_view` and must
 * be followed with the general `read_file` tool instead. Rendered once
 * into every wrapper's step 4 (cheap, a single sentence) and again under
 * the table in the shared `docs/tool-map.md` (see
 * `generate-codex-skills.mjs`), rather than duplicated into the Hermes
 * table cell for every one of the five translated tool rows.
 */
export const HERMES_READ_FILE_NOTE =
  "On Hermes, follow this file's canonical-source link (step 1) with `read_file`, not `skill_view`: `skill_view` rejects `..` path components.";

/**
 * Renders the FR-HM12 tool-name map as a Markdown table: one column per
 * non-Claude host (Claude Code is the source of these tool names and needs
 * no translation, so it is excluded) and one row per grouped Claude-tool
 * label from the PRD table (`docs/reqs/harness-modernization.md`). This is
 * the single source `generate-codex-skills.mjs` renders into the shared
 * `docs/tool-map.md` that every wrapper's step 4 points at (Task 20;
 * embedding the table directly in all 46 wrappers overflowed a stdout
 * truncation limit in the OpenCode compat harness, see that generator's
 * comment); `tests/schemas/wrapper-catalog.test.ts` asserts
 * `docs/tool-map.md` contains this exact table.
 *
 * @returns {string} the table, as Markdown, with no leading/trailing blank lines.
 */
export function renderToolMapTable() {
  const hosts = HOST_IDS.filter((id) => id !== 'claude').map((id) => HOSTS[id]);

  function groupedAgentTask(host) {
    if (host.toolMap.Agent !== host.toolMap.Task) {
      throw new Error(
        `host-matrix.mjs: host "${host.id}" has different Agent and Task tool map values; the rendered table groups them into one row and requires them to match`,
      );
    }
    return host.toolMap.Agent;
  }

  const header = `| Claude tool | ${hosts.map((host) => host.displayName).join(' | ')} |`;
  const divider = `|${'---|'.repeat(hosts.length + 1)}`;
  const readEditWriteRow = `| Read / Edit / Write | ${hosts
    .map((host) => [host.toolMap.Read, host.toolMap.Edit, host.toolMap.Write].join(', '))
    .join(' | ')} |`;
  const bashRow = `| Bash | ${hosts.map((host) => host.toolMap.Bash).join(' | ')} |`;
  const agentTaskRow = `| Agent / Task | ${hosts.map(groupedAgentTask).join(' | ')} |`;
  const askUserQuestionRow = `| AskUserQuestion | ${hosts
    .map((host) => host.toolMap.AskUserQuestion)
    .join(' | ')} |`;
  const skipListRow = `| ${SKIP_LIST_TOOL_NAMES.join(', ')} | ${hosts
    .map((host) => host.toolMap[SKIP_LIST_TOOL_NAMES[0]])
    .join(' | ')} |`;

  return [header, divider, readEditWriteRow, bashRow, agentTaskRow, askUserQuestionRow, skipListRow].join(
    '\n',
  );
}

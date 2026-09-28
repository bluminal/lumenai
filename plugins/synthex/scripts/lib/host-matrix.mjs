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
 * FR-HM24/FR-HM25 (D11): the single-sourced, neutral documented-gap
 * sentence `start-review-team`, `stop-review-team`, and `list-teams` print
 * verbatim instead of running when `SendMessage` and `ListAgents` are not
 * both in the caller's tool list. One sentence, no line breaks, so it reads
 * correctly both printed standalone in a terminal and dropped into a table
 * cell (a future per-host gap-inventory table, FR-HM25 Task 52). Every
 * host entry below points at this same object; Task 52 is where per-host
 * phrasing (if any) would be layered on. `.ladderFallback` was added by
 * Task 49 (FR-HM21) alongside `.pool` -- it is not a hard gate like
 * `.pool` (nothing aborts), it is the neutral, single-sourced sentence
 * `review-code`/`performance-audit` may surface when the FR-HM21
 * capability ladder falls all the way to level 4 (sequential reviewers)
 * for lack of a fan-out tool, so the fallback is documented rather than
 * silent.
 */
export const GAP_MESSAGES = Object.freeze({
  pool: 'Standing review pools require Agent Teams (the SendMessage and ListAgents tools); this host does not expose them, so pool commands are unavailable here -- use /synthex:review-code or /synthex:performance-audit for sequential review instead.',
  ladderFallback: 'No parallel-subagent tool (Agent, Task, task, spawn_agent, or delegate_task) is in your tool list, so reviewers run sequentially instead of fanned out in one turn -- see the capability ladder in docs/standing-pool-routing.md.',
});

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
 * - `gapMessages`: the single-sourced documented-gap sentence object
 *   (FR-HM24 / D11, `GAP_MESSAGES` above) printed verbatim by
 *   `start-review-team`, `stop-review-team`, and `list-teams` when
 *   `SendMessage`/`ListAgents` are not both in the caller's tool list.
 *   Populated (Task 47); every host points at the same shared object.
 * - `headless`: FR-HM41 / FR-HM18 headless recipe (Task 35): the approval
 *   flag a headless run needs so state writes succeed, the host's shell-call
 *   ceiling in seconds, the `SYNTHEX_LOOP_IDLE_MAX` each host should export
 *   (ceiling minus a margin), the hint `loop-step.sh check-writable` prints
 *   under `$SYNTHEX_HOST`, and Grok's background-poll guidance (null where
 *   the in-turn wait is the only option). Rendered by the generator into
 *   `docs/hosts.md` and runtime `config/hosts.env` (D9).
 * - `hookAllowlist`: this host's hook allowlist (Task 46, D25/FR-HM27).
 *   `null` means the host gets no generated hook manifest at all (Claude
 *   Code's own `hooks/hooks.json` is hand-authored, not generated from
 *   here; the other four hosts have no hook support Synthex targets yet).
 *   Codex is the only non-null entry: `{ matcher, events }` where
 *   `matcher` is this host's Bash-equivalent tool name (i.e. `toolMap.Bash`
 *   above, repeated here as a plain string so `generate-codex-skills.mjs`
 *   does not need to re-derive it) and `events` lists the PreToolUse-style
 *   event names this host actually gets (commit-lint only -- never `Stop`,
 *   `SessionStart`, `TaskCompleted`, or `TeammateIdle`, so Codex never
 *   inherits the native-looping Stop gate).
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
    // FR-HM24/FR-HM25 (D11): populated -- see GAP_MESSAGES above.
    gapMessages: GAP_MESSAGES,
    // TODO(Task 46, D25): populate the hook allowlist once Task 46 lands.
    hookAllowlist: null,
    // FR-HM41 / FR-HM18 headless recipe (Task 35). Source: PRD FR-HM18 (600 s Bash ceiling); loop-idle-wait.sh default 540 s.
    headless: Object.freeze({
      approvalFlag: '`--dangerously-skip-permissions` (or `--permission-mode bypassPermissions`)',
      shellCapSeconds: 600,
      idleMaxSeconds: 540,
      writabilityHint: 'Claude Code: run with `--dangerously-skip-permissions` (or allow Write and Bash in settings) and check the sandbox\'s writable roots.',
      backgroundPoll: null,
    }),
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
    // FR-HM24/FR-HM25 (D11): populated -- see GAP_MESSAGES above.
    gapMessages: GAP_MESSAGES,
    // D25/FR-HM27: commit-lint only, matcher = this host's own Bash tool
    // name (toolMap.Bash above). Rendered into hooks/codex-hooks.json by
    // generate-codex-skills.mjs; never Stop/SessionStart/TaskCompleted/
    // TeammateIdle.
    hookAllowlist: Object.freeze({
      matcher: 'shell',
      events: Object.freeze(['PreToolUse']),
    }),
    // FR-HM41 / FR-HM18 headless recipe (Task 35). Source: PRD FR-HM32 recipe; PRD §1 'two to five minutes' shell cap (120 s lower bound assumed).
    headless: Object.freeze({
      approvalFlag: '`codex exec --sandbox workspace-write -a never`',
      shellCapSeconds: 120,
      idleMaxSeconds: 90,
      writabilityHint: 'Codex: run `codex exec --sandbox workspace-write -a never`; the default `read-only` sandbox blocks state writes.',
      backgroundPoll: null,
    }),
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
    // FR-HM24/FR-HM25 (D11): populated -- see GAP_MESSAGES above.
    gapMessages: GAP_MESSAGES,
    // TODO(Task 46, D25): populate the hook allowlist once Task 46 lands.
    hookAllowlist: null,
    // FR-HM41 / FR-HM18 headless recipe (Task 35). Source: PRD FR-HM32 recipe; PRD FR-HM18 'Gemini CLI at most 240 s (5-minute hard cap)'.
    headless: Object.freeze({
      approvalFlag: '`--approval-mode yolo` (headless `default` denies writes)',
      shellCapSeconds: 300,
      idleMaxSeconds: 240,
      writabilityHint: 'Gemini CLI: run with `--approval-mode yolo` or a policy file that allows `write_file` and `run_shell_command`.',
      backgroundPoll: null,
    }),
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
    // FR-HM24/FR-HM25 (D11): populated -- see GAP_MESSAGES above.
    gapMessages: GAP_MESSAGES,
    // TODO(Task 46, D25): populate the hook allowlist once Task 46 lands.
    hookAllowlist: null,
    // FR-HM41 / FR-HM18 headless recipe (Task 35). Source: PRD FR-HM32 recipe; PRD FR-HM18 'Grok Build and OpenCode at most 90 s (120 s default)'.
    headless: Object.freeze({
      approvalFlag: '`opencode run --command <slug> --auto` (`run` without `--auto` is read-only)',
      shellCapSeconds: 120,
      idleMaxSeconds: 90,
      writabilityHint: 'OpenCode: run `opencode run --command <slug> --auto`; `run` without `--auto` cannot write state.',
      backgroundPoll: null,
    }),
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
    // FR-HM24/FR-HM25 (D11): populated -- see GAP_MESSAGES above.
    gapMessages: GAP_MESSAGES,
    // TODO(Task 46, D25): populate the hook allowlist once Task 46 lands.
    hookAllowlist: null,
    // FR-HM41 / FR-HM18 headless recipe (Task 35). Source: PRD FR-HM32 recipe; PRD FR-HM18 90 s / 120 s default and background-poll bullet.
    headless: Object.freeze({
      approvalFlag: '`grok -p ... --yolo --max-turns N` (never `/loop` or `scheduler_create`)',
      shellCapSeconds: 120,
      idleMaxSeconds: 90,
      writabilityHint: 'Grok Build: run `grok -p "/synthex:..." --yolo`; never `/loop` or `scheduler_create` (detached depth-1 subagents).',
      backgroundPoll: 'Run the idle wait with `background: true` and poll `get_command_or_subagent_output` (up to one hour) instead of a foreground sleep.',
    }),
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
    // FR-HM24/FR-HM25 (D11): populated -- see GAP_MESSAGES above.
    gapMessages: GAP_MESSAGES,
    // TODO(Task 46, D25): populate the hook allowlist once Task 46 lands.
    hookAllowlist: null,
    // FR-HM41 / FR-HM18 headless recipe (Task 35). Source: PRD FR-HM32 recipe and spikes.md Task 8; PRD FR-HM18 'Hermes no cap known' (Claude values reused).
    headless: Object.freeze({
      approvalFlag: '`hermes -z "/<slug> ..."` after `hermes skills trust`; wrap in `timeout` (headless `clarify` hangs)',
      shellCapSeconds: 600,
      idleMaxSeconds: 540,
      writabilityHint: 'Hermes: run from a trusted, writable project (`hermes skills trust`); Skills Guard quarantines untrusted trees.',
      backgroundPoll: null,
    }),
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

/**
 * Task 35 (FR-HM41, FR-HM18): the headless recipe table rendered into the
 * shared `docs/hosts.md` (one row per host, Claude Code included) that every
 * wrapper's SYNTHEX_HOST step and `/synthex:schedule` (Task 62) point at.
 *
 * @returns {string} the table, as Markdown, with no leading/trailing blank lines.
 */
export function renderHostsTable() {
  const rows = HOST_IDS.map((id) => {
    const h = HOSTS[id];
    const poll = h.headless.backgroundPoll ?? 'in-turn wait only';
    return `| ${h.displayName} (\`${id}\`) | ${h.headless.approvalFlag} | ${h.headless.shellCapSeconds} | ${h.headless.idleMaxSeconds} | ${poll} |`;
  });
  return [
    '| Host (`SYNTHEX_HOST`) | Headless approval flag | Shell-call cap (s) | `SYNTHEX_LOOP_IDLE_MAX` | Idle wait |',
    '|------|------------------------|--------------------|-------------------------|-----------|',
    ...rows,
  ].join('\n');
}

/** Upper-snake env-var stem for a host id (`opencode` -> `OPENCODE`). */
function envStem(id) {
  return id.toUpperCase().replace(/-/g, '_');
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Task 35 (FR-HM41): the POSIX-sh-sourceable `config/hosts.env` that
 * `loop-step.sh check-writable` reads at runtime to print a host-specific
 * hint for `$SYNTHEX_HOST` (or every host's hint when it is unset). Values
 * never contain tabs or newlines (asserted here) because
 * `SYNTHEX_HOST_HINTS` is a tab-separated `id<TAB>hint` list, one per line,
 * that the script walks with plain `read`.
 *
 * @returns {string} file contents, trailing newline included.
 */
export function renderHostsEnv() {
  const lines = [
    '# Generated by scripts/generate-codex-skills.mjs; do not edit.',
    '# Source: scripts/lib/host-matrix.mjs (Task 35, FR-HM41 / FR-HM18). POSIX sh; source it.',
    `SYNTHEX_HOST_IDS=${shQuote(HOST_IDS.join(' '))}`,
  ];
  const hintLines = [];
  for (const id of HOST_IDS) {
    const h = HOSTS[id];
    for (const [key, value] of Object.entries(h.headless)) {
      if (typeof value === 'string' && /[\t\n]/.test(value)) {
        throw new Error(`host "${id}" headless.${key} must not contain tabs or newlines`);
      }
    }
    const stem = envStem(id);
    lines.push(
      `SYNTHEX_HOST_${stem}_NAME=${shQuote(h.displayName)}`,
      `SYNTHEX_HOST_${stem}_APPROVAL_FLAG=${shQuote(h.headless.approvalFlag)}`,
      `SYNTHEX_HOST_${stem}_SHELL_CAP=${h.headless.shellCapSeconds}`,
      `SYNTHEX_HOST_${stem}_IDLE_MAX=${h.headless.idleMaxSeconds}`,
      `SYNTHEX_HOST_${stem}_HINT=${shQuote(h.headless.writabilityHint)}`,
    );
    hintLines.push(`${id}\t${h.headless.writabilityHint}`);
  }
  lines.push(`SYNTHEX_HOST_HINTS=${shQuote(hintLines.join('\n'))}`);
  return `${lines.join('\n')}\n`;
}

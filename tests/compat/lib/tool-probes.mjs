// Task 23 (NFR-HM4, FR-HM7, FR-HM12; D22): tool-BEHAVIOR probes for the
// authenticated canary profile.
//
// The loopback offline/activation scenarios only assert request-side facts
// (D22: "Loopback emits no tool calls") — the canned providers in
// loopback-*.mjs never emit a tool call, so a claim like "the host attempted
// an unavailable tool at most once" or "the host read a file instead of
// assuming context was injected" can only be checked against a real
// provider. These two probes run only from codex-canary.mjs and
// opencode-canary.mjs, gated the same way as the existing representative
// token probes (credential-gated, main-only, budget-capped).
//
// Probe (a) WORKFLOW_STEP_PROBE_ID — FR-HM12 skip-once rule.
//   The prompt is a Synthex-style tool-presence gate naming a tool
//   (`Workflow`) that exists on neither host, phrased like the generated
//   wrapper's own rule (plugins/synthex/portable-skills/*/SKILL.md step 5:
//   "If a named tool does not exist, skip that step once and continue;
//   never retry it.") combined with the FR-HM3 gate wording asserted by
//   tests/schemas/tool-presence-gates.test.ts ("if a `<Tool>` is in your
//   tool list, do A; otherwise do B"). It passes when the host attempts the
//   nonexistent tool AT MOST ONCE (skip-once, no retry).
//
// Probe (b) NO_INJECTED_CONTEXT_PROBE_ID — FR-HM7.
//   Codex always injects AGENTS.md (Task 15), so a project with no
//   host-injected instruction file at all isn't reachable there. Both
//   scenarios instead stage a project whose ONLY instruction files are
//   GEMINI.md and .hermes.md — files neither Codex nor OpenCode inject —
//   and send the canonical FR-HM7 sentence (the same READ_SENTENCE text
//   asserted by tests/schemas/portability-prose.test.ts). It passes when
//   the model issues a tool call reading one of those two files, rather
//   than claiming the context was already injected.
//
// "Attempt" is host-specific and defined precisely here, because there is
// no shared schema between Codex's app-server `item/completed` stream and
// OpenCode's `--format json` event stream:
//
//   - Codex: one item in the captured item stream whose shape is a
//     tool/function invocation (see CODEX_TOOL_CALL_ITEM_TYPES below, or an
//     `error` item reporting an unrecognized tool) that names the probed
//     tool. See countCodexToolAttempts.
//   - OpenCode: one JSON event from the `--format json` stream (or, if the
//     captured output is not line-delimited JSON, one text match) that
//     reports a tool the run could not execute — an event carrying a
//     `tool` field, or a `type`/`event` naming "tool" — combined with an
//     unavailability status word ("not found", "unavailable", "unknown",
//     "no such") and the probed tool's name. See countOpenCodeToolAttempts.
//
// Both counters are best-effort pattern matches authored against this
// repo's existing Codex/OpenCode captures (Tasks 6, 19, 21) and public
// CLI docs, not a live capture: no SYNTHEX_COMPAT_*_API_KEY was available
// when this module was written. tests/fixtures/compat-canary/ records the
// authored pass/violation transcripts this module is unit-tested against
// (tests/schemas/compat-canary-tool-probes.test.ts); the first
// authenticated canary run on main is the live confirmation of the exact
// item/event shapes.

export const WORKFLOW_STEP_PROBE_ID = 'workflow-step-gate';
export const NO_INJECTED_CONTEXT_PROBE_ID = 'no-injected-context';
export const LEVEL3_FANOUT_PROBE_ID = 'level3-fanout-gate';
export const TOOL_PROBE_IDS = [
  WORKFLOW_STEP_PROBE_ID,
  NO_INJECTED_CONTEXT_PROBE_ID,
  LEVEL3_FANOUT_PROBE_ID,
];

export const WORKFLOW_STEP_PROBE_TOKEN = 'SYNTHEX_COMPAT_CANARY_TOOL_WORKFLOW_STEP';
export const NO_INJECTED_CONTEXT_PROBE_TOKEN = 'SYNTHEX_COMPAT_CANARY_TOOL_NO_INJECTED_CONTEXT';
export const LEVEL3_FANOUT_PROBE_TOKEN = 'SYNTHEX_COMPAT_CANARY_TOOL_LEVEL3_FANOUT';

/** The tool named in the workflow-step probe; it exists on neither host. */
export const PROBED_TOOL_NAME = 'Workflow';

/**
 * FR-HM21 level 3's candidate parallel-subagent tool names, in the order
 * the requirement lists them (docs/reqs/harness-modernization.md ("Else if
 * the host can spawn parallel subagents (a tool named `Agent`, `Task`,
 * `task`, `spawn_agent`, or `delegate_task` is present)").
 */
export const LEVEL3_FANOUT_TOOL_NAMES = ['Agent', 'Task', 'task', 'spawn_agent', 'delegate_task'];

/**
 * The single candidate name each canary host is actually expected to call
 * for level 3, per docs/reqs/harness-modernization.md 5.3's per-harness
 * notes ("Codex CLI. Native multi-agent (`spawn_agent`...)"; "OpenCode.
 * Native `task` subagents..."). Unlike PROBED_TOOL_NAME (a tool that
 * exists on neither host), these tools are expected to actually be present
 * and callable.
 */
export const LEVEL3_FANOUT_HOST_TOOL = Object.freeze({ codex: 'spawn_agent', opencode: 'task' });

/**
 * The two instruction filenames neither Codex nor OpenCode auto-inject
 * (Task 15/FR-HM7): Codex injects AGENTS.md, OpenCode injects none of the
 * four but is not exercised by the "no injection at all" gap the way Codex
 * is, so the probe project intentionally omits AGENTS.md/CLAUDE.md too and
 * ships only these two, exactly as Task 23's brief specifies.
 */
export const INJECTED_CONTEXT_CANDIDATE_FILES = ['GEMINI.md', '.hermes.md'];

/** The canonical FR-HM7 sentence (tests/schemas/portability-prose.test.ts). */
const READ_SENTENCE =
  'If the host did not already inject the project instruction file into ' +
  'your context, Read the first of `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, ' +
  '`.hermes.md` that exists at the repository root.';

export function workflowStepProbePrompt(token = WORKFLOW_STEP_PROBE_TOKEN) {
  return [
    'This is a Synthex-style workflow step under a compatibility test.',
    'If a tool named `Workflow` is in your tool list, call it now to record this step; otherwise, skip this step once and continue — do not retry it.',
    `Compatibility test mode: after that, reply with exactly \`${token}\` and stop.`,
  ].join('\n');
}

export function noInjectedContextProbePrompt(token = NO_INJECTED_CONTEXT_PROBE_TOKEN) {
  return [
    READ_SENTENCE,
    `Compatibility test mode: after reading it, reply with exactly \`${token}\` and stop.`,
  ].join('\n');
}

/**
 * Task 49 (FR-HM21, D22): probe (c) LEVEL3_FANOUT_PROBE_ID — the capability
 * ladder's level 3. Phrased the same way as the FR-HM21 ladder step itself
 * ("if a tool named `Agent`, `Task`, `task`, `spawn_agent`, or
 * `delegate_task` is in your tool list... otherwise...") so this probe
 * exercises the exact gate `review-code`/`performance-audit` prose uses. It
 * passes when the host attempts one of those tools AT LEAST once — the
 * inverse of the workflow-step probe's skip-once assertion, since here the
 * tool genuinely exists and level 3 requires it be used, not skipped.
 */
export function level3FanoutProbePrompt(token = LEVEL3_FANOUT_PROBE_TOKEN) {
  return [
    'This is a Synthex-style capability-ladder step under a compatibility test (FR-HM21 level 3).',
    'If a tool named `Agent`, `Task`, `task`, `spawn_agent`, or `delegate_task` is in your tool list, call it now to fan out one trivial no-op subagent task and wait for it to complete; otherwise, note that this host cannot fan out subagents and perform the step inline.',
    `Compatibility test mode: after that, reply with exactly \`${token}\` and stop.`,
  ].join('\n');
}

function toolNamePattern(toolName) {
  const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`);
}

// ---------------------------------------------------------------------------
// Codex: app-server `item/completed` stream (tests/compat/lib/codex-app-server.mjs)
// ---------------------------------------------------------------------------

const CODEX_TOOL_CALL_ITEM_TYPES = new Set([
  'mcp_tool_call',
  'function_call',
  'tool_call',
  'command_execution',
]);

const CODEX_UNKNOWN_TOOL_PATTERN = /unknown tool|no such tool|tool not found/i;

const CODEX_FILE_READ_ITEM_TYPES = new Set([
  'file_read',
  'command_execution',
  'mcp_tool_call',
]);

/**
 * Counts items in a captured Codex app-server item stream that are an
 * "attempt" to call `toolName`: an item whose type is tool/function-call
 * shaped (CODEX_TOOL_CALL_ITEM_TYPES), or an `error` item reporting an
 * unrecognized tool, that names `toolName` anywhere in its serialized form.
 *
 * @param {unknown[]} items - the `items` array captured per turn by
 *   activateCodexSkills/runCodexProbeTurns (tests/compat/lib/codex-app-server.mjs).
 * @param {string} [toolName]
 * @returns {number}
 */
export function countCodexToolAttempts(items, toolName = PROBED_TOOL_NAME) {
  const pattern = toolNamePattern(toolName);
  let count = 0;
  for (const item of items ?? []) {
    if (!item || typeof item !== 'object') continue;
    const type = item.type ?? item.item_type ?? '';
    const serialized = JSON.stringify(item);
    const isUnknownToolError = type === 'error' && CODEX_UNKNOWN_TOOL_PATTERN.test(serialized);
    const isToolCallShaped = CODEX_TOOL_CALL_ITEM_TYPES.has(type) || isUnknownToolError;
    if (!isToolCallShaped) continue;
    if (pattern.test(serialized)) count += 1;
  }
  return count;
}

/**
 * Finds the first of `files` that a captured Codex item stream shows being
 * read (a file-read-shaped item — CODEX_FILE_READ_ITEM_TYPES — whose
 * serialized form names the file), as opposed to merely being mentioned in
 * assistant prose (e.g. the model claiming the file was already injected).
 *
 * @param {unknown[]} items
 * @param {string[]} [files]
 * @returns {string | null} the file read, or null if none was.
 */
export function codexReadInjectedContextFile(items, files = INJECTED_CONTEXT_CANDIDATE_FILES) {
  for (const item of items ?? []) {
    if (!item || typeof item !== 'object') continue;
    const type = item.type ?? item.item_type ?? '';
    if (!CODEX_FILE_READ_ITEM_TYPES.has(type)) continue;
    const serialized = JSON.stringify(item);
    const match = files.find((file) => serialized.includes(file));
    if (match) return match;
  }
  return null;
}

/**
 * Task 49 (FR-HM21 level 3): counts items in a captured Codex app-server
 * item stream that are a successful (or attempted) call to one of
 * `toolNames` — any tool/function-call-shaped item (CODEX_TOOL_CALL_ITEM_TYPES)
 * naming one of the candidates. Unlike countCodexToolAttempts this does not
 * also match an `error` item, because level 3's tool genuinely exists and
 * the probe expects it to succeed, not be rejected.
 *
 * @param {unknown[]} items
 * @param {string[]} [toolNames]
 * @returns {number}
 */
export function countCodexFanoutAttempts(items, toolNames = LEVEL3_FANOUT_TOOL_NAMES) {
  let count = 0;
  for (const item of items ?? []) {
    if (!item || typeof item !== 'object') continue;
    const type = item.type ?? item.item_type ?? '';
    if (!CODEX_TOOL_CALL_ITEM_TYPES.has(type)) continue;
    const serialized = JSON.stringify(item);
    if (toolNames.some((name) => toolNamePattern(name).test(serialized))) count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// OpenCode: `opencode run --format json` captured stdout/stderr
// ---------------------------------------------------------------------------

const OPENCODE_UNAVAILABLE_STATUS_PATTERN = /(not found|unavailable|unknown|no such)/i;

function hasOpenCodeToolShape(event) {
  if (!event || typeof event !== 'object') return false;
  if ('tool' in event) return true;
  const type = String(event.type ?? event.event ?? '');
  return /tool/i.test(type);
}

/**
 * `opencode run --format json` streams one JSON value per line. Lines that
 * are not valid JSON (banner/status text some builds interleave) are
 * dropped rather than failing the parse, mirroring parseLastJsonLine's
 * tolerance in scenario-helpers.mjs.
 *
 * @param {string} output
 * @returns {unknown[]}
 */
function extractOpenCodeEvents(output) {
  const events = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // Not a JSON event line — ignored here; countOpenCodeToolAttempts and
      // opencodeReadInjectedContextFile fall back to raw-text matching when
      // no line parses as JSON at all.
    }
  }
  return events;
}

/**
 * Counts OpenCode "unavailable tool" error events naming `toolName`: a
 * captured JSON event that is tool-shaped (hasOpenCodeToolShape) and whose
 * serialized form contains both an unavailability status word and
 * `toolName`. Falls back to a bounded-window text match when the captured
 * output has no parseable JSON event lines at all.
 *
 * @param {string} output - combined stdout+stderr from the `opencode run` process.
 * @param {string} [toolName]
 * @returns {number}
 */
export function countOpenCodeToolAttempts(output, toolName = PROBED_TOOL_NAME) {
  const pattern = toolNamePattern(toolName);
  const events = extractOpenCodeEvents(output);
  if (events.length > 0) {
    let count = 0;
    for (const event of events) {
      if (!hasOpenCodeToolShape(event)) continue;
      const serialized = JSON.stringify(event);
      if (OPENCODE_UNAVAILABLE_STATUS_PATTERN.test(serialized) && pattern.test(serialized)) {
        count += 1;
      }
    }
    return count;
  }
  const escapedTool = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forward = output.match(
    new RegExp(`tool[^\\n]{0,60}${escapedTool}[^\\n]{0,60}(?:not found|unavailable|unknown|no such)`, 'gi'),
  );
  return forward ? forward.length : 0;
}

/**
 * Task 49 (FR-HM21 level 3): counts tool-shaped OpenCode events naming one
 * of `toolNames`, with NO unavailability-status requirement — unlike
 * countOpenCodeToolAttempts, level 3's tool genuinely exists and the probe
 * expects a successful call, not a rejection. Falls back to a bounded-window
 * text match (no unavailability word required) when the captured output has
 * no parseable JSON event lines at all.
 *
 * @param {string} output - combined stdout+stderr from the `opencode run` process.
 * @param {string[]} [toolNames]
 * @returns {number}
 */
export function countOpenCodeFanoutAttempts(output, toolNames = LEVEL3_FANOUT_TOOL_NAMES) {
  const events = extractOpenCodeEvents(output);
  if (events.length > 0) {
    let count = 0;
    for (const event of events) {
      if (!hasOpenCodeToolShape(event)) continue;
      const serialized = JSON.stringify(event);
      if (toolNames.some((name) => toolNamePattern(name).test(serialized))) count += 1;
    }
    return count;
  }
  let count = 0;
  for (const name of toolNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = output.match(new RegExp(`tool[^\\n]{0,60}${escaped}`, 'gi'));
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Finds the first of `files` that captured OpenCode output shows being
 * read: a tool-shaped JSON event naming the file, or (falling back, when no
 * line parses as JSON) a read-verb appearing near the filename in raw text.
 *
 * @param {string} output
 * @param {string[]} [files]
 * @returns {string | null}
 */
export function opencodeReadInjectedContextFile(output, files = INJECTED_CONTEXT_CANDIDATE_FILES) {
  const events = extractOpenCodeEvents(output);
  if (events.length > 0) {
    for (const event of events) {
      if (!hasOpenCodeToolShape(event)) continue;
      const serialized = JSON.stringify(event);
      const match = files.find((file) => serialized.includes(file));
      if (match) return match;
    }
    return null;
  }
  for (const file of files) {
    const escapedFile = file.replace('.', '\\.');
    const pattern = new RegExp(`(read|cat|open)[^\\n]{0,60}${escapedFile}`, 'i');
    if (pattern.test(output)) return file;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/**
 * Asserts the skip-once rule (FR-HM12): the unavailable `Workflow` tool was
 * attempted at most once (attempted zero times is also acceptable — the
 * probe only rules out a retry).
 */
export function assertToolAttemptedAtMostOnce({ harness, id, attempts, toolName = PROBED_TOOL_NAME }) {
  if (attempts > 1) {
    throw new Error(
      `${harness} canary ${id}: expected the unavailable \`${toolName}\` tool to be ` +
        `attempted at most once (skip-once, no retry), observed ${attempts} attempts`,
    );
  }
}

/** Asserts FR-HM7: the model read one of the injected-context candidate files. */
export function assertInjectedContextFileRead({ harness, id, file }) {
  if (!file) {
    throw new Error(
      `${harness} canary ${id}: expected a Read of one of ` +
        `${INJECTED_CONTEXT_CANDIDATE_FILES.join(', ')}, none was observed`,
    );
  }
}

/**
 * Task 49 (FR-HM21 level 3): asserts the inverse of the skip-once rule —
 * one of the parallel-subagent tools was attempted AT LEAST once. Level 3
 * exists precisely because the tool is genuinely available; a probe run
 * that never calls it means the host fell through to level 4 (sequential)
 * even though a fan-out tool was in its tool list, which is the ladder
 * misbehaving, not a documented gap.
 */
export function assertToolAttemptedAtLeastOnce({
  harness,
  id,
  attempts,
  toolNames = LEVEL3_FANOUT_TOOL_NAMES,
}) {
  if (attempts < 1) {
    throw new Error(
      `${harness} canary ${id}: expected one of the parallel-subagent tools ` +
        `(${toolNames.join(', ')}) to be attempted at least once, observed ${attempts} attempts`,
    );
  }
}

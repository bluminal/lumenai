import { readExpectedEntrypoints } from './contract.mjs';

/**
 * Single source of truth for Synthex's command/agent/wrapper counts.
 *
 * These are explicit constants rather than a value computed at import time
 * from `readExpectedEntrypoints()`. Per implementation plan decision D2
 * (docs/plans/harness-modernization.md), the inventory changes across six
 * phases (18/28/46 -> 18/23/41 -> 22/26/48 -> 24/26/50), and every count
 * assertion in the test suite must import from here so that adding or
 * removing a command/agent only requires updating this one file. Because
 * the constants are explicit (not derived), a stale value here would
 * silently diverge from `plugins/synthex/.claude-plugin/plugin.json` --
 * use `diffInventoryAgainstManifest()` in a test to catch that drift.
 */
// Task 47 (FR-HM24, D11) folded 4 pool-management commands
// (configure-teams, start-review-team, stop-review-team, list-teams) in
// from synthex-plus, taking the count from 18 to 22 (Phase 6 target
// 22/26/48 per D2/D5).
export const COMMAND_COUNT = 22;
// Phase 5 retired four utility agents: context-bundle-assembler (Task 41,
// replaced by scripts/assemble-bundle.sh), audit-artifact-writer (Task 42,
// replaced by scripts/write-audit.mjs), plan-scribe (Task 44, FR-HM26 --
// the PM now writes and edits the plan in place), commit-message-author
// (Task 46, FR-HM27, replaced by a one-sentence rule plus
// scripts/commit-lint.sh), and plan-linter (Task 45, FR-HM26, replaced by
// scripts/lint-plan.mjs), dropping 28 to 23. Task 47 (FR-HM24, D11) then
// folded in 3 pool agents (standing-pool-cleanup, standing-pool-submitter,
// team-orchestrator-bridge) from synthex-plus, taking 23 to 26.
// multi-model-review Task 68 added grok-review-prompter, taking 26 to 27.
export const AGENT_COUNT = 27;

/** Wrappers = every generated portable skill, one per command + agent. */
export const WRAPPER_COUNT = COMMAND_COUNT + AGENT_COUNT;

/**
 * Cross-checks the constants above against the live manifest by way of
 * `readExpectedEntrypoints()` (the same reader the compat scenario files
 * use). Returns an array of human-readable mismatch descriptions; an empty
 * array means the constants are in sync with the manifest.
 *
 * @param {string} pluginRoot - absolute path to `plugins/synthex`.
 * @returns {string[]}
 */
export function diffInventoryAgainstManifest(pluginRoot) {
  const entries = readExpectedEntrypoints(pluginRoot);
  const actualCommands = entries.filter(({ kind }) => kind === 'command').length;
  const actualAgents = entries.filter(({ kind }) => kind === 'agent').length;
  const actualWrappers = entries.length;

  const mismatches = [];

  if (actualCommands !== COMMAND_COUNT) {
    mismatches.push(
      `commands: inventory.mjs says ${COMMAND_COUNT}, manifest has ${actualCommands}`,
    );
  }
  if (actualAgents !== AGENT_COUNT) {
    mismatches.push(
      `agents: inventory.mjs says ${AGENT_COUNT}, manifest has ${actualAgents}`,
    );
  }
  if (actualWrappers !== WRAPPER_COUNT) {
    mismatches.push(
      `wrappers: inventory.mjs says ${WRAPPER_COUNT}, manifest has ${actualWrappers}`,
    );
  }

  return mismatches;
}

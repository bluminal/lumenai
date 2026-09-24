/**
 * Layer 1: Structural tests for the host-matrix.mjs scaffold
 * (Phase 1, Milestone 1.1, Task 4c; D9, FR-HM12, FR-HM14, NFR-HM5).
 *
 * `plugins/synthex/scripts/lib/host-matrix.mjs` is a build-time-only data
 * module (D9): a single constant table of the six harnesses Synthex
 * targets, keyed by host id, carrying the FR-HM12 Claude-tool-name map per
 * host plus placeholders for GAP_MESSAGES (Task 47, D11) and hook
 * allowlists (Task 46, D25). Task 19 wires it into the generator; nothing
 * in this repo imports it yet, so this test only checks the module loads
 * and is internally consistent.
 *
 * Plan: docs/plans/harness-modernization.md, Phase 1 / Milestone 1.1 / Task 4c.
 */

import { describe, it, expect } from 'vitest';
import {
  CLAUDE_TOOL_NAMES,
  HOSTS,
  HOST_IDS,
  SKIP_LIST_TOOL_NAMES,
} from '../../plugins/synthex/scripts/lib/host-matrix.mjs';

const EXPECTED_HOST_IDS = ['claude', 'codex', 'gemini', 'opencode', 'grok', 'hermes'];

// The four translated tool names/groups plus the seven skip-list tools from
// the FR-HM12 table in docs/reqs/harness-modernization.md.
const EXPECTED_CLAUDE_TOOL_NAMES = [
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
];

describe('host-matrix.mjs scaffold', () => {
  it('loads and exports the matrix', () => {
    expect(HOSTS).toBeTruthy();
    expect(typeof HOSTS).toBe('object');
  });

  it('lists exactly the six supported hosts', () => {
    expect(HOST_IDS).toEqual(EXPECTED_HOST_IDS);
    expect(Object.keys(HOSTS)).toEqual(EXPECTED_HOST_IDS);
  });

  it('enumerates every Claude tool name from the FR-HM12 table', () => {
    expect([...CLAUDE_TOOL_NAMES].sort()).toEqual([...EXPECTED_CLAUDE_TOOL_NAMES].sort());
    expect(CLAUDE_TOOL_NAMES).toHaveLength(14);
  });

  it('has a tool map entry for every Claude tool name, for every host', () => {
    for (const hostId of EXPECTED_HOST_IDS) {
      const host = HOSTS[hostId];
      expect(host, `host-matrix.mjs is missing host "${hostId}"`).toBeTruthy();

      for (const toolName of CLAUDE_TOOL_NAMES) {
        expect(
          host.toolMap[toolName],
          `host "${hostId}" is missing a tool map entry for "${toolName}"`,
        ).toBeTruthy();
        expect(typeof host.toolMap[toolName]).toBe('string');
      }
    }
  });

  it('gives every host a display name and a stable id matching its key', () => {
    for (const [hostId, host] of Object.entries(HOSTS)) {
      expect(host.id).toBe(hostId);
      expect(typeof host.displayName).toBe('string');
      expect(host.displayName.length).toBeGreaterThan(0);
    }
  });

  it('carries verbatim FR-HM12 values for the translated (non-skip-list) tools', () => {
    expect(HOSTS.codex.toolMap.Read).toBe('read');
    expect(HOSTS.codex.toolMap.Edit).toBe('apply_patch');
    expect(HOSTS.codex.toolMap.Write).toBe('write');
    expect(HOSTS.codex.toolMap.Bash).toBe('shell');

    expect(HOSTS.gemini.toolMap.Read).toBe('read_file');
    expect(HOSTS.gemini.toolMap.Bash).toBe('run_shell_command');

    expect(HOSTS.opencode.toolMap.Bash).toBe('bash');
    expect(HOSTS.opencode.toolMap.Agent).toBe('task');
    expect(HOSTS.opencode.toolMap.Task).toBe('task');

    expect(HOSTS.grok.toolMap.Bash).toBe('run_terminal_command');
    expect(HOSTS.grok.toolMap.Write).toBe('Write');

    expect(HOSTS.hermes.toolMap.Bash).toBe('terminal');
    expect(HOSTS.hermes.toolMap.Agent).toBe('delegate_task');
  });

  it('gives every non-Claude host a "skip the step" instruction for the skip-list tools', () => {
    for (const hostId of EXPECTED_HOST_IDS.filter((id) => id !== 'claude')) {
      for (const toolName of SKIP_LIST_TOOL_NAMES) {
        expect(HOSTS[hostId].toolMap[toolName]).toMatch(/skip the step/);
      }
    }

    // Grok's skip-list cell carries the extra /workflow caution from FR-HM12.
    expect(HOSTS.grok.toolMap.Workflow).toContain("never use Grok's /workflow");
  });

  it('has GAP_MESSAGES and hook allowlist placeholders for every host, not wired up yet', () => {
    for (const host of Object.values(HOSTS)) {
      expect(host.gapMessages).toBeNull();
      expect(host.hookAllowlist).toBeNull();
    }
  });
});

/**
 * Task 50 (FR-HM23) port of tests/schemas/synthex-plus/hooks.test.ts's
 * "Real Plugin Validation" describe block, run against
 * plugins/synthex/hooks/hooks.json.
 *
 * The synthex-plus validator (tests/schemas/synthex-plus/hooks.ts) enforces
 * a "thin shim, <20 lines" contract (D5): the shell script is a stub and
 * all business logic lives in prose in a companion hooks/*.md file, read
 * and interpreted by an LLM. FR-HM23 inverts that for synthex: the shell
 * scripts now contain the real classification logic (see
 * scripts/task-completed-gate.sh and scripts/teammate-idle-gate.sh) and
 * hooks/*.md became short docs that describe the script rather than
 * defining behavior. Porting synthex-plus's hooks.ts unmodified would
 * therefore fail synthex's own (correctly longer) scripts on the line-count
 * guideline, so this file re-implements the structurally-relevant
 * assertions — hooks.json shape, registered events, script existence,
 * executability, shebang, and companion-doc existence — without the
 * thin-shim line-count check. Keeps synthex-plus's own hooks.test.ts (and
 * its D5 contract) passing unmodified.
 *
 * plugins/synthex/hooks/hooks.json uses Claude Code's native record-keyed
 * hook shape (event -> matcher blocks -> {type, command} entries), the same
 * shape tests/schemas/synthex-plus/hooks.test.ts's own "Real Plugin
 * Validation" block already parses directly for that reason.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';

const PLUGIN_ROOT = join(import.meta.dirname, '..', '..', 'plugins', 'synthex');
const HOOKS_DIR = join(PLUGIN_ROOT, 'hooks');
const HOOKS_JSON_PATH = join(HOOKS_DIR, 'hooks.json');
const SCRIPTS_DIR = join(PLUGIN_ROOT, 'scripts');

type HookEntry = { type: string; command: string };
type HooksJson = { hooks: Record<string, Array<{ matcher?: string; hooks: HookEntry[] }>> };

function loadHooksJson(): HooksJson {
  return JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf-8'));
}

function scriptPathFor(command: string): string {
  const relCommand = command.replace(/^\$\{CLAUDE_PLUGIN_ROOT\}\//, '');
  return join(PLUGIN_ROOT, relCommand);
}

describe('hooks/hooks.json (synthex) — structure (Task 50, FR-HM23)', () => {
  it('exists and is valid JSON', () => {
    const text = readFileSync(HOOKS_JSON_PATH, 'utf-8');
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('is a record keyed by event name, not a flat array (Claude Code native shape)', () => {
    const parsed = loadHooksJson();
    expect(parsed).toHaveProperty('hooks');
    expect(typeof parsed.hooks).toBe('object');
    expect(Array.isArray(parsed.hooks)).toBe(false);
  });

  it('registers TaskCompleted, TeammateIdle, SessionStart, Stop, and PreToolUse — no other events', () => {
    const parsed = loadHooksJson();
    const events = Object.keys(parsed.hooks).sort();
    expect(events).toEqual(['PreToolUse', 'SessionStart', 'Stop', 'TaskCompleted', 'TeammateIdle']);
  });

  it('every matcher block entry has type "command" and a non-empty command', () => {
    const parsed = loadHooksJson();
    for (const matcherBlocks of Object.values(parsed.hooks)) {
      expect(Array.isArray(matcherBlocks)).toBe(true);
      for (const block of matcherBlocks) {
        expect(Array.isArray(block.hooks)).toBe(true);
        for (const entry of block.hooks) {
          expect(entry.type).toBe('command');
          expect(typeof entry.command).toBe('string');
          expect(entry.command.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('TaskCompleted routes to scripts/task-completed-gate.sh', () => {
    const parsed = loadHooksJson();
    const commands = parsed.hooks.TaskCompleted.flatMap((b) => b.hooks.map((h) => h.command));
    expect(commands).toContain('${CLAUDE_PLUGIN_ROOT}/scripts/task-completed-gate.sh');
  });

  it('TeammateIdle routes to scripts/teammate-idle-gate.sh', () => {
    const parsed = loadHooksJson();
    const commands = parsed.hooks.TeammateIdle.flatMap((b) => b.hooks.map((h) => h.command));
    expect(commands).toContain('${CLAUDE_PLUGIN_ROOT}/scripts/teammate-idle-gate.sh');
  });

  it('every referenced script exists on disk', () => {
    const parsed = loadHooksJson();
    for (const matcherBlocks of Object.values(parsed.hooks)) {
      for (const block of matcherBlocks) {
        for (const entry of block.hooks) {
          const scriptPath = scriptPathFor(entry.command);
          expect(existsSync(scriptPath), `Script not found: ${scriptPath}`).toBe(true);
        }
      }
    }
  });
});

describe('TaskCompleted/TeammateIdle scripts — executability and shebang (Task 50, FR-HM23)', () => {
  const cases = [
    join(SCRIPTS_DIR, 'task-completed-gate.sh'),
    join(SCRIPTS_DIR, 'teammate-idle-gate.sh'),
  ];

  it.each(cases)('%s is executable with a bash/sh shebang', (scriptPath) => {
    expect(existsSync(scriptPath)).toBe(true);
    const mode = statSync(scriptPath).mode;
    expect((mode & 0o111) !== 0).toBe(true); // executable bit
    const firstLine = readFileSync(scriptPath, 'utf-8').split('\n')[0].trim();
    expect(['#!/bin/sh', '#!/bin/bash', '#!/usr/bin/env sh', '#!/usr/bin/env bash']).toContain(firstLine);
  });

  it.each(cases)('%s documents its exit codes in a header comment', (scriptPath) => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toMatch(/^#\s*Exit codes:\s*$/m);
  });

  it.each(cases)('%s has a companion markdown doc in hooks/', (scriptPath) => {
    const docPath = join(HOOKS_DIR, `${basename(scriptPath, '.sh')}.md`);
    expect(existsSync(docPath), `Companion doc not found: ${docPath}`).toBe(true);
  });

  it.each(cases)('%s is a real classification script, not a thin exit-0 shim (D5 inversion, FR-HM23)', (scriptPath) => {
    const content = readFileSync(scriptPath, 'utf-8');
    // The synthex-plus original shims are unconditional `exit 0` one-liners
    // with no branching; the synthex scripts must contain the config gate
    // and node-guarded classification logic.
    expect(content).toContain('command -v node');
    expect(content).toContain('config-get.sh');
    expect(content.split('\n').length).toBeGreaterThan(20);
  });
});

describe('companion docs — framed as script docs, not behavioral logic (Task 50, FR-HM23)', () => {
  const docs = [
    join(HOOKS_DIR, 'task-completed-gate.md'),
    join(HOOKS_DIR, 'teammate-idle-gate.md'),
  ];

  it.each(docs)('%s is dramatically smaller than the synthex-plus prose original', (docPath) => {
    const synthexPlusEquivalent = join(
      PLUGIN_ROOT, '..', 'synthex-plus', 'hooks', basename(docPath),
    );
    const synthexBytes = readFileSync(docPath, 'utf-8').length;
    const synthexPlusBytes = readFileSync(synthexPlusEquivalent, 'utf-8').length;
    expect(synthexBytes).toBeLessThan(synthexPlusBytes / 2);
  });

  it.each(docs)('%s names its real script entry point', (docPath) => {
    const content = readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/scripts\/(task-completed-gate|teammate-idle-gate)\.sh/);
  });

  it.each(docs)('%s documents both exit codes (0 and 2)', (docPath) => {
    const content = readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/\|\s*0\s*\|/);
    expect(content).toMatch(/\|\s*2\s*\|/);
  });
});

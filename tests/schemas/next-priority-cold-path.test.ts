/**
 * Task 59 (FR-HM19, D34): next-priority cold-path split and Claude-path budget.
 *
 * The Stage 1 loop protocol moved byte-identically (NFR-HM1) out of
 * `commands/next-priority.md` into the D17 cold-path doc
 * `docs/next-priority-loop.md`, behind the NP_SEL engine selector. The
 * Claude path (next-priority.md + docs/engines/loop-workflow.md) must be at
 * least 8,192 bytes smaller than the 26,426-byte pre-move baseline (AC2),
 * and the Stage 1 prose path must not exceed that baseline (NFR-HM3).
 *
 * `tests/fixtures/cold-path/next-priority-loop-premove.md` holds the four
 * moved blocks as they stood at bb20669, separated by SEP. The only change
 * the move may make is the one pinned substitution S1 in the last block.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const PLUGIN = join(ROOT, 'plugins', 'synthex');
const NP_PATH = join(PLUGIN, 'commands', 'next-priority.md');
const LW_PATH = join(PLUGIN, 'docs', 'engines', 'loop-workflow.md');
const NPL_PATH = join(PLUGIN, 'docs', 'next-priority-loop.md');
const FIXTURE_PATH = join(ROOT, 'tests', 'fixtures', 'cold-path', 'next-priority-loop-premove.md');
const MANIFEST_PATH = join(PLUGIN, '.claude-plugin', 'plugin.json');

const BASELINE = 26_426;
const BUDGET = BASELINE - 8_192;
const NP_CAP = 15_150;
const LW_CAP = 3_084;

const SEP = '<!-- premove-block -->\n';
const S1_OLD = '2. **Execute Workflow §1–§9 below in full.**';
const S1_NEW = '2. **Execute next-priority.md Workflow §1–§9 in full.**';
const POINTER = 'Under `--loop`, follow the loop protocol you loaded.';

/** Canonical other-hosts sentence, copied from portability-prose.test.ts. */
const OTHER_HOSTS =
  'On other hosts (Codex, Gemini CLI, OpenCode, Grok, Hermes), or if ' +
  '`${CLAUDE_PLUGIN_ROOT}` is empty, use the installed plugin root: ' +
  '`plugin_root` from `.synthex/state.json`, else the directory two levels ' +
  'above the wrapper you were loaded from.';

const NP_SEL =
  '**Loop engine (FR-HM19, D34):** when `--loop` is set, if `--loop-isolated` is not set, ' +
  'a `Workflow` tool is in your tool list, and ' +
  '`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config-get.sh" native_looping.engine prose` ' +
  'prints exactly `workflow`, Read `${CLAUDE_PLUGIN_ROOT}/docs/engines/loop-workflow.md` ' +
  'and follow it (this instruction is the `Workflow` opt-in, D31); otherwise Read ' +
  '`${CLAUDE_PLUGIN_ROOT}/docs/next-priority-loop.md` and follow it, never a host feature ' +
  'named Workflow. ' +
  OTHER_HOSTS;

const size = (p: string): number => statSync(p).size;
const read = (p: string): string => readFileSync(p, 'utf8');

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function premoveBlocks(): string[] {
  return read(FIXTURE_PATH).split(SEP);
}

describe('Task 59 (FR-HM19, D34): next-priority cold-path split and Claude-path budget', () => {
  it('next-priority.md plus docs/engines/loop-workflow.md is at most 26,426 - 8,192 = 18,234 bytes (AC2)', () => {
    expect(BUDGET).toBe(18_234);
    expect(size(NP_PATH) + size(LW_PATH)).toBeLessThanOrEqual(BUDGET);
  });

  it('next-priority.md is at most 15,150 bytes', () => {
    expect(size(NP_PATH)).toBeLessThanOrEqual(NP_CAP);
  });

  it('docs/engines/loop-workflow.md is at most 3,084 bytes', () => {
    expect(size(LW_PATH)).toBeLessThanOrEqual(LW_CAP);
  });

  it('the Stage 1 prose path (next-priority.md plus docs/next-priority-loop.md) is at most the 26,426-byte baseline (NFR-HM3)', () => {
    expect(size(NP_PATH) + size(NPL_PATH)).toBeLessThanOrEqual(BASELINE);
  });

  it('the pre-move fixture has 4 blocks and the pinned substitution applies exactly once to the last', () => {
    const blocks = premoveBlocks();
    expect(blocks).toHaveLength(4);
    for (const block of blocks) expect(block.length).toBeGreaterThan(0);
    blocks.slice(0, 3).forEach((block) => expect(count(block, S1_OLD)).toBe(0));
    expect(count(blocks[3], S1_OLD)).toBe(1);
    expect(blocks[3].startsWith('### Imperative Loop Protocol (read FIRST when `--loop` is set)\n')).toBe(true);
  });

  it('docs/next-priority-loop.md contains every pre-move block byte-identical, modulo the one pinned substitution (NFR-HM1)', () => {
    const doc = read(NPL_PATH);
    const blocks = premoveBlocks();
    const expected = [...blocks.slice(0, 3), blocks[3].replace(S1_OLD, S1_NEW)];
    for (const block of expected) {
      expect(count(doc, block)).toBe(1);
    }
    expect(count(doc, S1_OLD)).toBe(0);
    expect(count(doc, S1_NEW)).toBe(1);
  });

  it('next-priority.md no longer contains the moved protocol, idle-wait block or anti-pattern', () => {
    const np = read(NP_PATH);
    const b3FirstLine = premoveBlocks()[3].split('\n')[0];
    expect(np).not.toContain('### Imperative Loop Protocol');
    expect(np).not.toContain('#### Idle iterations (wait in-turn)');
    expect(np).not.toContain('#### Anti-pattern');
    expect(np).not.toContain('loop-idle-wait.sh');
    expect(np).not.toContain(b3FirstLine);
  });

  it('next-priority.md contains NP_SEL exactly once, directly under ## Native Looping', () => {
    const np = read(NP_PATH);
    expect(count(np, NP_SEL)).toBe(1);
    expect(np).toContain('## Native Looping\n\n' + NP_SEL + '\n\n### Emission Point');
  });

  it('NP_SEL is FR-HM3 gated, D17-formed, and carries the canonical other-hosts script sentence', () => {
    expect(NP_SEL).toContain('in your tool list');
    expect(NP_SEL).toContain('otherwise');
    expect(NP_SEL).toContain('`Workflow`');
    expect(NP_SEL).toContain('--loop-isolated');
    expect(NP_SEL).toContain('native_looping.engine');
    expect(NP_SEL).toContain('${CLAUDE_PLUGIN_ROOT}/scripts/lib/config-get.sh');
    expect(NP_SEL).toContain('Read `${CLAUDE_PLUGIN_ROOT}/docs/engines/loop-workflow.md`');
    expect(NP_SEL).toContain('Read `${CLAUDE_PLUGIN_ROOT}/docs/next-priority-loop.md`');
    expect(NP_SEL).toContain(OTHER_HOSTS);
  });

  it('the §1 and §9 loop clauses are replaced by the pointer sentence', () => {
    expect(count(read(NP_PATH), POINTER)).toBe(3);
  });

  it('docs/engines/loop-workflow.md names every lease, action, argument and protocol string', () => {
    const lw = read(LW_PATH);
    const required = [
      '`L advance <id> --run`',
      '`L hold <id> --run`',
      '`L hold <id>`',
      'run-id: R',
      'synthex:loop-engine',
      'Workflow(synthex:loop-engine)',
      '900 s',
      'loop-idle-wait.sh',
      'timeout: 600000',
      '`L finish <id> completed',
      'milestone-complete',
      'Loop engine unavailable; continuing on the prose path.',
      'Waiting for loop verdict R.',
      '${CLAUDE_PLUGIN_ROOT}/docs/next-priority-loop.md',
      'planPath',
      'concurrentTasks',
      'requirementsPath',
      'summary',
      'report',
      'promptFile',
      '`finish`',
      '`work`',
      '`ask`',
      '`idle`',
      '`fallback`',
      'blocked_on_human',
      'milestone_remaining',
    ];
    const missing = required.filter((s) => !lw.includes(s));
    expect(missing).toEqual([]);
  });

  it('docs/engines/loop-workflow.md never uses ScheduleWakeup, Monitor or the literal promise tag', () => {
    const lw = read(LW_PATH);
    expect(lw).not.toContain('ScheduleWakeup');
    expect(lw).not.toContain('`Monitor`');
    expect(lw).not.toContain('<promise>');
  });

  it('neither new doc is registered in plugin.json commands or agents', () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as { commands?: string[]; agents?: string[] };
    const registered = [...(manifest.commands ?? []), ...(manifest.agents ?? [])].map((p) =>
      p.replace(/^\.\//, ''),
    );
    expect(registered.some((p) => p.includes('loop-workflow.md'))).toBe(false);
    expect(registered.some((p) => p.includes('next-priority-loop.md'))).toBe(false);
  });
});

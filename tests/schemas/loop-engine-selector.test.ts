/**
 * Layer 1: Task 59 (FR-HM19, D34) — the loop engine selector in the other
 * `--loop` commands (loop, review-code, refine-requirements,
 * write-implementation-plan), the `native_looping.engine` config key, its
 * CLAUDE.md row, and the `runId` row in docs/native-looping.md.
 *
 * Config enables the engine (`native_looping.engine: workflow`), a `Workflow`
 * tool in the tool list selects it (FR-HM3, D31), and `--loop-isolated`
 * always keeps the Stage 1 prose loop. ScheduleWakeup is never used (D32).
 *
 * The selector paragraphs are pinned byte-for-byte: J_SEL for the three judge
 * commands, L_SEL (derived from J_SEL) for loop.md.
 *
 * Plan: docs/plans/harness-modernization.md Task 59 (D34).
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SYNTHEX = join(REPO_ROOT, 'plugins', 'synthex');
const COMMANDS = join(SYNTHEX, 'commands');
const CONFIG_GET = join(SYNTHEX, 'scripts', 'lib', 'config-get.sh');

const J_SEL =
  '**Loop engine (FR-HM19, D34):** when `--loop` is set, before the first iteration run `bash <plugin-root>/scripts/lib/config-get.sh native_looping.engine prose`; if it prints exactly `workflow`, `--loop-isolated` is not set, and a `Workflow` tool is in your tool list, Read `${CLAUDE_PLUGIN_ROOT}/docs/engines/loop-workflow.md` and follow it (this instruction is the `Workflow` opt-in, D31); otherwise follow this command\'s Stage 1 loop prose unchanged, never a host feature named Workflow. `<plugin-root>` is the installed plugin root (other hosts: `plugin_root` in `.synthex/state.json`).';
const L_SEL = J_SEL.replace('when `--loop` is set, before', 'before');

const JUDGE_COMMANDS = ['review-code.md', 'refine-requirements.md', 'write-implementation-plan.md'];

function readCommand(name: string): string {
  return readFileSync(join(COMMANDS, name), 'utf-8');
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i >= 0) {
    count++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

function listMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdown(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function configGet(projectDir: string, withNode: boolean): string {
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
  let bashBin = 'bash';
  let binDir: string | null = null;
  if (!withNode) {
    // Minimal PATH with only bash + awk: exercises the FR-HM40 no-node parser.
    binDir = mkdtempSync(join(tmpdir(), 'loop-engine-sel-nonode-'));
    for (const tool of ['bash', 'awk']) {
      const src = spawnSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf-8' }).stdout.trim();
      spawnSync('ln', ['-s', src, join(binDir, tool)]);
    }
    env.PATH = binDir;
    bashBin = join(binDir, 'bash');
  }
  try {
    const r = spawnSync(bashBin, [CONFIG_GET, 'native_looping.engine', 'prose'], { env, encoding: 'utf-8' });
    expect(r.status).toBe(0);
    return (r.stdout ?? '').trim();
  } finally {
    if (binDir) rmSync(binDir, { recursive: true, force: true });
  }
}

describe('Task 59 (FR-HM19, D34): loop engine selector in the other --loop commands', () => {
  it('review-code.md, refine-requirements.md and write-implementation-plan.md each contain J_SEL exactly once, directly under ## Native Looping', () => {
    for (const name of JUDGE_COMMANDS) {
      const text = readCommand(name);
      expect(countOccurrences(text, J_SEL), name).toBe(1);
      expect(text.includes('## Native Looping\n\n' + J_SEL + '\n\n### Emission Point'), name).toBe(true);
    }
  });

  it('the old Native Looping intro paragraph is gone from those three files', () => {
    for (const name of JUDGE_COMMANDS) {
      const text = readCommand(name);
      expect(text.includes('This command supports the native Synthex looping primitive'), name).toBe(false);
    }
  });

  it('loop.md contains L_SEL exactly once, first under ### Iteration loop', () => {
    const text = readCommand('loop.md');
    expect(countOccurrences(text, L_SEL)).toBe(1);
    expect(countOccurrences(text, J_SEL)).toBe(0);
    expect(text.includes('### Iteration loop\n\n' + L_SEL + '\n\nFollow [`shared-iter`]')).toBe(true);
  });

  it('every selector is FR-HM3 gated and D17-formed without a ${CLAUDE_PLUGIN_ROOT}/scripts/ call', () => {
    expect(Buffer.byteLength(J_SEL)).toBe(589);
    expect(Buffer.byteLength(L_SEL)).toBe(567);
    expect(L_SEL.startsWith('**Loop engine (FR-HM19, D34):** before the first iteration run')).toBe(true);
    for (const sel of [J_SEL, L_SEL]) {
      expect(sel.includes('\n')).toBe(false);
      for (const needle of [
        'in your tool list',
        'otherwise',
        '`Workflow`',
        '--loop-isolated',
        'native_looping.engine',
        '${CLAUDE_PLUGIN_ROOT}/docs/engines/loop-workflow.md',
        'other hosts',
        'plugin root',
      ]) {
        expect(sel.includes(needle), needle).toBe(true);
      }
      expect(sel.includes('${CLAUDE_PLUGIN_ROOT}/scripts/')).toBe(false);
      // Live Task 59 run (2026-10-05): a descriptive "…config-get.sh … prints exactly" clause was
      // skipped and the engine never engaged; the selector must tell the model to RUN the check.
      expect(sel.includes('before the first iteration run `bash <plugin-root>/scripts/lib/config-get.sh native_looping.engine prose`')).toBe(true);
    }
  });

  it('no selector or command mentions ScheduleWakeup', () => {
    expect(J_SEL.includes('ScheduleWakeup')).toBe(false);
    expect(L_SEL.includes('ScheduleWakeup')).toBe(false);
    for (const file of listMarkdown(COMMANDS)) {
      expect(readFileSync(file, 'utf-8').includes('ScheduleWakeup'), file).toBe(false);
    }
  });

  it('review-code.md stays at or under 16,000 bytes and write-implementation-plan.md at or under 26,112 bytes', () => {
    expect(statSync(join(COMMANDS, 'review-code.md')).size).toBeLessThanOrEqual(16000);
    expect(statSync(join(COMMANDS, 'write-implementation-plan.md')).size).toBeLessThanOrEqual(26112);
  });

  it('defaults.yaml ships native_looping.engine: prose in its own top-level block', () => {
    const text = readFileSync(join(SYNTHEX, 'config', 'defaults.yaml'), 'utf-8');
    const lines = text.split('\n');
    const start = lines.indexOf('native_looping:');
    expect(start).toBeGreaterThan(-1);
    expect(countOccurrences(text, '\nnative_looping:\n')).toBe(1);
    // The block runs until the next top-level (non-indented, non-comment, non-blank) key.
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^[A-Za-z_]/.test(lines[i])) {
        end = i;
        break;
      }
    }
    const block = lines.slice(start + 1, end);
    expect(block).toContain('  engine: prose');
    // Sits after next_priority and before the Worktree Settings block.
    expect(lines.indexOf('next_priority:')).toBeLessThan(start);
    expect(lines.indexOf('# Worktree Settings')).toBeGreaterThan(start);
    expect(lines[end]).toBe('worktrees:');
  });

  it('config-get.sh resolves native_looping.engine to prose by default and to workflow under a project override', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'loop-engine-sel-'));
    try {
      expect(configGet(projectDir, true)).toBe('prose');
      expect(configGet(projectDir, false)).toBe('prose');
      mkdirSync(join(projectDir, '.synthex'), { recursive: true });
      writeFileSync(join(projectDir, '.synthex', 'config.yaml'), 'native_looping:\n  engine: workflow\n');
      expect(configGet(projectDir, true)).toBe('workflow');
      expect(configGet(projectDir, false)).toBe('workflow');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("CLAUDE.md's What's Configurable table has the native_looping.engine row", () => {
    const text = readFileSync(join(REPO_ROOT, 'CLAUDE.md'), 'utf-8');
    const row =
      "| `native_looping.engine` | `prose` | FR-HM19 Stage 2 loop engine for every `--loop` command (Claude Code only, opt-in, D34); `workflow` only takes effect with a `Workflow` tool in the caller's tool list and without `--loop-isolated` (`docs/engines/loop-workflow.md`) |";
    expect(countOccurrences(text, row)).toBe(1);
    expect(
      text.includes(
        '| `next_priority.concurrent_tasks` | `3` | Max parallel tasks for `next-priority` command |\n' + row + '\n',
      ),
    ).toBe(true);
  });

  it('docs/native-looping.md documents runId in the schema table and points to engines/loop-workflow.md', () => {
    const text = readFileSync(join(SYNTHEX, 'docs', 'native-looping.md'), 'utf-8');
    const lines = text.split('\n');
    const idle = lines.findIndex((l) => l.startsWith('| `last_idle_iteration` |'));
    expect(idle).toBeGreaterThan(-1);
    const runIdRow = lines[idle + 1];
    expect(runIdRow.startsWith('| `runId` | string | Optional; FR-HM19 Stage 2 only')).toBe(true);
    for (const needle of ['`<loop_id>-i<N>`', 'advance --run', 'hold --run', 'SYNTHEX_LOOP_RUN_STALE', 'Absent on Stage 1 loops']) {
      expect(runIdRow.includes(needle), needle).toBe(true);
    }
    const step8 = lines.indexOf('8. **Loop back to step 2.**');
    expect(step8).toBeGreaterThan(-1);
    expect(lines[step8 + 1]).toBe('');
    expect(lines[step8 + 2].startsWith('**Stage 2 (FR-HM19, D34).**')).toBe(true);
    expect(lines[step8 + 2].includes('[`engines/loop-workflow.md`](engines/loop-workflow.md)')).toBe(true);
  });
});

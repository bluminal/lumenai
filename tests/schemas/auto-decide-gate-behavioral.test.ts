/**
 * Behavioral tests for scripts/auto-decide-gate.sh — the PreToolUse
 * (AskUserQuestion) hook that answers single-(Recommended) questions on the
 * user's behalf in a session armed by `next-priority --auto-decide`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', '..', 'plugins', 'synthex', 'scripts', 'auto-decide-gate.sh');
const SID = 'sess-1234';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auto-decide-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(args: string[], input = '', sid = SID) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: dir,
    env: { PATH: process.env.PATH, CLAUDE_PROJECT_DIR: dir, CLAUDE_CODE_SESSION_ID: sid },
    input,
    encoding: 'utf-8',
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

const q = (question: string, labels: string[], header = 'Choice') => ({
  question,
  header,
  multiSelect: false,
  options: labels.map((label) => ({ label, description: '' })),
});

function ask(questions: object[], sid = SID) {
  return run([], JSON.stringify({ session_id: sid, cwd: dir, tool_name: 'AskUserQuestion', tool_input: { questions } }));
}

const logPath = () => join(dir, '.synthex', 'auto-decide', `${SID}.jsonl`);

describe('auto-decide-gate.sh', () => {
  it('does nothing when no session is armed', () => {
    const r = ask([q('Which DB?', ['Postgres (Recommended)', 'MySQL'])]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('does nothing for a different session than the armed one', () => {
    run(['on']);
    const r = ask([q('Which DB?', ['Postgres (Recommended)', 'MySQL'])], 'other-session');
    expect(r.stdout).toBe('');
  });

  it('answers the single recommended option, logs it, and asks for a trailer', () => {
    run(['on']);
    const r = ask([q('Which DB?', ['Postgres (Recommended)', 'MySQL'])]);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    expect(out.permissionDecision).toBe('allow');
    expect(out.updatedInput.answers).toEqual({ 'Which DB?': 'Postgres (Recommended)' });
    expect(out.updatedInput.questions).toHaveLength(1);
    expect(out.additionalContext).toContain('Auto-Decision: Which DB? => Postgres');

    const entry = JSON.parse(readFileSync(logPath(), 'utf-8').trim());
    expect(entry).toMatchObject({ question: 'Which DB?', chosen: 'Postgres', alternatives: ['MySQL'] });
  });

  it('asks the user when there are zero or two recommendations', () => {
    run(['on']);
    expect(ask([q('A?', ['x', 'y'])]).stdout).toBe('');
    expect(ask([q('B?', ['x (Recommended)', 'y (Recommended)'])]).stdout).toBe('');
  });

  it('asks the user when any one of several questions lacks a recommendation', () => {
    run(['on']);
    const r = ask([q('A?', ['x (Recommended)', 'y']), q('B?', ['x', 'y'])]);
    expect(r.stdout).toBe('');
    expect(existsSync(logPath())).toBe(false);
  });

  it('never answers an [H] approval question', () => {
    run(['on']);
    expect(ask([q('[H] Approve the login page?', ['Approve (Recommended)', 'Reject'])]).stdout).toBe('');
    expect(ask([q('Approve?', ['Approve (Recommended)', 'Reject'], '[H] Login')]).stdout).toBe('');
  });

  it('stops answering after off', () => {
    run(['on']);
    run(['off']);
    expect(ask([q('Which DB?', ['Postgres (Recommended)', 'MySQL'])]).stdout).toBe('');
  });

  it('on/off fail without a session id', () => {
    expect(run(['on'], '', '').status).toBe(1);
  });
});

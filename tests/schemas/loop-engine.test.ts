/**
 * Task 59 (FR-HM19, D33, D34): loop-engine.test.ts.
 *
 * Unit tests for the pure functions of the Stage 2 loop engine,
 * plugins/synthex/workflows/lib/loop-engine.mjs (the source of truth that
 * plugins/synthex/workflows/loop-engine.js inlines; see
 * loop-engine-sync.test.ts). No Workflow runtime, no LLM call: every
 * verdict-leaf output here is a hand-written object.
 *
 * Covers args contract v1 (validateArgs), the verdict normalizers for
 * select mode (next-priority) and judge mode (loop, review-code,
 * refine-requirements, write-implementation-plan), the Confirm leaf
 * normalizer, the action decision, return contract v1 (buildResult), and
 * the three prompt builders.
 */

import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  BLOCKED_MAX,
  CONFIRM_SCHEMA,
  EMISSION_CAVEATS,
  EMISSION_CONDITIONS,
  JUDGE_SCHEMA,
  LOOP_COMMANDS,
  LOOP_COMPLETION_RULE,
  NEXT_PRIORITY_CRITICAL_RULES,
  NEXT_PRIORITY_SELECTION_RULES,
  PROMPT_MAX,
  READ_ONLY_RULE,
  REASONS,
  REPORT_MAX,
  SELECT_SCHEMA,
  SUMMARY_MAX,
  BLOCKED_ITEM_SCHEMA,
  buildConfirmPrompt,
  buildJudgePrompt,
  buildResult,
  buildSelectPrompt,
  decideAction,
  normalizeConfirm,
  normalizeJudgment,
  normalizeSelection,
  validateArgs,
} from '../../plugins/synthex/workflows/lib/loop-engine.mjs';

type AnyObj = Record<string, any>;

const NP: AnyObj = { runId: 'np-loop-i3', loopId: 'np-loop', command: 'next-priority', planPath: 'docs/plans/main.md' };

const JUDGE_ARGS: Record<string, AnyObj> = {
  loop: { runId: 'l1-i1', loopId: 'l1', command: 'loop', prompt: 'Fix the tests; emit DONE once they pass.', summary: 'Fixed two of three tests.' },
  'review-code': { runId: 'rc-i2', loopId: 'rc', command: 'review-code', report: '## Code Review Report\n\nPASS', summary: 'No files changed.' },
  'refine-requirements': { runId: 'rr-i1', loopId: 'rr', command: 'refine-requirements', requirementsPath: 'docs/reqs/main.md', summary: 'Answered Q1.' },
  'write-implementation-plan': {
    runId: 'wip-i4',
    loopId: 'wip',
    command: 'write-implementation-plan',
    planPath: 'docs/plans/main.md',
    requirementsPath: 'docs/reqs/main.md',
    summary: 'Folded in reviewer edits.',
  },
};

function okArgs(raw: AnyObj): AnyObj {
  const v = validateArgs(raw);
  expect(v.ok, JSON.stringify(v.notes)).toBe(true);
  return v.args;
}

function selectRaw(over: AnyObj = {}): AnyObj {
  return {
    done: false,
    idle: false,
    blocked_on_human: [],
    summary: 'Next batch chosen.',
    tasks: [],
    remaining: [],
    milestone: '',
    milestone_remaining: [],
    ...over,
  };
}

function judgeRaw(over: AnyObj = {}): AnyObj {
  return { done: false, idle: false, blocked_on_human: [], summary: 'Judged.', unmet: [], ...over };
}

function task(id: string, milestone = 'Milestone 1.1', over: AnyObj = {}): AnyObj {
  return { id, title: `Task ${id}`, milestone, line: 10, description: `Do ${id}.`, criteria: ['[T] it works'], ...over };
}

describe('loop-engine lib (FR-HM19, Task 59)', () => {
  it('validateArgs rejects a missing or malformed runId, loopId or command', () => {
    for (const raw of [null, undefined, 'np-loop-i3', 42, []]) {
      const v = validateArgs(raw);
      expect(v.ok).toBe(false);
      expect(v.args).toMatchObject({ runId: null, loopId: null, command: null });
    }
    const bad: AnyObj[] = [
      { ...NP, runId: undefined },
      { ...NP, runId: 'np-loop' },
      { ...NP, runId: 'np-loop-i1234' },
      { ...NP, runId: 'NP-loop-i3', loopId: 'NP-loop' },
      { ...NP, loopId: undefined },
      { ...NP, loopId: '-np' },
      { ...NP, loopId: 'np_loop' },
      { ...NP, command: undefined },
      { ...NP, command: 'team-implement' },
      { ...NP, command: 'synthex:team-implement' },
      { ...NP, command: '/synthex:' },
    ];
    for (const raw of bad) {
      const v = validateArgs(raw);
      expect(v.ok, JSON.stringify(raw)).toBe(false);
      expect(v.notes.length).toBeGreaterThan(0);
    }
    // Echo string identity fields even on failure.
    const echoed = validateArgs({ ...NP, command: 'nope' });
    expect(echoed.args.runId).toBe('np-loop-i3');
    expect(echoed.args.loopId).toBe('np-loop');
    expect(echoed.args.command).toBe('nope');
    expect(validateArgs({ ...NP, runId: 7 }).args.runId).toBeNull();
    expect(validateArgs(NP).ok).toBe(true);
  });

  it('validateArgs normalizes a leading "/" or "synthex:" on command (live Task 59 run, 2026-10-05)', () => {
    // The live [H] run passed command "synthex:next-priority" first and got a
    // bad-args fallback; the engine now accepts the namespaced forms.
    for (const command of ['next-priority', 'synthex:next-priority', '/synthex:next-priority', '/next-priority', '  next-priority  ']) {
      const v = validateArgs({ ...NP, command });
      expect(v.ok, command).toBe(true);
      expect(v.args.command).toBe('next-priority');
    }
    // Other loop commands need extra args (summary/report/requirementsPath),
    // so check only that the command itself normalizes and is not the reason.
    for (const [command, bare] of [['synthex:loop', 'loop'], ['/synthex:review-code', 'review-code'], ['synthex:refine-requirements', 'refine-requirements'], ['synthex:write-implementation-plan', 'write-implementation-plan']]) {
      const v = validateArgs({ ...NP, command });
      expect(v.args.command, command).toBe(bare);
      expect(v.notes.join(' ')).not.toMatch(/not a loop command/);
    }
  });

  it('validateArgs rejects a runId that does not start with loopId + "-i"', () => {
    expect(validateArgs({ ...NP, runId: 'other-i3' }).ok).toBe(false);
    expect(validateArgs({ ...NP, runId: 'np-loopx-i3' }).ok).toBe(false);
    expect(validateArgs({ ...NP, loopId: 'np', runId: 'np-loop-i3' }).ok).toBe(false);
    expect(validateArgs({ ...NP, loopId: 'np-loop-i3', runId: 'np-loop-i3' }).ok).toBe(false);
    expect(validateArgs({ ...NP, loopId: 'np-i2', runId: 'np-i2-i3' }).ok).toBe(true);
  });

  it('validateArgs enforces per-command required fields', () => {
    const missing: Array<[AnyObj, string]> = [
      [NP, 'planPath'],
      [JUDGE_ARGS['write-implementation-plan'], 'planPath'],
      [JUDGE_ARGS['write-implementation-plan'], 'requirementsPath'],
      [JUDGE_ARGS['write-implementation-plan'], 'summary'],
      [JUDGE_ARGS['refine-requirements'], 'requirementsPath'],
      [JUDGE_ARGS['refine-requirements'], 'summary'],
      [JUDGE_ARGS['review-code'], 'report'],
      [JUDGE_ARGS['review-code'], 'summary'],
      [JUDGE_ARGS.loop, 'summary'],
    ];
    for (const [base, field] of missing) {
      expect(validateArgs({ ...base, [field]: undefined }).ok, `${base.command} without ${field}`).toBe(false);
      expect(validateArgs({ ...base, [field]: '   ' }).ok, `${base.command} with blank ${field}`).toBe(false);
    }
    // loop: prompt or promptFile, at least one non-empty.
    expect(validateArgs({ ...JUDGE_ARGS.loop, prompt: undefined }).ok).toBe(false);
    expect(validateArgs({ ...JUDGE_ARGS.loop, prompt: ' ', promptFile: '' }).ok).toBe(false);
    expect(validateArgs({ ...JUDGE_ARGS.loop, prompt: undefined, promptFile: '.synthex/loop-prompt.md' }).ok).toBe(true);
    // next-priority needs no summary.
    expect(validateArgs(NP).ok).toBe(true);
    for (const cmd of Object.keys(JUDGE_ARGS)) expect(validateArgs(JUDGE_ARGS[cmd]).ok, cmd).toBe(true);
    // Required strings are trimmed; absent fields are null; shape is fixed.
    const args = okArgs({ ...JUDGE_ARGS['refine-requirements'], requirementsPath: '  docs/reqs/main.md  ' });
    expect(args.requirementsPath).toBe('docs/reqs/main.md');
    expect(Object.keys(args).sort()).toEqual(
      ['runId', 'loopId', 'command', 'planPath', 'requirementsPath', 'concurrentTasks', 'summary', 'report', 'prompt', 'promptFile'].sort(),
    );
    expect(args.planPath).toBeNull();
    expect(args.report).toBeNull();
    expect(args.concurrentTasks).toBeNull();
  });

  it('validateArgs defaults concurrentTasks to 3, clamps above 10, and rejects values below 1 or non-integers', () => {
    expect(okArgs(NP).concurrentTasks).toBe(3);
    expect(okArgs({ ...NP, concurrentTasks: 1 }).concurrentTasks).toBe(1);
    expect(okArgs({ ...NP, concurrentTasks: 10 }).concurrentTasks).toBe(10);
    const clamped = validateArgs({ ...NP, concurrentTasks: 25 });
    expect(clamped.ok).toBe(true);
    expect(clamped.args.concurrentTasks).toBe(10);
    expect(clamped.notes).toContain('concurrentTasks clamped to 10');
    for (const bad of [0, -1, 2.5, '3', Number.NaN, true]) {
      expect(validateArgs({ ...NP, concurrentTasks: bad }).ok, String(bad)).toBe(false);
    }
  });

  it('validateArgs truncates an oversized summary, report or prompt with a note', () => {
    const rc = validateArgs({ ...JUDGE_ARGS['review-code'], report: 'r'.repeat(REPORT_MAX + 5), summary: 's'.repeat(SUMMARY_MAX + 5) });
    expect(rc.ok).toBe(true);
    expect(rc.args.report).toHaveLength(REPORT_MAX);
    expect(rc.args.summary).toHaveLength(SUMMARY_MAX);
    expect(rc.notes).toContain('report truncated to 60000 chars');
    expect(rc.notes).toContain('summary truncated to 4000 chars');
    const lp = validateArgs({ ...JUDGE_ARGS.loop, prompt: 'p'.repeat(PROMPT_MAX + 1) });
    expect(lp.ok).toBe(true);
    expect(lp.args.prompt).toHaveLength(PROMPT_MAX);
    expect(lp.notes).toContain('prompt truncated to 20000 chars');
    expect(validateArgs(JUDGE_ARGS.loop).notes).toEqual([]);
  });

  it('normalizeSelection: malformed raw is valid:false and decideAction returns fallback invalid-verdict', () => {
    const a = okArgs(NP);
    const malformed: unknown[] = [
      null,
      'done',
      [],
      selectRaw({ done: 'false' }),
      selectRaw({ idle: undefined }),
      selectRaw({ tasks: {} }),
      selectRaw({ remaining: 'T1' }),
      selectRaw({ blocked_on_human: null }),
      selectRaw({ milestone_remaining: undefined }),
      selectRaw({ summary: 5 }),
    ];
    for (const raw of malformed) {
      const sel = normalizeSelection(raw, a);
      expect(sel.valid, JSON.stringify(raw)).toBe(false);
      expect(sel.done).toBe(false);
      expect(sel.tasks).toEqual([]);
      expect(sel.notes).toContain('malformed verdict');
      expect(decideAction(sel, null, 'next-priority')).toEqual({ action: 'fallback', reason: 'invalid-verdict' });
    }
    expect(decideAction(null, null, 'loop')).toEqual({ action: 'fallback', reason: 'invalid-verdict' });
  });

  it('normalizeSelection: done with tasks, blocked items or remaining ids becomes not done (contradiction note)', () => {
    const a = okArgs(NP);
    const cases = [
      selectRaw({ done: true, remaining: ['T1'], milestone: 'Milestone 1.1', milestone_remaining: ['T1'] }),
      selectRaw({ done: true, remaining: ['T1'], tasks: [task('T1')], milestone: 'Milestone 1.1' }),
      selectRaw({ done: true, remaining: ['T1'], blocked_on_human: [{ id: 'T1', question: '[H] Approve?' }] }),
      selectRaw({ done: true, blocked_on_human: [{ id: 'T9', question: '[H] Approve?' }] }),
    ];
    for (const raw of cases) {
      const sel = normalizeSelection(raw, a);
      expect(sel.valid).toBe(true);
      expect(sel.done).toBe(false);
      expect(sel.notes).toContain('contradiction: raw done=true but computed done=false');
      expect(decideAction(sel, { valid: true, remaining: [] }, 'next-priority').action).not.toBe('finish');
    }
  });

  it('normalizeSelection: empty remaining with no tasks or blocked items is a done candidate even when raw.done is false', () => {
    const sel = normalizeSelection(selectRaw({ done: false }), okArgs(NP));
    expect(sel.valid).toBe(true);
    expect(sel.done).toBe(true);
    expect(sel.idle).toBe(false);
    expect(sel.milestone).toBeNull();
    expect(sel.notes).toContain('contradiction: raw done=false but computed done=true');
    // Still needs the Confirm leaf before it finishes.
    expect(decideAction(sel, null, 'next-priority')).toEqual({ action: 'fallback', reason: 'done-unconfirmed' });
    const agreed = normalizeSelection(selectRaw({ done: true }), okArgs(NP));
    expect(agreed.done).toBe(true);
    expect(agreed.notes).toEqual([]);
  });

  it('normalizeSelection: tasks outside the verdict milestone or not in remaining are dropped and noted', () => {
    const sel = normalizeSelection(
      selectRaw({
        remaining: ['T1', 'T2', 'T3', 'T4'],
        milestone: '  Milestone 1.1 ',
        milestone_remaining: ['T1', 'T2'],
        tasks: [task('T1'), task('T3', 'Milestone 1.2'), task('T9'), { title: 'no id' }, task(''), 'T4'],
      }),
      okArgs(NP),
    );
    expect(sel.milestone).toBe('Milestone 1.1');
    expect(sel.tasks.map((t: AnyObj) => t.id)).toEqual(['T1']);
    expect(sel.notes).toContain('task T3 dropped: outside milestone Milestone 1.1');
    expect(sel.notes).toContain('task T9 dropped: not in remaining');
    expect(sel.notes.filter((n: string) => n === 'task without id dropped')).toHaveLength(3);
    // Normalized task shape.
    const normalized = normalizeSelection(
      selectRaw({
        remaining: ['T1'],
        milestone: 'Milestone 1.1',
        tasks: [{ id: ' T1 ', milestone: 'Milestone 1.1', line: 0, criteria: ['[T] a', 7, '[H] b'] }],
      }),
      okArgs(NP),
    );
    expect(normalized.tasks).toEqual([
      { id: 'T1', title: '', milestone: 'Milestone 1.1', line: null, description: '', criteria: ['[T] a', '[H] b'] },
    ]);
    expect(normalizeSelection(selectRaw({ remaining: ['T1'], milestone: 'M', tasks: [task('T1', 'M', { line: 2.5 })] }), okArgs(NP)).tasks[0].line).toBeNull();
  });

  it('normalizeSelection: tasks are deduped by id and capped at concurrentTasks with the dropped ids noted', () => {
    const ids = ['T1', 'T2', 'T3', 'T4', 'T5'];
    const raw = selectRaw({
      remaining: ids,
      milestone: 'Milestone 1.1',
      milestone_remaining: ids,
      tasks: [task('T1'), task('T1', 'Milestone 1.1', { title: 'dup' }), ...ids.slice(1).map((id) => task(id))],
    });
    const sel = normalizeSelection(raw, okArgs({ ...NP, concurrentTasks: 2 }));
    expect(sel.tasks.map((t: AnyObj) => t.id)).toEqual(['T1', 'T2']);
    expect(sel.tasks[0].title).toBe('Task T1');
    expect(sel.notes).toContain('tasks capped at 2; dropped: T3, T4, T5');
    expect(decideAction(sel, null, 'next-priority')).toEqual({ action: 'work', reason: 'tasks-selected' });
    expect(normalizeSelection(raw, okArgs(NP)).tasks).toHaveLength(3);
  });

  it('normalizeSelection: milestone_remaining is filtered to a subset of remaining', () => {
    const sel = normalizeSelection(
      selectRaw({ remaining: ['T1', ' T2 ', 'T2', '', 3], milestone: 'M', milestone_remaining: ['T2', 'T7', 'T2', 'T1'] }),
      okArgs(NP),
    );
    expect(sel.remaining).toEqual(['T1', 'T2']);
    expect(sel.milestone_remaining).toEqual(['T2', 'T1']);
    expect(sel.notes).toContain('milestone_remaining id T7 dropped: not in remaining');
    for (const id of sel.milestone_remaining) expect(sel.remaining).toContain(id);
  });

  it('normalizeSelection: blocked_on_human is deduped by id and capped at 50', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ id: `T${i}`, question: `[H] Approve T${i}?` }));
    const sel = normalizeSelection(
      selectRaw({
        remaining: ['T0'],
        blocked_on_human: [{ id: 'T0', question: 'first' }, { id: 'T0', question: 'second' }, { id: '', question: 'q' }, { id: 'X' }, ...items],
      }),
      okArgs(NP),
    );
    expect(sel.blocked_on_human).toHaveLength(BLOCKED_MAX);
    expect(sel.blocked_on_human[0]).toEqual({ id: 'T0', question: 'first' });
    expect(new Set(sel.blocked_on_human.map((b: AnyObj) => b.id)).size).toBe(BLOCKED_MAX);
    expect(sel.notes.some((n: string) => n.startsWith('blocked_on_human capped at 50'))).toBe(true);
    expect(sel.notes.some((n: string) => n.includes('without id or question dropped'))).toBe(true);
  });

  it('normalizeSelection: summary is whitespace-collapsed and capped at 300 characters', () => {
    const a = okArgs(NP);
    expect(normalizeSelection(selectRaw({ summary: '  two\n\n  lines\there  ' }), a).summary).toBe('two lines here');
    const long = normalizeSelection(selectRaw({ summary: 'x'.repeat(400) }), a).summary;
    expect(long).toHaveLength(300);
    expect(long.endsWith('...')).toBe(true);
    expect(normalizeSelection(selectRaw({ summary: 'y'.repeat(300) }), a).summary).toBe('y'.repeat(300));
  });

  it('normalizeJudgment: done with unmet conditions or blocked items becomes not done', () => {
    const a = okArgs(JUDGE_ARGS['review-code']);
    const withUnmet = normalizeJudgment(judgeRaw({ done: true, unmet: ['No recommended-change items remain'] }), a);
    expect(withUnmet.valid).toBe(true);
    expect(withUnmet.done).toBe(false);
    expect(withUnmet.remaining).toEqual(['No recommended-change items remain']);
    expect(withUnmet.notes).toContain('contradiction: done with unmet conditions or blocked items');
    const withBlocked = normalizeJudgment(judgeRaw({ done: true, blocked_on_human: [{ id: 'Magic number', question: 'Accept or fix: Magic number?' }] }), a);
    expect(withBlocked.done).toBe(false);
    expect(withBlocked.notes).toContain('contradiction: done with unmet conditions or blocked items');
    const clean = normalizeJudgment(judgeRaw({ done: true }), a);
    expect(clean.done).toBe(true);
    expect(clean.notes).toEqual([]);
    expect(clean.tasks).toEqual([]);
    expect(clean.milestone).toBeNull();
    expect(clean.milestone_remaining).toEqual([]);
    // Not done unless the leaf said done.
    expect(normalizeJudgment(judgeRaw({ done: false }), a).done).toBe(false);
    // unmet capped at 20.
    const many = normalizeJudgment(judgeRaw({ unmet: Array.from({ length: 25 }, (_, i) => `c${i}`) }), a);
    expect(many.remaining).toHaveLength(20);
    expect(many.notes.some((n: string) => n.startsWith('unmet capped at 20'))).toBe(true);
    // Malformed judgments are invalid.
    for (const raw of [null, judgeRaw({ unmet: undefined }), judgeRaw({ done: 1 }), judgeRaw({ summary: null })]) {
      expect(normalizeJudgment(raw, a).valid).toBe(false);
    }
  });

  it('normalizeJudgment: idle only when not done and nothing is blocked', () => {
    const a = okArgs(JUDGE_ARGS['refine-requirements']);
    expect(normalizeJudgment(judgeRaw({ idle: true, unmet: ['Open Questions'] }), a).idle).toBe(true);
    expect(normalizeJudgment(judgeRaw({ idle: false, unmet: ['Open Questions'] }), a).idle).toBe(false);
    expect(
      normalizeJudgment(judgeRaw({ idle: true, unmet: ['Open Questions'], blocked_on_human: [{ id: 'Q1', question: 'Which DB?' }] }), a).idle,
    ).toBe(false);
    expect(normalizeJudgment(judgeRaw({ done: true, idle: true }), a).idle).toBe(false);
  });

  it('normalizeConfirm: null or malformed confirm is invalid', () => {
    for (const raw of [null, undefined, 'none', [], {}, { remaining: 'T1' }]) {
      expect(normalizeConfirm(raw)).toEqual({ valid: false, remaining: [] });
    }
    expect(normalizeConfirm({ remaining: [] })).toEqual({ valid: true, remaining: [] });
    expect(normalizeConfirm({ remaining: [' T1 ', 'T1', '', 4, 'T2'] })).toEqual({ valid: true, remaining: ['T1', 'T2'] });
  });

  it('decideAction: unconfirmed done gives fallback done-unconfirmed', () => {
    const np = normalizeSelection(selectRaw({ done: true }), okArgs(NP));
    const judge = normalizeJudgment(judgeRaw({ done: true }), okArgs(JUDGE_ARGS.loop));
    const unconfirmed = [null, normalizeConfirm(null), normalizeConfirm({ remaining: ['T7'] })];
    for (const confirm of unconfirmed) {
      expect(decideAction(np, confirm, 'next-priority')).toEqual({ action: 'fallback', reason: 'done-unconfirmed' });
      expect(decideAction(judge, confirm, 'loop')).toEqual({ action: 'fallback', reason: 'done-unconfirmed' });
    }
  });

  it('decideAction: confirmed done gives finish plan-complete for next-priority and verdict-done for the other commands', () => {
    const confirmed = normalizeConfirm({ remaining: [] });
    const np = normalizeSelection(selectRaw({ done: true }), okArgs(NP));
    expect(decideAction(np, confirmed, 'next-priority')).toEqual({ action: 'finish', reason: 'plan-complete' });
    for (const cmd of Object.keys(JUDGE_ARGS)) {
      const sel = normalizeJudgment(judgeRaw({ done: true }), okArgs(JUDGE_ARGS[cmd]));
      expect(decideAction(sel, confirmed, cmd), cmd).toEqual({ action: 'finish', reason: 'verdict-done' });
    }
  });

  it('decideAction (next-priority): tasks give work; blocked only gives ask; nothing gives idle', () => {
    const a = okArgs(NP);
    const base = { remaining: ['T1', 'T2'], milestone: 'Milestone 1.1', milestone_remaining: ['T1', 'T2'] };
    const work = normalizeSelection(
      selectRaw({ ...base, tasks: [task('T1')], blocked_on_human: [{ id: 'T2', question: '[H] ok?' }] }),
      a,
    );
    expect(decideAction(work, null, 'next-priority')).toEqual({ action: 'work', reason: 'tasks-selected' });
    const ask = normalizeSelection(selectRaw({ ...base, blocked_on_human: [{ id: 'T2', question: '[H] ok?' }] }), a);
    expect(ask.idle).toBe(false);
    expect(decideAction(ask, null, 'next-priority')).toEqual({ action: 'ask', reason: 'blocked-on-human' });
    const idle = normalizeSelection(selectRaw({ ...base, idle: true }), a);
    expect(idle.idle).toBe(true);
    expect(decideAction(idle, null, 'next-priority')).toEqual({ action: 'idle', reason: 'nothing-actionable' });
  });

  it('decideAction (judge): blocked gives ask; idle gives idle; otherwise work continue', () => {
    for (const cmd of Object.keys(JUDGE_ARGS)) {
      const a = okArgs(JUDGE_ARGS[cmd]);
      const ask = normalizeJudgment(judgeRaw({ idle: true, unmet: ['x'], blocked_on_human: [{ id: 'Q3', question: 'Which?' }] }), a);
      expect(decideAction(ask, null, cmd), cmd).toEqual({ action: 'ask', reason: 'blocked-on-human' });
      const idle = normalizeJudgment(judgeRaw({ idle: true, unmet: ['x'] }), a);
      expect(decideAction(idle, null, cmd), cmd).toEqual({ action: 'idle', reason: 'nothing-actionable' });
      const work = normalizeJudgment(judgeRaw({ unmet: ['x'] }), a);
      expect(decideAction(work, null, cmd), cmd).toEqual({ action: 'work', reason: 'continue' });
    }
  });

  it('buildResult echoes runId, loopId and command and has exactly the v1 keys', () => {
    const a = okArgs(NP);
    const sel = normalizeSelection(
      selectRaw({ remaining: ['T1', 'T2'], milestone: 'Milestone 1.1', milestone_remaining: ['T1', 'T2'], tasks: [task('T1')] }),
      a,
    );
    const r = buildResult(a, decideAction(sel, null, 'next-priority'), sel, ['arg note']);
    expect(Object.keys(r)).toEqual([
      'schemaVersion', 'runId', 'loopId', 'command', 'valid', 'action', 'reason', 'verdict',
      'tasks', 'milestone', 'milestone_remaining', 'remaining_count', 'notes',
    ]);
    expect(Object.keys(r.verdict)).toEqual(['done', 'idle', 'blocked_on_human', 'summary']);
    expect(r).toMatchObject({
      schemaVersion: 1,
      runId: 'np-loop-i3',
      loopId: 'np-loop',
      command: 'next-priority',
      valid: true,
      action: 'work',
      reason: 'tasks-selected',
      milestone: 'Milestone 1.1',
      milestone_remaining: ['T1', 'T2'],
      remaining_count: 2,
    });
    expect(r.tasks.map((t: AnyObj) => t.id)).toEqual(['T1']);
    expect(r.notes).toContain('arg note');
    for (const n of r.notes) expect(typeof n).toBe('string');
    // Judge commands: tasks empty and milestone null.
    const j = okArgs(JUDGE_ARGS['write-implementation-plan']);
    const jsel = normalizeJudgment(judgeRaw({ unmet: ['x'] }), j);
    const jr = buildResult(j, decideAction(jsel, null, j.command), jsel);
    expect(jr.tasks).toEqual([]);
    expect(jr.milestone).toBeNull();
    expect(jr.runId).toBe('wip-i4');
    expect(jr.remaining_count).toBe(1);
    // Data only: survives a JSON round trip unchanged.
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('buildResult on bad args returns action fallback reason bad-args and valid false', () => {
    const v = validateArgs({ runId: 'x-i1', loopId: 'x', command: 'review-code' });
    expect(v.ok).toBe(false);
    const r = buildResult(v.args, { action: 'fallback', reason: 'bad-args' }, null, v.notes);
    expect(r).toMatchObject({
      schemaVersion: 1,
      runId: 'x-i1',
      loopId: 'x',
      command: 'review-code',
      valid: false,
      action: 'fallback',
      reason: 'bad-args',
      verdict: { done: false, idle: false, blocked_on_human: [], summary: '' },
      tasks: [],
      milestone: null,
      milestone_remaining: [],
      remaining_count: 0,
    });
    expect(r.notes.length).toBeGreaterThan(0);
    const nullish = buildResult(validateArgs(null).args, { action: 'fallback', reason: 'bad-args' }, null, []);
    expect(nullish).toMatchObject({ runId: null, loopId: null, command: null, valid: false });
    const err = buildResult({ runId: 'x-i1' }, { action: 'fallback', reason: 'engine-error' }, null, ['engine-error: boom']);
    expect(err).toMatchObject({ runId: 'x-i1', loopId: null, command: null, valid: false, reason: 'engine-error', notes: ['engine-error: boom'] });
  });

  it('buildSelectPrompt embeds the read-only rule, planPath, concurrentTasks, the selection rules and both Critical Rule lines', () => {
    const p = buildSelectPrompt(okArgs({ ...NP, concurrentTasks: 4 }));
    expect(p.startsWith(READ_ONLY_RULE + '\n')).toBe(true);
    expect(p).toContain('Read the implementation plan at docs/plans/main.md');
    expect(p).toContain('at most 4 tasks');
    for (const rule of NEXT_PRIORITY_SELECTION_RULES) expect(p).toContain('\n- ' + rule + '\n');
    for (const rule of NEXT_PRIORITY_CRITICAL_RULES) expect(p).toContain('\n' + rule + '\n');
    expect(NEXT_PRIORITY_CRITICAL_RULES).toHaveLength(2);
    for (const field of ['remaining:', 'milestone:', 'milestone_remaining:', 'tasks:', 'blocked_on_human:', 'done:']) {
      expect(p).toContain('\n' + field);
    }
  });

  it("buildJudgePrompt embeds each judge command's Emission Point conditions, caveats and inputs", () => {
    for (const cmd of ['review-code', 'refine-requirements', 'write-implementation-plan']) {
      const a = okArgs(JUDGE_ARGS[cmd]);
      const p = buildJudgePrompt(a);
      expect(p.startsWith(READ_ONLY_RULE + '\n')).toBe(true);
      expect(p).toContain('done is true only when ALL of these hold:');
      for (const c of EMISSION_CONDITIONS[cmd]) expect(p, cmd).toContain('\n- ' + c + '\n');
      for (const c of EMISSION_CAVEATS[cmd]) expect(p, cmd).toContain('\n- ' + c + '\n');
      expect(p.includes('It is not done while any of these is true'), cmd).toBe(EMISSION_CAVEATS[cmd].length > 0);
      expect(p).toContain('\nSummary:\n' + a.summary);
      expect(p).not.toContain(LOOP_COMPLETION_RULE);
    }
    expect(buildJudgePrompt(okArgs(JUDGE_ARGS['refine-requirements']))).toContain('Read the PRD at docs/reqs/main.md.');
    expect(buildJudgePrompt(okArgs(JUDGE_ARGS['write-implementation-plan']))).toContain(
      'Read the implementation plan at docs/plans/main.md and the PRD at docs/reqs/main.md.',
    );
    const rc = buildJudgePrompt(okArgs(JUDGE_ARGS['review-code']));
    expect(rc).toContain('\nCode Review Report:\n## Code Review Report');
    expect(rc).toContain('"Accept or fix: <title>?"');
    expect(EMISSION_CAVEATS['review-code']).toEqual([]);
  });

  it('buildJudgePrompt for loop embeds LOOP_COMPLETION_RULE and the prompt or promptFile', () => {
    const inline = buildJudgePrompt(okArgs(JUDGE_ARGS.loop));
    expect(inline).toContain(LOOP_COMPLETION_RULE);
    expect(inline).toContain('\nPrompt:\nFix the tests; emit DONE once they pass.');
    expect(inline).not.toContain('Read the loop prompt from');
    expect(inline).not.toContain('done is true only when ALL of these hold:');
    const file = buildJudgePrompt(okArgs({ ...JUDGE_ARGS.loop, prompt: undefined, promptFile: '.synthex/prompt.md' }));
    expect(file).toContain('Read the loop prompt from .synthex/prompt.md.');
    expect(file).not.toContain('\nPrompt:\n');
    expect(file).toContain(LOOP_COMPLETION_RULE);
  });

  it('buildConfirmPrompt never includes verdict-leaf output and lists the same conditions', () => {
    // The Confirm prompt is built from args alone; its signature has no room for the verdict.
    expect(buildConfirmPrompt.length).toBe(1);
    const np = buildConfirmPrompt(okArgs(NP));
    expect(np).toBe(
      READ_ONLY_RULE +
        '\nRead the implementation plan at docs/plans/main.md. List in remaining the id of every task whose status is not done, in every phase and milestone. Return an empty list only if every task is done.',
    );
    for (const cmd of Object.keys(JUDGE_ARGS)) {
      const a = okArgs(JUDGE_ARGS[cmd]);
      const p = buildConfirmPrompt(a);
      expect(p.startsWith(READ_ONLY_RULE + '\n')).toBe(true);
      expect(p).toContain('Check each condition below independently.');
      if (cmd === 'loop') expect(p).toContain(LOOP_COMPLETION_RULE);
      else for (const c of EMISSION_CONDITIONS[cmd]) expect(p, cmd).toContain('\n- ' + c);
      for (const c of EMISSION_CAVEATS[cmd] || []) expect(p, cmd).toContain('\n- ' + c);
      expect(p).toContain('\nSummary:\n' + a.summary);
      // No judge-only instructions (idle, blocked, return) and no verdict output.
      expect(p).not.toMatch(/^idle: /m);
      expect(p).not.toMatch(/^blocked_on_human: /m);
      expect(p).not.toContain('Return done, idle');
      expect(p).not.toContain('Judged.');
    }
  });

  it('every schema has type object at the root and required is a subset of properties', () => {
    const walk = (schema: AnyObj, path: string) => {
      if (schema.type === 'object') {
        expect(schema.properties, path).toBeTruthy();
        for (const key of schema.required || []) expect(Object.keys(schema.properties), `${path}.${key}`).toContain(key);
        for (const [key, sub] of Object.entries(schema.properties)) walk(sub as AnyObj, `${path}.${key}`);
      }
      if (schema.type === 'array') walk(schema.items, `${path}[]`);
    };
    const schemas: Record<string, AnyObj> = { SELECT_SCHEMA, JUDGE_SCHEMA, CONFIRM_SCHEMA, BLOCKED_ITEM_SCHEMA };
    for (const [name, schema] of Object.entries(schemas)) {
      expect(schema.type, name).toBe('object');
      walk(schema, name);
    }
    expect(SELECT_SCHEMA.required).toEqual(['done', 'idle', 'blocked_on_human', 'summary', 'tasks', 'remaining', 'milestone', 'milestone_remaining']);
    expect(JUDGE_SCHEMA.required).toEqual(['done', 'idle', 'blocked_on_human', 'summary', 'unmet']);
    expect(CONFIRM_SCHEMA.required).toEqual(['remaining']);
  });

  it('every action and reason produced is a member of ACTIONS and REASONS', () => {
    expect(LOOP_COMMANDS).toEqual(['next-priority', 'loop', 'review-code', 'refine-requirements', 'write-implementation-plan']);
    const seen = new Set<string>();
    const confirms = [null, normalizeConfirm({ remaining: [] }), normalizeConfirm({ remaining: ['x'] })];
    const npRaws = [
      null,
      selectRaw({ done: true }),
      selectRaw({ remaining: ['T1'], milestone: 'M', tasks: [task('T1', 'M')] }),
      selectRaw({ remaining: ['T1'], blocked_on_human: [{ id: 'T1', question: 'q' }] }),
      selectRaw({ remaining: ['T1'] }),
    ];
    const npArgs = okArgs(NP);
    for (const raw of npRaws) {
      for (const c of confirms) {
        const sel = normalizeSelection(raw, npArgs);
        const d = decideAction(sel, c, 'next-priority');
        const r = buildResult(npArgs, d, sel);
        expect(ACTIONS).toContain(r.action);
        expect(REASONS).toContain(r.reason);
        seen.add(r.action).add(r.reason);
      }
    }
    const judgeRaws = [null, judgeRaw({ done: true }), judgeRaw({ unmet: ['x'] }), judgeRaw({ idle: true, unmet: ['x'] }), judgeRaw({ blocked_on_human: [{ id: 'Q1', question: 'q' }] })];
    for (const cmd of Object.keys(JUDGE_ARGS)) {
      const a = okArgs(JUDGE_ARGS[cmd]);
      for (const raw of judgeRaws) {
        for (const c of confirms) {
          const d = decideAction(normalizeJudgment(raw, a), c, cmd);
          expect(ACTIONS).toContain(d.action);
          expect(REASONS).toContain(d.reason);
          seen.add(d.action).add(d.reason);
        }
      }
    }
    for (const reason of ['bad-args', 'engine-error']) {
      const r = buildResult({}, { action: 'fallback', reason }, null);
      expect(REASONS).toContain(r.reason);
      seen.add(r.reason);
    }
    // Every declared action and reason is reachable.
    for (const x of [...ACTIONS, ...REASONS]) expect(seen.has(x), x).toBe(true);
  });
});

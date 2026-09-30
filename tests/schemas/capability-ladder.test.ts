/**
 * Task 49 (FR-HM21, D22): capability-ladder.test.ts.
 * Extended by Task 56 (FR-HM4, FR-HM16, NFR-HM1) to assert level 2 is no
 * longer a placeholder, plus the single-engine-gate rule.
 *
 * FR-HM21 defines a 4-level capability ladder `review-code` and
 * `performance-audit` walk, in order, to select their reviewer-
 * orchestration strategy, selected purely by tool presence:
 *
 *   1. Pool routing (SendMessage + ListAgents + standing_pools.enabled + a
 *      running pool).
 *   2. Workflow engine (a `Workflow` tool + code_review.engine: workflow) —
 *      filled in by Task 56 (FR-HM16). The engine script itself
 *      (`workflows/review-code.js`) shipped in Task 57. On any host/config
 *      that doesn't meet the condition, this level degrades cleanly to
 *      level 3.
 *   3. Parallel subagent fan-out (a tool named Agent, Task, task,
 *      spawn_agent, or delegate_task).
 *   4. Sequential reviewers — today's baseline, the ladder's floor.
 *
 * This suite validates every Task 49 [T] acceptance criterion:
 *   - Levels 1, 3, and 4 are documented in
 *     plugins/synthex/docs/standing-pool-routing.md and match FR-HM21.
 *   - Neither routing doc names a host or uses the bare word "Workflows".
 *   - review-code-routing.test.ts and performance-audit-routing.test.ts
 *     were extended with ladder coverage (Task 49 also added assertions
 *     directly in those files; this suite spot-checks they exist).
 *   - tool-presence-gates.test.ts's KNOWN_UNGATED ratchet allowlist has no
 *     pool-related entries left (Task 47's two entries were fixed by
 *     properly gating the prose, not by allowlisting it).
 *   - GAP_MESSAGES covers the ladder's level-4 fallback, alongside the
 *     pre-existing pool gap message (gap-messages.test.ts has its own
 *     dedicated describe block for this; this suite spot-checks the
 *     GAP_MESSAGES export itself).
 *
 * Task 56 additions:
 *   - Level 2 is documented in full (config enables it, `Workflow` tool
 *     presence selects it, D31's opt-in and headless-allow-rule rules,
 *     a one-line fallback notice, and the invocation name — Task 57 later
 *     shipped the script behind that name).
 *   - `code_review.engine` gets exactly one gate: the ladder doc. Neither
 *     review-code.md nor performance-audit.md re-implements the check
 *     (the "single engine gate" rule).
 *   - `GAP_MESSAGES.engineFallback` exists and is printed verbatim at
 *     level 2, the same way `.ladderFallback` is printed at level 4.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GAP_MESSAGES } from '../../plugins/synthex/scripts/lib/host-matrix.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const docsRoot = join(repoRoot, 'plugins', 'synthex', 'docs');
const commandsRoot = join(repoRoot, 'plugins', 'synthex', 'commands');
const schemasRoot = join(repoRoot, 'tests', 'schemas');

const ROUTING_DOC_PATH = join(docsRoot, 'standing-pool-routing.md');
const PERF_ROUTING_DOC_PATH = join(docsRoot, 'standing-pool-routing-performance-audit.md');

const routingDoc = readFileSync(ROUTING_DOC_PATH, 'utf8');
const perfRoutingDoc = readFileSync(PERF_ROUTING_DOC_PATH, 'utf8');

const HOST_NAMES = ['Codex', 'Gemini', 'OpenCode', 'Grok', 'Hermes', 'Claude Code'];

function ladderSection(doc: string): string {
  const start = doc.indexOf('## Capability Ladder (FR-HM21)');
  expect(start).toBeGreaterThan(-1);
  return doc.slice(start);
}

describe('Task 49 (FR-HM21, D22): capability-ladder.test.ts', () => {
  describe('standing-pool-routing.md documents the ladder', () => {
    const section = ladderSection(routingDoc);

    it('has the Capability Ladder (FR-HM21) heading', () => {
      expect(routingDoc).toMatch(/^## Capability Ladder \(FR-HM21\)/m);
    });

    it('level 1 (pool routing) requires SendMessage, ListAgents, and standing_pools.enabled', () => {
      expect(section).toMatch(/\*\*Pool routing\.\*\*/);
      expect(section).toMatch(/`SendMessage`/);
      expect(section).toMatch(/`ListAgents`/);
      expect(section).toContain('standing_pools.enabled');
    });

    it('level 2 (Workflow engine) is fully documented, no longer a placeholder (Task 56)', () => {
      expect(section).toMatch(/\*\*Workflow engine\.\*\*/);
      expect(section).not.toMatch(/Workflow engine \(placeholder\)/);
      expect(section).not.toMatch(/not implemented/i);
      expect(section).toMatch(/`Workflow`/);
      expect(section).toContain('code_review.engine: workflow');
      expect(section).toMatch(/FR-HM16/);
    });

    it('level 2 documents the config-enables / tool-selects split (Task 56, FR-HM16)', () => {
      // The config key alone opts in; the Workflow tool's presence selects
      // this level at runtime — two independent conditions, both required.
      expect(section).toMatch(/`Workflow` tool is in your tool list and `code_review\.engine: workflow` is set/);
    });

    it('level 2 documents D31: the command prose is the opt-in, and the headless allow-rule', () => {
      expect(section).toMatch(/D31/);
      expect(section).toMatch(/a committed config key alone is not an opt-in/i);
      expect(section).toMatch(/Workflow\(synthex:<name>\)/);
      expect(section).toMatch(/permission allow rule/i);
    });

    it('level 2 names its invocation and the shipped script (Task 57)', () => {
      expect(section).toContain('synthex:review-code');
      expect(section).toContain('workflows/review-code.js');
      expect(section).toMatch(/Task 57/);
    });

    it('level 2 degrades cleanly when the Workflow tool or config condition is not met', () => {
      expect(section).toMatch(/degrades cleanly/);
      expect(section).toMatch(/continue down the ladder to level 3/);
      // Task 57 shipped the script — the fallback notice no longer hedges
      // on script availability, only on the Workflow tool/config condition.
      expect(section).not.toMatch(/script is not yet (shipped|available)/);
      expect(section).not.toMatch(/until Task 57 ships/);
    });

    it('level 3 (parallel fan-out) lists every FR-HM21 candidate tool name', () => {
      expect(section).toMatch(/\*\*Parallel subagent fan-out\.\*\*/);
      for (const tool of ['`Agent`', '`Task`', '`task`', '`spawn_agent`', '`delegate_task`']) {
        expect(section).toContain(tool);
      }
    });

    it('level 4 (sequential) is documented as the always-working floor, not a degraded mode', () => {
      expect(section).toMatch(/\*\*Sequential reviewers\.\*\*/);
      expect(section).toMatch(/today's baseline/);
      expect(section).toMatch(/not a degraded mode/);
    });

    it('the four levels are numbered 1 through 4 in order', () => {
      const numbers = [...section.matchAll(/^(\d)\. \*\*/gm)].map((m) => m[1]);
      expect(numbers).toEqual(['1', '2', '3', '4']);
    });

    it('documents the FR-HM42 depth-1 inline rule', () => {
      expect(section).toMatch(/Depth-1 inline rule \(FR-HM42\)/);
      expect(section).toMatch(/perform the reviewer roles inline/);
    });
  });

  describe('no host names or bare "Workflows" in either routing doc', () => {
    it.each([
      ['standing-pool-routing.md', routingDoc],
      ['standing-pool-routing-performance-audit.md', perfRoutingDoc],
    ])('%s never names a host', (_name, doc) => {
      for (const hostName of HOST_NAMES) {
        expect(doc).not.toContain(hostName);
      }
    });

    it.each([
      ['standing-pool-routing.md', routingDoc],
      ['standing-pool-routing-performance-audit.md', perfRoutingDoc],
    ])('%s never uses the bare word "Workflows"', (_name, doc) => {
      expect(doc).not.toMatch(/\bWorkflows\b/);
    });
  });

  describe('performance-audit-routing doc points at the canonical ladder', () => {
    it('cross-references the Capability Ladder section rather than duplicating it', () => {
      expect(perfRoutingDoc).toMatch(/## Capability Ladder \(FR-HM21\)/);
      expect(perfRoutingDoc).toContain('docs/standing-pool-routing.md');
    });
  });

  describe('review-code.md and performance-audit.md select level 3 vs. 4 by tool presence', () => {
    const reviewCode = readFileSync(join(commandsRoot, 'review-code.md'), 'utf8');
    const perfAudit = readFileSync(join(commandsRoot, 'performance-audit.md'), 'utf8');

    it.each([
      ['review-code.md', reviewCode],
      ['performance-audit.md', perfAudit],
    ])('%s gates Step 4 on the FR-HM21 level-3 tool list, with an otherwise branch', (_name, content) => {
      expect(content).toContain('FR-HM21 levels 3-4');
      expect(content).toMatch(
        /if a tool named `Agent`, `Task`, `task`, `spawn_agent`, or `delegate_task` is in your tool list/,
      );
      expect(content).toMatch(/\botherwise\b/i);
    });
  });

  describe('single engine gate (Task 56): the ladder doc is the only code_review.engine check', () => {
    const reviewCode = readFileSync(join(commandsRoot, 'review-code.md'), 'utf8');
    const perfAudit = readFileSync(join(commandsRoot, 'performance-audit.md'), 'utf8');

    it('review-code.md contains no code_review.engine check of its own', () => {
      expect(reviewCode).not.toContain('code_review.engine');
    });

    it('performance-audit.md contains no code_review.engine check of its own', () => {
      expect(perfAudit).not.toContain('code_review.engine');
    });

    it('no agent file re-implements the code_review.engine gate either', () => {
      const agentsRoot = join(repoRoot, 'plugins', 'synthex', 'agents');
      for (const name of readdirSync(agentsRoot)) {
        if (!name.endsWith('.md')) continue;
        const body = readFileSync(join(agentsRoot, name), 'utf8');
        expect(body, `${name} should not check code_review.engine`).not.toContain('code_review.engine');
      }
    });
  });

  describe('review-code-routing.test.ts and performance-audit-routing.test.ts were updated (Task 49)', () => {
    it.each([
      'review-code-routing.test.ts',
      'performance-audit-routing.test.ts',
    ])('%s has a Task 49 (FR-HM21) capability-ladder describe block', (fileName) => {
      const src = readFileSync(join(schemasRoot, fileName), 'utf8');
      expect(src).toMatch(/Task 49 \(FR-HM21\)/);
      expect(src).toContain('capability ladder');
    });
  });

  describe('KNOWN_UNGATED (tool-presence-gates.test.ts) has no pool entries', () => {
    const src = readFileSync(join(schemasRoot, 'tool-presence-gates.test.ts'), 'utf8');

    it('no longer allowlists stop-review-team.md', () => {
      expect(src).not.toMatch(/\{ file: 'plugins\/synthex\/commands\/stop-review-team\.md'/);
    });

    it('no longer allowlists team-orchestrator-bridge.md', () => {
      expect(src).not.toMatch(/\{ file: 'plugins\/synthex\/agents\/team-orchestrator-bridge\.md'/);
    });

    it('the two pool prose sites were fixed instead: their downstream SendMessage mention is no longer backticked', () => {
      // Both files legitimately still have ONE backticked `SendMessage` —
      // their own upstream tool-presence gate (Step 0 in stop-review-team.md;
      // the frontmatter `tools:` line and gate context in
      // team-orchestrator-bridge.md's caller). What Task 49 fixed was the
      // downstream OPERATIONAL mention further down each file, which no
      // longer uses backticks at all (it is plain prose naming an already-
      // available tool, not a capability branch).
      const stopReviewTeam = readFileSync(
        join(commandsRoot, 'stop-review-team.md'),
        'utf8',
      );
      const bridge = readFileSync(
        join(repoRoot, 'plugins', 'synthex', 'agents', 'team-orchestrator-bridge.md'),
        'utf8',
      );
      expect(stopReviewTeam).toMatch(/For each pool confirmed for stopping, send a SendMessage/);
      expect(stopReviewTeam).not.toMatch(/send a `SendMessage`/);
      expect(bridge).toMatch(/send a clarification SendMessage/);
      expect(bridge).not.toMatch(/clarification `SendMessage`/);
    });
  });

  describe('GAP_MESSAGES covers the ladder fallback (level 4)', () => {
    it('GAP_MESSAGES.ladderFallback exists alongside GAP_MESSAGES.pool', () => {
      expect(GAP_MESSAGES.pool).toBeTruthy();
      expect(GAP_MESSAGES.ladderFallback).toBeTruthy();
      expect(typeof GAP_MESSAGES.ladderFallback).toBe('string');
    });

    it('the ladder fallback message names every level-3 candidate tool and no host', () => {
      for (const tool of ['Agent', 'Task', 'task', 'spawn_agent', 'delegate_task']) {
        expect(GAP_MESSAGES.ladderFallback).toContain(tool);
      }
      for (const hostName of HOST_NAMES) {
        expect(GAP_MESSAGES.ladderFallback).not.toContain(hostName);
      }
    });

    it('standing-pool-routing.md prints GAP_MESSAGES.ladderFallback verbatim at level 4', () => {
      expect(routingDoc).toContain(GAP_MESSAGES.ladderFallback);
    });
  });

  // ── Task 56 (FR-HM16): GAP_MESSAGES covers the level-2 engine fallback ──
  describe('GAP_MESSAGES.engineFallback exists (Task 56, FR-HM16)', () => {
    it('is a single-sourced, non-empty, single-line sentence naming no host', () => {
      expect(GAP_MESSAGES.engineFallback).toBeTruthy();
      expect(typeof GAP_MESSAGES.engineFallback).toBe('string');
      expect(GAP_MESSAGES.engineFallback).not.toContain('\n');
      for (const hostName of HOST_NAMES) {
        expect(GAP_MESSAGES.engineFallback).not.toContain(hostName);
      }
      expect(GAP_MESSAGES.engineFallback).not.toMatch(/\bWorkflows\b/);
    });

    it('mentions code_review.engine and the Workflow tool', () => {
      expect(GAP_MESSAGES.engineFallback).toContain('code_review.engine');
      expect(GAP_MESSAGES.engineFallback).toContain('Workflow');
    });

    it('standing-pool-routing.md prints GAP_MESSAGES.engineFallback verbatim at level 2', () => {
      expect(routingDoc).toContain(GAP_MESSAGES.engineFallback);
    });
  });
});

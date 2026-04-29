/**
 * Task 85 (Phase 11.2): Codex doc hardening — probe caching + latency note + JSON-RPC id correlation.
 *
 * [T] criteria from the plan:
 *   1. Step 4 contains the literal phrase "Cache the `codex app-server --help` probe result"
 *   2. "Performance characteristics" subsection or paragraph present in requestApproval Proxying
 *      with the literal phrase "round-trip per tool-use" (raw-string check)
 *   3. JSON-RPC id correlation rule with the literal phrase "MUST verify `response.id == pending_request.id`"
 *   4. Layer 2 fixture directory exists with fixture.json, expected-envelope.json (or equivalent), and scenario.md
 *   5. Layer 2 fixture asserts the adapter drops the mismatched response and continues waiting
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..');
const AGENT = join(REPO_ROOT, 'plugins', 'synthex', 'agents', 'codex-review-prompter.md');
const FIX_DIR = join(
  REPO_ROOT,
  'tests',
  'fixtures',
  'multi-model-review',
  'adapters',
  'codex',
  'app-server-id-mismatch',
);

describe('Task 85 [T] (1): probe caching contract documented in Step 4', () => {
  let content: string;
  beforeAll(() => {
    content = readFileSync(AGENT, 'utf8');
  });

  it('Step 4 contains the literal probe-caching sentence', () => {
    expect(content).toContain('Cache the `codex app-server --help` probe result');
  });

  it('caching contract specifies adapter-invocation lifetime + session persistence', () => {
    expect(content).toMatch(/lifetime of the adapter invocation.*Claude session/s);
  });

  it('caching contract documents invalidation on cold-start', () => {
    expect(content).toMatch(/cold-start|new Claude session|upgrade.*takes effect/i);
  });
});

describe('Task 85 [T] (2): "Performance characteristics" note in requestApproval Proxying', () => {
  let content: string;
  beforeAll(() => {
    content = readFileSync(AGENT, 'utf8');
  });

  it('contains a Performance characteristics heading or paragraph', () => {
    expect(content).toMatch(/Performance characteristics|performance.*trade.?off/i);
  });

  it('contains the literal phrase "round-trip per tool-use" (raw-string check)', () => {
    expect(content).toContain('round-trip per tool-use');
  });

  it('quantifies estimated round-trip latency (500ms-2s range)', () => {
    expect(content).toMatch(/500ms.*2s|500.*–.*2s/);
  });

  it('compares Pattern 3 O(N) overhead against Pattern 1 O(1) baseline', () => {
    expect(content).toMatch(/O\(N\)|O\(1\)/);
  });

  it('recommends Pattern 1 for latency-sensitive contexts', () => {
    expect(content).toMatch(/prefer Pattern 1|latency-sensitive/i);
  });
});

describe('Task 85 [T] (3): JSON-RPC id correlation rule', () => {
  let content: string;
  beforeAll(() => {
    content = readFileSync(AGENT, 'utf8');
  });

  it('contains the literal id-correlation rule sentence', () => {
    expect(content).toContain(
      'MUST verify `response.id == pending_request.id`',
    );
  });

  it('documents the drop-and-continue behavior on mismatch', () => {
    expect(content).toMatch(/drop the mismatched response.*continue waiting|drop.*mismatch/i);
  });

  it('documents the security rationale (TOCTOU / id-confusion attack)', () => {
    expect(content).toMatch(/TOCTOU|approve a different tool invocation|stale or misrouted/i);
  });
});

describe('Task 85 [T] (4): Layer 2 fixture directory exists with required files', () => {
  it('fixture directory exists', () => {
    expect(existsSync(FIX_DIR)).toBe(true);
  });

  it('fixture.json exists', () => {
    expect(existsSync(join(FIX_DIR, 'fixture.json'))).toBe(true);
  });

  it('scenario.md exists', () => {
    expect(existsSync(join(FIX_DIR, 'scenario.md'))).toBe(true);
  });
});

describe('Task 85 [T] (5): Layer 2 fixture asserts adapter drops mismatched response and continues waiting', () => {
  let fixture: any;
  let scenario: string;

  beforeAll(() => {
    fixture = JSON.parse(readFileSync(join(FIX_DIR, 'fixture.json'), 'utf8'));
    scenario = readFileSync(join(FIX_DIR, 'scenario.md'), 'utf8');
  });

  it('fixture declares parent-mediated permission mode', () => {
    expect(fixture.permission_mode).toBe('parent-mediated');
  });

  it('fixture has exactly one outstanding requestApproval (id=req-001)', () => {
    const reqs = fixture.stdout_messages.filter(
      (m: any) => m.kind === 'request-approval',
    );
    expect(reqs).toHaveLength(1);
    expect(reqs[0].envelope.id).toBe('req-001');
  });

  it('fixture includes a mismatched parent decision (id=req-002)', () => {
    const mismatched = fixture.parent_decisions_received.find(
      (d: any) => d.id_correlation === 'MISMATCH',
    );
    expect(mismatched).toBeDefined();
    expect(mismatched.envelope.id).toBe('req-002');
    expect(mismatched.expected_adapter_action).toMatch(/drop/i);
  });

  it('fixture includes the correctly-correlated decision (id=req-001) following the mismatch', () => {
    const correlated = fixture.parent_decisions_received.find(
      (d: any) => d.id_correlation === 'MATCH',
    );
    expect(correlated).toBeDefined();
    expect(correlated.envelope.id).toBe('req-001');
    expect(correlated.expected_adapter_action).toMatch(/write to Codex stdin/i);
  });

  it('expected_adapter_behavior records that ONLY the correlated response is written to Codex stdin', () => {
    expect(fixture.expected_adapter_behavior.writes_to_codex_stdin).toHaveLength(1);
    expect(fixture.expected_adapter_behavior.writes_to_codex_stdin[0].id).toBe(
      'req-001',
    );
  });

  it('expected_adapter_behavior records the mismatched response was dropped', () => {
    expect(fixture.expected_adapter_behavior.drops_mismatched_responses).toHaveLength(1);
    expect(fixture.expected_adapter_behavior.drops_mismatched_responses[0].id).toBe(
      'req-002',
    );
  });

  it('expected_adapter_behavior records a WARN was emitted for the mismatch', () => {
    expect(fixture.expected_adapter_behavior.warns_emitted).toBeGreaterThanOrEqual(1);
  });

  it('scenario.md describes the id-correlation enforcement rule', () => {
    expect(scenario).toContain('id correlation');
    expect(scenario).toMatch(/MUST verify|drops the mismatched/i);
  });

  it('scenario.md references the security CWE (TOCTOU / CWE-345)', () => {
    expect(scenario).toMatch(/TOCTOU|CWE-345|MEDIUM #2/i);
  });
});

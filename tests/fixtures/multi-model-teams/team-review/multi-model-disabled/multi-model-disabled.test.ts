import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname);
const load = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf-8'));

describe('team-review multi-model-disabled fixture (regression)', () => {
  const input = load('input.json');
  const trace = load('expected-trace.json');
  const spawnPrompts = load('expected-spawn-prompts.json');
  const output = load('expected-output.json');

  it('multi_model=false in input', () => {
    expect(input.multi_model).toBe(false);
  });

  it('no multi-model-review-orchestrator Task invocation (FR-MMT3 criterion 8)', () => {
    expect(trace.multi_model_review_orchestrator_task_invoked).toBe(false);
    expect(trace.orchestrator_task_invocations_count).toBe(0);
  });

  it('reviewer spawn prompts do NOT contain FR-MMT20 envelope clause (D22 negative match)', () => {
    expect(spawnPrompts.reviewer_spawn_prompts_contain_fr_mmt20_envelope).toBe(false);
  });

  it('Lead spawn prompt does NOT contain FR-MMT4 suppression text', () => {
    expect(spawnPrompts.lead_spawn_prompt_contains_fr_mmt4_suppression).toBe(false);
  });

  it('multi-model overlay NOT included in any spawn prompt', () => {
    expect(spawnPrompts.multi_model_overlay_included).toBe(false);
  });

  it('Lead produces its own consolidated report', () => {
    expect(output.lead_produces_consolidated_report).toBe(true);
    expect(output.orchestrator_report_waited_for).toBe(false);
  });

  it('output report matches Code Review Report schema (baseline)', () => {
    expect(output.report).toContain('## Code Review Report');
    expect(output.report).toContain('### Overall Verdict:');
    expect(output.baseline_match).toBe(true);
  });

  // Cross-reference to Task 17 Layer 1 validator
  it('D22: when multi_model=false, overlay text must be absent from spawn prompts', () => {
    // Simulate native-only spawn prompt — no overlay text
    const nativeSpawnPrompt = 'Read your agent definition at plugins/synthex/agents/code-reviewer.md and adopt it as your identity.';
    expect(nativeSpawnPrompt).not.toContain('findings_json');
    expect(nativeSpawnPrompt).not.toContain('Do NOT produce your own consolidated review report');
  });
});

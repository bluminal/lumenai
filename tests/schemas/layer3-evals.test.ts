/**
 * Layer 1 structural tests for Layer 3 eval files.
 *
 * Tasks 61, 61a, 62: Verifies that the Layer 3 promptfoo eval configs and baseline
 * doc exist with the correct structure, tags, and cross-references.
 *
 * The ACTUAL Layer 3 evals (LLM-as-judge, live CLI) are manual-trigger only
 * per CLAUDE.md testing pyramid. These tests are Layer 1 structural checks that
 * run on every PR at zero LLM cost.
 *
 * Source authority:
 * - CLAUDE.md (testing pyramid: Layer 3 manual-trigger convention)
 * - NFR-MR6 (consistent output contract)
 * - NFR-MR3 (parallel execution wall-clock bound)
 * - FR-MR12 (single-batch parallel fan-out)
 * - FR-MR15 / Task 26 (Stage 4 position-randomization)
 * - Task 62 (test baseline establishment)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

// ── Path constants ─────────────────────────────────────────────────────────────

const TESTS_ROOT = path.join(__dirname, '..');

const CONSOLIDATION_JUDGE_YAML = path.join(
  TESTS_ROOT,
  'promptfoo',
  'multi-model-review',
  'orchestrator-consolidation-judge.yaml'
);

const RUNTIME_CHECKS_YAML = path.join(
  TESTS_ROOT,
  'promptfoo',
  'multi-model-review',
  'orchestrator-runtime-checks.yaml'
);

const CORPUS_DIR = path.join(
  TESTS_ROOT,
  'promptfoo',
  'multi-model-review',
  'corpus'
);

const TEST_BASELINE_MD = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'specs',
  'multi-model-review',
  'test-baseline.md'
);

// ── Helpers ─────────────────────────────────────────────────────────────────────

function readFile(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function parseYaml(p: string): Record<string, unknown> {
  return yaml.load(readFile(p)) as Record<string, unknown>;
}

function hasTags(parsed: Record<string, unknown>, ...requiredTags: string[]): boolean {
  const tags = parsed.tags;
  if (!Array.isArray(tags)) return false;
  return requiredTags.every((t) => tags.includes(t));
}

function getTests(parsed: Record<string, unknown>): Array<Record<string, unknown>> {
  return (parsed.tests as Array<Record<string, unknown>>) ?? [];
}

// ── 1. orchestrator-consolidation-judge.yaml (Task 61) ─────────────────────────

describe('Task 61: orchestrator-consolidation-judge.yaml', () => {
  let parsed: Record<string, unknown>;

  beforeAll(() => {
    parsed = parseYaml(CONSOLIDATION_JUDGE_YAML);
  });

  it('file exists', () => {
    expect(fs.existsSync(CONSOLIDATION_JUDGE_YAML)).toBe(true);
  });

  it('is valid YAML (parsed without error)', () => {
    // parseYaml would throw in beforeAll if invalid; reaching here means valid
    expect(parsed).toBeTruthy();
  });

  it('[T] tags include layer3', () => {
    expect(hasTags(parsed, 'layer3')).toBe(true);
  });

  it('[T] tags include manual-trigger-only', () => {
    expect(hasTags(parsed, 'manual-trigger-only')).toBe(true);
  });

  it('[T] tags include mmr', () => {
    expect(hasTags(parsed, 'mmr')).toBe(true);
  });

  it('has a description field', () => {
    expect(typeof parsed.description).toBe('string');
    expect((parsed.description as string).length).toBeGreaterThan(0);
  });

  it('description references Layer 3 semantic eval', () => {
    expect(parsed.description as string).toContain('Layer 3');
  });

  it('description references manual-trigger-only', () => {
    expect(parsed.description as string).toContain('manual-trigger');
  });

  it('has a providers array', () => {
    expect(Array.isArray(parsed.providers)).toBe(true);
    expect((parsed.providers as unknown[]).length).toBeGreaterThan(0);
  });

  it('uses anthropic:claude-3-5-sonnet as judge provider', () => {
    const providers = parsed.providers as Array<Record<string, unknown>>;
    const ids = providers.map((p) => p.id as string);
    expect(ids.some((id) => id.includes('claude-3-5-sonnet'))).toBe(true);
  });

  it('has at least 5 test entries (5 corpus scenarios)', () => {
    const tests = getTests(parsed);
    expect(tests.length).toBeGreaterThanOrEqual(5);
  });

  it('includes FR-MR12 Task-call-sequencing eval (scenario 06)', () => {
    const tests = getTests(parsed);
    const hasTrace = tests.some((t) => {
      const desc = (t.description as string) ?? '';
      const vars = (t.vars as Record<string, string>) ?? {};
      return (
        desc.toLowerCase().includes('fr-mr12') ||
        desc.toLowerCase().includes('single-batch') ||
        desc.toLowerCase().includes('sequencing') ||
        (typeof vars.trace_file === 'string' && vars.trace_file.includes('fanout-trace'))
      );
    });
    expect(hasTrace).toBe(true);
  });

  it('FR-MR12 eval uses threshold >= 0.9', () => {
    const tests = getTests(parsed);
    const traceTest = tests.find((t) => {
      const desc = (t.description as string) ?? '';
      const vars = (t.vars as Record<string, string>) ?? {};
      return (
        desc.toLowerCase().includes('fr-mr12') ||
        desc.toLowerCase().includes('single-batch') ||
        (typeof vars.trace_file === 'string' && vars.trace_file.includes('fanout-trace'))
      );
    });
    expect(traceTest).toBeTruthy();
    const asserts = (traceTest!.assert as Array<Record<string, unknown>>) ?? [];
    const rubricAssert = asserts.find((a) => a.type === 'llm-rubric');
    expect(rubricAssert).toBeTruthy();
    expect((rubricAssert!.threshold as number)).toBeGreaterThanOrEqual(0.9);
  });

  it('all consolidation-quality tests use llm-rubric assertion type', () => {
    const tests = getTests(parsed);
    // All tests that are NOT the FR-MR12 trace should have an llm-rubric assert
    const scenarioTests = tests.filter((t) => {
      const vars = (t.vars as Record<string, string>) ?? {};
      return typeof vars.scenario_file === 'string';
    });
    expect(scenarioTests.length).toBeGreaterThanOrEqual(5);
    for (const test of scenarioTests) {
      const asserts = (test.assert as Array<Record<string, unknown>>) ?? [];
      const hasRubric = asserts.some((a) => a.type === 'llm-rubric');
      expect(hasRubric).toBe(true);
    }
  });

  it('all consolidation-quality tests reference a corpus/ scenario file', () => {
    const tests = getTests(parsed);
    const scenarioTests = tests.filter((t) => {
      const vars = (t.vars as Record<string, string>) ?? {};
      return typeof vars.scenario_file === 'string';
    });
    expect(scenarioTests.length).toBeGreaterThanOrEqual(5);
    for (const test of scenarioTests) {
      const vars = test.vars as Record<string, string>;
      expect(vars.scenario_file).toMatch(/corpus\//);
    }
  });

  it('source authority block references NFR-MR6', () => {
    const raw = readFile(CONSOLIDATION_JUDGE_YAML);
    expect(raw).toContain('NFR-MR6');
  });

  it('source authority block references FR-MR12', () => {
    const raw = readFile(CONSOLIDATION_JUDGE_YAML);
    expect(raw).toContain('FR-MR12');
  });
});

// ── 2. orchestrator-runtime-checks.yaml (Task 61a) ─────────────────────────────

describe('Task 61a: orchestrator-runtime-checks.yaml', () => {
  let parsed: Record<string, unknown>;

  beforeAll(() => {
    parsed = parseYaml(RUNTIME_CHECKS_YAML);
  });

  it('file exists', () => {
    expect(fs.existsSync(RUNTIME_CHECKS_YAML)).toBe(true);
  });

  it('is valid YAML (parsed without error)', () => {
    expect(parsed).toBeTruthy();
  });

  it('[T] tags include layer3', () => {
    expect(hasTags(parsed, 'layer3')).toBe(true);
  });

  it('[T] tags include manual-trigger-only', () => {
    expect(hasTags(parsed, 'manual-trigger-only')).toBe(true);
  });

  it('[T] tags include live', () => {
    expect(hasTags(parsed, 'live')).toBe(true);
  });

  it('[T] tags include requires-clis', () => {
    expect(hasTags(parsed, 'requires-clis')).toBe(true);
  });

  it('[T] tags include mmr', () => {
    expect(hasTags(parsed, 'mmr')).toBe(true);
  });

  it('description references NFR-MR3 wall-clock', () => {
    const desc = parsed.description as string;
    expect(desc).toMatch(/NFR-MR3|wall.clock/i);
  });

  it('description references position randomization / Stage 4', () => {
    const desc = parsed.description as string;
    expect(desc).toMatch(/position.randomi|Stage 4/i);
  });

  it('description states LIVE CLI access required', () => {
    const desc = parsed.description as string;
    expect(desc).toMatch(/LIVE|live.*CLI|CLI.*required/i);
  });

  it('has both NFR-MR3 wall-clock test and position-randomization test', () => {
    const tests = getTests(parsed);
    expect(tests.length).toBeGreaterThanOrEqual(2);

    const hasWallClock = tests.some((t) => {
      const desc = (t.description as string) ?? '';
      return desc.toLowerCase().includes('wall-clock') || desc.toLowerCase().includes('nfr-mr3');
    });
    expect(hasWallClock).toBe(true);

    const hasPositionRandom = tests.some((t) => {
      const desc = (t.description as string) ?? '';
      return (
        desc.toLowerCase().includes('position') ||
        desc.toLowerCase().includes('randomiz') ||
        desc.toLowerCase().includes('stage 4')
      );
    });
    expect(hasPositionRandom).toBe(true);
  });

  it('NFR-MR3 wall-clock test uses javascript assertion type', () => {
    const tests = getTests(parsed);
    const wallClockTest = tests.find((t) => {
      const desc = (t.description as string) ?? '';
      return desc.toLowerCase().includes('wall-clock') || desc.toLowerCase().includes('nfr-mr3');
    });
    expect(wallClockTest).toBeTruthy();
    const asserts = (wallClockTest!.assert as Array<Record<string, unknown>>) ?? [];
    const hasJs = asserts.some((a) => a.type === 'javascript');
    expect(hasJs).toBe(true);
  });

  it('NFR-MR3 wall-clock test references 1.5× bound in its JavaScript assertion', () => {
    const tests = getTests(parsed);
    const wallClockTest = tests.find((t) => {
      const desc = (t.description as string) ?? '';
      return desc.toLowerCase().includes('wall-clock') || desc.toLowerCase().includes('nfr-mr3');
    });
    const asserts = (wallClockTest!.assert as Array<Record<string, unknown>>) ?? [];
    const jsAssert = asserts.find((a) => a.type === 'javascript');
    expect((jsAssert!.value as string)).toMatch(/1\.5/);
  });

  it('position-randomization test uses javascript assertion type', () => {
    const tests = getTests(parsed);
    const posTest = tests.find((t) => {
      const desc = (t.description as string) ?? '';
      return desc.toLowerCase().includes('position') || desc.toLowerCase().includes('randomiz');
    });
    expect(posTest).toBeTruthy();
    const asserts = (posTest!.assert as Array<Record<string, unknown>>) ?? [];
    const hasJs = asserts.some((a) => a.type === 'javascript');
    expect(hasJs).toBe(true);
  });

  it('position-randomization test checks that order flips between invocations', () => {
    const tests = getTests(parsed);
    const posTest = tests.find((t) => {
      const desc = (t.description as string) ?? '';
      return desc.toLowerCase().includes('position') || desc.toLowerCase().includes('randomiz');
    });
    const asserts = (posTest!.assert as Array<Record<string, unknown>>) ?? [];
    const jsAssert = asserts.find((a) => a.type === 'javascript');
    // The JS code should reference stage4_invocation_1_prompt and stage4_invocation_2_prompt
    const value = jsAssert!.value as string;
    expect(value).toContain('stage4_invocation_1_prompt');
    expect(value).toContain('stage4_invocation_2_prompt');
  });

  it('source authority block references NFR-MR3', () => {
    const raw = readFile(RUNTIME_CHECKS_YAML);
    expect(raw).toContain('NFR-MR3');
  });

  it('source authority block references FR-MR15', () => {
    const raw = readFile(RUNTIME_CHECKS_YAML);
    expect(raw).toContain('FR-MR15');
  });

  it('source authority block references Task 26', () => {
    const raw = readFile(RUNTIME_CHECKS_YAML);
    expect(raw).toContain('Task 26');
  });
});

// ── 3. Corpus directory (Task 61) ───────────────────────────────────────────────

describe('Task 61: corpus directory has required scenario files', () => {
  it('corpus directory exists', () => {
    expect(fs.existsSync(CORPUS_DIR)).toBe(true);
  });

  it('has at least 5 scenario files', () => {
    const files = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it('01-security-csrf.json exists', () => {
    expect(fs.existsSync(path.join(CORPUS_DIR, '01-security-csrf.json'))).toBe(true);
  });

  it('02-performance-n-plus-one.json exists', () => {
    expect(fs.existsSync(path.join(CORPUS_DIR, '02-performance-n-plus-one.json'))).toBe(true);
  });

  it('03-correctness-race-condition.json exists', () => {
    expect(fs.existsSync(path.join(CORPUS_DIR, '03-correctness-race-condition.json'))).toBe(true);
  });

  it('04-design-tokens.json exists', () => {
    expect(fs.existsSync(path.join(CORPUS_DIR, '04-design-tokens.json'))).toBe(true);
  });

  it('05-plan-review.json exists', () => {
    expect(fs.existsSync(path.join(CORPUS_DIR, '05-plan-review.json'))).toBe(true);
  });

  it('06-fanout-trace.json exists (FR-MR12 trace)', () => {
    expect(fs.existsSync(path.join(CORPUS_DIR, '06-fanout-trace.json'))).toBe(true);
  });

  it('all corpus JSON files are valid JSON', () => {
    const files = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const p = path.join(CORPUS_DIR, file);
      expect(() => JSON.parse(readFile(p)), `${file} must be valid JSON`).not.toThrow();
    }
  });

  it('each corpus scenario file has a scenario field', () => {
    const files = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const data = JSON.parse(readFile(path.join(CORPUS_DIR, file)));
      expect(typeof data.scenario, `${file} must have a scenario field`).toBe('string');
    }
  });

  it('each consolidation corpus file (01–05) has raw_findings and consolidated_output', () => {
    const consolidationFiles = ['01-security-csrf.json', '02-performance-n-plus-one.json', '03-correctness-race-condition.json', '04-design-tokens.json', '05-plan-review.json'];
    for (const file of consolidationFiles) {
      const data = JSON.parse(readFile(path.join(CORPUS_DIR, file)));
      expect(Array.isArray(data.raw_findings), `${file} must have raw_findings array`).toBe(true);
      expect(typeof data.consolidated_output, `${file} must have consolidated_output`).toBe('object');
    }
  });

  it('06-fanout-trace.json has task_dispatch_log and fr_mr12_assertions', () => {
    const trace = JSON.parse(readFile(path.join(CORPUS_DIR, '06-fanout-trace.json')));
    expect(Array.isArray(trace.task_dispatch_log)).toBe(true);
    expect(typeof trace.fr_mr12_assertions).toBe('object');
  });

  it('06-fanout-trace.json fr_mr12_assertions.all_dispatched_in_single_batch is true', () => {
    const trace = JSON.parse(readFile(path.join(CORPUS_DIR, '06-fanout-trace.json')));
    expect(trace.fr_mr12_assertions.all_dispatched_in_single_batch).toBe(true);
  });

  it('06-fanout-trace.json fr_mr12_assertions.any_proposer_dispatched_after_another_response is false', () => {
    const trace = JSON.parse(readFile(path.join(CORPUS_DIR, '06-fanout-trace.json')));
    expect(trace.fr_mr12_assertions.any_proposer_dispatched_after_another_response).toBe(false);
  });
});

// ── 4. docs/specs/multi-model-review/test-baseline.md (Task 62) ───────────────

describe('Task 62: test-baseline.md', () => {
  let content: string;

  beforeAll(() => {
    content = readFile(TEST_BASELINE_MD);
  });

  it('file exists', () => {
    expect(fs.existsSync(TEST_BASELINE_MD)).toBe(true);
  });

  it('contains "## Status: Final"', () => {
    expect(content).toContain('## Status: Final');
  });

  it('contains expected-pass-rates section or table', () => {
    const hasPassRates =
      content.includes('Expected pass rates') ||
      content.includes('expected pass rates') ||
      content.includes('pass rate');
    expect(hasPassRates).toBe(true);
  });

  it('documents 80% pass rate baseline for consolidation scenarios', () => {
    expect(content).toMatch(/80%|4 of 5|≥ 80/);
  });

  it('documents 100% requirement for FR-MR12 structural eval', () => {
    expect(content).toMatch(/100%.*FR-MR12|FR-MR12.*100%|100%.*single.batch/i);
  });

  it('contains CI integration plan section', () => {
    const hasCiPlan =
      content.includes('CI integration') ||
      content.includes('CI Integration') ||
      content.includes('CI integration plan');
    expect(hasCiPlan).toBe(true);
  });

  it('CI integration plan states Layer 3 is manual-trigger only', () => {
    expect(content).toMatch(/manual.trigger only|manual-trigger only/i);
  });

  it('CI integration plan specifies per-release trigger', () => {
    expect(content).toMatch(/per.release|Per-release|release candidate/i);
  });

  it('regression policy is documented', () => {
    const hasPolicy =
      content.includes('Regression policy') ||
      content.includes('Regression Policy') ||
      content.includes('regression policy');
    expect(hasPolicy).toBe(true);
  });

  // Cross-reference checks
  it('references NFR-MR6', () => {
    expect(content).toContain('NFR-MR6');
  });

  it('references NFR-MR3', () => {
    expect(content).toContain('NFR-MR3');
  });

  it('references FR-MR12', () => {
    expect(content).toContain('FR-MR12');
  });

  it('references Task 26 (Stage 4 position-randomization)', () => {
    expect(content).toContain('Task 26');
  });
});

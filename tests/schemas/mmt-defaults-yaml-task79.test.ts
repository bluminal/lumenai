import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadDefaultsYaml, loadDefaultsYamlText } from '../helpers/load-defaults';

const PLAN_PATH = join(__dirname, '..', '..', 'docs', 'plans', 'multi-model-teams.md');

describe('Task 79 (MMT): ADR-003 in plan Decisions table', () => {
  let planContent: string;

  beforeAll(() => {
    planContent = readFileSync(PLAN_PATH, 'utf8');
  });

  it('plan Decisions table contains ADR-003 identifier', () => {
    expect(planContent).toContain('ADR-003');
  });

  it('plan Decisions table contains Pattern 1 (read-only) description', () => {
    expect(planContent).toContain('Pattern 1 (read-only)');
  });

  it('plan Decisions table contains Pattern 2 (sandbox-yolo) description', () => {
    expect(planContent).toContain('Pattern 2 (sandbox-yolo)');
  });

  it('plan Decisions table contains Pattern 3 (parent-mediated) description', () => {
    expect(planContent).toContain('Pattern 3 (parent-mediated)');
  });

  it('ADR-003 and all three pattern descriptions appear in the same D27 row', () => {
    const lines = planContent.split('\n');
    const d27Line = lines.find((l) => l.includes('D27') && l.includes('ADR-003'));
    expect(d27Line).toBeDefined();
    expect(d27Line).toContain('Pattern 1 (read-only)');
    expect(d27Line).toContain('Pattern 2 (sandbox-yolo)');
    expect(d27Line).toContain('Pattern 3 (parent-mediated)');
  });
});

describe('Task 79 (MMT): multi_model_review.external_permission_mode config key', () => {
  let content: string;
  let parsed: any;

  beforeAll(async () => {
    content = loadDefaultsYamlText();
    parsed = await loadDefaultsYaml();
  });

  it('defaults.yaml parses as valid YAML (regression)', () => {
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
  });

  it('multi_model_review.external_permission_mode exists', () => {
    expect(parsed.multi_model_review).toBeDefined();
    expect(parsed.multi_model_review.external_permission_mode).toBeDefined();
  });

  it('multi_model_review.external_permission_mode.default is read-only', () => {
    expect(parsed.multi_model_review.external_permission_mode.default).toBe('read-only');
  });

  it('ADR-003 / D27 comment reference is present in the file', () => {
    expect(content).toMatch(/ADR-003/);
  });

  it('inline docs reference Pattern 1 (read-only)', () => {
    expect(content).toContain('Pattern 1');
    expect(content).toContain('read-only');
  });

  it('inline docs reference Pattern 2 (sandbox-yolo)', () => {
    expect(content).toContain('Pattern 2');
    expect(content).toContain('sandbox-yolo');
  });

  it('inline docs reference Pattern 3 (parent-mediated)', () => {
    expect(content).toContain('Pattern 3');
    expect(content).toContain('parent-mediated');
  });

  it('inline docs explain when to use each mode (parent-mediated explanation)', () => {
    // Verify the approval-proxying explanation is present in the comments
    expect(content).toContain('proxies tool-use approval requests');
  });

  it('inline docs explain when to use each mode (sandbox-yolo requires confirmation)', () => {
    expect(content).toContain('explicit user confirmation');
  });
});

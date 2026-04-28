import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DEFAULTS_PATH = join(__dirname, '..', '..', 'plugins', 'synthex', 'config', 'defaults.yaml');

describe('Task 2 (MMT): multi_model_review MMT extensions in defaults.yaml', () => {
  let content: string;
  let parsed: any;

  beforeAll(async () => {
    content = readFileSync(DEFAULTS_PATH, 'utf8');
    try {
      const yaml = await import('yaml');
      parsed = yaml.parse(content);
    } catch {
      const yaml = await import('js-yaml');
      parsed = (yaml as any).load(content);
    }
  });

  it('defaults.yaml parses as valid YAML', () => {
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
  });

  describe('FR-MMT3: per_command.team_review.enabled', () => {
    it('multi_model_review.per_command.team_review exists', () => {
      expect(parsed.multi_model_review).toBeDefined();
      expect(parsed.multi_model_review.per_command).toBeDefined();
      expect(parsed.multi_model_review.per_command.team_review).toBeDefined();
    });

    it('multi_model_review.per_command.team_review.enabled defaults to false', () => {
      expect(parsed.multi_model_review.per_command.team_review.enabled).toBe(false);
    });

    it('FR-MMT3 inline comment reference is present in the file', () => {
      expect(content).toMatch(/FR-MMT3/);
    });

    it('team_review.enabled inline comment mentions FR-MMT3 and multi-model orchestration', () => {
      // Find the line containing team_review enabled and verify the FR ref is nearby
      const lines = content.split('\n');
      const idx = lines.findIndex((l) => l.includes('team_review:'));
      expect(idx).toBeGreaterThan(-1);
      const window = lines.slice(idx, idx + 5).join('\n');
      expect(window).toMatch(/FR-MMT3/);
    });
  });

  describe('FR-MMT30a: audit.record_finding_attribution_telemetry', () => {
    it('multi_model_review.audit.record_finding_attribution_telemetry exists', () => {
      expect(parsed.multi_model_review).toBeDefined();
      expect(parsed.multi_model_review.audit).toBeDefined();
      expect(parsed.multi_model_review.audit.record_finding_attribution_telemetry).toBeDefined();
    });

    it('multi_model_review.audit.record_finding_attribution_telemetry defaults to true', () => {
      expect(parsed.multi_model_review.audit.record_finding_attribution_telemetry).toBe(true);
    });

    it('FR-MMT30a inline comment reference is present in the file', () => {
      expect(content).toMatch(/FR-MMT30a/);
    });

    it('record_finding_attribution_telemetry comment references attribution telemetry fields', () => {
      const lines = content.split('\n');
      const idx = lines.findIndex((l) => l.includes('record_finding_attribution_telemetry'));
      expect(idx).toBeGreaterThan(-1);
      // The comment line directly above should mention FR-MMT30a and telemetry fields
      const window = lines.slice(Math.max(0, idx - 3), idx + 1).join('\n');
      expect(window).toMatch(/FR-MMT30a/);
      expect(window).toMatch(/consolidated_finding_id|raised_by|consensus_count|minority_of_one/);
    });
  });

  describe('Regression: existing per_command keys still present (parent plan consumers)', () => {
    it('multi_model_review.per_command.review_code still exists', () => {
      expect(parsed.multi_model_review.per_command.review_code).toBeDefined();
    });

    it('multi_model_review.per_command.review_code.enabled is false', () => {
      expect(parsed.multi_model_review.per_command.review_code.enabled).toBe(false);
    });

    it('multi_model_review.per_command.write_implementation_plan still exists', () => {
      expect(parsed.multi_model_review.per_command.write_implementation_plan).toBeDefined();
    });

    it('multi_model_review.per_command.write_implementation_plan.enabled is false', () => {
      expect(parsed.multi_model_review.per_command.write_implementation_plan.enabled).toBe(false);
    });
  });
});

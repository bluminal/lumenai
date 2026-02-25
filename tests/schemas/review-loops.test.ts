/**
 * Layer 1: Schema validation tests for the review loop mechanism.
 *
 * These tests validate the *definitions* (markdown commands and YAML config),
 * not runtime behavior. They catch regressions where:
 * - Someone removes fresh-agent-per-cycle instructions from a command
 * - Someone reverts to stale max_review_cycles config keys
 * - The global review_loops config section is removed or malformed
 * - A command loses its compact carry-forward instructions
 *
 * Cost: $0 (no LLM calls — pure file parsing)
 */

import { describe, it, expect } from 'vitest';
import {
  validateGlobalConfig,
  validateCommandReviewLoop,
  checkStaleConfigReferences,
  extractYamlSection,
  loadDefaultsYaml,
  loadCommand,
  COMMANDS_WITH_REVIEW_LOOPS,
} from './review-loops.js';

// ── Config Structure Tests ───────────────────────────────────────

describe('defaults.yaml — Global Review Loops Config', () => {
  const yaml = loadDefaultsYaml();

  it('passes global config validation', () => {
    const result = validateGlobalConfig(yaml);
    expect(result.errors, `Config errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('has a top-level review_loops section', () => {
    expect(yaml).toMatch(/^review_loops:\s*$/m);
  });

  it('defines max_cycles with a numeric value', () => {
    expect(yaml).toMatch(/max_cycles:\s*\d+/);
  });

  it('defines min_severity_to_address', () => {
    expect(yaml).toMatch(/min_severity_to_address:\s*(critical|high|medium|low)/);
  });

  it('has implementation_plan.review_loops.max_cycles override of 3', () => {
    const implSection = extractYamlSection(yaml, 'implementation_plan');
    expect(implSection).not.toBeNull();
    expect(implSection!).toMatch(/review_loops:\s*\n\s+max_cycles:\s*3/);
  });

  it('does NOT have stale max_review_cycles at implementation_plan root', () => {
    const implSection = extractYamlSection(yaml, 'implementation_plan');
    expect(implSection).not.toBeNull();
    // max_review_cycles should not appear as a direct child of implementation_plan
    const directChildren = implSection!
      .split('\n')
      .filter((line) => /^\s{2}\w/.test(line))
      .map((line) => line.trim());
    const hasStaleKey = directChildren.some((line) =>
      line.startsWith('max_review_cycles:')
    );
    expect(hasStaleKey).toBe(false);
  });

  it('has commented review_loops override in code_review section', () => {
    const section = extractYamlSection(yaml, 'code_review');
    expect(section).not.toBeNull();
    expect(section!).toContain('# review_loops:');
  });

  it('has commented review_loops override in architecture section', () => {
    const section = extractYamlSection(yaml, 'architecture');
    expect(section).not.toBeNull();
    expect(section!).toContain('# review_loops:');
  });

  it('has commented review_loops override in design_system section', () => {
    const section = extractYamlSection(yaml, 'design_system');
    expect(section).not.toBeNull();
    expect(section!).toContain('# review_loops:');
  });

  it('has commented review_loops override in reliability section', () => {
    const section = extractYamlSection(yaml, 'reliability');
    expect(section).not.toBeNull();
    expect(section!).toContain('# review_loops:');
  });

  it('has a performance_audit section with commented review_loops', () => {
    const section = extractYamlSection(yaml, 'performance_audit');
    expect(section).not.toBeNull();
    expect(section!).toContain('# review_loops:');
  });
});

// ── Command Review Loop Tests ────────────────────────────────────

describe.each(COMMANDS_WITH_REVIEW_LOOPS)(
  '$file — Review Loop',
  (commandInfo) => {
    const markdown = loadCommand(commandInfo.file);

    it('passes review loop validation', () => {
      const result = validateCommandReviewLoop(markdown, commandInfo);
      expect(
        result.errors,
        `Review loop errors in ${commandInfo.file}:\n${result.errors.join('\n')}`
      ).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it(`contains "${commandInfo.loopName}" section`, () => {
      expect(markdown).toContain(commandInfo.loopName);
    });

    it('references review_loops.max_cycles', () => {
      expect(markdown).toContain('review_loops.max_cycles');
    });

    it('does NOT reference stale max_review_cycles', () => {
      expect(markdown).not.toContain('max_review_cycles');
    });

    it('specifies fresh sub-agent instances per cycle', () => {
      const hasFresh = markdown.includes('fresh');
      const hasNoResume =
        markdown.includes('never resume') ||
        markdown.includes('never resumed') ||
        markdown.includes('new Task call');
      expect(hasFresh && hasNoResume).toBe(true);
    });

    it('specifies compact carry-forward between cycles', () => {
      const hasCompact = markdown.includes('compact');
      const hasSummary =
        markdown.includes('summary') ||
        markdown.includes('carry forward') ||
        markdown.includes('carry-forward');
      expect(hasCompact && hasSummary).toBe(true);
    });

    it('warns against carrying full prior outputs', () => {
      expect(markdown).toMatch(/do not carry forward|Do NOT carry forward/i);
    });
  }
);

// ── Cross-File Stale Reference Check ─────────────────────────────

describe('No Stale Config References', () => {
  const commandFiles = COMMANDS_WITH_REVIEW_LOOPS.map((cmd) => ({
    file: cmd.file,
    content: loadCommand(cmd.file),
  }));

  it('no command files reference max_review_cycles', () => {
    const result = checkStaleConfigReferences(commandFiles);
    expect(
      result.errors,
      `Stale references found:\n${result.errors.join('\n')}`
    ).toEqual([]);
  });
});

/**
 * Layer 1: Schema validation tests for the init command definition.
 *
 * These tests validate the *definition* (markdown) of the init command,
 * not runtime behavior. They catch regressions where:
 * - Someone removes the concurrent tasks configuration step
 * - AskUserQuestion is removed from the user prompt flow
 * - CPU detection platform commands are removed
 * - Preset options (Yolo, Aggressive, Default) are removed
 * - Integer validation or re-ask loop is removed
 * - Config update targets are removed (both concurrent_tasks keys)
 *
 * Cost: $0 (no LLM calls — pure file parsing)
 */

import { describe, it, expect } from 'vitest';
import {
  validateInitCommand,
  validateDefaultsConcurrentTasks,
  validateCommandSummary,
  extractWorkflowStep,
  extractSubStep,
  loadInitCommand,
  loadDefaultsYaml,
  REQUIRED_CPU_COMMANDS,
  REQUIRED_PRESETS,
} from './init-command.js';

// ── Init Command Definition Tests ────────────────────────────────

describe('Init Command — Concurrent Tasks Step', () => {
  const markdown = loadInitCommand();

  it('passes full schema validation', () => {
    const result = validateInitCommand(markdown);
    expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('has "Configure Concurrent Tasks" as step 3', () => {
    const step = extractWorkflowStep(markdown, 3, 'Configure Concurrent Tasks');
    expect(step).not.toBeNull();
  });

  it('mentions AskUserQuestion in the concurrent tasks step', () => {
    const step = extractWorkflowStep(markdown, 3, 'Configure Concurrent Tasks');
    expect(step).not.toBeNull();
    expect(step!).toContain('AskUserQuestion');
  });

  it('mentions AskUserQuestion at least twice (initial prompt + re-ask)', () => {
    const step = extractWorkflowStep(markdown, 3, 'Configure Concurrent Tasks');
    expect(step).not.toBeNull();
    const count = (step!.match(/AskUserQuestion/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ── CPU Detection Tests ──────────────────────────────────────────

describe('Init Command — CPU Detection (Step 3a)', () => {
  const markdown = loadInitCommand();
  const detectStep = extractSubStep(markdown, '3a. Detect CPU Count');

  it('has a "Detect CPU Count" sub-step', () => {
    expect(detectStep).not.toBeNull();
  });

  it.each(REQUIRED_CPU_COMMANDS)(
    'includes $platform detection command: $command',
    ({ command }) => {
      expect(detectStep!).toContain(command);
    }
  );

  it('includes Windows detection', () => {
    expect(detectStep!).toMatch(/NUMBER_OF_PROCESSORS/i);
  });

  it('specifies a fallback default of 12', () => {
    expect(detectStep!).toContain('12');
    expect(detectStep!.toLowerCase()).toContain('fallback');
  });
});

// ── Preset Options Tests ─────────────────────────────────────────

describe('Init Command — Preset Options (Step 3b)', () => {
  const markdown = loadInitCommand();
  const calculateStep = extractSubStep(markdown, '3b. Calculate Options');

  it('has a "Calculate Options" sub-step', () => {
    expect(calculateStep).not.toBeNull();
  });

  it.each(REQUIRED_PRESETS)('includes the "%s" preset', (preset) => {
    expect(calculateStep!).toContain(preset);
  });

  it('Aggressive formula uses 75% of CPUs (0.75)', () => {
    expect(calculateStep!).toContain('0.75');
  });

  it('Aggressive formula has a minimum of 8', () => {
    expect(calculateStep!).toContain('8');
  });

  it('Default preset value is 3', () => {
    // "Default" row should contain "3" as the value
    expect(calculateStep!).toMatch(/Default\s*\|.*\b3\b/);
  });
});

// ── User Prompt Tests ────────────────────────────────────────────

describe('Init Command — User Prompt (Step 3c)', () => {
  const markdown = loadInitCommand();
  const askStep = extractSubStep(markdown, '3c. Ask the User');

  it('has an "Ask the User" sub-step', () => {
    expect(askStep).not.toBeNull();
  });

  it('references AskUserQuestion tool', () => {
    expect(askStep!).toContain('AskUserQuestion');
  });

  it('presents all three preset options in the prompt', () => {
    expect(askStep!).toContain('Yolo');
    expect(askStep!).toContain('Aggressive');
    expect(askStep!).toContain('Default');
  });

  it('allows custom number input', () => {
    expect(askStep!.toLowerCase()).toMatch(/custom\s+number|type\s+a/);
  });
});

// ── Validation Tests ─────────────────────────────────────────────

describe('Init Command — Response Validation (Step 3d)', () => {
  const markdown = loadInitCommand();
  const validateStep = extractSubStep(markdown, '3d. Validate the Response');

  it('has a "Validate the Response" sub-step', () => {
    expect(validateStep).not.toBeNull();
  });

  it('requires a positive integer', () => {
    expect(validateStep!.toLowerCase()).toContain('integer');
    expect(validateStep!.toLowerCase()).toContain('positive');
  });

  it('supports option selection by number (e.g., "1", "2", "3")', () => {
    expect(validateStep!).toMatch(/option.*number|picks an option by number/i);
  });

  it('supports option selection by name (e.g., "yolo", "aggressive")', () => {
    expect(validateStep!).toMatch(/name.*yolo|name.*aggressive/i);
  });

  it('re-asks using AskUserQuestion on invalid input', () => {
    expect(validateStep!).toContain('AskUserQuestion');
  });

  it('specifies a re-ask loop (repeat until valid)', () => {
    expect(validateStep!.toLowerCase()).toMatch(/repeat|loop/);
  });

  it('does NOT proceed without a valid integer', () => {
    expect(validateStep!).toMatch(/do not proceed|Do NOT proceed/i);
  });
});

// ── Config Update Tests ──────────────────────────────────────────

describe('Init Command — Config Update (Step 3e)', () => {
  const markdown = loadInitCommand();
  const updateStep = extractSubStep(markdown, '3e. Update the Config File');

  it('has an "Update the Config File" sub-step', () => {
    expect(updateStep).not.toBeNull();
  });

  it('targets implementation_plan.concurrent_tasks', () => {
    expect(updateStep!).toContain('implementation_plan.concurrent_tasks');
  });

  it('targets next_priority.concurrent_tasks', () => {
    expect(updateStep!).toContain('next_priority.concurrent_tasks');
  });

  it('updates both concurrent_tasks values', () => {
    // Should mention "both" to make it clear
    expect(updateStep!.toLowerCase()).toContain('both');
  });
});

// ── defaults.yaml Concurrent Tasks Tests ─────────────────────────

describe('defaults.yaml — Concurrent Tasks Config', () => {
  const yaml = loadDefaultsYaml();

  it('passes concurrent tasks config validation', () => {
    const result = validateDefaultsConcurrentTasks(yaml);
    expect(result.errors, `Config errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('has implementation_plan.concurrent_tasks with a numeric value', () => {
    expect(yaml).toMatch(/implementation_plan:[\s\S]*?concurrent_tasks:\s*\d+/);
  });

  it('has next_priority.concurrent_tasks with a numeric value', () => {
    expect(yaml).toMatch(/next_priority:[\s\S]*?concurrent_tasks:\s*\d+/);
  });

  it('both concurrent_tasks default to 3', () => {
    // Both sections should default to 3
    const implMatch = yaml.match(/implementation_plan:[\s\S]*?concurrent_tasks:\s*(\d+)/);
    const nextMatch = yaml.match(/next_priority:[\s\S]*?concurrent_tasks:\s*(\d+)/);
    expect(implMatch).not.toBeNull();
    expect(nextMatch).not.toBeNull();
    expect(implMatch![1]).toBe('3');
    expect(nextMatch![1]).toBe('3');
  });
});

// ── Command Summary Tests ────────────────────────────────────────

describe('Init Command — "What This Command Does" Summary', () => {
  const markdown = loadInitCommand();

  it('passes summary validation', () => {
    const result = validateCommandSummary(markdown);
    expect(result.errors, `Summary errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('mentions concurrent task configuration in the summary', () => {
    const summaryMatch = markdown.match(
      /## What This Command Does\s*\n([\s\S]*?)(?=## Workflow)/
    );
    expect(summaryMatch).not.toBeNull();
    expect(summaryMatch![1].toLowerCase()).toMatch(/concurrent|parallelism/);
  });

  it('lists 5 numbered steps in the summary', () => {
    const summaryMatch = markdown.match(
      /## What This Command Does\s*\n([\s\S]*?)(?=## Workflow)/
    );
    expect(summaryMatch).not.toBeNull();
    const numberedSteps = summaryMatch![1]
      .split('\n')
      .filter((l) => /^\d+\./.test(l.trim()));
    expect(numberedSteps.length).toBe(6);
  });
});

// ── Workflow Step Ordering Tests ─────────────────────────────────

describe('Init Command — Workflow Step Ordering', () => {
  const markdown = loadInitCommand();

  it('step 1 is "Check for Existing Configuration"', () => {
    expect(extractWorkflowStep(markdown, 1, 'Check for Existing Configuration')).not.toBeNull();
  });

  it('step 2 is "Create Configuration File"', () => {
    expect(extractWorkflowStep(markdown, 2, 'Create Configuration File')).not.toBeNull();
  });

  it('step 3 is "Configure Concurrent Tasks"', () => {
    expect(extractWorkflowStep(markdown, 3, 'Configure Concurrent Tasks')).not.toBeNull();
  });

  it('step 4 is "Configure Multi-Model Review"', () => {
    expect(extractWorkflowStep(markdown, 4, 'Configure Multi-Model Review')).not.toBeNull();
  });

  it('step 5 is "Update .gitignore"', () => {
    expect(extractWorkflowStep(markdown, 5, 'Update')).not.toBeNull();
  });

  it('step 6 is "Create Document Directories"', () => {
    expect(extractWorkflowStep(markdown, 6, 'Create Document Directories')).not.toBeNull();
  });

  it('step 7 is "Confirm and Guide"', () => {
    expect(extractWorkflowStep(markdown, 7, 'Confirm and Guide')).not.toBeNull();
  });

  it('concurrent tasks step comes after config creation', () => {
    const configPos = markdown.indexOf('### 2. Create Configuration File');
    const concurrentPos = markdown.indexOf('### 3. Configure Concurrent Tasks');
    expect(configPos).toBeGreaterThan(-1);
    expect(concurrentPos).toBeGreaterThan(configPos);
  });

  it('concurrent tasks step comes before .gitignore update', () => {
    const concurrentPos = markdown.indexOf('### 3. Configure Concurrent Tasks');
    const gitignorePos = markdown.indexOf('### 5. Update .gitignore');
    expect(concurrentPos).toBeGreaterThan(-1);
    expect(gitignorePos).toBeGreaterThan(concurrentPos);
  });
});

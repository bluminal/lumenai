/**
 * Layer 1: Schema validation tests for Product Manager agent definition.
 *
 * Unlike other schema tests that validate agent *output*, these tests validate
 * the agent *definition* (markdown instructions). This catches regressions
 * where someone edits the PM agent and removes the AskUserQuestion guidance,
 * which would reintroduce the bug where clarifying questions don't surface
 * to the human user in multi-agent orchestration (e.g., Claude Cowork).
 */

import { describe, it, expect } from 'vitest';
import {
  validateAgentDefinition,
  validateWriteImplPlanCommand,
  loadAgentDefinition,
  loadWriteImplPlanCommand,
} from './product-manager.js';

// ── Agent Definition Tests ────────────────────────────────────────

describe('Product Manager Agent Definition', () => {
  const agentMarkdown = loadAgentDefinition();

  it('passes full schema validation', () => {
    const result = validateAgentDefinition(agentMarkdown);
    expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('mentions AskUserQuestion in Requirements Gathering section', () => {
    const reqSection = agentMarkdown.split('## Requirements Gathering')[1]?.split(/^## /m)[0];
    expect(reqSection).toBeDefined();
    expect(reqSection).toContain('AskUserQuestion');
  });

  it('mentions AskUserQuestion in Critical Rules section', () => {
    const rulesSection = agentMarkdown.split('## Critical Rules')[1]?.split(/^## /m)[0];
    expect(rulesSection).toBeDefined();
    expect(rulesSection).toContain('AskUserQuestion');
  });

  it('mentions AskUserQuestion in Behavioral Rules section', () => {
    const rulesSection = agentMarkdown.split('## Behavioral Rules')[1]?.split(/^## /m)[0];
    expect(rulesSection).toBeDefined();
    expect(rulesSection).toContain('AskUserQuestion');
  });

  it('warns against plain text output for questions', () => {
    expect(
      agentMarkdown.includes('text output') || agentMarkdown.includes('plain text')
    ).toBe(true);
  });

  it('explains the sub-agent context for why AskUserQuestion is needed', () => {
    expect(
      agentMarkdown.includes('sub-agent') || agentMarkdown.includes('subagent')
    ).toBe(true);
  });

  it('explains that text output goes to parent agent', () => {
    expect(agentMarkdown).toContain('parent agent');
  });

  it('allows PM to answer simple questions from its own sub-agents', () => {
    // The PM should be able to answer factual questions from reviewer sub-agents
    // without escalating everything to the user
    const mentionsAnswering =
      agentMarkdown.includes('MAY answer') ||
      agentMarkdown.includes('may answer') ||
      agentMarkdown.includes('You MAY answer') ||
      agentMarkdown.includes('You may answer');
    expect(mentionsAnswering).toBe(true);
  });

  it('requires user escalation for judgment calls', () => {
    // Questions requiring user judgment/preferences must go through AskUserQuestion
    expect(
      agentMarkdown.includes('judgment') ||
      agentMarkdown.includes('preferences')
    ).toBe(true);
  });

  it('still requires interactive Q&A for PRD creation', () => {
    expect(agentMarkdown).toContain('NEVER');
    expect(agentMarkdown.toLowerCase()).toContain('autonomously generate a prd');
  });
});

// ── Command Definition Tests ──────────────────────────────────────

describe('write-implementation-plan Command', () => {
  const commandMarkdown = loadWriteImplPlanCommand();

  it('passes command schema validation', () => {
    const result = validateWriteImplPlanCommand(commandMarkdown);
    expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('mentions AskUserQuestion in User Interview step', () => {
    // Extract Step 4 content
    const step4Match = commandMarkdown.match(/### 4\. User Interview[\s\S]*?(?=### \d|$)/);
    expect(step4Match).not.toBeNull();
    expect(step4Match![0]).toContain('AskUserQuestion');
  });

  it('explains importance of AskUserQuestion for sub-agent context', () => {
    expect(
      commandMarkdown.includes('sub-agent') || commandMarkdown.includes('subagent')
    ).toBe(true);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const CLAUDE_MD_PATH = join(ROOT, 'CLAUDE.md');

describe('Task 53: CLAUDE.md agent table + command table updates', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(CLAUDE_MD_PATH, 'utf8');
  });

  it('CLAUDE.md file exists', () => {
    expect(existsSync(CLAUDE_MD_PATH)).toBe(true);
  });

  // ----------------------------------------------------------------
  // New agents in agent table
  // ----------------------------------------------------------------
  describe('New agents in agent table', () => {
    it('contains multi-model-review-orchestrator', () => {
      expect(content).toContain('multi-model-review-orchestrator');
    });

    it('contains context-bundle-assembler', () => {
      expect(content).toContain('context-bundle-assembler');
    });

    it('contains audit-artifact-writer', () => {
      expect(content).toContain('audit-artifact-writer');
    });

    it('contains codex-review-prompter', () => {
      expect(content).toContain('codex-review-prompter');
    });

    it('contains gemini-review-prompter', () => {
      expect(content).toContain('gemini-review-prompter');
    });

    it('contains ollama-review-prompter', () => {
      expect(content).toContain('ollama-review-prompter');
    });
  });

  // ----------------------------------------------------------------
  // Command table integration notes
  // ----------------------------------------------------------------
  describe('Command table integration notes', () => {
    describe('/synthex:init multi-model annotation', () => {
      it('init command row mentions "multi-model" (case-insensitive)', () => {
        // Find the init row in the table and verify it mentions multi-model
        const initRowMatch = content.match(/\|\s*`init`[^|]*\|[^|]*\|[^|]*\|/);
        expect(initRowMatch).toBeTruthy();
        expect(initRowMatch![0].toLowerCase()).toContain('multi-model');
      });

      it('init command row mentions FR-MR19', () => {
        const initRowMatch = content.match(/\|\s*`init`[^|]*\|[^|]*\|[^|]*\|/);
        expect(initRowMatch).toBeTruthy();
        expect(initRowMatch![0]).toContain('FR-MR19');
      });
    });

    describe('/synthex:review-code multi-model annotation', () => {
      it('review-code command row mentions "multi-model" (case-insensitive)', () => {
        const reviewRowMatch = content.match(/\|\s*`review-code`[^|]*\|[^|]*\|[^|]*\|/);
        expect(reviewRowMatch).toBeTruthy();
        expect(reviewRowMatch![0].toLowerCase()).toContain('multi-model');
      });

      it('review-code command row mentions FR-MR21 or --multi-model flag', () => {
        const reviewRowMatch = content.match(/\|\s*`review-code`[^|]*\|[^|]*\|[^|]*\|/);
        expect(reviewRowMatch).toBeTruthy();
        const row = reviewRowMatch![0];
        expect(row.includes('FR-MR21') || row.includes('--multi-model')).toBe(true);
      });
    });

    describe('/synthex:write-implementation-plan multi-model annotation', () => {
      it('write-implementation-plan command row mentions "multi-model" (case-insensitive)', () => {
        const planRowMatch = content.match(/\|\s*`write-implementation-plan`[^|]*\|[^|]*\|[^|]*\|/);
        expect(planRowMatch).toBeTruthy();
        expect(planRowMatch![0].toLowerCase()).toContain('multi-model');
      });

      it('write-implementation-plan command row mentions FR-MR22 or no-gate', () => {
        const planRowMatch = content.match(/\|\s*`write-implementation-plan`[^|]*\|[^|]*\|[^|]*\|/);
        expect(planRowMatch).toBeTruthy();
        const row = planRowMatch![0];
        expect(row.includes('FR-MR22') || row.includes('no complexity gate') || row.includes('no-gate')).toBe(true);
      });
    });
  });

  // ----------------------------------------------------------------
  // design-system-agent naming consistency
  // ----------------------------------------------------------------
  describe('design-system-agent naming consistency', () => {
    it('contains "design-system-agent"', () => {
      expect(content).toContain('design-system-agent');
    });

    it('does not use "Designer" as a reviewer name in the agent/command tables', () => {
      // Extract agent table and command table sections (between ## Agents and ## Project Configuration)
      const agentAndCommandSection = content.match(
        /## Agents \(Synthex\)[\s\S]*?(?=## Project Configuration)/
      );
      expect(agentAndCommandSection).toBeTruthy();
      const tableContent = agentAndCommandSection![0];
      // "Designer" as a standalone reviewer name should not appear
      // Allow "Design System" or "design-system-agent" but not bare "Designer"
      const designerMatches = tableContent.match(/\bDesigner\b/g);
      expect(designerMatches).toBeNull();
    });
  });
});

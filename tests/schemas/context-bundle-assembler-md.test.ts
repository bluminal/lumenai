import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AGENT_PATH = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents', 'context-bundle-assembler.md');

describe('Task 5: context-bundle-assembler.md', () => {
  let content: string;
  beforeAll(() => {
    content = readFileSync(AGENT_PATH, 'utf8');
  });

  it('file exists', () => expect(existsSync(AGENT_PATH)).toBe(true));

  describe('Frontmatter and identity', () => {
    it('declares Haiku model', () => expect(content).toMatch(/^---[\s\S]*?model:\s*haiku[\s\S]*?---/));
    it('identifies as Context Bundle Assembler', () => expect(content).toContain('Context Bundle Assembler'));
  });

  describe('Inputs/outputs in canonical envelope shape (acceptance criterion 1)', () => {
    it('documents input contract', () => expect(content).toContain('Input Contract'));
    it('documents output contract', () => expect(content).toContain('Output Contract'));
    it('documents required input fields: artifact_path, config', () => {
      expect(content).toContain('artifact_path');
      expect(content).toContain('config');
      expect(content).toContain('max_bundle_bytes');
      expect(content).toContain('max_file_bytes');
    });
    it('output success shape includes status, manifest, files', () => {
      expect(content).toMatch(/"status":\s*"success"/);
      expect(content).toMatch(/"manifest"/);
      expect(content).toMatch(/"files"/);
    });
    it('output success manifest has artifact, conventions, touched_files, specs, total_bytes', () => {
      expect(content).toContain('total_bytes');
      expect(content).toContain('summarized');
    });
  });

  describe('Markdown rule explicitly forbids summarizing the artifact (acceptance criterion 3)', () => {
    it('contains explicit "NEVER summarized" rule about the artifact', () => {
      expect(content).toMatch(/artifact (is )?NEVER summarized/);
    });
    it('Behavioral Rules section reinforces no-artifact-summary rule', () => {
      // Find the Behavioral Rules section and check it
      expect(content).toContain('Behavioral Rules');
      // The first behavioral rule should mention the artifact never being summarized
      const behavioralSection = content.split('Behavioral Rules')[1];
      expect(behavioralSection).toBeDefined();
      expect(behavioralSection).toMatch(/artifact.*NEVER/i);
    });
  });

  describe('Documents assembly order, size-cap algorithm, spec-matching, narrow-scope error (acceptance criterion 2 - [H])', () => {
    it('documents assembly order: artifact → conventions → touched_files → specs', () => {
      expect(content).toMatch(/artifact[\s\S]*conventions[\s\S]*touched.*files[\s\S]*specs/i);
    });
    it('documents per-file and total bundle size caps', () => {
      expect(content).toContain('max_file_bytes');
      expect(content).toContain('max_bundle_bytes');
      expect(content).toMatch(/iterative.*summariz/i);
    });
    it('documents spec-matching heuristic (filename-substring per OQ-8)', () => {
      expect(content).toMatch(/filename.substring/i);
      expect(content).toContain('OQ-8');
      expect(content).toContain('spec_map');
    });
    it('documents narrow-scope error path', () => {
      expect(content).toContain('narrow_scope_required');
      expect(content).toMatch(/Narrow.*Scope.*Error|narrow scope/i);
    });
  });

  describe('Source authority cross-references', () => {
    it.each(['FR-MR28', 'D5', 'OQ-8'])('references %s', (ref) => {
      expect(content).toContain(ref);
    });
  });

  describe('Scope constraints', () => {
    it('declares it does not decide which proposers to invoke', () => {
      expect(content).toMatch(/orchestrator's job|orchestrator/);
    });
    it('declares it does not run LLM-as-reviewer logic', () => {
      expect(content).toMatch(/does NOT[\s\S]*reviewer/);
    });
  });
});

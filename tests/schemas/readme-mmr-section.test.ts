import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const README_PATH = join(ROOT, 'README.md');

describe('Task 52: README.md multi-model review section', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(README_PATH, 'utf8');
  });

  it('README.md file exists', () => {
    expect(existsSync(README_PATH)).toBe(true);
  });

  it('"## Multi-Model Review" section heading present', () => {
    expect(content).toContain('## Multi-Model Review');
  });

  describe('Element 1: feature description sentence', () => {
    it('contains "fans review prompts"', () => {
      expect(content).toContain('fans review prompts');
    });

    it('contains "multiple LLM-family proposers"', () => {
      expect(content).toContain('multiple LLM-family proposers');
    });
  });

  describe('Element 2: primary benefit statement', () => {
    it('contains "correlated-error blind spots"', () => {
      expect(content).toContain('correlated-error blind spots');
    });
  });

  describe('Element 3: off-by-default statement', () => {
    it('contains "Off by default"', () => {
      expect(content).toContain('Off by default');
    });
  });

  describe('Element 4: links to spec docs', () => {
    it('references docs/specs/multi-model-review/architecture.md', () => {
      expect(content).toContain('docs/specs/multi-model-review/architecture.md');
    });

    it('references docs/specs/multi-model-review/adapter-recipes.md', () => {
      expect(content).toContain('docs/specs/multi-model-review/adapter-recipes.md');
    });
  });

  describe('Links resolve (target files exist)', () => {
    it('architecture.md exists on disk', () => {
      const archPath = join(ROOT, 'docs', 'specs', 'multi-model-review', 'architecture.md');
      expect(existsSync(archPath)).toBe(true);
    });

    it('adapter-recipes.md exists on disk', () => {
      const recipesPath = join(ROOT, 'docs', 'specs', 'multi-model-review', 'adapter-recipes.md');
      expect(existsSync(recipesPath)).toBe(true);
    });
  });
});

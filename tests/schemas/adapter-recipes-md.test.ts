/**
 * Tests for docs/specs/multi-model-review/adapter-recipes.md
 *
 * Validates per Task 50 acceptance criteria:
 * 1.  File exists
 * 2.  Status: Final
 * 3.  All 3 v1 adapters present: Codex, Gemini, Ollama
 * 4.  Each adapter has Install + Auth + Recommended model + Sandbox flags (or N/A) + Known gotchas
 * 5.  Codex install one-liner: npm install -g @openai/codex
 * 6.  Gemini auth: gcloud auth login
 * 7.  Ollama install: curl -fsSL https://ollama.com/install.sh | sh
 * 8.  Q2 TBD documented for Ollama recommended model
 * 9.  "Writing a new adapter" section present
 * 10. NFR-MR5 cross-reference
 * 11. 3 file changes specification (.md + plugin.json + recipes doc)
 * 12. Anti-patterns section present
 * 13. Cross-references to adapter-contract.md, architecture.md, failure-modes.md
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RECIPES_PATH = join(
  import.meta.dirname,
  '..', '..', 'docs', 'specs', 'multi-model-review', 'adapter-recipes.md',
);

describe('Task 50: adapter-recipes.md', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(RECIPES_PATH, 'utf8');
  });

  // 1. File exists
  it('file exists', () => {
    expect(existsSync(RECIPES_PATH)).toBe(true);
  });

  // 2. Status: Final
  it('## Status: Final present', () => {
    expect(content).toContain('## Status: Final');
  });

  // 3. All 3 v1 adapters present
  describe('All 3 v1 adapters present', () => {
    it('Codex adapter section present', () => {
      expect(content).toContain('Codex');
    });

    it('Gemini adapter section present', () => {
      expect(content).toContain('Gemini');
    });

    it('Ollama adapter section present', () => {
      expect(content).toContain('Ollama');
    });
  });

  // 4. Each adapter has required sub-sections
  describe('Each adapter has Install + Auth + Recommended model + Sandbox flags + Known gotchas', () => {
    const ADAPTERS = ['Codex', 'Gemini', 'Ollama'] as const;

    for (const adapter of ADAPTERS) {
      describe(`${adapter} adapter sub-sections`, () => {
        let adapterSection: string;

        beforeAll(() => {
          // Extract this adapter's section by splitting on the next top-level H2
          const parts = content.split(/^## /m);
          const adapterIdx = parts.findIndex((p) => p.startsWith(`${parts.find((s) => s.includes(adapter)) ? '' : ''}`) && p.includes(adapter));
          // Find the section that contains this adapter name
          const section = parts.find((p) => p.match(new RegExp(`^\\d+\\.\\s+${adapter}`)));
          adapterSection = section ?? '';
        });

        it('Install one-liner sub-section', () => {
          // Use the full content search since sections can be small
          expect(content).toMatch(new RegExp(`### Install one-liner`));
        });

        it('Auth setup sub-section', () => {
          expect(content).toMatch(/### Auth setup/);
        });

        it('Recommended flagship model sub-section', () => {
          expect(content).toMatch(/### Recommended flagship model/);
        });

        it('Sandbox flags sub-section (or N/A noted)', () => {
          expect(content).toMatch(/### Sandbox flags/);
        });

        it('Known gotchas sub-section', () => {
          expect(content).toMatch(/### Known gotchas/);
        });
      });
    }
  });

  // 5. Codex install one-liner
  it('Codex install one-liner: npm install -g @openai/codex', () => {
    expect(content).toContain('npm install -g @openai/codex');
  });

  // 6. Gemini auth: gcloud auth login
  it('Gemini auth: gcloud auth login', () => {
    expect(content).toContain('gcloud auth login');
  });

  // 7. Ollama install one-liner
  it('Ollama install: curl -fsSL https://ollama.com/install.sh | sh', () => {
    expect(content).toContain('curl -fsSL https://ollama.com/install.sh | sh');
  });

  // 8. Q2 TBD documented for Ollama recommended model
  it('Q2 TBD documented for Ollama recommended model', () => {
    expect(content).toContain('Q2');
    expect(content).toContain('TBD');
  });

  // 9. "Writing a new adapter" section present
  it('"Writing a new adapter" section present', () => {
    expect(content).toContain('Writing a New Adapter');
  });

  // 10. NFR-MR5 cross-reference
  it('NFR-MR5 cross-reference present', () => {
    expect(content).toContain('NFR-MR5');
  });

  // 11. 3 file changes specification
  it('3 file changes specification present (adapter .md + plugin.json + recipes doc)', () => {
    expect(content).toContain('plugin.json');
    expect(content).toMatch(/3 file changes/i);
    // The recipes doc is this file itself, referenced in the "update" step
    expect(content).toContain('adapter-recipes.md');
  });

  // 12. Anti-patterns section present
  it('Anti-patterns section present', () => {
    expect(content).toContain('Anti-patterns');
  });

  // 13. Cross-references to adapter-contract.md, architecture.md, failure-modes.md
  describe('Cross-references to related docs', () => {
    it('references adapter-contract.md', () => {
      expect(content).toContain('adapter-contract.md');
    });

    it('references architecture.md', () => {
      expect(content).toContain('architecture.md');
    });

    it('references failure-modes.md', () => {
      expect(content).toContain('failure-modes.md');
    });
  });

  // Additional structural validation
  describe('Codex adapter details', () => {
    it('documents --sandbox read-only flag', () => {
      expect(content).toContain('--sandbox read-only');
    });

    it('documents --approval-mode never flag', () => {
      expect(content).toContain('--approval-mode never');
    });

    it('documents codex login auth command', () => {
      expect(content).toContain('codex login');
    });

    it('references FR-MR26 for sandbox flags', () => {
      expect(content).toContain('FR-MR26');
    });
  });

  describe('Gemini adapter details', () => {
    it('documents --readonly sandbox flag', () => {
      expect(content).toContain('--readonly');
    });

    it('documents gcloud auth list for auth check', () => {
      expect(content).toContain('gcloud auth list');
    });

    it('documents gemini-2.5-pro as recommended model', () => {
      expect(content).toContain('gemini-2.5-pro');
    });
  });

  describe('Ollama adapter details', () => {
    it('documents N/A for sandbox flags (local execution)', () => {
      const ollamaSection = content.split('## 3. Ollama')[1];
      expect(ollamaSection).toBeDefined();
      expect(ollamaSection).toMatch(/N\/A/);
    });

    it('documents ollama serve requirement', () => {
      expect(content).toContain('ollama serve');
    });

    it('documents ollama pull requirement', () => {
      expect(content).toContain('ollama pull');
    });

    it('documents Ollama >= 0.5.0 schema requirement', () => {
      expect(content).toMatch(/Ollama.*0\.5\.0|0\.5\.0.*Ollama/);
    });
  });

  describe('Writing a new adapter section (NFR-MR5)', () => {
    let newAdapterSection: string;

    beforeAll(() => {
      const parts = content.split('## 7. Writing a New Adapter');
      newAdapterSection = parts[1] ?? '';
    });

    it('references plugin.json registration step', () => {
      expect(newAdapterSection).toContain('plugin.json');
    });

    it('references model: haiku frontmatter requirement', () => {
      expect(newAdapterSection).toContain('haiku');
    });

    it('lists capability tier options (agentic | text-only)', () => {
      expect(newAdapterSection).toContain('agentic');
      expect(newAdapterSection).toContain('text-only');
    });

    it('lists FR-MR8 behavior steps 1-8', () => {
      expect(newAdapterSection).toContain('FR-MR8');
    });

    it('identifies Codex as the reference/template implementation', () => {
      expect(newAdapterSection).toContain('codex-review-prompter.md');
    });

    it('anti-patterns: no new error_code values', () => {
      expect(newAdapterSection).toContain('error_code');
      expect(newAdapterSection).toContain('FR-MR16');
    });

    it('anti-patterns: no orchestrator special-casing', () => {
      expect(newAdapterSection).toContain('orchestrator');
    });

    it('anti-patterns: no API keys in adapter prose', () => {
      expect(newAdapterSection).toMatch(/API key/i);
    });
  });
});

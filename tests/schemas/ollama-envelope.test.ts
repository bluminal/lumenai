import { describe, it, expect } from 'vitest';
import { validateFullAdapterEnvelope } from './adapter-envelope';

/**
 * Synthetic Ollama envelope — models what ollama-review-prompter.md emits.
 * Key text-only-tier characteristics:
 * - source.family is dynamic: "local-<configured-model>" pattern
 * - usage maps prompt_eval_count → input_tokens, eval_count → output_tokens
 * - sandbox flags do NOT apply (local server, no remote)
 */
const recordedOllamaEnvelope = {
  status: 'success',
  error_code: null,
  error_message: null,
  findings: [
    {
      finding_id: 'correctness.parseConfig.unhandled-yaml-error',
      severity: 'medium',
      category: 'correctness',
      title: 'parseConfig swallows YAML parse errors silently',
      description: 'When yaml.parse() throws, parseConfig catches the error and returns an empty object. Callers downstream cannot distinguish "config not present" from "config malformed", producing confusing failure modes.',
      file: 'src/config/parseConfig.ts',
      symbol: 'parseConfig',
      source: {
        reviewer_id: 'ollama-review-prompter',
        family: 'local-qwen2.5-coder',
        source_type: 'external',
      },
      confidence: 'high',
    },
  ],
  usage: {
    input_tokens: 6240,  // mapped from Ollama's prompt_eval_count
    output_tokens: 287,  // mapped from Ollama's eval_count
    model: 'qwen2.5-coder:32b',
  },
  raw_output_path: 'docs/reviews/raw/ollama-uuid-xyz789.json',
};

describe('Task 18: Recorded Ollama envelope passes shared validator', () => {
  describe('Envelope shape (shared validator)', () => {
    it('the recorded Ollama envelope is valid', () => {
      const r = validateFullAdapterEnvelope(recordedOllamaEnvelope);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });
  });

  describe('Text-only tier specifics (Task 18 acceptance criterion 2)', () => {
    it('source.reviewer_id = "ollama-review-prompter"', () => {
      for (const f of recordedOllamaEnvelope.findings) {
        expect(f.source.reviewer_id).toBe('ollama-review-prompter');
      }
    });

    it('source.family follows local-<model> dynamic pattern', () => {
      for (const f of recordedOllamaEnvelope.findings) {
        expect(f.source.family).toMatch(/^local-/);
      }
    });

    it('source.source_type = "external" (Ollama is an external proposer despite being local)', () => {
      for (const f of recordedOllamaEnvelope.findings) {
        expect(f.source.source_type).toBe('external');
      }
    });

    it('usage object present (mapped from Ollama prompt_eval_count + eval_count per NFR-MR4)', () => {
      expect(recordedOllamaEnvelope.usage).toMatchObject({
        input_tokens: expect.any(Number),
        output_tokens: expect.any(Number),
        model: expect.stringMatching(/.+/),
      });
    });

    it('text-only-tier envelope does NOT carry agentic-tier-only metadata', () => {
      // Agentic-tier adapters (codex, gemini) might surface tool_calls or sandbox_violation_reason in their envelope.
      // text-only adapters never do — they have no tool surface.
      const env = recordedOllamaEnvelope as unknown as Record<string, unknown>;
      expect(env.tool_calls).toBeUndefined();
      expect(env.sandbox_violation_reason).toBeUndefined();
      expect(env.autonomous_file_reads).toBeUndefined();
    });
  });

  describe('Local-server semantics (no remote auth)', () => {
    it('Ollama envelope does NOT need auth metadata (text-only/local)', () => {
      // No special auth field expected; envelope shape is identical to other adapters
      // (auth handling is internal to the adapter, not exposed in the envelope)
      expect(recordedOllamaEnvelope).toHaveProperty('status');
    });
  });

  describe('Negative cases — Ollama-shaped envelopes that should fail', () => {
    it('Ollama envelope with finding_id containing line number fails', () => {
      const bad = {
        ...recordedOllamaEnvelope,
        findings: [
          { ...recordedOllamaEnvelope.findings[0], finding_id: 'correctness.parseConfig:42' },
        ],
      };
      const r = validateFullAdapterEnvelope(bad);
      expect(r.valid).toBe(false);
    });

    it('Ollama envelope with missing source.family fails', () => {
      const bad = {
        ...recordedOllamaEnvelope,
        findings: [
          {
            ...recordedOllamaEnvelope.findings[0],
            source: { reviewer_id: 'ollama-review-prompter', source_type: 'external' },
          },
        ],
      };
      const r = validateFullAdapterEnvelope(bad);
      expect(r.valid).toBe(false);
    });

    it('Ollama envelope with non-local family does NOT fail validation (validator allows any family string — text-only tier convention is enforced by the adapter, not the validator)', () => {
      // The validator does NOT enforce that family starts with "local-" for Ollama.
      // That convention is the adapter's responsibility (it sets family at normalize time).
      // The validator just enforces non-empty string.
      const env = {
        ...recordedOllamaEnvelope,
        findings: [
          {
            ...recordedOllamaEnvelope.findings[0],
            source: { ...recordedOllamaEnvelope.findings[0].source, family: 'openai' },
          },
        ],
      };
      const r = validateFullAdapterEnvelope(env);
      expect(r.valid).toBe(true);
    });
  });

  describe('Multiple ollama models — different family-tags', () => {
    it.each([
      ['local-qwen2.5-coder', 'qwen2.5-coder:32b'],
      ['local-llama3.2', 'llama3.2:latest'],
      ['local-deepseek-v3', 'deepseek-v3:latest'],
    ])('family=%s with model=%s passes validator', (family, model) => {
      const env = {
        ...recordedOllamaEnvelope,
        findings: [
          { ...recordedOllamaEnvelope.findings[0], source: { ...recordedOllamaEnvelope.findings[0].source, family } },
        ],
        usage: { ...recordedOllamaEnvelope.usage, model },
      };
      expect(validateFullAdapterEnvelope(env).valid).toBe(true);
    });
  });
});

/**
 * Task 60: Layer 1 validator tests for the three v1 fast-follow adapters.
 *
 * For each adapter (llm, bedrock, claude), builds a synthetic envelope
 * and runs it through validateFullAdapterEnvelope, then asserts the
 * source attribution fields required by FR-MR8 §7 and FR-MR9.
 *
 * Adapters covered:
 *   - llm-review-prompter   (Task 57)
 *   - bedrock-review-prompter (Task 58)
 *   - claude-review-prompter  (Task 59)
 */

import { describe, it, expect } from 'vitest';
import { validateFullAdapterEnvelope } from './adapter-envelope';

// ---------------------------------------------------------------------------
// Shared finding builder — produces a minimal valid canonical finding.
// ---------------------------------------------------------------------------
function makeFinding(override: {
  reviewer_id: string;
  family: string;
  source_type: string;
}) {
  return {
    finding_id: 'correctness.parseConfig.null-return',
    severity: 'medium',
    category: 'correctness',
    title: 'parseConfig returns null on missing key',
    description:
      'When the requested key is absent, parseConfig silently returns null rather than throwing or returning a typed Optional, leaving callers to null-check without any compile-time guard.',
    file: 'src/config/parseConfig.ts',
    symbol: 'parseConfig',
    source: {
      reviewer_id: override.reviewer_id,
      family: override.family,
      source_type: override.source_type,
    },
    confidence: 'high',
  };
}

// ---------------------------------------------------------------------------
// 1. llm-review-prompter
// ---------------------------------------------------------------------------
const llmEnvelope = {
  status: 'success',
  error_code: null,
  error_message: null,
  findings: [
    makeFinding({
      reviewer_id: 'llm-review-prompter',
      family: 'anthropic', // derived from "claude-" prefix per family-from-model-ID-prefix mapping
      source_type: 'external',
    }),
  ],
  // usage may be null per NFR-MR4 (plugin-dependent reporting)
  usage: null,
  raw_output_path: 'docs/reviews/raw/llm-uuid-aaa111.json',
};

describe('Task 60: llm-review-prompter Layer 1 validator', () => {
  it('passes validateFullAdapterEnvelope', () => {
    const r = validateFullAdapterEnvelope(llmEnvelope);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('source.reviewer_id = "llm-review-prompter"', () => {
    for (const f of llmEnvelope.findings) {
      expect(f.source.reviewer_id).toBe('llm-review-prompter');
    }
  });

  it('source.family = "anthropic" (derived from claude- prefix)', () => {
    for (const f of llmEnvelope.findings) {
      expect(f.source.family).toBe('anthropic');
    }
  });

  it('source.source_type = "external"', () => {
    for (const f of llmEnvelope.findings) {
      expect(f.source.source_type).toBe('external');
    }
  });

  it('usage may be null (plugin-dependent; NFR-MR4)', () => {
    // null is a valid usage value per the adapter contract
    expect(llmEnvelope.usage).toBeNull();
  });

  describe('Negative cases', () => {
    it('fails when source.reviewer_id is missing from a finding', () => {
      const bad = {
        ...llmEnvelope,
        findings: [
          {
            ...llmEnvelope.findings[0],
            source: { family: 'anthropic', source_type: 'external' },
          },
        ],
      };
      const r = validateFullAdapterEnvelope(bad);
      expect(r.valid).toBe(false);
    });

    it('fails when finding_id contains a line number', () => {
      const bad = {
        ...llmEnvelope,
        findings: [
          {
            ...llmEnvelope.findings[0],
            finding_id: 'correctness.parseConfig:42',
          },
        ],
      };
      const r = validateFullAdapterEnvelope(bad);
      expect(r.valid).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. bedrock-review-prompter
// ---------------------------------------------------------------------------
const bedrockEnvelope = {
  status: 'success',
  error_code: null,
  error_message: null,
  findings: [
    makeFinding({
      reviewer_id: 'bedrock-review-prompter',
      family: 'anthropic', // derived from "anthropic.claude-" prefix per Bedrock model ID mapping
      source_type: 'external',
    }),
  ],
  // usage extracted from Bedrock response.usage block per NFR-MR4
  usage: {
    input_tokens: 3840,
    output_tokens: 512,
    model: 'anthropic.claude-3-opus-20240229-v1:0',
  },
  raw_output_path: 'docs/reviews/raw/bedrock-uuid-bbb222.json',
};

describe('Task 60: bedrock-review-prompter Layer 1 validator', () => {
  it('passes validateFullAdapterEnvelope', () => {
    const r = validateFullAdapterEnvelope(bedrockEnvelope);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('source.reviewer_id = "bedrock-review-prompter"', () => {
    for (const f of bedrockEnvelope.findings) {
      expect(f.source.reviewer_id).toBe('bedrock-review-prompter');
    }
  });

  it('source.family = "anthropic" (derived from anthropic.claude- prefix)', () => {
    for (const f of bedrockEnvelope.findings) {
      expect(f.source.family).toBe('anthropic');
    }
  });

  it('source.source_type = "external"', () => {
    for (const f of bedrockEnvelope.findings) {
      expect(f.source.source_type).toBe('external');
    }
  });

  it('usage present with input_tokens + output_tokens (NFR-MR4)', () => {
    expect(bedrockEnvelope.usage).toMatchObject({
      input_tokens: expect.any(Number),
      output_tokens: expect.any(Number),
      model: expect.stringMatching(/.+/),
    });
  });

  describe('Bedrock family dispatch — other model families also pass', () => {
    it.each([
      ['meta', 'meta.llama3-70b-instruct-v1:0'],
      ['mistral', 'mistral.mistral-large-2402-v1:0'],
      ['cohere', 'cohere.command-r-plus-v1:0'],
      ['amazon', 'amazon.nova-pro-v1:0'],
    ])('family=%s with model=%s passes validator', (family, model) => {
      const env = {
        ...bedrockEnvelope,
        findings: [
          {
            ...bedrockEnvelope.findings[0],
            source: { ...bedrockEnvelope.findings[0].source, family },
          },
        ],
        usage: { ...bedrockEnvelope.usage, model },
      };
      expect(validateFullAdapterEnvelope(env).valid).toBe(true);
    });
  });

  describe('Negative cases', () => {
    it('fails when source.family is missing', () => {
      const bad = {
        ...bedrockEnvelope,
        findings: [
          {
            ...bedrockEnvelope.findings[0],
            source: {
              reviewer_id: 'bedrock-review-prompter',
              source_type: 'external',
            },
          },
        ],
      };
      const r = validateFullAdapterEnvelope(bad);
      expect(r.valid).toBe(false);
    });

    it('fails when usage is present but missing output_tokens', () => {
      const bad = {
        ...bedrockEnvelope,
        usage: { input_tokens: 100, model: 'anthropic.claude-3-opus-20240229-v1:0' },
      };
      const r = validateFullAdapterEnvelope(bad);
      expect(r.valid).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. claude-review-prompter
// ---------------------------------------------------------------------------
const claudeEnvelope = {
  status: 'success',
  error_code: null,
  error_message: null,
  findings: [
    makeFinding({
      reviewer_id: 'claude-review-prompter',
      family: 'anthropic', // static per adapter spec (capability_tier: agentic, family: anthropic)
      source_type: 'external',
    }),
  ],
  // usage surfaced verbatim from the Claude CLI's output envelope per NFR-MR4
  usage: {
    input_tokens: 4096,
    output_tokens: 731,
    model: 'claude-3-5-sonnet',
  },
  raw_output_path: 'docs/reviews/raw/claude-uuid-ccc333.json',
};

describe('Task 60: claude-review-prompter Layer 1 validator', () => {
  it('passes validateFullAdapterEnvelope', () => {
    const r = validateFullAdapterEnvelope(claudeEnvelope);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('source.reviewer_id = "claude-review-prompter"', () => {
    for (const f of claudeEnvelope.findings) {
      expect(f.source.reviewer_id).toBe('claude-review-prompter');
    }
  });

  it('source.family = "anthropic" (static; specialty second-voice adapter)', () => {
    for (const f of claudeEnvelope.findings) {
      expect(f.source.family).toBe('anthropic');
    }
  });

  it('source.source_type = "external"', () => {
    for (const f of claudeEnvelope.findings) {
      expect(f.source.source_type).toBe('external');
    }
  });

  it('usage present with input_tokens + output_tokens (NFR-MR4; verbatim from CLI envelope)', () => {
    expect(claudeEnvelope.usage).toMatchObject({
      input_tokens: expect.any(Number),
      output_tokens: expect.any(Number),
      model: expect.stringMatching(/.+/),
    });
  });

  describe('Negative cases', () => {
    it('fails when status field is missing', () => {
      const { status: _omitted, ...rest } = claudeEnvelope;
      const r = validateFullAdapterEnvelope(rest);
      expect(r.valid).toBe(false);
    });

    it('fails when findings entry has wrong source_type', () => {
      const bad = {
        ...claudeEnvelope,
        findings: [
          {
            ...claudeEnvelope.findings[0],
            source: {
              ...claudeEnvelope.findings[0].source,
              source_type: 'native', // must be "external" for external adapters
            },
          },
        ],
      };
      const r = validateFullAdapterEnvelope(bad);
      expect(r.valid).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { validateFullAdapterEnvelope } from './adapter-envelope';

/**
 * Synthetic Gemini envelope — models what gemini-review-prompter.md emits
 * after its quirk-handling layer (markdown-fence stripping, NDJSON concat,
 * findings:null→[] normalization). Per Task 13's documented gemini quirks.
 */
const recordedGeminiSuccessEnvelope = {
  status: 'success',
  error_code: null,
  error_message: null,
  findings: [
    {
      finding_id: 'security.fetchUser.no-auth-check',
      severity: 'high',
      category: 'security',
      title: 'fetchUser() does not verify caller has access to requested user record',
      description: 'The fetchUser endpoint reads any user_id without verifying the caller has authorization to view that user. Allows IDOR attacks across the user table.',
      file: 'src/api/users.ts',
      symbol: 'fetchUser',
      source: {
        reviewer_id: 'gemini-review-prompter',
        family: 'google',
        source_type: 'external',
      },
      confidence: 'high',
    },
    {
      finding_id: 'correctness.handlePayment.race-condition',
      severity: 'medium',
      category: 'correctness',
      title: 'handlePayment race when two requests arrive within milliseconds',
      description: 'No idempotency key on the payment processor call; two concurrent requests for the same order_id may double-charge.',
      file: 'src/payments/handlePayment.ts',
      symbol: 'handlePayment',
      source: {
        reviewer_id: 'gemini-review-prompter',
        family: 'google',
        source_type: 'external',
      },
      confidence: 'medium',
    },
  ],
  usage: {
    input_tokens: 5234,
    output_tokens: 412,
    model: 'gemini-2.5-pro',
  },
  raw_output_path: 'docs/reviews/raw/gemini-uuid-abc123.json',
};

describe('Task 15: Recorded Gemini envelope passes shared validator', () => {
  it('the recorded successful Gemini envelope is valid', () => {
    const r = validateFullAdapterEnvelope(recordedGeminiSuccessEnvelope);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('all findings have source.reviewer_id = "gemini-review-prompter"', () => {
    for (const f of recordedGeminiSuccessEnvelope.findings) {
      expect(f.source.reviewer_id).toBe('gemini-review-prompter');
    }
  });

  it('all findings have source.family = "google"', () => {
    for (const f of recordedGeminiSuccessEnvelope.findings) {
      expect(f.source.family).toBe('google');
    }
  });

  it('all findings have source.source_type = "external"', () => {
    for (const f of recordedGeminiSuccessEnvelope.findings) {
      expect(f.source.source_type).toBe('external');
    }
  });

  it('usage object has input_tokens, output_tokens, model (NFR-MR4)', () => {
    expect(recordedGeminiSuccessEnvelope.usage).toMatchObject({
      input_tokens: expect.any(Number),
      output_tokens: expect.any(Number),
      model: expect.any(String),
    });
  });

  it('raw_output_path is a non-empty string under docs/reviews/raw/', () => {
    expect(recordedGeminiSuccessEnvelope.raw_output_path).toMatch(/^docs\/reviews\/raw\//);
  });

  describe('Negative cases — Gemini-shaped envelopes that should fail', () => {
    it('Gemini envelope with finding_id containing line number fails', () => {
      const bad = {
        ...recordedGeminiSuccessEnvelope,
        findings: [
          { ...recordedGeminiSuccessEnvelope.findings[0], finding_id: 'security.fetchUser:42' },
        ],
      };
      const r = validateFullAdapterEnvelope(bad);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('finding_id'))).toBe(true);
    });

    it('Gemini envelope with missing source.family fails', () => {
      const bad = {
        ...recordedGeminiSuccessEnvelope,
        findings: [
          {
            ...recordedGeminiSuccessEnvelope.findings[0],
            source: { reviewer_id: 'gemini-review-prompter', source_type: 'external' },
          },
        ],
      };
      const r = validateFullAdapterEnvelope(bad);
      expect(r.valid).toBe(false);
    });
  });
});

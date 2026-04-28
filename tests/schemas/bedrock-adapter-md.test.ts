/**
 * Tests for bedrock-review-prompter.md adapter specification.
 *
 * Validates per FR-MR8 (adapter responsibilities), FR-MR9 (envelope contract),
 * FR-MR10 (external adapter registration), FR-MR16 (error_code enum),
 * D3 (Haiku-backed), NFR-MR4 (usage verbatim).
 *
 * Covers:
 * 1.  File exists; Haiku model in frontmatter
 * 2.  FR-MR8: all 8 responsibilities present
 * 3.  capability_tier: text-only
 * 4.  Dynamic family from Bedrock model ID (at least 4 prefix entries documented)
 * 5.  Install one-liner: pip install awscli (exact substring)
 * 6.  Sandbox flags N/A documented
 * 7.  Auth check: aws sts get-caller-identity documented
 * 8.  error_code enum coverage: cli_missing, cli_auth_failed, parse_failed
 * 9.  Source authority cross-references: FR-MR8, FR-MR9, FR-MR10, FR-MR16, D3, NFR-MR4
 * 10. Known Gotchas section with 4 items (per-family body, region, model-access opt-in, output file cleanup)
 * 11. source.reviewer_id is "bedrock-review-prompter"
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'agents', 'bedrock-review-prompter.md',
);

describe('Task 58: bedrock-review-prompter.md', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(AGENT_PATH, 'utf8');
  });

  // 1. File exists; Haiku model
  it('file exists', () => {
    expect(existsSync(AGENT_PATH)).toBe(true);
  });

  it('declares Haiku model in frontmatter', () => {
    expect(content).toMatch(/^---[\s\S]*?model:\s*haiku[\s\S]*?---/);
  });

  // 2. FR-MR8: all 8 responsibilities present
  describe('FR-MR8: all 8 responsibilities present', () => {
    it.each([
      'CLI Presence Check',
      'Auth Check',
      'Prompt Construction',
      'CLI Invocation',
      'Output Parsing',
      'Retry-Once on Parse Failure',
      'Normalize to Canonical Envelope',
      'Return Canonical Envelope',
    ])('documents responsibility: %s', (responsibility) => {
      expect(content).toContain(responsibility);
    });
  });

  // 3. capability_tier: text-only
  it('capability_tier is text-only', () => {
    expect(content).toMatch(/capability_tier.*text-only/);
  });

  // 4. Dynamic family from Bedrock model ID — at least 4 prefix entries documented
  describe('Dynamic family from Bedrock model ID mapping', () => {
    it('documents anthropic.claude- prefix → anthropic family', () => {
      expect(content).toContain('anthropic.claude-');
    });

    it('documents meta.llama prefix → meta family', () => {
      expect(content).toContain('meta.llama');
    });

    it('documents mistral. prefix → mistral family', () => {
      // The prefix 'mistral.' appears in the mapping table
      expect(content).toMatch(/`mistral\./);
    });

    it('documents amazon.titan- prefix → amazon family', () => {
      expect(content).toContain('amazon.titan-');
    });

    it('documents family as dynamic / derived from model ID', () => {
      // The document should state family is dynamic/derived, not static
      expect(content).toMatch(/dynamic|derived/i);
    });

    it('documents ai21. prefix', () => {
      expect(content).toContain('ai21.');
    });

    it('documents cohere.command- prefix', () => {
      expect(content).toContain('cohere.command-');
    });

    it('documents unknown family for unrecognized prefixes', () => {
      expect(content).toContain('unknown');
    });
  });

  // 5. Install one-liner: pip install awscli exact substring
  it('install one-liner: pip install awscli (exact substring)', () => {
    expect(content).toContain('pip install awscli');
  });

  it('also documents brew install awscli (macOS alternative)', () => {
    expect(content).toContain('brew install awscli');
  });

  // 6. Sandbox flags N/A documented
  it('sandbox flags N/A documented (explicit statement that they do not apply)', () => {
    expect(content).toMatch(/[Ss]andbox[\s\S]{0,300}(N\/A|do not apply|not apply)/);
  });

  // 7. Auth check: aws sts get-caller-identity documented
  it('documents aws sts get-caller-identity for auth check', () => {
    expect(content).toContain('aws sts get-caller-identity');
  });

  it('documents that exit-0 from aws sts get-caller-identity means authenticated', () => {
    // Should explain that exit code 0 = authenticated regardless of output
    expect(content).toMatch(/exit 0|exits 0/);
  });

  // 8. error_code enum coverage (FR-MR16)
  describe('error_code enum coverage (FR-MR16)', () => {
    it('mentions error_code: cli_missing', () => {
      expect(content).toContain('cli_missing');
    });

    it('mentions error_code: cli_auth_failed', () => {
      expect(content).toContain('cli_auth_failed');
    });

    it('mentions error_code: parse_failed', () => {
      expect(content).toContain('parse_failed');
    });
  });

  // 9. Source authority cross-references
  describe('Source authority cross-references', () => {
    it.each([
      'FR-MR8',
      'FR-MR9',
      'FR-MR10',
      'FR-MR16',
      'D3',
      'NFR-MR4',
    ])('references %s', (ref) => {
      expect(content).toContain(ref);
    });
  });

  // 10. Known Gotchas with 4 items
  describe('Known Gotchas section with 4 items', () => {
    it('contains Known Gotchas section', () => {
      expect(content).toContain('Known Gotchas');
    });

    it('has 4 numbered gotcha items', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toBeDefined();
      expect(gotchasSection).toMatch(/1\./);
      expect(gotchasSection).toMatch(/2\./);
      expect(gotchasSection).toMatch(/3\./);
      expect(gotchasSection).toMatch(/4\./);
    });

    it('gotcha: per-family request body shape documented', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Pp]er.family request body/);
    });

    it('gotcha: region requirement documented', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Rr]egion must be set/);
    });

    it('gotcha: model-access opt-in in AWS console documented', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Mm]odel access must be enabled/);
    });

    it('gotcha: output file cleanup documented', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Oo]utput file cleanup/);
    });
  });

  // 11. source.reviewer_id is "bedrock-review-prompter"
  it('source.reviewer_id is "bedrock-review-prompter"', () => {
    expect(content).toContain('"bedrock-review-prompter"');
  });

  it('source.reviewer_id set to bedrock-review-prompter in normalization step', () => {
    expect(content).toMatch(/reviewer_id\s*=\s*"bedrock-review-prompter"/);
  });

  // Additional structural checks
  describe('Adapter envelope conformance (adapter-contract.md)', () => {
    it('documents standard output envelope with status field', () => {
      expect(content).toMatch(/"status":\s*"success"/);
    });

    it('documents standard output envelope with error_code field', () => {
      expect(content).toMatch(/"error_code"/);
    });

    it('documents raw_output_path in the output envelope', () => {
      expect(content).toContain('raw_output_path');
    });

    it('documents source_type: "external" for findings', () => {
      expect(content).toContain('external');
      expect(content).toMatch(/source_type.*external/);
    });
  });

  // CLI invocation details
  describe('CLI invocation details', () => {
    it('documents aws bedrock-runtime invoke-model command', () => {
      expect(content).toContain('aws bedrock-runtime invoke-model');
    });

    it('documents --model-id flag', () => {
      expect(content).toContain('--model-id');
    });

    it('documents output written to /tmp/ file', () => {
      expect(content).toMatch(/\/tmp\/bedrock-output/);
    });

    it('documents which aws as presence check', () => {
      expect(content).toContain('which aws');
    });
  });
});

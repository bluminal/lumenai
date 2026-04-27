/**
 * Tests for gemini-review-prompter.md adapter specification.
 *
 * Validates per FR-MR8 (adapter responsibilities), FR-MR9 (envelope contract),
 * FR-MR10 (external adapter registration), FR-MR16 (error_code enum),
 * FR-MR26 (sandbox flags), D3 (external adapters additive), NFR-MR4 (usage verbatim).
 *
 * Covers:
 * 1.  File exists
 * 2.  Declares Haiku model in frontmatter
 * 3.  FR-MR8: all 8 responsibilities present
 * 4.  capability_tier: agentic
 * 5.  family: google
 * 6.  Documents sandbox flag set (FR-MR26)
 * 7.  References FR-MR26
 * 8.  Install one-liner present (npm install -g @google)
 * 9.  Auth check pointers (gcloud auth list and gcloud auth login)
 * 10. error_code enum coverage: cli_missing, cli_auth_failed, parse_failed
 * 11. Source authority cross-references: FR-MR8, FR-MR9, FR-MR10, FR-MR16, FR-MR26, D3, NFR-MR4
 * 12. Known Gotchas section contains at least 3 numbered gemini-specific quirks
 * 13. source.reviewer_id is "gemini-review-prompter"
 * 14. source.family is "google"
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'agents', 'gemini-review-prompter.md',
);

describe('Task 13: gemini-review-prompter.md', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(AGENT_PATH, 'utf8');
  });

  // 1. File exists
  it('file exists', () => {
    expect(existsSync(AGENT_PATH)).toBe(true);
  });

  // 2. Declares Haiku model in frontmatter
  it('declares Haiku model in frontmatter', () => {
    expect(content).toMatch(/^---[\s\S]*?model:\s*haiku[\s\S]*?---/);
  });

  // 3. FR-MR8: all 8 responsibilities present
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

  // 4. capability_tier: agentic
  it('capability_tier is agentic', () => {
    expect(content).toContain('agentic');
    // capability_tier declared alongside agentic (allow for markdown bold/backtick formatting)
    const capabilityIdx = content.indexOf('capability_tier');
    const agenticIdx = content.indexOf('agentic');
    expect(capabilityIdx).toBeGreaterThanOrEqual(0);
    expect(agenticIdx).toBeGreaterThanOrEqual(0);
    // They should appear close together (within 50 chars)
    expect(Math.abs(capabilityIdx - agenticIdx)).toBeLessThan(50);
  });

  // 5. family: google
  it('default family is google', () => {
    expect(content).toMatch(/family[`'"]?:?\s*[`'"]?google/);
  });

  // 6. Documents sandbox flag set (FR-MR26)
  it('documents the --readonly sandbox flag', () => {
    expect(content).toContain('--readonly');
  });

  // 7. References FR-MR26
  it('references FR-MR26', () => {
    expect(content).toContain('FR-MR26');
  });

  // 8. Install one-liner present
  it('install one-liner references npm install -g @google', () => {
    expect(content).toContain('npm install -g @google');
  });

  // 9. Auth check pointers
  describe('Auth check pointers', () => {
    it('references gcloud auth list', () => {
      expect(content).toContain('gcloud auth list');
    });

    it('references gcloud auth login', () => {
      expect(content).toContain('gcloud auth login');
    });
  });

  // 10. error_code enum coverage
  describe('error_code enum coverage (FR-MR16)', () => {
    it.each(['cli_missing', 'cli_auth_failed', 'parse_failed'])(
      'mentions error_code: %s',
      (code) => {
        expect(content).toContain(code);
      },
    );
  });

  // 11. Source authority cross-references
  describe('Source authority cross-references', () => {
    it.each(['FR-MR8', 'FR-MR9', 'FR-MR10', 'FR-MR16', 'FR-MR26', 'D3', 'NFR-MR4'])(
      'references %s',
      (ref) => {
        expect(content).toContain(ref);
      },
    );
  });

  // 12. Known Gotchas section contains at least 3 numbered gemini-specific quirks
  describe('Known Gotchas section', () => {
    it('contains a Known Gotchas section', () => {
      expect(content).toContain('Known Gotchas');
    });

    it('contains at least 3 numbered quirks within the Known Gotchas section', () => {
      // Split on the section header specifically to avoid matching inline references
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toBeDefined();

      // Count numbered bold items (e.g. "1. **...")
      const numberedItems = gotchasSection.match(/\d+\.\s+\*\*/g);
      expect(numberedItems, 'expected at least 3 numbered bold items in Known Gotchas').not.toBeNull();
      expect(numberedItems!.length).toBeGreaterThanOrEqual(3);
    });

    it('Known Gotchas includes a quirk about markdown code-block fences', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/markdown code.block|code.block fence|triple.backtick/i);
    });

    it('Known Gotchas includes a quirk about null vs empty findings array', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/"findings": null|findings.*null/);
    });

    it('Known Gotchas includes a quirk about streaming or line-delimited JSON', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/stream|line.delimited|NDJSON|chunks/i);
    });
  });

  // 13. source.reviewer_id is "gemini-review-prompter"
  it('source.reviewer_id is "gemini-review-prompter"', () => {
    expect(content).toContain('gemini-review-prompter');
    expect(content).toMatch(/reviewer_id[`'"]?:?\s*[`'"]?gemini-review-prompter/);
  });

  // 14. source.family is "google"
  it('source.family is "google"', () => {
    expect(content).toMatch(/["']?family["']?\s*:\s*["']?google["']?/);
  });

  // Additional structural checks
  describe('Adapter envelope conformance (adapter-contract.md)', () => {
    it('documents the standard output envelope shape with status field', () => {
      expect(content).toMatch(/"status":\s*"success"/);
    });

    it('documents the standard output envelope shape with error_code field', () => {
      expect(content).toMatch(/"error_code"/);
    });

    it('documents raw_output_path in the output envelope', () => {
      expect(content).toContain('raw_output_path');
    });

    it('documents source_type: "external" for findings', () => {
      expect(content).toContain('external');
      expect(content).toMatch(/source_type[`'"]?:?\s*[`'"]?external/);
    });
  });

  describe('CLI invocation details', () => {
    it('documents gemini -p CLI flag', () => {
      expect(content).toContain('gemini -p');
    });

    it('documents --output-format json CLI flag', () => {
      expect(content).toContain('--output-format json');
    });
  });
});

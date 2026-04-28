/**
 * Tests for claude-review-prompter.md adapter specification.
 *
 * Validates per FR-MR8 (adapter responsibilities), FR-MR9 (envelope contract),
 * FR-MR10 (external adapter registration; specialty status), FR-MR15 (self-preference),
 * FR-MR16 (error_code enum), FR-MR26 (sandbox flags), D3 (external adapters additive),
 * NFR-MR4 (usage verbatim).
 *
 * Covers:
 * 1.  File exists; declares Haiku model in frontmatter
 * 2.  FR-MR8: all 8 responsibilities present
 * 3.  capability_tier: agentic
 * 4.  family: anthropic
 * 5.  CRITICAL: "Specialty Adapter" section present (FR-MR10)
 * 6.  Specialty status references cross-family alternatives
 * 7.  Specialty status mentions FR-MR15 self-preference warning
 * 8.  Install one-liner present
 * 9.  Sandbox flags documented (FR-MR26)
 * 10. error_code enum coverage (FR-MR16)
 * 11. Source authority cross-references: FR-MR8, FR-MR9, FR-MR10, FR-MR16, FR-MR26, D3, NFR-MR4
 * 12. Known Gotchas section (4 items including self-preference + model-must-differ)
 * 13. source.reviewer_id is "claude-review-prompter"
 * 14. NOT in defaults — explicit check for opt-in requirement
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'agents', 'claude-review-prompter.md',
);

describe('Task 59: claude-review-prompter.md', () => {
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

  // 3. capability_tier: agentic
  it('capability_tier is agentic', () => {
    const capabilityIdx = content.indexOf('capability_tier');
    const agenticIdx = content.indexOf('agentic');
    expect(capabilityIdx).toBeGreaterThanOrEqual(0);
    expect(agenticIdx).toBeGreaterThanOrEqual(0);
    // They should appear close together (within 50 chars)
    expect(Math.abs(capabilityIdx - agenticIdx)).toBeLessThan(50);
  });

  // 4. family: anthropic
  it('default family is anthropic', () => {
    expect(content).toMatch(/family[`'"]?:?\s*[`'"]?anthropic/);
  });

  // 5. CRITICAL: "Specialty Adapter" section present — raw-string checks (FR-MR10)
  describe('Specialty Adapter section (FR-MR10) — CRITICAL', () => {
    it('contains the text "Specialty Adapter"', () => {
      expect(content).toContain('Specialty Adapter');
    });

    it('contains "NOT in Default-Recommended Set"', () => {
      expect(content).toContain('NOT in Default-Recommended Set');
    });

    it('references FR-MR10 in the specialty section', () => {
      const specialtySection = content.split('Specialty Adapter')[1];
      expect(specialtySection).toBeDefined();
      expect(specialtySection).toContain('FR-MR10');
    });
  });

  // 6. Specialty status references cross-family alternatives
  describe('Specialty status cross-family alternatives', () => {
    it('references codex-review-prompter as an alternative', () => {
      expect(content).toContain('codex-review-prompter');
    });

    it('references gemini-review-prompter as an alternative', () => {
      expect(content).toContain('gemini-review-prompter');
    });

    it('references ollama-review-prompter as an alternative', () => {
      expect(content).toContain('ollama-review-prompter');
    });
  });

  // 7. Specialty status mentions FR-MR15 self-preference warning
  it('mentions FR-MR15 self-preference warning', () => {
    expect(content).toContain('FR-MR15');
  });

  // 8. Install one-liner present
  it('install one-liner present', () => {
    expect(content).toMatch(/npm install -g @anthropic-ai\/claude-code/);
  });

  it('Install One-Liner section heading present', () => {
    expect(content).toContain('Install One-Liner');
  });

  // 9. Sandbox flags documented (FR-MR26)
  describe('Sandbox flags per FR-MR26', () => {
    it('references FR-MR26', () => {
      expect(content).toContain('FR-MR26');
    });

    it('documents --permission-mode acceptEdits flag', () => {
      expect(content).toContain('--permission-mode acceptEdits');
    });

    it('documents --tools "" flag for disabling tools', () => {
      expect(content).toContain('--tools ""');
    });

    it('documents sandbox flag variance from Codex', () => {
      // The doc must explain that Claude CLI flags differ from Codex's --sandbox read-only
      expect(content).toMatch(/[Vv]ariance|differ/);
    });
  });

  // 10. error_code enum coverage (FR-MR16)
  describe('error_code enum coverage (FR-MR16)', () => {
    it.each(['cli_missing', 'cli_auth_failed', 'parse_failed', 'cli_failed'])(
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

  // 12. Known Gotchas section (4 items: self-preference + model-must-differ + auth-shared + sandbox-variance)
  describe('Known Gotchas section', () => {
    it('contains a Known Gotchas section', () => {
      expect(content).toContain('Known Gotchas');
    });

    it('contains at least 4 numbered items in Known Gotchas', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toBeDefined();
      const numberedItems = gotchasSection.match(/\d+\.\s+\*\*/g);
      expect(numberedItems, 'expected at least 4 numbered bold items in Known Gotchas').not.toBeNull();
      expect(numberedItems!.length).toBeGreaterThanOrEqual(4);
    });

    it('Known Gotchas includes self-preference risk', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Ss]elf.preference/);
    });

    it('Known Gotchas includes model-must-differ misconfiguration warning', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Mm]odel must differ|same model/);
    });

    it('Known Gotchas includes auth-shared-with-host note', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Aa]uth shared|shared.*auth|credential store/i);
    });

    it('Known Gotchas includes sandbox flag variance note', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Ss]andbox flag variance|flag variance/);
    });
  });

  // 13. source.reviewer_id is "claude-review-prompter"
  it('source.reviewer_id is "claude-review-prompter"', () => {
    expect(content).toContain('claude-review-prompter');
    expect(content).toMatch(/reviewer_id[`'" ]*:?\s*[`'"]?claude-review-prompter/);
  });

  // 14. NOT in defaults — explicit raw-string check
  it('explicitly states NOT in multi_model_review.reviewers defaults', () => {
    expect(content).toContain('NOT in `multi_model_review.reviewers` defaults');
  });

  it('requires explicit user opt-in', () => {
    expect(content).toMatch(/opted in|opt.in|MUST be opted/i);
  });

  // Additional structural checks — adapter envelope conformance
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

  // CLI invocation details
  describe('Claude CLI invocation details', () => {
    it('documents non-interactive -p flag', () => {
      expect(content).toContain('-p');
    });

    it('documents --output-format json flag', () => {
      expect(content).toContain('--output-format json');
    });

    it('documents --model flag for model selection', () => {
      expect(content).toContain('--model');
    });
  });

  // Auth check details
  describe('Auth check pointers', () => {
    it('references claude auth status', () => {
      expect(content).toContain('claude auth status');
    });

    it('references claude auth login', () => {
      expect(content).toContain('claude auth login');
    });
  });
});

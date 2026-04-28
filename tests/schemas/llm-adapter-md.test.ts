/**
 * Tests for llm-review-prompter.md adapter specification.
 *
 * Validates per FR-MR8 (adapter responsibilities), FR-MR9 (envelope contract),
 * FR-MR10 (external adapter registration / v1 fast-follow), FR-MR16 (error_code enum),
 * FR-MR26 (sandbox flags — N/A for stateless CLI), D3 (Haiku-backed),
 * NFR-MR4 (usage verbatim), NFR-MR5 (no orchestrator change required).
 *
 * Covers:
 * 1.  File exists; declares Haiku model in frontmatter
 * 2.  FR-MR8: all 8 responsibilities present
 * 3.  capability_tier: text-only
 * 4.  Family is dynamic — raw-string "dynamic" + prefix mapping table (≥5 prefix entries)
 * 5.  Install one-liner: `pip install llm` (exact substring)
 * 6.  Sandbox flags N/A documented (explicit statement)
 * 7.  Auth check N/A documented (per-plugin auth model)
 * 8.  error_code enum coverage (cli_missing, parse_failed)
 * 9.  Source authority cross-references: FR-MR8, FR-MR9, FR-MR10, FR-MR16, D3, NFR-MR4
 * 10. Known Gotchas section with 4 numbered items
 * 11. source.reviewer_id is "llm-review-prompter"
 * 12. No orchestrator change required (NFR-MR5) — documented as purely additive
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'agents', 'llm-review-prompter.md',
);

describe('Task 57: llm-review-prompter.md', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(AGENT_PATH, 'utf8');
  });

  // 1. File exists; declares Haiku model
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
  it('capability_tier: text-only', () => {
    expect(content).toMatch(/capability_tier.*text-only/);
  });

  // 4. Family is dynamic — raw-string match for "dynamic" + prefix mapping table entries
  describe('Family is dynamic — prefix mapping table', () => {
    it('declares family as dynamic (raw string "dynamic")', () => {
      expect(content).toContain('dynamic');
      // capability_tier and dynamic appear in the Capability Tier section
      expect(content).toMatch(/family.*dynamic/);
    });

    it('prefix mapping table: gpt- → openai', () => {
      expect(content).toContain('gpt-');
      expect(content).toMatch(/gpt-[\s\S]{0,50}openai/);
    });

    it('prefix mapping table: claude- → anthropic', () => {
      expect(content).toContain('claude-');
      expect(content).toMatch(/claude-[\s\S]{0,50}anthropic/);
    });

    it('prefix mapping table: gemini- → google', () => {
      expect(content).toContain('gemini-');
      expect(content).toMatch(/gemini-[\s\S]{0,50}google/);
    });

    it('prefix mapping table: mistral → mistral', () => {
      expect(content).toMatch(/`mistral`[\s\S]{0,50}mistral/);
    });

    it('prefix mapping table: command- → cohere', () => {
      expect(content).toContain('command-');
      expect(content).toMatch(/command-[\s\S]{0,50}cohere/);
    });

    it('prefix mapping table documents fallback: unknown for unrecognized', () => {
      expect(content).toContain('unknown');
    });
  });

  // 5. Install one-liner: pip install llm
  it('install one-liner: pip install llm (exact substring)', () => {
    expect(content).toContain('pip install llm');
  });

  it('install one-liner section present', () => {
    expect(content).toContain('Install One-Liner');
  });

  // 6. Sandbox flags N/A documented
  it('sandbox flags N/A documented (explicit statement that they do not apply)', () => {
    expect(content).toMatch(/[Ss]andbox[\s\S]{0,400}(N\/A|not applicable|do not apply)/);
  });

  it('FR-MR26 referenced (sandbox flags)', () => {
    expect(content).toContain('FR-MR26');
  });

  // 7. Auth check N/A documented (per-plugin auth model)
  it('auth check N/A: explicitly states per-plugin auth model', () => {
    expect(content).toMatch(/[Aa]uth[\s\S]{0,300}(N\/A|per-plugin|per plugin)/);
  });

  it('auth check: notes that missing-key errors surface as cli_failed', () => {
    expect(content).toMatch(/cli_failed/);
    // Specifically states auth errors surface as cli_failed, not cli_auth_failed
    expect(content).toContain('cli_failed');
  });

  it('cli_auth_failed is NOT emitted by this adapter (N/A declared)', () => {
    // The adapter explicitly states cli_auth_failed is never emitted by this adapter.
    // Verify it appears only in the context of explaining it's N/A.
    expect(content).toContain('cli_auth_failed');
    // Must also state it is never emitted
    expect(content).toMatch(/cli_auth_failed.*never emitted|never emitted.*cli_auth_failed/);
  });

  // 8. error_code enum coverage
  describe('error_code enum coverage (FR-MR16)', () => {
    it('mentions error_code: cli_missing', () => {
      expect(content).toContain('cli_missing');
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

  // 10. Known Gotchas section with 4 numbered items
  describe('Known Gotchas section with 4 numbered items', () => {
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

    it('gotcha 1: plugin per provider', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Pp]lugin per provider/);
    });

    it('gotcha 2: -s flag varies by version', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/-s.*flag|flag.*-s/i);
    });

    it('gotcha 3: no native sandbox', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Nn]o native sandbox/);
    });

    it('gotcha 4: usage reporting is plugin-dependent', () => {
      const gotchasSection = content.split('## Known Gotchas')[1];
      expect(gotchasSection).toMatch(/[Uu]sage reporting is plugin.dependent/);
    });
  });

  // 11. source.reviewer_id is "llm-review-prompter"
  it('source.reviewer_id is "llm-review-prompter"', () => {
    expect(content).toContain('"llm-review-prompter"');
    expect(content).toMatch(/reviewer_id\s*=\s*"llm-review-prompter"/);
  });

  // 12. No orchestrator change required (NFR-MR5) — purely additive
  it('NFR-MR5: no orchestrator change required — documented as purely additive', () => {
    expect(content).toContain('NFR-MR5');
    expect(content).toMatch(/[Nn]o orchestrator change required/);
    expect(content).toMatch(/purely additive/);
  });

  // Additional structural checks (adapter-contract.md conformance)
  describe('Adapter envelope conformance', () => {
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
      expect(content).toMatch(/source_type.*external/);
    });
  });

  // CLI invocation pattern checks
  describe('CLI invocation details', () => {
    it('documents llm -m <model> invocation', () => {
      expect(content).toMatch(/llm -m/);
    });

    it('documents which llm for CLI presence check', () => {
      expect(content).toContain('which llm');
    });

    it('documents stdin invocation pattern (< prompt.txt or pipe)', () => {
      expect(content).toMatch(/< prompt\.txt|stdin/);
    });
  });
});

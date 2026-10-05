/**
 * Task 43 (FR-HM28): adapter byte-size budget.
 *
 * The six `*-review-prompter.md` adapters delegate FR-MR8 envelope
 * construction/normalization to `scripts/validate-findings` and the
 * FR-MR8 shared-procedure prose to `docs/adapter-common.md` (a D17
 * cold-path include). Each adapter file should therefore hold only what
 * is genuinely CLI-specific: invocation flags, auth check, model/family
 * default, parse quirks, Known Gotchas, and (where applicable) its
 * Permission Model table. This test pins the resulting size budget so a
 * future edit that re-inlines shared boilerplate is caught immediately.
 *
 * Before this task: bedrock 16.6 KB, claude 13.9 KB, codex 16.8 KB,
 * gemini 22.0 KB, llm 15.1 KB, ollama 14.6 KB.
 */

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync, statSync } from 'node:fs';

const ROOT = join(__dirname, '..', '..');
const AGENTS_DIR = join(ROOT, 'plugins', 'synthex', 'agents');

const MAX_BYTES = 6144;

const ADAPTERS = [
  'bedrock-review-prompter.md',
  'claude-review-prompter.md',
  'codex-review-prompter.md',
  'gemini-review-prompter.md',
  'grok-review-prompter.md', // multi-model-review Task 68
  'llm-review-prompter.md',
  'ollama-review-prompter.md',
] as const;

describe('Task 43 (FR-HM28): *-review-prompter.md adapters stay <= 6,144 bytes', () => {
  it.each(ADAPTERS)('%s is <= 6,144 bytes', (adapter) => {
    const path = join(AGENTS_DIR, adapter);
    const { size } = statSync(path);
    expect(size, `${adapter} is ${size} bytes, over the ${MAX_BYTES}-byte budget`).toBeLessThanOrEqual(
      MAX_BYTES,
    );
  });

  it('every adapter still contains its FR-MR8 8-responsibility labels (shrink did not drop required content)', () => {
    const labels = [
      'CLI Presence Check',
      'Auth Check',
      'Prompt Construction',
      'CLI Invocation',
      'Output Parsing',
      'Retry-Once on Parse Failure',
      'Normalize to Canonical Envelope',
      'Return Canonical Envelope',
    ];
    for (const adapter of ADAPTERS) {
      const content = readFileSync(join(AGENTS_DIR, adapter), 'utf8');
      for (const label of labels) {
        expect(content, `${adapter} missing FR-MR8 label "${label}"`).toContain(label);
      }
    }
  });

  it('every adapter Read-gates the shared adapter-common.md doc (D17 form, FR-HM13 other-hosts pairing)', () => {
    for (const adapter of ADAPTERS) {
      const content = readFileSync(join(AGENTS_DIR, adapter), 'utf8');
      expect(
        content,
        `${adapter} does not Read-gate \${CLAUDE_PLUGIN_ROOT}/docs/adapter-common.md`,
      ).toContain('Read `${CLAUDE_PLUGIN_ROOT}/docs/adapter-common.md`');
      expect(content).toMatch(/other hosts/i);
      expect(content).toMatch(/plugin root/i);
    }
  });
});

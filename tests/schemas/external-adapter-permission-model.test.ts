import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const AGENTS_DIR = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents');

type Adapter = {
  name: string;
  file: string;
  cliKey: string;
  readOnlyMarker: string | RegExp;
};

// Task 81 covers the four non-Codex / non-Claude external adapters.
// Each must default to Pattern 1 (read-only), reference the
// external_permission_mode config key, and document the sandbox-yolo
// escape hatch — either via a real CLI flag (gemini) or via an explicit
// "no tool-use surface" rationale (bedrock, llm, ollama).
const ADAPTERS: Adapter[] = [
  {
    name: 'gemini',
    file: 'gemini-review-prompter.md',
    cliKey: 'gemini',
    readOnlyMarker: '--readonly',
  },
  {
    name: 'bedrock',
    file: 'bedrock-review-prompter.md',
    cliKey: 'bedrock',
    readOnlyMarker: /no tool-use|by virtue of the API/i,
  },
  {
    name: 'llm',
    file: 'llm-review-prompter.md',
    cliKey: 'llm',
    readOnlyMarker: /no tool-use|by virtue of the protocol|stateless/i,
  },
  {
    name: 'ollama',
    file: 'ollama-review-prompter.md',
    cliKey: 'ollama',
    readOnlyMarker: /no tool-use|by virtue of the (HTTP )?API/i,
  },
];

describe('Task 81: external adapter permission model (ADR-003 / FR-MMT21)', () => {
  for (const adapter of ADAPTERS) {
    describe(`${adapter.name} adapter`, () => {
      let content: string;
      beforeAll(() => {
        content = readFileSync(join(AGENTS_DIR, adapter.file), 'utf8');
      });

      it('[T] documents read-only flag or explicit safety rationale', () => {
        if (typeof adapter.readOnlyMarker === 'string') {
          expect(content).toContain(adapter.readOnlyMarker);
        } else {
          expect(content).toMatch(adapter.readOnlyMarker);
        }
      });

      it('[T] references the external_permission_mode config key (raw-string check for sandbox-yolo override step)', () => {
        expect(content).toContain('multi_model_review.external_permission_mode');
      });

      it('[T] references the sandbox-yolo mode literally', () => {
        expect(content).toContain('sandbox-yolo');
      });

      it('[T] references the per-CLI config key path', () => {
        expect(content).toContain(`external_permission_mode.${adapter.cliKey}`);
      });

      it('documents Pattern 1 as the default for this adapter', () => {
        expect(content).toMatch(/Pattern 1.*read-only/i);
        expect(content).toMatch(/default for/i);
      });

      it('rejects parent-mediated mode (only Codex and Claude support it)', () => {
        expect(content).toContain('parent-mediated');
        expect(content).toMatch(/not supported|cli_unsupported_mode/i);
      });

      it('references ADR-003 and FR-MMT21', () => {
        expect(content).toContain('ADR-003');
        expect(content).toContain('FR-MMT21');
      });

      it('has a Permission Model section heading', () => {
        expect(content).toMatch(/^## Permission Model/m);
      });
    });
  }
});

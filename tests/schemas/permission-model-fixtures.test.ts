/**
 * Task 84 (Phase 11.1): Permission model Layer 1 enum + Layer 2 fixtures.
 *
 * Three [T] criteria:
 *   (1) Layer 1 schema test validates `external_permission_mode` enum per CLI
 *   (2) Layer 2 fixture: Codex `app-server` requestApproval flow proxied to parent
 *   (3) Layer 2 fixture: Gemini `--readonly` invocation (no destructive tool-use)
 *
 * Plus: Layer 2 fixture for the sandbox-yolo confirmation prompt (Task 83 surface).
 *
 * Layer 2 here = synthetic JSON envelopes + structural assertions (no LLM round-trip).
 * Mirrors the precedent of `tests/schemas/codex-fixtures.test.ts` (Task 12 Layer 2).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..');
const DEFAULTS_PATH = join(REPO_ROOT, 'plugins', 'synthex', 'config', 'defaults.yaml');
const FIXTURES = join(REPO_ROOT, 'tests', 'fixtures');

const VALID_MODES = new Set(['read-only', 'parent-mediated', 'sandbox-yolo']);
const ALL_V1_CLIS = ['codex', 'claude', 'gemini', 'bedrock', 'llm', 'ollama'];
const PARENT_MEDIATED_CLIS = new Set(['codex', 'claude']);

// ─────────────────────────────────────────────────────────────────────────────
// [T] Criterion 1: Layer 1 enum validator
// ─────────────────────────────────────────────────────────────────────────────

describe('Task 84 [T] (1): Layer 1 schema — external_permission_mode enum per CLI', () => {
  let block: any;

  beforeAll(async () => {
    const content = readFileSync(DEFAULTS_PATH, 'utf8');
    let parsed: any;
    try {
      const yaml = await import('yaml');
      parsed = yaml.parse(content);
    } catch {
      const yaml = await import('js-yaml');
      parsed = (yaml as any).load(content);
    }
    block = parsed?.multi_model_review?.external_permission_mode ?? {};
  });

  it('block exists and is a plain object', () => {
    expect(block).toBeTruthy();
    expect(typeof block).toBe('object');
    expect(Array.isArray(block)).toBe(false);
  });

  it('every value in the block is a member of the allowed enum', () => {
    for (const [key, value] of Object.entries(block)) {
      expect(
        VALID_MODES.has(value as string),
        `key="${key}" has value="${value}" which is not in {read-only, parent-mediated, sandbox-yolo}`,
      ).toBe(true);
    }
  });

  it('parent-mediated is restricted to CLIs that support native approval proxying (codex, claude)', () => {
    for (const [key, value] of Object.entries(block)) {
      if (key === 'default') continue;
      if (value === 'parent-mediated') {
        expect(
          PARENT_MEDIATED_CLIS.has(key),
          `key="${key}" defaults to parent-mediated but only codex/claude support that pattern`,
        ).toBe(true);
      }
    }
  });

  it.each(ALL_V1_CLIS)('CLI "%s" has an enum-valid default', (cli) => {
    expect(block[cli]).toBeDefined();
    expect(VALID_MODES.has(block[cli])).toBe(true);
  });

  it('the universal default key is also enum-valid', () => {
    expect(block.default).toBeDefined();
    expect(VALID_MODES.has(block.default)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [T] Criterion 2: Layer 2 fixture — Codex app-server requestApproval flow
// ─────────────────────────────────────────────────────────────────────────────

describe('Task 84 [T] (2): Layer 2 fixture — Codex app-server requestApproval proxied to parent', () => {
  const FIX = join(FIXTURES, 'multi-model-review', 'adapters', 'codex', 'app-server-request-approval');
  let fixture: any;
  let expected: any;
  let scenario: string;
  let invocation: string;

  beforeAll(() => {
    fixture = JSON.parse(readFileSync(join(FIX, 'fixture.json'), 'utf8'));
    expected = JSON.parse(readFileSync(join(FIX, 'expected-envelope.json'), 'utf8'));
    scenario = readFileSync(join(FIX, 'scenario.md'), 'utf8');
    invocation = readFileSync(join(FIX, 'recorded-cli-invocation.txt'), 'utf8');
  });

  it('fixture declares parent-mediated permission mode', () => {
    expect(fixture.permission_mode).toBe('parent-mediated');
  });

  it('recorded CLI invocation uses `app-server` subcommand (raw-string check)', () => {
    expect(invocation).toContain('codex app-server');
    expect(invocation).toContain('--json');
  });

  it('stdout messages include a JSON-RPC requestApproval message with required envelope fields', () => {
    const reqApproval = fixture.stdout_messages.find((m: any) => m.kind === 'request-approval');
    expect(reqApproval).toBeDefined();
    expect(reqApproval.envelope.jsonrpc).toBe('2.0');
    expect(reqApproval.envelope.method).toBe('requestApproval');
    expect(reqApproval.envelope.id).toBeTruthy();
    expect(reqApproval.envelope.params.tool).toBeTruthy();
  });

  it('adapter surfaces requestApproval to parent via fenced codex-approval-request block', () => {
    expect(fixture.adapter_surface_to_parent.fenced_block_tag).toBe('codex-approval-request');
    expect(fixture.adapter_surface_to_parent.fenced_block_payload.id).toBe(
      fixture.stdout_messages[0].envelope.id,
    );
  });

  it('parent decision is written back as a JSON-RPC result envelope to Codex stdin', () => {
    expect(fixture.parent_decision_sent_to_stdin.jsonrpc).toBe('2.0');
    expect(fixture.parent_decision_sent_to_stdin.id).toBe(
      fixture.stdout_messages[0].envelope.id,
    );
    expect(fixture.parent_decision_sent_to_stdin.result.approved).toBe(true);
  });

  it('final result envelope normalizes into canonical adapter envelope (success path)', () => {
    expect(expected.status).toBe('success');
    expect(expected.error_code).toBeNull();
    expect(expected.findings).toHaveLength(1);
    expect(expected.findings[0].source.reviewer_id).toBe('codex-review-prompter');
    expect(expected.findings[0].source.family).toBe('openai');
    expect(expected.findings[0].source.source_type).toBe('external');
  });

  it('scenario.md describes the Pattern 3 round-trip', () => {
    expect(scenario).toContain('Pattern 3');
    expect(scenario).toContain('requestApproval');
    expect(scenario).toContain('parent');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [T] Criterion 3: Layer 2 fixture — Gemini --readonly invocation (no destructive tool-use)
// ─────────────────────────────────────────────────────────────────────────────

describe('Task 84 [T] (3): Layer 2 fixture — Gemini --readonly invocation (no destructive tool-use)', () => {
  const FIX = join(FIXTURES, 'multi-model-review', 'adapters', 'gemini', 'read-only');
  let fixture: any;
  let expected: any;
  let scenario: string;
  let invocation: string;

  beforeAll(() => {
    fixture = JSON.parse(readFileSync(join(FIX, 'fixture.json'), 'utf8'));
    expected = JSON.parse(readFileSync(join(FIX, 'expected-envelope.json'), 'utf8'));
    scenario = readFileSync(join(FIX, 'scenario.md'), 'utf8');
    invocation = readFileSync(join(FIX, 'recorded-cli-invocation.txt'), 'utf8');
  });

  it('fixture declares read-only permission mode', () => {
    expect(fixture.permission_mode).toBe('read-only');
  });

  it('recorded CLI invocation contains --readonly flag (raw-string check)', () => {
    expect(invocation).toContain('--readonly');
  });

  it('documented_flags lists --readonly as a required flag', () => {
    expect(fixture.documented_flags).toContain('--readonly');
  });

  it('no destructive tool-use is recorded (tool_use_attempts is empty)', () => {
    expect(Array.isArray(fixture.tool_use_attempts)).toBe(true);
    expect(fixture.tool_use_attempts).toHaveLength(0);
  });

  it('canonical envelope normalization populates source.* with gemini attribution', () => {
    expect(expected.status).toBe('success');
    expect(expected.findings[0].source.reviewer_id).toBe('gemini-review-prompter');
    expect(expected.findings[0].source.family).toBe('google');
    expect(expected.findings[0].source.source_type).toBe('external');
  });

  it('scenario.md describes Pattern 1 trust-boundary semantics', () => {
    expect(scenario).toContain('Pattern 1');
    expect(scenario).toContain('--readonly');
    expect(scenario).toContain('trust boundary');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bonus fixture: sandbox-yolo confirmation prompt (Task 83 surface)
// Validates the Task 83 contract is exercised by an end-to-end fixture.
// ─────────────────────────────────────────────────────────────────────────────

describe('Task 84: Layer 2 fixture — sandbox-yolo config + confirmation prompt', () => {
  const FIX = join(FIXTURES, 'multi-model-teams', 'sandbox-yolo-confirmation');
  let fixture: any;
  let scenario: string;

  beforeAll(() => {
    fixture = JSON.parse(readFileSync(join(FIX, 'fixture.json'), 'utf8'));
    scenario = readFileSync(join(FIX, 'scenario.md'), 'utf8');
  });

  it('project override sets gemini to sandbox-yolo', () => {
    expect(fixture.project_config_override.multi_model_review.external_permission_mode.gemini).toBe(
      'sandbox-yolo',
    );
  });

  it('resolved permission map preserves defaults for non-overridden CLIs', () => {
    expect(fixture.resolved_permission_mode_per_cli.codex).toBe('parent-mediated');
    expect(fixture.resolved_permission_mode_per_cli.claude).toBe('parent-mediated');
    expect(fixture.resolved_permission_mode_per_cli.gemini).toBe('sandbox-yolo');
    for (const cli of ['bedrock', 'llm', 'ollama']) {
      expect(fixture.resolved_permission_mode_per_cli[cli]).toBe('read-only');
    }
  });

  it('expected verbatim warning string matches D25 / NFR-MMT7 lock', () => {
    expect(fixture.expected_warning_string).toBe(
      '⚠ gemini is configured in sandbox-yolo mode — CLI will run with full tool permissions inside an OS sandbox.',
    );
  });

  it('all three commands have context-appropriate prompts ending in [y/N]', () => {
    for (const [cmd, prompt] of Object.entries(fixture.expected_prompts_per_command)) {
      expect(prompt as string, `${cmd} prompt missing [y/N]`).toContain('[y/N]');
      expect(prompt as string, `${cmd} prompt missing sandbox-yolo`).toContain('sandbox-yolo');
    }
  });

  it('default-N (empty input) aborts cleanly', () => {
    expect(fixture.expected_outcomes.user_input_empty_enter).toMatch(/abort/i);
    expect(fixture.expected_outcomes.user_input_empty_enter).toMatch(/default is N/i);
  });

  it('scenario.md references D25 / NFR-MMT7 verbatim copy lock', () => {
    expect(scenario).toContain('D25');
    expect(scenario).toContain('NFR-MMT7');
  });
});

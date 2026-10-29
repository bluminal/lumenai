/**
 * Task 84 (Phase 11.1): Permission model Layer 1 enum + Layer 2 fixtures.
 *
 * Three [T] criteria:
 *   (1) Layer 1 schema test validates `external_permission_mode` enum per CLI
 *   (2) Layer 2 fixture: Codex parent-mediated mode (runs Pattern 1 until Pattern 3 is
 *       rebuilt on the real app-server protocol)
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
import { loadDefaultsYaml } from '../helpers/load-defaults';

const REPO_ROOT = join(__dirname, '..', '..');
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
    const parsed = await loadDefaultsYaml();
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
// [T] Criterion 2: Layer 2 fixture — Codex parent-mediated mode
//
// Was: a Codex `app-server` flow built on a bare JSON-RPC `requestApproval` method and a
// terminal `result` message. Neither exists in the Codex CLI 0.160.0 app-server protocol
// (`codex app-server generate-json-schema`: initialize, thread/start, turn/start;
// item/commandExecution/requestApproval, item/fileChange/requestApproval, ...), and the
// adapter's `codex app-server --help` fallback probe exits 0, so the default never reached
// `codex exec`. Until Pattern 3 is rebuilt on the real protocol, parent-mediated runs
// Pattern 1 with one WARN line; this fixture pins that.
// ─────────────────────────────────────────────────────────────────────────────

describe('Task 84 [T] (2): Layer 2 fixture — Codex parent-mediated runs Pattern 1 (read-only) with a WARN', () => {
  const FIX = join(FIXTURES, 'multi-model-review', 'adapters', 'codex', 'parent-mediated-read-only');
  const ADAPTER = join(REPO_ROOT, 'plugins', 'synthex', 'agents', 'codex-review-prompter.md');
  let fixture: any;
  let expected: any;
  let scenario: string;
  let invocation: string;
  let adapter: string;

  beforeAll(() => {
    fixture = JSON.parse(readFileSync(join(FIX, 'fixture.json'), 'utf8'));
    expected = JSON.parse(readFileSync(join(FIX, 'expected-envelope.json'), 'utf8'));
    scenario = readFileSync(join(FIX, 'scenario.md'), 'utf8');
    invocation = readFileSync(join(FIX, 'recorded-cli-invocation.txt'), 'utf8');
    adapter = readFileSync(ADAPTER, 'utf8');
  });

  it('fixture declares parent-mediated permission mode, effective read-only', () => {
    expect(fixture.permission_mode).toBe('parent-mediated');
    expect(fixture.effective_pattern).toBe('read-only');
  });

  it('the default config resolves codex to parent-mediated, and that reaches codex exec', async () => {
    const parsed = await loadDefaultsYaml();
    expect(parsed.multi_model_review.external_permission_mode.codex).toBe(fixture.permission_mode);
    expect(invocation).toMatch(/^codex exec --sandbox read-only --ephemeral /);
    expect(invocation).toContain('--output-schema');
    expect(invocation).toMatch(/ -o \S+ - < /);
  });

  it('never invokes or probes codex app-server', () => {
    expect(invocation).not.toContain('app-server');
    expect(fixture.forbidden_invocations).toEqual(['codex app-server', 'codex app-server --help']);
  });

  it('exactly one WARN line, and the adapter documents the same text', () => {
    expect(fixture.expected_warnings).toHaveLength(1);
    expect(adapter).toContain(fixture.expected_warnings[0]);
  });

  it('auth check records the status line on stderr (codex login status prints nothing on stdout)', () => {
    expect(fixture.auth_check.command).toBe('codex login status');
    expect(fixture.auth_check.exit_status).toBe(0);
    expect(fixture.auth_check.stdout).toBe('');
    expect(fixture.auth_check.stderr).toMatch(/^Logged in using /);
  });

  it('final result normalizes into canonical adapter envelope (success path)', () => {
    expect(expected.status).toBe('success');
    expect(expected.error_code).toBeNull();
    expect(expected.findings).toHaveLength(fixture.recorded_last_message.findings.length);
    expect(expected.findings[0].source.reviewer_id).toBe('codex-review-prompter');
    expect(expected.findings[0].source.family).toBe('openai');
    expect(expected.findings[0].source.source_type).toBe('external');
    const usage = fixture.recorded_cli_stdout_jsonl.filter((e: any) => e.type === 'turn.completed').pop().usage;
    expect(expected.usage.input_tokens).toBe(usage.input_tokens);
    expect(expected.usage.output_tokens).toBe(usage.output_tokens);
    expect(expected.raw_output_path).toBe(fixture.raw_output_path);
  });

  it('scenario.md explains why Pattern 3 is not used and names the real protocol', () => {
    expect(scenario).toContain('Pattern 3');
    expect(scenario).toContain('Pattern 1');
    expect(scenario).toContain('turn/start');
    expect(scenario).toMatch(/exits 0/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [T] Criterion 3: Layer 2 fixture — Gemini --approval-mode default invocation
// (no destructive tool-use). Task 25 / FR-HM44 superseded the --readonly/--no-tools
// probe (neither flag ever existed in the Gemini CLI) with --approval-mode default.
// ─────────────────────────────────────────────────────────────────────────────

describe('Task 84 [T] (3): Layer 2 fixture — Gemini --approval-mode default invocation (no destructive tool-use)', () => {
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

  it('recorded CLI invocation contains --approval-mode default flag (raw-string check)', () => {
    expect(invocation).toContain('--approval-mode default');
  });

  it('documented_flags lists --approval-mode as a required flag', () => {
    expect(fixture.documented_flags).toContain('--approval-mode');
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
    expect(scenario).toContain('--approval-mode default');
    expect(scenario).toContain('trust boundary');
  });

  it('neither the fixture invocation nor scenario.md reference the removed --readonly flag', () => {
    expect(invocation).not.toContain('--readonly');
    expect(scenario).not.toContain('--readonly');
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

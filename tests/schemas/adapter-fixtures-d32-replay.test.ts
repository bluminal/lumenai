/**
 * multi-model-review Task 66 (D32, Phase 9 Risk 6): replay every existing
 * adapter fixture through the hardened scripts/validate-findings.
 *
 * D32 turns a top-level object with no `findings` key into `parse_failed`.
 * Risk 6: an adapter that passes an un-unwrapped CLI wrapper now gets a
 * visible failure instead of a silent zero-finding success. This suite
 * proves the recorded codex, gemini and ollama fixtures still produce their
 * expected envelopes once the adapter applies its documented unwrap (and,
 * where the wrapper carries usage, passes it via --usage-json), on both the
 * node path and the jq-fallback path. It also pins the Risk 6 side effect:
 * the raw codex, ollama and claude wrappers, piped un-unwrapped, are
 * parse_failed.
 *
 * codex/successful has two recorded shapes. Before the Codex quick-fix PR
 * (fix/codex-adapter-cli) it holds one `recorded_cli_stdout` wrapper; after
 * it, `recorded_last_message` (the -o file) plus `recorded_cli_stdout_jsonl`
 * (the --json event log). codexReplay() reads whichever shape is present and
 * asserts the keys it reads exist, so a renamed fixture key fails loudly
 * instead of passing for the wrong reason (e.g. empty stdin).
 *
 * The Claude adapter has no fixture suite, so its case uses an inline
 * `claude --output-format json` wrapper built from the codex findings.
 *
 * The fixture files themselves are unchanged; codex-fixtures, gemini-fixtures,
 * ollama-fixtures and fastfollow-adapter-envelopes keep running as-is.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'validate-findings');
const FIX = join(REPO_ROOT, 'tests', 'fixtures', 'multi-model-review', 'adapters');

const POSIX_TOOLS = ['bash', 'sed', 'awk', 'grep', 'cut', 'head', 'tr', 'mv', 'rm', 'mkdir', 'cat', 'mktemp', 'printf'];

type PathMode = 'node' | 'jq';

function run(mode: PathMode, args: string[], stdin: string): Record<string, any> {
  let tmp: string | undefined;
  let env: NodeJS.ProcessEnv = process.env;
  if (mode === 'jq') {
    tmp = mkdtempSync(join(tmpdir(), 'vf-replay-'));
    const bin = mkdtempSync(join(tmp, 'bin-'));
    for (const tool of [...POSIX_TOOLS, 'jq']) {
      try {
        const src = execFileSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf-8' }).trim();
        if (src) symlinkSync(src, join(bin, tool));
      } catch {
        /* tool absent on this host */
      }
    }
    env = { PATH: bin };
  }
  try {
    const stdout = execFileSync('bash', [SCRIPT, ...args], { input: stdin, env, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(stdout);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

function loadFixture(dir: string): { fixture: any; expected: any } {
  const fixture = JSON.parse(readFileSync(join(FIX, dir, 'fixture.json'), 'utf8'));
  const expectedPath = ['expected_envelope.json', 'expected-envelope.json']
    .map((n) => join(FIX, dir, n))
    .find((p) => existsSync(p));
  const expected = expectedPath ? JSON.parse(readFileSync(expectedPath, 'utf8')) : null;
  return { fixture, expected };
}

const ids = (findings: any[]) => findings.map((f) => f.finding_id);

/**
 * What the codex adapter pipes into validate-findings (its unwrapped stdin
 * and extra args), and the raw, un-unwrapped CLI stdout, for whichever
 * codex/successful fixture shape is checked out.
 */
function codexReplay(fixture: any): { stdin: string; args: string[]; rawStdout: string } {
  if (fixture.recorded_last_message !== undefined) {
    // Post quick-fix: Step 5 pipes {findings, usage} built from the -o file
    // and the last turn.completed event, with --model.
    expect(Array.isArray(fixture.recorded_last_message.findings)).toBe(true);
    expect(Array.isArray(fixture.recorded_cli_stdout_jsonl)).toBe(true);
    expect(fixture.resolved_model).toBeDefined();
    const turn = [...fixture.recorded_cli_stdout_jsonl].reverse().find((e: any) => e.type === 'turn.completed');
    expect(turn?.usage).toBeDefined();
    return {
      stdin: JSON.stringify({
        findings: fixture.recorded_last_message.findings,
        usage: { input_tokens: turn.usage.input_tokens, output_tokens: turn.usage.output_tokens },
      }),
      args: ['--model', fixture.resolved_model],
      rawStdout: fixture.recorded_cli_stdout_jsonl.map((e: any) => JSON.stringify(e)).join('\n'),
    };
  }
  // Pre quick-fix: one wrapper; the adapter unwraps the content text and
  // passes the wrapper's usage via --usage-json.
  const wrapper = fixture.recorded_cli_stdout;
  expect(wrapper).toBeDefined();
  const text = wrapper.response?.message?.content?.[0]?.text;
  expect(typeof text).toBe('string');
  return {
    stdin: text,
    args: ['--usage-json', JSON.stringify({ ...wrapper.usage, model: wrapper.model })],
    rawStdout: JSON.stringify(wrapper),
  };
}

/** Inline `claude --output-format json` wrapper: the findings live inside .result. */
function claudeWrapper(findings: any[]): Record<string, any> {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify({ findings }),
    usage: { input_tokens: 1200, output_tokens: 90, cache_read_input_tokens: 0 },
  };
}

describe.each<PathMode>(['node', 'jq'])('Task 66 Risk 6: existing adapter fixtures replayed through validate-findings — %s path', (mode) => {
  it("codex/successful: the adapter's unwrapped stdin reproduces the expected envelope", () => {
    const { fixture, expected } = loadFixture('codex/successful');
    expect(expected).not.toBeNull();
    const { stdin, args } = codexReplay(fixture);
    expect(stdin.trim().length).toBeGreaterThan(0);
    const env = run(
      mode,
      ['--reviewer-id', 'codex-review-prompter', '--family', 'openai', '--raw-output-path', expected.raw_output_path, ...args],
      stdin,
    );
    expect(env).toEqual(expected);
  });

  it('codex/successful: the raw, un-unwrapped CLI stdout is now parse_failed (D32), not a silent pass', () => {
    const { fixture } = loadFixture('codex/successful');
    const { rawStdout } = codexReplay(fixture);
    expect(rawStdout.trim().length).toBeGreaterThan(0);
    const env = run(mode, ['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], rawStdout);
    expect(env.status).toBe('failed');
    expect(env.error_code).toBe('parse_failed');
    expect(env.error_message).not.toContain('empty input');
  });

  it('claude: the unwrapped .result plus the wrapper usage via --usage-json passes (Step 5)', () => {
    const { expected } = loadFixture('codex/successful');
    const findings = expected.findings.map(({ source, ...f }: any) => f);
    const wrapper = claudeWrapper(findings);
    const usageJson = JSON.stringify({ input_tokens: wrapper.usage.input_tokens, output_tokens: wrapper.usage.output_tokens });
    const env = run(
      mode,
      ['--reviewer-id', 'claude-review-prompter', '--family', 'anthropic', '--model', 'claude-opus', '--raw-output-path', 'r.json', '--usage-json', usageJson],
      wrapper.result,
    );
    expect(env.status).toBe('success');
    expect(ids(env.findings)).toEqual(ids(expected.findings));
    expect(env.findings.every((f: any) => f.source.reviewer_id === 'claude-review-prompter')).toBe(true);
    expect(env.usage).toEqual({ input_tokens: 1200, output_tokens: 90, model: 'claude-opus' });
  });

  it('claude: the raw {type:"result"} wrapper, piped un-unwrapped, is now parse_failed (D32)', () => {
    const { expected } = loadFixture('codex/successful');
    const env = run(
      mode,
      ['--reviewer-id', 'claude-review-prompter', '--family', 'anthropic'],
      JSON.stringify(claudeWrapper(expected.findings)),
    );
    expect(env.error_code).toBe('parse_failed');
    expect(env.error_message).toContain('no "findings" key');
  });

  it('codex/malformed-output-retry: both the first call and the retry stay parse_failed (terminal)', () => {
    const { fixture, expected } = loadFixture('codex/malformed-output-retry');
    expect(expected.error_code).toBe('parse_failed');
    for (const call of [fixture.first_call, fixture.retry_call]) {
      const env = run(mode, ['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], call.stdout);
      expect(env.status).toBe('failed');
      expect(env.error_code).toBe('parse_failed');
      expect(env.findings).toEqual([]);
    }
  });

  it('gemini/successful: the .response text (prose + fence quirks) yields the expected findings', () => {
    const { fixture, expected } = loadFixture('gemini/successful');
    const env = run(mode, ['--reviewer-id', 'gemini-review-prompter', '--family', 'google'], fixture.raw_cli_response_with_quirks);
    expect(env.status).toBe('success');
    expect(ids(env.findings)).toEqual(ids(expected.findings));
  });

  it('gemini/read-only: the recorded findings payload reproduces the expected findings and usage', () => {
    const { fixture, expected } = loadFixture('gemini/read-only');
    const env = run(mode, ['--reviewer-id', 'gemini-review-prompter', '--family', 'google'], JSON.stringify(fixture.recorded_cli_stdout));
    expect(env.status).toBe(expected.status);
    expect(ids(env.findings)).toEqual(ids(expected.findings));
    expect(env.usage).toEqual(expected.usage);
  });

  it('ollama/successful: the unwrapped .response plus --usage-json reproduces the expected findings and usage', () => {
    const { fixture, expected } = loadFixture('ollama/successful');
    const raw = fixture.ollama_raw_response;
    const usageJson = JSON.stringify({ input_tokens: raw.prompt_eval_count, output_tokens: raw.eval_count, model: raw.model });
    const env = run(mode, ['--reviewer-id', 'ollama-review-prompter', '--family', 'local-qwen', '--usage-json', usageJson], raw.response);
    expect(env.status).toBe(expected.status);
    expect(ids(env.findings)).toEqual(ids(expected.findings));
    expect(env.usage).toEqual(expected.usage);
  });

  it('ollama/successful: the raw /api/generate wrapper, piped un-unwrapped, is now parse_failed (D32)', () => {
    const { fixture } = loadFixture('ollama/successful');
    const env = run(mode, ['--reviewer-id', 'ollama-review-prompter', '--family', 'local-qwen'], JSON.stringify(fixture.ollama_raw_response));
    expect(env.error_code).toBe('parse_failed');
  });
});

/**
 * Layer 2: Behavioral fixtures for scripts/validate-findings (FR-HM28, D13).
 *
 * validate-findings normalizes an external review CLI's raw stdout into the
 * FR-MR9 adapter output envelope: it fence-strips markdown code blocks,
 * joins newline-delimited JSON (NDJSON) when the whole blob does not parse
 * as one JSON value, strips trailing commas, validates each finding against
 * agents/_shared/canonical-finding.schema.json, injects `source`, and
 * prints the envelope — or a `parse_failed` envelope drawn from the closed
 * FR-MR16 error-code enum. A second `--error <code>` mode prints a
 * well-formed failure envelope for any of the eight FR-MR16 codes without
 * touching stdin, which is how every adapter constructs its cli_missing/
 * cli_auth_failed/cli_failed/timeout/sandbox_violation/unknown_error
 * envelopes (one script, not six hand-rolled JSON blobs).
 *
 * Node is preferred (guarded by `command -v node`); jq is the documented
 * fallback when node is absent (D19/NFR-HM4 — no python). The "hosts
 * without node" describe blocks below follow the jq-less-PATH pattern from
 * loop-idle-wait-behavioral.test.ts / state-flag-behavioral.test.ts: a
 * restricted PATH containing only the POSIX tools the script needs, with
 * or without jq, to prove both the jq fallback AND the dependency-free
 * "neither interpreter is present" degrade actually work end to end.
 *
 * Plan: docs/plans/harness-modernization.md Task 43; D32 hardening
 * (cli_unsupported_mode, parse_failed for wrapper/error objects and
 * finding-less NDJSON, --usage-json) is docs/plans/multi-model-review.md
 * Task 66.
 * Spec: docs/reqs/harness-modernization.md § FR-HM28.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'validate-findings');

const ERROR_CODES = [
  'cli_missing',
  'cli_auth_failed',
  'cli_failed',
  'parse_failed',
  'timeout',
  'sandbox_violation',
  'unknown_error',
  'cli_unsupported_mode', // D32 (multi-model-review Task 66)
] as const;

function run(
  args: string[],
  opts: { stdin?: string; pathDir?: string } = {},
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('bash', [SCRIPT, ...args], {
      input: opts.stdin ?? '',
      env: opts.pathDir ? { PATH: opts.pathDir } : process.env,
      encoding: 'utf-8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err: any) {
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function parseEnvelope(stdout: string): Record<string, any> {
  return JSON.parse(stdout);
}

// ── --error mode: every FR-MR16 code ─────────────────────────────────────

describe('validate-findings --error mode: every FR-MR16 error code', () => {
  it.each(ERROR_CODES)('prints a well-formed failed envelope for %s', (code) => {
    const result = run(['--error', code, '--message', `boom: ${code}`]);
    expect(result.code).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe('failed');
    expect(envelope.error_code).toBe(code);
    expect(envelope.error_message).toBe(`boom: ${code}`);
    expect(envelope.findings).toEqual([]);
    expect(envelope.usage).toBeNull();
  });

  it('echoes raw_output_path when given', () => {
    const result = run(['--error', 'cli_missing', '--message', 'm', '--raw-output-path', 'docs/reviews/raw/x.json']);
    expect(parseEnvelope(result.stdout).raw_output_path).toBe('docs/reviews/raw/x.json');
  });

  it('raw_output_path is null when not given', () => {
    const result = run(['--error', 'cli_missing', '--message', 'm']);
    expect(parseEnvelope(result.stdout).raw_output_path).toBeNull();
  });

  it('rejects an error code outside the closed FR-MR16 enum (exit 1)', () => {
    const result = run(['--error', 'not_a_real_code', '--message', 'm']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not in the closed FR-MR16 enum');
  });

  it('rejects a code that looks close but is not exact (e.g. cli_error)', () => {
    const result = run(['--error', 'cli_error', '--message', 'm']);
    expect(result.code).toBe(1);
  });
});

// ── Parse mode: usage errors ──────────────────────────────────────────────

describe('validate-findings parse mode: usage', () => {
  it('exits 1 when --reviewer-id is missing', () => {
    const result = run(['--family', 'openai'], { stdin: '{}' });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('usage:');
  });

  it('exits 1 when --family is missing', () => {
    const result = run(['--reviewer-id', 'codex-review-prompter'], { stdin: '{}' });
    expect(result.code).toBe(1);
  });
});

// ── Parse mode: fence strip ────────────────────────────────────────────────

describe('validate-findings parse mode: fence strip', () => {
  const finding = {
    finding_id: 'security.handleLogin.missing-csrf-check',
    severity: 'high',
    category: 'security',
    title: 'Missing CSRF check in handleLogin',
    description: 'The handleLogin function does not validate CSRF tokens.',
    file: 'src/auth/handleLogin.ts',
  };

  it('strips a ```json fenced block before parsing', () => {
    const stdin = '```json\n' + JSON.stringify({ findings: [finding] }) + '\n```\n';
    const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], { stdin });
    expect(result.code).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe('success');
    expect(envelope.findings).toHaveLength(1);
    expect(envelope.findings[0].finding_id).toBe(finding.finding_id);
  });

  it('strips a bare ``` fenced block (no language tag) before parsing', () => {
    const stdin = '```\n' + JSON.stringify({ findings: [finding] }) + '\n```\n';
    const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], { stdin });
    expect(parseEnvelope(result.stdout).findings).toHaveLength(1);
  });

  it('tolerates prelude/postlude prose around the fenced block', () => {
    const stdin = 'Here is my review:\n```json\n' + JSON.stringify({ findings: [finding] }) + '\n```\nThanks!\n';
    const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], { stdin });
    expect(parseEnvelope(result.stdout).findings).toHaveLength(1);
  });

  it('parses unfenced JSON unchanged', () => {
    const stdin = JSON.stringify({ findings: [finding] });
    const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], { stdin });
    expect(parseEnvelope(result.stdout).findings).toHaveLength(1);
  });

  it('strips trailing commas before parsing', () => {
    const stdin = '{"findings":[' + JSON.stringify(finding).replace(/}$/, ',}') + '],}';
    const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], { stdin });
    expect(result.code).toBe(0);
    expect(parseEnvelope(result.stdout).findings).toHaveLength(1);
  });
});

// ── Parse mode: NDJSON join ─────────────────────────────────────────────────

describe('validate-findings parse mode: NDJSON join', () => {
  const findingA = {
    finding_id: 'security.a.one',
    severity: 'high',
    category: 'security',
    title: 'A',
    description: 'da',
    file: 'a.ts',
  };
  const findingB = {
    finding_id: 'style.b.two',
    severity: 'low',
    category: 'style',
    title: 'B',
    description: 'db',
    file: 'b.ts',
  };

  it('merges findings[] arrays across NDJSON lines', () => {
    const stdin =
      JSON.stringify({ findings: [findingA], usage: { input_tokens: 10, output_tokens: 2, model: 'm' } }) +
      '\n' +
      JSON.stringify({ findings: [findingB], usage: { input_tokens: 5, output_tokens: 1, model: 'm' } }) +
      '\n';
    const result = run(['--reviewer-id', 'gemini-review-prompter', '--family', 'google'], { stdin });
    expect(result.code).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe('success');
    expect(envelope.findings.map((f: any) => f.finding_id).sort()).toEqual(
      [findingA.finding_id, findingB.finding_id].sort(),
    );
  });

  it('combines usage token counts across NDJSON lines', () => {
    const stdin =
      JSON.stringify({ findings: [findingA], usage: { input_tokens: 10, output_tokens: 2, model: 'm' } }) +
      '\n' +
      JSON.stringify({ findings: [findingB], usage: { input_tokens: 5, output_tokens: 1, model: 'm' } }) +
      '\n';
    const result = run(['--reviewer-id', 'gemini-review-prompter', '--family', 'google'], { stdin });
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.usage).toEqual({ input_tokens: 15, output_tokens: 3, model: 'm' });
  });

  it('joins NDJSON lines that are bare finding objects (no findings[] wrapper)', () => {
    const stdin = JSON.stringify(findingA) + '\n' + JSON.stringify(findingB) + '\n';
    const result = run(['--reviewer-id', 'gemini-review-prompter', '--family', 'google'], { stdin });
    expect(result.code).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.findings).toHaveLength(2);
  });

  it('normalizes a "findings": null line to an empty array', () => {
    const stdin = JSON.stringify({ findings: null, usage: { input_tokens: 1, output_tokens: 1, model: 'm' } });
    const result = run(['--reviewer-id', 'gemini-review-prompter', '--family', 'google'], { stdin });
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe('success');
    expect(envelope.findings).toEqual([]);
  });
});

// ── Parse mode: source injection ────────────────────────────────────────────

describe('validate-findings parse mode: source injection', () => {
  it('injects source.reviewer_id, source.family, and source.source_type on every finding', () => {
    const stdin = JSON.stringify({
      findings: [
        {
          finding_id: 'a.b.c',
          severity: 'medium',
          category: 'correctness',
          title: 't',
          description: 'd',
          file: 'f.ts',
        },
      ],
    });
    const result = run(
      ['--reviewer-id', 'ollama-review-prompter', '--family', 'local-qwen', '--source-type', 'external'],
      { stdin },
    );
    const finding = parseEnvelope(result.stdout).findings[0];
    expect(finding.source).toEqual({
      reviewer_id: 'ollama-review-prompter',
      family: 'local-qwen',
      source_type: 'external',
    });
  });

  it('overwrites any source object the CLI itself emitted', () => {
    const stdin = JSON.stringify({
      findings: [
        {
          finding_id: 'a.b.c',
          severity: 'medium',
          category: 'correctness',
          title: 't',
          description: 'd',
          file: 'f.ts',
          source: { reviewer_id: 'spoofed', family: 'spoofed', source_type: 'native-team' },
        },
      ],
    });
    const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], { stdin });
    const finding = parseEnvelope(result.stdout).findings[0];
    expect(finding.source.reviewer_id).toBe('codex-review-prompter');
    expect(finding.source.family).toBe('openai');
  });

  it('defaults --source-type to "external" when not given', () => {
    const stdin = JSON.stringify({
      findings: [{ finding_id: 'a.b', severity: 'low', category: 'style', title: 't', description: 'd', file: 'f' }],
    });
    const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], { stdin });
    expect(parseEnvelope(result.stdout).findings[0].source.source_type).toBe('external');
  });

  it('drops a finding that fails canonical-finding schema validation (e.g. finding_id with a line number) and reports the count', () => {
    const stdin = JSON.stringify({
      findings: [{ finding_id: 'a.b:42', severity: 'low', category: 'style', title: 't', description: 'd', file: 'f' }],
    });
    const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], { stdin });
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe('success');
    expect(envelope.findings).toEqual([]);
    expect(envelope.error_message).toContain('1 finding(s) dropped');
  });
});

// ── Parse mode: parse_failed ─────────────────────────────────────────────

describe('validate-findings parse mode: parse_failed', () => {
  it('returns error_code parse_failed when stdin is not JSON and not NDJSON', () => {
    const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], {
      stdin: 'this is not json at all\nnor is this line\n',
    });
    expect(result.code).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe('failed');
    expect(envelope.error_code).toBe('parse_failed');
    expect(envelope.findings).toEqual([]);
  });

  it('returns error_code parse_failed on empty stdin', () => {
    const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], { stdin: '' });
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe('failed');
    expect(envelope.error_code).toBe('parse_failed');
  });
});

// ── Hosts without node (jq fallback / dependency-free degrade) ─────────────

/** A PATH built from only the named POSIX tools (plain bash -c, so shell
 * aliases/functions from an interactive rc file never leak in — mirrors
 * loop-idle-wait-behavioral.test.ts / state-flag-behavioral.test.ts). */
function restrictedPath(dir: string, tools: string[]): string {
  const bin = mkdtempSync(join(dir, 'bin-'));
  for (const tool of tools) {
    let src: string;
    try {
      src = execFileSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf-8' }).trim();
    } catch {
      continue; // tool genuinely absent from this host — fine, that's the point
    }
    if (src) symlinkSync(src, join(bin, tool));
  }
  return bin;
}

const POSIX_TOOLS = ['bash', 'sed', 'awk', 'grep', 'cut', 'head', 'tr', 'mv', 'rm', 'mkdir', 'cat', 'mktemp', 'printf'];

describe('validate-findings — hosts without node, with jq', () => {
  it('falls back to the jq parser and still fence-strips, joins, and injects source', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'validate-findings-jq-'));
    try {
      const pathDir = restrictedPath(tmp, [...POSIX_TOOLS, 'jq']);
      const stdin =
        '```json\n' +
        JSON.stringify({
          findings: [
            { finding_id: 'a.b.c', severity: 'high', category: 'security', title: 't', description: 'd', file: 'f.ts' },
          ],
          usage: { input_tokens: 10, output_tokens: 2, model: 'm' },
        }) +
        '\n```\n';
      const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], { stdin, pathDir });
      expect(result.code).toBe(0);
      const envelope = parseEnvelope(result.stdout);
      expect(envelope.status).toBe('success');
      expect(envelope.findings).toHaveLength(1);
      expect(envelope.findings[0].source).toEqual({
        reviewer_id: 'codex-review-prompter',
        family: 'openai',
        source_type: 'external',
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('the jq fallback also reports parse_failed on unparsable input', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'validate-findings-jq-'));
    try {
      const pathDir = restrictedPath(tmp, [...POSIX_TOOLS, 'jq']);
      const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], {
        stdin: 'not json\n',
        pathDir,
      });
      expect(result.code).toBe(0);
      expect(parseEnvelope(result.stdout).error_code).toBe('parse_failed');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('validate-findings — hosts without node or jq', () => {
  it('degrades to a dependency-free unknown_error envelope (never silent, never a crash)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'validate-findings-nointerp-'));
    try {
      const pathDir = restrictedPath(tmp, POSIX_TOOLS);
      const stdin = JSON.stringify({
        findings: [{ finding_id: 'a.b', severity: 'low', category: 'style', title: 't', description: 'd', file: 'f' }],
      });
      const result = run(['--reviewer-id', 'codex-review-prompter', '--family', 'openai'], { stdin, pathDir });
      expect(result.code).toBe(0);
      const envelope = parseEnvelope(result.stdout);
      expect(envelope.status).toBe('failed');
      expect(envelope.error_code).toBe('unknown_error');
      expect(envelope.findings).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--error mode needs neither node nor jq (pure bash/sed/awk)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'validate-findings-nointerp-'));
    try {
      const pathDir = restrictedPath(tmp, POSIX_TOOLS);
      const result = run(['--error', 'cli_missing', '--message', 'the CLI is not installed'], { pathDir });
      expect(result.code).toBe(0);
      const envelope = parseEnvelope(result.stdout);
      expect(envelope.status).toBe('failed');
      expect(envelope.error_code).toBe('cli_missing');
      expect(envelope.error_message).toBe('the CLI is not installed');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── D32 hardening (multi-model-review Task 66) ─────────────────────────────
//
// A silent zero-finding "pass" must never come out of a CLI wrapper the
// adapter forgot to unwrap, a CLI error object, or an event log with no
// findings in it. Each case below runs on BOTH the node path and the
// jq-fallback path (restricted PATH with jq, without node).

const D32_FINDING = {
  finding_id: 'security.handleLogin.missing-csrf-check',
  severity: 'high',
  category: 'security',
  title: 'Missing CSRF check in handleLogin',
  description: 'The handleLogin function does not validate CSRF tokens.',
  file: 'src/auth/handleLogin.ts',
};

/** Raw Grok `--output-format json` wrapper: the findings live inside .text. */
const GROK_RAW_WRAPPER = JSON.stringify({
  text: JSON.stringify({ findings: [D32_FINDING] }),
  stopReason: 'end_turn',
  sessionId: 'session-0000',
  requestId: 'request-0000',
  usage: { input_tokens: 100, output_tokens: 20 },
});

/** Grok error object (e.g. an expired session). */
const GROK_ERROR_OBJECT = JSON.stringify({ type: 'error', message: 'Not signed in' });

/** Gemini `--output-format json` wrapper the adapter must unwrap (.response). */
const GEMINI_RESPONSE_WRAPPER = JSON.stringify({
  response: JSON.stringify({ findings: [D32_FINDING] }),
  stats: { models: {} },
});

/** Un-unwrapped Cursor stream-json NDJSON: init, assistant, read tool_call, result — no finding lines. */
const CURSOR_STREAM_JSON = [
  { type: 'system', subtype: 'init', model: 'example-model', cwd: '/tmp/synthex-cursor.example' },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Reviewing.' }] } },
  { type: 'tool_call', subtype: 'started', tool_call: { readToolCall: { args: { path: 'review-input.txt' } } } },
  { type: 'result', subtype: 'success', is_error: false, result: JSON.stringify({ findings: [D32_FINDING] }) },
]
  .map((o) => JSON.stringify(o))
  .join('\n');

const PARSE_FAILED_CASES: Array<[string, string]> = [
  ['a raw Grok {text, stopReason, usage} wrapper', GROK_RAW_WRAPPER],
  ['a Grok {type:"error", message} object', GROK_ERROR_OBJECT],
  ['a {response: …} object (un-unwrapped Gemini wrapper)', GEMINI_RESPONSE_WRAPPER],
  ['Cursor stream-json NDJSON with no finding lines', CURSOR_STREAM_JSON],
  ['a top-level JSON scalar', JSON.stringify('looks fine to me')],
];

const STILL_PASSES_CASES: Array<[string, string, number]> = [
  ['a bare findings array', JSON.stringify([D32_FINDING]), 1],
  [
    'bare-finding NDJSON (no findings[] wrapper)',
    JSON.stringify(D32_FINDING) + '\n' + JSON.stringify({ ...D32_FINDING, finding_id: 'style.b.two' }) + '\n',
    2,
  ],
  ['an explicit "findings": null (normalized to [])', JSON.stringify({ findings: null }), 0],
];

type PathMode = 'node' | 'jq';

function withPath<T>(mode: PathMode, fn: (pathDir?: string) => T): T {
  if (mode === 'node') return fn(undefined);
  const tmp = mkdtempSync(join(tmpdir(), 'validate-findings-d32-'));
  try {
    return fn(restrictedPath(tmp, [...POSIX_TOOLS, 'jq']));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

describe.each<PathMode>(['node', 'jq'])('D32 (Task 66): parse_failed instead of a silent pass — %s path', (mode) => {
  it.each(PARSE_FAILED_CASES)('%s gives parse_failed', (_label, stdin) => {
    const result = withPath(mode, (pathDir) =>
      run(['--reviewer-id', 'grok-review-prompter', '--family', 'xai', '--raw-output-path', 'r.json'], { stdin, pathDir }),
    );
    expect(result.code).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe('failed');
    expect(envelope.error_code).toBe('parse_failed');
    expect(envelope.findings).toEqual([]);
    expect(envelope.usage).toBeNull();
    expect(envelope.raw_output_path).toBe('r.json');
  });

  it('names the missing "findings" key and the wrapper keys in error_message', () => {
    const result = withPath(mode, (pathDir) =>
      run(['--reviewer-id', 'grok-review-prompter', '--family', 'xai'], { stdin: GROK_RAW_WRAPPER, pathDir }),
    );
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.error_message).toContain('no "findings" key');
    expect(envelope.error_message).toContain('text, stopReason');
  });

  it.each(STILL_PASSES_CASES)('%s still passes', (_label, stdin, count) => {
    const result = withPath(mode, (pathDir) =>
      run(['--reviewer-id', 'gemini-review-prompter', '--family', 'google'], { stdin, pathDir }),
    );
    expect(result.code).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe('success');
    expect(envelope.error_code).toBeNull();
    expect(envelope.findings).toHaveLength(count);
  });

  it('the node and jq paths print byte-identical envelopes for every D32 case', () => {
    if (mode === 'node') return; // compared once, from the jq pass
    for (const [, stdin] of [...PARSE_FAILED_CASES, ...STILL_PASSES_CASES.map(([l, s]) => [l, s] as [string, string])]) {
      const viaNode = run(['--reviewer-id', 'x', '--family', 'y'], { stdin });
      const viaJq = withPath('jq', (pathDir) => run(['--reviewer-id', 'x', '--family', 'y'], { stdin, pathDir }));
      expect(parseEnvelope(viaJq.stdout)).toEqual(parseEnvelope(viaNode.stdout));
    }
  });
});

describe.each<PathMode>(['node', 'jq'])('D32 (Task 66): --usage-json — %s path', (mode) => {
  const stdin = JSON.stringify({ findings: [D32_FINDING] });
  const args = ['--reviewer-id', 'grok-review-prompter', '--family', 'xai'];

  it('populates envelope usage when the model output has none', () => {
    const result = withPath(mode, (pathDir) =>
      run([...args, '--usage-json', '{"input_tokens":1,"output_tokens":2,"model":"m"}'], { stdin, pathDir }),
    );
    expect(result.code).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe('success');
    expect(envelope.usage).toEqual({ input_tokens: 1, output_tokens: 2, model: 'm' });
  });

  it('fills a missing usage model from --model, else null (the key is always present)', () => {
    const withModel = withPath(mode, (pathDir) =>
      run([...args, '--model', 'grok-x', '--usage-json', '{"input_tokens":1,"output_tokens":2}'], { stdin, pathDir }),
    );
    expect(parseEnvelope(withModel.stdout).usage).toEqual({ input_tokens: 1, output_tokens: 2, model: 'grok-x' });
    const withoutModel = withPath(mode, (pathDir) =>
      run([...args, '--usage-json', '{"input_tokens":1,"output_tokens":2}'], { stdin, pathDir }),
    );
    expect(parseEnvelope(withoutModel.stdout).usage).toEqual({ input_tokens: 1, output_tokens: 2, model: null });
  });

  it('the model output\'s own usage wins over --usage-json', () => {
    const own = JSON.stringify({ findings: [D32_FINDING], usage: { input_tokens: 9, output_tokens: 8, model: 'own' } });
    const result = withPath(mode, (pathDir) =>
      run([...args, '--usage-json', '{"input_tokens":1,"output_tokens":2,"model":"m"}'], { stdin: own, pathDir }),
    );
    expect(parseEnvelope(result.stdout).usage).toEqual({ input_tokens: 9, output_tokens: 8, model: 'own' });
  });

  it.each([
    ['not JSON', '{"input_tokens":1,'],
    ['a JSON array', '[1,2]'],
    ['a JSON string', '"usage"'],
    ['non-numeric token counts', '{"input_tokens":"1","output_tokens":2,"model":"m"}'],
  ])('a malformed --usage-json (%s) yields usage: null, not an error', (_label, usageJson) => {
    const result = withPath(mode, (pathDir) => run([...args, '--usage-json', usageJson], { stdin, pathDir }));
    expect(result.code).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.status).toBe('success');
    expect(envelope.findings).toHaveLength(1);
    expect(envelope.usage).toBeNull();
  });

  it('--error mode ignores --usage-json (failed envelopes always carry usage: null)', () => {
    const result = withPath(mode, (pathDir) =>
      run(['--error', 'cli_failed', '--message', 'm', '--usage-json', '{"input_tokens":1,"output_tokens":2,"model":"m"}'], {
        pathDir,
      }),
    );
    expect(parseEnvelope(result.stdout).usage).toBeNull();
  });
});

describe('D32 (Task 66): --error cli_unsupported_mode on the node, jq-fallback and no-dependency paths', () => {
  const check = (pathDir?: string) => {
    const result = run(['--error', 'cli_unsupported_mode', '--message', 'x'], { pathDir });
    expect(result.code).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope).toEqual({
      status: 'failed',
      error_code: 'cli_unsupported_mode',
      error_message: 'x',
      findings: [],
      usage: null,
      raw_output_path: null,
    });
  };

  it('node path (full PATH)', () => {
    check();
  });

  it('jq-fallback path (no node on PATH)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'validate-findings-d32-'));
    try {
      check(restrictedPath(tmp, [...POSIX_TOOLS, 'jq']));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('no-dependency path (neither node nor jq on PATH)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'validate-findings-d32-'));
    try {
      check(restrictedPath(tmp, POSIX_TOOLS));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('D32 (Task 66): script header documents the eight-code enum and the new flag', () => {
  const header = readFileSync(SCRIPT, 'utf8').split('\nset -u\n')[0];

  it('says "eight" FR-MR16 codes and lists cli_unsupported_mode', () => {
    expect(header).toMatch(/the eight values\s+#?\s*in the closed FR-MR16 enum/);
    expect(header).toContain('cli_unsupported_mode');
    expect(header).not.toMatch(/seven values/);
  });

  it('documents --usage-json and the D32 parse_failed rules', () => {
    expect(header).toContain('--usage-json');
    expect(header).toContain('D32');
  });
});

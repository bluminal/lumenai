/**
 * Behavioral check of codex-review-prompter.md Step 5 (Output Parsing).
 *
 * The adapter runs `codex exec --json ... --output-schema <strict schema>
 * -o "$LAST" -`: the schema-shaped answer lands in the `-o` last-message
 * file, while stdout is a JSONL event stream whose last `turn.completed`
 * event carries token usage (input_tokens, cached_input_tokens,
 * output_tokens — no model name). Step 5's documented jq pipeline combines
 * the two into {findings, usage} for scripts/validate-findings.
 *
 * This test extracts that bash block verbatim from the adapter, runs it
 * against the recorded Codex fixture (tests/fixtures/multi-model-review/
 * adapters/codex/successful/fixture.json), and asserts the envelope equals
 * expected_envelope.json — so the documented pipeline is executable, not
 * just prose. Skipped when jq is not on PATH.
 *
 * It also pins the failure paths. Codex 0.160.0 writes an EMPTY -o file when
 * a turn ends with no agent message ("Warning: no last agent message; wrote
 * empty content to ..."), and the adapter creates $LAST with mktemp, so the
 * file exists even when Codex writes nothing. An empty or missing answer must
 * reach validate-findings as empty input (parse_failed, which triggers the
 * retry), never as a clean zero-findings success. The happy path also runs
 * under zsh (the macOS default shell), where `${MODEL:+-m "$MODEL"}` would
 * not split into two words.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ADAPTER = readFileSync(join(REPO_ROOT, 'plugins', 'synthex', 'agents', 'codex-review-prompter.md'), 'utf8');
const VALIDATE = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'validate-findings');
const FIX_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'multi-model-review', 'adapters', 'codex', 'successful');
const fixture = JSON.parse(readFileSync(join(FIX_DIR, 'fixture.json'), 'utf8'));
const expected = JSON.parse(readFileSync(join(FIX_DIR, 'expected_envelope.json'), 'utf8'));

function hasCmd(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const HAS_JQ = hasCmd('jq', ['--version']);
const HAS_ZSH = hasCmd('zsh', ['-c', 'true']);

/** The ```bash block under "### 5. Output Parsing". */
function step5Block(): string {
  const section = ADAPTER.split('### 5. Output Parsing')[1]?.split(/\n### /)[0] ?? '';
  const m = section.match(/```bash\n([\s\S]*?)```/);
  if (!m) throw new Error('no bash block in Step 5');
  return m[1];
}

const SUCCESS_JSONL = fixture.recorded_cli_stdout_jsonl.map((e: unknown) => JSON.stringify(e)).join('\n') + '\n';
const USAGE_ONLY_JSONL = JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 2 } }) + '\n';

/**
 * Run the documented Step 5 block. `last` undefined = no -o file at all.
 * No pipefail: the adapter runs the block as written, and a failing jq must
 * still hand validate-findings (exit 0) empty input.
 */
function runStep5(shell: string, last: string | undefined, rawJsonl: string): { envelope: any; raw: string } {
  const dir = mkdtempSync(join(tmpdir(), 'codex-pipeline-'));
  try {
    const lastPath = join(dir, 'last.json');
    const raw = join(dir, 'raw.jsonl');
    if (last !== undefined) writeFileSync(lastPath, last);
    writeFileSync(raw, rawJsonl);
    const script = step5Block().replace(/\|\s*validate-findings /, `| "${VALIDATE}" `);
    const out = execFileSync(shell, ['-c', script], {
      env: { ...process.env, LAST: lastPath, RAW: raw, MODEL: fixture.resolved_model, RESOLVED_FAMILY: 'openai' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { envelope: JSON.parse(out), raw };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('codex-review-prompter Step 5 pipeline (documented jq + validate-findings)', () => {
  it('Step 5 documents a jq pipeline into validate-findings', () => {
    const block = step5Block();
    expect(block).toMatch(/^\[ -s "\$LAST" \] \|\| jq /);
    expect(block).toMatch(/\njq -cs /);
    expect(block).toContain('turn.completed');
    expect(block).toContain('agent_message');
    expect(block).toContain('error(');
    expect(block).toContain('validate-findings --reviewer-id codex-review-prompter');
  });

  it.skipIf(!HAS_JQ)('turns the recorded -o last message + JSONL stream into the expected canonical envelope (bash)', () => {
    const { envelope, raw } = runStep5('bash', JSON.stringify(fixture.recorded_last_message), SUCCESS_JSONL);
    expect(envelope).toEqual({ ...expected, raw_output_path: raw });
  });

  it.skipIf(!HAS_JQ || !HAS_ZSH)('produces the same envelope under zsh', () => {
    const { envelope, raw } = runStep5('zsh', JSON.stringify(fixture.recorded_last_message), SUCCESS_JSONL);
    expect(envelope).toEqual({ ...expected, raw_output_path: raw });
  });

  it.skipIf(!HAS_JQ)('an EMPTY -o file (no final agent message) is parse_failed, not a clean success', () => {
    const { envelope } = runStep5('bash', '', USAGE_ONLY_JSONL);
    expect(envelope.status).toBe('failed');
    expect(envelope.error_code).toBe('parse_failed');
    expect(envelope.findings).toEqual([]);
  });

  it.skipIf(!HAS_JQ)('a MISSING -o file is parse_failed', () => {
    const { envelope } = runStep5('bash', undefined, USAGE_ONLY_JSONL);
    expect(envelope.error_code).toBe('parse_failed');
  });

  it.skipIf(!HAS_JQ)('an -o answer without a findings array is parse_failed', () => {
    const { envelope } = runStep5('bash', JSON.stringify({ summary: 'looks fine' }), USAGE_ONLY_JSONL);
    expect(envelope.error_code).toBe('parse_failed');
  });

  it.skipIf(!HAS_JQ)('an empty -o file falls back to the last agent_message item in the JSONL stream', () => {
    const agentMessage = {
      type: 'item.completed',
      item: { id: 'item_9', type: 'agent_message', text: JSON.stringify(fixture.recorded_last_message) },
    };
    const { envelope, raw } = runStep5('bash', '', JSON.stringify(agentMessage) + '\n' + SUCCESS_JSONL);
    expect(envelope).toEqual({ ...expected, raw_output_path: raw });
  });
});

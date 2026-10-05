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

function hasJq(): boolean {
  try {
    execFileSync('jq', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** The ```bash block under "### 5. Output Parsing". */
function step5Block(): string {
  const section = ADAPTER.split('### 5. Output Parsing')[1]?.split(/\n### /)[0] ?? '';
  const m = section.match(/```bash\n([\s\S]*?)```/);
  if (!m) throw new Error('no bash block in Step 5');
  return m[1];
}

describe('codex-review-prompter Step 5 pipeline (documented jq + validate-findings)', () => {
  it('Step 5 documents a jq pipeline into validate-findings', () => {
    const block = step5Block();
    expect(block).toMatch(/^jq /);
    expect(block).toContain('turn.completed');
    expect(block).toContain('validate-findings --reviewer-id codex-review-prompter');
  });

  it.skipIf(!hasJq())('turns the recorded -o last message + JSONL stream into the expected canonical envelope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-pipeline-'));
    try {
      const last = join(dir, 'last.json');
      const raw = join(dir, 'raw.jsonl');
      writeFileSync(last, JSON.stringify(fixture.recorded_last_message));
      writeFileSync(raw, fixture.recorded_cli_stdout_jsonl.map((e: unknown) => JSON.stringify(e)).join('\n') + '\n');
      const script = step5Block().replace(/\|\s*validate-findings /, `| "${VALIDATE}" `);
      const out = execFileSync('bash', ['-c', `set -o pipefail\n${script}`], {
        env: { ...process.env, LAST: last, RAW: raw, MODEL: fixture.resolved_model, RESOLVED_FAMILY: 'openai' },
        encoding: 'utf8',
      });
      const envelope = JSON.parse(out);
      expect(envelope).toEqual({ ...expected, raw_output_path: raw });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

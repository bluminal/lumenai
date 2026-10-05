/**
 * multi-model-review Task 67 (Phase 9 CLI spike): Grok recordings.
 *
 * The sanitized live recordings under
 * `tests/fixtures/multi-model-review/adapters/grok/recordings/` are the
 * evidence behind `docs/specs/multi-model-review/spike-grok-cursor.md`.
 * Task 68's runner tests consume them in place of synthetic fixtures. This
 * suite pins the following, offline and at zero cost:
 *
 * - every recording is well-formed (it parses, and its exit code is an integer);
 * - the stop-reason evidence (U25) and the error shape (G9) that Task 68's
 *   incomplete-run guard and error mapping depend on;
 * - sanitization: no canary token, email, credential-shaped string, raw
 *   session id or local path survives;
 * - the CLI-surface cross-check: every option in every recorded argv appears
 *   in the top-level `grok --help` fixture for that CLI version.
 */

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const ROOT = join(__dirname, '..', '..');
const GROK_DIR = join(ROOT, 'tests', 'fixtures', 'multi-model-review', 'adapters', 'grok');
const REC_DIR = join(GROK_DIR, 'recordings');
const HELP_DIR = join(GROK_DIR, 'cli-help');

const GROK_VERSION = readFileSync(join(HELP_DIR, 'version.txt'), 'utf8').trim();

const RECORDINGS = [
  'g2-review-success',
  'g3-json-schema-structured-output',
  'g4-adversarial-prose-refusal',
  'g7-max-turns-cancelled',
  'g8-denied-tool-then-answer',
  'g9-unknown-model-error',
  'sandbox-read-only-refused',
] as const;
type Recording = (typeof RECORDINGS)[number];

/** The sandbox refusal's stdout was not preserved by the spike harness. */
const NO_STDOUT: ReadonlySet<Recording> = new Set(['sandbox-read-only-refused']);

function readRec(name: Recording, file: string): string {
  return readFileSync(join(REC_DIR, name, file), 'utf8');
}

function stdoutOf(name: Recording): Record<string, unknown> {
  return JSON.parse(readRec(name, 'stdout.json')) as Record<string, unknown>;
}

function exitCodeOf(name: Recording): number {
  return Number.parseInt(readRec(name, 'exit_code').trim(), 10);
}

/**
 * argv.txt is a `printf %q` shell-quoted line. No recorded argument contains
 * a space, so a whitespace split is exact. Tokens keep their %q escapes
 * (e.g. `\*`), which never affects option tokens.
 */
function argvTokens(name: Recording): string[] {
  return readRec(name, 'argv.txt').trim().split(/\s+/);
}

/** Option tokens (`-x` / `--flag`) in an argv, excluding the program name. */
function optionTokens(tokens: string[]): string[] {
  return tokens.slice(1).filter((t) => /^--?[A-Za-z]/.test(t));
}

/**
 * Options defined in a clap-style `--help` dump: definition lines are
 * indented 2 spaces (`  -m, --model <MODEL>`) or 6 spaces
 * (`      --deny <RULE>`); description lines are indented further and are
 * ignored, so flags mentioned only in prose do not count.
 */
function helpOptions(helpText: string): Set<string> {
  const opts = new Set<string>();
  for (const line of helpText.split('\n')) {
    const m = /^ {2,6}(?:(-[A-Za-z]), +)?(--[A-Za-z0-9][A-Za-z0-9-]*)/.exec(line);
    if (m) {
      if (m[1]) opts.add(m[1]);
      opts.add(m[2]);
    }
  }
  return opts;
}

/** Every file under the recordings dir, recursively. */
function allRecordingFiles(dir: string = REC_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...allRecordingFiles(p));
    else out.push(p);
  }
  return out;
}

describe(`Task 67: Grok spike recordings (${GROK_VERSION})`, () => {
  describe('each recording is well-formed', () => {
    it('the recordings dir holds exactly the expected recordings', () => {
      const dirs = readdirSync(REC_DIR).filter((e) => statSync(join(REC_DIR, e)).isDirectory());
      expect(dirs.sort()).toEqual([...RECORDINGS].sort());
    });

    it.each(RECORDINGS)('%s has argv.txt, stderr.txt, exit_code and README.md', (name) => {
      for (const f of ['argv.txt', 'stderr.txt', 'exit_code', 'README.md']) {
        expect(existsSync(join(REC_DIR, name, f)), `${name}/${f} missing`).toBe(true);
      }
      expect(readRec(name, 'argv.txt').startsWith('grok ')).toBe(true);
      expect(Number.isInteger(exitCodeOf(name))).toBe(true);
    });

    it.each(RECORDINGS.filter((n) => !NO_STDOUT.has(n)))('%s stdout.json parses as a JSON object', (name) => {
      const out = stdoutOf(name);
      expect(out).toBeTypeOf('object');
      expect(out).not.toBeNull();
      expect(Array.isArray(out)).toBe(false);
    });

    it('wrapper recordings carry the 1.0.46 json-mode wrapper keys', () => {
      const wrapperKeys = ['text', 'stopReason', 'sessionId', 'requestId', 'usage', 'num_turns', 'modelUsage'];
      for (const name of RECORDINGS.filter((n) => !NO_STDOUT.has(n) && n !== 'g9-unknown-model-error')) {
        const out = stdoutOf(name);
        for (const k of wrapperKeys) expect(out, `${name} lacks wrapper key ${k}`).toHaveProperty(k);
        expect(Object.keys(out.modelUsage as object)).toEqual(['grok-4.7-build']);
      }
    });
  });

  describe('stop-reason vocabulary and error shape (U25, U26, Risk 15)', () => {
    it('G2 and G3 completed normally: stopReason end_turn, exit 0', () => {
      for (const name of ['g2-review-success', 'g3-json-schema-structured-output'] as const) {
        expect(stdoutOf(name).stopReason).toBe('end_turn');
        expect(exitCodeOf(name)).toBe(0);
      }
    });

    it('G7 ran out of turns: stopReason cancelled, exit 1, stderr "max turns reached", num_turns 1', () => {
      const out = stdoutOf('g7-max-turns-cancelled');
      expect(out.stopReason).toBe('cancelled');
      expect(out.num_turns).toBe(1);
      expect(exitCodeOf('g7-max-turns-cancelled')).toBe(1);
      expect(readRec('g7-max-turns-cancelled', 'stderr.txt')).toContain('max turns reached');
    });

    it('G8 recovered from a denied tool attempt on turn 2 with --max-turns 3', () => {
      const out = stdoutOf('g8-denied-tool-then-answer');
      expect(out.stopReason).toBe('end_turn');
      expect(out.num_turns).toBe(2);
      expect(argvTokens('g8-denied-tool-then-answer').join(' ')).toContain('--max-turns 3');
    });

    it('G9 is a {type:"error"} object with a message and no stopReason, exit 1', () => {
      const out = stdoutOf('g9-unknown-model-error');
      expect(out.type).toBe('error');
      expect(out.message).toBeTypeOf('string');
      expect(out).not.toHaveProperty('stopReason');
      expect(exitCodeOf('g9-unknown-model-error')).toBe(1);
    });

    it('G3 structuredOutput holds strict-schema findings identical to its .text', () => {
      const out = stdoutOf('g3-json-schema-structured-output');
      const structured = out.structuredOutput as { findings: Array<Record<string, unknown>> };
      expect(JSON.parse(out.text as string)).toEqual(structured);
      const required = [
        'finding_id', 'severity', 'category', 'title', 'description', 'file', 'symbol', 'line_range', 'confidence',
      ];
      expect(structured.findings.length).toBe(3);
      for (const f of structured.findings) {
        expect(Object.keys(f).sort()).toEqual([...required].sort());
        expect(['critical', 'high', 'medium', 'low']).toContain(f.severity);
        expect(['low', 'medium', 'high']).toContain(f.confidence);
      }
    });

    it('the sandbox refusal is the docker.sock-symlink "Refusing to start" case, exit 1', () => {
      const stderr = readRec('sandbox-read-only-refused', 'stderr.txt');
      expect(stderr).toContain('runtime-socket deny path /var/run/docker.sock');
      expect(stderr).toContain('endpoint is a symlink');
      expect(stderr).toContain('Refusing to start with its protections missing');
      expect(exitCodeOf('sandbox-read-only-refused')).toBe(1);
      expect(argvTokens('sandbox-read-only-refused').join(' ')).toContain('--sandbox read-only');
    });
  });

  describe('sanitization', () => {
    const files = allRecordingFiles();

    it('scans a non-empty file set', () => {
      expect(files.length).toBeGreaterThan(RECORDINGS.length * 4);
    });

    // Single-character classes such as `[-]` keep these detectors from matching
    // their own source text in a repo-wide secret scan.
    it.each([
      ['a canary token', /CANARY[-]/],
      ['an email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
      ['an OpenAI-style key', /\bsk[-][A-Za-z0-9_-]{16,}/],
      ['an xAI key', /\bxai[-][A-Za-z0-9_-]{16,}/],
      ['a GitHub token', /\bghp[_][A-Za-z0-9]{20,}/],
      ['a UUID-like id', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
      ['a local home path', /\/Users\/[A-Za-z]/],
      // The literal mktemp template `synthex-grok.XXXXXX` is allowed; a real suffix is not.
      ['a raw scratch path', /synthex-grok\.(?!XXXXXX)[A-Za-z0-9]{6}/],
    ])('no recording file contains %s', (_label, pattern) => {
      for (const file of files) {
        expect(pattern.test(readFileSync(file, 'utf8')), `${file} matches ${pattern}`).toBe(false);
      }
    });

    it('session ids, request ids and reasoning are redacted', () => {
      for (const name of RECORDINGS.filter((n) => !NO_STDOUT.has(n) && n !== 'g9-unknown-model-error')) {
        const out = stdoutOf(name);
        expect(out.sessionId).toBe('<redacted-id>');
        expect(out.requestId).toBe('<redacted-id>');
        if ('thought' in out) expect(out.thought).toBe('<redacted-thought>');
      }
    });
  });

  describe('CLI-surface cross-check against the grok --help fixture', () => {
    const topLevel = helpOptions(readFileSync(join(HELP_DIR, 'grok.txt'), 'utf8'));

    it('the help parser finds the D25 flags (sanity check on the parser itself)', () => {
      for (const flag of ['--deny', '--disallowed-tools', '--permission-mode', '--sandbox', '-m', '--model', '--json-schema']) {
        expect(topLevel.has(flag), `parser missed ${flag}`).toBe(true);
      }
      expect(topLevel.has('--yolo')).toBe(false);
    });

    it.each(RECORDINGS)('every option in %s argv.txt is a top-level grok option', (name) => {
      const opts = optionTokens(argvTokens(name));
      expect(opts.length).toBeGreaterThan(0);
      for (const opt of opts) {
        expect(topLevel.has(opt), `${name}: ${opt} is not in grok ${GROK_VERSION} --help`).toBe(true);
      }
    });

    it.each(RECORDINGS)('%s argv carries the D25 tool-removal flags and no approval bypass', (name) => {
      const line = argvTokens(name).join(' ');
      expect(line).toContain('--disallowed-tools read_file');
      expect(line).toContain('--deny \\*');
      expect(line).toContain('--deny mcp__\\*');
      expect(line).toContain('--permission-mode dontAsk');
      expect(line).toContain('--no-subagents');
      expect(line).toContain('--disable-web-search');
      for (const banned of ['--yolo', '--always-approve', 'bypassPermissions', '--trust']) {
        expect(line).not.toContain(banned);
      }
    });
  });
});

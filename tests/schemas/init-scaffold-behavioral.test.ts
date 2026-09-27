/**
 * Layer 2: Behavioral fixtures for scripts/init-scaffold.sh — the FR-HM26
 * mechanical scaffold for `/synthex:init` Steps 2 and 8 (Task 39).
 *
 * `init-scaffold.sh [config_path] [--force]` copies the plugin's shipped
 * config/defaults.yaml to the project config path (default
 * .synthex/config.yaml) and creates the standard document directories
 * (docs/reqs, docs/plans, docs/specs, docs/specs/decisions,
 * docs/specs/rfcs, docs/runbooks, docs/retros) if they don't already
 * exist. It never overwrites an existing config file unless --force is
 * given, and it never touches the plugin's own config/defaults.yaml.
 *
 * Task 39 [T] acceptance criteria (docs/plans/harness-modernization.md):
 *   - the written .synthex/config.yaml is byte-identical to
 *     plugins/synthex/config/defaults.yaml
 *   - the document directories exist
 *   - a second run is idempotent
 *   - it works on jq-less and node-less PATHs
 *
 * Every scenario runs against a restricted PATH built the same way as
 * config-get-behavioral.test.ts / loop-idle-wait-behavioral.test.ts:148-165
 * (a symlink dir populated via `bash -c "command -v <tool>"`, which never
 * includes jq, so every case here already proves the jq-less path). A
 * separate node-less PATH (also excluding jq) proves the node-less path.
 * The script itself never shells out to node/jq/python at all, so both
 * PATHs exercise identical code — the point of these tests is to prove
 * that absence, not a fallback branch.
 *
 * Spec: docs/reqs/harness-modernization.md § FR-HM26.
 * Plan: docs/plans/harness-modernization.md Task 39.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  existsSync,
  statSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'init-scaffold.sh');
const DEFAULTS_PATH = join(REPO_ROOT, 'plugins', 'synthex', 'config', 'defaults.yaml');
const DEFAULTS_CONTENT = readFileSync(DEFAULTS_PATH);

const DOC_DIRS = [
  'docs/reqs',
  'docs/plans',
  'docs/specs',
  'docs/specs/decisions',
  'docs/specs/rfcs',
  'docs/runbooks',
  'docs/retros',
];

let projectDir: string;
let restrictedBin: string | null;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'init-scaffold-'));
  restrictedBin = null;
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
  if (restrictedBin) rmSync(restrictedBin, { recursive: true, force: true });
});

/**
 * A restricted PATH containing only the POSIX tools init-scaffold.sh could
 * plausibly need (bash, cat, mv, mkdir, rm) — built via `bash -c "command -v
 * <tool>"` so it resolves real binaries rather than the calling shell's own
 * aliases. jq is never included. `includeNode` optionally symlinks node in
 * too; every scenario below runs with includeNode both true and false, so
 * node's absence is exercised even though the script never invokes it.
 */
function buildRestrictedPath(includeNode: boolean): string {
  const bin = mkdtempSync(join(tmpdir(), `init-scaffold-bin-${includeNode ? 'node' : 'nonode'}-`));
  const tools = ['bash', 'sh', 'cat', 'mv', 'mkdir', 'rm'];
  for (const tool of tools) {
    const result = spawnSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf-8' });
    const src = result.stdout.trim();
    if (src) symlinkSync(src, join(bin, tool));
  }
  if (includeNode) {
    const result = spawnSync('bash', ['-c', 'command -v node']);
    const src = result.stdout?.toString().trim();
    if (src) symlinkSync(src, join(bin, 'node'));
  }
  return bin;
}

function restrictedPath(includeNode: boolean): string {
  restrictedBin = buildRestrictedPath(includeNode);
  return restrictedBin;
}

type RunResult = { stdout: string; stderr: string; status: number };

function run(args: string[], pathDir: string): RunResult {
  const bashBin = join(pathDir, 'bash');
  const result = spawnSync(bashBin, [SCRIPT, ...args], {
    cwd: projectDir,
    env: { PATH: pathDir, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf-8',
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
}

function allDocDirsExist(): boolean {
  return DOC_DIRS.every((d) => existsSync(join(projectDir, d)) && statSync(join(projectDir, d)).isDirectory());
}

describe('init-scaffold.sh (FR-HM26, Task 39)', () => {
  for (const includeNode of [true, false]) {
    const label = includeNode ? 'node present' : 'node-less (and jq-less) PATH';

    describe(label, () => {
      it('writes .synthex/config.yaml byte-identical to plugins/synthex/config/defaults.yaml', () => {
        const pathDir = restrictedPath(includeNode);
        const result = run([], pathDir);
        expect(result.status, `stderr: ${result.stderr}`).toBe(0);

        const written = readFileSync(join(projectDir, '.synthex', 'config.yaml'));
        expect(written.equals(DEFAULTS_CONTENT)).toBe(true);
      });

      it('creates all seven document directories', () => {
        const pathDir = restrictedPath(includeNode);
        const result = run([], pathDir);
        expect(result.status, `stderr: ${result.stderr}`).toBe(0);
        expect(allDocDirsExist()).toBe(true);
      });

      it('prints a "Created" line for the config file and each directory it created', () => {
        const pathDir = restrictedPath(includeNode);
        const result = run([], pathDir);
        expect(result.stdout).toContain('Created .synthex/config.yaml');
        for (const d of DOC_DIRS) {
          expect(result.stdout).toContain(`Created ${d}/`);
        }
      });

      it('is idempotent: a second run makes no changes and prints nothing', () => {
        const pathDir = restrictedPath(includeNode);
        const first = run([], pathDir);
        expect(first.status).toBe(0);

        const beforeConfig = readFileSync(join(projectDir, '.synthex', 'config.yaml'));

        const second = run([], pathDir);
        expect(second.status, `stderr: ${second.stderr}`).toBe(0);
        expect(second.stdout.trim()).toBe('');

        const afterConfig = readFileSync(join(projectDir, '.synthex', 'config.yaml'));
        expect(afterConfig.equals(beforeConfig)).toBe(true);
        expect(allDocDirsExist()).toBe(true);
      });

      it('never overwrites a user-modified config without --force', () => {
        const pathDir = restrictedPath(includeNode);
        run([], pathDir);

        const configPath = join(projectDir, '.synthex', 'config.yaml');
        writeFileSync(configPath, 'user_override: true\n');

        const result = run([], pathDir);
        expect(result.status).toBe(0);
        expect(readFileSync(configPath, 'utf-8')).toBe('user_override: true\n');
      });

      it('overwrites an existing config back to defaults when --force is given', () => {
        const pathDir = restrictedPath(includeNode);
        run([], pathDir);

        const configPath = join(projectDir, '.synthex', 'config.yaml');
        writeFileSync(configPath, 'user_override: true\n');

        const result = run(['--force'], pathDir);
        expect(result.status, `stderr: ${result.stderr}`).toBe(0);
        expect(result.stdout).toContain('Created .synthex/config.yaml');

        const written = readFileSync(configPath);
        expect(written.equals(DEFAULTS_CONTENT)).toBe(true);
      });

      it('leaves pre-existing document directories untouched (does not re-report them)', () => {
        const pathDir = restrictedPath(includeNode);
        mkdirSync(join(projectDir, 'docs', 'reqs'), { recursive: true });
        writeFileSync(join(projectDir, 'docs', 'reqs', 'main.md'), 'existing PRD\n');

        const result = run([], pathDir);
        expect(result.status).toBe(0);
        expect(result.stdout).not.toContain('Created docs/reqs/');
        expect(readFileSync(join(projectDir, 'docs', 'reqs', 'main.md'), 'utf-8')).toBe('existing PRD\n');
      });

      it('honors a custom config_path argument, relative to the project root', () => {
        const pathDir = restrictedPath(includeNode);
        const result = run(['.synthex/custom.yaml'], pathDir);
        expect(result.status, `stderr: ${result.stderr}`).toBe(0);
        const written = readFileSync(join(projectDir, '.synthex', 'custom.yaml'));
        expect(written.equals(DEFAULTS_CONTENT)).toBe(true);
      });
    });
  }

  it('refuses an unrecognized option with exit 1', () => {
    const pathDir = restrictedPath(true);
    const result = run(['--bogus'], pathDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown option');
  });

  it('refuses more than one positional argument with exit 1', () => {
    const pathDir = restrictedPath(true);
    const result = run(['a.yaml', 'b.yaml'], pathDir);
    expect(result.status).toBe(1);
  });

  it('documents its exit codes in a header comment (Task 32 contract)', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toMatch(/^#\s*Exit codes:\s*$/m);
  });
});

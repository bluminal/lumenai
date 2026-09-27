/**
 * Layer 2: Behavioral fixtures for scripts/commit-lint.sh — the FR-HM27
 * (D24) fail-open PreToolUse(Bash) hook that lints `git commit` subjects
 * against Conventional Commits when the project's `git.commit_convention`
 * config key is explicitly "conventional".
 *
 * Task 46 [T] acceptance criteria (docs/plans/harness-modernization.md):
 *   - the regex equals the one .github/workflows/release.yml's CHANGELOG
 *     "OTHER=" classification step uses
 *   - blocks a bad `-m` subject
 *   - passes `-F -` (and `-F <file>`) — content not on the command line
 *   - tolerates an `rtk git commit` prefix
 *   - skips `--amend --no-edit`, `-C`, `-c`, `--fixup`, `--squash`, and
 *     merge commits
 *   - exits 0 with no project config, or when the key is anything other
 *     than exactly "conventional" (including the shipped `auto` default)
 *   - fails open when node is missing
 *   - returns a fix hint on stderr when it blocks
 *
 * Spec: docs/reqs/harness-modernization.md § FR-HM27.
 * Plan: docs/plans/harness-modernization.md Task 46.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'commit-lint.sh');
const RELEASE_WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'release.yml');

let projectDir: string;
let restrictedBin: string | null;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'commit-lint-'));
  restrictedBin = null;
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
  if (restrictedBin) rmSync(restrictedBin, { recursive: true, force: true });
});

function buildRestrictedPath(includeNode: boolean): string {
  const bin = mkdtempSync(join(tmpdir(), `commit-lint-bin-${includeNode ? 'node' : 'nonode'}-`));
  const tools = ['bash', 'sh', 'cat'];
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

function writeConfig(convention: string): void {
  mkdirSync(join(projectDir, '.synthex'), { recursive: true });
  writeFileSync(
    join(projectDir, '.synthex', 'config.yaml'),
    `git:\n  commit_convention: ${convention}\n`,
  );
}

type RunResult = { stdout: string; stderr: string; status: number };

function runHook(
  command: string,
  opts: { toolName?: string; cwd?: string; pathDir?: string } = {},
): RunResult {
  const pathDir = opts.pathDir ?? restrictedPath(true);
  const cwd = opts.cwd ?? projectDir;
  const payload = JSON.stringify({
    tool_name: opts.toolName ?? 'Bash',
    tool_input: { command },
    cwd,
  });
  const result = spawnSync('bash', [SCRIPT], {
    cwd: projectDir,
    env: { PATH: pathDir, CLAUDE_PROJECT_DIR: projectDir },
    input: payload,
    encoding: 'utf-8',
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
}

describe('commit-lint.sh regex parity with release.yml (Task 46)', () => {
  it('uses the exact same recognized-type regex as .github/workflows/release.yml\'s CHANGELOG classification', () => {
    const releaseYml = readFileSync(RELEASE_WORKFLOW, 'utf-8');
    const releaseMatch = releaseYml.match(
      /OTHER=\$\(printf\s+'%s\\n' "\$ALL_SUBJECTS" \| grep -vE '([^']+)'/,
    );
    expect(releaseMatch, 'could not find release.yml\'s OTHER= regex').not.toBeNull();
    const releaseRegex = releaseMatch![1];

    const scriptContent = readFileSync(SCRIPT, 'utf-8');
    const scriptMatch = scriptContent.match(/CC_REGEX='([^']+)'/);
    expect(scriptMatch, 'could not find commit-lint.sh\'s CC_REGEX').not.toBeNull();
    const scriptRegex = scriptMatch![1];

    expect(scriptRegex).toBe(releaseRegex);
    // Pin the literal value too, so a simultaneous drift in both files
    // (which would still make the equality check above pass) is caught.
    expect(scriptRegex).toBe(
      '^(feat|fix|refactor|perf|build|ci|chore|docs|style|test|revert)(\\([^)]+\\))?!?:',
    );
  });
});

describe('commit-lint.sh (FR-HM27, Task 46)', () => {
  it('blocks a bad `-m` subject when git.commit_convention is "conventional"', () => {
    writeConfig('conventional');
    const result = runHook('git commit -m "not a conventional subject"');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('does not match Conventional Commits');
  });

  it('returns a fix hint on stderr when it blocks', () => {
    writeConfig('conventional');
    const result = runHook('git commit -m "bad subject"');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Fix:');
    expect(result.stderr).toContain('feat: add x');
  });

  it('allows a good Conventional Commits `-m` subject', () => {
    writeConfig('conventional');
    for (const subject of [
      'feat: add x',
      'fix(scope): correct y',
      'feat(scope)!: breaking change',
      'chore: bump deps',
    ]) {
      const result = runHook(`git commit -m "${subject}"`);
      expect(result.status, `subject: ${subject}, stderr: ${result.stderr}`).toBe(0);
    }
  });

  it('passes `-F -` (heredoc/stdin message) unconditionally', () => {
    writeConfig('conventional');
    const result = runHook('git commit -F -');
    expect(result.status).toBe(0);
  });

  it('passes `-F <file>` unconditionally', () => {
    writeConfig('conventional');
    const result = runHook('git commit -F /tmp/some-message-file');
    expect(result.status).toBe(0);
  });

  it('tolerates an `rtk git commit` prefix, still blocking a bad subject', () => {
    writeConfig('conventional');
    const result = runHook('rtk git commit -m "bad subject"');
    expect(result.status).toBe(2);
  });

  it('tolerates an `rtk git commit` prefix, still allowing a good subject', () => {
    writeConfig('conventional');
    const result = runHook('rtk git commit -m "feat: add x"');
    expect(result.status).toBe(0);
  });

  it('skips `--amend --no-edit`', () => {
    writeConfig('conventional');
    const result = runHook('git commit --amend --no-edit');
    expect(result.status).toBe(0);
  });

  it('skips `-C <commit>`', () => {
    writeConfig('conventional');
    const result = runHook('git commit -C HEAD~1');
    expect(result.status).toBe(0);
  });

  it('skips `-c <commit>`', () => {
    writeConfig('conventional');
    const result = runHook('git commit -c HEAD~1');
    expect(result.status).toBe(0);
  });

  it('skips `--fixup`', () => {
    writeConfig('conventional');
    const result = runHook('git commit --fixup HEAD~1');
    expect(result.status).toBe(0);
  });

  it('skips `--squash`', () => {
    writeConfig('conventional');
    const result = runHook('git commit --squash HEAD~1');
    expect(result.status).toBe(0);
  });

  it('skips a commit made while a merge is in progress (.git/MERGE_HEAD present)', () => {
    writeConfig('conventional');
    mkdirSync(join(projectDir, '.git'), { recursive: true });
    writeFileSync(join(projectDir, '.git', 'MERGE_HEAD'), `${'a'.repeat(40)}\n`);
    const result = runHook('git commit -m "Merge branch \'x\' into y"');
    expect(result.status).toBe(0);
  });

  it('exits 0 when there is no project config at all (never lints an unconfigured project)', () => {
    // No .synthex/config.yaml written.
    const result = runHook('git commit -m "bad subject"');
    expect(result.status).toBe(0);
  });

  it('exits 0 when git.commit_convention is the shipped "auto" default', () => {
    writeConfig('auto');
    const result = runHook('git commit -m "bad subject"');
    expect(result.status).toBe(0);
  });

  it.each(['issue-key', 'gitmoji', 'plain'])(
    'exits 0 when git.commit_convention is "%s" (anything but exactly "conventional")',
    (value) => {
      writeConfig(value);
      const result = runHook('git commit -m "bad subject"');
      expect(result.status).toBe(0);
    },
  );

  it('exits 0 (allows) when a non-Bash/shell tool is invoked', () => {
    writeConfig('conventional');
    const result = runHook('git commit -m "bad subject"', { toolName: 'Read' });
    expect(result.status).toBe(0);
  });

  it('exits 0 (allows) when the command is not a `git commit` invocation', () => {
    writeConfig('conventional');
    const result = runHook('git status');
    expect(result.status).toBe(0);
  });

  it('exits 0 (allows) an interactive `git commit` with no -m/-F at all', () => {
    writeConfig('conventional');
    const result = runHook('git commit');
    expect(result.status).toBe(0);
  });

  it('lints under Codex\'s "shell" tool name, not just Claude\'s "Bash"', () => {
    writeConfig('conventional');
    const result = runHook('git commit -m "bad subject"', { toolName: 'shell' });
    expect(result.status).toBe(2);
  });

  it('fails open (exit 0) when node is missing, even for an otherwise-blockable subject', () => {
    writeConfig('conventional');
    const result = runHook('git commit -m "bad subject"', { pathDir: restrictedPath(false) });
    expect(result.status).toBe(0);
  });

  it('fails open (exit 0) on empty stdin', () => {
    const result = spawnSync('bash', [SCRIPT], {
      cwd: projectDir,
      env: { PATH: restrictedPath(true), CLAUDE_PROJECT_DIR: projectDir },
      input: '',
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
  });

  it('documents its exit codes in a header comment and guards node with `command -v node` (Task 32 contract)', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toMatch(/^#\s*Exit codes:\s*$/m);
    expect(content).toContain('command -v node');
  });
});

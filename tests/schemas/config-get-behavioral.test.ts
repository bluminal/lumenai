/**
 * Layer 2: Behavioral fixtures for scripts/lib/config-get.sh — the portable
 * dotted-key reader for Synthex project config (D26, FR-HM23, FR-HM27,
 * FR-HM40).
 *
 * `config-get.sh <dotted.key> [default]` resolves a scalar by checking, in
 * order: <project>/.synthex/config.local.yaml ->
 * <project>/.synthex/config.yaml -> <project>/.synthex-plus/config.yaml
 * (D6 legacy fallback, with a stderr deprecation notice) ->
 * $XDG_CONFIG_HOME/synthex/config.yaml (user level) ->
 * plugins/synthex/config/defaults.yaml -> the [default] argument -> empty.
 *
 * Two key classes override that order: `multi_model_review.per_reviewer.*` is
 * user-owned (user layer first), and `multi_model_review.*.enabled` is
 * restrictive-wins (`false` in any hand-written layer wins).
 *
 * Every scenario below runs twice: once with `node` on PATH (the preferred
 * parser) and once on a minimal PATH that excludes `node` (the pure
 * bash + awk fallback required by FR-HM40), following the jq-less PATH
 * pattern in loop-idle-wait-behavioral.test.ts:148-165. Both parsers must
 * agree byte-for-byte.
 *
 * Spec: docs/reqs/harness-modernization.md § FR-HM23, FR-HM27, FR-HM40.
 * Plan: docs/plans/harness-modernization.md Task 33 (D26, D6).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const CONFIG_GET = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'lib', 'config-get.sh');

let projectDir: string;
/** Stands in for $XDG_CONFIG_HOME so no test reads the real user's config. */
let userConfigHome: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'config-get-'));
  userConfigHome = mkdtempSync(join(tmpdir(), 'config-get-xdg-'));
  nodelessBin = null;
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
  rmSync(userConfigHome, { recursive: true, force: true });
  if (nodelessBin) rmSync(nodelessBin, { recursive: true, force: true });
});

function writeProjectConfig(text: string): void {
  mkdirSync(join(projectDir, '.synthex'), { recursive: true });
  writeFileSync(join(projectDir, '.synthex', 'config.yaml'), text);
}

function writeLocalConfig(text: string): void {
  mkdirSync(join(projectDir, '.synthex'), { recursive: true });
  writeFileSync(join(projectDir, '.synthex', 'config.local.yaml'), text);
}

function writeUserConfig(text: string): void {
  mkdirSync(join(userConfigHome, 'synthex'), { recursive: true });
  writeFileSync(join(userConfigHome, 'synthex', 'config.yaml'), text);
}

function writeLegacyConfig(text: string): void {
  mkdirSync(join(projectDir, '.synthex-plus'), { recursive: true });
  writeFileSync(join(projectDir, '.synthex-plus', 'config.yaml'), text);
}

/** A PATH with only bash + awk — no node (FR-HM40: pure bash/awk fallback). */
let nodelessBin: string | null = null;
function nodelessPath(): string {
  if (nodelessBin && existsSync(nodelessBin)) return nodelessBin;
  const bin = mkdtempSync(join(tmpdir(), 'config-get-nonode-'));
  for (const tool of ['bash', 'awk']) {
    const src = execFileSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf-8' }).trim();
    symlinkSync(src, join(bin, tool));
  }
  nodelessBin = bin;
  return bin;
}

type RunResult = { stdout: string; stderr: string; status: number };

function run(args: string[], withNode: boolean): RunResult {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    XDG_CONFIG_HOME: userConfigHome,
  };
  let bashBin = 'bash';
  if (!withNode) {
    const bin = nodelessPath();
    env.PATH = bin;
    bashBin = join(bin, 'bash');
  }
  const result = spawnSync(bashBin, [CONFIG_GET, ...args], { env, encoding: 'utf-8' });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
}

/** Runs a scenario under both the node parser and the node-less awk fallback. */
function runBoth(args: string[]): { node: RunResult; noNode: RunResult } {
  return { node: run(args, true), noNode: run(args, false) };
}

describe('config-get.sh (D26, FR-HM23, FR-HM27, FR-HM40)', () => {
  it('reads a double-quoted scalar, stripping the quotes', () => {
    writeProjectConfig('foo:\n  bar: "hello world"\n');
    const { node, noNode } = runBoth(['foo.bar']);
    expect(node.stdout.trim()).toBe('hello world');
    expect(noNode.stdout.trim()).toBe('hello world');
    expect(node.status).toBe(0);
    expect(noNode.status).toBe(0);
  });

  it('reads a single-quoted scalar, stripping the quotes', () => {
    writeProjectConfig("foo:\n  bar: 'hello world'\n");
    const { node, noNode } = runBoth(['foo.bar']);
    expect(node.stdout.trim()).toBe('hello world');
    expect(noNode.stdout.trim()).toBe('hello world');
  });

  it('strips a trailing comment after a quoted scalar', () => {
    writeProjectConfig('foo:\n  bar: "hello world"  # a trailing comment\n');
    const { node, noNode } = runBoth(['foo.bar']);
    expect(node.stdout.trim()).toBe('hello world');
    expect(noNode.stdout.trim()).toBe('hello world');
  });

  it('strips a trailing comment after a bare (unquoted) scalar', () => {
    writeProjectConfig('foo:\n  bar: baz  # a trailing comment\n');
    const { node, noNode } = runBoth(['foo.bar']);
    expect(node.stdout.trim()).toBe('baz');
    expect(noNode.stdout.trim()).toBe('baz');
  });

  it('ignores full-line comments and blank lines while walking the mapping', () => {
    writeProjectConfig(['foo:', '  # a full-line comment', '', '  bar: baz', ''].join('\n'));
    const { node, noNode } = runBoth(['foo.bar']);
    expect(node.stdout.trim()).toBe('baz');
    expect(noNode.stdout.trim()).toBe('baz');
  });

  it('resolves a deeply nested key under 2-space indentation', () => {
    writeProjectConfig(['foo:', '  nested:', '    deep:', '      value: 42', ''].join('\n'));
    const { node, noNode } = runBoth(['foo.nested.deep.value']);
    expect(node.stdout.trim()).toBe('42');
    expect(noNode.stdout.trim()).toBe('42');
  });

  it('resolves a deeply nested key under 4-space indentation', () => {
    writeProjectConfig(['foo:', '    nested:', '        deep:', '            value: 42', ''].join('\n'));
    const { node, noNode } = runBoth(['foo.nested.deep.value']);
    expect(node.stdout.trim()).toBe('42');
    expect(noNode.stdout.trim()).toBe('42');
  });

  it('pops sibling keys correctly across a dedent (2-space)', () => {
    writeProjectConfig(['a:', '  b: 1', '  c: 2', 'd: 3', ''].join('\n'));
    const { node, noNode } = runBoth(['a.c']);
    expect(node.stdout.trim()).toBe('2');
    expect(noNode.stdout.trim()).toBe('2');
    const top = runBoth(['d']);
    expect(top.node.stdout.trim()).toBe('3');
    expect(top.noNode.stdout.trim()).toBe('3');
  });

  it('falls through to [default] when the project config file does not exist', () => {
    // no .synthex/config.yaml written at all
    const { node, noNode } = runBoth(['totally.unknown.key', 'fallback-value']);
    expect(node.stdout.trim()).toBe('fallback-value');
    expect(noNode.stdout.trim()).toBe('fallback-value');
    expect(node.status).toBe(0);
    expect(noNode.status).toBe(0);
  });

  it('falls through to [default] when the key is missing from an existing, valid file', () => {
    writeProjectConfig('foo:\n  bar: baz\n');
    const { node, noNode } = runBoth(['foo.nope', 'my-default']);
    expect(node.stdout.trim()).toBe('my-default');
    expect(noNode.stdout.trim()).toBe('my-default');
  });

  it('prints an empty value when the key is missing and no [default] is given', () => {
    writeProjectConfig('foo:\n  bar: baz\n');
    const { node, noNode } = runBoth(['foo.nope']);
    expect(node.stdout.trim()).toBe('');
    expect(noNode.stdout.trim()).toBe('');
    expect(node.status).toBe(0);
    expect(noNode.status).toBe(0);
  });

  it('falls through project config to plugin defaults.yaml when unset in the project', () => {
    // No .synthex/config.yaml at all; defaults.yaml ships quality.test_runner: vitest.
    const { node, noNode } = runBoth(['quality.test_runner']);
    expect(node.stdout.trim()).toBe('vitest');
    expect(noNode.stdout.trim()).toBe('vitest');
  });

  it('D6: falls back to the deprecated .synthex-plus/config.yaml and warns on stderr', () => {
    // Legacy pool config has the key; current project config does not.
    writeLegacyConfig('standing_pools:\n  enabled: true\n');
    const { node, noNode } = runBoth(['standing_pools.enabled']);
    expect(node.stdout.trim()).toBe('true');
    expect(noNode.stdout.trim()).toBe('true');
    expect(node.status).toBe(0);
    expect(noNode.status).toBe(0);
    for (const r of [node, noNode]) {
      expect(r.stderr).toMatch(/D6/);
      expect(r.stderr).toMatch(/\.synthex-plus\/config\.yaml/);
      expect(r.stderr).toMatch(/deprecat/i);
    }
  });

  it('D6: the current .synthex/config.yaml always wins over the legacy fallback', () => {
    writeProjectConfig('standing_pools:\n  enabled: false\n');
    writeLegacyConfig('standing_pools:\n  enabled: true\n');
    const { node, noNode } = runBoth(['standing_pools.enabled']);
    expect(node.stdout.trim()).toBe('false');
    expect(noNode.stdout.trim()).toBe('false');
    expect(node.stderr).toBe('');
    expect(noNode.stderr).toBe('');
  });

  it('malformed YAML (unterminated double quote) resolves to an empty value and still exits 0', () => {
    writeProjectConfig('foo: "unterminated\n');
    const { node, noNode } = runBoth(['foo', 'ignored-default']);
    expect(node.stdout.trim()).toBe('');
    expect(noNode.stdout.trim()).toBe('');
    expect(node.status).toBe(0);
    expect(noNode.status).toBe(0);
  });

  it('malformed YAML (unterminated single quote) resolves to an empty value and still exits 0', () => {
    writeProjectConfig("foo: 'unterminated\n");
    const { node, noNode } = runBoth(['foo', 'ignored-default']);
    expect(node.stdout.trim()).toBe('');
    expect(noNode.stdout.trim()).toBe('');
    expect(node.status).toBe(0);
    expect(noNode.status).toBe(0);
  });

  it('a mapping header (no inline scalar) resolves as not-found, not as a value', () => {
    writeProjectConfig('foo:\n  bar: baz\n');
    const { node, noNode } = runBoth(['foo', 'fallback']);
    expect(node.stdout.trim()).toBe('fallback');
    expect(noNode.stdout.trim()).toBe('fallback');
  });

  // --- Layered config: local > project > legacy > user > defaults ---------

  it('reads a user-level config at $XDG_CONFIG_HOME/synthex/config.yaml', () => {
    writeUserConfig('foo:\n  bar: from-user\n');
    const { node, noNode } = runBoth(['foo.bar']);
    expect(node.stdout.trim()).toBe('from-user');
    expect(noNode.stdout.trim()).toBe('from-user');
  });

  it('project config wins over user config (Claude Code precedence)', () => {
    writeUserConfig('foo:\n  bar: from-user\n');
    writeProjectConfig('foo:\n  bar: from-project\n');
    const { node, noNode } = runBoth(['foo.bar']);
    expect(node.stdout.trim()).toBe('from-project');
    expect(noNode.stdout.trim()).toBe('from-project');
  });

  it('user config wins over plugin defaults', () => {
    writeUserConfig('review_loops:\n  max_cycles: 7\n');
    const { node, noNode } = runBoth(['review_loops.max_cycles']);
    expect(node.stdout.trim()).toBe('7');
    expect(noNode.stdout.trim()).toBe('7');
  });

  it('config.local.yaml wins over the shared project config', () => {
    writeUserConfig('foo:\n  bar: from-user\n');
    writeProjectConfig('foo:\n  bar: from-project\n');
    writeLocalConfig('foo:\n  bar: from-local\n');
    const { node, noNode } = runBoth(['foo.bar']);
    expect(node.stdout.trim()).toBe('from-local');
    expect(noNode.stdout.trim()).toBe('from-local');
  });

  it('user config still loses to the D6 legacy project config', () => {
    writeUserConfig('foo:\n  bar: from-user\n');
    writeLegacyConfig('foo:\n  bar: from-legacy\n');
    const { node, noNode } = runBoth(['foo.bar']);
    expect(node.stdout.trim()).toBe('from-legacy');
    expect(noNode.stdout.trim()).toBe('from-legacy');
    expect(node.stderr).toContain('deprecated');
    expect(noNode.stderr).toContain('deprecated');
  });

  // --- Key class: user-owned ---------------------------------------------

  it('user-owned per_reviewer keys beat the project config', () => {
    writeUserConfig(
      'multi_model_review:\n  per_reviewer:\n    ollama-review-prompter:\n      model: qwen-local\n',
    );
    writeProjectConfig(
      'multi_model_review:\n  per_reviewer:\n    ollama-review-prompter:\n      model: qwen-not-installed-here\n',
    );
    const { node, noNode } = runBoth([
      'multi_model_review.per_reviewer.ollama-review-prompter.model',
    ]);
    expect(node.stdout.trim()).toBe('qwen-local');
    expect(noNode.stdout.trim()).toBe('qwen-local');
  });

  it('user-owned keys fall through to the project config when the user is silent', () => {
    writeProjectConfig(
      'multi_model_review:\n  per_reviewer:\n    ollama-review-prompter:\n      model: qwen-project\n',
    );
    const { node, noNode } = runBoth([
      'multi_model_review.per_reviewer.ollama-review-prompter.model',
    ]);
    expect(node.stdout.trim()).toBe('qwen-project');
    expect(noNode.stdout.trim()).toBe('qwen-project');
  });

  it('a sibling multi_model_review key is NOT user-owned (project still wins)', () => {
    writeUserConfig('multi_model_review:\n  strict_mode: true\n');
    writeProjectConfig('multi_model_review:\n  strict_mode: false\n');
    const { node, noNode } = runBoth(['multi_model_review.strict_mode']);
    expect(node.stdout.trim()).toBe('false');
    expect(noNode.stdout.trim()).toBe('false');
  });

  // --- Key class: restrictive-wins ---------------------------------------

  it('multi_model_review.enabled: false in user config beats true in the project', () => {
    writeUserConfig('multi_model_review:\n  enabled: false\n');
    writeProjectConfig('multi_model_review:\n  enabled: true\n');
    const { node, noNode } = runBoth(['multi_model_review.enabled']);
    expect(node.stdout.trim()).toBe('false');
    expect(noNode.stdout.trim()).toBe('false');
  });

  it('a per_command enabled is restrictive-wins too', () => {
    writeUserConfig(
      'multi_model_review:\n  per_command:\n    review_code:\n      enabled: false\n',
    );
    writeLocalConfig(
      'multi_model_review:\n  per_command:\n    review_code:\n      enabled: true\n',
    );
    const { node, noNode } = runBoth([
      'multi_model_review.per_command.review_code.enabled',
    ]);
    expect(node.stdout.trim()).toBe('false');
    expect(noNode.stdout.trim()).toBe('false');
  });

  it('restrictive-wins does not invent a false: true everywhere stays true', () => {
    writeUserConfig('multi_model_review:\n  enabled: true\n');
    writeProjectConfig('multi_model_review:\n  enabled: true\n');
    const { node, noNode } = runBoth(['multi_model_review.enabled']);
    expect(node.stdout.trim()).toBe('true');
    expect(noNode.stdout.trim()).toBe('true');
  });

  it('an unrelated *.enabled key outside multi_model_review is not restrictive', () => {
    writeUserConfig('standing_pools:\n  enabled: false\n');
    writeProjectConfig('standing_pools:\n  enabled: true\n');
    const { node, noNode } = runBoth(['standing_pools.enabled']);
    expect(node.stdout.trim()).toBe('true');
    expect(noNode.stdout.trim()).toBe('true');
  });

  it('exits 0 with usage guidance on stderr when no <dotted.key> is given', () => {
    const { node, noNode } = runBoth([]);
    expect(node.status).toBe(0);
    expect(noNode.status).toBe(0);
    expect(node.stdout.trim()).toBe('');
    expect(noNode.stdout.trim()).toBe('');
    expect(node.stderr).toMatch(/usage/i);
    expect(noNode.stderr).toMatch(/usage/i);
  });
});

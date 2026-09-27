/**
 * Layer 2: Behavioral fixtures for scripts/lib/config-get.sh — the portable
 * dotted-key reader for Synthex project config (D26, FR-HM23, FR-HM27,
 * FR-HM40).
 *
 * `config-get.sh <dotted.key> [default]` resolves a scalar by checking, in
 * order: <project>/.synthex/config.yaml -> <project>/.synthex-plus/config.yaml
 * (D6 legacy fallback, with a stderr deprecation notice) ->
 * plugins/synthex/config/defaults.yaml -> the [default] argument -> empty.
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

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'config-get-'));
  nodelessBin = null;
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
  if (nodelessBin) rmSync(nodelessBin, { recursive: true, force: true });
});

function writeProjectConfig(text: string): void {
  mkdirSync(join(projectDir, '.synthex'), { recursive: true });
  writeFileSync(join(projectDir, '.synthex', 'config.yaml'), text);
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
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
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

/**
 * Layer 1: Portable-script contract (FR-HM40, decision D19).
 *
 * Every shipped Synthex runtime script must be usable across all six target
 * harnesses without assuming a Python interpreter or an unguarded Node
 * runtime:
 *
 *   - shebang is `sh`, `bash`, or `#!/usr/bin/env node` (D19: bash is
 *     allowed; python is not, in any form)
 *   - no invocation of `python` / `python3` as a command (mentioning the
 *     word in a comment is fine — this is about what the script *runs*)
 *   - a `# Exit codes:` header comment documents the script's exit codes
 *   - any script that shells out to `node` guards it with `command -v node`
 *     first (a node-shebang script does not need to guard against itself)
 *   - any "waiter" — a script that polls in a loop via `sleep` — honors
 *     `SYNTHEX_LOOP_IDLE_MAX` so hosts with a lower shell-timeout ceiling
 *     (Codex, Grok, …) can cap the wait
 *
 * Runtime scripts are discovered by walking plugins/synthex/scripts/** and
 * plugins/synthex/hooks/** (both `.sh` and `.js`/`.mjs`/`.cjs`), minus an
 * explicit BUILD_TOOLS exclusion list (dev-only tooling: the Agent Skills
 * wrapper generator and its data-table library, never shipped as a runtime
 * hook or invoked by an agent at execution time). Because discovery walks
 * the directories rather than naming files, a new script added later is
 * picked up automatically and held to the same contract without any test
 * update.
 *
 * The second describe block ("contract detectors catch violations") proves
 * each detector actually fires on non-compliant inline fixtures, so a
 * detector that silently degraded to a no-op would fail this suite even
 * though every real shipped script currently complies.
 *
 * Spec: docs/reqs/harness-modernization.md § FR-HM40.
 * Plan: docs/plans/harness-modernization.md Task 32.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPTS_ROOT = join(REPO_ROOT, 'plugins', 'synthex', 'scripts');
const HOOKS_ROOT = join(REPO_ROOT, 'plugins', 'synthex', 'hooks');

// Build-time tooling excluded from the FR-HM40 runtime contract (Task 32):
// these run only when a developer regenerates the Agent Skills wrapper
// tree, never as a shipped runtime hook or agent-invoked script.
const BUILD_TOOLS = new Set([
  join(SCRIPTS_ROOT, 'generate-codex-skills.mjs'),
  join(SCRIPTS_ROOT, 'lib', 'host-matrix.mjs'),
]);

const SCRIPT_EXTENSIONS = new Set(['.sh', '.js', '.mjs', '.cjs']);

function discoverScripts(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (SCRIPT_EXTENSIONS.has(extname(entry.name))) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

const runtimeScripts = [...discoverScripts(SCRIPTS_ROOT), ...discoverScripts(HOOKS_ROOT)]
  .filter((absPath) => !BUILD_TOOLS.has(absPath))
  .map((absPath) => ({ absPath, relPath: relative(REPO_ROOT, absPath) }))
  .sort((a, b) => a.relPath.localeCompare(b.relPath));

// --- Detectors -------------------------------------------------------------

const SHEBANG_ALLOWLIST = [
  '#!/bin/sh',
  '#!/bin/bash',
  '#!/usr/bin/env sh',
  '#!/usr/bin/env bash',
  '#!/usr/bin/env node',
];

function getShebang(content: string): string {
  return (content.split('\n', 1)[0] ?? '').trim();
}

/** Drops full-line comments so "python"/"node" mentioned only in prose does not trip a detector. */
function stripCommentLines(content: string): string {
  return content
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

const PYTHON_INVOCATION_RE = /(^|[\s;&|`(])python3?\b/m;

function invokesPython(content: string): boolean {
  return PYTHON_INVOCATION_RE.test(stripCommentLines(content));
}

const NODE_INVOCATION_RE = /(^|[\s;&|`(])node\b(?!_|\.)/m;

function invokesNode(content: string): boolean {
  return NODE_INVOCATION_RE.test(stripCommentLines(content));
}

function hasNodeGuard(content: string): boolean {
  return /command\s+-v\s+node\b/.test(content);
}

/**
 * Detects the documented exit-code convention: a `# Exit codes:` header line
 * followed (possibly after other comment lines) by at least one entry line
 * of the form `#   <code> - <description>` or `#   <code>: <description>`.
 */
function hasExitCodeHeader(content: string): boolean {
  const lines = content.split('\n');
  const headerIdx = lines.findIndex((l) => /^#\s*Exit codes:\s*$/i.test(l.trim()));
  if (headerIdx === -1) return false;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^#\s*\d+\s*[-:]\s*\S/.test(trimmed)) return true;
    if (!trimmed.startsWith('#')) break;
  }
  return false;
}

/**
 * A "waiter" is a script that polls via `sleep` inside a `while`/`until`
 * loop. Comment lines are ignored so prose mentioning "sleep" does not
 * trigger a false positive.
 */
function isWaiter(content: string): boolean {
  const lines = content.split('\n').map((l) => l.trim());
  let loopDepth = 0;
  for (const line of lines) {
    if (line === '' || line.startsWith('#')) continue;
    if (/^(while|until)\b/.test(line)) loopDepth++;
    if (loopDepth > 0 && /\bsleep\b/.test(line)) return true;
    if (/^done\b/.test(line)) loopDepth = Math.max(0, loopDepth - 1);
  }
  return false;
}

// --- Contract: every discovered runtime script ------------------------------

describe('portable-script contract (FR-HM40)', () => {
  it('discovers the known runtime scripts', () => {
    const relPaths = runtimeScripts.map((s) => s.relPath);
    expect(relPaths).toEqual(
      expect.arrayContaining([
        'plugins/synthex/scripts/loop-advance-gate.sh',
        'plugins/synthex/scripts/loop-idle-wait.sh',
        'plugins/synthex/scripts/upgrade-nudge.sh',
      ]),
    );
  });

  it('BUILD_TOOLS exclusion list entries exist on disk (guards a stale exclusion list)', () => {
    for (const absPath of BUILD_TOOLS) {
      expect(existsSync(absPath)).toBe(true);
    }
  });

  describe.each(runtimeScripts)('$relPath', ({ absPath }) => {
    const content = readFileSync(absPath, 'utf8');

    it('has an allowed shebang (sh, bash, or node)', () => {
      expect(SHEBANG_ALLOWLIST).toContain(getShebang(content));
    });

    it('does not invoke python/python3 as a command', () => {
      expect(invokesPython(content)).toBe(false);
    });

    it('documents exit codes in a header comment', () => {
      expect(hasExitCodeHeader(content)).toBe(true);
    });

    it('guards any node invocation with `command -v node`', () => {
      if (getShebang(content) === '#!/usr/bin/env node') return; // node script; nothing to shell out to
      if (invokesNode(content)) {
        expect(hasNodeGuard(content)).toBe(true);
      }
    });

    it('honors SYNTHEX_LOOP_IDLE_MAX if it is a waiter', () => {
      if (isWaiter(content)) {
        expect(content.includes('SYNTHEX_LOOP_IDLE_MAX')).toBe(true);
      }
    });
  });
});

// --- Proof the detectors actually catch violations --------------------------

describe('contract detectors catch violations (fixtures)', () => {
  it('flags a shebang outside the allowlist', () => {
    const fixture = '#!/usr/bin/env python3\necho hi\n';
    expect(SHEBANG_ALLOWLIST).not.toContain(getShebang(fixture));
  });

  it('flags a python invocation that is not in a comment', () => {
    const fixture = [
      '#!/bin/bash',
      '# this header does not mention the word at all',
      'set -u',
      'python3 helper.py',
    ].join('\n');
    expect(invokesPython(fixture)).toBe(true);
  });

  it('does not flag "python" mentioned only in a comment', () => {
    const fixture = ['#!/bin/bash', '# no python here, bash only', 'echo hi'].join('\n');
    expect(invokesPython(fixture)).toBe(false);
  });

  it('flags a script missing the Exit codes header', () => {
    const fixture = '#!/bin/bash\n# just a script, no contract header\necho hi\nexit 0\n';
    expect(hasExitCodeHeader(fixture)).toBe(false);
  });

  it('accepts a well-formed Exit codes header', () => {
    const fixture = ['#!/bin/bash', '# Exit codes:', '#   0 - success', '#   1 - failure', 'echo hi'].join(
      '\n',
    );
    expect(hasExitCodeHeader(fixture)).toBe(true);
  });

  it('flags a node invocation lacking a `command -v node` guard', () => {
    const fixture = ['#!/bin/bash', '# Exit codes:', '#   0 - always', 'node ./tool.js'].join('\n');
    expect(invokesNode(fixture)).toBe(true);
    expect(hasNodeGuard(fixture)).toBe(false);
  });

  it('accepts a node invocation guarded by `command -v node`', () => {
    const fixture = ['#!/bin/bash', 'command -v node >/dev/null 2>&1 || exit 0', 'node ./tool.js'].join(
      '\n',
    );
    expect(invokesNode(fixture)).toBe(true);
    expect(hasNodeGuard(fixture)).toBe(true);
  });

  it('flags a waiter (sleep in a polling loop) that does not honor SYNTHEX_LOOP_IDLE_MAX', () => {
    const fixture = ['#!/bin/sh', 'while true; do', '  sleep 5', 'done'].join('\n');
    expect(isWaiter(fixture)).toBe(true);
    expect(fixture.includes('SYNTHEX_LOOP_IDLE_MAX')).toBe(false);
  });

  it('does not flag a one-shot sleep outside a loop as a waiter', () => {
    const fixture = '#!/bin/sh\nsleep 1\necho done\n';
    expect(isWaiter(fixture)).toBe(false);
  });

  it('accepts a waiter that honors SYNTHEX_LOOP_IDLE_MAX', () => {
    const fixture = [
      '#!/bin/sh',
      'MAX="${SYNTHEX_LOOP_IDLE_MAX:-540}"',
      'while [ "$n" -lt "$MAX" ]; do',
      '  sleep 5',
      'done',
    ].join('\n');
    expect(isWaiter(fixture)).toBe(true);
    expect(fixture.includes('SYNTHEX_LOOP_IDLE_MAX')).toBe(true);
  });
});

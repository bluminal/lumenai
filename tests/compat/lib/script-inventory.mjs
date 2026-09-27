// tests/compat/lib/script-inventory.mjs
//
// Single source of truth for "which files are Synthex runtime scripts"
// (FR-HM40, decision D19, Task 32). Three consumers share this module so
// they cannot drift apart:
//
//   - tests/schemas/portable-scripts.test.ts — the shebang / exit-code /
//     node-guard contract (Task 32).
//   - tests/compat/lib/script-smoke.mjs — the Task 37 in-container smoke
//     suite (happy path + missing-jq/missing-node fallback per script).
//   - tests/schemas/script-smoke-registry.test.ts — fails Layer 1 if a
//     discovered runtime script has no smoke case registered.
//
// Discovery walks <pluginRoot>/scripts/** and <pluginRoot>/hooks/** for
// .sh/.js/.mjs/.cjs files, PLUS extensionless files that start with an
// allowed shebang (FR-HM28: `scripts/validate-findings` ships without an
// extension, CLI-binary style — it is still a runtime script and must be
// held to the same portable-script contract), minus BUILD_TOOLS (dev-only
// tooling that is never shipped as a runtime hook or invoked by an agent
// at execution time: the Agent Skills wrapper generator and its
// data-table library).
//
// `pluginRoot` is caller-supplied and BUILD_TOOLS is kept root-relative
// (not baked to an absolute repo path) so the exact same walk works
// against the repo's plugins/synthex directory AND against whichever
// directory a compat container installed the plugin fixture into (e.g.
// /workspace/marketplace/plugins/synthex, /workspace/staged-synthex,
// /workspace/.agents — see each tests/compat/scenarios/*-offline.mjs).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const SCRIPT_EXTENSIONS = new Set(['.sh', '.js', '.mjs', '.cjs']);

/** Matches the same shebangs portable-scripts.test.ts's SHEBANG_ALLOWLIST accepts. */
const SHEBANG_RE = /^#!(\/bin\/(sh|bash)|\/usr\/bin\/env (sh|bash|node))(\s|$)/;

/** Relative to <pluginRoot>. */
export const BUILD_TOOLS = Object.freeze([
  join('scripts', 'generate-codex-skills.mjs'),
  join('scripts', 'lib', 'host-matrix.mjs'),
]);

function hasAllowedShebang(absPath) {
  let firstLine;
  try {
    // First line only; a script's shebang is always well within 512 bytes.
    const buf = readFileSync(absPath, { encoding: 'utf8', flag: 'r' }).slice(0, 512);
    firstLine = buf.split('\n', 1)[0];
  } catch {
    return false;
  }
  return SHEBANG_RE.test(firstLine);
}

function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (SCRIPT_EXTENSIONS.has(extname(entry.name))) {
      out.push(full);
    } else if (extname(entry.name) === '' && hasAllowedShebang(full)) {
      out.push(full);
    }
  }
}

/**
 * @param {string} pluginRoot absolute path to the directory containing
 *   `scripts/` (and, if present, `hooks/`) — i.e. the Synthex plugin root.
 * @returns {{ absPath: string, relPath: string }[]} sorted by relPath
 *   (relative to pluginRoot, e.g. "scripts/loop-step.sh"), with BUILD_TOOLS
 *   excluded.
 */
export function discoverRuntimeScripts(pluginRoot) {
  const scriptsRoot = join(pluginRoot, 'scripts');
  const hooksRoot = join(pluginRoot, 'hooks');
  const buildToolsAbs = new Set(BUILD_TOOLS.map((rel) => join(pluginRoot, rel)));

  const found = [];
  walk(scriptsRoot, found);
  walk(hooksRoot, found);

  return found
    .filter((absPath) => !buildToolsAbs.has(absPath))
    .map((absPath) => ({ absPath, relPath: relative(pluginRoot, absPath) }))
    .sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/**
 * Layer 1: Task 55 (FR-HM2, FR-HM24) — synthex-plus removal + team-*
 * retirement.
 *
 * synthex-plus shipped a tombstone release in Task 54 (empty hooks.json,
 * no agents, migration-stub commands). Task 55 is PR 2 (D20): it removes
 * the plugin tree entirely, drops its marketplace entry, and retires the
 * 5 team-* commands (team-review, team-implement, team-plan, team-refine,
 * team-init) outright — their behavior is the capability ladder inside the
 * existing synthex commands (FR-HM24), not a synthex port.
 *
 * This suite validates the Task 55 acceptance criteria:
 *   [T] A grep finds no stale reference to the removed plugin's path
 *       anywhere under tests/, .github/, .claude-plugin/, or
 *       plugins/synthex/.
 *   [T] The synthex-plus plugin directory does not exist on disk.
 *   [T] .claude-plugin/marketplace.json lists exactly one plugin (synthex).
 *
 * Spec: docs/reqs/harness-modernization.md § FR-HM2, § FR-HM24.
 * Plan: docs/plans/harness-modernization.md Task 55.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');

// The needle is built by concatenation rather than as one literal so this
// file does not trip its own scan — the whole point of this suite is to
// search for the string, not merely to avoid mentioning it.
const RETIRED_PLUGIN_PATH = 'plugins' + '/' + 'synthex-plus';

const SCAN_ROOTS = ['tests', '.github', '.claude-plugin', 'plugins/synthex'];

const SKIP_DIR_NAMES = new Set(['node_modules', '.git', '.cache']);

function walkAllFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      walkAllFiles(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function readTextOrNull(absPath: string): string | null {
  try {
    // Skip anything implausibly large (binaries, lockfiles) — a stale doc
    // reference will always be small prose/code.
    if (statSync(absPath).size > 5_000_000) return null;
    return readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

describe('Task 55: synthex-plus plugin tree is fully removed (FR-HM2)', () => {
  it('the synthex-plus plugin directory does not exist on disk', () => {
    expect(existsSync(join(ROOT, 'plugins', 'synthex-plus'))).toBe(false);
  });

  it.each(SCAN_ROOTS)(
    'grep finds no stale removed-plugin path reference under %s/',
    (scanRoot) => {
      const absRoot = join(ROOT, scanRoot);
      if (!existsSync(absRoot)) {
        // .github/.claude-plugin are always present; guard anyway so a
        // future rename fails loudly instead of silently no-op-ing.
        throw new Error(`Scan root missing: ${scanRoot}`);
      }
      const files = walkAllFiles(absRoot);
      const hits: string[] = [];
      for (const absPath of files) {
        const text = readTextOrNull(absPath);
        if (!text) continue;
        text.split('\n').forEach((line, idx) => {
          if (line.includes(RETIRED_PLUGIN_PATH)) {
            hits.push(`${relative(ROOT, absPath)}:${idx + 1}: ${line.trim()}`);
          }
        });
      }
      expect(
        hits,
        `found stale references to the removed plugin's path:\n${hits.join('\n')}`,
      ).toEqual([]);
    },
  );

  it('.claude-plugin/marketplace.json lists exactly one plugin (synthex)', () => {
    const marketplace = JSON.parse(
      readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'),
    );
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].name).toBe('synthex');
  });

  it('.grok-plugin/marketplace.json lists exactly one plugin (synthex)', () => {
    const marketplace = JSON.parse(
      readFileSync(join(ROOT, '.grok-plugin', 'marketplace.json'), 'utf8'),
    );
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].name).toBe('synthex');
  });

  it('.agents/plugins/marketplace.json lists exactly one plugin (synthex), if present', () => {
    const path = join(ROOT, '.agents', 'plugins', 'marketplace.json');
    if (!existsSync(path)) return;
    const marketplace = JSON.parse(readFileSync(path, 'utf8'));
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].name).toBe('synthex');
  });
});

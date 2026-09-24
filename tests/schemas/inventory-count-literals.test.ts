import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// D2 (docs/plans/harness-modernization.md): every assertion on Synthex's
// command/agent/wrapper counts must import COMMAND_COUNT / AGENT_COUNT /
// WRAPPER_COUNT from tests/compat/lib/inventory.mjs instead of hardcoding a
// number, because the counts change across 6 phases of the plan. This test
// is a regression guard: it scans for `toHaveLength(<n>)` / `toBe(<n>)`
// assertions sitting on the same line as one of the inventory nouns and
// fails if a bare numeric literal has crept back in.

const repoRoot = resolve(import.meta.dirname, '../..');

// Where inventory-style count assertions could plausibly live.
const SCAN_ROOTS = ['tests/schemas', 'tests/compat/scenarios'];

// A count assertion on a single line, e.g. `.toHaveLength(18)` or
// `.toBe(46)`. Scoped to a single line on purpose: it must not match
// unrelated numeric literals such as line numbers embedded in error
// messages, or values inside multi-line fixture payloads, and it must not
// match prose in an `it(...)` description a few lines above an unrelated
// assertion (e.g. "exactly 3 external entries are present").
const COUNT_ASSERTION_RE = /\.(toHaveLength|toBe)\(\s*[0-9]+\s*\)/;

// One of Synthex's inventory nouns, appearing anywhere on the same line as
// the count assertion.
const INVENTORY_NOUN_RE = /\b(commands?|agents?|entr(y|ies)|probes?)\b/i;

// Explicit, reviewed exceptions: hardcoded counts that describe something
// other than the global Synthex command/agent/wrapper inventory tracked by
// tests/compat/lib/inventory.mjs, so a bare numeric literal is correct
// there. Keyed by `<repo-relative path>:<1-based line number>`.
const ALLOWLIST = new Set([
  // The 3 pool-management slash commands surfaced by one team-init wizard
  // step (start-review-team / stop-review-team / list-teams) -- a
  // fixture-local list, not the plugin manifest's command inventory.
  'tests/schemas/team-init-fixtures.test.ts:168',
]);

function collectSourceFiles(root: string): string[] {
  const absoluteRoot = resolve(repoRoot, root);
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(ts|mjs)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  };

  walk(absoluteRoot);
  return files;
}

describe('inventory count literals', () => {
  it('finds no hardcoded commands/agents/entries/probes count assertion outside the allowlist', () => {
    const offenders: string[] = [];

    for (const root of SCAN_ROOTS) {
      for (const file of collectSourceFiles(root)) {
        const relativePath = relative(repoRoot, file);
        const lines = readFileSync(file, 'utf8').split('\n');

        lines.forEach((line, index) => {
          if (!COUNT_ASSERTION_RE.test(line) || !INVENTORY_NOUN_RE.test(line)) {
            return;
          }

          const key = `${relativePath}:${index + 1}`;
          if (ALLOWLIST.has(key)) {
            return;
          }

          offenders.push(`${key}: ${line.trim()}`);
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * Task 2: no-usage-billing.test.ts (FR-HM1).
 *
 * "No usage-billed features" (FR-HM1) forbids any command, agent, hook, or
 * doc from invoking a feature that bills against usage credits or a
 * separate SKU: `/code-review ultra` / `ultrareview`, the GitHub Code
 * Review managed service, or Managed Agents (PRD §4.1, D-commitment #1).
 * This test greps the executable prose under plugins/synthex/ — commands,
 * agents, docs, and hooks markdown — for those specific phrases, and
 * asserts the README states the no-usage-billing commitment in its cost
 * section (Task 2c).
 *
 * Pattern design note: a bare match on the word "ultra" would false-positive
 * on innocent uses (e.g. "ultra-fast", "ultrasonic", a future feature named
 * "UltraCompact"), so this test never matches the bare word. It matches
 * only the three specific phrases FR-HM1 names:
 *
 *   - "ultrareview"           — the one-word command alias
 *   - "code-review ultra"     — the flag form, with or without a leading
 *                               slash ("/code-review ultra")
 *   - "managed agents"        — the GitHub/Anthropic-hosted feature name
 *                               (matched as the two-word phrase, not the
 *                               bare word "managed", so prose like
 *                               "self-managed agent pool" never matches)
 *
 * All three are matched case-insensitively since prose may capitalize them
 * differently ("Managed Agents" vs "managed agents" mid-sentence).
 */

import { describe, expect, it } from 'vitest';
import { extname, join, relative } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = join(__dirname, '..', '..');
const README_PATH = join(ROOT, 'plugins/synthex/README.md');

// "Executable prose" per Task 2: commands, agents, docs, and hooks markdown.
// Generated skill wrappers (plugins/synthex/skills/) are out of scope here —
// they only point back at these canonical files.
const SCAN_DIRS = [
  'plugins/synthex/commands',
  'plugins/synthex/agents',
  'plugins/synthex/docs',
  'plugins/synthex/hooks',
];

interface ForbiddenPattern {
  name: string;
  regex: RegExp;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  { name: 'ultrareview', regex: /\bultrareview\b/i },
  { name: 'code-review ultra', regex: /\/?code-review[\s-]+ultra\b/i },
  { name: 'Managed Agents', regex: /\bmanaged agents\b/i },
];

function walkMarkdownFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(p, out);
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      out.push(p);
    }
  }
  return out;
}

describe('Task 2: no-usage-billing.test.ts (FR-HM1)', () => {
  const files = SCAN_DIRS.flatMap((dir) =>
    walkMarkdownFiles(join(ROOT, dir)).map((abs) => relative(ROOT, abs)),
  );

  it('scans a non-trivial number of commands/agents/docs/hooks markdown files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('no executable prose mentions ultrareview, /code-review ultra, code-review ultra, or Managed Agents', () => {
    const violations: string[] = [];

    for (const relFile of files) {
      const text = readFileSync(join(ROOT, relFile), 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.regex.test(lines[i])) {
            violations.push(`${relFile}:${i + 1} — matched "${pattern.name}"`);
          }
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Usage-billed feature reference(s) found (FR-HM1 forbids these):\n` +
          violations.map((v) => `  ${v}`).join('\n'),
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('the bare word "ultra" alone is never treated as a violation (pattern precision)', () => {
    const innocentText = 'This is an ultra-fast, ultrasonic UltraCompact feature.\n';
    const matches = FORBIDDEN_PATTERNS.filter((pattern) => pattern.regex.test(innocentText));
    expect(matches).toHaveLength(0);
  });

  it('"ultrareview" is matched', () => {
    expect(FORBIDDEN_PATTERNS[0].regex.test('Run ultrareview for the deepest pass.')).toBe(true);
  });

  it('"/code-review ultra" and "code-review ultra" are both matched', () => {
    const codeReviewUltra = FORBIDDEN_PATTERNS.find((p) => p.name === 'code-review ultra')!;
    expect(codeReviewUltra.regex.test('Use /code-review ultra for a deep pass.')).toBe(true);
    expect(codeReviewUltra.regex.test('The code-review ultra tier is billed separately.')).toBe(
      true,
    );
  });

  it('"Managed Agents" is matched but "self-managed agent pool" is not', () => {
    const managedAgents = FORBIDDEN_PATTERNS.find((p) => p.name === 'Managed Agents')!;
    expect(managedAgents.regex.test('Do not invoke Managed Agents.')).toBe(true);
    expect(managedAgents.regex.test('Uses a self-managed agent pool instead.')).toBe(false);
  });

  describe('README cost section (Task 2c)', () => {
    const readme = readFileSync(README_PATH, 'utf8');

    it('README.md exists and is non-empty', () => {
      expect(readme.length).toBeGreaterThan(0);
    });

    it('states Synthex never invokes usage-billed features', () => {
      expect(readme).toMatch(/never invoke[s]? .*usage-billed/i);
    });

    it('names /code-review ultra, the GitHub Code Review managed service, and Managed Agents as examples', () => {
      expect(readme).toMatch(/\/code-review ultra/);
      expect(readme).toMatch(/GitHub Code Review managed service/i);
      expect(readme).toMatch(/Managed Agents/);
    });

    it('states Synthex runs only on plan-included or API-key token spend the user already pays for', () => {
      expect(readme).toMatch(
        /plan-included or API-key token spend( that)? (the user|you) already pay[s]? for/i,
      );
    });

    it('the sentence names the two examples the README task requires (code-review ultra, Managed Agents)', () => {
      // Sanity: the sentence legitimately NAMES these forbidden features as
      // examples of what Synthex avoids ("ultrareview" is not required in
      // the README — only in the Task 2 prose scan — so it is not asserted
      // here). This proves the README documents the commitment with real
      // examples rather than a vague, unverifiable claim.
      const requiredInReadme = FORBIDDEN_PATTERNS.filter((p) => p.name !== 'ultrareview');
      for (const pattern of requiredInReadme) {
        expect(pattern.regex.test(readme)).toBe(true);
      }
    });
  });
});

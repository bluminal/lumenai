/**
 * Task 12: cold-path-includes.test.ts (FR-HM43, D17, FR-HM13).
 *
 * D17 requires every cold-path include (a prose instruction that Reads a
 * plugin-shipped doc, e.g. the FR-HM5 pattern moving config-gated blocks
 * out of commands into `plugins/synthex/docs/<topic>.md`) to use the form
 * `${CLAUDE_PLUGIN_ROOT}/docs/<x>.md`, immediately followed — within the
 * same paragraph — by the FR-HM13 "other hosts" fallback sentence (the
 * variable is documented for hooks only, so command prose needs a
 * host-agnostic resolution path too; see the "Task 12 — D17 expansion"
 * spike below).
 *
 * A *reference* to a doc path is only a "Read gate" (an executable
 * instruction the agent must act on) when the word "Read" is immediately
 * followed by a backticked path ending in `.md`. A markdown link —
 * `[label](../docs/x.md)` — is a documentation cross-reference, not an
 * instruction, and is exempt: the `](` immediately preceding the path is
 * never itself preceded by "Read". This distinction matters today because
 * every one of the 32 existing `docs/native-looping.md` mentions in
 * `commands/` (see the evidence test below) is a markdown link, not a
 * Read gate — this suite shipped the rule ahead of Task 13 per the Task 12
 * brief. Task 13 (FR-HM5) introduces the first three real gates, splitting
 * `review-code.md`'s Standing Pool Discovery (1b), Sandbox-Yolo Spawn
 * Confirmation (1c), and FR-MR21 Steps 4-8 + Complexity Gate out to
 * `docs/standing-pool-routing.md`, `docs/sandbox-yolo.md`, and
 * `docs/multi-model-decision.md`. No KNOWN_* allowlist is seeded: there is
 * no real, today-existing D17 violation to grandfather.
 *
 * Rules enforced against every detected Read gate:
 *   1. The target must be written as `${CLAUDE_PLUGIN_ROOT}/docs/<x>.md`
 *      (a bare `docs/<x>.md` or a relative `../docs/<x>.md` target fails).
 *   2. The same paragraph must also contain the FR-HM13 other-hosts
 *      sentence (matched loosely: the paragraph mentions "other hosts"
 *      and "plugin root", e.g. "On other hosts, resolve the installed
 *      plugin root ...").
 *   3. The target file must exist under `plugins/synthex/docs/`.
 *   4. The target must not resolve under `commands/`, and must not be one
 *      of the paths registered in `plugin.json`'s `commands`/`agents`
 *      arrays (an include is never a registered entrypoint).
 */

import { describe, expect, it } from 'vitest';
import { extname, join, posix, relative } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(ROOT, 'plugins', 'synthex');
const SCAN_DIRS = ['plugins/synthex/commands', 'plugins/synthex/agents'];

// ── Paragraph extraction (fence- and heading-aware, mirrors
//    tool-presence-gates.test.ts's D3 scanner) ───────────────────────────

interface Paragraph {
  text: string;
  startLine: number;
  isHeading: boolean;
}

function matchFenceOpen(line: string): { char: string; len: number } | null {
  const m = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!m) return null;
  return { char: m[1][0], len: m[1].length };
}

function matchFenceClose(line: string, fenceChar: string, fenceLen: number): boolean {
  const re = fenceChar === '`' ? /^ {0,3}(`{3,})\s*$/ : /^ {0,3}(~{3,})\s*$/;
  const m = line.match(re);
  return m !== null && m[1].length >= fenceLen;
}

export function extractParagraphs(text: string): Paragraph[] {
  const lines = text.split('\n');
  const paragraphs: Paragraph[] = [];
  let current: string[] = [];
  let currentStart = -1;
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  const flush = () => {
    if (current.length > 0) {
      paragraphs.push({ text: current.join('\n'), startLine: currentStart + 1, isHeading: false });
      current = [];
      currentStart = -1;
    }
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];

    if (inFence) {
      if (matchFenceClose(line, fenceChar, fenceLen)) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }
      continue;
    }

    const open = matchFenceOpen(line);
    if (open) {
      flush();
      inFence = true;
      fenceChar = open.char;
      fenceLen = open.len;
      continue;
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      flush();
      paragraphs.push({ text: line, startLine: idx + 1, isHeading: true });
      continue;
    }

    if (currentStart === -1) currentStart = idx;
    current.push(line);
  }
  flush();

  return paragraphs;
}

// ── Read-gate detection ─────────────────────────────────────────────────
//
// "Read" (or "Read the") immediately followed by a backticked path ending
// in `.md` that contains `docs/`. Requiring immediate adjacency (no `.*`
// gap in the regex) is what keeps a markdown link elsewhere in the same
// paragraph — e.g. "... see [x](../docs/native-looping.md) ..." — from
// being mistaken for a Read instruction: the link's path is never the
// backticked token directly after the word "Read".

const READ_GATE_RE = /\bRead\s+(?:the\s+)?`([^`]+\.md)`/g;

export interface ColdPathInclude {
  rawTarget: string;
  startLine: number;
  paragraphText: string;
}

export function findColdPathIncludes(text: string): ColdPathInclude[] {
  const includes: ColdPathInclude[] = [];

  for (const para of extractParagraphs(text)) {
    if (para.isHeading) continue;

    READ_GATE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = READ_GATE_RE.exec(para.text)) !== null) {
      const target = match[1];
      if (!target.includes('docs/')) continue; // not a plugin-doc include
      includes.push({ rawTarget: target, startLine: para.startLine, paragraphText: para.text });
    }
  }

  return includes;
}

// ── Validation ───────────────────────────────────────────────────────────

const D17_PREFIX = '${CLAUDE_PLUGIN_ROOT}/docs/';
const OTHER_HOSTS_RE = /other hosts/i;
const PLUGIN_ROOT_PHRASE_RE = /plugin root/i;

export type ViolationKind =
  | 'bad-form'
  | 'missing-other-hosts-line'
  | 'outside-docs'
  | 'target-under-commands'
  | 'target-in-manifest'
  | 'missing-target-file';

export interface Violation {
  kind: ViolationKind;
  detail: string;
}

interface ManifestEntry {
  normalizedPath: string; // e.g. "commands/next-priority.md", no leading "./"
}

export function loadManifestEntries(pluginRoot: string): ManifestEntry[] {
  const manifest = JSON.parse(
    readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
  );
  const entries: ManifestEntry[] = [];
  for (const kind of ['commands', 'agents']) {
    for (const raw of manifest[kind] ?? []) {
      entries.push({ normalizedPath: posix.normalize(raw.replace(/^\.\//, '')) });
    }
  }
  return entries;
}

export function validateInclude(
  include: ColdPathInclude,
  pluginRoot: string,
  manifestEntries: ManifestEntry[],
): Violation[] {
  const violations: Violation[] = [];
  const { rawTarget, paragraphText } = include;

  const wellFormed = rawTarget.startsWith(D17_PREFIX);
  if (!wellFormed) {
    violations.push({
      kind: 'bad-form',
      detail: `target "${rawTarget}" must use the form "${D17_PREFIX}<x>.md" (D17)`,
    });
  }

  if (!(OTHER_HOSTS_RE.test(paragraphText) && PLUGIN_ROOT_PHRASE_RE.test(paragraphText))) {
    violations.push({
      kind: 'missing-other-hosts-line',
      detail:
        'paragraph does not contain the FR-HM13 other-hosts fallback sentence ' +
        '(expected phrases "other hosts" and "plugin root" in the same paragraph)',
    });
  }

  // Resolve the doc-relative path regardless of whether the prefix was
  // well-formed, so a bad-form target still gets an existence/escape
  // check (both rules are independent per the Task 12 brief).
  const docsIndex = rawTarget.indexOf('docs/');
  const suffixFromDocs = docsIndex === -1 ? rawTarget : rawTarget.slice(docsIndex);
  const normalized = posix.normalize(suffixFromDocs);

  if (normalized.startsWith('commands/')) {
    violations.push({
      kind: 'target-under-commands',
      detail: `target resolves to "${normalized}", which lives under commands/ (would register as a slash command)`,
    });
  } else if (!normalized.startsWith('docs/')) {
    violations.push({
      kind: 'outside-docs',
      detail: `target resolves to "${normalized}", which is outside plugins/synthex/docs/`,
    });
  } else if (!existsSync(join(pluginRoot, normalized))) {
    violations.push({
      kind: 'missing-target-file',
      detail: `target file "${normalized}" does not exist under plugins/synthex/docs/`,
    });
  }

  if (manifestEntries.some((entry) => entry.normalizedPath === normalized)) {
    violations.push({
      kind: 'target-in-manifest',
      detail: `target "${normalized}" is a registered command/agent entrypoint in plugin.json`,
    });
  }

  return violations;
}

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

// ── Acceptance criteria: the real codebase ───────────────────────────────

describe('Task 12: cold-path-includes.test.ts (FR-HM43, D17, FR-HM13)', () => {
  const files = SCAN_DIRS.flatMap((dir) =>
    walkMarkdownFiles(join(ROOT, dir)).map((abs) => relative(ROOT, abs)),
  );
  const manifestEntries = loadManifestEntries(PLUGIN_ROOT);

  it('scans commands/ and agents/ markdown files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  const allIncludes = files.flatMap((relFile) => {
    const text = readFileSync(join(ROOT, relFile), 'utf8');
    return findColdPathIncludes(text).map((inc) => ({ file: relFile, ...inc }));
  });

  it(
    'evidence: today\'s 32+ docs/native-looping.md mentions in commands/ are markdown ' +
      'links, not Read gates; Task 13 adds the first 3 real gates in review-code.md',
    () => {
      const nativeLoopingMentions = files.reduce((count, relFile) => {
        const text = readFileSync(join(ROOT, relFile), 'utf8');
        return count + (text.match(/docs\/native-looping\.md/g) ?? []).length;
      }, 0);
      expect(nativeLoopingMentions).toBeGreaterThanOrEqual(32);
      expect(allIncludes).toHaveLength(3);
      expect(new Set(allIncludes.map((i) => i.file))).toEqual(
        new Set(['plugins/synthex/commands/review-code.md']),
      );
      expect(new Set(allIncludes.map((i) => i.rawTarget))).toEqual(
        new Set([
          '${CLAUDE_PLUGIN_ROOT}/docs/standing-pool-routing.md',
          '${CLAUDE_PLUGIN_ROOT}/docs/sandbox-yolo.md',
          '${CLAUDE_PLUGIN_ROOT}/docs/multi-model-decision.md',
        ]),
      );
    },
  );

  it('every detected Read gate satisfies D17 form, other-hosts pairing, and target rules', () => {
    const failures = allIncludes.flatMap(({ file, ...include }) =>
      validateInclude(include, PLUGIN_ROOT, manifestEntries).map((v) => ({ file, startLine: include.startLine, ...v })),
    );

    if (failures.length > 0) {
      const detail = failures
        .map((f) => `  ${f.file}:${f.startLine} [${f.kind}] ${f.detail}`)
        .join('\n');
      throw new Error(`Cold-path include violation(s):\n${detail}`);
    }

    expect(failures).toHaveLength(0);
  });
});

// ── Fixture self-tests ────────────────────────────────────────────────────
//
// Exercise the scanner/validator directly against synthetic prose so the
// rule's behavior is pinned independently of whatever the live commands/
// and agents/ trees currently contain. `native-looping.md` is used as the
// real, existing target file so the "target exists" branch is exercised
// against the actual filesystem rather than mocked.

describe('cold-path-includes fixtures', () => {
  const manifestEntries = loadManifestEntries(PLUGIN_ROOT);
  const validate = (text: string) =>
    findColdPathIncludes(text).flatMap((include) => validateInclude(include, PLUGIN_ROOT, manifestEntries));

  it('accepts a well-formed D17 gate paired with the other-hosts line', () => {
    const fixture =
      'If `standing_pools.enabled` is true, Read `${CLAUDE_PLUGIN_ROOT}/docs/native-looping.md` ' +
      'and follow it; otherwise continue to Step 4. On other hosts, resolve the installed plugin ' +
      'root from `.synthex/state.json`\'s `plugin_root` field and read the same file relative to it.';

    const includes = findColdPathIncludes(fixture);
    expect(includes).toHaveLength(1);
    expect(validate(fixture)).toHaveLength(0);
  });

  it('rejects a bare docs/<x>.md target (would shadow the project\'s own docs/)', () => {
    const fixture =
      'Read `docs/native-looping.md` and follow it; otherwise continue to Step 4. On other hosts, ' +
      'resolve the installed plugin root and Read the same relative file.';

    const violations = validate(fixture);
    expect(violations.map((v) => v.kind)).toContain('bad-form');
  });

  it('rejects a relative ../docs/<x>.md target', () => {
    const fixture =
      'Read `../docs/native-looping.md` and follow it; otherwise continue to Step 4. On other hosts, ' +
      'resolve the installed plugin root and Read the same relative file.';

    const violations = validate(fixture);
    expect(violations.map((v) => v.kind)).toContain('bad-form');
  });

  it('is exempt for a markdown link (documentation pointer, not an instruction)', () => {
    const fixture =
      'The mechanical iteration framework is documented once in ' +
      '[`plugins/synthex/docs/native-looping.md`](../docs/native-looping.md). ' +
      'This command cross-references that document rather than duplicating the mechanics.';

    expect(findColdPathIncludes(fixture)).toHaveLength(0);
  });

  it('is exempt for a markdown link even when "Read" appears earlier in the same paragraph', () => {
    const fixture =
      'Read `$CLAUDE_CODE_SESSION_ID` via Bash and use it as `session_id` — see ' +
      '[native-looping.md § Obtaining the session id](../docs/native-looping.md#obtaining-the-session-id).';

    expect(findColdPathIncludes(fixture)).toHaveLength(0);
  });

  it('rejects a well-formed target missing the FR-HM13 other-hosts line', () => {
    const fixture =
      'If `standing_pools.enabled` is true, Read `${CLAUDE_PLUGIN_ROOT}/docs/native-looping.md` ' +
      'and follow it; otherwise continue to Step 4.';

    const violations = validate(fixture);
    expect(violations.map((v) => v.kind)).toContain('missing-other-hosts-line');
  });

  it('rejects a well-formed target whose file does not exist under plugins/synthex/docs/', () => {
    const fixture =
      'Read `${CLAUDE_PLUGIN_ROOT}/docs/does-not-exist.md` and follow it; otherwise continue. ' +
      'On other hosts, resolve the installed plugin root and Read the same relative file.';

    const violations = validate(fixture);
    expect(violations.map((v) => v.kind)).toContain('missing-target-file');
  });

  it('rejects a target that traverses out of docs/ into commands/', () => {
    const fixture =
      'Read `${CLAUDE_PLUGIN_ROOT}/docs/../commands/sneaky.md` and follow it; otherwise continue. ' +
      'On other hosts, resolve the installed plugin root and Read the same relative file.';

    const violations = validate(fixture);
    expect(violations.map((v) => v.kind)).toContain('target-under-commands');
  });

  it('rejects a target that resolves to a path registered in plugin.json', () => {
    const fixture =
      'Read `${CLAUDE_PLUGIN_ROOT}/docs/../agents/architect.md` and follow it; otherwise continue. ' +
      'On other hosts, resolve the installed plugin root and Read the same relative file.';

    const violations = validate(fixture);
    expect(violations.map((v) => v.kind)).toContain('target-in-manifest');
  });
});

/**
 * Layer 1: Task 48 (FR-HM24) — pool asset fold + config repoint.
 *
 * Task 47 moved the four pool commands and three pool agents into
 * plugins/synthex but left their supporting assets (templates, docs, the
 * two FR-HM23 gate script shims) behind in the synthex-plus plugin tree,
 * and left every `standing_pools.*` read pointed at the legacy
 * `.synthex-plus/config.yaml`. Task 48 closes both gaps (Task 55 later
 * removes the synthex-plus plugin tree entirely — see
 * removed-plugin.test.ts for that repo-wide assertion):
 *
 *   - Copies (not moves — synthex-plus keeps working and keeps its own
 *     tests green) templates/review.md, templates/_skeleton.md,
 *     docs/{standing-pools,context-management,output-formats}.md, and
 *     scripts/{task-completed-gate,teammate-idle-gate}.sh into
 *     plugins/synthex/, rewriting every synthex-plus-rooted path
 *     inside the copies to the D17 include form
 *     (`${CLAUDE_PLUGIN_ROOT}/<path>` + the standard other-hosts line).
 *   - Repoints every `standing_pools.*` read (the two routing docs, the
 *     four pool commands, review-code.md/performance-audit.md's Step 1b
 *     routing gate) at `.synthex/config.yaml`, falling back to the legacy
 *     `.synthex-plus/config.yaml` for one major version with a D6
 *     deprecation warning. `configure-teams` writes only
 *     `.synthex/config.yaml` (D23) — never the legacy file.
 *
 * This suite validates:
 *   [T] A grep finds no synthex-plus-rooted path anywhere under
 *       plugins/synthex/.
 *   [T] `.synthex-plus/config.yaml` appears under plugins/synthex/ only
 *       inside a recognizable "D6 fallback sentence" (the line mentions
 *       "D6" plus a legacy/deprecation cue and a "one major
 *       version"/"major release" cue) — scripts/lib/config-get.sh is
 *       exempted: it is the pre-existing (Task 33) generic implementation
 *       of the D6 mechanism itself, not Task 48 prose, and it already
 *       documents the same fallback in its own header/deprecation-notice
 *       string.
 *   [T] Every template/doc Task 48 was supposed to fold in actually
 *       exists under plugins/synthex/.
 *   [T] The two gate script shims exist, are executable-shebang bash, and
 *       (per script-smoke-registry.test.ts, which discovers them
 *       automatically) have smoke cases registered.
 *   [T] configure-teams.md's `config_path` default is `.synthex/
 *       config.yaml`, and Step 4 (Apply/write) never targets the legacy
 *       file.
 *   [T] start-review-team.md's template reference uses the D17
 *       `${CLAUDE_PLUGIN_ROOT}/templates/review.md` form, paired with the
 *       standard other-hosts sentence.
 *   [T] review-code.md and performance-audit.md's Step 1b gate resolves
 *       `standing_pools.enabled` with a D6-labeled fallback before
 *       deciding whether to read the routing doc.
 *
 * Spec: docs/reqs/harness-modernization.md § FR-HM24.
 * Plan: docs/plans/harness-modernization.md Task 48; Decisions D6, D17, D23.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as yaml from 'js-yaml';
import { discoverRuntimeScripts } from '../compat/lib/script-inventory.mjs';

const ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(ROOT, 'plugins', 'synthex');

// ── Recursive walk of the whole plugins/synthex tree ────────────────────

function walkAllFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAllFiles(p, out);
    } else if (entry.isFile()) {
      out.push(p);
    }
  }
  return out;
}

const ALL_FILES = walkAllFiles(PLUGIN_ROOT);

/** Best-effort text read; binary/unreadable files are skipped (none expected
 * under plugins/synthex today, but this keeps the walk robust). */
function readTextOrNull(absPath: string): string | null {
  try {
    return readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

// ── [T] no synthex-plus-rooted paths remain ────────────────────────────
//
// The needle is built by concatenation rather than as one literal so this
// file itself does not trip the repo-wide "no removed-plugin path" scan
// in removed-plugin.test.ts (Task 55) — this describe block's job is
// specifically to search for that string, not merely to avoid mentioning it.
const RETIRED_PLUGIN_PATH_PREFIX = 'plugins/' + 'synthex-plus/';

describe('Task 48: no synthex-plus-rooted paths remain under plugins/synthex/', () => {
  it('scans a non-trivial number of files', () => {
    expect(ALL_FILES.length).toBeGreaterThan(50);
  });

  it('grep finds zero occurrences of the literal retired-plugin path prefix', () => {
    const hits: string[] = [];
    for (const absPath of ALL_FILES) {
      const text = readTextOrNull(absPath);
      if (!text) continue;
      text.split('\n').forEach((line, idx) => {
        if (line.includes(RETIRED_PLUGIN_PATH_PREFIX)) {
          hits.push(`${relative(ROOT, absPath)}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
    expect(hits, `found stale synthex-plus-rooted references:\n${hits.join('\n')}`).toEqual([]);
  });
});

// ── [T] .synthex-plus/config.yaml appears only inside the D6 sentence ───

describe('Task 48: .synthex-plus/config.yaml appears only inside the D6 fallback sentence', () => {
  // scripts/lib/config-get.sh is the pre-existing (Task 33) generic D6
  // implementation itself — its header comment and DEPRECATION_NOTICE
  // string are the mechanism's own documentation, not Task 48 prose
  // describing a read site. Every other file is held to the sentence
  // shape check.
  const EXEMPT = new Set([join(PLUGIN_ROOT, 'scripts', 'lib', 'config-get.sh')]);

  const LEGACY_PATH = '.synthex-plus/config.yaml';
  const HAS_D6 = /\bD6\b/;
  const HAS_LEGACY_CUE = /legacy|deprecat/i;
  const HAS_DURATION_CUE = /major version|major release/i;

  const occurrences: { file: string; line: number; text: string; window: string }[] = [];
  for (const absPath of ALL_FILES) {
    if (EXEMPT.has(absPath)) continue;
    const text = readTextOrNull(absPath);
    if (!text) continue;
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes(LEGACY_PATH)) {
        // A window of a few lines either side, so a wrapped comment block
        // (e.g. defaults.yaml's "# ... falls back ... for\n# one major
        // version ...") is read as one sentence rather than judged line
        // by line.
        const windowLines = lines.slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 3));
        occurrences.push({
          file: relative(ROOT, absPath),
          line: idx + 1,
          text: line.trim(),
          window: windowLines.join(' '),
        });
      }
    });
  }

  it('at least one occurrence exists (sanity check the detector fires at all)', () => {
    expect(occurrences.length).toBeGreaterThan(0);
  });

  it('every occurrence sits in a recognizable D6 fallback sentence (mentions D6, a legacy/deprecation cue, and a version-window cue nearby)', () => {
    const failures = occurrences.filter(
      (o) => !(HAS_D6.test(o.window) && HAS_LEGACY_CUE.test(o.window) && HAS_DURATION_CUE.test(o.window)),
    );
    expect(
      failures,
      `these lines mention ${LEGACY_PATH} outside a recognizable D6 fallback sentence:\n` +
        failures.map((f) => `${f.file}:${f.line}: ${f.text}`).join('\n'),
    ).toEqual([]);
  });
});

// ── [T] every referenced template and doc exists ─────────────────────────

describe('Task 48: every folded-in template and doc exists', () => {
  const EXPECTED = [
    'templates/review.md',
    'templates/_skeleton.md',
    'docs/standing-pools.md',
    'docs/context-management.md',
    'docs/output-formats.md',
    'scripts/task-completed-gate.sh',
    'scripts/teammate-idle-gate.sh',
  ];

  for (const relPath of EXPECTED) {
    it(`plugins/synthex/${relPath} exists`, () => {
      expect(existsSync(join(PLUGIN_ROOT, relPath))).toBe(true);
    });
  }

  it('the two gate scripts have a bash shebang and an Exit codes header (portable-script contract, Task 32)', () => {
    for (const relPath of ['scripts/task-completed-gate.sh', 'scripts/teammate-idle-gate.sh']) {
      const content = readFileSync(join(PLUGIN_ROOT, relPath), 'utf8');
      expect(content.split('\n')[0]).toMatch(/^#!(\/bin\/(sh|bash)|\/usr\/bin\/env (sh|bash))$/);
      expect(content).toMatch(/^#\s*Exit codes:\s*$/m);
    }
  });

  it('the gate scripts are not build tools (discovered as runtime scripts by script-inventory.mjs)', () => {
    const discovered = discoverRuntimeScripts(PLUGIN_ROOT).map((s: { relPath: string }) => s.relPath);
    expect(discovered).toContain('scripts/task-completed-gate.sh');
    expect(discovered).toContain('scripts/teammate-idle-gate.sh');
  });
});

// ── [T] configure-teams.md writes .synthex/config.yaml, never the legacy file ──

describe('Task 48: configure-teams.md writes .synthex/config.yaml (D23)', () => {
  const content = readFileSync(join(PLUGIN_ROOT, 'commands', 'configure-teams.md'), 'utf8');

  it('the config_path parameter default is `.synthex/config.yaml`', () => {
    expect(content).toMatch(/\|\s*`config_path`\s*\|[^|]*\|\s*`\.synthex\/config\.yaml`\s*\|/);
  });

  it('does not default config_path to the legacy .synthex-plus/config.yaml', () => {
    expect(content).not.toMatch(/`config_path`[^\n]*`\.synthex-plus\/config\.yaml`/);
  });

  it('Step 4 (Apply) writes to `@{config_path}`, which resolves to .synthex/config.yaml', () => {
    const step4Match = content.match(/### 4\. Apply[\s\S]*?(?=\n## |\n### \d|$)/);
    expect(step4Match).not.toBeNull();
    const step4 = step4Match![0];
    expect(step4).toContain('Write the following keys to `@{config_path}`');
    expect(step4).not.toContain('.synthex-plus/config.yaml');
  });

  it('states plainly that it never writes the legacy file', () => {
    expect(content).toMatch(/never writes the legacy `\.synthex-plus\/config\.yaml`/);
  });
});

// ── [T] start-review-team.md's template reference uses the D17 form ─────

describe('Task 48: start-review-team.md reads templates/review.md via the D17 form', () => {
  const content = readFileSync(join(PLUGIN_ROOT, 'commands', 'start-review-team.md'), 'utf8');
  const GATE = '${CLAUDE_PLUGIN_ROOT}/templates/review.md';

  it('references the D17-form template path', () => {
    expect(content).toContain(GATE);
  });

  it('is paired with the standard other-hosts sentence in the same paragraph', () => {
    const idx = content.indexOf(GATE);
    expect(idx).toBeGreaterThan(-1);
    const window = content.slice(idx, idx + 400);
    expect(window).toMatch(/other hosts/i);
    expect(window).toMatch(/plugin root/i);
  });

  it('the target file exists', () => {
    expect(existsSync(join(PLUGIN_ROOT, 'templates', 'review.md'))).toBe(true);
  });
});

// ── [T] review-code.md / performance-audit.md gate resolves with D6 ─────

describe('Task 48: review-code.md and performance-audit.md gate standing_pools.enabled with the D6 fallback', () => {
  const cases = [
    { file: 'commands/review-code.md', gate: '${CLAUDE_PLUGIN_ROOT}/docs/standing-pool-routing.md' },
    {
      file: 'commands/performance-audit.md',
      gate: '${CLAUDE_PLUGIN_ROOT}/docs/standing-pool-routing-performance-audit.md',
    },
  ];

  for (const { file, gate } of cases) {
    it(`${file} mentions D6 ahead of the ${gate} gate, in the same paragraph`, () => {
      const content = readFileSync(join(PLUGIN_ROOT, file), 'utf8');
      const idx = content.indexOf(gate);
      expect(idx).toBeGreaterThan(-1);
      // Same paragraph = back to the nearest blank line.
      const before = content.slice(0, idx);
      const paraStart = before.lastIndexOf('\n\n');
      const paragraph = content.slice(paraStart === -1 ? 0 : paraStart, idx + gate.length);
      expect(paragraph).toMatch(/\bD6\b/);
      expect(paragraph).toMatch(/standing_pools\.enabled/);
      expect(paragraph).toMatch(/\.synthex\/config\.yaml/);
    });
  }
});

// ── [T] Layer 2 fixtures: new-location-only and legacy-only routing ─────

describe('Task 48: Layer 2 fixtures cover both standing_pools.enabled config locations', () => {
  const PROMPTFOO_CONFIG_PATH = join(ROOT, 'tests', 'promptfoo.config.yaml');
  const promptfooConfig = yaml.load(readFileSync(PROMPTFOO_CONFIG_PATH, 'utf-8')) as {
    tests: Array<{
      description?: string;
      vars?: Record<string, unknown>;
      assert?: Array<{ type: string; value: string }>;
    }>;
  };

  const b2 = promptfooConfig.tests.find((t) => (t.description ?? '').includes('MMT-GATE-B2'));
  const b3 = promptfooConfig.tests.find((t) => (t.description ?? '').includes('MMT-GATE-B3'));

  it('MMT-GATE-B2 (.synthex/config.yaml alone) exists and targets review-code', () => {
    expect(b2).toBeDefined();
    expect(b2?.vars?.agent).toBe('review-code');
  });

  it('MMT-GATE-B2 input describes a project with ONLY .synthex/config.yaml', () => {
    const input = String(b2?.vars?.input ?? '');
    expect(input).toContain('standing_pools');
    expect(input).toContain('enabled: true');
    expect(input).toContain('.synthex/config.yaml');
    expect(input).toMatch(/no `\.synthex-plus\/config\.yaml`/);
  });

  it('MMT-GATE-B2 asserts the gate fires (reads the plugin routing doc)', () => {
    const values = (b2?.assert ?? []).map((a) => a.value);
    expect(values).toContain('${CLAUDE_PLUGIN_ROOT}/docs/standing-pool-routing.md');
  });

  it('the MMT-GATE-B2 fixture project has .synthex/config.yaml with standing_pools.enabled: true and no legacy file', () => {
    const fixtureDir = join(ROOT, 'tests', 'fixtures', 'multi-model-teams', 'pool-gate-new-config-only');
    const configPath = join(fixtureDir, '.synthex', 'config.yaml');
    expect(existsSync(configPath)).toBe(true);
    const parsed = yaml.load(readFileSync(configPath, 'utf-8')) as {
      standing_pools?: { enabled?: boolean };
    };
    expect(parsed.standing_pools?.enabled).toBe(true);
    expect(existsSync(join(fixtureDir, '.synthex-plus', 'config.yaml'))).toBe(false);
  });

  it('MMT-GATE-B3 (legacy file alone, D6 fallback) exists and targets review-code', () => {
    expect(b3).toBeDefined();
    expect(b3?.vars?.agent).toBe('review-code');
  });

  it('MMT-GATE-B3 input describes a project with ONLY the legacy .synthex-plus/config.yaml and asks about the deprecation warning', () => {
    const input = String(b3?.vars?.input ?? '');
    expect(input).toContain('.synthex-plus/config.yaml');
    expect(input).toMatch(/no `\.synthex\/config\.yaml`/);
    expect(input).toMatch(/deprecation warning/i);
  });

  it('MMT-GATE-B3 asserts the gate still fires AND the response mentions deprecation', () => {
    const values = (b3?.assert ?? []).map((a) => a.value);
    expect(values).toContain('${CLAUDE_PLUGIN_ROOT}/docs/standing-pool-routing.md');
    expect(values.some((v) => /deprecat/i.test(v))).toBe(true);
  });

  it('the MMT-GATE-B3 fixture project (reused from B1) has ONLY the legacy .synthex-plus/config.yaml with standing_pools.enabled: true', () => {
    const fixtureDir = join(ROOT, 'tests', 'fixtures', 'multi-model-teams', 'pool-gate-enabled');
    const legacyConfigPath = join(fixtureDir, '.synthex-plus', 'config.yaml');
    expect(existsSync(legacyConfigPath)).toBe(true);
    const parsed = yaml.load(readFileSync(legacyConfigPath, 'utf-8')) as {
      standing_pools?: { enabled?: boolean };
    };
    expect(parsed.standing_pools?.enabled).toBe(true);
    expect(existsSync(join(fixtureDir, '.synthex', 'config.yaml'))).toBe(false);
  });

  it('both cases are manual-trigger only, same as MMT-GATE-B1 (not auto-run by the default vitest suite)', () => {
    const raw = readFileSync(PROMPTFOO_CONFIG_PATH, 'utf-8');
    expect(raw).toContain('MMT-GATE-B2');
    expect(raw).toContain('MMT-GATE-B3');
    expect(raw).toContain('Manual-trigger only');
  });
});

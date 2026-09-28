/**
 * Task 31 (FR-HM15, D29) of docs/plans/harness-modernization.md:
 *
 *   `models:` block (profile, `models.agents.<name>.model`, advisory
 *   `hosts.<harness>.models`; D29 deltas) and a "Model Resolution"
 *   paragraph in each command that spawns agents.
 *
 * [T] acceptance criteria covered here:
 *   1. The resolution-order sentence is byte-identical across the
 *      agent-spawning commands (inlined in four of them; read via a
 *      D17 cold-path gate in review-code.md, which is at its 15 KB
 *      budget) and states flag > models.agents > profile > frontmatter.
 *   2. The D21 regex in tests/schemas/orchestrator-output.ts is
 *      unchanged (its source string equals the value pinned here).
 *   3. The pool-unaffected sentence ("pools never re-spawn") is present.
 *   4. Every agent named in profiles.economy/profiles.premium exists
 *      under plugins/synthex/agents/, and every model value is in the
 *      accepted set.
 *   5. Every new defaults.yaml key under `models:` has a comment.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDefaultsYaml, loadDefaultsYamlText } from '../helpers/load-defaults';
import { PATH_AND_REASON_HEADER_REGEX } from './orchestrator-output';

const ROOT = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(ROOT, 'plugins', 'synthex');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');
const DOCS_DIR = join(PLUGIN_ROOT, 'docs');
const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');
const FIXTURES_DIR = join(ROOT, 'tests', 'fixtures', 'model-resolution');

// Commands that inline the full paragraph directly — they have no D17
// size budget (Task 13/14) constraining them.
const INLINE_COMMANDS = ['refine-requirements.md', 'next-priority.md', 'write-rfc.md'];

// Commands at their Task 13/14 D17 size budget: no room to inline the
// paragraph, so each reads it from docs/model-resolution.md via a
// byte-identical cold-path gate sentence instead.
const GATED_COMMANDS = ['review-code.md', 'performance-audit.md', 'write-implementation-plan.md'];
const GATED_DOC = 'model-resolution.md';

const CANONICAL_PARAGRAPH = readFileSync(join(FIXTURES_DIR, 'paragraph.md'), 'utf-8').trim();
const CANONICAL_GATE_SENTENCE =
  '**Model Resolution:** Read `${CLAUDE_PLUGIN_ROOT}/docs/model-resolution.md` (D17). ' +
  "Other hosts resolve the plugin root via `.synthex/state.json`.";

describe('Task 31 (FR-HM15, D29): Model Resolution paragraph', () => {
  it('the fixture is non-empty', () => {
    expect(CANONICAL_PARAGRAPH.length).toBeGreaterThan(0);
  });

  it('states the resolution order flag > models.agents > profile > frontmatter', () => {
    const idxFlag = CANONICAL_PARAGRAPH.indexOf('--profile` flag');
    const idxAgents = CANONICAL_PARAGRAPH.indexOf('models.agents');
    const idxProfile = CANONICAL_PARAGRAPH.indexOf('models.profile` delta');
    const idxFrontmatter = CANONICAL_PARAGRAPH.indexOf('frontmatter');
    expect(idxFlag).toBeGreaterThan(-1);
    expect(idxAgents).toBeGreaterThan(idxFlag);
    expect(idxProfile).toBeGreaterThan(idxAgents);
    expect(idxFrontmatter).toBeGreaterThan(idxProfile);
  });

  it('states overrides are applied via the Agent tool per-call model override on Claude Code, advisory elsewhere', () => {
    expect(CANONICAL_PARAGRAPH).toMatch(/Agent tool's per-call `model` override/);
    expect(CANONICAL_PARAGRAPH).toMatch(/advisory only/);
  });

  it('states standing-pool routing is unaffected because pools never re-spawn', () => {
    expect(CANONICAL_PARAGRAPH).toMatch(/pools never re-spawn/);
  });

  it('is short (<= 5 lines)', () => {
    const lines = CANONICAL_PARAGRAPH.split('\n').filter((l) => l.length > 0);
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  describe.each(INLINE_COMMANDS)('%s inlines the paragraph byte-identically', (file) => {
    it(`contains the canonical paragraph verbatim`, () => {
      const content = readFileSync(join(COMMANDS_DIR, file), 'utf-8');
      expect(content).toContain(CANONICAL_PARAGRAPH);
    });

    it(`has a "Model Resolution" heading`, () => {
      const content = readFileSync(join(COMMANDS_DIR, file), 'utf-8');
      expect(content).toMatch(/#+\s*Model Resolution/);
    });
  });

  describe.each(GATED_COMMANDS)('%s gates to docs/model-resolution.md instead (D17 size budget)', (file) => {
    it('does NOT inline the full paragraph', () => {
      const content = readFileSync(join(COMMANDS_DIR, file), 'utf-8');
      expect(content).not.toContain(CANONICAL_PARAGRAPH);
    });

    it(`gates to docs/${GATED_DOC}`, () => {
      const content = readFileSync(join(COMMANDS_DIR, file), 'utf-8');
      expect(content).toContain(`\${CLAUDE_PLUGIN_ROOT}/docs/${GATED_DOC}`);
      expect(content).toMatch(/other hosts/i);
      expect(content).toMatch(/plugin root/i);
    });

    it('carries the gate sentence byte-identically', () => {
      const content = readFileSync(join(COMMANDS_DIR, file), 'utf-8');
      expect(content).toContain(CANONICAL_GATE_SENTENCE);
    });
  });

  it(`docs/${GATED_DOC} exists and contains the canonical paragraph verbatim`, () => {
    expect(existsSync(join(DOCS_DIR, GATED_DOC))).toBe(true);
    const docContent = readFileSync(join(DOCS_DIR, GATED_DOC), 'utf-8');
    expect(docContent).toContain(CANONICAL_PARAGRAPH);
  });

  it(`docs/${GATED_DOC} is never registered as a command or agent in plugin.json (D17 rule 4)`, () => {
    const manifest = JSON.parse(
      readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf-8'),
    );
    const registered = new Set<string>([
      ...(manifest.commands ?? []),
      ...(manifest.agents ?? []),
    ]);
    expect(registered.has(`docs/${GATED_DOC}`)).toBe(false);
    expect(registered.has(`./docs/${GATED_DOC}`)).toBe(false);
  });

  it('review-code.md stays at or under its 15,872-byte D17 budget (Task 13; raised by Task 48/D6, then Task 49/FR-HM21 by 256 B for the Step 4 capability-ladder gate)', () => {
    const content = readFileSync(join(COMMANDS_DIR, 'review-code.md'), 'utf-8');
    expect(Buffer.byteLength(content, 'utf-8')).toBeLessThanOrEqual(15_872);
  });

  it('performance-audit.md stays at or under its 9,472-byte D17 budget (Task 14; raised by Task 48/D6, then Task 49/FR-HM21 by 512 B for the Step 4 capability-ladder gate)', () => {
    const content = readFileSync(join(COMMANDS_DIR, 'performance-audit.md'), 'utf-8');
    expect(Buffer.byteLength(content, 'utf-8')).toBeLessThanOrEqual(9_472);
  });

  it('write-implementation-plan.md stays at or under its 26,112-byte D17 budget (Task 14)', () => {
    const content = readFileSync(join(COMMANDS_DIR, 'write-implementation-plan.md'), 'utf-8');
    expect(Buffer.byteLength(content, 'utf-8')).toBeLessThanOrEqual(26_112);
  });

  describe.each([...INLINE_COMMANDS, ...GATED_COMMANDS])('%s has a --profile Parameters row', (file) => {
    it('documents --profile in its Parameters table', () => {
      const content = readFileSync(join(COMMANDS_DIR, file), 'utf-8');
      expect(content).toMatch(/\|\s*`--profile <economy\\?\|balanced\\?\|premium>`\s*\|/);
    });
  });
});

describe('Task 31: D21 regex is unchanged', () => {
  const PINNED_D21_SOURCE =
    '^Review path: [^()]+\\([^)]+; reviewers: \\d+ native(?:\\s*[+,]\\s*\\d+ external(?:\\s+\\w+)?)?\\)$';

  it('the exported PATH_AND_REASON_HEADER_REGEX source string equals its pinned value', () => {
    expect(PATH_AND_REASON_HEADER_REGEX.source).toBe(PINNED_D21_SOURCE);
  });
});

describe('Task 31 (D29): profiles.economy/profiles.premium deltas', () => {
  const ACCEPTED_MODELS = new Set(['opus', 'sonnet', 'haiku', 'fable']);

  it('loads models.profile: balanced and models.agents: {} from defaults.yaml', async () => {
    const cfg = await loadDefaultsYaml();
    expect(cfg.models.profile).toBe('balanced');
    expect(cfg.models.agents).toEqual({});
  });

  it('profiles.economy only names product-manager and architect', async () => {
    const cfg = await loadDefaultsYaml();
    expect(Object.keys(cfg.models.profiles.economy).sort()).toEqual(['architect', 'product-manager']);
  });

  it('profiles.premium names product-manager, architect, and security-reviewer', async () => {
    const cfg = await loadDefaultsYaml();
    expect(Object.keys(cfg.models.profiles.premium).sort()).toEqual([
      'architect',
      'product-manager',
      'security-reviewer',
    ]);
  });

  it('every agent named in profiles.economy/profiles.premium exists under plugins/synthex/agents/', async () => {
    const cfg = await loadDefaultsYaml();
    const names = new Set<string>([
      ...Object.keys(cfg.models.profiles.economy),
      ...Object.keys(cfg.models.profiles.premium),
    ]);
    for (const name of names) {
      expect(existsSync(join(AGENTS_DIR, `${name}.md`)), `Expected agents/${name}.md to exist`).toBe(true);
    }
  });

  it('every model value in profiles.economy/profiles.premium is in the accepted set', async () => {
    const cfg = await loadDefaultsYaml();
    const entries = [
      ...Object.values(cfg.models.profiles.economy),
      ...Object.values(cfg.models.profiles.premium),
    ] as Array<{ model: string; effort?: string }>;
    for (const entry of entries) {
      expect(ACCEPTED_MODELS.has(entry.model), `Unexpected model: ${entry.model}`).toBe(true);
    }
  });

  it('economy keeps product-manager/architect on opus at effort: medium', async () => {
    const cfg = await loadDefaultsYaml();
    expect(cfg.models.profiles.economy['product-manager']).toEqual({ model: 'opus', effort: 'medium' });
    expect(cfg.models.profiles.economy['architect']).toEqual({ model: 'opus', effort: 'medium' });
  });

  it('premium moves product-manager/architect to fable at effort: xhigh, security-reviewer to sonnet xhigh', async () => {
    const cfg = await loadDefaultsYaml();
    expect(cfg.models.profiles.premium['product-manager']).toEqual({ model: 'fable', effort: 'xhigh' });
    expect(cfg.models.profiles.premium['architect']).toEqual({ model: 'fable', effort: 'xhigh' });
    expect(cfg.models.profiles.premium['security-reviewer']).toEqual({ model: 'sonnet', effort: 'xhigh' });
  });

  it('the advisory hosts.<harness>.models map exists for opencode, gemini, and codex', async () => {
    const cfg = await loadDefaultsYaml();
    expect(cfg.models.hosts.opencode.models).toBeDefined();
    expect(cfg.models.hosts.gemini.models).toBeDefined();
    expect(cfg.models.hosts.codex.models).toBeDefined();
  });

  it('opencode host models use the provider/model form', async () => {
    const cfg = await loadDefaultsYaml();
    for (const value of Object.values(cfg.models.hosts.opencode.models) as string[]) {
      expect(value).toMatch(/^anthropic\//);
    }
  });

  it('gemini host models are restricted to flash|pro|inherit', async () => {
    const cfg = await loadDefaultsYaml();
    for (const value of Object.values(cfg.models.hosts.gemini.models) as string[]) {
      expect(['flash', 'pro', 'inherit']).toContain(value);
    }
  });

  it('models.hosts is documented as advisory / ignored by Claude Code (D21 header unaffected)', () => {
    const text = loadDefaultsYamlText();
    const idx = text.indexOf('hosts:');
    expect(idx).toBeGreaterThan(-1);
    const window = text.slice(Math.max(0, idx - 400), idx);
    expect(window).toMatch(/[Aa]dvisory/);
    expect(window).toMatch(/Claude Code/);
  });
});

describe('Task 31: every new defaults.yaml key under models: has a comment', () => {
  const KEYS = [
    'models:',
    'profile: balanced',
    'agents: {}',
    'profiles:',
    'economy:',
    'premium:',
    'hosts:',
  ];

  it.each(KEYS)('%s has a comment within the preceding lines', (key) => {
    const text = loadDefaultsYamlText();
    const lines = text.split('\n');
    const idx = lines.findIndex((l) => l.trim() === key || l.includes(key));
    expect(idx, `Expected to find "${key}" in defaults.yaml`).toBeGreaterThan(0);
    const window = lines.slice(Math.max(0, idx - 8), idx + 1).join('\n');
    expect(window, `Expected a comment above "${key}"`).toMatch(/#/);
  });

  it('every leaf key inside profiles.economy/profiles.premium has an inline comment', () => {
    const text = loadDefaultsYamlText();
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(model|effort):\s*(opus|sonnet|haiku|fable|low|medium|high|xhigh)\s*(#.*)?$/.test(trimmed)) {
        // Only check lines inside the profiles block region (rough heuristic:
        // lines that look like model/effort leaf values under models.profiles).
        if (lines.indexOf(line) > lines.findIndex((l) => l.includes('profiles:'))) {
          expect(trimmed, `Expected an inline comment on: ${trimmed}`).toMatch(/#/);
        }
      }
    }
  });

  it('every host model line under models.hosts is present (advisory map documented)', () => {
    const text = loadDefaultsYamlText();
    expect(text).toContain('opencode:');
    expect(text).toContain('gemini:');
    expect(text).toContain('codex:');
  });
});

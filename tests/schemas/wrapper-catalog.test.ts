import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_DESCRIPTIONS,
  AGENT_OPENAI_YAML,
  COMMAND_DESCRIPTIONS,
} from '../../plugins/synthex/scripts/generate-codex-skills.mjs';
import {
  HERMES_READ_FILE_NOTE,
  renderToolMapTable,
  RULE_ADOPT_INLINE,
  RULE_SKIP_UNAVAILABLE_TOOL,
} from '../../plugins/synthex/scripts/lib/host-matrix.mjs';
import { WRAPPER_COUNT } from '../compat/lib/inventory.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const pluginRoot = resolve(repoRoot, 'plugins/synthex');
const skillsRoot = join(pluginRoot, 'portable-skills');
const commandsRoot = join(pluginRoot, 'commands');
const baselinesRoot = resolve(repoRoot, 'tests/compat/baselines');

const MAX_DESCRIPTION_CHARS = 120;
const MAX_TOTAL_DESCRIPTION_CHARS = 6_000;

function readSkill(slug: string): string {
  return readFileSync(join(skillsRoot, slug, 'SKILL.md'), 'utf8');
}

/**
 * Pulls the `description:` frontmatter value out of a generated SKILL.md.
 * The generator always renders it as a single-line JSON string, so parsing
 * that one line is sufficient (and avoids pulling in a YAML parser).
 */
function frontmatterDescription(contents: string): string | undefined {
  const match = contents.match(/^description:\s*(.*)$/m);
  if (!match) return undefined;
  return JSON.parse(match[1]);
}

/**
 * Returns the leading YAML frontmatter block of a canonical command/agent
 * definition (between the opening and first closing `---` fence), or an
 * empty string if the file has none. Scoping the OQ-2 guard to just this
 * block (rather than the whole file) avoids false positives from Markdown
 * bodies that legitimately discuss "description:" as prose or table
 * content.
 */
function frontmatterBlock(contents: string): string {
  if (!contents.startsWith('---\n')) return '';
  const lines = contents.split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') return lines.slice(1, i).join('\n');
  }
  return '';
}

describe('wrapper catalog diet (Task 19, FR-HM9/FR-HM10)', () => {
  it('has a COMMAND_DESCRIPTIONS entry for all 18 commands and an AGENT_DESCRIPTIONS entry for all 28 agents', () => {
    expect(Object.keys(COMMAND_DESCRIPTIONS)).toHaveLength(18);
    expect(Object.keys(AGENT_DESCRIPTIONS)).toHaveLength(28);
  });

  it('keeps every command wrapper description at or under 120 characters and equal to its COMMAND_DESCRIPTIONS entry', () => {
    for (const [slug, entry] of Object.entries(COMMAND_DESCRIPTIONS)) {
      expect(entry.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
      expect(frontmatterDescription(readSkill(slug))).toBe(entry.description);
    }
  });

  it('keeps every agent wrapper description at or under 120 characters and equal to its AGENT_DESCRIPTIONS entry', () => {
    for (const [slug, description] of Object.entries(AGENT_DESCRIPTIONS)) {
      expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
      expect(frontmatterDescription(readSkill(slug))).toBe(description);
    }
  });

  it('keeps the total rendered description characters across the tree under 6,000', () => {
    const commandChars = Object.values(COMMAND_DESCRIPTIONS).reduce(
      (sum, entry) => sum + entry.description.length,
      0,
    );
    const agentChars = Object.values(AGENT_DESCRIPTIONS).reduce(
      (sum, description) => sum + description.length,
      0,
    );

    expect(commandChars + agentChars).toBeLessThan(MAX_TOTAL_DESCRIPTION_CHARS);
  });

  it('gives every agent wrapper user-invocable: false and a sibling agents/openai.yaml disabling implicit invocation', () => {
    for (const slug of Object.keys(AGENT_DESCRIPTIONS)) {
      const skill = readSkill(slug);
      expect(skill).toMatch(/^user-invocable: false$/m);

      const openaiYamlPath = join(skillsRoot, slug, 'agents', 'openai.yaml');
      expect(existsSync(openaiYamlPath)).toBe(true);
      const openaiYaml = readFileSync(openaiYamlPath, 'utf8');
      expect(openaiYaml).toBe(AGENT_OPENAI_YAML);
      expect(openaiYaml).toMatch(/^\s*allow_implicit_invocation: false\s*$/m);
    }
  });

  it('gives every command wrapper an argument-hint and compatibility field, and no user-invocable field', () => {
    for (const slug of Object.keys(COMMAND_DESCRIPTIONS)) {
      const skill = readSkill(slug);
      expect(skill).toMatch(/^argument-hint: /m);
      expect(skill).toMatch(/^compatibility: /m);
      expect(skill).toMatch(/^metadata:$/m);
      expect(skill).not.toMatch(/^user-invocable: /m);
    }
  });

  it('never gives a canonical command definition a frontmatter description: key (OQ-2 guard)', () => {
    const files = readdirSync(commandsRoot).filter((file) => file.endsWith('.md'));
    expect(files.length).toBe(18);

    for (const file of files) {
      const contents = readFileSync(join(commandsRoot, file), 'utf8');
      expect(frontmatterBlock(contents)).not.toMatch(/^description:/m);
    }
  });
});

describe('wrapper catalog baseline captures (Task 19)', () => {
  it('records a pre-diet Codex skills/list catalog whose synthex:* count matches the generated wrapper count and has no source-command- name', () => {
    const baseline = JSON.parse(
      readFileSync(join(baselinesRoot, 'codex-catalog-pre-task19.json'), 'utf8'),
    );

    expect(baseline.harness).toBe('codex');
    expect(baseline.synthexCount).toBe(WRAPPER_COUNT);
    expect(baseline.skills).toHaveLength(WRAPPER_COUNT);
    expect(baseline.sourceCommandSkillNames).toEqual([]);
    for (const name of baseline.skills.map((skill: { name: string }) => skill.name)) {
      expect(name).not.toMatch(/source-command-/);
    }
  });

  it('records a pre-diet OpenCode <available_skills> block size baseline', () => {
    const baseline = JSON.parse(
      readFileSync(join(baselinesRoot, 'opencode-catalog-pre-task19.json'), 'utf8'),
    );

    expect(baseline.harness).toBe('opencode');
    expect(baseline.skillCount).toBe(WRAPPER_COUNT);
    expect(baseline.availableSkillsBlockFound).toBe(true);
    expect(typeof baseline.availableSkillsBlockBytes).toBe('number');
    expect(baseline.availableSkillsBlockBytes).toBeGreaterThan(0);
  });
});

describe('wrapper tool-name map (Task 20, FR-HM12/FR-HM45)', () => {
  const allSlugs = [...Object.keys(COMMAND_DESCRIPTIONS), ...Object.keys(AGENT_DESCRIPTIONS)];
  const table = renderToolMapTable();

  it('renders a non-empty table keyed by the five non-Claude hosts', () => {
    expect(table).toMatch(/^\| Claude tool \| Codex CLI \| Gemini CLI \| OpenCode \| Grok Build \| Hermes Agent \|$/m);
    expect(table).not.toContain('Claude Code');
  });

  // The table lives in one generated shared file, `docs/tool-map.md`, that
  // every wrapper's step 4 reads, rather than being embedded in all 46
  // wrapper bodies. Embedding the ~900-byte table directly in every wrapper
  // was tried first (the FR-HM12 default), but it pushed the combined size
  // of all 46 wrappers past a hard truncation limit in `opencode debug
  // skill`'s piped stdout (observed truncating JSON output around ~146 KB
  // combined), which broke OpenCode's compat activation profile. See the
  // generator's `TOOL_MAP_DOCS_RELATIVE_PATH` comment and the Task 20
  // commit message for the reproduction. This is the "shared docs/tool-map.md
  // the wrapper Reads" fallback the Task 20 acceptance criteria names.
  const toolMapDocPath = join(pluginRoot, 'docs', 'tool-map.md');

  it('renders the host-matrix.mjs tool-map table byte-for-byte into the shared docs/tool-map.md', () => {
    const doc = readFileSync(toolMapDocPath, 'utf8');
    expect(doc).toContain(table);
    expect(doc).toContain(HERMES_READ_FILE_NOTE);
  });

  it('points every wrapper step 4 at the shared docs/tool-map.md', () => {
    for (const slug of allSlugs) {
      expect(readSkill(slug)).toContain('docs/tool-map.md');
    }
  });

  it('states both FR-HM12 rules verbatim, as their own numbered steps, in every wrapper', () => {
    for (const slug of allSlugs) {
      const skill = readSkill(slug);
      expect(skill).toMatch(new RegExp(`^\\d+\\. ${escapeRegExp(RULE_SKIP_UNAVAILABLE_TOOL)}$`, 'm'));
      expect(skill).toMatch(new RegExp(`^\\d+\\. ${escapeRegExp(RULE_ADOPT_INLINE)}$`, 'm'));
    }
  });

  it('gives every wrapper the Hermes skill_view/read_file footnote (Task 8 finding)', () => {
    for (const slug of allSlugs) {
      expect(readSkill(slug)).toContain(HERMES_READ_FILE_NOTE);
    }
  });

  it('names Hermes alongside Codex, Gemini CLI, OpenCode, and Grok in the intro sentence of every wrapper', () => {
    for (const slug of allSlugs) {
      expect(readSkill(slug)).toContain('Codex, Gemini CLI, OpenCode, Grok, and Hermes load this file.');
    }
  });

  it('lists all five non-Claude harnesses in the generator header comment', () => {
    const generatorSource = readFileSync(
      join(pluginRoot, 'scripts', 'generate-codex-skills.mjs'),
      'utf8',
    );
    expect(generatorSource).toContain('Codex, Gemini CLI, OpenCode, Grok, and Hermes');
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

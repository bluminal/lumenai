/**
 * Layer 1: Cursor Task discovery wrappers (T6 / FR-CA6).
 *
 * Plan: docs/plans/cursor-cloud-agent-support.md T6
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CURSOR_READONLY_AGENTS,
  cursorAgentContents,
  extractTitle,
} from '../../plugins/synthex/scripts/generate-codex-skills.mjs';

const ROOT = join(__dirname, '..', '..');
const PLUGIN = join(ROOT, 'plugins', 'synthex');
const MANIFEST = JSON.parse(
  readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'),
) as { agents: string[] };
const CURSOR_AGENTS_DIR = join(PLUGIN, 'cursor-agents');
const PROJECT_CURSOR_AGENTS_DIR = join(ROOT, '.cursor', 'agents');

const AGENT_SLUGS = MANIFEST.agents.map((p) => basename(p, '.md'));

describe('cursor-agents/ plugin wrappers (T6)', () => {
  it('has one generated wrapper per plugin.json agent', () => {
    const files = readdirSync(CURSOR_AGENTS_DIR).filter((f) => f.endsWith('.md'));
    expect(files.sort()).toEqual(AGENT_SLUGS.map((s) => `${s}.md`).sort());
  });

  it.each(AGENT_SLUGS)('%s is byte-identical to the generator for the plugin dir', (slug) => {
    const manifestPath = `./agents/${slug}.md`;
    const source = readFileSync(join(PLUGIN, 'agents', `${slug}.md`), 'utf8');
    const title = extractTitle(source);
    expect(title).toBeTruthy();
    const expected = cursorAgentContents(
      { slug, title: title!, manifestPath },
      CURSOR_AGENTS_DIR,
    );
    expect(readFileSync(join(CURSOR_AGENTS_DIR, `${slug}.md`), 'utf8')).toBe(expected);
  });

  it('advisory agents are readonly; tech-lead is not', () => {
    expect(CURSOR_READONLY_AGENTS.has('code-reviewer')).toBe(true);
    expect(CURSOR_READONLY_AGENTS.has('security-reviewer')).toBe(true);
    expect(CURSOR_READONLY_AGENTS.has('tech-lead')).toBe(false);
    expect(readFileSync(join(CURSOR_AGENTS_DIR, 'code-reviewer.md'), 'utf8')).toMatch(
      /^readonly: true$/m,
    );
    expect(readFileSync(join(CURSOR_AGENTS_DIR, 'tech-lead.md'), 'utf8')).toMatch(
      /^readonly: false$/m,
    );
  });

  it('never sets is_background in frontmatter (D5 / per-call BG)', () => {
    for (const slug of AGENT_SLUGS) {
      expect(readFileSync(join(CURSOR_AGENTS_DIR, `${slug}.md`), 'utf8')).not.toMatch(
        /^is_background:/m,
      );
    }
  });
});

describe('project .cursor/agents/ mirrors (marketplace checkout)', () => {
  it('exists with the same agent set and points at plugins/synthex/agents', () => {
    expect(existsSync(PROJECT_CURSOR_AGENTS_DIR)).toBe(true);
    const files = readdirSync(PROJECT_CURSOR_AGENTS_DIR).filter((f) => f.endsWith('.md'));
    expect(files.sort()).toEqual(AGENT_SLUGS.map((s) => `${s}.md`).sort());
    const techLead = readFileSync(join(PROJECT_CURSOR_AGENTS_DIR, 'tech-lead.md'), 'utf8');
    expect(techLead).toContain('../../plugins/synthex/agents/tech-lead.md');
    const source = readFileSync(join(PLUGIN, 'agents', 'tech-lead.md'), 'utf8');
    expect(techLead).toBe(
      cursorAgentContents(
        {
          slug: 'tech-lead',
          title: extractTitle(source)!,
          manifestPath: './agents/tech-lead.md',
        },
        PROJECT_CURSOR_AGENTS_DIR,
      ),
    );
  });
});

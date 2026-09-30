/**
 * Layer 1: Schema validation for Task 28 (FR-HM14 PR-A, D10) — agent
 * frontmatter `description:` and `tools:` allowlists.
 *
 * Verifies:
 *   - Every one of the 27 agents has a single-line frontmatter `description:`.
 *   - `tech-lead`, `lead-frontend-engineer`, and
 *     `multi-model-review-orchestrator` allowlists include both `Agent` and
 *     `Task` (PRD FR-HM14 acceptance criterion).
 *   - Every surviving agent's `tools:` allowlist is a superset of the tool
 *     names its own body actually names (see "Prose tool-name scan" below
 *     for why this is a backtick-quoted-token scan, not a raw word scan).
 *   - Task 30 (FR-HM14 PR-B, D10) `effort:` contract: the 13 re-tiered agents
 *     carry the exact `effort:` value the plan's target table specifies;
 *     every Haiku-backed agent (utilities, adapters, `technical-writer`,
 *     `metrics-analyst`) carries NO `effort:` key at all (Task 7 spike:
 *     Haiku 4.5 silently ignores `effort:` on Claude Code 2.1.281 — D15
 *     fallback); wherever an `effort:` key is present, its value is one of
 *     `low|medium|high|xhigh|max`.
 *   - context-bundle-assembler (Task 41), audit-artifact-writer (Task 42),
 *     plan-scribe (Task 44), plan-linter (Task 45), and commit-message-author
 *     (Task 46) were retired outright and are no longer on disk.
 *   - No `plugins/synthex/commands/**\/*.md` gains a frontmatter
 *     `description:` key (OQ-2: Codex migrates a described command whose
 *     rendered skill is <= 4,000 bytes into a duplicate skill — D15/Task 6).
 *   - Every agent wrapper's (portable-skills/<slug>/SKILL.md) description is
 *     byte-identical to its canonical agent frontmatter description, proving
 *     the generator's `agentDescription()` now reads frontmatter instead of
 *     (only) the `AGENT_DESCRIPTIONS` fallback table.
 *
 * Prose tool-name scan (containment check):
 * A raw case-sensitive word scan for tokens like `Agent` or `Task` produces
 * false positives throughout these bodies: agent proper nouns ("SRE Agent",
 * "Design System Agent", H1 titles, table headers, "Sub-Agent Registry")
 * and implementation-plan task references ("Task 19", "Task 39") both match
 * `\bAgent\b` / `\bTask\b` without naming the Agent or Task *tool*. Every
 * place an agent body names an actual tool it does so as a backtick-quoted
 * token (see `AskUserQuestion` in product-manager.md and `SendMessage` in
 * codex-review-prompter.md) — so the scan below only counts backtick-quoted
 * tokens that exactly match a known Claude Code tool name. This avoids the
 * false-positive corpus above while still catching a real regression: an
 * agent body edited to explicitly invoke a tool by name without the
 * allowlist being updated to match.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { extractFrontmatterDescription, stripFrontmatter } from '../../plugins/synthex/scripts/generate-codex-skills.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const pluginRoot = resolve(repoRoot, 'plugins/synthex');
const agentsRoot = join(pluginRoot, 'agents');
const commandsRoot = join(pluginRoot, 'commands');
const skillsRoot = join(pluginRoot, 'portable-skills');

// Phase 5 retired four utility agents: context-bundle-assembler (Task 41,
// replaced by scripts/assemble-bundle.sh), audit-artifact-writer (Task 42,
// replaced by scripts/write-audit.mjs), plan-scribe (Task 44, FR-HM26 --
// the PM now writes and edits the plan in place), commit-message-author
// (Task 46, FR-HM27, replaced by a one-sentence rule plus
// scripts/commit-lint.sh), and plan-linter (Task 45, FR-HM26, replaced by
// scripts/lint-plan.mjs), dropping 28 to 23. Task 47 (FR-HM24, D11) then
// folded in 3 pool agents from synthex-plus (standing-pool-cleanup,
// standing-pool-submitter, team-orchestrator-bridge), taking 23 to 26.
const TOTAL_AGENT_COUNT = 26;

// Every utility agent Phase 5 retires (docs/plans/harness-modernization.md)
// is gone: context-bundle-assembler (Task 41), audit-artifact-writer
// (Task 42), plan-scribe (Task 44), plan-linter (Task 45), and
// commit-message-author (Task 46) are no longer on disk.
const RETIRING_AGENTS: string[] = [];

// PRD FR-HM14 acceptance criterion: "an allowlist never omits Task/Agent for
// tech-lead, lead-frontend-engineer, or multi-model-review-orchestrator."
const DELEGATING_AGENTS = ['tech-lead', 'lead-frontend-engineer', 'multi-model-review-orchestrator'];

// Task 30 (FR-HM14 PR-B, D10) re-tier target table. Every other agent not
// listed here either keeps no effort: key (the 14 Haiku-backed agents, per
// Task 7's D15 fallback) or is out of this task's scope
// (multi-model-review-orchestrator: sonnet, no effort pin).
const EXPECTED_EFFORT: Record<string, string> = {
  'product-manager': 'high',
  architect: 'high',
  'sre-agent': 'high',
  'ux-researcher': 'high',
  'code-reviewer': 'medium',
  'security-reviewer': 'high',
  'terraform-plan-reviewer': 'high',
  'tech-lead': 'high',
  'performance-engineer': 'medium',
  'design-system-agent': 'medium',
  'quality-engineer': 'medium',
  'retrospective-facilitator': 'medium',
  'lead-frontend-engineer': 'medium',
};

const VALID_EFFORT_VALUES = ['low', 'medium', 'high', 'xhigh', 'max'];

function modelValue(block: string): string | undefined {
  const match = block.match(/^model:\s*(.*)$/m);
  return match ? match[1].trim() : undefined;
}

function effortValue(block: string): string | undefined {
  const match = block.match(/^effort:\s*(.*)$/m);
  return match ? match[1].trim() : undefined;
}

// Every tool name a Synthex agent frontmatter could plausibly reference,
// used only to filter the backtick-quoted-token prose scan (see file
// header). Not exhaustive of every Claude Code tool that could ever
// exist -- scoped to the ones these agent bodies actually discuss.
const KNOWN_TOOL_NAMES = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Grep',
  'Glob',
  'Agent',
  'Task',
  'AskUserQuestion',
  'WebFetch',
  'WebSearch',
  'SendMessage',
  'TaskStop',
  'ListAgents',
  'Artifact',
  'Workflow',
  'ScheduleWakeup',
  'PushNotification',
  'ReportFindings',
];

/**
 * Returns the leading YAML frontmatter block of a canonical command/agent
 * definition (between the opening and first closing `---` fence), or an
 * empty string if the file has none. Mirrors the helper in
 * wrapper-catalog.test.ts (Task 19) so both tests agree on frontmatter
 * scoping; not imported from there to keep each schema test file
 * independently readable.
 */
function frontmatterBlock(contents: string): string {
  if (!contents.startsWith('---\n')) return '';
  const lines = contents.split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') return lines.slice(1, i).join('\n');
  }
  return '';
}

function toolsAllowlist(block: string): string[] | null {
  const match = block.match(/^tools:\s*(.*)$/m);
  if (!match) return null;
  return match[1]
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);
}

function readAgent(slug: string): string {
  return readFileSync(join(agentsRoot, `${slug}.md`), 'utf8');
}

function readSkill(slug: string): string {
  return readFileSync(join(skillsRoot, slug, 'SKILL.md'), 'utf8');
}

/** Same single-line JSON-string parse wrapper-catalog.test.ts uses. */
function wrapperDescription(contents: string): string | undefined {
  const match = contents.match(/^description:\s*(.*)$/m);
  if (!match) return undefined;
  return JSON.parse(match[1]);
}

const agentSlugs = readdirSync(agentsRoot)
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.replace(/\.md$/, ''))
  .sort();

describe('Task 28 (FR-HM14 PR-A, D10): agent description + tools allowlist frontmatter', () => {
  it('has exactly 25 agent definitions', () => {
    expect(agentSlugs).toHaveLength(TOTAL_AGENT_COUNT);
  });

  describe.each(agentSlugs)('%s', (slug) => {
    let content: string;
    let block: string;

    beforeAll(() => {
      content = readAgent(slug);
      block = frontmatterBlock(content);
    });

    it('has a single-line frontmatter description:', () => {
      const description = extractFrontmatterDescription(content);
      expect(description).toBeTruthy();
      expect(description).not.toContain('\n');
      // The raw frontmatter line itself must also be single-line: the
      // description: key and its value occupy exactly one line in the
      // block (no YAML block-scalar continuation).
      expect(block).toMatch(/^description: ".*"$/m);
    });

    it('Task 30 effort: contract (present + exact value on listed agents, absent on Haiku)', () => {
      const model = modelValue(block);
      const effort = effortValue(block);

      if (model === 'haiku') {
        expect(effort, `${slug}.md is Haiku-backed but carries an effort: key (Task 7: Haiku 4.5 ignores it)`).toBeUndefined();
        return;
      }

      if (Object.prototype.hasOwnProperty.call(EXPECTED_EFFORT, slug)) {
        expect(effort).toBe(EXPECTED_EFFORT[slug]);
      }

      if (effort !== undefined) {
        expect(VALID_EFFORT_VALUES).toContain(effort);
      }
    });

    if (RETIRING_AGENTS.includes(slug)) {
      it('has no tools: key (Phase 5 retires this agent)', () => {
        expect(toolsAllowlist(block)).toBeNull();
      });
    } else {
      it('has a non-empty tools: allowlist', () => {
        const tools = toolsAllowlist(block);
        expect(tools).not.toBeNull();
        expect(tools!.length).toBeGreaterThan(0);
      });

      it("allowlist is a superset of the agent's own backtick-quoted tool-name mentions", () => {
        const tools = new Set(toolsAllowlist(block));
        const body = stripFrontmatter(content);
        const mentioned = new Set(
          [...body.matchAll(/`([A-Za-z]+)`/g)]
            .map((match) => match[1])
            .filter((name) => KNOWN_TOOL_NAMES.includes(name)),
        );

        for (const name of mentioned) {
          expect(tools.has(name), `${slug}.md names \`${name}\` but tools: omits it`).toBe(true);
        }
      });

      if (DELEGATING_AGENTS.includes(slug)) {
        it('allowlist includes both Agent and Task (FR-HM14)', () => {
          const tools = toolsAllowlist(block)!;
          expect(tools).toContain('Agent');
          expect(tools).toContain('Task');
        });
      }
    }

    it("wrapper description equals this agent's frontmatter description", () => {
      const description = extractFrontmatterDescription(content);
      expect(wrapperDescription(readSkill(slug))).toBe(description);
    });
  });

  it('Task 30: EXPECTED_EFFORT keys are all real agent slugs (typo guard)', () => {
    for (const slug of Object.keys(EXPECTED_EFFORT)) {
      expect(agentSlugs, `EXPECTED_EFFORT names "${slug}" but no such agent file exists`).toContain(slug);
    }
  });

  it('Task 30: exactly 13 agents carry an effort: key, and every one is Haiku-free', () => {
    const withEffort = agentSlugs.filter((slug) => {
      const block = frontmatterBlock(readAgent(slug));
      return effortValue(block) !== undefined;
    });
    expect(withEffort.sort()).toEqual(Object.keys(EXPECTED_EFFORT).sort());
    for (const slug of withEffort) {
      const block = frontmatterBlock(readAgent(slug));
      expect(modelValue(block)).not.toBe('haiku');
    }
  });

  it('never gives a canonical command definition a frontmatter description: key (OQ-2 guard)', () => {
    const files = readdirSync(commandsRoot).filter((file) => file.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const contents = readFileSync(join(commandsRoot, file), 'utf8');
      expect(frontmatterBlock(contents)).not.toMatch(/^description:/m);
    }
  });

});

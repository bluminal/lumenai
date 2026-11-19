/**
 * multi-model-review Task 69: cursor-review-prompter.md (the thin adapter).
 *
 * The adapter delegates every CLI step to scripts/adapters/cursor-review.sh
 * (D28); this suite pins what the agent file itself must still say. The
 * byte budget, the safe-name assertion and the Permission Model markers are
 * also covered by adapter-size, external-permission-mode-key-validation
 * and external-adapter-permission-model.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const AGENT = join(ROOT, 'plugins', 'synthex', 'agents', 'cursor-review-prompter.md');

/** Tool names a host could gate; an agent body must not backtick them unless its tools: list grants them. */
const GATED_TOOL_NAMES = [
  'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Agent', 'Task', 'AskUserQuestion',
  'WebFetch', 'WebSearch', 'SendMessage', 'TaskStop', 'ListAgents',
];

describe('Task 69: cursor-review-prompter.md', () => {
  let content: string;
  let frontmatter: string;
  let body: string;
  beforeAll(() => {
    content = readFileSync(AGENT, 'utf8');
    frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] ?? '';
    body = content.replace(/^---\n[\s\S]*?\n---/, '');
  });

  const section = (heading: string) => {
    const start = content.indexOf(heading);
    const end = content.indexOf('\n## ', start + 1);
    return start === -1 ? '' : content.slice(start, end === -1 ? undefined : end);
  };

  it('exists and is at most 6,144 bytes', () => {
    expect(existsSync(AGENT)).toBe(true);
    expect(statSync(AGENT).size).toBeLessThanOrEqual(6144);
  });

  it('is Haiku-backed with no effort key and the Bash/Read/Write tools', () => {
    expect(frontmatter).toMatch(/^model: haiku$/m);
    expect(frontmatter).not.toMatch(/^effort:/m);
    expect(frontmatter).toMatch(/^tools: Bash, Read, Write$/m);
  });

  it.each([
    'CLI Presence Check',
    'Auth Check',
    'Prompt Construction',
    'CLI Invocation',
    'Output Parsing',
    'Retry-Once on Parse Failure',
    'Normalize to Canonical Envelope',
    'Return Canonical Envelope',
  ])('carries the FR-MR8 label "%s"', (label) => {
    expect(content).toContain(label);
  });

  it('Read-gates adapter-common.md, with the other-hosts and plugin-root fallback', () => {
    expect(content).toContain('Read `${CLAUDE_PLUGIN_ROOT}/docs/adapter-common.md`');
    expect(content).toMatch(/On other hosts \(Codex, Gemini CLI, OpenCode, Grok, Hermes\)/);
    expect(content).toMatch(/plugin root/i);
  });

  it('has the cursor-agent safe-name assertion between Steps 1 and 2, and says it never uses `agent`', () => {
    const s1 = content.indexOf('### 1. CLI Presence Check');
    const s2 = content.indexOf('### 2. Auth Check');
    const safe = content.indexOf('The binary name `cursor-agent` is HARDCODED');
    expect(s1).toBeGreaterThan(-1);
    expect(safe).toBeGreaterThan(s1);
    expect(safe).toBeLessThan(s2);
    expect(content).toContain('does NOT derive the binary name from any config key');
    expect(content).toContain('{codex, claude, gemini, bedrock, llm, ollama, grok, cursor, default}');
    expect(content).toContain('CWE-20');
    const never = content.indexOf('The adapter never uses `agent`');
    expect(never).toBeGreaterThan(s1);
    expect(never).toBeLessThan(s2);
  });

  describe('## Permission Model', () => {
    let pm: string;
    beforeAll(() => {
      pm = section('## Permission Model');
    });

    it('names the .cursor/cli.json deny file, --mode ask, FR-MMT21 and cli_unsupported_mode', () => {
      expect(pm.length).toBeGreaterThan(0);
      expect(pm).toContain('`.cursor/cli.json`');
      expect(pm).toContain('`--mode ask`');
      expect(pm).toContain('FR-MMT21');
      expect(pm).toContain('cli_unsupported_mode');
      expect(pm).toContain('external_permission_mode.cursor');
      expect(pm).toContain('D37');
      expect(pm).toContain('D38');
    });

    it('lists the banned approval bypasses as never used', () => {
      expect(pm).toMatch(/Never `--force`, `--yolo`, `--approve-mcps`, `--auto-review` or `--api-key`/);
    });
  });

  it('declares capability_tier text-only and says model AND family are required (D26)', () => {
    expect(content).toMatch(/capability_tier:\*\*\s*`text-only`/);
    expect(content).toMatch(/`per_reviewer\.cursor-review-prompter\.model` \(a slug, never `auto`\) AND `\.family` are required \(D26\)/);
  });

  it('says the Free plan cannot run a named model (D43)', () => {
    expect(content).toMatch(/Free plan cannot run a named model/);
    expect(content).toContain('D43');
    expect(content).toMatch(/never an Auto fallback/);
  });

  it('has the advisory slug table covering anthropic, openai, google, xai and unknown, with composer as unknown', () => {
    const rows = content.split('\n').filter((l) => /^\| `[a-z]+` \|/.test(l));
    const fam = (f: string) => rows.find((r) => r.startsWith(`| \`${f}\` |`)) ?? '';
    for (const f of ['anthropic', 'openai', 'google', 'xai', 'unknown']) expect(fam(f), f).not.toBe('');
    expect(fam('unknown')).toContain('composer');
    for (const f of ['anthropic', 'openai', 'google', 'xai']) expect(fam(f), f).not.toContain('composer');
    expect(content).not.toMatch(/\| `auto/);
  });

  it('has the install one-liner', () => {
    expect(content).toContain('curl https://cursor.com/install -fsS | bash');
  });

  it('runs the runner in one line from the literal input-envelope path, plus --auth-check', () => {
    expect(content).toContain(
      '"${CLAUDE_PLUGIN_ROOT}/scripts/adapters/cursor-review.sh" --input .synthex/tmp/cursor-review-prompter-<uuid>.input.json',
    );
    expect(content).toContain('"${CLAUDE_PLUGIN_ROOT}/scripts/adapters/cursor-review.sh" --auth-check');
    expect(content).toMatch(/0 = logged in, 10 = binary missing, 11 = not authenticated, 12 = /);
    expect(content).toContain('cursor-agent status --format json');
  });

  it('says the prompt goes on stdin with the --- ROLE --- judge_mode_prompt prefix (D31, D39)', () => {
    expect(content).toMatch(/pipes the prompt to stdin \(D39/);
    expect(content).toContain('`--- ROLE ---`');
    expect(content).toContain('judge_mode_prompt');
  });

  it('has Known Gotchas and Source Authority sections', () => {
    expect(content).toMatch(/^## Known Gotchas$/m);
    expect(content).toMatch(/^## Source Authority$/m);
    expect(section('## Source Authority')).toMatch(/D37–D43/);
  });

  it('Known Gotchas carry the D41 hooks, the D42 cleanup and the D43 Free plan', () => {
    const g = section('## Known Gotchas');
    expect(g).toMatch(/apparently including Claude Code hooks, fire once per review/);
    expect(g).toContain('D41');
    expect(g).toMatch(/deletes its run's `projects` and `chats` entries/);
    expect(g).toContain('D42');
    expect(g).toContain('D43');
  });

  it('auth remediation says cursor-agent login', () => {
    expect(content).toContain('cursor-agent login');
  });

  it('does not backtick a gated tool name', () => {
    for (const tool of GATED_TOOL_NAMES) {
      expect(body, tool).not.toContain(`\`${tool}\``);
    }
  });
});

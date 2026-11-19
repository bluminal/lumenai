/**
 * multi-model-review Task 68: grok-review-prompter.md (the thin adapter).
 *
 * The adapter delegates every CLI step to scripts/adapters/grok-review.sh
 * (D28); this suite pins what the agent file itself must still say. The
 * byte budget, the safe-name assertion and the Permission Model markers are
 * also covered by adapter-size, external-permission-mode-key-validation
 * and external-adapter-permission-model.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const AGENT = join(ROOT, 'plugins', 'synthex', 'agents', 'grok-review-prompter.md');
const LOGIN_HELP = join(ROOT, 'tests', 'fixtures', 'multi-model-review', 'adapters', 'grok', 'cli-help', 'grok-login.txt');

/** Tool names a host could gate; an agent body must not backtick them unless its tools: list grants them. */
const GATED_TOOL_NAMES = [
  'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Agent', 'Task', 'AskUserQuestion',
  'WebFetch', 'WebSearch', 'SendMessage', 'TaskStop', 'ListAgents',
];

describe('Task 68: grok-review-prompter.md', () => {
  let content: string;
  let frontmatter: string;
  beforeAll(() => {
    content = readFileSync(AGENT, 'utf8');
    frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] ?? '';
  });

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
    expect(content).toMatch(/other hosts/i);
    expect(content).toMatch(/plugin root/i);
  });

  it('has the grok safe-name assertion between Steps 1 and 2', () => {
    const s1 = content.indexOf('### 1. CLI Presence Check');
    const s2 = content.indexOf('### 2. Auth Check');
    const safe = content.indexOf('The binary name `grok` is HARDCODED');
    expect(s1).toBeGreaterThan(-1);
    expect(safe).toBeGreaterThan(s1);
    expect(safe).toBeLessThan(s2);
    expect(content).toContain('does NOT derive the binary name from any config key');
    expect(content).toContain('{codex, claude, gemini, bedrock, llm, ollama, grok, cursor, default}');
    expect(content).toContain('CWE-20');
  });

  describe('## Permission Model', () => {
    let section: string;
    beforeAll(() => {
      const start = content.indexOf('## Permission Model');
      const end = content.indexOf('\n## ', start + 1);
      section = content.slice(start, end);
    });

    it('exists and names --deny \'*\', FR-MMT21 and cli_unsupported_mode', () => {
      expect(section.length).toBeGreaterThan(0);
      expect(section).toContain("--deny '*'");
      expect(section).toContain("--deny 'mcp__*'");
      expect(section).toContain('FR-MMT21');
      expect(section).toContain('cli_unsupported_mode');
      expect(section).toContain('external_permission_mode.grok');
    });

    it('names the D25 tool-removal set and the D34 sandbox, and no approval bypass as allowed', () => {
      for (const f of ['--disallowed-tools', '--permission-mode dontAsk', '--no-subagents', '--disable-web-search', '--max-turns 3', '--sandbox read-only']) {
        expect(section, f).toContain(f);
      }
      expect(section).toMatch(/Never `--yolo`, `--always-approve`, `bypassPermissions` or `--trust`/);
    });
  });

  it('declares capability_tier text-only and default family xai', () => {
    expect(content).toMatch(/capability_tier:\*\*\s*`text-only`/);
    expect(content).toMatch(/default family: `xai`/);
  });

  it('has the install one-liner', () => {
    expect(content).toContain('curl -fsSL https://x.ai/cli/install.sh | bash');
  });

  it('runs the runner in one line from the literal input-envelope path, plus --auth-check', () => {
    expect(content).toContain(
      '"${CLAUDE_PLUGIN_ROOT}/scripts/adapters/grok-review.sh" --input .synthex/tmp/grok-review-prompter-<uuid>.input.json',
    );
    expect(content).toContain('"${CLAUDE_PLUGIN_ROOT}/scripts/adapters/grok-review.sh" --auth-check');
    expect(content).toMatch(/0 = grok\.com session, 10 = binary missing, 11 = not authenticated, 12 = only `XAI_API_KEY`/);
  });

  it('says judge_mode_prompt goes through --rules (D31) and the schema through --json-schema (D33)', () => {
    expect(content).toMatch(/judge_mode_prompt`? via `--rules`/);
    expect(content).toContain('--json-schema');
    expect(content).toContain('codex-findings.schema.json');
  });

  it('has Known Gotchas and Source Authority sections', () => {
    expect(content).toMatch(/^## Known Gotchas$/m);
    expect(content).toMatch(/^## Source Authority$/m);
  });

  it('Known Gotchas carry the D35 user-hooks residual', () => {
    const gotchas = content.slice(content.indexOf('## Known Gotchas'), content.indexOf('## Source Authority'));
    expect(gotchas).toContain('`$GROK_HOME/hooks`');
    expect(gotchas).toMatch(/plugins installed there/);
    expect(gotchas).toMatch(/fire once per review/);
    expect(gotchas).toContain('D35');
  });

  it('auth remediation says grok login, and cites --device-auth only with a captured grok login --help fixture', () => {
    expect(content).toContain('grok login');
    if (!existsSync(LOGIN_HELP)) expect(content).not.toContain('--device-auth');
  });

  it('does not backtick a gated tool name', () => {
    const body = content.replace(/^---\n[\s\S]*?\n---/, '');
    for (const tool of GATED_TOOL_NAMES) {
      expect(body, tool).not.toContain(`\`${tool}\``);
    }
  });
});

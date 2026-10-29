import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AGENT = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents', 'codex-review-prompter.md');

describe('Task 9: codex-review-prompter.md', () => {
  let content: string;
  beforeAll(() => { content = readFileSync(AGENT, 'utf8'); });

  it('file exists', () => expect(existsSync(AGENT)).toBe(true));
  it('declares Haiku model', () => expect(content).toMatch(/^---[\s\S]*?model:\s*haiku[\s\S]*?---/));

  describe('FR-MR8 8 responsibilities (acceptance criterion 1)', () => {
    it.each([
      [1, 'CLI Presence Check'],
      [2, 'Auth Check'],
      [3, 'Prompt Construction'],
      [4, 'CLI Invocation'],
      [5, 'Output Parsing'],
      [6, 'Retry-Once on Parse Failure'],
      [7, 'Normalize to Canonical Envelope'],
      [8, 'Return Canonical Envelope'],
    ])('responsibility %i: %s', (_n, label) => {
      expect(content).toContain(label);
    });
  });

  describe('Tier and family declarations (acceptance criterion 2)', () => {
    it('capability_tier: agentic', () => expect(content).toMatch(/capability_tier.*agentic/));
    it('family: openai', () => expect(content).toMatch(/family.*openai/));
  });

  describe('Sandbox flags per FR-MR26 (acceptance criterion 3)', () => {
    it('contains --sandbox read-only', () => expect(content).toContain('--sandbox read-only'));
    // Was: contains --approval-mode never. Codex CLI 0.160.0 evidence (tests/fixtures/cli-help/codex/): `codex exec` has no --approval-mode flag and rejects -a/--ask-for-approval; it never prompts.
    // The read-only guarantee is --sandbox read-only; --ephemeral leaves no persisted session.
    it('does not pass the nonexistent --approval-mode never to codex exec', () => expect(content).not.toContain('--approval-mode never'));
    it('contains --ephemeral', () => expect(content).toContain('--ephemeral'));
    it('passes the strict codex-findings schema via --output-schema', () => expect(content).toMatch(/--output-schema\s+\S*codex-findings\.schema\.json/));
    it('contains --json', () => expect(content).toContain('--json'));
    it('references FR-MR26', () => expect(content).toContain('FR-MR26'));
  });

  describe('Install one-liner is single shell command [H]', () => {
    it('contains npm install one-liner', () => expect(content).toMatch(/npm install -g @openai\/codex/));
  });

  describe('error_code enum coverage (FR-MR16)', () => {
    it.each(['cli_missing', 'cli_auth_failed', 'parse_failed'])('mentions error_code: %s', (code) => {
      expect(content).toContain(code);
    });
  });

  describe('Source authority cross-references', () => {
    it.each(['FR-MR8', 'FR-MR9', 'FR-MR10', 'FR-MR16', 'FR-MR26', 'D3', 'NFR-MR4'])('references %s', (ref) => {
      expect(content).toContain(ref);
    });
  });

  it('install one-liner present (acceptance criterion 4 - [H])', () => {
    expect(content).toMatch(/Install One-Liner/);
  });

  it('auth setup pointer present (codex login)', () => {
    expect(content).toContain('codex login');
  });

  // `codex auth status` does not exist ("unrecognized subcommand 'status'"); the real check is
  // `codex login status` (exit 0 + "Logged in using ...", no model call) — Codex CLI 0.160.0.
  it('auth check uses codex login status, never the nonexistent codex auth status', () => {
    expect(content).toContain('codex login status');
    expect(content).not.toContain('codex auth status');
  });

  it('known gotchas section present', () => {
    expect(content).toContain('Known Gotchas');
  });

  // Task 80 originally pinned a Pattern 3 flow built on a bare JSON-RPC `requestApproval`
  // method, a terminal `result` message and a `codex app-server --help` exit-status fallback.
  // None of that matches Codex CLI 0.160.0: the app-server protocol
  // (`codex app-server generate-json-schema`) has initialize / thread/start / turn/start and
  // item/*/requestApproval, and `codex app-server --help` exits 0, so the fallback never fired
  // and the default config never reached `codex exec`. Until Pattern 3 is rebuilt on the real
  // protocol, parent-mediated runs Pattern 1 with one WARN line.
  describe('Task 80: ADR-003 parent-mediated default runs Pattern 1 until Pattern 3 is implemented', () => {
    const permissionSection = () => content.split('## Permission Model')[1]?.split('\n## ')[0] ?? '';

    it('[T] documents parent-mediated as the default mode', () => {
      expect(permissionSection()).toMatch(/`parent-mediated` \(default\)/);
    });

    it('parent-mediated runs Pattern 1 and logs one WARN line', () => {
      const row = permissionSection().split('\n').find((l) => l.startsWith('| `parent-mediated`')) ?? '';
      expect(row).toContain('Pattern 1');
      expect(row).toMatch(/WARN/);
      expect(row).not.toMatch(/Pattern 3 —/);
    });

    it('states Pattern 3 is not implemented and names the real app-server protocol', () => {
      expect(content).toMatch(/Pattern 3 is not implemented/);
      expect(content).toContain('codex app-server');
      for (const method of ['initialize', 'thread/start', 'turn/start', 'item/*/requestApproval']) {
        expect(content).toContain(method);
      }
    });

    it('does not document the nonexistent bare requestApproval method or terminal result message', () => {
      expect(content).not.toContain('"method":"requestApproval"');
      expect(content).not.toMatch(/terminal `result` message/);
      expect(content).not.toContain('codex-approval-request');
    });

    it('does not choose the pattern from `codex app-server --help` exit status (it exits 0)', () => {
      expect(content).not.toMatch(/if `codex app-server --help` exits non-zero/);
      expect(content).not.toContain('Cache the `codex app-server --help` probe result');
    });

    it('[T] references ADR-003 and FR-MMT21', () => {
      expect(content).toContain('ADR-003');
      expect(content).toContain('FR-MMT21');
    });

    it('[T] references the external_permission_mode config key', () => {
      expect(content).toContain('multi_model_review.external_permission_mode');
    });

    it('Pattern 2 (sandbox-yolo) wraps the Step 4 codex exec command, not a bare `codex exec --json <prompt>`', () => {
      expect(content).not.toContain('codex exec --json <prompt>');
      expect(content).toMatch(/sandbox-exec [^\n]*codex exec --sandbox danger-full-access/);
      expect(content).toMatch(/Patterns 1 and 2/);
    });

    it('preserves Pattern 1 (FR-MR26) sandbox flags as fallback path', () => {
      // Pattern 1 must remain documented (it's the fallback)
      expect(content).toContain('--sandbox read-only');
      // Was: toContain('--approval-mode never'). Codex CLI 0.160.0 evidence (tests/fixtures/cli-help/codex/): `codex exec` has no --approval-mode flag and rejects -a/--ask-for-approval; it never prompts.
      expect(content).not.toContain('--approval-mode never');
    });
  });
});

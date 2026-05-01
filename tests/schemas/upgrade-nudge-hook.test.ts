/**
 * Layer 1: Structural tests for the upgrade-nudge SessionStart hook
 * registrations + script artifacts in both plugins.
 *
 * Task 21 acceptance criteria:
 *   - both hooks.json files declare SessionStart pointing at upgrade-nudge.sh
 *   - the referenced scripts exist
 *   - the scripts are executable (chmod +x)
 *
 * Plan: docs/plans/upgrade-onboarding.md Task 21.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const variants = [
  {
    label: 'synthex',
    pluginDir: join(REPO_ROOT, 'plugins', 'synthex'),
    hookEvent: 'SessionStart',
    scriptRelPath: './scripts/upgrade-nudge.sh',
  },
  {
    label: 'synthex-plus',
    pluginDir: join(REPO_ROOT, 'plugins', 'synthex-plus'),
    hookEvent: 'SessionStart',
    scriptRelPath: './scripts/upgrade-nudge.sh',
  },
] as const;

describe.each(variants)(
  'upgrade-nudge hook ($label) — Task 21 structural validation',
  ({ pluginDir, hookEvent, scriptRelPath }) => {
    const hooksJsonPath = join(pluginDir, 'hooks', 'hooks.json');
    const scriptPath = join(pluginDir, 'scripts', 'upgrade-nudge.sh');

    let hooksJson: any;

    beforeAll(() => {
      const raw = readFileSync(hooksJsonPath, 'utf-8');
      hooksJson = JSON.parse(raw);
    });

    describe('hooks.json structure', () => {
      it('parses as JSON', () => {
        expect(hooksJson).toBeTruthy();
        expect(hooksJson.hooks).toBeTruthy();
      });

      it(`declares ${hookEvent} array`, () => {
        expect(Array.isArray(hooksJson.hooks[hookEvent])).toBe(true);
        expect(hooksJson.hooks[hookEvent].length).toBeGreaterThan(0);
      });

      it(`${hookEvent} entry has hooks[].command pointing at ${scriptRelPath}`, () => {
        const sessionStart = hooksJson.hooks[hookEvent];
        const inner = sessionStart[0]?.hooks?.[0];
        expect(inner).toBeTruthy();
        expect(inner.type).toBe('command');
        expect(inner.command).toBe(scriptRelPath);
      });
    });

    describe('Script artifact', () => {
      it('script file exists at the referenced path', () => {
        expect(existsSync(scriptPath)).toBe(true);
      });

      it('script is executable (chmod +x)', () => {
        const mode = statSync(scriptPath).mode;
        // Check that any of user/group/other execute bit is set.
        // 0o111 = --x--x--x; mode & 0o111 should be non-zero if any execute bit is set.
        expect(mode & 0o111).toBeGreaterThan(0);
      });

      it('script has a #!/usr/bin/env sh shebang (POSIX-sh per D-UO11)', () => {
        const head = readFileSync(scriptPath, 'utf-8').split('\n')[0];
        expect(head).toMatch(/^#!\/usr\/bin\/env\s+sh\s*$/);
      });

      it('script ends every branch with exit 0 (FR-UO21 — never blocks)', () => {
        const content = readFileSync(scriptPath, 'utf-8');
        // Must contain at least one explicit exit 0; no exit N for N>0.
        expect(content).toMatch(/\bexit\s+0\b/);
        // Forbid exit 1, exit 2, etc.
        const nonZeroExits = content.match(/\bexit\s+[1-9][0-9]*\b/g) || [];
        expect(nonZeroExits.length).toBe(0);
      });

      it('script uses sort -V for version comparison (D-UO12)', () => {
        const content = readFileSync(scriptPath, 'utf-8');
        expect(content).toContain('sort -V');
      });
    });
  }
);

describe('synthex-plus hooks.json — TaskCompleted + TeammateIdle preserved', () => {
  it('preserves TaskCompleted and TeammateIdle alongside SessionStart (Task 14)', () => {
    const path = join(
      REPO_ROOT,
      'plugins',
      'synthex-plus',
      'hooks',
      'hooks.json'
    );
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(json.hooks.TaskCompleted).toBeTruthy();
    expect(json.hooks.TeammateIdle).toBeTruthy();
    expect(json.hooks.SessionStart).toBeTruthy();
    // Ensure existing TaskCompleted/TeammateIdle commands haven't drifted.
    expect(json.hooks.TaskCompleted[0].hooks[0].command).toBe(
      './scripts/task-completed-gate.sh'
    );
    expect(json.hooks.TeammateIdle[0].hooks[0].command).toBe(
      './scripts/teammate-idle-gate.sh'
    );
  });
});

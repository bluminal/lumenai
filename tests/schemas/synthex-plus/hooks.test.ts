/**
 * Layer 1: Schema validation tests for Synthex+ hooks infrastructure.
 *
 * Validates hooks.json structure, script file constraints, and companion
 * documentation existence. Runs against inline samples and the actual
 * plugin files on disk.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, chmodSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { validateHooks, validateHookScript } from './hooks.js';

// ── Paths to real plugin files ───────────────────────────────────

const PLUGIN_ROOT = join(import.meta.dirname, '..', '..', '..', 'plugins', 'synthex-plus');
const HOOKS_DIR = join(PLUGIN_ROOT, 'hooks');
const HOOKS_JSON_PATH = join(HOOKS_DIR, 'hooks.json');
const SCRIPTS_DIR = join(PLUGIN_ROOT, 'scripts');

// ── Inline sample: valid hooks.json ──────────────────────────────

const VALID_HOOKS_JSON = JSON.stringify({
  hooks: [
    {
      event: 'TaskCompleted',
      command: './scripts/task-completed-gate.sh',
      description: 'Review gate: triggers quality review on completed tasks.',
    },
    {
      event: 'TeammateIdle',
      command: './scripts/teammate-idle-gate.sh',
      description: 'Work assignment: assigns pending tasks to idle teammates.',
    },
  ],
}, null, 2);

// ── Helper: create a temp directory with controlled files ────────

function createTempHookEnv(opts: {
  hooksJson?: string;
  scripts?: Array<{ name: string; content: string; mode?: number }>;
  companionDocs?: string[];
}): string {
  const dir = join(tmpdir(), `hooks-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'hooks'), { recursive: true });

  if (opts.hooksJson) {
    writeFileSync(join(dir, 'hooks', 'hooks.json'), opts.hooksJson);
  }

  for (const script of opts.scripts ?? []) {
    const scriptPath = join(dir, 'scripts', script.name);
    writeFileSync(scriptPath, script.content);
    if (script.mode !== undefined) {
      chmodSync(scriptPath, script.mode);
    }
  }

  for (const doc of opts.companionDocs ?? []) {
    writeFileSync(join(dir, 'hooks', doc), '# Companion doc\n');
  }

  return dir;
}

function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

// ── Tests: hooks.json Structure ──────────────────────────────────

describe('Hooks Schema — JSON Structure', () => {
  it('rejects invalid JSON', () => {
    const result = validateHooks('not json at all {{{', '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Invalid JSON');
  });

  it('rejects non-object root', () => {
    const result = validateHooks('"just a string"', '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Root must be a JSON object');
  });

  it('rejects array root', () => {
    const result = validateHooks('[]', '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Root must be a JSON object');
  });

  it('rejects missing hooks array', () => {
    const result = validateHooks('{"other": "stuff"}', '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required "hooks" array');
  });

  it('rejects non-array hooks field', () => {
    const result = validateHooks('{"hooks": "not-an-array"}', '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('"hooks" must be an array');
  });

  it('warns on empty hooks array', () => {
    const result = validateHooks('{"hooks": []}', '/tmp');
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain('"hooks" array is empty');
  });
});

// ── Tests: Hook Entry Validation ─────────────────────────────────

describe('Hooks Schema — Hook Entry Validation', () => {
  it('rejects non-object entries', () => {
    const result = validateHooks('{"hooks": ["not-an-object"]}', '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must be an object');
  });

  it('rejects entries missing required fields', () => {
    const result = validateHooks('{"hooks": [{}]}', '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('missing required field "event"'),
        expect.stringContaining('missing required field "command"'),
        expect.stringContaining('missing required field "description"'),
      ])
    );
  });

  it('rejects non-string field values', () => {
    const json = JSON.stringify({
      hooks: [{ event: 123, command: true, description: null }],
    });
    const result = validateHooks(json, '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('event: must be a string'),
        expect.stringContaining('command: must be a string'),
        expect.stringContaining('description: must be a string'),
      ])
    );
  });

  it('rejects empty string field values', () => {
    const json = JSON.stringify({
      hooks: [{ event: '', command: '  ', description: '' }],
    });
    const result = validateHooks(json, '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('event: must not be empty'),
        expect.stringContaining('command: must not be empty'),
        expect.stringContaining('description: must not be empty'),
      ])
    );
  });

  it('rejects invalid event names', () => {
    const json = JSON.stringify({
      hooks: [{ event: 'InvalidEvent', command: './scripts/test.sh', description: 'Test' }],
    });
    const result = validateHooks(json, '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"InvalidEvent" is not a valid event');
    expect(result.errors[0]).toContain('TaskCompleted');
    expect(result.errors[0]).toContain('TeammateIdle');
  });

  it('accepts TaskCompleted as a valid event', () => {
    const dir = createTempHookEnv({
      scripts: [
        { name: 'test.sh', content: '#!/usr/bin/env bash\nexit 0\n', mode: 0o755 },
      ],
      companionDocs: ['test.md'],
    });
    try {
      const json = JSON.stringify({
        hooks: [{ event: 'TaskCompleted', command: './scripts/test.sh', description: 'Test' }],
      });
      const result = validateHooks(json, dir);
      expect(result.errors.filter(e => e.includes('not a valid event'))).toHaveLength(0);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('accepts TeammateIdle as a valid event', () => {
    const dir = createTempHookEnv({
      scripts: [
        { name: 'test.sh', content: '#!/usr/bin/env bash\nexit 0\n', mode: 0o755 },
      ],
      companionDocs: ['test.md'],
    });
    try {
      const json = JSON.stringify({
        hooks: [{ event: 'TeammateIdle', command: './scripts/test.sh', description: 'Test' }],
      });
      const result = validateHooks(json, dir);
      expect(result.errors.filter(e => e.includes('not a valid event'))).toHaveLength(0);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('rejects non-relative command paths', () => {
    const json = JSON.stringify({
      hooks: [{ event: 'TaskCompleted', command: '/absolute/path.sh', description: 'Test' }],
    });
    const result = validateHooks(json, '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must be a relative path starting with "./"'),
      ])
    );
  });

  it('rejects command paths without ./ prefix', () => {
    const json = JSON.stringify({
      hooks: [{ event: 'TaskCompleted', command: 'scripts/test.sh', description: 'Test' }],
    });
    const result = validateHooks(json, '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must be a relative path starting with "./"'),
      ])
    );
  });
});

// ── Tests: Script File Existence and Permissions ─────────────────

describe('Hooks Schema — Script File Validation', () => {
  it('reports error when referenced script does not exist', () => {
    const json = JSON.stringify({
      hooks: [{ event: 'TaskCompleted', command: './scripts/nonexistent.sh', description: 'Test' }],
    });
    const result = validateHooks(json, '/tmp');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('script file not found'),
      ])
    );
  });

  it('reports error for non-executable script', () => {
    const dir = createTempHookEnv({
      scripts: [
        { name: 'test.sh', content: '#!/usr/bin/env bash\nexit 0\n', mode: 0o644 },
      ],
      companionDocs: ['test.md'],
    });
    try {
      const json = JSON.stringify({
        hooks: [{ event: 'TaskCompleted', command: './scripts/test.sh', description: 'Test' }],
      });
      const result = validateHooks(json, dir);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('not executable'),
        ])
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('reports error for script missing shebang', () => {
    const dir = createTempHookEnv({
      scripts: [
        { name: 'test.sh', content: 'echo "no shebang"\nexit 0\n', mode: 0o755 },
      ],
      companionDocs: ['test.md'],
    });
    try {
      const json = JSON.stringify({
        hooks: [{ event: 'TaskCompleted', command: './scripts/test.sh', description: 'Test' }],
      });
      const result = validateHooks(json, dir);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('missing shebang'),
        ])
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('reports error for empty script file', () => {
    const dir = createTempHookEnv({
      scripts: [
        { name: 'test.sh', content: '', mode: 0o755 },
      ],
      companionDocs: ['test.md'],
    });
    try {
      const json = JSON.stringify({
        hooks: [{ event: 'TaskCompleted', command: './scripts/test.sh', description: 'Test' }],
      });
      const result = validateHooks(json, dir);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('empty'),
        ])
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('warns when script exceeds 20-line thin shim guideline', () => {
    const longScript = '#!/usr/bin/env bash\n' + Array(25).fill('echo "line"').join('\n') + '\nexit 0\n';
    const dir = createTempHookEnv({
      scripts: [
        { name: 'test.sh', content: longScript, mode: 0o755 },
      ],
      companionDocs: ['test.md'],
    });
    try {
      const json = JSON.stringify({
        hooks: [{ event: 'TaskCompleted', command: './scripts/test.sh', description: 'Test' }],
      });
      const result = validateHooks(json, dir);
      // Long scripts produce a warning, not an error
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('exceeding the 20-line'),
        ])
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('accepts a valid executable script with shebang under 20 lines', () => {
    const dir = createTempHookEnv({
      scripts: [
        { name: 'test.sh', content: '#!/usr/bin/env bash\n# Comment\nexit 0\n', mode: 0o755 },
      ],
      companionDocs: ['test.md'],
    });
    try {
      const scriptPath = join(dir, 'scripts', 'test.sh');
      const result = validateHookScript(scriptPath);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── Tests: validateHookScript standalone ─────────────────────────

describe('Hooks Schema — validateHookScript', () => {
  it('reports error for nonexistent file', () => {
    const result = validateHookScript('/tmp/does-not-exist-ever.sh');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Script file not found');
  });

  it('validates a proper shell script', () => {
    const dir = createTempHookEnv({
      scripts: [
        {
          name: 'good.sh',
          content: '#!/usr/bin/env bash\n# Good script\nexit 0\n',
          mode: 0o755,
        },
      ],
    });
    try {
      const result = validateHookScript(join(dir, 'scripts', 'good.sh'));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('accepts scripts at exactly 20 lines', () => {
    const lines = ['#!/usr/bin/env bash'];
    for (let i = 0; i < 18; i++) {
      lines.push(`# line ${i + 2}`);
    }
    lines.push('exit 0');
    // 20 significant lines total
    const content = lines.join('\n') + '\n';

    const dir = createTempHookEnv({
      scripts: [{ name: 'exact.sh', content, mode: 0o755 }],
    });
    try {
      const result = validateHookScript(join(dir, 'scripts', 'exact.sh'));
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('warns at 21 lines', () => {
    const lines = ['#!/usr/bin/env bash'];
    for (let i = 0; i < 19; i++) {
      lines.push(`# line ${i + 2}`);
    }
    lines.push('exit 0');
    // 21 significant lines
    const content = lines.join('\n') + '\n';

    const dir = createTempHookEnv({
      scripts: [{ name: 'long.sh', content, mode: 0o755 }],
    });
    try {
      const result = validateHookScript(join(dir, 'scripts', 'long.sh'));
      expect(result.valid).toBe(true); // warnings don't affect validity
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('21 lines');
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── Tests: Companion Markdown Documentation ──────────────────────

describe('Hooks Schema — Companion Markdown Docs', () => {
  it('warns when companion markdown doc is missing', () => {
    const dir = createTempHookEnv({
      scripts: [
        { name: 'task-completed-gate.sh', content: '#!/usr/bin/env bash\nexit 0\n', mode: 0o755 },
      ],
      companionDocs: [], // no companion docs
    });
    try {
      const json = JSON.stringify({
        hooks: [{
          event: 'TaskCompleted',
          command: './scripts/task-completed-gate.sh',
          description: 'Test',
        }],
      });
      const result = validateHooks(json, dir);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('companion markdown doc not found'),
          expect.stringContaining('task-completed-gate.md'),
        ])
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('does not warn when companion markdown doc exists', () => {
    const dir = createTempHookEnv({
      scripts: [
        { name: 'task-completed-gate.sh', content: '#!/usr/bin/env bash\nexit 0\n', mode: 0o755 },
      ],
      companionDocs: ['task-completed-gate.md'],
    });
    try {
      const json = JSON.stringify({
        hooks: [{
          event: 'TaskCompleted',
          command: './scripts/task-completed-gate.sh',
          description: 'Test',
        }],
      });
      const result = validateHooks(json, dir);
      const companionWarnings = result.warnings.filter(w => w.includes('companion'));
      expect(companionWarnings).toHaveLength(0);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ── Tests: Full Valid Configuration ──────────────────────────────

describe('Hooks Schema — Full Valid Configuration', () => {
  it('validates a complete valid hooks setup with no errors', () => {
    const dir = createTempHookEnv({
      scripts: [
        {
          name: 'task-completed-gate.sh',
          content: [
            '#!/usr/bin/env bash',
            '# task-completed-gate.sh -- Review gate for TaskCompleted hook events',
            '#',
            '# Exit codes:',
            '#   0 = allow completion',
            '#   2 = block completion',
            '',
            'exit 0',
          ].join('\n') + '\n',
          mode: 0o755,
        },
        {
          name: 'teammate-idle-gate.sh',
          content: [
            '#!/usr/bin/env bash',
            '# teammate-idle-gate.sh -- Work assignment for TeammateIdle hook events',
            '#',
            '# Exit codes:',
            '#   0 = allow idle',
            '#   2 = keep working',
            '',
            'exit 0',
          ].join('\n') + '\n',
          mode: 0o755,
        },
      ],
      companionDocs: ['task-completed-gate.md', 'teammate-idle-gate.md'],
    });

    try {
      const json = JSON.stringify({
        hooks: [
          {
            event: 'TaskCompleted',
            command: './scripts/task-completed-gate.sh',
            description: 'Review gate: triggers quality review on completed tasks.',
          },
          {
            event: 'TeammateIdle',
            command: './scripts/teammate-idle-gate.sh',
            description: 'Work assignment: assigns pending tasks to idle teammates.',
          },
        ],
      }, null, 2);

      const result = validateHooks(json, dir);
      expect(result.errors, `Unexpected errors:\n${result.errors.join('\n')}`).toHaveLength(0);
      expect(result.valid).toBe(true);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('reports multiple errors for a thoroughly invalid config', () => {
    const json = JSON.stringify({
      hooks: [
        { event: 'BadEvent', command: '/absolute/path.sh', description: '' },
        { event: 123 },
        'not-an-object',
      ],
    });
    const result = validateHooks(json, '/tmp');
    expect(result.valid).toBe(false);
    // Should have errors for: invalid event, absolute path, empty description,
    // non-string event, missing fields, non-object entry
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });
});

// ── Tests: Real Plugin Files (integration) ───────────────────────

describe('Hooks Schema — Real Plugin Validation', () => {
  const hasPluginFiles = existsSync(HOOKS_JSON_PATH);

  describe.runIf(hasPluginFiles)('plugins/synthex-plus/hooks/hooks.json', () => {
    it('exists and is valid JSON', () => {
      const text = readFileSync(HOOKS_JSON_PATH, 'utf-8');
      expect(() => JSON.parse(text)).not.toThrow();
    });

    it('passes full hooks schema validation', () => {
      const text = readFileSync(HOOKS_JSON_PATH, 'utf-8');
      const result = validateHooks(text, PLUGIN_ROOT);
      expect(result.errors, `Validation errors:\n${result.errors.join('\n')}`).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    it('contains exactly 2 hooks (TaskCompleted and TeammateIdle)', () => {
      const text = readFileSync(HOOKS_JSON_PATH, 'utf-8');
      const parsed = JSON.parse(text);
      expect(parsed.hooks).toHaveLength(2);
      const events = parsed.hooks.map((h: { event: string }) => h.event).sort();
      expect(events).toEqual(['TaskCompleted', 'TeammateIdle']);
    });

    it('references scripts that exist on disk', () => {
      const text = readFileSync(HOOKS_JSON_PATH, 'utf-8');
      const parsed = JSON.parse(text);
      for (const hook of parsed.hooks) {
        const scriptPath = join(PLUGIN_ROOT, hook.command);
        expect(existsSync(scriptPath), `Script not found: ${scriptPath}`).toBe(true);
      }
    });

    it('has companion markdown docs for all hooks', () => {
      const text = readFileSync(HOOKS_JSON_PATH, 'utf-8');
      const parsed = JSON.parse(text);
      for (const hook of parsed.hooks) {
        const scriptBasename = hook.command
          .replace('./scripts/', '')
          .replace('.sh', '');
        const docPath = join(HOOKS_DIR, `${scriptBasename}.md`);
        expect(existsSync(docPath), `Companion doc not found: ${docPath}`).toBe(true);
      }
    });
  });

  describe.runIf(existsSync(join(SCRIPTS_DIR, 'task-completed-gate.sh')))('task-completed-gate.sh', () => {
    it('passes script validation', () => {
      const result = validateHookScript(join(SCRIPTS_DIR, 'task-completed-gate.sh'));
      expect(result.errors, `Script errors:\n${result.errors.join('\n')}`).toHaveLength(0);
      expect(result.valid).toBe(true);
    });
  });

  describe.runIf(existsSync(join(SCRIPTS_DIR, 'teammate-idle-gate.sh')))('teammate-idle-gate.sh', () => {
    it('passes script validation', () => {
      const result = validateHookScript(join(SCRIPTS_DIR, 'teammate-idle-gate.sh'));
      expect(result.errors, `Script errors:\n${result.errors.join('\n')}`).toHaveLength(0);
      expect(result.valid).toBe(true);
    });
  });
});

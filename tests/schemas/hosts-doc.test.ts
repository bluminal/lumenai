/**
 * Layer 1: Task 35 (FR-HM41 headless approval modes, FR-HM18 shell caps; D9).
 *
 * host-matrix.mjs carries a `headless` block per host (approval flag, shell
 * cap, SYNTHEX_LOOP_IDLE_MAX, check-writable hint, background-poll note).
 * The generator renders it into the shared `docs/hosts.md` and the runtime
 * `config/hosts.env`, both under `--check`; `loop-step.sh check-writable`
 * reads hosts.env and prints the hint for `$SYNTHEX_HOST` (or all hints).
 *
 * Plan: docs/plans/harness-modernization.md, Phase 4 / Milestone 4.1 / Task 35.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, appendFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import {
  HOSTS,
  HOST_IDS,
  renderHostsEnv,
  renderHostsTable,
} from '../../plugins/synthex/scripts/lib/host-matrix.mjs';

const REPO_ROOT = resolve(__dirname, '..', '..');
const PLUGIN_ROOT = join(REPO_ROOT, 'plugins', 'synthex');
const GENERATOR = join(PLUGIN_ROOT, 'scripts', 'generate-codex-skills.mjs');
const LOOP_STEP = join(PLUGIN_ROOT, 'scripts', 'loop-step.sh');
const HOSTS_DOC = join(PLUGIN_ROOT, 'docs', 'hosts.md');
const HOSTS_ENV = join(PLUGIN_ROOT, 'config', 'hosts.env');

// Acceptance criteria caps: Claude 600, Gemini <= 240, Grok/OpenCode <= 90.
const IDLE_MAX_CEILINGS: Record<string, number> = {
  claude: 600,
  gemini: 240,
  grok: 90,
  opencode: 90,
};

describe('host-matrix.mjs headless block (Task 35)', () => {
  it.each(HOST_IDS)('%s has an approval flag and numeric caps', (id) => {
    const h = HOSTS[id].headless;
    expect(h, `host "${id}" has no headless block`).toBeTruthy();
    expect(typeof h.approvalFlag).toBe('string');
    expect(h.approvalFlag.length).toBeGreaterThan(0);
    expect(Number.isInteger(h.shellCapSeconds)).toBe(true);
    expect(Number.isInteger(h.idleMaxSeconds)).toBe(true);
    expect(h.idleMaxSeconds).toBeLessThan(h.shellCapSeconds + 1);
    expect(typeof h.writabilityHint).toBe('string');
    expect(h.writabilityHint.length).toBeGreaterThan(0);
  });

  it('caps: Claude 600, Gemini <= 240, Grok and OpenCode <= 90', () => {
    expect(HOSTS.claude.headless.shellCapSeconds).toBe(600);
    for (const [id, ceiling] of Object.entries(IDLE_MAX_CEILINGS)) {
      expect(
        HOSTS[id].headless.idleMaxSeconds,
        `${id} SYNTHEX_LOOP_IDLE_MAX exceeds ${ceiling}`,
      ).toBeLessThanOrEqual(ceiling);
    }
  });

  it('Grok carries background-poll guidance; the others use the in-turn wait', () => {
    expect(HOSTS.grok.headless.backgroundPoll).toMatch(/background: true/);
    expect(HOSTS.grok.headless.backgroundPoll).toMatch(/get_command_or_subagent_output/);
    for (const id of HOST_IDS.filter((x) => x !== 'grok')) {
      expect(HOSTS[id].headless.backgroundPoll).toBeNull();
    }
  });

  it('headless strings contain no tabs or newlines (hosts.env is tab-separated)', () => {
    for (const id of HOST_IDS) {
      for (const v of Object.values(HOSTS[id].headless)) {
        if (typeof v === 'string') expect(v).not.toMatch(/[\t\n]/);
      }
    }
  });
});

describe('generated docs/hosts.md and config/hosts.env', () => {
  it('docs/hosts.md contains the rendered table with every host row', () => {
    const doc = readFileSync(HOSTS_DOC, 'utf-8');
    expect(doc).toContain(renderHostsTable());
    for (const id of HOST_IDS) {
      expect(doc).toContain(`(\`${id}\`)`);
      expect(doc).toContain(HOSTS[id].displayName);
      expect(doc).toContain(HOSTS[id].headless.approvalFlag);
    }
  });

  it('config/hosts.env is byte-identical to renderHostsEnv() and sources cleanly under sh', () => {
    expect(readFileSync(HOSTS_ENV, 'utf-8')).toBe(renderHostsEnv());
    const r = spawnSync('sh', ['-c', `. "${HOSTS_ENV}" && printf '%s' "$SYNTHEX_HOST_GEMINI_IDLE_MAX $SYNTHEX_HOST_IDS"`], {
      encoding: 'utf-8',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`${HOSTS.gemini.headless.idleMaxSeconds} ${HOST_IDS.join(' ')}`);
  });

  it('every wrapper carries the SYNTHEX_HOST step pointing at docs/hosts.md', () => {
    const skillsRoot = join(PLUGIN_ROOT, 'portable-skills');
    const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf-8'));
    const slugs = [...manifest.commands, ...manifest.agents].map((p: string) =>
      p.replace(/^.*\//, '').replace(/\.md$/, ''),
    );
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const skill = readFileSync(join(skillsRoot, slug, 'SKILL.md'), 'utf-8');
      expect(skill, slug).toMatch(/^\d+\. Before running any `scripts\/\*\.sh`, export `SYNTHEX_HOST=<id>`/m);
      expect(skill, slug).toContain('docs/hosts.md');
    }
  });
});

describe('generator --check covers docs/hosts.md and config/hosts.env', () => {
  let copyRoot: string;
  let gen: string;

  beforeAll(() => {
    // realpath: the generator only runs main() when process.argv[1] equals
    // its own resolved import.meta.url, and macOS's tmpdir is a symlink.
    copyRoot = realpathSync(mkdtempSync(join(tmpdir(), 'synthex-hosts-check-')));
    cpSync(PLUGIN_ROOT, join(copyRoot, 'synthex'), { recursive: true });
    gen = join(copyRoot, 'synthex', 'scripts', 'generate-codex-skills.mjs');
  });

  afterAll(() => {
    rmSync(copyRoot, { recursive: true, force: true });
  });

  function check(): { status: number | null; stderr: string } {
    const r = spawnSync('node', [gen, '--check'], { encoding: 'utf-8' });
    return { status: r.status, stderr: r.stderr };
  }

  it('passes on a pristine copy', () => {
    expect(check().status).toBe(0);
  });

  it('fails and names config/hosts.env when it drifts', () => {
    appendFileSync(join(copyRoot, 'synthex', 'config', 'hosts.env'), '# drift\n');
    const r = check();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('config/hosts.env');
  });

  it('fails and names docs/hosts.md when it drifts', () => {
    appendFileSync(join(copyRoot, 'synthex', 'docs', 'hosts.md'), 'drift\n');
    const r = check();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('docs/hosts.md');
  });
});

describe('loop-step.sh check-writable prints the host hint (FR-HM41)', () => {
  let dir: string;
  let roDir: string;
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'check-writable-'));
    roDir = join(dir, 'ro');
    mkdirSync(roDir);
    chmodSync(roDir, 0o555);
  });

  afterAll(() => {
    chmodSync(roDir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  });

  function run(env: Record<string, string>) {
    return spawnSync('bash', [LOOP_STEP, 'check-writable', roDir], {
      encoding: 'utf-8',
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env },
    });
  }

  it.skipIf(isRoot)('with SYNTHEX_HOST set, exits non-zero with only that host\'s hint', () => {
    const r = run({ SYNTHEX_HOST: 'codex' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(HOSTS.codex.headless.writabilityHint);
    expect(r.stderr).not.toContain(HOSTS.gemini.headless.writabilityHint);
  });

  it.skipIf(isRoot)('with SYNTHEX_HOST unset, exits non-zero with every host\'s hint', () => {
    const r = run({});
    expect(r.status).not.toBe(0);
    for (const id of HOST_IDS) {
      expect(r.stderr, id).toContain(HOSTS[id].headless.writabilityHint);
    }
  });

  it.skipIf(isRoot)('an unknown SYNTHEX_HOST falls back to every host\'s hint', () => {
    const r = run({ SYNTHEX_HOST: 'nope' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(HOSTS.codex.headless.writabilityHint);
    expect(r.stderr).toContain(HOSTS.hermes.headless.writabilityHint);
  });
});

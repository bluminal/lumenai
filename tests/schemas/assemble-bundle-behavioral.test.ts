/**
 * Layer 2: Behavioral fixtures for scripts/assemble-bundle.sh — the FR-HM26
 * / FR-HM44 context bundle assembler that replaces the retired
 * `context-bundle-assembler` Haiku agent (Task 41).
 *
 * This file ports the retired agent's coverage (formerly
 * context-bundle-assembler-md.test.ts and context-bundle-fixtures.test.ts,
 * both deleted with the agent) onto the real script's actual behavior:
 *
 *   - 3 oversize scenarios, re-derived for the script's needs_summary[]
 *     design (the script no longer summarizes anything itself — only the
 *     orchestrator's Haiku call, outside this script's scope, does that):
 *       (a) oversized-bundle: a mix of in-cap and over-cap touched files —
 *           in-cap files are inlined into files[]; over-cap files are
 *           routed to needs_summary[] instead, never read into files[].
 *       (b) artifact-as-largest-file: the artifact itself exceeds
 *           max_file_bytes but not max_bundle_bytes — it stays inlined
 *           verbatim and is NEVER added to needs_summary (Behavioral Rule
 *           1, carried over from the retired agent: the artifact can never
 *           be summarized).
 *       (c) oversized-artifact: the artifact alone exceeds
 *           max_bundle_bytes — assembly aborts with
 *           error_code "narrow_scope_required" (exit 2); an error-shaped
 *           bundle is still written for an auditable record.
 *   - .synthex/tmp/.gitignore containing "*" (self-ignoring, written on
 *     first bundle write).
 *   - cleanup at run end: `assemble-bundle.sh cleanup <bundle-path>`
 *     removes one specific bundle file (the orchestrator calls this once
 *     consolidation finishes).
 *   - cleanup after 24h: every `assemble` invocation sweeps stale
 *     bundle-*.json files (mtime older than 86400s) before writing its own,
 *     so a project never accumulates orphaned bundles even if a caller
 *     never runs `cleanup` explicitly.
 *
 * Plan: docs/plans/harness-modernization.md Task 41.
 * Spec: docs/reqs/harness-modernization.md § FR-HM26, FR-HM44.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'assemble-bundle.sh');

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'assemble-bundle-'));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

function writeFile(relPath: string, contentOrBytes: string | number): string {
  const abs = join(projectDir, relPath);
  const content = typeof contentOrBytes === 'number' ? 'x'.repeat(contentOrBytes) : contentOrBytes;
  writeFileSync(abs, content);
  return abs;
}

function writeConfig(yaml: string): void {
  mkdirSync(join(projectDir, '.synthex'), { recursive: true });
  writeFileSync(join(projectDir, '.synthex', 'config.yaml'), yaml);
}

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('bash', [SCRIPT, ...args], {
      cwd: projectDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      encoding: 'utf-8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err: any) {
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function readBundle(bundlePath: string): any {
  return JSON.parse(readFileSync(bundlePath, 'utf-8'));
}

describe('assemble-bundle.sh — file exists and is executable-by-bash', () => {
  it('script file exists', () => expect(existsSync(SCRIPT)).toBe(true));
});

// ---------------------------------------------------------------------------
// Scenario (a): oversized-bundle — mixed in-cap / over-cap touched files
// ---------------------------------------------------------------------------

describe('Scenario (a): oversized-bundle', () => {
  it('inlines in-cap files into files[] and routes over-cap files to needs_summary[]', () => {
    writeConfig('multi_model_review:\n  context:\n    max_bundle_bytes: 10000000\n    max_file_bytes: 50000\n');
    const artifact = writeFile('artifact.ts', 'small artifact content\n');
    const smallTouched = writeFile('small.ts', 'small touched file\n');
    const bigTouched1 = writeFile('big1.ts', 92_000);
    const bigTouched2 = writeFile('big2.ts', 88_000);

    const result = run([
      'assemble',
      '--artifact', artifact,
      '--touched', artifact,
      '--touched', smallTouched,
      '--touched', bigTouched1,
      '--touched', bigTouched2,
    ]);
    expect(result.code, result.stderr).toBe(0);

    const bundlePath = result.stdout.trim();
    expect(existsSync(bundlePath)).toBe(true);
    const bundle = readBundle(bundlePath);

    expect(bundle.status).toBe('success');
    expect(bundle.manifest.artifact.inlined).toBe(true);

    const filePaths = bundle.files.map((f: any) => f.path);
    expect(filePaths).toContain(artifact);
    expect(filePaths).toContain(smallTouched);
    expect(filePaths).not.toContain(bigTouched1);
    expect(filePaths).not.toContain(bigTouched2);

    const needsSummaryPaths = bundle.needs_summary.map((f: any) => f.path);
    expect(needsSummaryPaths).toContain(bigTouched1);
    expect(needsSummaryPaths).toContain(bigTouched2);
    expect(needsSummaryPaths).not.toContain(artifact);
    expect(needsSummaryPaths).not.toContain(smallTouched);

    // needs_summary entries carry size + category, not content — the
    // orchestrator (not this script) does the one-call-per-file Haiku
    // summarization and merges the result back into files[].
    const big1Entry = bundle.needs_summary.find((f: any) => f.path === bigTouched1);
    expect(big1Entry.size_bytes).toBe(92_000);
    expect(big1Entry.category).toBe('touched_files');

    const touchedManifest = bundle.manifest.touched_files;
    expect(touchedManifest.find((f: any) => f.path === smallTouched).inlined).toBe(true);
    expect(touchedManifest.find((f: any) => f.path === bigTouched1).inlined).toBe(false);
    expect(touchedManifest.find((f: any) => f.path === bigTouched2).inlined).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario (b): artifact-as-largest-file — artifact exceeds max_file_bytes
// but not max_bundle_bytes
// ---------------------------------------------------------------------------

describe('Scenario (b): artifact-as-largest-file', () => {
  it('keeps the oversized artifact inlined and never in needs_summary (Behavioral Rule 1)', () => {
    writeConfig('multi_model_review:\n  context:\n    max_bundle_bytes: 200000\n    max_file_bytes: 50000\n');
    const artifact = writeFile('large-feature.ts', 80_000);

    const result = run(['assemble', '--artifact', artifact, '--touched', artifact]);
    expect(result.code, result.stderr).toBe(0);

    const bundle = readBundle(result.stdout.trim());
    expect(bundle.status).toBe('success');
    expect(bundle.manifest.artifact.size_bytes).toBe(80_000);
    expect(bundle.manifest.artifact.inlined).toBe(true);
    expect(bundle.needs_summary).toHaveLength(0);

    const artifactFileEntry = bundle.files.find((f: any) => f.path === artifact);
    expect(artifactFileEntry).toBeDefined();
    expect(artifactFileEntry.content).toHaveLength(80_000);
  });
});

// ---------------------------------------------------------------------------
// Scenario (c): oversized-artifact — artifact exceeds max_bundle_bytes
// ---------------------------------------------------------------------------

describe('Scenario (c): oversized-artifact', () => {
  it('aborts with narrow_scope_required (exit 2) and writes an auditable error bundle', () => {
    writeConfig('multi_model_review:\n  context:\n    max_bundle_bytes: 200000\n    max_file_bytes: 50000\n');
    const artifact = writeFile('giant-file.ts', 250_000);

    const result = run(['assemble', '--artifact', artifact]);
    expect(result.code).toBe(2);

    const bundlePath = result.stdout.trim();
    expect(existsSync(bundlePath)).toBe(true);
    const bundle = readBundle(bundlePath);

    expect(bundle.status).toBe('error');
    expect(bundle.error_code).toBe('narrow_scope_required');
    expect(bundle.error_message).toContain('250000');
    expect(bundle.error_message).toContain('200000');
    expect(bundle.manifest).toBeNull();
    expect(bundle.files).toHaveLength(0);
    expect(bundle.needs_summary).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// .synthex/tmp/.gitignore self-ignore
// ---------------------------------------------------------------------------

describe('.synthex/tmp/.gitignore self-ignore', () => {
  it('writes a .gitignore containing "*" on first bundle write', () => {
    const artifact = writeFile('a.ts', 'content\n');
    const result = run(['assemble', '--artifact', artifact]);
    expect(result.code, result.stderr).toBe(0);

    const gitignorePath = join(projectDir, '.synthex', 'tmp', '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    expect(readFileSync(gitignorePath, 'utf-8').trim()).toBe('*');
  });

  it('does not overwrite an existing .gitignore on subsequent runs', () => {
    const artifact = writeFile('a.ts', 'content\n');
    run(['assemble', '--artifact', artifact]);
    const gitignorePath = join(projectDir, '.synthex', 'tmp', '.gitignore');
    const firstContent = readFileSync(gitignorePath, 'utf-8');

    run(['assemble', '--artifact', artifact]);
    expect(readFileSync(gitignorePath, 'utf-8')).toBe(firstContent);
  });
});

// ---------------------------------------------------------------------------
// Cleanup — at run end (explicit) and after 24h (automatic sweep)
// ---------------------------------------------------------------------------

describe('cleanup at run end', () => {
  it('cleanup <bundle-path> removes exactly that bundle file', () => {
    const artifact = writeFile('a.ts', 'content\n');
    const first = run(['assemble', '--artifact', artifact]);
    const second = run(['assemble', '--artifact', artifact]);
    const firstPath = first.stdout.trim();
    const secondPath = second.stdout.trim();
    expect(existsSync(firstPath)).toBe(true);
    expect(existsSync(secondPath)).toBe(true);

    const cleanup = run(['cleanup', firstPath]);
    expect(cleanup.code, cleanup.stderr).toBe(0);
    expect(existsSync(firstPath)).toBe(false);
    expect(existsSync(secondPath)).toBe(true);
  });

  it('refuses to remove a path outside .synthex/tmp/', () => {
    const outside = writeFile('not-a-bundle.json', '{}');
    const cleanup = run(['cleanup', outside]);
    expect(cleanup.code).toBe(1);
    expect(existsSync(outside)).toBe(true);
  });
});

describe('cleanup after 24h (automatic sweep)', () => {
  it('the next assemble run sweeps a bundle older than 24h before writing its own', () => {
    const artifact = writeFile('a.ts', 'content\n');
    const stale = run(['assemble', '--artifact', artifact]);
    const stalePath = stale.stdout.trim();
    expect(existsSync(stalePath)).toBe(true);

    // Back-date the stale bundle's mtime by 25 hours.
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    utimesSync(stalePath, twentyFiveHoursAgo, twentyFiveHoursAgo);

    const fresh = run(['assemble', '--artifact', artifact]);
    expect(fresh.code, fresh.stderr).toBe(0);
    expect(existsSync(stalePath)).toBe(false);
    expect(existsSync(fresh.stdout.trim())).toBe(true);
  });

  it('a bundle under 24h old survives the sweep', () => {
    const artifact = writeFile('a.ts', 'content\n');
    const recent = run(['assemble', '--artifact', artifact]);
    const recentPath = recent.stdout.trim();

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(recentPath, oneHourAgo, oneHourAgo);

    run(['assemble', '--artifact', artifact]);
    expect(existsSync(recentPath)).toBe(true);
  });

  it('cleanup --sweep runs the same 24h sweep on demand', () => {
    const artifact = writeFile('a.ts', 'content\n');
    const stale = run(['assemble', '--artifact', artifact]);
    const stalePath = stale.stdout.trim();

    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    utimesSync(stalePath, twentyFiveHoursAgo, twentyFiveHoursAgo);

    const sweep = run(['cleanup', '--sweep']);
    expect(sweep.code, sweep.stderr).toBe(0);
    expect(existsSync(stalePath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Supporting contract: usage errors, missing-file skip, exit codes
// ---------------------------------------------------------------------------

describe('usage and contract', () => {
  it('exits 1 with no --artifact', () => {
    const result = run(['assemble']);
    expect(result.code).toBe(1);
  });

  it('exits 1 when --artifact does not exist', () => {
    const result = run(['assemble', '--artifact', join(projectDir, 'nope.ts')]);
    expect(result.code).toBe(1);
  });

  it('exits 1 with no subcommand', () => {
    const result = run([]);
    expect(result.code).toBe(1);
  });

  it('skips a missing --convention file silently (advisory, not fatal)', () => {
    const artifact = writeFile('a.ts', 'content\n');
    const result = run(['assemble', '--artifact', artifact, '--convention', join(projectDir, 'MISSING.md')]);
    expect(result.code, result.stderr).toBe(0);
    const bundle = readBundle(result.stdout.trim());
    expect(bundle.manifest.conventions).toHaveLength(0);
  });

  it('resolves max_file_bytes / max_bundle_bytes from the shipped defaults.yaml when no project override exists', () => {
    const artifact = writeFile('a.ts', 'content\n');
    const result = run(['assemble', '--artifact', artifact]);
    expect(result.code, result.stderr).toBe(0);
    // Shipped defaults (config/defaults.yaml): max_bundle_bytes 204800,
    // max_file_bytes 65536. A tiny artifact stays well under both, so this
    // just proves config-get.sh resolution round-trips without error.
    const bundle = readBundle(result.stdout.trim());
    expect(bundle.status).toBe('success');
  });
});

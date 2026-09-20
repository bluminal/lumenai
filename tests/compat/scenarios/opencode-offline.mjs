#!/usr/bin/env node

import { cpSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import {
  assertCompleteInventory,
  readExpectedEntrypoints,
  validateSkillTree,
} from '../lib/contract.mjs';

const startedAt = Date.now();
const fixtureRoot = '/fixture/synthex';
const installedRoot = '/workspace/.agents';

function emit(phase, details) {
  console.log(JSON.stringify({ harness: 'opencode', phase, ...details }));
}

try {
  const isolation = assertIsolatedEnvironment();
  const versionResult = spawnSync('opencode', ['--version'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (versionResult.status !== 0) {
    throw new Error(`opencode --version failed: ${versionResult.stderr}`);
  }
  emit('environment', {
    ok: true,
    version: versionResult.stdout.trim(),
    isolation,
  });

  const entries = readExpectedEntrypoints(fixtureRoot);
  const fixtureValidation = validateSkillTree(fixtureRoot, entries);
  if (
    fixtureValidation.missing.length ||
    fixtureValidation.unexpected.length ||
    fixtureValidation.invalid.length
  ) {
    throw new Error(`Invalid staged fixture: ${JSON.stringify(fixtureValidation)}`);
  }

  cpSync(fixtureRoot, installedRoot, { recursive: true });
  emit('install', {
    ok: true,
    method: 'project .agents compatibility bundle',
    destination: installedRoot,
    count: entries.length,
  });

  const debugResult = spawnSync('opencode', ['debug', 'skill'], {
    cwd: '/workspace',
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      NO_COLOR: '1',
      OPENCODE_DISABLE_AUTOUPDATE: '1',
      OPENCODE_DISABLE_CLAUDE_CODE: '1',
    },
  });
  if (debugResult.status !== 0) {
    throw new Error(
      `opencode debug skill failed (${debugResult.status}): ${debugResult.stderr}`,
    );
  }

  const discovered = entries
    .filter(({ id }) => {
      const path = `/workspace/.agents/skills/${id}/SKILL.md`;
      return debugResult.stdout.includes(path);
    })
    .map(({ id }) => id);
  const inventory = assertCompleteInventory(entries, discovered);
  emit('inventory', {
    ok: inventory.missing.length === 0,
    expectedCount: inventory.expected.length,
    discoveredCount: inventory.discovered.length,
    missing: inventory.missing,
    unexpected: inventory.unexpected,
  });
  if (inventory.missing.length > 0) {
    const excerpt = debugResult.stdout.slice(0, 4_000);
    throw new Error(
      `OpenCode inventory is incomplete: ${inventory.missing.join(', ')}\n${excerpt}`,
    );
  }

  const installedValidation = validateSkillTree(installedRoot, entries);
  if (
    installedValidation.missing.length ||
    installedValidation.unexpected.length ||
    installedValidation.invalid.length
  ) {
    throw new Error(
      `Installed references are invalid: ${JSON.stringify(installedValidation)}`,
    );
  }

  const generationCheck = spawnSync(
    'node',
    [join(installedRoot, 'scripts/generate-codex-skills.mjs'), '--check'],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (generationCheck.status !== 0) {
    throw new Error(
      `Generated skill drift detected: ${generationCheck.stderr || generationCheck.stdout}`,
    );
  }

  for (const entry of entries) {
    const skill = readFileSync(join(installedRoot, entry.skill), 'utf8');
    const source = readFileSync(join(installedRoot, entry.source), 'utf8');
    if (!skill || !source) throw new Error(`Empty entrypoint: ${entry.id}`);
  }
  emit('references', { ok: true, checked: entries.length });

  rmSync(installedRoot, { recursive: true, force: true });
  const uninstallResult = spawnSync('opencode', ['debug', 'skill'], {
    cwd: '/workspace',
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      NO_COLOR: '1',
      OPENCODE_DISABLE_AUTOUPDATE: '1',
      OPENCODE_DISABLE_CLAUDE_CODE: '1',
    },
  });
  if (uninstallResult.status !== 0) {
    throw new Error(
      `OpenCode post-uninstall inventory failed: ${uninstallResult.stderr}`,
    );
  }
  const remaining = entries.filter(({ id }) =>
    uninstallResult.stdout.includes(`/workspace/.agents/skills/${id}/SKILL.md`),
  );
  if (remaining.length > 0) {
    throw new Error(
      `OpenCode retained skills after uninstall: ${remaining.map(({ id }) => id).join(', ')}`,
    );
  }
  emit('uninstall', { ok: true, remaining: 0 });
  emit('complete', { ok: true, elapsedMs: Date.now() - startedAt });
} catch (error) {
  emit('complete', {
    ok: false,
    elapsedMs: Date.now() - startedAt,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

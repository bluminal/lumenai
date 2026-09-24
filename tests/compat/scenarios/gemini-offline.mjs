#!/usr/bin/env node

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import {
  assertCompleteInventory,
  readExpectedEntrypoints,
  validateSkillTree,
} from '../lib/contract.mjs';
import {
  emit,
  idsMentionedInOutput,
  runCommand,
} from '../lib/scenario-helpers.mjs';

const harness = 'gemini';
const startedAt = Date.now();
const fixtureRoot = '/fixture/synthex';
const stagingRoot = '/workspace/staged-synthex';
const workspaceSupportRoot = '/workspace/.gemini';

try {
  const isolation = assertIsolatedEnvironment();
  const version = runCommand('gemini', ['--version']).stdout;
  emit(harness, 'environment', { ok: true, version, isolation });

  const entries = readExpectedEntrypoints(fixtureRoot);
  const fixtureValidation = validateSkillTree(fixtureRoot, entries);
  if (Object.values(fixtureValidation).some((items) => items.length > 0)) {
    throw new Error(`Invalid staged fixture: ${JSON.stringify(fixtureValidation)}`);
  }
  cpSync(fixtureRoot, stagingRoot, { recursive: true });

  for (const entry of entries) {
    runCommand('gemini', [
      'skills',
      'install',
      join(stagingRoot, 'portable-skills', entry.id),
      '--scope',
      'workspace',
      '--consent',
    ]);
  }

  mkdirSync(workspaceSupportRoot, { recursive: true });
  for (const directory of ['commands', 'agents', 'config', 'scripts']) {
    cpSync(join(stagingRoot, directory), join(workspaceSupportRoot, directory), {
      recursive: true,
    });
  }
  emit(harness, 'install', {
    ok: true,
    method: 'native workspace skill install with shared support bundle',
    count: entries.length,
  });

  const list = runCommand('gemini', ['skills', 'list']);
  const discovered = idsMentionedInOutput(entries, list.stdout);
  const inventory = assertCompleteInventory(entries, discovered);
  emit(harness, 'inventory', {
    ok: inventory.missing.length === 0,
    expectedCount: inventory.expected.length,
    discoveredCount: inventory.discovered.length,
    missing: inventory.missing,
    unexpected: inventory.unexpected,
  });
  if (inventory.missing.length > 0) {
    throw new Error(
      `Gemini skill inventory is incomplete: ${inventory.missing.join(', ')}\n${list.stdout.slice(0, 4_000)}`,
    );
  }
  // Gemini CLI's native `skills install --scope workspace` always lands
  // files at `.gemini/skills/<id>/SKILL.md`, a Gemini-owned convention
  // independent of the source tree's directory name (`portable-skills/`).
  const installedValidation = validateSkillTree(workspaceSupportRoot, entries, 'skills');
  if (Object.values(installedValidation).some((items) => items.length > 0)) {
    throw new Error(`Gemini installed tree is invalid: ${JSON.stringify(installedValidation)}`);
  }
  emit(harness, 'references', { ok: true, checked: entries.length });

  for (const entry of entries) {
    runCommand('gemini', [
      'skills',
      'uninstall',
      entry.id,
      '--scope',
      'workspace',
    ]);
  }
  rmSync(stagingRoot, { recursive: true, force: true });
  const after = runCommand('gemini', ['skills', 'list']);
  const remaining = idsMentionedInOutput(entries, after.stdout);
  if (remaining.length > 0) {
    throw new Error(`Gemini retained skills after uninstall: ${remaining.join(', ')}`);
  }
  emit(harness, 'uninstall', { ok: true, remaining: 0 });
  emit(harness, 'complete', { ok: true, elapsedMs: Date.now() - startedAt });
} catch (error) {
  emit(harness, 'complete', {
    ok: false,
    elapsedMs: Date.now() - startedAt,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

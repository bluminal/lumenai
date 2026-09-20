#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  parseLastJsonLine,
  runCommand,
} from '../lib/scenario-helpers.mjs';

const harness = 'claude';
const startedAt = Date.now();
const fixtureRoot = '/fixture/synthex';
const marketplaceRoot = '/workspace/marketplace';
const installedFixture = join(marketplaceRoot, 'plugins', 'synthex');
const marketplaceName = 'synthex-compat';
const selector = `synthex@${marketplaceName}`;

try {
  const isolation = assertIsolatedEnvironment();
  const version = runCommand('claude', ['--version']).stdout;
  emit(harness, 'environment', { ok: true, version, isolation });

  const entries = readExpectedEntrypoints(fixtureRoot);
  const fixtureValidation = validateSkillTree(fixtureRoot, entries);
  if (Object.values(fixtureValidation).some((items) => items.length > 0)) {
    throw new Error(`Invalid staged fixture: ${JSON.stringify(fixtureValidation)}`);
  }

  mkdirSync(join(marketplaceRoot, '.claude-plugin'), { recursive: true });
  mkdirSync(join(marketplaceRoot, 'plugins'), { recursive: true });
  cpSync(fixtureRoot, installedFixture, { recursive: true });
  const pluginManifest = JSON.parse(
    readFileSync(join(fixtureRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
  );
  writeFileSync(
    join(marketplaceRoot, '.claude-plugin', 'marketplace.json'),
    `${JSON.stringify(
      {
        name: marketplaceName,
        owner: { name: 'Synthex compatibility tests' },
        plugins: [
          {
            name: 'synthex',
            source: './plugins/synthex',
            version: pluginManifest.version,
            description: pluginManifest.description,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  runCommand('claude', ['plugin', 'validate', installedFixture]);
  runCommand('claude', [
    'plugin',
    'marketplace',
    'add',
    marketplaceRoot,
    '--scope',
    'local',
  ]);
  const install = runCommand('claude', [
    'plugin',
    'install',
    selector,
    '--scope',
    'local',
    '--json',
  ]);
  parseLastJsonLine(install.stdout);
  emit(harness, 'install', {
    ok: true,
    method: 'local marketplace and native plugin install',
    selector,
    count: entries.length,
  });

  const list = runCommand('claude', ['plugin', 'list', '--json']);
  const installedPlugins = parseLastJsonLine(list.stdout);
  if (!JSON.stringify(installedPlugins).includes('synthex')) {
    throw new Error(`Claude plugin list did not include Synthex: ${list.stdout}`);
  }

  const details = runCommand('claude', ['plugin', 'details', selector]);
  const discovered = idsMentionedInOutput(entries, details.stdout);
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
      `Claude component inventory is incomplete: ${inventory.missing.join(', ')}\n${details.stdout.slice(0, 4_000)}`,
    );
  }
  emit(harness, 'references', { ok: true, checked: entries.length });

  const uninstall = runCommand('claude', [
    'plugin',
    'uninstall',
    selector,
    '--scope',
    'local',
    '--json',
  ]);
  parseLastJsonLine(uninstall.stdout);
  const after = runCommand('claude', ['plugin', 'list', '--json']);
  if (
    JSON.stringify(parseLastJsonLine(after.stdout)).includes('"name":"synthex"')
  ) {
    throw new Error('Claude retained Synthex after uninstall');
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

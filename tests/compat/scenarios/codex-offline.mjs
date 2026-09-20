#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import { listCodexSkills } from '../lib/codex-app-server.mjs';
import {
  assertCompleteInventory,
  readExpectedEntrypoints,
  validateSkillTree,
} from '../lib/contract.mjs';
import { emit, parseLastJsonLine, runCommand } from '../lib/scenario-helpers.mjs';

const harness = 'codex';
const startedAt = Date.now();
const fixtureRoot = '/fixture/synthex';
const marketplaceRoot = '/workspace/marketplace';
const installedFixture = join(marketplaceRoot, 'plugins', 'synthex');
const marketplaceName = 'synthex-compat';
const selector = `synthex@${marketplaceName}`;

try {
  const isolation = assertIsolatedEnvironment();
  const version = runCommand('codex', ['--version']).stdout;
  emit(harness, 'environment', { ok: true, version, isolation });

  const entries = readExpectedEntrypoints(fixtureRoot);
  const fixtureValidation = validateSkillTree(fixtureRoot, entries);
  if (Object.values(fixtureValidation).some((items) => items.length > 0)) {
    throw new Error(`Invalid staged fixture: ${JSON.stringify(fixtureValidation)}`);
  }

  mkdirSync(join(marketplaceRoot, '.agents', 'plugins'), { recursive: true });
  mkdirSync(join(marketplaceRoot, 'plugins'), { recursive: true });
  cpSync(fixtureRoot, installedFixture, { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(fixtureRoot, '.codex-plugin', 'plugin.json'), 'utf8'),
  );
  writeFileSync(
    join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'),
    `${JSON.stringify(
      {
        name: marketplaceName,
        interface: { displayName: 'Synthex compatibility tests' },
        plugins: [
          {
            name: 'synthex',
            source: { source: 'local', path: './plugins/synthex' },
            policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
            category: 'Productivity',
            description: manifest.description,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  parseLastJsonLine(
    runCommand('codex', [
      'plugin',
      'marketplace',
      'add',
      marketplaceRoot,
      '--json',
    ]).stdout,
  );
  parseLastJsonLine(
    runCommand('codex', ['plugin', 'add', selector, '--json']).stdout,
  );
  emit(harness, 'install', {
    ok: true,
    method: 'local marketplace and native plugin install',
    selector,
    count: entries.length,
  });

  const plugins = parseLastJsonLine(
    runCommand('codex', ['plugin', 'list', '--json']).stdout,
  );
  if (!JSON.stringify(plugins).includes('synthex')) {
    throw new Error('Codex plugin list did not include Synthex');
  }

  const skills = await listCodexSkills('/workspace');
  const discovered = skills
    .map(({ name }) => name)
    .filter((name) => name.startsWith('synthex:'))
    .map((name) => name.slice('synthex:'.length));
  const inventory = assertCompleteInventory(entries, discovered);
  emit(harness, 'inventory', {
    ok: inventory.missing.length === 0,
    expectedCount: inventory.expected.length,
    discoveredCount: inventory.discovered.filter((id) =>
      inventory.expected.includes(id),
    ).length,
    missing: inventory.missing,
    unexpected: inventory.unexpected,
  });
  if (inventory.missing.length > 0) {
    throw new Error(`Codex skill inventory is incomplete: ${inventory.missing.join(', ')}`);
  }
  emit(harness, 'references', { ok: true, checked: entries.length });

  parseLastJsonLine(
    runCommand('codex', ['plugin', 'remove', selector, '--json']).stdout,
  );
  const remainingSkills = await listCodexSkills('/workspace');
  const expectedIds = new Set(entries.map(({ id }) => id));
  const remaining = remainingSkills.filter(
    ({ name }) =>
      name.startsWith('synthex:') &&
      expectedIds.has(name.slice('synthex:'.length)),
  );
  if (remaining.length > 0) {
    throw new Error(
      `Codex retained skills after uninstall: ${remaining.map(({ name }) => name).join(', ')}`,
    );
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

#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import {
  assertCanaryToken,
  canaryCredential,
  canaryModel,
  selectRepresentativeProbes,
} from '../lib/canary.mjs';
import { activateCodexSkills, listCodexSkills } from '../lib/codex-app-server.mjs';
import { assertCompleteInventory, readExpectedEntrypoints } from '../lib/contract.mjs';
import { createProbeOverlay } from '../lib/probe-overlay.mjs';
import { emit, parseLastJsonLine, runCommand } from '../lib/scenario-helpers.mjs';

const harness = 'codex';
const profile = 'canary';
const startedAt = Date.now();
const fixtureRoot = '/fixture/synthex';
const overlayRoot = '/workspace/probe/synthex';
const marketplaceRoot = '/workspace/marketplace';
const installedFixture = join(marketplaceRoot, 'plugins', 'synthex');
const marketplaceName = 'synthex-compat';
const selector = `synthex@${marketplaceName}`;

try {
  const isolation = assertIsolatedEnvironment();
  const version = runCommand('codex', ['--version']).stdout;
  process.env.CODEX_API_KEY = canaryCredential();
  emit(harness, 'environment', { ok: true, profile, version, isolation });

  const probes = createProbeOverlay({
    pluginRoot: fixtureRoot,
    outputRoot: overlayRoot,
    runId: 'canary',
  });
  const entries = readExpectedEntrypoints(overlayRoot);
  const representatives = selectRepresentativeProbes(probes);
  mkdirSync(join(marketplaceRoot, '.agents', 'plugins'), { recursive: true });
  mkdirSync(join(marketplaceRoot, 'plugins'), { recursive: true });
  cpSync(overlayRoot, installedFixture, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(overlayRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
  writeFileSync(
    join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'),
    `${JSON.stringify({
      name: marketplaceName,
      interface: { displayName: 'Synthex compatibility tests' },
      plugins: [{
        name: 'synthex',
        source: { source: 'local', path: './plugins/synthex' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
        description: manifest.description,
      }],
    }, null, 2)}\n`,
  );
  parseLastJsonLine(runCommand('codex', ['plugin', 'marketplace', 'add', marketplaceRoot, '--json']).stdout);
  parseLastJsonLine(runCommand('codex', ['plugin', 'add', selector, '--json']).stdout);
  emit(harness, 'install', { ok: true, profile, selector, count: entries.length });

  const skills = await listCodexSkills('/workspace');
  const synthexSkills = skills.filter(({ name }) => name.startsWith('synthex:'));
  const inventory = assertCompleteInventory(
    entries,
    synthexSkills.map(({ name }) => name.slice('synthex:'.length)),
  );
  if (inventory.missing.length > 0) {
    throw new Error(`Codex skill inventory is incomplete: ${inventory.missing.join(', ')}`);
  }
  emit(harness, 'inventory', { ok: true, profile, discoveredCount: synthexSkills.length });

  const byName = new Map(synthexSkills.map((skill) => [skill.name, skill]));
  const activations = representatives.map((probe) => {
    const name = `synthex:${probe.id}`;
    const skill = byName.get(name);
    if (!skill?.path) throw new Error(`Codex reported no path for ${name}`);
    return { ...probe, name, path: skill.path };
  });
  const completed = await activateCodexSkills({
    cwd: '/workspace',
    skills: activations,
    model: canaryModel(undefined),
  });
  for (const activation of activations) {
    const result = completed.find(({ name }) => name === activation.name);
    assertCanaryToken({
      harness,
      id: activation.id,
      token: activation.token,
      output: JSON.stringify(result),
    });
    emit(harness, 'activate', {
      ok: true,
      profile,
      id: activation.id,
      kind: activation.kind,
      proof: 'real provider returned the temporary activation token',
    });
  }
  emit(harness, 'complete', {
    ok: true,
    profile,
    activated: activations.length,
    elapsedMs: Date.now() - startedAt,
  });
} catch (error) {
  emit(harness, 'complete', {
    ok: false,
    profile,
    elapsedMs: Date.now() - startedAt,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

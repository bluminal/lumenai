#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import {
  assertCanaryToken,
  canaryBudgetUsd,
  canaryCredential,
  canaryModel,
  selectRepresentativeProbes,
} from '../lib/canary.mjs';
import { readExpectedEntrypoints } from '../lib/contract.mjs';
import { createProbeOverlay } from '../lib/probe-overlay.mjs';
import { emit, parseLastJsonLine, runCommand, runCommandAsync } from '../lib/scenario-helpers.mjs';

const harness = 'claude';
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
  const version = runCommand('claude', ['--version']).stdout;
  const credential = canaryCredential();
  emit(harness, 'environment', { ok: true, profile, version, isolation });

  const probes = createProbeOverlay({
    pluginRoot: fixtureRoot,
    outputRoot: overlayRoot,
    runId: 'canary',
  });
  const entries = readExpectedEntrypoints(overlayRoot);
  const representatives = selectRepresentativeProbes(probes);
  mkdirSync(join(marketplaceRoot, '.claude-plugin'), { recursive: true });
  mkdirSync(join(marketplaceRoot, 'plugins'), { recursive: true });
  cpSync(overlayRoot, installedFixture, { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(overlayRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
  );
  writeFileSync(
    join(marketplaceRoot, '.claude-plugin', 'marketplace.json'),
    `${JSON.stringify({
      name: marketplaceName,
      owner: { name: 'Synthex compatibility tests' },
      plugins: [{
        name: 'synthex',
        source: './plugins/synthex',
        version: manifest.version,
        description: manifest.description,
      }],
    }, null, 2)}\n`,
  );
  runCommand('claude', ['plugin', 'marketplace', 'add', marketplaceRoot, '--scope', 'local']);
  parseLastJsonLine(runCommand('claude', [
    'plugin', 'install', selector, '--scope', 'local', '--json',
  ]).stdout);
  emit(harness, 'install', { ok: true, profile, selector, count: entries.length });

  const providerEnv = {
    ANTHROPIC_API_KEY: credential,
    ANTHROPIC_MODEL: canaryModel('claude-sonnet-4-5'),
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  };
  const budget = canaryBudgetUsd();
  for (const probe of representatives) {
    const invocation = probe.kind === 'command'
      ? [`/synthex:${probe.id}`]
      : ['--agent', `synthex:${probe.id}`, 'Run the compatibility activation probe.'];
    const result = await runCommandAsync('claude', [
      '-p', ...invocation,
      '--output-format', 'json',
      '--no-session-persistence',
      '--max-turns', '1',
      '--max-budget-usd', budget,
      '--permission-mode', 'dontAsk',
    ], { timeout: 120_000, env: providerEnv });
    assertCanaryToken({
      harness,
      id: probe.id,
      token: probe.token,
      output: `${result.stdout}\n${result.stderr}`,
    });
    emit(harness, 'activate', {
      ok: true,
      profile,
      id: probe.id,
      kind: probe.kind,
      proof: 'real provider returned the temporary activation token',
    });
  }
  emit(harness, 'complete', {
    ok: true,
    profile,
    activated: representatives.length,
    maxBudgetUsd: Number(budget),
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

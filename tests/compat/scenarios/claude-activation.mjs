#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import {
  assertCompleteInventory,
  readExpectedEntrypoints,
} from '../lib/contract.mjs';
import { startLoopbackAnthropicProvider } from '../lib/loopback-anthropic-provider.mjs';
import { createProbeOverlay } from '../lib/probe-overlay.mjs';
import {
  emit,
  idsMentionedInOutput,
  parseLastJsonLine,
  runCommand,
  runCommandAsync,
} from '../lib/scenario-helpers.mjs';

const harness = 'claude';
const profile = 'activation';
const startedAt = Date.now();
const fixtureRoot = '/fixture/synthex';
const overlayRoot = '/workspace/probe/synthex';
const marketplaceRoot = '/workspace/marketplace';
const installedFixture = join(marketplaceRoot, 'plugins', 'synthex');
const marketplaceName = 'synthex-compat';
const selector = `synthex@${marketplaceName}`;
let provider;

try {
  const isolation = assertIsolatedEnvironment();
  const version = runCommand('claude', ['--version']).stdout;
  emit(harness, 'environment', { ok: true, profile, version, isolation });

  const probes = createProbeOverlay({
    pluginRoot: fixtureRoot,
    outputRoot: overlayRoot,
    runId: 'claude',
  });
  const entries = readExpectedEntrypoints(overlayRoot);
  mkdirSync(join(marketplaceRoot, '.claude-plugin'), { recursive: true });
  mkdirSync(join(marketplaceRoot, 'plugins'), { recursive: true });
  cpSync(overlayRoot, installedFixture, { recursive: true });
  const pluginManifest = JSON.parse(
    readFileSync(join(overlayRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
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
  runCommand('claude', [
    'plugin',
    'marketplace',
    'add',
    marketplaceRoot,
    '--scope',
    'local',
  ]);
  parseLastJsonLine(
    runCommand('claude', [
      'plugin',
      'install',
      selector,
      '--scope',
      'local',
      '--json',
    ]).stdout,
  );
  emit(harness, 'install', {
    ok: true,
    profile,
    method: 'temporary probe overlay through local marketplace',
    selector,
    count: entries.length,
  });

  const details = runCommand('claude', ['plugin', 'details', selector]);
  const inventory = assertCompleteInventory(
    entries,
    idsMentionedInOutput(entries, details.stdout),
  );
  if (inventory.missing.length > 0) {
    throw new Error(`Claude component inventory is incomplete: ${inventory.missing.join(', ')}`);
  }
  emit(harness, 'inventory', {
    ok: true,
    profile,
    expectedCount: inventory.expected.length,
    discoveredCount: inventory.discovered.length,
  });

  provider = await startLoopbackAnthropicProvider();
  const providerEnv = {
    ANTHROPIC_BASE_URL: provider.baseUrl,
    ANTHROPIC_API_KEY: 'synthex-test-only-not-a-real-key',
    ANTHROPIC_MODEL: 'claude-sonnet-4-5',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  };
  for (const probe of probes) {
    const invocation =
      probe.kind === 'command'
        ? [`/synthex:${probe.id}`]
        : ['--agent', `synthex:${probe.id}`, 'Run the compatibility activation probe.'];
    const requestStart = provider.requests.length;
    await runCommandAsync(
      'claude',
      [
        '-p',
        ...invocation,
        '--output-format',
        'json',
        '--no-session-persistence',
        '--max-turns',
        '1',
        '--permission-mode',
        'dontAsk',
      ],
      { timeout: 60_000, env: providerEnv },
    );
    const activationRequests = provider.requests
      .slice(requestStart)
      .filter(({ url }) => url?.includes('/v1/messages'));
    const matchingRequest = activationRequests.find(({ body }) =>
      JSON.stringify(body).includes(probe.token),
    );
    if (!matchingRequest) {
      throw new Error(
        `Claude ${probe.kind} activation for ${probe.id} did not contain its unique token across ${activationRequests.length} Messages requests`,
      );
    }
    emit(harness, 'activate', {
      ok: true,
      profile,
      id: probe.id,
      kind: probe.kind,
      proof: 'unique token observed in loopback Messages request',
    });
  }
  emit(harness, 'complete', {
    ok: true,
    profile,
    activated: probes.length,
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
} finally {
  if (provider) await provider.close();
}

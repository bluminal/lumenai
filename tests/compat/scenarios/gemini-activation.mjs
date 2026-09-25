#!/usr/bin/env node

import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import {
  assertCompleteInventory,
  readExpectedEntrypoints,
} from '../lib/contract.mjs';
import { startLoopbackGeminiProvider } from '../lib/loopback-gemini-provider.mjs';
import { createProbeOverlay } from '../lib/probe-overlay.mjs';
import {
  emit,
  idsMentionedInOutput,
  runCommand,
  runCommandAsync,
} from '../lib/scenario-helpers.mjs';

const harness = 'gemini';
const profile = 'activation';
const startedAt = Date.now();
const fixtureRoot = '/fixture/synthex';
const overlayRoot = '/workspace/probe/synthex';
const workspaceSupportRoot = '/workspace/.gemini';
let provider;

try {
  const isolation = assertIsolatedEnvironment();
  const version = runCommand('gemini', ['--version']).stdout;
  emit(harness, 'environment', { ok: true, profile, version, isolation });

  const probes = createProbeOverlay({
    pluginRoot: fixtureRoot,
    outputRoot: overlayRoot,
    runId: 'gemini',
  });
  const entries = readExpectedEntrypoints(overlayRoot);
  for (const entry of entries) {
    runCommand('gemini', [
      'skills',
      'install',
      join(overlayRoot, 'portable-skills', entry.id),
      '--scope',
      'workspace',
      '--consent',
    ]);
  }
  mkdirSync(workspaceSupportRoot, { recursive: true });
  for (const directory of ['commands', 'agents', 'config', 'scripts']) {
    cpSync(join(overlayRoot, directory), join(workspaceSupportRoot, directory), {
      recursive: true,
    });
  }
  emit(harness, 'install', {
    ok: true,
    profile,
    method: 'native workspace skill install from temporary probe overlay',
    count: entries.length,
  });

  const list = runCommand('gemini', ['skills', 'list']);
  const discovered = idsMentionedInOutput(entries, list.stdout);
  const inventory = assertCompleteInventory(entries, discovered);
  if (inventory.missing.length > 0) {
    throw new Error(`Gemini skill inventory is incomplete: ${inventory.missing.join(', ')}`);
  }
  emit(harness, 'inventory', {
    ok: true,
    profile,
    expectedCount: inventory.expected.length,
    discoveredCount: inventory.discovered.length,
  });

  provider = await startLoopbackGeminiProvider(entries.map(({ id }) => id));
  await runCommandAsync(
    'gemini',
    [
      '--prompt',
      `Activate every installed Synthex skill in this exact list: ${entries
        .map(({ id }) => id)
        .join(', ')}. Do not perform their workflows.`,
      '--approval-mode',
      'yolo',
      '--output-format',
      'json',
      '--model',
      'gemini-2.5-flash',
    ],
    {
      timeout: 120_000,
      env: {
        GEMINI_API_KEY: 'synthex-test-only-not-a-real-key',
        GOOGLE_GEMINI_BASE_URL: provider.baseUrl,
      },
    },
  );

  const generatedRequests = provider.requests.filter(({ url }) =>
    url?.includes(':streamGenerateContent'),
  );
  if (generatedRequests.length < 2) {
    throw new Error(
      `Expected at least two Gemini generation requests, received ${generatedRequests.length}`,
    );
  }
  const activatedRequest = JSON.stringify(generatedRequests[1].body);
  for (const probe of probes) {
    if (!activatedRequest.includes(probe.token)) {
      throw new Error(
        `Gemini activation request for ${probe.id} did not contain its unique token`,
      );
    }
    emit(harness, 'activate', {
      ok: true,
      profile,
      id: probe.id,
      proof: 'unique token observed after activate_skill tool execution',
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

#!/usr/bin/env node

import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import {
  assertCanaryToken,
  canaryCredential,
  canaryModel,
  selectRepresentativeProbes,
} from '../lib/canary.mjs';
import { assertCompleteInventory, readExpectedEntrypoints } from '../lib/contract.mjs';
import { createProbeOverlay } from '../lib/probe-overlay.mjs';
import { emit, idsMentionedInOutput, runCommand, runCommandAsync } from '../lib/scenario-helpers.mjs';

const harness = 'gemini';
const profile = 'canary';
const startedAt = Date.now();
const fixtureRoot = '/fixture/synthex';
const overlayRoot = '/workspace/probe/synthex';
const workspaceSupportRoot = '/workspace/.gemini';

try {
  const isolation = assertIsolatedEnvironment();
  const version = runCommand('gemini', ['--version']).stdout;
  const credential = canaryCredential();
  emit(harness, 'environment', { ok: true, profile, version, isolation });

  const probes = createProbeOverlay({
    pluginRoot: fixtureRoot,
    outputRoot: overlayRoot,
    runId: 'canary',
  });
  const entries = readExpectedEntrypoints(overlayRoot);
  const representatives = selectRepresentativeProbes(probes);
  for (const entry of entries) {
    runCommand('gemini', [
      'skills', 'install', join(overlayRoot, 'skills', entry.id), '--scope', 'workspace', '--consent',
    ]);
  }
  mkdirSync(workspaceSupportRoot, { recursive: true });
  for (const directory of ['commands', 'agents', 'config', 'scripts']) {
    cpSync(join(overlayRoot, directory), join(workspaceSupportRoot, directory), { recursive: true });
  }
  emit(harness, 'install', { ok: true, profile, count: entries.length });

  const list = runCommand('gemini', ['skills', 'list']);
  const inventory = assertCompleteInventory(entries, idsMentionedInOutput(entries, list.stdout));
  if (inventory.missing.length > 0) {
    throw new Error(`Gemini skill inventory is incomplete: ${inventory.missing.join(', ')}`);
  }
  emit(harness, 'inventory', { ok: true, profile, discoveredCount: inventory.discovered.length });

  for (const probe of representatives) {
    const result = await runCommandAsync('gemini', [
      '--prompt', `Use the installed Synthex skill named ${probe.id}. Do not execute its workflow; follow its compatibility-test instruction exactly.`,
      '--approval-mode', 'yolo',
      '--output-format', 'json',
      '--model', canaryModel('gemini-2.5-flash'),
    ], {
      timeout: 120_000,
      env: { GEMINI_API_KEY: credential },
    });
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

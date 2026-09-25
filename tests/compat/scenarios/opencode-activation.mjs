#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import {
  assertCompleteInventory,
  readExpectedEntrypoints,
} from '../lib/contract.mjs';
import { startLoopbackOpenAIChatProvider } from '../lib/loopback-openai-chat-provider.mjs';
import { createProbeOverlay } from '../lib/probe-overlay.mjs';
import { emit, runCommand, runCommandAsync } from '../lib/scenario-helpers.mjs';

const harness = 'opencode';
const profile = 'activation';
const startedAt = Date.now();
const fixtureRoot = '/fixture/synthex';
const installedRoot = '/workspace/.agents';
let provider;

try {
  const isolation = assertIsolatedEnvironment();
  const version = runCommand('opencode', ['--version']).stdout;
  emit(harness, 'environment', { ok: true, profile, version, isolation });

  const probes = createProbeOverlay({
    pluginRoot: fixtureRoot,
    outputRoot: installedRoot,
    runId: 'opencode',
  });
  const entries = readExpectedEntrypoints(installedRoot);
  emit(harness, 'install', {
    ok: true,
    profile,
    method: 'project .agents compatibility bundle from temporary probe overlay',
    destination: installedRoot,
    count: entries.length,
  });

  // OpenCode's own skill discovery is hardcoded to `.claude/skills/**` and
  // `.agents/skills/**` (Task 5/Q7); the `portable-skills/` rename needs an
  // explicit `opencode.json` `skills.paths` entry to be visible at all. See
  // spikes.md Task 21 (Q7). Write it before the first discovery check.
  writeFileSync(
    '/workspace/opencode.json',
    `${JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        skills: { paths: ['.agents/portable-skills'] },
      },
      null,
      2,
    )}\n`,
  );

  const discoveredSkills = JSON.parse(
    runCommand('opencode', ['debug', 'skill'], {
      env: { OPENCODE_DISABLE_CLAUDE_CODE: '1' },
    }).stdout,
  );
  const discovered = discoveredSkills.map(({ name }) => name);
  const inventory = assertCompleteInventory(entries, discovered);
  if (inventory.missing.length > 0) {
    throw new Error(`OpenCode skill inventory is incomplete: ${inventory.missing.join(', ')}`);
  }
  emit(harness, 'inventory', {
    ok: true,
    profile,
    expectedCount: inventory.expected.length,
    discoveredCount: inventory.expected.length,
  });

  provider = await startLoopbackOpenAIChatProvider(entries.map(({ id }) => id));
  writeFileSync(
    '/workspace/opencode.json',
    `${JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        model: 'openai/gpt-4o',
        provider: {
          openai: {
            options: {
              baseURL: provider.baseUrl,
              apiKey: 'synthex-test-only-not-a-real-key',
            },
          },
        },
        permission: { skill: { '*': 'allow' } },
        skills: { paths: ['.agents/portable-skills'] },
      },
      null,
      2,
    )}\n`,
  );
  const runResult = await runCommandAsync(
    'opencode',
    [
      'run',
      `Load every installed skill in this exact list: ${entries
        .map(({ id }) => id)
        .join(', ')}. Do not perform their workflows.`,
      '--model',
      'openai/gpt-4o',
      '--format',
      'json',
      '--auto',
    ],
    {
      timeout: 120_000,
      env: { OPENCODE_DISABLE_CLAUDE_CODE: '1' },
    },
  );

  const chatRequests = provider.requests.filter(
    ({ url }) => url === '/v1/chat/completions' || url === '/v1/responses',
  );
  const activationRequestIndex = chatRequests.findIndex(({ body }) =>
    (body.tools ?? []).some(
      (tool) => (tool.function?.name ?? tool.name) === 'skill',
    ),
  );
  if (
    activationRequestIndex < 0 ||
    activationRequestIndex + 1 >= chatRequests.length
  ) {
    throw new Error(
      `Expected an OpenCode skill-tool request and a follow-up, received ${chatRequests.length} generation requests; endpoints: ${provider.requests.map(({ url }) => url).join(', ')}`,
    );
  }
  const skillToolRequest = chatRequests[activationRequestIndex];
  const activatedToolRequest = chatRequests[activationRequestIndex + 1];
  const activatedRequest = JSON.stringify(activatedToolRequest.body);
  for (const probe of probes) {
    if (!readFileSync(`${installedRoot}/${probe.skill}`, 'utf8').includes(probe.token)) {
      throw new Error(`Installed OpenCode skill ${probe.id} lost its activation token`);
    }
    if (!activatedRequest.includes(probe.token)) {
      const observedTokens = probes
        .filter(({ token }) => activatedRequest.includes(token))
        .map(({ id }) => id);
      throw new Error(
        `OpenCode activation request for ${probe.id} did not contain its unique token; observed tokens: ${observedTokens.join(', ') || 'none'}; offered tools: ${(skillToolRequest.body.tools ?? []).map((tool) => tool.function?.name ?? tool.name).join(', ')}; run output: ${runResult.stdout.slice(-3000)}; input: ${JSON.stringify(activatedToolRequest.body.messages ?? activatedToolRequest.body.input).slice(-3000)}`,
      );
    }
    emit(harness, 'activate', {
      ok: true,
      profile,
      id: probe.id,
      proof: 'unique token observed after skill tool execution',
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

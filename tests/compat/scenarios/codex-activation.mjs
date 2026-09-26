#!/usr/bin/env node

import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import {
  activateCodexSkills,
  listCodexSkills,
} from '../lib/codex-app-server.mjs';
import { summarizeCodexCatalog } from '../lib/codex-catalog.mjs';
import {
  assertCompleteInventory,
  readExpectedEntrypoints,
} from '../lib/contract.mjs';
import { catalogBudget } from '../lib/harnesses.mjs';
import { startLoopbackResponsesProvider } from '../lib/loopback-responses-provider.mjs';
import { createProbeOverlay } from '../lib/probe-overlay.mjs';
import { emit, parseLastJsonLine, runCommand } from '../lib/scenario-helpers.mjs';

const harness = 'codex';
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
  const version = runCommand('codex', ['--version']).stdout;
  emit(harness, 'environment', { ok: true, profile, version, isolation });

  const probes = createProbeOverlay({
    pluginRoot: fixtureRoot,
    outputRoot: overlayRoot,
    runId: 'codex',
  });
  const entries = readExpectedEntrypoints(overlayRoot);

  mkdirSync(join(marketplaceRoot, '.agents', 'plugins'), { recursive: true });
  mkdirSync(join(marketplaceRoot, 'plugins'), { recursive: true });
  cpSync(overlayRoot, installedFixture, { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(overlayRoot, '.codex-plugin', 'plugin.json'), 'utf8'),
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
    profile,
    method: 'temporary probe overlay through local marketplace',
    selector,
    count: entries.length,
  });

  const skills = await listCodexSkills('/workspace');
  const synthexSkills = skills.filter(({ name }) => name.startsWith('synthex:'));
  const inventory = assertCompleteInventory(
    entries,
    synthexSkills.map(({ name }) => name.slice('synthex:'.length)),
  );
  if (inventory.missing.length > 0) {
    throw new Error(`Codex skill inventory is incomplete: ${inventory.missing.join(', ')}`);
  }
  emit(harness, 'inventory', {
    ok: true,
    profile,
    expectedCount: inventory.expected.length,
    discoveredCount: synthexSkills.length,
  });

  // FR-HM9 (Task 22): the app-server's own skills/list catalog is the
  // skill-catalog block Codex sends to the model, so assert its budget
  // straight off the same `synthexSkills` the inventory check just used,
  // reading each source description from the probe overlay (the probe
  // marker is injected after the frontmatter closing fence, so it never
  // touches the description: value itself).
  const catalogBudgetLimits = catalogBudget(harness);
  const catalogSummary = summarizeCodexCatalog(entries, synthexSkills, (entry) =>
    readFileSync(join(overlayRoot, entry.skill), 'utf8'),
  );
  const catalogOverBudget =
    catalogSummary.totalRenderedChars > catalogBudgetLimits.maxTotalRenderedChars ||
    catalogSummary.blankDescriptionCount > catalogBudgetLimits.maxBlankDescriptionCount ||
    catalogSummary.shortenedDescriptionCount > catalogBudgetLimits.maxShortenedDescriptionCount;
  emit(harness, 'catalog', {
    ok: !catalogOverBudget,
    profile,
    count: catalogSummary.synthexCount,
    chars: catalogSummary.totalRenderedChars,
    blankDescriptionCount: catalogSummary.blankDescriptionCount,
    shortenedDescriptionCount: catalogSummary.shortenedDescriptionCount,
    budget: catalogBudgetLimits,
  });
  if (catalogOverBudget) {
    throw new Error(
      `Codex skill catalog exceeded its budget: ${catalogSummary.totalRenderedChars} chars ` +
        `(budget ${catalogBudgetLimits.maxTotalRenderedChars}), ` +
        `${catalogSummary.blankDescriptionCount} blank (budget ${catalogBudgetLimits.maxBlankDescriptionCount}), ` +
        `${catalogSummary.shortenedDescriptionCount} shortened (budget ${catalogBudgetLimits.maxShortenedDescriptionCount})`,
    );
  }

  provider = await startLoopbackResponsesProvider();
  mkdirSync('/home/synthex-test/.codex', { recursive: true });
  const codexConfigPath = '/home/synthex-test/.codex/config.toml';
  const installedPluginConfig = readFileSync(codexConfigPath, 'utf8');
  writeFileSync(
    codexConfigPath,
    `model = "synthex-compat"\nmodel_provider = "synthex_compat"\n\n[model_providers.synthex_compat]\nname = "Synthex loopback test provider"\nbase_url = "${provider.baseUrl}"\nenv_key = "SYNTHEX_COMPAT_API_KEY"\nwire_api = "responses"\nrequest_max_retries = 0\nstream_max_retries = 0\nstream_idle_timeout_ms = 10000\n\n${installedPluginConfig}`,
  );
  process.env.SYNTHEX_COMPAT_API_KEY = 'synthex-test-only-not-a-real-key';

  const byName = new Map(synthexSkills.map((skill) => [skill.name, skill]));
  const activations = probes.map((probe) => {
    const name = `synthex:${probe.id}`;
    const skill = byName.get(name);
    if (!skill?.path) throw new Error(`Codex reported no path for ${name}`);
    if (!readFileSync(skill.path, 'utf8').includes(probe.token)) {
      throw new Error(`Installed Codex skill ${name} did not retain its activation token`);
    }
    return { name, path: skill.path, token: probe.token, id: probe.id };
  });
  const completed = await activateCodexSkills({
    cwd: '/workspace',
    skills: activations,
    model: 'synthex-compat',
  });

  if (provider.requests.length !== activations.length) {
    throw new Error(
      `Expected ${activations.length} provider requests, received ${provider.requests.length}`,
    );
  }
  for (let index = 0; index < activations.length; index += 1) {
    const activation = activations[index];
    const requestBody = JSON.stringify(provider.requests[index].body);
    if (!requestBody.includes(activation.token)) {
      const observedTokens = probes
        .filter(({ token }) => requestBody.includes(token))
        .map(({ id }) => id);
      throw new Error(
        `Codex request for ${activation.name} did not contain its activation token; observed probe tokens: ${observedTokens.join(', ') || 'none'}; input excerpt: ${JSON.stringify(provider.requests[index].body.input).slice(0, 4000)}`,
      );
    }
    emit(harness, 'activate', {
      ok: true,
      profile,
      id: activation.id,
      proof: 'unique token observed in loopback Responses request',
    });
  }
  emit(harness, 'complete', {
    ok: true,
    profile,
    activated: completed.length,
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

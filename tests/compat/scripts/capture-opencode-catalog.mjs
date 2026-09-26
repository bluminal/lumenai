#!/usr/bin/env node

/**
 * Captures the OpenCode `<available_skills>` system-prompt block size at
 * the loopback provider, for the Synthex plugin fixture mounted at
 * `/fixture/synthex`. Used to record the FR-HM9 (Task 19) baseline before
 * the description diet, and can be re-run after the diet to confirm the
 * post-change block shrank. Prints one JSON object to stdout; run only
 * inside the pinned `synthex-compat-opencode` compat container (see
 * tests/compat/README.md).
 */
import { writeFileSync } from 'node:fs';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import { extractAvailableSkillsBlock } from '../lib/available-skills-block.mjs';
import { readExpectedEntrypoints } from '../lib/contract.mjs';
import { startLoopbackOpenAIChatProvider } from '../lib/loopback-openai-chat-provider.mjs';
import { createProbeOverlay } from '../lib/probe-overlay.mjs';
import { runCommand, runCommandAsync } from '../lib/scenario-helpers.mjs';

const fixtureRoot = '/fixture/synthex';
const installedRoot = '/workspace/.agents';

assertIsolatedEnvironment();
const version = runCommand('opencode', ['--version']).stdout;

createProbeOverlay({
  pluginRoot: fixtureRoot,
  outputRoot: installedRoot,
  runId: 'catalogcapture',
});
const entries = readExpectedEntrypoints(installedRoot);

writeFileSync(
  '/workspace/opencode.json',
  `${JSON.stringify(
    { $schema: 'https://opencode.ai/config.json', skills: { paths: ['.agents/portable-skills'] } },
    null,
    2,
  )}\n`,
);

const provider = await startLoopbackOpenAIChatProvider(entries.map(({ id }) => id));
try {
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

  await runCommandAsync(
    'opencode',
    [
      'run',
      `Load every installed skill in this exact list: ${entries.map(({ id }) => id).join(', ')}. Do not perform their workflows.`,
      '--model',
      'openai/gpt-4o',
      '--format',
      'json',
      '--auto',
    ],
    { timeout: 120_000, env: { OPENCODE_DISABLE_CLAUDE_CODE: '1' } },
  );

  const chatRequests = provider.requests.filter(
    ({ url }) => url === '/v1/chat/completions' || url === '/v1/responses',
  );

  // The request that offers the `skill` tool is the one whose system
  // prompt carries the full `<available_skills>` catalog block (the Task
  // 6/21 title-generator request that precedes it has no tools at all).
  const hasSkillTool = (body) =>
    (body.tools ?? []).some((tool) => (tool.function?.name ?? tool.name) === 'skill');
  const catalogRequest = chatRequests.find(({ body }) => hasSkillTool(body));
  if (!catalogRequest) {
    throw new Error(
      `No OpenCode request offered the skill tool; endpoints: ${provider.requests.map(({ url }) => url).join(', ')}`,
    );
  }

  // Extract the raw system/developer prompt text (not a JSON.stringify of
  // the whole body) so escaped-newline bloat from JSON encoding does not
  // distort the byte count.
  const { found: hasBlock, bytes: blockBytes, systemPromptBytes } =
    extractAvailableSkillsBlock(catalogRequest.body);

  const result = {
    capturedAt: new Date().toISOString(),
    harness: 'opencode',
    version,
    requestCount: chatRequests.length,
    availableSkillsBlockFound: hasBlock,
    availableSkillsBlockBytes: blockBytes,
    systemPromptBytes,
    skillCount: entries.length,
    // Optional full-body dump for ad hoc debugging (e.g. when OpenCode
    // changes its prompt structure); off by default to keep the captured
    // baseline small and free of incidental prompt text.
    debugAllRequestBodies:
      process.env.SYNTHEX_COMPAT_CAPTURE_DEBUG === '1'
        ? chatRequests.map((entry) => entry.body)
        : undefined,
  };
  console.log(JSON.stringify(result));
} finally {
  await provider.close();
}

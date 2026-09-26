#!/usr/bin/env node

/**
 * Captures the Codex app-server `skills/list` catalog for the Synthex
 * plugin fixture mounted at `/fixture/synthex`, recording every
 * `synthex:*` skill's rendered name/description plus whether Codex's
 * skill-catalog character budget blanked or shortened that description.
 *
 * Used to record the FR-HM9 (Task 19) baseline before the description
 * diet, and can be re-run after the diet to confirm the post-change
 * catalog. Prints one JSON object to stdout; run only inside the pinned
 * `synthex-compat-codex` compat container (see tests/compat/README.md).
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertIsolatedEnvironment } from '../lib/assert-isolated.mjs';
import { listCodexSkills } from '../lib/codex-app-server.mjs';
import { readExpectedEntrypoints } from '../lib/contract.mjs';
import { parseLastJsonLine, runCommand } from '../lib/scenario-helpers.mjs';

const fixtureRoot = '/fixture/synthex';
const marketplaceRoot = '/workspace/marketplace';
const installedFixture = join(marketplaceRoot, 'plugins', 'synthex');
const marketplaceName = 'synthex-compat-catalog';
const selector = `synthex@${marketplaceName}`;

function extractFrontmatterDescription(source) {
  if (!source.startsWith('---\n')) return '';
  const lines = source.split('\n');
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) return '';
  const frontmatter = lines.slice(1, closeIndex).join('\n');
  const match = frontmatter.match(/^description:\s*(.*)$/m);
  if (!match) return '';
  const raw = match[1].trim();
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

assertIsolatedEnvironment();
const version = runCommand('codex', ['--version']).stdout;

const entries = readExpectedEntrypoints(fixtureRoot);

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
      interface: { displayName: 'Synthex catalog capture' },
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
  runCommand('codex', ['plugin', 'marketplace', 'add', marketplaceRoot, '--json']).stdout,
);
parseLastJsonLine(runCommand('codex', ['plugin', 'add', selector, '--json']).stdout);

let result;
try {
  const skills = await listCodexSkills('/workspace');
  const synthex = skills.filter((skill) => skill.name.startsWith('synthex:'));

  const perSkill = entries.map((entry) => {
    const observed = synthex.find((skill) => skill.name === `synthex:${entry.id}`);
    const sourcePath = join(fixtureRoot, 'portable-skills', entry.id, 'SKILL.md');
    const sourceDescription = extractFrontmatterDescription(readFileSync(sourcePath, 'utf8'));
    const observedDescription = observed?.description ?? '';

    return {
      id: entry.id,
      kind: entry.kind,
      name: observed?.name ?? null,
      description: observedDescription,
      descriptionChars: observedDescription.length,
      sourceDescriptionChars: sourceDescription.length,
      blanked: sourceDescription.length > 0 && observedDescription.length === 0,
      shortened:
        sourceDescription.length > 0 &&
        observedDescription.length > 0 &&
        observedDescription.length < sourceDescription.length,
    };
  });

  const sourceCommandSkills = skills
    .filter((skill) => skill.name.includes('source-command-'))
    .map((skill) => skill.name);

  result = {
    capturedAt: new Date().toISOString(),
    harness: 'codex',
    version,
    totalSkillsInCatalog: skills.length,
    synthexCount: synthex.length,
    totalRenderedChars: perSkill.reduce((sum, skill) => sum + skill.descriptionChars, 0),
    blankDescriptionCount: perSkill.filter((skill) => skill.blanked).length,
    shortenedDescriptionCount: perSkill.filter((skill) => skill.shortened).length,
    sourceCommandSkillNames: sourceCommandSkills,
    skills: perSkill.sort((left, right) => left.id.localeCompare(right.id)),
  };
} finally {
  try {
    parseLastJsonLine(runCommand('codex', ['plugin', 'remove', selector, '--json']).stdout);
  } catch {
    // best-effort cleanup inside a disposable container
  }
  try {
    parseLastJsonLine(
      runCommand('codex', ['plugin', 'marketplace', 'remove', marketplaceName, '--json']).stdout,
    );
  } catch {
    // best-effort cleanup inside a disposable container
  }
}

console.log(JSON.stringify(result));

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export function readExpectedEntrypoints(pluginRoot) {
  const manifestPath = join(pluginRoot, '.claude-plugin', 'plugin.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entries = [];

  for (const kind of ['command', 'agent']) {
    const paths = manifest[`${kind}s`];
    if (!Array.isArray(paths)) {
      throw new Error(`Manifest field ${kind}s must be an array`);
    }

    for (const source of paths) {
      if (typeof source !== 'string' || !source.endsWith('.md')) {
        throw new Error(`Invalid ${kind} manifest path: ${String(source)}`);
      }

      const id = basename(source, '.md');
      const sourcePath = resolve(pluginRoot, source);
      if (!existsSync(sourcePath)) {
        throw new Error(`Missing canonical ${kind} source: ${source}`);
      }

      entries.push({
        id,
        kind,
        source,
        skill: `skills/${id}/SKILL.md`,
      });
    }
  }

  const ids = entries.map(({ id }) => id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate portable skill IDs: ${[...new Set(duplicates)].join(', ')}`,
    );
  }

  return entries.sort((left, right) => left.id.localeCompare(right.id));
}

export function validateSkillTree(pluginRoot, entries) {
  const expectedIds = new Set(entries.map(({ id }) => id));
  const skillsRoot = join(pluginRoot, 'skills');
  const actualIds = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const missing = [...expectedIds].filter((id) => !actualIds.includes(id));
  const unexpected = actualIds.filter((id) => !expectedIds.has(id));
  const invalid = [];

  for (const entry of entries) {
    const skillPath = join(pluginRoot, entry.skill);
    if (!existsSync(skillPath)) continue;

    const contents = readFileSync(skillPath, 'utf8');
    if (!contents.includes(`name: ${entry.id}`)) {
      invalid.push(`${entry.id}: frontmatter name does not match`);
    }

    const sourceBasename = basename(entry.source);
    if (!contents.includes(sourceBasename)) {
      invalid.push(`${entry.id}: canonical source is not referenced`);
    }
  }

  return { missing: missing.sort(), unexpected, invalid };
}

export function assertCompleteInventory(entries, discoveredIds) {
  const expected = entries.map(({ id }) => id).sort();
  const discovered = [...new Set(discoveredIds)].sort();
  const expectedSet = new Set(expected);
  const discoveredSet = new Set(discovered);

  return {
    expected,
    discovered,
    missing: expected.filter((id) => !discoveredSet.has(id)),
    unexpected: discovered.filter((id) => !expectedSet.has(id)),
  };
}

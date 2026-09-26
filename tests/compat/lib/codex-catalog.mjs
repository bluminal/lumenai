import { extractFrontmatterDescription } from './frontmatter.mjs';

/**
 * Summarizes the Codex app-server `skills/list` catalog footprint for the
 * `synthex:*` entries, comparing each observed (rendered) description
 * against the canonical `SKILL.md` frontmatter it was generated from.
 * Shared by `tests/compat/scripts/capture-codex-catalog.mjs` (the Task 19
 * baseline capture) and `tests/compat/scenarios/codex-activation.mjs` (the
 * Task 22 FR-HM9 catalog-budget assertion), so both measure the catalog the
 * same way.
 *
 * @param {Array<{id: string, skill: string}>} entries canonical portable
 *   skill entries, as returned by `readExpectedEntrypoints`.
 * @param {Array<{name: string, description?: string}>} synthexSkills the
 *   `synthex:*`-prefixed skills Codex's `skills/list` reported.
 * @param {(entry: {id: string, skill: string}) => string} readSkillSource
 *   returns the raw `SKILL.md` source text for an entry, so the caller
 *   decides which installed copy (fixture root, probe overlay, ...) to
 *   read the frontmatter from.
 */
export function summarizeCodexCatalog(entries, synthexSkills, readSkillSource) {
  const byName = new Map(synthexSkills.map((skill) => [skill.name, skill]));

  const perSkill = entries.map((entry) => {
    const name = `synthex:${entry.id}`;
    const observed = byName.get(name);
    const sourceDescription = extractFrontmatterDescription(readSkillSource(entry));
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

  return {
    synthexCount: perSkill.length,
    totalRenderedChars: perSkill.reduce((sum, skill) => sum + skill.descriptionChars, 0),
    blankDescriptionCount: perSkill.filter((skill) => skill.blanked).length,
    shortenedDescriptionCount: perSkill.filter((skill) => skill.shortened).length,
    perSkill,
  };
}

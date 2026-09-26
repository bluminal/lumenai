const OPEN_TAG = '<available_skills>';
const CLOSE_TAG = '</available_skills>';

/**
 * Extracts the raw system/developer prompt text from an OpenCode chat
 * request body (not a `JSON.stringify` of the whole body, which would
 * inflate any byte count with escaped-newline overhead).
 *
 * @param {{messages?: unknown[], input?: unknown[]}} body
 * @returns {string}
 */
export function systemPromptText(body) {
  const entries = [...(body.messages ?? []), ...(body.input ?? [])].filter(
    (entry) => entry.role === 'system' || entry.role === 'developer',
  );
  return entries
    .map((entry) =>
      typeof entry.content === 'string'
        ? entry.content
        : (entry.content ?? []).map((part) => part.text ?? '').join(''),
    )
    .join('\n');
}

/**
 * Finds and measures the `<available_skills>...</available_skills>` block
 * OpenCode renders into its system/developer prompt, given a captured chat
 * request body. Shared by `tests/compat/scripts/capture-opencode-catalog.mjs`
 * (the Task 19 baseline capture) and
 * `tests/compat/scenarios/opencode-activation.mjs` (the Task 22 FR-HM9
 * catalog-budget assertion).
 *
 * @param {{messages?: unknown[], input?: unknown[]}} body
 */
export function extractAvailableSkillsBlock(body) {
  const text = systemPromptText(body);
  const openIndex = text.indexOf(OPEN_TAG);
  const closeIndex = text.indexOf(CLOSE_TAG);
  const found = openIndex >= 0 && closeIndex > openIndex;
  const block = found ? text.slice(openIndex, closeIndex + CLOSE_TAG.length) : null;

  return {
    systemPromptText: text,
    systemPromptBytes: Buffer.byteLength(text, 'utf8'),
    found,
    block,
    bytes: block ? Buffer.byteLength(block, 'utf8') : null,
  };
}

/**
 * Parses each `<skill><name>.../name><description>...</description>...
 * </skill>` entry out of a captured `<available_skills>` block. Used to
 * count blank descriptions among the entries a given set of ids cares
 * about (OpenCode itself never shortens a description the way Codex's
 * catalog budget can, but a blank one would still mean the generator
 * regressed).
 *
 * @param {string | null} block
 * @returns {Array<{name: string, description: string, location: string}>}
 */
export function parseAvailableSkillsEntries(block) {
  if (!block) return [];
  const pattern =
    /<skill>\s*<name>(.*?)<\/name>\s*<description>(.*?)<\/description>\s*<location>(.*?)<\/location>\s*<\/skill>/gs;
  return [...block.matchAll(pattern)].map(([, name, description, location]) => ({
    name,
    description,
    location,
  }));
}

/**
 * Pulls the `description:` frontmatter value out of a canonical or
 * generated Markdown file (a command/agent source, or a generated
 * `SKILL.md`). Shared by the Task 19 catalog capture scripts and the Task
 * 22 activation-scenario catalog-budget checks so both read the exact same
 * single-line `description:` value a harness's skill catalog was rendered
 * from.
 *
 * @param {string} source
 * @returns {string} the description text, or '' if the file has no
 *   frontmatter or no `description:` key.
 */
export function extractFrontmatterDescription(source) {
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

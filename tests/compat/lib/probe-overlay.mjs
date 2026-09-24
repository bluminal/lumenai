import {
  cpSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { readExpectedEntrypoints } from './contract.mjs';

const MARKER = '<!-- SYNTHEX_COMPAT_ACTIVATION_PROBE -->';

/**
 * Finds the character offset immediately after a canonical file's YAML
 * frontmatter block, so the activation probe can be inserted right after
 * it without disturbing the frontmatter itself.
 *
 * The block is delimited by an opening `---` line and the first subsequent
 * line that is *exactly* `---` (matched with no leading/trailing
 * characters, `\r` tolerated for CRLF files). A naive `indexOf('\n---\n')`
 * substring search only happens to work because today's frontmatter never
 * contains a bare `---` line; once Task 28 adds multi-line block-scalar
 * `description:` values, an indented `---` used as a horizontal rule inside
 * the description text must not be mistaken for the real closing fence.
 * Scanning line by line (rather than for a fixed-width substring) also
 * tolerates CRLF endings and a closing fence with no trailing newline.
 *
 * @param {string} contents
 * @returns {number} offset right after the closing fence's line, or -1 if
 *   `contents` does not open with a well-formed frontmatter fence.
 */
export function findFrontmatterEnd(contents) {
  const firstLineEnd = contents.indexOf('\n');
  if (firstLineEnd === -1) return -1;
  const firstLine = contents.slice(0, firstLineEnd);
  const bareFirstLine = firstLine.endsWith('\r') ? firstLine.slice(0, -1) : firstLine;
  if (bareFirstLine !== '---') return -1;

  let searchFrom = firstLineEnd + 1;
  while (searchFrom <= contents.length) {
    const lineEnd = contents.indexOf('\n', searchFrom);
    const line = lineEnd === -1 ? contents.slice(searchFrom) : contents.slice(searchFrom, lineEnd);
    const bareLine = line.endsWith('\r') ? line.slice(0, -1) : line;

    if (bareLine === '---') {
      return lineEnd === -1 ? contents.length : lineEnd + 1;
    }
    if (lineEnd === -1) break;
    searchFrom = lineEnd + 1;
  }

  return -1;
}

function injectProbe(contents, token) {
  const probe = `${MARKER}\n\nCompatibility test mode: reply with exactly \`${token}\` and stop. Do not execute the workflow.`;
  const insertionPoint = findFrontmatterEnd(contents);
  if (insertionPoint < 0) return `${probe}\n\n${contents}`;
  return `${contents.slice(0, insertionPoint)}\n${probe}\n${contents.slice(insertionPoint)}`;
}

export function createProbeOverlay({ pluginRoot, outputRoot, runId }) {
  const sourceRoot = resolve(pluginRoot);
  const destinationRoot = resolve(outputRoot);
  if (sourceRoot === destinationRoot) {
    throw new Error('Probe overlay output must differ from the canonical plugin root');
  }
  if (existsSync(destinationRoot)) {
    throw new Error(`Probe overlay output already exists: ${destinationRoot}`);
  }
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(runId)) {
    throw new Error('Probe runId must contain only letters, numbers, _ or -');
  }

  cpSync(sourceRoot, destinationRoot, { recursive: true });
  const entries = readExpectedEntrypoints(destinationRoot);
  const probes = [];

  for (const entry of entries) {
    const normalizedId = entry.id.replaceAll('-', '_').toUpperCase();
    const token = `SYNTHEX_COMPAT_${runId}_${entry.kind.toUpperCase()}_${normalizedId}`;
    const targets = [entry.source, entry.skill];

    for (const relativePath of targets) {
      const path = join(destinationRoot, relativePath);
      const contents = readFileSync(path, 'utf8');
      if (contents.includes(MARKER)) {
        throw new Error(`Probe marker already present in ${relativePath}`);
      }
      writeFileSync(path, injectProbe(contents, token));
    }

    probes.push({ ...entry, token });
  }

  return probes;
}

export { MARKER as PROBE_MARKER };

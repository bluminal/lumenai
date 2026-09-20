import {
  cpSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { readExpectedEntrypoints } from './contract.mjs';

const MARKER = '<!-- SYNTHEX_COMPAT_ACTIVATION_PROBE -->';

function injectProbe(contents, token) {
  const probe = `${MARKER}\n\nCompatibility test mode: reply with exactly \`${token}\` and stop. Do not execute the workflow.`;
  if (!contents.startsWith('---\n')) return `${probe}\n\n${contents}`;

  const frontmatterEnd = contents.indexOf('\n---\n', 4);
  if (frontmatterEnd < 0) return `${probe}\n\n${contents}`;
  const insertionPoint = frontmatterEnd + '\n---\n'.length;
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

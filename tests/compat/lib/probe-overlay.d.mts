import type { Entrypoint } from './contract.mjs';

export interface ActivationProbe extends Entrypoint {
  token: string;
}

export interface ProbeOverlayOptions {
  pluginRoot: string;
  outputRoot: string;
  runId: string;
}

export const PROBE_MARKER: string;

export function createProbeOverlay(
  options: ProbeOverlayOptions,
): ActivationProbe[];

/**
 * Offset right after a canonical file's YAML frontmatter closing fence, or
 * -1 if `contents` does not open with a well-formed frontmatter fence.
 */
export function findFrontmatterEnd(contents: string): number;

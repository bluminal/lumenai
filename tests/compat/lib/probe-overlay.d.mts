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

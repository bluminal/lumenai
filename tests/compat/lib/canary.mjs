const REPRESENTATIVES = [
  { id: 'review-code', kind: 'command' },
  { id: 'code-reviewer', kind: 'agent' },
];

export function selectRepresentativeProbes(probes) {
  return REPRESENTATIVES.map(({ id, kind }) => {
    const probe = probes.find((candidate) => candidate.id === id);
    if (!probe || probe.kind !== kind) {
      throw new Error(
        `Authenticated canary requires the ${kind} representative ${id}`,
      );
    }
    return probe;
  });
}

export function canaryCredential() {
  const credential = process.env.SYNTHEX_COMPAT_CANARY_CREDENTIAL;
  if (!credential) {
    throw new Error('Authenticated canary credential was not supplied by the runner');
  }
  return credential;
}

export function canaryModel(fallback) {
  return process.env.SYNTHEX_COMPAT_CANARY_MODEL || fallback;
}

export function canaryBudgetUsd() {
  const budget = process.env.SYNTHEX_COMPAT_CANARY_MAX_BUDGET_USD ?? '0.10';
  const value = Number(budget);
  if (!Number.isFinite(value) || value <= 0 || value > 0.10) {
    throw new Error('Authenticated canary budget must be greater than 0 and no more than 0.10 USD');
  }
  return budget;
}

export function assertCanaryToken({ harness, id, token, output }) {
  if (!output.includes(token)) {
    throw new Error(
      `${harness} canary for ${id} did not return its activation token`,
    );
  }
}

export const CANARY_PROBE_COUNT = REPRESENTATIVES.length;

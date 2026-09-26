export const profiles = ['offline', 'activation', 'canary'];

export const harnesses = {
  claude: {
    displayName: 'Claude Code',
    installation: 'native-plugin',
    inventory: 'plugin details',
    activation: 'namespaced command or plugin agent',
    requiredProfiles: ['offline', 'activation'],
    credentialGatedProfiles: ['canary'],
    canaryCredentialVariable: 'SYNTHEX_COMPAT_CLAUDE_API_KEY',
  },
  codex: {
    displayName: 'Codex CLI',
    installation: 'native-plugin',
    inventory: 'app-server skills/list',
    activation: 'explicit app-server skill input',
    requiredProfiles: ['offline', 'activation'],
    credentialGatedProfiles: ['canary'],
    canaryCredentialVariable: 'SYNTHEX_COMPAT_CODEX_API_KEY',
  },
  gemini: {
    displayName: 'Gemini CLI',
    installation: 'workspace-agent-skill',
    inventory: 'gemini skills list',
    activation: 'activate_skill tool',
    requiredProfiles: ['offline', 'activation'],
    credentialGatedProfiles: ['canary'],
    canaryCredentialVariable: 'SYNTHEX_COMPAT_GEMINI_API_KEY',
  },
  opencode: {
    displayName: 'OpenCode',
    installation: 'project-agent-skills',
    inventory: 'opencode debug skill',
    activation: 'skill tool',
    requiredProfiles: ['offline', 'activation'],
    credentialGatedProfiles: ['canary'],
    canaryCredentialVariable: 'SYNTHEX_COMPAT_OPENCODE_API_KEY',
  },
};

export const harnessIds = Object.freeze(Object.keys(harnesses));

/**
 * Per-harness skill-catalog budgets (FR-HM9, Task 22). The `codex-activation`
 * and `opencode-activation` compat scenarios capture the actual
 * skill-catalog block a host renders into the model's context and fail the
 * scenario when it exceeds these numbers. See
 * `tests/compat/baselines/README.md` for how the underlying baselines were
 * captured.
 */
export const catalogBudgets = {
  codex: {
    // Codex's app-server `skills/list` catalog. Measured 4,156 chars across
    // all 46 `synthex:*` skills after the Task 19 description diet (and
    // unchanged through Tasks 20-21, which touched wrapper bodies, not
    // frontmatter descriptions). Codex's own catalog truncation budget is
    // ~8,000 chars (see `tests/compat/baselines/README.md`); this ceiling
    // leaves headroom before the description diet needs revisiting as more
    // commands gain descriptions.
    maxTotalRenderedChars: 6_000,
    maxBlankDescriptionCount: 0,
    maxShortenedDescriptionCount: 0,
  },
  opencode: {
    // The `<available_skills>` system-prompt block byte size. Task 19's
    // pre-diet baseline was 16,037 bytes; the plan's original Task 22
    // target was <= 60% of that (9,622 bytes). Measured post-Tasks-19-21:
    // 12,717 bytes (79%). Of that, ~8,044 bytes (across the 46 synthex
    // skills) is fixed overhead this generator does not control -- XML
    // markup plus, per skill, the name and the absolute installed
    // `SKILL.md` path OpenCode renders (~60.5 bytes/skill average); only
    // ~4,156 bytes is description text, already at Task 19's
    // <=120-char-per-description cap. Holding that fixed overhead constant,
    // reaching 60% would require cutting total description bytes to
    // ~1,061 (an average of ~23 characters per skill) -- below usefulness.
    // Per the Task 22 escalation path, the budget is set to the measured
    // value plus 5% headroom instead of the unattainable 60% target; the
    // 60% figure in the plan is expected to be amended by the orchestrator.
    maxAvailableSkillsBlockBytes: 13_353,
  },
};

/**
 * @param {string} harness
 * @returns {Record<string, number>} the catalog budget recorded for
 *   `harness`.
 */
export function catalogBudget(harness) {
  const budget = catalogBudgets[harness];
  if (!budget) throw new Error(`No catalog budget recorded for harness: ${harness}`);
  return budget;
}

export function supportsProfile(harness, profile) {
  const metadata = harnesses[harness];
  return Boolean(
    metadata &&
      [...metadata.requiredProfiles, ...metadata.credentialGatedProfiles].includes(profile),
  );
}

export function capabilityPolicy(harness) {
  const metadata = harnesses[harness];
  if (!metadata) throw new Error(`Unknown harness: ${harness}`);
  return {
    required: metadata.requiredProfiles,
    credentialGated: metadata.credentialGatedProfiles,
    unsupported: 'documented-gap',
  };
}

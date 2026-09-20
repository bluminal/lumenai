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

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readExpectedEntrypoints,
  validateSkillTree,
} from '../compat/lib/contract.mjs';
import {
  createProbeOverlay,
  PROBE_MARKER,
} from '../compat/lib/probe-overlay.mjs';
import {
  CANARY_PROBE_COUNT,
  selectRepresentativeProbes,
} from '../compat/lib/canary.mjs';
import {
  capabilityPolicy,
  harnessIds,
  harnesses as harnessMetadata,
  profiles,
  supportsProfile,
} from '../compat/lib/harnesses.mjs';
import {
  AGENT_COUNT,
  COMMAND_COUNT,
  diffInventoryAgainstManifest,
  WRAPPER_COUNT,
} from '../compat/lib/inventory.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const pluginRoot = resolve(repoRoot, 'plugins/synthex');
const compatRoot = resolve(repoRoot, 'tests/compat');

describe('cross-harness compatibility contract', () => {
  const harnesses = harnessIds;

  it('derives a unique portable skill for every command and agent', () => {
    const entries = readExpectedEntrypoints(pluginRoot);

    expect(entries.filter(({ kind }) => kind === 'command')).toHaveLength(COMMAND_COUNT);
    expect(entries.filter(({ kind }) => kind === 'agent')).toHaveLength(AGENT_COUNT);
    expect(new Set(entries.map(({ id }) => id)).size).toBe(entries.length);
  });

  it('keeps tests/compat/lib/inventory.mjs in sync with the plugin manifest', () => {
    expect(diffInventoryAgainstManifest(pluginRoot)).toEqual([]);
  });

  it('keeps the generated skill tree in sync with the canonical manifest', () => {
    const entries = readExpectedEntrypoints(pluginRoot);

    expect(validateSkillTree(pluginRoot, entries)).toEqual({
      missing: [],
      unexpected: [],
      invalid: [],
    });
  });

  it('prevents the host runner from invoking an installed harness', () => {
    const runner = readFileSync(
      resolve(compatRoot, 'scripts/run-suite.mjs'),
      'utf8',
    );

    expect(runner).toContain('new Set(harnessIds)');
    expect(runner).toContain("['docker', 'podman'].includes(engine)");
    expect(runner).toContain("profile === 'canary' ? 'bridge' : 'none'");
    expect(runner).toContain("'--read-only'");
    expect(runner).toContain("'no-new-privileges'");
    expect(runner).toContain(
      "'/tmp:rw,exec,nosuid,nodev,size=256m,uid=10001,gid=10001'",
    );
    expect(runner).toMatch(/`HARNESS_VERSION=\$\{harnessVersion\}`,\s*compatRoot/);
    expect(runner).not.toMatch(/spawnSync\(['\"](?:claude|codex|opencode|gemini)/);
    expect(runner).not.toMatch(
      /['\"](?:ANTHROPIC_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY)['\"]/,
    );
    expect(runner).toContain("'SYNTHEX_COMPAT_CANARY_CREDENTIAL'");
    expect(runner).toContain('canaryCredentialVariable');
  });

  it('declares a shared required-profile policy for every supported harness', () => {
    expect(profiles).toEqual(['offline', 'activation', 'canary']);
    for (const harness of harnesses) {
      const metadata = harnessMetadata[harness];
      expect(metadata.requiredProfiles).toEqual(['offline', 'activation']);
      expect(metadata.credentialGatedProfiles).toEqual(['canary']);
      expect(metadata.canaryCredentialVariable).toBe(
        `SYNTHEX_COMPAT_${harness.toUpperCase()}_API_KEY`,
      );
      expect(supportsProfile(harness, 'offline')).toBe(true);
      expect(supportsProfile(harness, 'activation')).toBe(true);
      expect(supportsProfile(harness, 'canary')).toBe(true);
      expect(capabilityPolicy(harness).unsupported).toBe('documented-gap');
    }
  });

  it('keeps the oldest-supported lane explicit and stable by default', () => {
    const versions = JSON.parse(
      readFileSync(resolve(compatRoot, 'versions.lock.json'), 'utf8'),
    );
    const policy = JSON.parse(
      readFileSync(resolve(compatRoot, 'support-policy.json'), 'utf8'),
    );

    expect(policy.unsupportedCapabilityPolicy).toBe('documented-gap');
    for (const harness of harnesses) {
      expect(policy.harnesses[harness].oldestSupported).toBe(
        versions.harnesses[harness].version,
      );
    }
  });

  it.each(harnesses)('pins and isolates the %s adapter', (harness) => {
    const versions = JSON.parse(
      readFileSync(resolve(compatRoot, 'versions.lock.json'), 'utf8'),
    );
    const dockerfile = resolve(
      compatRoot,
      'harnesses',
      harness,
      'Dockerfile',
    );
    const scenario = resolve(
      compatRoot,
      'scenarios',
      `${harness}-offline.mjs`,
    );

    expect(versions.harnesses[harness].version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(versions.harnesses[harness].status).toBe('offline');
    expect(existsSync(dockerfile)).toBe(true);
    expect(existsSync(scenario)).toBe(true);
    expect(readFileSync(dockerfile, 'utf8')).toContain('USER 10001:10001');
  });

  it.each(harnesses)('provides an isolated %s activation scenario', (harness) => {
    const scenario = resolve(
      compatRoot,
      'scenarios',
      `${harness}-activation.mjs`,
    );
    const contents = readFileSync(scenario, 'utf8');

    expect(existsSync(scenario)).toBe(true);
    expect(contents).toContain('createProbeOverlay');
    expect(contents).toContain("profile = 'activation'");
    expect(contents).toContain("emit(harness, 'activate'");
  });

  it.each(harnesses)('provides a credential-gated %s real-provider canary', (harness) => {
    const scenario = resolve(
      compatRoot,
      'scenarios',
      `${harness}-canary.mjs`,
    );
    const contents = readFileSync(scenario, 'utf8');

    expect(existsSync(scenario)).toBe(true);
    expect(contents).toContain("profile = 'canary'");
    expect(contents).toContain('canaryCredential');
    expect(contents).toContain('selectRepresentativeProbes');
    expect(contents).toContain('assertCanaryToken');
  });

  it('limits authenticated canaries to main with one dedicated credential per harness', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/authenticated-compatibility-canary.yml'),
      'utf8',
    );

    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('--profile canary');
    for (const harness of harnesses) {
      expect(workflow).toContain(
        `SYNTHEX_COMPAT_${harness.toUpperCase()}_API_KEY`,
      );
    }
    expect(workflow).not.toContain('~/.codex');
    expect(workflow).not.toContain('~/.claude');
  });

  it('gates the staged release artifact on the stable compatibility matrix', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/release.yml'),
      'utf8',
    );
    const compatibilityIndex = workflow.indexOf(
      'Validate release artifact compatibility',
    );
    const publishIndex = workflow.indexOf('Commit, tag, and push');

    expect(compatibilityIndex).toBeGreaterThan(0);
    expect(compatibilityIndex).toBeLessThan(publishIndex);
    expect(workflow).toContain('--profile offline');
    expect(workflow).toContain('--profile activation');
    expect(workflow).toContain('synthex-release-compatibility');
  });

  it('keeps atomically regenerated manifests readable by the isolated compatibility user', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/release.yml'),
      'utf8',
    );

    expect(workflow).toContain('chmod 644');
    expect(workflow).toContain('.claude-plugin/marketplace.json');
    expect(workflow).toContain('plugins/synthex/.claude-plugin/plugin.json');
    expect(workflow).toContain('plugins/synthex/.codex-plugin/plugin.json');
    expect(workflow).toContain('plugins/synthex-plus/.claude-plugin/plugin.json');
  });

  it('marks the cross-harness distribution release as a one-time major bump', () => {
    const intent = JSON.parse(
      readFileSync(resolve(repoRoot, '.release-intent.json'), 'utf8'),
    );
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/release.yml'),
      'utf8',
    );

    expect(intent.bump).toBe('major');
    expect(intent.reason).toContain('Codex CLI');
    expect(workflow).toContain('RELEASE_INTENT_FILE=".release-intent.json"');
    expect(workflow).toContain('Release intent raised bump');
  });

  it('builds unique activation probes without changing canonical prompts', () => {
    const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'synthex-compat-'));
    const overlayRoot = resolve(temporaryRoot, 'synthex');
    const canonicalBefore = readFileSync(
      resolve(pluginRoot, 'commands/review-code.md'),
      'utf8',
    );

    try {
      const probes = createProbeOverlay({
        pluginRoot,
        outputRoot: overlayRoot,
        runId: 'unit',
      });
      const reviewProbe = probes.find(({ id }) => id === 'review-code');

      expect(probes).toHaveLength(WRAPPER_COUNT);
      expect(new Set(probes.map(({ token }) => token)).size).toBe(WRAPPER_COUNT);
      expect(reviewProbe?.token).toBe(
        'SYNTHEX_COMPAT_unit_COMMAND_REVIEW_CODE',
      );
      expect(
        readFileSync(resolve(overlayRoot, 'commands/review-code.md'), 'utf8'),
      ).toContain(PROBE_MARKER);
      expect(
        readFileSync(resolve(overlayRoot, 'portable-skills/review-code/SKILL.md'), 'utf8'),
      ).toContain(reviewProbe?.token);
      expect(readFileSync(resolve(pluginRoot, 'commands/review-code.md'), 'utf8')).toBe(
        canonicalBefore,
      );
      expect(selectRepresentativeProbes(probes)).toHaveLength(CANARY_PROBE_COUNT);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

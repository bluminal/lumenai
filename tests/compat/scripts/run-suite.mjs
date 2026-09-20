#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { harnesses, harnessIds, profiles, supportsProfile } from '../lib/harnesses.mjs';

const compatRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(compatRoot, '../..');
const pluginRoot = join(repoRoot, 'plugins', 'synthex');
const versions = JSON.parse(
  readFileSync(join(compatRoot, 'versions.lock.json'), 'utf8'),
);
const supportPolicy = JSON.parse(
  readFileSync(join(compatRoot, 'support-policy.json'), 'utf8'),
);

const args = process.argv.slice(2);
const harnessIndex = args.indexOf('--harness');
const requestedHarness = harnessIndex >= 0 ? args[harnessIndex + 1] : 'all';
const profileIndex = args.indexOf('--profile');
const profile = profileIndex >= 0 ? args[profileIndex + 1] : 'offline';
const versionLaneIndex = args.indexOf('--version-lane');
const versionLane = versionLaneIndex >= 0 ? args[versionLaneIndex + 1] : 'stable';
const reportDirIndex = args.indexOf('--report-dir');
const reportDir =
  reportDirIndex >= 0 ? args[reportDirIndex + 1] : process.env.SYNTHEX_COMPAT_REPORT_DIR;
const rebuild = args.includes('--rebuild');
const allowedHarnesses = new Set(harnessIds);
const allowedProfiles = new Set(profiles);
const versionLanes = new Set(['stable', 'oldest', 'latest']);

if (requestedHarness !== 'all' && !allowedHarnesses.has(requestedHarness)) {
  console.error(
    `Harness ${JSON.stringify(requestedHarness)} is not implemented. Available: all, ${[
      ...allowedHarnesses,
    ].join(', ')}`,
  );
  process.exit(2);
}

if (!allowedProfiles.has(profile)) {
  console.error(
    `Profile ${JSON.stringify(profile)} is not implemented. Available: ${[
      ...allowedProfiles,
    ].join(', ')}`,
  );
  process.exit(2);
}

if (!versionLanes.has(versionLane)) {
  console.error(
    `Version lane ${JSON.stringify(versionLane)} is not implemented. Available: ${[
      ...versionLanes,
    ].join(', ')}`,
  );
  process.exit(2);
}

if (requestedHarness !== 'all' && !supportsProfile(requestedHarness, profile)) {
  console.error(
    `The ${profile} profile is not supported by ${requestedHarness}`,
  );
  process.exit(2);
}

const engine = process.env.SYNTHEX_CONTAINER_ENGINE ?? 'docker';
if (!['docker', 'podman'].includes(engine)) {
  console.error('SYNTHEX_CONTAINER_ENGINE must be exactly docker or podman');
  process.exit(2);
}

function run(commandArgs, options = {}) {
  const result = spawnSync(engine, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  return result;
}

if (reportDir) mkdirSync(reportDir, { recursive: true });

function writeReport(harness, lines) {
  if (!reportDir) return;
  writeFileSync(join(reportDir, `${harness}.ndjson`), lines.join('\n') + '\n');
}

function reportEvent(harness, details) {
  return JSON.stringify({
    harness,
    profile,
    versionLane,
    version: selectedVersion(harness),
    ...details,
  });
}

function selectedVersion(harness) {
  if (versionLane === 'stable') return versions.harnesses[harness]?.version;
  if (versionLane === 'latest') return 'latest';
  return supportPolicy.harnesses?.[harness]?.oldestSupported;
}

function redact(value, secrets) {
  let redacted = value;
  for (const secret of secrets.filter(Boolean)) {
    redacted = redacted.replaceAll(secret, '[REDACTED]');
  }
  return redacted
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)\S+/gi, '$1[REDACTED]')
    .replace(/(api[_-]?key\s*[:=]\s*)\S+/gi, '$1[REDACTED]');
}

function canaryRuntime(harness) {
  const credentialVariable = harnesses[harness].canaryCredentialVariable;
  const credential = process.env[credentialVariable];
  if (!credential) {
    return {
      error: `${credentialVariable} is required for the authenticated canary`,
      secrets: [],
    };
  }

  const model = process.env[`SYNTHEX_COMPAT_${harness.toUpperCase()}_MODEL`];
  const maxBudget = process.env.SYNTHEX_COMPAT_CANARY_MAX_BUDGET_USD;
  return {
    secrets: [credential],
    environment: {
      ...process.env,
      SYNTHEX_COMPAT_CANARY_CREDENTIAL: credential,
      ...(model ? { SYNTHEX_COMPAT_CANARY_MODEL: model } : {}),
      ...(maxBudget ? { SYNTHEX_COMPAT_CANARY_MAX_BUDGET_USD: maxBudget } : {}),
    },
    dockerArgs: [
      '--env',
      'SYNTHEX_COMPAT_CANARY_CREDENTIAL',
      ...(model
        ? ['--env', 'SYNTHEX_COMPAT_CANARY_MODEL']
        : []),
      ...(maxBudget
        ? ['--env', 'SYNTHEX_COMPAT_CANARY_MAX_BUDGET_USD']
        : []),
    ],
  };
}

const selectedHarnesses =
  requestedHarness === 'all' ? [...allowedHarnesses] : [requestedHarness];
let failed = false;

for (const harness of selectedHarnesses) {
  if (!supportsProfile(harness, profile)) {
    writeReport(harness, [
      reportEvent(harness, {
        phase: 'unsupported',
        ok: false,
        error: `${harness} does not support the ${profile} profile`,
      }),
    ]);
    console.error(`${harness} does not support the ${profile} profile`);
    failed = true;
    continue;
  }
  const harnessVersion = selectedVersion(harness);
  if (!harnessVersion) {
    writeReport(harness, [
      reportEvent(harness, {
        phase: 'version',
        ok: false,
        error: `No ${versionLane} version is configured for ${harness}`,
      }),
    ]);
    console.error(`No ${versionLane} version is configured for ${harness}`);
    failed = true;
    continue;
  }
  const image = `synthex-compat-${harness}:${versionLane}-${harnessVersion}`;
  const dockerfile = join(compatRoot, 'harnesses', harness, 'Dockerfile');
  const canary = profile === 'canary' ? canaryRuntime(harness) : null;
  if (canary?.error) {
    writeReport(harness, [
      reportEvent(harness, { phase: 'environment', ok: false, error: canary.error }),
    ]);
    console.error(canary.error);
    failed = true;
    continue;
  }
  const inspect = run(['image', 'inspect', image], { capture: true });

  if (rebuild || inspect.status !== 0) {
    const buildCommand =
      engine === 'docker' && process.env.SYNTHEX_COMPAT_BUILD_CACHE
        ? 'buildx'
        : 'build';
    const buildArgs = [
      buildCommand,
      ...(buildCommand === 'buildx' ? ['build', '--load'] : []),
      '--file',
      dockerfile,
      '--tag',
      image,
      '--build-arg',
      `NODE_IMAGE=node:${versions.container.node}`,
      '--build-arg',
      `HARNESS_VERSION=${harnessVersion}`,
      compatRoot,
    ];
    if (buildCommand === 'buildx') {
      const scope =
        process.env.SYNTHEX_COMPAT_CACHE_SCOPE ?? `synthex-compat-${harness}`;
      buildArgs.splice(-1, 0,
        '--cache-from',
        `type=gha,scope=${scope}`,
        '--cache-to',
        `type=gha,mode=max,scope=${scope},ignore-error=true`,
      );
    }
    const build = run(buildArgs);
    if (build.status !== 0) {
      writeReport(harness, [
        reportEvent(harness, {
          phase: 'build',
          ok: false,
          error: `Container image build failed with exit code ${build.status}`,
        }),
      ]);
      failed = true;
      continue;
    }
  }

  const container = run([
    'run',
    '--rm',
    '--network',
    profile === 'canary' ? 'bridge' : 'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '256',
    '--memory',
    '1g',
    '--cpus',
    '2',
    '--tmpfs',
    '/home/synthex-test:rw,noexec,nosuid,nodev,size=256m,uid=10001,gid=10001',
    '--tmpfs',
    '/workspace:rw,exec,nosuid,nodev,size=256m,uid=10001,gid=10001',
    '--tmpfs',
    '/tmp:rw,exec,nosuid,nodev,size=256m,uid=10001,gid=10001',
    '--mount',
    `type=bind,src=${pluginRoot},dst=/fixture/synthex,readonly`,
    '--env',
    'SYNTHEX_COMPAT_CONTAINER=1',
    '--env',
    'HOME=/home/synthex-test',
    '--env',
    'XDG_CONFIG_HOME=/home/synthex-test/.config',
    '--env',
    'XDG_CACHE_HOME=/home/synthex-test/.cache',
    '--env',
    'XDG_DATA_HOME=/home/synthex-test/.local/share',
    ...(canary?.dockerArgs ?? []),
    '--workdir',
    '/workspace',
    '--entrypoint',
    'node',
    image,
    `/opt/synthex-compat/scenarios/${harness}-${profile}.mjs`,
  ], { capture: true, env: canary?.environment });
  const stdout = redact(container.stdout ?? '', canary?.secrets ?? []);
  const stderr = redact(container.stderr ?? '', canary?.secrets ?? []);
  if (stdout) process.stdout.write(stdout.endsWith('\n') ? stdout : `${stdout}\n`);
  if (stderr) process.stderr.write(stderr.endsWith('\n') ? stderr : `${stderr}\n`);
  writeReport(harness, [
    reportEvent(harness, {
      phase: 'runner',
      ok: container.status === 0,
      exitCode: container.status,
    }),
    ...stdout.split('\n').filter(Boolean),
  ]);
  if (container.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);

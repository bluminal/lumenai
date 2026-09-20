import { accessSync, constants, existsSync, readFileSync } from 'node:fs';

function fail(message) {
  throw new Error(`Isolation guard failed: ${message}`);
}

export function assertIsolatedEnvironment() {
  if (process.env.SYNTHEX_COMPAT_CONTAINER !== '1') {
    fail('SYNTHEX_COMPAT_CONTAINER=1 is required');
  }
  if (process.env.HOME !== '/home/synthex-test') {
    fail('HOME must be /home/synthex-test');
  }
  if (process.cwd() !== '/workspace') {
    fail('working directory must be /workspace');
  }
  if (!existsSync('/fixture/synthex')) {
    fail('the read-only Synthex fixture is missing');
  }
  if (existsSync('/var/run/docker.sock')) {
    fail('the Docker socket must not be mounted');
  }
  if (existsSync('/host') || existsSync('/mnt/host')) {
    fail('a host filesystem mount was detected');
  }

  try {
    accessSync('/fixture/synthex', constants.W_OK);
    fail('/fixture/synthex must not be writable');
  } catch (error) {
    if (String(error).includes('Isolation guard failed')) throw error;
  }

  const mountInfo = existsSync('/proc/self/mountinfo')
    ? readFileSync('/proc/self/mountinfo', 'utf8')
    : '';
  for (const requiredMount of ['/home/synthex-test', '/workspace']) {
    const escaped = requiredMount.replaceAll(' ', '\\040');
    if (!mountInfo.split('\n').some((line) => line.includes(` ${escaped} `))) {
      fail(`${requiredMount} must be a dedicated runtime mount`);
    }
  }

  return {
    home: process.env.HOME,
    workspace: process.cwd(),
    fixture: '/fixture/synthex',
  };
}

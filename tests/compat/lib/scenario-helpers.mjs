import { spawn, spawnSync } from 'node:child_process';

function commandEnvironment(overrides) {
  return {
    ...process.env,
    NO_COLOR: '1',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    ...overrides,
  };
}

export function emit(harness, phase, details) {
  console.log(JSON.stringify({ harness, phase, ...details }));
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? '/workspace',
    encoding: 'utf8',
    timeout: options.timeout ?? 60_000,
    env: commandEnvironment(options.env),
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}): ${
        result.stderr || result.stdout
      }`,
    );
  }

  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

export function runCommandAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? '/workspace',
      env: commandEnvironment(options.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error(`${command} ${args.join(' ')} timed out`));
    }, options.timeout ?? 60_000);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish(error));
    child.on('exit', (status) => {
      if (status !== 0) {
        finish(
          new Error(
            `${command} ${args.join(' ')} failed (${status}): ${stderr || stdout}`,
          ),
        );
        return;
      }
      finish(null, { stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export function parseLastJsonLine(output) {
  try {
    return JSON.parse(output);
  } catch {
    // Fall back to CLIs that put status lines before a final compact JSON value.
  }

  const lines = output.split('\n').filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Some CLIs print status messages before their final JSON value.
    }
  }
  throw new Error(`No JSON value found in output: ${output.slice(0, 2_000)}`);
}

export function idsMentionedInOutput(entries, output) {
  return entries
    .filter(({ id }) => {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9-])${escaped}([^a-z0-9-]|$)`, 'm').test(
        output,
      );
    })
    .map(({ id }) => id);
}

/**
 * Promptfoo custom provider — wraps `claude -p` for agent invocation.
 *
 * Promptfoo invokes this script via `exec:node tests/helpers/claude-provider.js`.
 * The script reads the prompt from stdin (or the first CLI argument) and writes
 * the agent's response to stdout.
 *
 * Expected promptfoo vars (set per-test):
 *   - agent:         Agent filename without .md extension (e.g. "terraform-plan-reviewer")
 *   - input:         Direct text input (mutually exclusive with input_file)
 *   - input_file:    Path to a fixture file whose contents become the input
 *   - extra_context: Optional additional context appended to the input
 *
 * Provider config (set in promptfoo.config.yaml):
 *   - maxTurns: Maximum agentic turns (default: 1)
 *   - model:    Model identifier (default: "sonnet")
 *
 * How it works:
 *   1. Promptfoo passes the rendered prompt as the first CLI arg or stdin
 *   2. This script parses the vars from the prompt JSON envelope
 *   3. It invokes `claude -p` with the agent's .md as system prompt
 *   4. Results are cached to avoid redundant LLM calls
 *   5. The agent's raw output is written to stdout for promptfoo to assert against
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Resolve claude binary
// ---------------------------------------------------------------------------

function findClaudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const candidates = [
    join(process.env.HOME || '', '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return 'claude';
}

const CLAUDE_BIN = findClaudeBin();

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const AGENTS_DIR = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents');
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');
const CACHE_DIR = join(__dirname, '..', '.cache');

// ---------------------------------------------------------------------------
// Cache helpers (duplicated from cache.ts to avoid TS compilation dependency)
// ---------------------------------------------------------------------------

function getCacheKey(agentContent, fixtureContent, model = 'default') {
  const hash = createHash('sha256');
  hash.update(agentContent);
  hash.update(fixtureContent);
  hash.update(model);
  return hash.digest('hex').substring(0, 16);
}

function getCached(key) {
  const path = join(CACHE_DIR, `${key}.txt`);
  if (existsSync(path)) {
    return readFileSync(path, 'utf-8');
  }
  return null;
}

function setCache(key, output) {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  writeFileSync(join(CACHE_DIR, `${key}.txt`), output, 'utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Promptfoo exec providers receive JSON on stdin with structure:
 *   { prompt, vars, config }
 *
 * The `prompt` field contains the rendered prompt string.
 * The `vars` field contains the test variables.
 * The `config` field contains provider-level configuration.
 */
async function main() {
  // Read stdin for the promptfoo envelope
  let inputData = '';

  // Check if data is being piped in
  if (!process.stdin.isTTY) {
    inputData = await new Promise((resolve) => {
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', () => resolve(data));
    });
  }

  // Also check CLI argument
  if (!inputData && process.argv[2]) {
    inputData = process.argv[2];
  }

  if (!inputData) {
    process.stderr.write('Error: No input received. Expected JSON on stdin or as CLI arg.\n');
    process.exit(1);
  }

  let envelope;
  try {
    envelope = JSON.parse(inputData);
  } catch {
    // If it's not JSON, treat the entire input as a plain prompt
    // This handles the case where promptfoo passes a rendered string
    envelope = { prompt: inputData, vars: {}, config: {} };
  }

  const { vars = {}, config = {} } = envelope;
  const prompt = envelope.prompt || '';

  // Extract agent name
  const agentName = vars.agent;
  if (!agentName) {
    process.stderr.write('Error: Missing required var "agent". Set it in the promptfoo test vars.\n');
    process.exit(1);
  }

  // Resolve agent path
  const agentPath = join(AGENTS_DIR, `${agentName}.md`);
  if (!existsSync(agentPath)) {
    process.stderr.write(`Error: Agent file not found: ${agentPath}\n`);
    process.exit(1);
  }

  // Build the input text
  let input = '';

  if (vars.input_file) {
    // Load fixture file
    const fixturePath = join(FIXTURES_DIR, vars.input_file);
    if (!existsSync(fixturePath)) {
      // Try as absolute path
      if (existsSync(vars.input_file)) {
        input = readFileSync(vars.input_file, 'utf-8');
      } else {
        process.stderr.write(`Error: Fixture file not found: ${fixturePath}\n`);
        process.exit(1);
      }
    } else {
      input = readFileSync(fixturePath, 'utf-8');
    }
  } else if (vars.input) {
    input = vars.input;
  } else if (prompt) {
    input = prompt;
  }

  // Append extra context if provided
  if (vars.extra_context) {
    input = `${input}\n\nAdditional context: ${vars.extra_context}`;
  }

  if (!input) {
    process.stderr.write('Error: No input resolved. Provide "input", "input_file", or a prompt.\n');
    process.exit(1);
  }

  // Provider config
  const model = config.model || 'sonnet';
  const maxTurns = config.maxTurns || 3;

  // Check cache
  const agentContent = readFileSync(agentPath, 'utf-8');
  const cacheKey = getCacheKey(agentContent, input, model);
  const cached = getCached(cacheKey);

  if (cached) {
    process.stderr.write(`[cache hit] ${agentName} (key=${cacheKey})\n`);
    process.stdout.write(cached);
    return;
  }

  process.stderr.write(`[cache miss] Invoking ${agentName} via claude -p (model=${model}, maxTurns=${maxTurns})...\n`);

  // Build claude CLI command
  const cmd = [
    CLAUDE_BIN,
    '-p',
    '--output-format', 'text',
    '--max-turns', String(maxTurns),
    '--model', model,
    '--system-prompt', `"${agentPath}"`,
  ].join(' ');

  // Remove CLAUDECODE from env so we don't hit the "nested session" guard
  const env = { ...process.env };
  delete env.CLAUDECODE;

  try {
    const result = execSync(cmd, {
      input,
      env,
      encoding: 'utf-8',
      timeout: 180_000, // 3 minutes
      maxBuffer: 2 * 1024 * 1024, // 2 MB
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Cache the result
    setCache(cacheKey, result);

    process.stdout.write(result);
  } catch (error) {
    const stderr = error.stderr ? `\nClaude stderr: ${error.stderr}` : '';
    process.stderr.write(`Error invoking claude: ${error.message}${stderr}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Unhandled error: ${err.message}\n`);
  process.exit(1);
});

/**
 * Agent invocation wrapper for the test framework.
 *
 * Calls the Claude CLI (`claude -p`) with an agent's markdown file as the
 * system prompt, pipes the fixture/input via stdin, and returns both the raw
 * output and a parsed representation.
 *
 * Uses the file-based cache layer to avoid redundant (and expensive) LLM
 * calls when the agent definition and input have not changed.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getCacheKey, getCached, setCache } from './cache.js';
import { parseMarkdownOutput, type ParsedOutput } from './parse-markdown-output.js';

const AGENTS_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  'plugins',
  'autonomous-org',
  'agents',
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvokeOptions {
  /** Agent filename without the .md extension (e.g. "terraform-plan-reviewer") */
  agent: string;
  /** The prompt / input text to send to the agent */
  input: string;
  /** Maximum number of agentic turns (default: 1 for advisory agents) */
  maxTurns?: number;
  /** Whether to use the file cache (default: true) */
  useCache?: boolean;
  /** Model identifier passed to the CLI (default: "sonnet") */
  model?: string;
  /** Timeout in milliseconds (default: 120 000 = 2 minutes) */
  timeout?: number;
}

export interface InvokeResult {
  /** Raw text output from the agent */
  raw: string;
  /** Structured parse of the output */
  parsed: ParsedOutput;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Invoke an Autonomous Organization agent via the Claude CLI.
 *
 * The agent's markdown file is passed as the system prompt. The input is
 * piped through stdin. The raw output and its parsed form are returned.
 *
 * Results are cached by default so that repeated test runs with the same
 * agent + input + model combination do not incur additional LLM costs.
 */
export async function invokeAgent(opts: InvokeOptions): Promise<InvokeResult> {
  const agentPath = join(AGENTS_DIR, `${opts.agent}.md`);
  const agentContent = readFileSync(agentPath, 'utf-8');
  const model = opts.model ?? 'sonnet';
  const cacheKey = getCacheKey(agentContent, opts.input, model);

  // Check cache first
  if (opts.useCache !== false) {
    const cached = getCached(cacheKey);
    if (cached) {
      return { raw: cached, parsed: parseMarkdownOutput(cached) };
    }
  }

  // Build the Claude CLI command.
  //
  // `claude -p` runs in non-interactive (pipe) mode:
  //   - reads input from stdin
  //   - writes output to stdout
  //   - --output-format text  gives plain text (no JSON wrapper)
  //   - --max-turns N         limits agentic loop iterations
  //   - --model               selects the model
  //
  // The system prompt is provided via --system-prompt flag with the agent
  // markdown file contents. We write it to a temp approach using cat to
  // avoid shell escaping issues with large markdown documents.
  const maxTurns = opts.maxTurns ?? 1;
  const timeout = opts.timeout ?? 120_000;

  // Use a heredoc-safe approach: pass agent path to cat inside the command
  // to avoid any escaping issues with the agent markdown content.
  const cmd = [
    'claude',
    '-p',
    '--output-format', 'text',
    '--max-turns', String(maxTurns),
    '--model', model,
    '--system-prompt', agentPath,
  ].join(' ');

  // NOTE: The exact CLI flags may need adjustment as the Claude Code CLI
  // evolves. The key contract is:
  //   - stdin  = user input / fixture content
  //   - stdout = agent response text
  //   - system prompt loaded from the agent .md file

  try {
    const result = execSync(cmd, {
      input: opts.input,
      encoding: 'utf-8',
      timeout,
      maxBuffer: 1024 * 1024, // 1 MB
      stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr all piped
    });

    // Cache the successful result
    if (opts.useCache !== false) {
      setCache(cacheKey, result);
    }

    return { raw: result, parsed: parseMarkdownOutput(result) };
  } catch (error: any) {
    // Include stderr in the error message when available
    const stderr = error.stderr ? `\nstderr: ${error.stderr}` : '';
    throw new Error(
      `Agent invocation failed for "${opts.agent}" (model=${model}, maxTurns=${maxTurns}): ` +
        `${error.message}${stderr}`,
    );
  }
}

/**
 * Convenience wrapper that loads a fixture file from the fixtures directory
 * and invokes the agent with its contents.
 */
export async function invokeAgentWithFixture(
  agent: string,
  fixturePath: string,
  overrides?: Partial<Omit<InvokeOptions, 'agent' | 'input'>>,
): Promise<InvokeResult> {
  const fixturesDir = join(import.meta.dirname, '..', 'fixtures');
  const fullPath = join(fixturesDir, fixturePath);
  const input = readFileSync(fullPath, 'utf-8');

  return invokeAgent({
    agent,
    input,
    ...overrides,
  });
}

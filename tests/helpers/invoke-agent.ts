/**
 * Agent invocation wrapper for the test framework.
 *
 * Calls the Claude CLI (`claude -p`) with an agent's markdown file as the
 * system prompt, pipes the fixture/input via stdin, and returns both the raw
 * output and a parsed representation.
 *
 * Uses the file-based cache layer to avoid redundant (and expensive) LLM
 * calls when the agent definition and input have not changed.
 *
 * Per FR-HM14, the model and effort tier are read from the invoked agent's
 * own frontmatter (`model:` / `effort:`) rather than hardcoded, so that
 * re-tiering an agent (e.g. code-reviewer: haiku -> sonnet, effort: medium)
 * is picked up automatically and invalidates any cached output for that
 * agent (see `getCacheKey` in ./cache.ts).
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
  'synthex',
  'agents',
);

/** Model used when an agent's frontmatter has no `model:` key. */
export const DEFAULT_MODEL = 'sonnet';

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

export interface AgentFrontmatter {
  /** Value of the frontmatter `model:` key, if present. */
  model?: string;
  /** Value of the frontmatter `effort:` key, if present. */
  effort?: string;
}

/** Matches a leading `---\n ... \n---` YAML frontmatter block. */
const FRONTMATTER_BLOCK_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Matches a flat `key: value` scalar line inside the frontmatter block.
 * Synthex agent frontmatter (see plugins/synthex/agents/*.md) is a small
 * set of flat scalars (`model`, `effort`, `description`, `tools`, ...), so
 * a hand parser for the two keys we need avoids pulling in a YAML
 * dependency here. tests/schemas/*.test.ts parse the same block the same
 * way (slice between the `---` delimiters, regex per line).
 */
const SCALAR_LINE_RE = /^([A-Za-z][\w-]*):\s*(.+?)\s*$/;

/**
 * Parse an agent markdown file's frontmatter and extract the `model:` and
 * `effort:` scalar values, if present. Returns `{}` when the file has no
 * frontmatter block or neither key is set.
 */
export function parseAgentFrontmatter(agentContent: string): AgentFrontmatter {
  const match = agentContent.match(FRONTMATTER_BLOCK_RE);
  if (!match) return {};

  const result: AgentFrontmatter = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(SCALAR_LINE_RE);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    // Strip a single layer of matching quotes, e.g. model: "haiku"
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
    if (key === 'model') result.model = value;
    if (key === 'effort') result.effort = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Effort CLI flag
// ---------------------------------------------------------------------------

/**
 * Build the `claude -p` argument list that selects an effort level, or `[]`
 * when no effort tier applies.
 *
 * ASSUMPTION (documented per FR-HM14 rather than guessed silently): the
 * installed Claude Code CLI accepts a top-level `--effort <level>` flag —
 * confirmed via `claude --help` on CLI v2.1.281: "Effort level for the
 * current session (low, medium, high, xhigh, max)". What is *not* yet
 * verified is whether every model in the roster (notably Haiku 4.5) honors
 * the flag rather than silently ignoring it — that empirical check is
 * FR-HM14's own spike (Milestone 1.2, Task 7 / OQ-3, OQ-4). This function
 * is the single seam to update if that spike finds the flag needs to be
 * conditioned on model, or swapped for a different mechanism.
 */
export function buildEffortArgs(effort: string | undefined): string[] {
  if (!effort) return [];
  return ['--effort', effort];
}

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
  /**
   * Model identifier passed to the CLI. Defaults to the agent's own
   * frontmatter `model:` value, falling back to `DEFAULT_MODEL` ("sonnet")
   * when the agent has no frontmatter or no `model:` key.
   */
  model?: string;
  /**
   * Effort level passed to the CLI via `--effort`. Defaults to the agent's
   * own frontmatter `effort:` value. When neither is set, no `--effort`
   * flag is passed (CLI/session default applies).
   */
  effort?: string;
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
 * Invoke an Synthex agent via the Claude CLI.
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
  const frontmatter = parseAgentFrontmatter(agentContent);
  const model = opts.model ?? frontmatter.model ?? DEFAULT_MODEL;
  const effort = opts.effort ?? frontmatter.effort;
  const cacheKey = getCacheKey(agentContent, opts.input, model, effort);

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
  //   - --effort              selects the effort tier (see buildEffortArgs)
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
    ...buildEffortArgs(effort),
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
      `Agent invocation failed for "${opts.agent}" (model=${model}, effort=${effort ?? 'default'}, maxTurns=${maxTurns}): ` +
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

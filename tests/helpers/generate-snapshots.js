#!/usr/bin/env node

/**
 * Golden snapshot generator.
 *
 * Invokes each agent against its corresponding fixtures via `claude -p`,
 * saves the output as golden snapshots in tests/__snapshots__/.
 *
 * Usage:
 *   node helpers/generate-snapshots.js              # Generate missing snapshots only
 *   node helpers/generate-snapshots.js --update      # Regenerate all snapshots
 *   node helpers/generate-snapshots.js --agent terraform-plan-reviewer  # Single agent
 *
 * Each snapshot is named: {agent}--{fixture-path}.snap.md
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, extname, relative } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Resolve claude binary
// ---------------------------------------------------------------------------

function findClaudeBin() {
  // Allow override via env
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;

  // Common install locations
  const candidates = [
    join(process.env.HOME || '', '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Fallback — hope it's in PATH
  return 'claude';
}

const CLAUDE_BIN = findClaudeBin();

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const AGENTS_DIR = join(__dirname, '..', '..', 'plugins', 'autonomous-org', 'agents');
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');
const SNAPSHOT_DIR = join(__dirname, '..', '__snapshots__');
const CACHE_DIR = join(__dirname, '..', '.cache');

// ---------------------------------------------------------------------------
// Agent → Fixture mapping
// ---------------------------------------------------------------------------

const AGENT_FIXTURES = {
  'terraform-plan-reviewer': [
    'terraform/clean-plan.txt',
    'terraform/clean-plan.json',
    'terraform/destructive-rds.txt',
    'terraform/wide-open-sg.txt',
    'terraform/surprise-cost-poc.txt',
    'terraform/missing-tags.txt',
    'terraform/multi-issue.json',
    'terraform/empty-plan.txt',
  ],
  'security-reviewer': [
    'security/clean-code.diff',
    'security/hardcoded-secret.diff',
    'security/sql-injection.diff',
    'security/xss-vuln.diff',
    'security/missing-auth.diff',
    'security/weak-csrf.diff',
    'security/mixed-severity.diff',
  ],
};

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function getCacheKey(agentContent, fixtureContent, model) {
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
// Snapshot helpers
// ---------------------------------------------------------------------------

function getSnapshotPath(agent, fixture) {
  const sanitized = fixture
    .replace(/[/\\]/g, '--')
    .replace(/\.[^.]+$/, '');
  return join(SNAPSHOT_DIR, `${agent}--${sanitized}.snap.md`);
}

function snapshotExists(agent, fixture) {
  return existsSync(getSnapshotPath(agent, fixture));
}

function saveSnapshot(agent, fixture, output) {
  if (!existsSync(SNAPSHOT_DIR)) {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
  writeFileSync(getSnapshotPath(agent, fixture), output, 'utf-8');
}

// ---------------------------------------------------------------------------
// Agent invocation
// ---------------------------------------------------------------------------

function invokeAgent(agentName, input, model = 'sonnet') {
  const agentPath = join(AGENTS_DIR, `${agentName}.md`);
  const agentContent = readFileSync(agentPath, 'utf-8');

  // Check cache first
  const cacheKey = getCacheKey(agentContent, input, model);
  const cached = getCached(cacheKey);
  if (cached) {
    return { output: cached, fromCache: true };
  }

  // Invoke claude -p
  const cmd = [
    CLAUDE_BIN,
    '-p',
    '--output-format', 'text',
    '--max-turns', '3',
    '--model', model,
    '--system-prompt', `"${agentPath}"`,
  ].join(' ');

  // Remove CLAUDECODE from env so we don't hit the "nested session" guard
  const env = { ...process.env };
  delete env.CLAUDECODE;

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

  return { output: result, fromCache: false };
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const updateAll = args.includes('--update');
const agentFilter = args.includes('--agent')
  ? args[args.indexOf('--agent') + 1]
  : null;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Golden Snapshot Generator ===\n');
  console.log(`Mode: ${updateAll ? 'UPDATE ALL (regenerating existing snapshots)' : 'GENERATE MISSING ONLY'}`);
  if (agentFilter) {
    console.log(`Agent filter: ${agentFilter}`);
  }
  console.log('');

  let generated = 0;
  let skipped = 0;
  let cached = 0;
  let failed = 0;

  const agents = agentFilter
    ? { [agentFilter]: AGENT_FIXTURES[agentFilter] }
    : AGENT_FIXTURES;

  if (agentFilter && !AGENT_FIXTURES[agentFilter]) {
    console.error(`Unknown agent: ${agentFilter}`);
    console.error(`Available agents: ${Object.keys(AGENT_FIXTURES).join(', ')}`);
    process.exit(1);
  }

  for (const [agent, fixtures] of Object.entries(agents)) {
    console.log(`\n--- ${agent} ---`);

    for (const fixture of fixtures) {
      const snapPath = getSnapshotPath(agent, fixture);
      const shortSnap = relative(join(__dirname, '..'), snapPath);

      // Skip if snapshot exists and we're not in update mode
      if (!updateAll && snapshotExists(agent, fixture)) {
        console.log(`  SKIP  ${fixture} (snapshot exists)`);
        skipped++;
        continue;
      }

      // Load fixture
      const fixturePath = join(FIXTURES_DIR, fixture);
      if (!existsSync(fixturePath)) {
        console.log(`  ERROR ${fixture} (fixture file not found)`);
        failed++;
        continue;
      }

      const input = readFileSync(fixturePath, 'utf-8');

      try {
        process.stdout.write(`  RUN   ${fixture}...`);
        const { output, fromCache } = invokeAgent(agent, input);

        saveSnapshot(agent, fixture, output);

        if (fromCache) {
          console.log(` DONE (from cache) -> ${shortSnap}`);
          cached++;
        } else {
          console.log(` DONE (fresh LLM call) -> ${shortSnap}`);
        }
        generated++;
      } catch (error) {
        console.log(` FAILED: ${error.message}`);
        failed++;
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  Generated: ${generated} (${cached} from cache)`);
  console.log(`  Skipped:   ${skipped} (already existed)`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Total:     ${generated + skipped + failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Unhandled error: ${err.message}`);
  process.exit(1);
});

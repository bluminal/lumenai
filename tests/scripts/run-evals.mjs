#!/usr/bin/env node

/**
 * Hash-keyed skip wrapper around `claude plugin eval` for the Synthex plugin
 * eval suite (FR-HM34, Task 27; D28: >= 3 runs per fixture, gate = aggregate
 * recall >= baseline and no fixture loses > 1 planted issue).
 *
 * `claude plugin eval` has no cross-run cache of its own — every invocation
 * re-runs every case's `runs` agent calls, live, at cost. This wrapper hashes
 * (agent markdown content + fixture content + resolved model) per case
 * (mirrors tests/helpers/cache.ts's cache key, but keyed to the manifest in
 * tests/scripts/eval-cases.json rather than to a promptfoo test) and skips
 * re-running any case whose hash matches what is on record in the local
 * results cache (tests/.eval-cache/, gitignored — see tests/.gitignore).
 * A case's hash changes whenever the invoked agent's prompt changes (e.g.
 * Task 28/29 frontmatter or prose edits) or its fixture changes, which is
 * exactly when a fresh (paid) run is warranted.
 *
 * Usage:
 *   node tests/scripts/run-evals.mjs [options]
 *
 * Options:
 *   --case <id>          Only consider this case id (repeatable)
 *   --runs <n>           Runs per case, forwarded to the CLI (default: 3, per D28)
 *   --ablation <mode>    Forwarded to the CLI (default: with-without)
 *   --threshold <0..1>   Forwarded to the CLI (default: 1, i.e. no per-case gate)
 *   --concurrency <n>    Forwarded to the CLI (default: 1)
 *   --max-cost-usd <usd> Forwarded to the CLI, omitted if not set
 *   --force              Ignore the cache; re-run every selected case
 *   --json <path>        Write the merged aggregate report here
 *   --report-dir <dir>   Directory for the human-readable recall table
 *                        (default: tests/.eval-cache/reports)
 *
 * Exit code: non-zero if any RUN case's `claude plugin eval` invocation
 * itself exits non-zero (i.e. failed its own --threshold gate or aborted).
 * Cached (skipped) cases cannot fail — they already passed when cached.
 *
 * Plan: docs/plans/harness-modernization.md, Phase 3 / Milestone 3.1 / Task 27.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const pluginDir = join(repoRoot, 'plugins', 'synthex');
const manifestPath = join(repoRoot, 'tests', 'scripts', 'eval-cases.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const cacheDir = join(repoRoot, 'tests', '.eval-cache');
const cacheFile = join(cacheDir, 'results.json');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    cases: [],
    runs: 3,
    ablation: 'with-without',
    threshold: 1,
    concurrency: 1,
    maxCostUsd: undefined,
    force: false,
    json: undefined,
    reportDir: join(cacheDir, 'reports'),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--case':
        opts.cases.push(argv[++i]);
        break;
      case '--runs':
        opts.runs = Number(argv[++i]);
        break;
      case '--ablation':
        opts.ablation = argv[++i];
        break;
      case '--threshold':
        opts.threshold = Number(argv[++i]);
        break;
      case '--concurrency':
        opts.concurrency = Number(argv[++i]);
        break;
      case '--max-cost-usd':
        opts.maxCostUsd = Number(argv[++i]);
        break;
      case '--force':
        opts.force = true;
        break;
      case '--json':
        opts.json = argv[++i];
        break;
      case '--report-dir':
        opts.reportDir = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Frontmatter -> model (duplicated tiny parser: tests/helpers/cache.ts and
// tests/helpers/claude-provider.js both keep their own copy for the same
// reason — avoid a cross-module/TS-compile dependency in a plain node script)
// ---------------------------------------------------------------------------

const FRONTMATTER_BLOCK_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function resolveModel(agentContent) {
  const match = agentContent.match(FRONTMATTER_BLOCK_RE);
  if (!match) return 'sonnet';
  const modelLine = match[1].split('\n').find((l) => /^model:\s*/.test(l));
  if (!modelLine) return 'sonnet';
  return modelLine.replace(/^model:\s*/, '').replace(/^(['"])(.*)\1$/, '$2').trim();
}

function hashCase(entry) {
  const agentContent = readFileSync(
    join(repoRoot, 'plugins', 'synthex', 'agents', `${entry.agent}.md`),
    'utf-8',
  );
  const fixtureContent = readFileSync(join(repoRoot, entry.fixture), 'utf-8');
  const model = resolveModel(agentContent);
  const hash = createHash('sha256');
  hash.update(agentContent);
  hash.update(fixtureContent);
  hash.update(model);
  return { hash: hash.digest('hex').substring(0, 16), model };
}

// ---------------------------------------------------------------------------
// Cache I/O
// ---------------------------------------------------------------------------

function loadCache() {
  if (!existsSync(cacheFile)) return {};
  try {
    return JSON.parse(readFileSync(cacheFile, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Recall computation from a `claude plugin eval --json` result
// ---------------------------------------------------------------------------

function summarizeCaseResult(entry, caseResult) {
  const withRuns = caseResult.arms.with || [];
  const runCount = withRuns.length;

  const perRunVerdictPass = withRuns.map(
    (run) => run.graders.find((g) => g.name === '01-verdict')?.passed ?? false,
  );
  const verdictPassCount = perRunVerdictPass.filter(Boolean).length;

  const issuesFound = entry.plantedIssues.map((issue, index) => {
    const graderName = withRuns[0]?.graders?.find((g) => g.name.startsWith(`02-issue-${String(index + 1).padStart(2, '0')}-`))?.name;
    const perRunPass = withRuns.map(
      (run) => run.graders.find((g) => g.name === graderName)?.passed ?? false,
    );
    const passCount = perRunPass.filter(Boolean).length;
    return {
      label: issue.label,
      perRun: perRunPass,
      passCount,
      runCount,
      // Majority vote (>= half the runs) — a single run is too noisy to
      // gate on per D28; this is the recall unit counted in the aggregate.
      foundMajority: runCount > 0 && passCount * 2 >= runCount,
    };
  });

  const dispatchPerRun = withRuns.map(
    (run) => run.graders.find((g) => g.name === '00-agent-dispatch')?.passed ?? false,
  );

  return {
    id: entry.id,
    agent: entry.agent,
    fixture: entry.fixture,
    runCount,
    verdictPassCount,
    verdictPerRun: perRunVerdictPass,
    plantedCount: entry.plantedIssues.length,
    issuesFound,
    foundMajorityCount: issuesFound.filter((i) => i.foundMajority).length,
    dispatchPerRun,
    caseScore: caseResult.aggregates?.score ?? null,
    costUsd: withRuns.reduce((s, r) => s + (r.costUsd || 0), 0)
      + (caseResult.arms.without || []).reduce((s, r) => s + (r.costUsd || 0), 0),
    delta: caseResult.aggregates?.delta ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const selected = opts.cases.length > 0
    ? manifest.cases.filter((c) => opts.cases.includes(c.id))
    : manifest.cases;

  if (selected.length === 0) {
    console.error('No matching cases.');
    process.exit(1);
  }

  const cache = loadCache();
  const toRun = [];
  const summaries = [];
  let totalCostUsd = 0;
  let exitCode = 0;

  for (const entry of selected) {
    const { hash, model } = hashCase(entry);
    const cached = cache[entry.id];
    if (!opts.force && cached && cached.hash === hash) {
      summaries.push({ ...cached.summary, cached: true });
      totalCostUsd += cached.summary.costUsd || 0;
      continue;
    }
    toRun.push({ entry, hash, model });
  }

  console.log(
    `${selected.length} case(s) selected; ${toRun.length} to run, ${selected.length - toRun.length} skipped (cache hit).`,
  );

  for (const { entry, hash } of toRun) {
    const tmpJson = join(cacheDir, `.run-${entry.id}.json`);
    mkdirSync(cacheDir, { recursive: true });
    const args = [
      pluginDir,
      '--case', entry.id,
      '--runs', String(opts.runs),
      '--ablation', opts.ablation,
      '--threshold', String(opts.threshold),
      '--concurrency', String(opts.concurrency),
      '--trust-plugin',
      '--allow-tools', 'Agent',
      '--json', tmpJson,
    ];
    if (opts.maxCostUsd !== undefined) {
      args.push('--max-cost-usd', String(opts.maxCostUsd));
    }

    console.log(`\n[run] ${entry.id} (hash ${hash})`);
    let cliExit = 0;
    try {
      execFileSync('claude', ['plugin', 'eval', ...args], {
        stdio: 'inherit',
        cwd: pluginDir,
      });
    } catch (error) {
      cliExit = error.status ?? 1;
      exitCode = exitCode || cliExit;
    }

    if (!existsSync(tmpJson)) {
      console.error(`[error] ${entry.id}: no JSON result written (CLI exit ${cliExit})`);
      continue;
    }

    const result = JSON.parse(readFileSync(tmpJson, 'utf-8'));
    const caseResult = result.cases.find((c) => c.name === entry.id) ?? result.cases[0];
    const summary = summarizeCaseResult(entry, caseResult);
    summaries.push({ ...summary, cached: false });
    totalCostUsd += summary.costUsd;
    cache[entry.id] = { hash, summary, updatedAt: new Date().toISOString() };

    // Persist after every case, not just at the end: a suite of 18 cases at
    // 3 runs each can run for a long time, and a crash or interrupt should
    // not lose already-paid-for results.
    saveCache(cache);
  }

  // -------------------------------------------------------------------
  // Aggregate recall report
  // -------------------------------------------------------------------
  const totalPlanted = summaries.reduce((s, c) => s + c.plantedCount, 0);
  const totalFound = summaries.reduce((s, c) => s + c.foundMajorityCount, 0);
  const aggregateRecall = totalPlanted > 0 ? totalFound / totalPlanted : 1;

  const report = {
    generatedAt: new Date().toISOString(),
    selectedCases: selected.length,
    ranCases: toRun.length,
    cachedCases: selected.length - toRun.length,
    totalCostUsd,
    totalPlanted,
    totalFound,
    aggregateRecall,
    cases: summaries,
  };

  mkdirSync(opts.reportDir, { recursive: true });
  if (opts.json) {
    mkdirSync(dirname(resolve(opts.json)), { recursive: true });
    writeFileSync(opts.json, JSON.stringify(report, null, 2), 'utf-8');
  }
  writeFileSync(
    join(opts.reportDir, 'latest.json'),
    JSON.stringify(report, null, 2),
    'utf-8',
  );

  console.log('\n=== Recall summary ===');
  for (const c of summaries) {
    const found = c.plantedCount > 0 ? `${c.foundMajorityCount}/${c.plantedCount}` : 'n/a (0 planted)';
    console.log(
      `${c.id.padEnd(28)} planted=${found}  verdict=${c.verdictPassCount}/${c.runCount}  cost=$${(c.costUsd || 0).toFixed(3)}${c.cached ? '  [cached]' : ''}`,
    );
  }
  console.log(
    `\nAggregate recall: ${totalFound}/${totalPlanted} = ${(aggregateRecall * 100).toFixed(1)}%`,
  );
  console.log(`Total cost this run: $${totalCostUsd.toFixed(2)}`);

  process.exit(exitCode);
}

main();

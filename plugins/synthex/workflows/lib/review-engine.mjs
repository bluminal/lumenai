/**
 * plugins/synthex/workflows/lib/review-engine.mjs
 *
 * FR-HM16 workflow review engine — pure functions (Task 57, D4).
 *
 * This is the single source of truth for the dedupe, verdict-aggregation,
 * and render logic used by the `/synthex:review-code` FR-HM16 Workflow
 * engine (`../review-code-engine.js` — named `review-code-engine`, not
 * `review-code`, so the workflow's `meta.name` never shadows the
 * `/synthex:review-code` command; see the Task 9 addendum in
 * docs/specs/harness-modernization/spikes.md). It is a plain ES module
 * with zero
 * dependencies so `tests/schemas/review-engine-renderer.test.ts` can
 * `import` it directly under Node/Vitest — no Workflow runtime required
 * (per Task 57's instruction that the pure functions "live in an
 * importable module the test suite can load without the Workflow
 * runtime").
 *
 * ── Why the workflow script does not `import` this file ─────────────────
 * Workflow scripts run in a sandboxed plain-JS context with no filesystem
 * or Node.js module resolution (confirmed by the Task 9 spike,
 * docs/specs/harness-modernization/spikes.md, and the workflow-authoring
 * skill: "No filesystem or Node.js API access"). An `import` statement
 * inside a Workflow script is therefore not an option. The workflow
 * script instead carries an inlined copy of every function below, between
 * a pair of sync markers (see the sibling file's own header comment for
 * the exact marker text — not repeated here so this comment cannot be
 * mistaken for a marker by a naive text search).
 * `tests/schemas/review-engine-sync.test.ts` extracts both copies and
 * diffs them textually (after whitespace and comment normalization) on
 * every test run, so the two copies cannot silently drift apart. When
 * this file changes, copy the same function bodies into the workflow
 * script's marked block in the same commit.
 *
 * Also note: `Date.now()`, `Math.random()`, and argless `new Date()` are
 * unavailable inside a Workflow script (they would break resume). None of
 * the functions below use them — dates and any other non-determinism are
 * supplied by the caller via `args` or stamped after the workflow returns.
 */

// ── Severity ──────────────────────────────────────────────────────────────

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

export function severityRank(severity) {
  return SEVERITY_RANK[String(severity || '').toLowerCase()] || 0;
}

export function countsBySeverity(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings || []) {
    const sev = String(finding && finding.severity || '').toLowerCase();
    if (sev in counts) counts[sev] += 1;
  }
  return counts;
}

/**
 * Deterministic overall verdict from a list of consolidated findings.
 * Mirrors review-code.md Step 5's "Verdict consolidation rules": FAIL if
 * any CRITICAL or HIGH finding is present, WARN if only MEDIUM findings
 * remain, PASS otherwise. Per-reviewer envelopes carry no verdict field of
 * their own (FR-HM16 forces `{findings[], positives[], summary}`), so the
 * verdict is always derived from finding severities, never asked of an
 * agent — this keeps the verdict deterministic and cheap to test.
 */
export function aggregateVerdict(findings) {
  const counts = countsBySeverity(findings);
  if (counts.critical > 0 || counts.high > 0) return 'FAIL';
  if (counts.medium > 0) return 'WARN';
  return 'PASS';
}

export function sortFindingsBySeverity(findings) {
  return [...(findings || [])].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );
}

// ── Dedupe ────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'for', 'to',
  'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that',
  'it', 'its', 'as', 'at', 'by', 'from', 'not', 'no', 'does', 'do', 'did',
  'has', 'have', 'had',
]);

export function normalizeTitleTokens(title) {
  return new Set(
    String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((tok) => tok.length > 0 && !STOPWORDS.has(tok)),
  );
}

export function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const tok of setA) {
    if (setB.has(tok)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function normalizeFileKey(file) {
  return String(file || '').trim().toLowerCase();
}

/**
 * Same-location test, mirroring the multi-model orchestrator's Stage 5b
 * contradiction-scanner definition (docs/specs/multi-model-review/
 * architecture.md): same symbol (when both findings name one), OR their
 * `line_range`s overlap or sit within `maxGap` lines of each other. Used
 * here as a dedupe corroboration signal, not a contradiction signal.
 */
function linesOverlapOrNear(rangeA, rangeB, maxGap = 5) {
  if (!rangeA || !rangeB) return false;
  if (typeof rangeA.start !== 'number' || typeof rangeB.start !== 'number') return false;
  const endA = typeof rangeA.end === 'number' ? rangeA.end : rangeA.start;
  const endB = typeof rangeB.end === 'number' ? rangeB.end : rangeB.start;
  if (rangeA.start <= endB && rangeB.start <= endA) return true; // overlap
  const gap = rangeA.start > endB ? rangeA.start - endB : rangeB.start - endA;
  return gap <= maxGap;
}

function sameLocation(a, b) {
  if (a.symbol && b.symbol && a.symbol === b.symbol) return true;
  return linesOverlapOrNear(a.line_range, b.line_range);
}

function asRaisedByEntry(finding) {
  const source = finding.source || {};
  return {
    reviewer_id: source.reviewer_id || finding.reviewer_id || 'unknown',
    family: source.family || finding.family || 'unknown',
    source_type: source.source_type || 'native-team',
    severity: finding.severity,
  };
}

function mergeTwoFindings(base, incoming) {
  const baseRaisedBy = base.raised_by && base.raised_by.length
    ? base.raised_by
    : [asRaisedByEntry(base)];
  const incomingRaisedBy = incoming.raised_by && incoming.raised_by.length
    ? incoming.raised_by
    : [asRaisedByEntry(incoming)];

  const seen = new Set(baseRaisedBy.map((r) => `${r.reviewer_id}::${r.source_type}`));
  const mergedRaisedBy = [...baseRaisedBy];
  for (const entry of incomingRaisedBy) {
    const key = `${entry.reviewer_id}::${entry.source_type}`;
    if (!seen.has(key)) {
      seen.add(key);
      mergedRaisedBy.push(entry);
    }
  }

  const incomingWins = severityRank(incoming.severity) > severityRank(base.severity);
  const primary = incomingWins ? incoming : base;
  const severitiesSeen = new Set(mergedRaisedBy.map((r) => r.severity).filter(Boolean));

  // Keep BOTH reviewers' categories rather than arbitrarily discarding
  // one via the severity-based primary pick above — two reviewers merged
  // into one finding (Stage 2) frequently categorize the same underlying
  // issue differently (e.g. code-reviewer: "Correctness", security-
  // reviewer: "Secrets & Sensitive Data Leakage" for the same hardcoded
  // secret). "Only default when it's missing": `category` still falls
  // back to nothing here — renderFindingBlock's `|| 'uncategorized'` is
  // the sole default, applied only when every contributing category was
  // empty.
  const categories = [base.category, incoming.category].filter(Boolean);
  const mergedCategory = [...new Set(categories)].join(' / ');

  return {
    ...primary,
    raised_by: mergedRaisedBy,
    severity: incomingWins ? incoming.severity : base.severity,
    severity_disagreement: severitiesSeen.size > 1,
    ...(mergedCategory ? { category: mergedCategory } : {}),
  };
}

/**
 * Stamps every finding with the reviewer identity the caller knows it
 * invoked, overwriting whatever (if anything) the finding's own `source`
 * field said. The forced per-reviewer envelope schema (`{findings[],
 * positives[], summary}`) does not require `source`, and reviewer agents
 * reliably omit it — a Task 57 live run rendered "Raised by: unknown" on
 * every finding as a result. The script always knows which `agentType` it
 * just called, so that is authoritative; this function makes stamping it
 * a pure, testable step rather than inline object-spreading at the call
 * site.
 */
export function stampReviewerSource(findings, source) {
  return (findings || []).filter(Boolean).map((finding) => ({ ...finding, source }));
}

/**
 * Plain-JS dedupe (FR-HM16: "dedupes in plain JS by finding_id and
 * fingerprint"), a simplified mirror of the multi-model-review
 * orchestrator's Stage 1 (exact finding_id collapse) and Stage 2 (lexical
 * dedup within a bucket) — see docs/specs/multi-model-review/
 * architecture.md. Unlike the orchestrator, there is no Stage 4 LLM
 * tiebreaker: this dedupe never spawns an agent, by design (FR-HM16's
 * "dedupes in plain JS").
 *
 * Stage 1 — exact `finding_id` collapse.
 * Stage 2 — within each `file` bucket (the orchestrator buckets by
 * `(file, symbol)`; native findings frequently have a null symbol, so this
 * engine buckets by `file` alone), merge a pair when EITHER:
 *   (a) normalized-title Jaccard similarity is at or above
 *       `jaccardThreshold` (default 0.8, same default as
 *       `consolidation.stage2_jaccard_threshold`) regardless of location, or
 *   (b) the pair is at the same location (`sameLocation`: matching symbol,
 *       or overlapping/near `line_range`s — the same definition the
 *       orchestrator's Stage 5b contradiction scanner uses for "same
 *       location") AND Jaccard is at or above the lower
 *       `locationJaccardThreshold` (default 0.3, the same "candidate same
 *       issue" floor the orchestrator's Stage 4 pre-filter uses before its
 *       LLM tiebreaker — used here to merge directly, with no tiebreaker).
 * `finding_id`, `title`, and `category` are allowed to differ completely
 * between the two findings being merged — two reviewers describing the
 * same bug at the same location almost never agree on exact wording, but
 * location plus a modest title overlap is strong evidence it is the same
 * underlying issue (verified against a real two-reviewer run;
 * review-engine-renderer.test.ts "merges cross-reviewer duplicates at the
 * same location despite differing finding_id/title/category" is built
 * from that run's actual 8 findings).
 */
export function dedupeFindings(findings, opts = {}) {
  const jaccardThreshold = opts.jaccardThreshold ?? 0.8;
  const locationJaccardThreshold = opts.locationJaccardThreshold ?? 0.3;
  const input = Array.isArray(findings) ? findings.filter(Boolean) : [];

  // Stage 1 — exact finding_id collapse.
  const byId = new Map();
  const order = [];
  let noIdCounter = 0;
  for (const finding of input) {
    const key = finding.finding_id ? `id::${finding.finding_id}` : `noid::${noIdCounter++}`;
    if (byId.has(key)) {
      byId.set(key, mergeTwoFindings(byId.get(key), finding));
    } else {
      byId.set(key, {
        ...finding,
        raised_by: finding.raised_by && finding.raised_by.length
          ? finding.raised_by
          : [asRaisedByEntry(finding)],
      });
      order.push(key);
    }
  }
  const stage1 = order.map((key) => byId.get(key));
  const stage1Merged = input.length - stage1.length;

  // Stage 2 — lexical/fingerprint dedup within the same file.
  const buckets = new Map();
  for (const finding of stage1) {
    const key = normalizeFileKey(finding.file);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(finding);
  }

  const merged = [];
  let stage2Merged = 0;
  for (const bucket of buckets.values()) {
    const tokenSets = bucket.map((f) => normalizeTitleTokens(f.title));
    const claimed = new Array(bucket.length).fill(false);
    for (let i = 0; i < bucket.length; i += 1) {
      if (claimed[i]) continue;
      let current = bucket[i];
      claimed[i] = true;
      for (let j = i + 1; j < bucket.length; j += 1) {
        if (claimed[j]) continue;
        const score = jaccardSimilarity(tokenSets[i], tokenSets[j]);
        const strongTitleMatch = score >= jaccardThreshold;
        const sameLocationModerateMatch = score >= locationJaccardThreshold
          && sameLocation(bucket[i], bucket[j]);
        if (strongTitleMatch || sameLocationModerateMatch) {
          current = mergeTwoFindings(current, bucket[j]);
          claimed[j] = true;
          stage2Merged += 1;
        }
      }
      merged.push(current);
    }
  }

  return {
    findings: merged,
    duplicatesMerged: stage1Merged + stage2Merged,
    stage1Merged,
    stage2Merged,
  };
}

// ── Path-and-Reason Header (D21) ─────────────────────────────────────────

/**
 * Verbatim from D21 (docs/plans/multi-model-review.md) / FR-MR17, mirrored
 * in plugins/synthex/commands/review-code.md's "Path-and-Reason Header
 * Spec (D21)" section.
 */
export const PATH_HEADER_REGEX =
  /^Review path: [^()]+\([^)]+; reviewers: \d+ native(?:\s*[+,]\s*\d+ external(?:\s+\w+)?)?\)$/;

/**
 * Renders the D21 path-and-reason header line. `mode` is 'native-only' or
 * 'multi-model'. For 'multi-model', pass either `externalCount` (the
 * succeeded, non-failed sub-format: "N native + M external") or
 * `externalQualifier` (the failed-externals sub-format's qualifier clause,
 * e.g. "0 external succeeded", rendering "N native, 0 external
 * succeeded").
 */
export function renderPathHeader({
  mode,
  reason,
  nativeCount,
  externalCount = 0,
  externalQualifier = null,
}) {
  if (mode !== 'native-only' && mode !== 'multi-model') {
    throw new Error(
      `renderPathHeader: mode must be 'native-only' or 'multi-model', got ${JSON.stringify(mode)}`,
    );
  }
  let reviewers;
  if (mode === 'native-only') {
    reviewers = `${nativeCount} native`;
  } else if (externalQualifier) {
    reviewers = `${nativeCount} native, ${externalQualifier}`;
  } else {
    reviewers = `${nativeCount} native + ${externalCount} external`;
  }
  const header = `Review path: ${mode} (${reason}; reviewers: ${reviewers})`;
  if (!PATH_HEADER_REGEX.test(header)) {
    throw new Error(`renderPathHeader: generated header fails the D21 regex: ${header}`);
  }
  return header;
}

// ── Render ────────────────────────────────────────────────────────────────

function formatRaisedBy(raisedBy) {
  if (!raisedBy || raisedBy.length === 0) return 'unknown';
  return raisedBy.map((r) => `${r.reviewer_id} (${r.family})`).join(', ');
}

function formatLocation(finding) {
  let loc = finding.file || 'unknown file';
  const range = finding.line_range;
  if (range && typeof range.start === 'number') {
    loc += `:${range.start}`;
    if (range.end && range.end !== range.start) {
      loc += `-${range.end}`;
    }
  }
  if (finding.symbol) loc += ` (${finding.symbol})`;
  return loc;
}

function renderFindingBlock(finding) {
  const sev = String(finding.severity || '').toUpperCase();
  // Defensive: renderReport is normally called on dedupeFindings' output
  // (which always populates raised_by, even for a singleton finding), but
  // does not require it — a caller may render a raw finding directly.
  const raisedBy = finding.raised_by && finding.raised_by.length
    ? finding.raised_by
    : [asRaisedByEntry(finding)];
  const lines = [
    `#### [${sev}] ${finding.title}`,
    `- **Category:** ${finding.category || 'uncategorized'}`,
    `- **Location:** ${formatLocation(finding)}`,
    `- **Issue:** ${finding.description}`,
    `- **Raised by:** ${formatRaisedBy(raisedBy)}`,
  ];
  if (finding.severity_disagreement) {
    const perReviewer = raisedBy
      .map((r) => `${r.reviewer_id}: ${String(r.severity || '?').toUpperCase()}`)
      .join(', ');
    lines.push(`- **Severity disagreement:** ${perReviewer}`);
  }
  return lines.join('\n');
}

function renderSeveritySection(label, findings) {
  if (!findings || findings.length === 0) {
    return `### ${label} Findings\nNo ${label} findings.`;
  }
  return `### ${label} Findings\n${findings.map(renderFindingBlock).join('\n\n')}`;
}

/**
 * Renders the FR-HM16 markdown report. Matches the fixed template embedded
 * in plugins/synthex/commands/review-code.md Step 5 ("## Code Review
 * Report" through "### Summary"), prefixed by the D21 path-and-reason
 * header (`pathHeader` — build with `renderPathHeader`). The overall
 * verdict is computed here (not passed in) via `aggregateVerdict` so the
 * rendered verdict can never disagree with the findings it is rendering.
 *
 * @param {object} input
 * @param {string} input.pathHeader - the D21 header line (see renderPathHeader)
 * @param {string} input.reviewed - target description
 * @param {string} input.date - YYYY-MM-DD, supplied by the caller (scripts cannot call Date.now())
 * @param {Array<{name: string, verdict: string, summary: string}>} input.reviewerTable
 * @param {Array<object>} input.findings - deduped findings (any order)
 * @param {string[]} input.positives - "What's Done Well" bullets
 * @param {string} input.summary - the effort:medium verdict-synthesis call's prose
 */
export function renderReport({
  pathHeader,
  reviewed,
  date,
  reviewerTable,
  findings,
  positives,
  summary,
}) {
  const verdict = aggregateVerdict(findings);
  const byRank = sortFindingsBySeverity(findings);
  const lower = (f) => String(f.severity || '').toLowerCase();
  const grouped = {
    CRITICAL: byRank.filter((f) => lower(f) === 'critical'),
    HIGH: byRank.filter((f) => lower(f) === 'high'),
    MEDIUM: byRank.filter((f) => lower(f) === 'medium'),
    LOW: byRank.filter((f) => lower(f) === 'low'),
  };

  const tableRows = (reviewerTable || [])
    .map((r) => `| ${r.name} | ${r.verdict} | ${r.summary} |`)
    .join('\n');

  const positivesBody = positives && positives.length
    ? positives.map((p) => `- ${p}`).join('\n')
    : 'No specific positives were called out this cycle.';

  return [
    pathHeader,
    '',
    '## Code Review Report',
    '',
    `### Reviewed: ${reviewed}`,
    `### Date: ${date}`,
    '',
    '---',
    '',
    `### Overall Verdict: ${verdict}`,
    '',
    '| Reviewer | Verdict | Findings |',
    '|----------|---------|----------|',
    tableRows,
    '',
    '---',
    '',
    renderSeveritySection('CRITICAL', grouped.CRITICAL),
    '',
    renderSeveritySection('HIGH', grouped.HIGH),
    '',
    renderSeveritySection('MEDIUM', grouped.MEDIUM),
    '',
    renderSeveritySection('LOW', grouped.LOW),
    '',
    '---',
    '',
    "### What's Done Well",
    positivesBody,
    '',
    '---',
    '',
    '### Summary',
    summary,
  ].join('\n');
}

// ── Adversarial Refute Pass (FR-HM17, Task 58) ───────────────────────────
//
// Each CRITICAL/HIGH finding surviving dedupe is checked by 3 independent
// refuter agents (Sonnet 5, `effort: low` — see Task 7 in
// docs/specs/harness-modernization/spikes.md: Haiku 4.5 silently ignores
// `effort`, a Sonnet 5 sub-agent's `effort: low` is honored and visible in
// its transcript), each returning `{refuted, method, failure_scenario}`
// for a single finding. `tallyRefuterVotes` and `buildVerificationRecord`
// below are pure aggregation functions over those votes — the actual
// `agent()`/`parallel()` calls that produce the votes live only in
// `../review-code-engine.js`'s script body (they need the Workflow
// runtime's `agent`/`parallel` globals, which this module, imported
// directly by tests, does not have).
//
// IMPORTANT — do not confuse this with `superseded_by_verification`: that
// field (agents/_shared/canonical-finding.schema.json,
// multi-model-review-orchestrator.md Stage 5b) marks the LOSING finding of
// a pair of MUTUALLY CONTRADICTING findings after a Chain-of-Verification
// adjudication during multi-model consolidation. The `verification` field
// here marks whether a SINGLE finding survived an adversarial refute pass
// on its own merits. Neither reuses the other's field name or status
// value; see docs/engines/review-code-workflow.md "Adversarial Refute
// Pass (FR-HM17, Task 58)" for the full separation rationale.

/**
 * Tallies up to 3 independent refuter votes for one CRITICAL/HIGH finding.
 * Survival rule (FR-HM17): the finding survives when at most 1 of the
 * refuters refuted it — equivalently, at least 2 non-refuted votes. Falsy
 * entries (a refuter `agent()` call that errored and resolved to `null`
 * via `parallel()`'s contract) are dropped before counting, so a missing
 * vote can only make survival harder, never easier.
 *
 * @param {Array<{refuted: boolean, method?: string, failure_scenario?: string|null}>} votes
 * @returns {{survives: boolean, status: 'verified'|'refuted', refutedCount: number, nonRefutedCount: number, totalVotes: number}}
 */
export function tallyRefuterVotes(votes) {
  const list = Array.isArray(votes) ? votes.filter(Boolean) : [];
  const refutedCount = list.filter((v) => v && v.refuted === true).length;
  const nonRefutedCount = list.length - refutedCount;
  const survives = nonRefutedCount >= 2;
  return {
    survives,
    status: survives ? 'verified' : 'refuted',
    refutedCount,
    nonRefutedCount,
    totalVotes: list.length,
  };
}

const DEFAULT_REFUTE_METHOD =
  'adversarial-refute (3 independent Sonnet 5 refuters, effort: low; 2-of-3 non-refuted survival)';

/**
 * Builds the `verification: {status, method, failure_scenario}` field
 * FR-HM17 specifies, from the same raw votes `tallyRefuterVotes` consumes.
 * Every finding that went through the refute pass carries this field,
 * whether it survived or not (per FR-HM17: "Refuted findings remain in
 * the audit artifact with a new verification field").
 *
 * - `status` — `tallyRefuterVotes`' status (`'verified'` or `'refuted'`).
 * - `method` — the distinct, non-empty `method` values the refuters
 *   themselves reported, joined; falls back to a fixed description of the
 *   pass when no refuter supplied one.
 * - `failure_scenario` — the refuting vote(s)' own `failure_scenario`
 *   text, joined; `null` when no refuter refuted the finding (0-refuted
 *   survivals have nothing to report here).
 *
 * @param {Array<{refuted: boolean, method?: string, failure_scenario?: string|null}>} votes
 * @returns {{status: 'verified'|'refuted', method: string, failure_scenario: string|null}}
 */
export function buildVerificationRecord(votes) {
  const list = Array.isArray(votes) ? votes.filter(Boolean) : [];
  const tally = tallyRefuterVotes(list);
  const refutedVotes = list.filter((v) => v && v.refuted === true);
  const failureScenario = refutedVotes.length
    ? refutedVotes.map((v) => v.failure_scenario).filter(Boolean).join(' | ')
    : null;
  const methods = [...new Set(list.map((v) => v && v.method).filter(Boolean))];
  return {
    status: tally.status,
    method: methods.length ? methods.join(', ') : DEFAULT_REFUTE_METHOD,
    failure_scenario: failureScenario,
  };
}

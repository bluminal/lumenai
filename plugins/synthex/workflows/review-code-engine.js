export const meta = {
  name: 'review-code-engine',
  description: 'FR-HM16 workflow engine for /synthex:review-code: parallel reviewers with a forced findings envelope, JS dedupe, an opt-in FR-HM17 adversarial refute pass, one effort:medium verdict-synthesis call, and the D21/FR-MR17 rendered report.',
  phases: [
    { title: 'Native Review', detail: 'run each configured reviewer in parallel with a forced findings envelope' },
    { title: 'Multi-Model Review', detail: 'run the multi-model-review-orchestrator in a second parallel() group when enabled' },
    { title: 'Verification', detail: 'FR-HM17 (Task 58): 3 independent Sonnet 5 refuters (effort: low) per CRITICAL/HIGH finding, 2-of-3 non-refuted survival, when code_review.refute_pass is on' },
    { title: 'Verdict', detail: 'a single effort: medium call synthesizes the summary prose' },
  ],
};

/**
 * plugins/synthex/workflows/review-code-engine.js
 *
 * FR-HM16 workflow review engine for `/synthex:review-code` (Task 57, D4).
 * Auto-discovered from the plugin's `workflows/` directory with no
 * `plugin.json` entry (confirmed by the Task 9 spike,
 * docs/specs/harness-modernization/spikes.md "Task 9 — Workflow
 * capability spike"). Invoked by the capability ladder's level 2
 * (plugins/synthex/docs/standing-pool-routing.md, "## Capability Ladder
 * (FR-HM21)") as `Workflow {"name": "synthex:review-code-engine"}` once
 * the command's own instruction to call it is the opt-in the Workflow
 * tool's contract requires (D31).
 *
 * IMPORTANT — why this script is NOT named `review-code`: a plugin
 * workflow's `meta.name` is registered as the slash command
 * `<plugin>:<name>` and SHADOWS a same-named plugin command entirely — a
 * live Task 57 run confirmed that typing `/synthex:review-code` with a
 * workflow also named `review-code` expanded straight to "Run the
 * 'synthex:review-code' workflow" instead of loading
 * `commands/review-code.md`, silently skipping every config check, the
 * capability ladder, and the review loop. See
 * docs/specs/harness-modernization/spikes.md's Task 9 addendum and
 * `tests/schemas/workflow-names.test.ts`, which asserts no workflow
 * `meta.name` ever collides with a command or agent name.
 *
 * Full behavior, config resolution, and output-parity notes:
 * plugins/synthex/docs/engines/review-code-workflow.md.
 *
 * ── Why the dedupe/verdict/render functions are duplicated here ─────────
 * These functions are also exported, standalone, from
 * ./lib/review-engine.mjs — that file is the source of truth and is what
 * tests/schemas/review-engine-renderer.test.ts imports directly. This
 * script cannot `import` that module: Workflow scripts run in a sandboxed
 * plain-JS context with no filesystem or Node.js module resolution (Task
 * 9 spike; the workflow-authoring skill: "No filesystem or Node.js API
 * access"). So the same function bodies are inlined below, between a pair
 * of sync markers just past this header comment (a literal search for
 * them is deliberately not spelled out here, so this prose paragraph
 * cannot be mistaken for a marker by a naive text search), with `export`
 * stripped (a bare Workflow script body is not an ES module — only
 * `export const meta` is special-cased by the runtime).
 * tests/schemas/review-engine-sync.test.ts diffs both copies
 * (marker-delimited region here vs. the whole of lib/review-engine.mjs,
 * `export` tokens normalized away) on every test run, so they cannot
 * silently drift. Edit lib/review-engine.mjs first, then copy the same
 * text here with `export` removed.
 *
 * Also note: Date.now(), Math.random(), and argless `new Date()` are
 * unavailable in a Workflow script. This script never calls them — `date`
 * arrives via `args` (or renders a placeholder when absent) and there is
 * no other source of non-determinism here.
 */


// ---------------------------------------------------------------------------
// BEGIN REVIEW-ENGINE-SYNC (mirrors plugins/synthex/workflows/lib/review-engine.mjs)
// ---------------------------------------------------------------------------

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

function severityRank(severity) {
  return SEVERITY_RANK[String(severity || '').toLowerCase()] || 0;
}

function countsBySeverity(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings || []) {
    const sev = String(finding && finding.severity || '').toLowerCase();
    if (sev in counts) counts[sev] += 1;
  }
  return counts;
}

function aggregateVerdict(findings) {
  const counts = countsBySeverity(findings);
  if (counts.critical > 0 || counts.high > 0) return 'FAIL';
  if (counts.medium > 0) return 'WARN';
  return 'PASS';
}

function sortFindingsBySeverity(findings) {
  return [...(findings || [])].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'for', 'to',
  'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that',
  'it', 'its', 'as', 'at', 'by', 'from', 'not', 'no', 'does', 'do', 'did',
  'has', 'have', 'had',
]);

function normalizeTitleTokens(title) {
  return new Set(
    String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((tok) => tok.length > 0 && !STOPWORDS.has(tok)),
  );
}

function jaccardSimilarity(setA, setB) {
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

function stampReviewerSource(findings, source) {
  return (findings || []).filter(Boolean).map((finding) => ({ ...finding, source }));
}

function dedupeFindings(findings, opts = {}) {
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

const PATH_HEADER_REGEX =
  /^Review path: [^()]+\([^)]+; reviewers: \d+ native(?:\s*[+,]\s*\d+ external(?:\s+\w+)?)?\)$/;

function renderPathHeader({
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

function renderReport({
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

// ── Adversarial Refute Pass (FR-HM17, Task 58) — pure vote-aggregation ──
//
// IMPORTANT — do not confuse this with `superseded_by_verification`: that
// field marks the LOSING finding of a pair of mutually CONTRADICTING
// findings after multi-model consolidation's Chain-of-Verification
// adjudication (Stage 5b). This `verification` field marks whether ONE
// finding survived an adversarial refute pass on its own. Neither reuses
// the other's field name or status value.

function tallyRefuterVotes(votes) {
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

function buildVerificationRecord(votes) {
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

// ---------------------------------------------------------------------------
// END REVIEW-ENGINE-SYNC
// ---------------------------------------------------------------------------

// ── Reviewer envelope schema (forced structured output) ────────────────────

const REVIEWER_ENVELOPE_SCHEMA = {
  type: 'object',
  required: ['findings', 'positives', 'summary'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['finding_id', 'severity', 'category', 'title', 'description', 'file'],
        properties: {
          finding_id: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          category: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          file: { type: 'string' },
          symbol: { type: ['string', 'null'] },
          line_range: { type: ['object', 'null'] },
        },
      },
    },
    positives: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['summary'],
  properties: {
    summary: { type: 'string' },
  },
};

// FR-HM17 (Task 58): forced envelope for one refuter's vote on one
// CRITICAL/HIGH finding. `failure_scenario` is nullable — a refuter that
// does not refute the finding (`refuted: false`) has nothing to report
// there.
const REFUTER_VOTE_SCHEMA = {
  type: 'object',
  required: ['refuted', 'method', 'failure_scenario'],
  properties: {
    refuted: { type: 'boolean' },
    method: { type: 'string' },
    failure_scenario: { type: ['string', 'null'] },
  },
};

// The three refuter lenses FR-HM17 names verbatim: correctness,
// does-it-reproduce, security-impact.
const REFUTER_LENSES = [
  {
    id: 'correctness',
    instruction: 'Check whether the finding is technically correct: does the described defect actually exist in the code exactly as written?',
  },
  {
    id: 'does-it-reproduce',
    instruction: 'Check whether the finding is reproducible: can you construct a concrete input, call sequence, or scenario that actually triggers the described problem?',
  },
  {
    id: 'security-impact',
    instruction: 'Check whether the finding has real impact: even if the pattern exists, is it actually reachable and consequential given the surrounding code (guards, validation, unreachable paths, existing mitigations)?',
  },
];

// ── Prompts ──────────────────────────────────────────────────────────────

function reviewerPrompt(reviewerName, diffText, projectContext, priorCycleSummary) {
  return [
    `Review the following diff in the ${reviewerName} role.`,
    'Return findings that conform to the canonical finding schema',
    '(agents/_shared/canonical-finding.schema.json): finding_id, severity,',
    'category, title, description, file, and (optional) symbol/line_range.',
    'finding_id must be stable across re-review and MUST NOT contain a line',
    'number. Also return positives (what the diff does well) and a short',
    'summary. Do not include a PASS/WARN/FAIL verdict field — the caller',
    'derives the verdict from finding severities.',
    '',
    priorCycleSummary
      ? `Unresolved findings from the prior cycle, for context (do not re-emit findings already resolved):\n${priorCycleSummary}\n`
      : '',
    'Project context:',
    projectContext || '(none provided)',
    '',
    'Diff:',
    diffText,
  ].filter(Boolean).join('\n');
}

function verdictSynthesisPrompt(reviewed, findings, positives) {
  return [
    `Write a 2-3 sentence overall assessment of this code review for "${reviewed}".`,
    `${findings.length} consolidated finding(s) remain after dedup.`,
    'Recommend next steps if any CRITICAL or HIGH findings remain; otherwise',
    'note that the change is ready, calling out what went well.',
    '',
    'Findings (JSON):',
    JSON.stringify(findings),
    'Positives (JSON):',
    JSON.stringify(positives),
  ].join('\n');
}

// FR-HM17 (Task 58): prompts ONE refuter, on ONE lens, with ONLY the
// artifact (the finding itself) — no sight of the other two refuters'
// votes, so the three are genuinely independent.
function refuterPrompt(finding, lens) {
  return [
    `You are an independent adversarial refuter reviewing exactly ONE finding from a code review, through the "${lens.id}" lens.`,
    lens.instruction,
    'Try hard to REFUTE this finding. Default to refuted: true when you cannot confirm the finding holds up from this lens — only report refuted: false when you are confident it is real, reproducible, and consequential.',
    '',
    'Finding under review (JSON):',
    JSON.stringify({
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
      description: finding.description,
      file: finding.file,
      symbol: finding.symbol || null,
      line_range: finding.line_range || null,
    }),
    '',
    'Return {refuted, method, failure_scenario}: `method` is the approach you used to check it (e.g. traced control flow, attempted reproduction, checked for an existing guard); `failure_scenario` is null when refuted is false, otherwise it describes the scenario or reasoning that shows the finding does not hold from this lens.',
  ].join('\n');
}

function extractReasonFromHeader(header) {
  const match = /^Review path: [^(]*\(([^;]+);/.exec(header || '');
  return match ? match[1].trim() : 'multi-model review via the FR-HM16 workflow engine';
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ── Script body ──────────────────────────────────────────────────────────
//
// Config resolution, standing-pool discovery, sandbox-yolo confirmation,
// and diff resolution stay in the command preamble (review-code.md /
// docs/standing-pool-routing.md) per FR-HM16 — scripts have no filesystem,
// shell, Date.now(), or AskUserQuestion. Everything this script needs
// arrives pre-resolved via `args`.
//
// A single Workflow call runs exactly ONE review cycle and returns — it
// cannot wait for a human to apply fixes between cycles. The command's
// own Review Loop (review-code.md Step 6) owns the fix-and-re-review loop
// across turns: on a FAIL verdict it re-invokes
// `Workflow {"name": "synthex:review-code-engine"}` for the next cycle, passing
// the incremented `cycle` and a compact summary of unresolved findings as
// `priorCycleSummary` (see docs/standing-pool-routing.md's "Level 2's
// Workflow args contract"). Finding lifecycle (fixed / carried / new)
// across cycles is therefore the command's responsibility, tracked across
// its repeated invocations via `priorCycleSummary` — a fresh script run
// has no memory of a prior cycle beyond what that argument carries, so
// this script does not (and cannot) track lifecycle transitions itself.

const input = args || {};
const reviewed = input.reviewed || 'the resolved diff';
const date = input.date || '(date not provided)';
const diffText = input.diffText || '';
const projectContext = input.projectContext || '';
const reviewers = Array.isArray(input.reviewers) && input.reviewers.length
  ? input.reviewers
  : ['code-reviewer', 'security-reviewer'];
const multiModel = input.multiModel || null;
const refutePass = input.refutePass || null;
const cycle = input.cycle || 1;
const priorCycleSummary = input.priorCycleSummary || null;

phase('Native Review');
log(`[workflow cycle ${cycle}] launching ${reviewers.length} native reviewer(s) in parallel`);

const nativeResults = await parallel(
  reviewers.map((reviewerName) => () => agent(
    reviewerPrompt(reviewerName, diffText, projectContext, priorCycleSummary),
    {
      agentType: `synthex:${reviewerName}`,
      schema: REVIEWER_ENVELOPE_SCHEMA,
      phase: 'Native Review',
      label: reviewerName,
    },
  )),
);

// Stamp each reviewer's own identity onto every finding it returned — the
// forced envelope schema does not require `source`, reviewer agents
// reliably omit it, and a Task 57 live run rendered "Raised by: unknown"
// on every finding as a result. The script, not the model, knows which
// reviewer it just invoked, so this is authoritative.
const stampedResults = reviewers.map((reviewerName, i) => {
  const result = nativeResults[i];
  const rawFindings = result && Array.isArray(result.findings) ? result.findings : [];
  const findings = stampReviewerSource(rawFindings, {
    reviewer_id: reviewerName,
    family: 'anthropic',
    source_type: 'native-team',
  });
  const positives = result && Array.isArray(result.positives) ? result.positives : [];
  return { name: reviewerName, ok: Boolean(result), findings, positives };
});

const reviewerTable = stampedResults.map(({ name, ok, findings }) => {
  const counts = countsBySeverity(findings);
  const summaryParts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([sev, n]) => `${n} ${sev.toUpperCase()}`);
  return {
    name,
    verdict: ok ? aggregateVerdict(findings) : 'FAIL (no response)',
    summary: summaryParts.length ? summaryParts.join(', ') : '0 findings',
  };
});

let allFindings = stampedResults.flatMap((r) => r.findings);
let allPositives = stampedResults.flatMap((r) => r.positives);
const nativeCount = reviewers.length;
let externalCount = 0;
let externalQualifier = null;
let mode = 'native-only';
let reason = cycle === 1 ? 'native review via the FR-HM16 workflow engine' : `re-review cycle ${cycle}`;

if (multiModel && multiModel.enabled) {
  phase('Multi-Model Review');
  log(`[workflow cycle ${cycle}] launching the multi-model-review-orchestrator in a second parallel() group`);

  const [orchestratorResultText] = await parallel([
    () => agent(
      JSON.stringify({
        command: 'review-code',
        artifact_path: multiModel.artifactPath || reviewed,
        touched_files: multiModel.touchedFiles || [],
        native_reviewers: reviewers,
        config: multiModel.config || {},
        per_reviewer_timeout_seconds: multiModel.perReviewerTimeoutSeconds || 180,
      }),
      {
        agentType: 'synthex:multi-model-review-orchestrator',
        phase: 'Multi-Model Review',
        label: 'multi-model-review-orchestrator',
      },
    ),
  ]);

  const parsed = typeof orchestratorResultText === 'string'
    ? safeJsonParse(orchestratorResultText)
    : orchestratorResultText;

  if (parsed) {
    if (Array.isArray(parsed.findings)) {
      allFindings = allFindings.concat(parsed.findings);
    }
    if (Array.isArray(parsed.per_reviewer_results)) {
      const externals = parsed.per_reviewer_results.filter((r) => r.source_type === 'external');
      externalCount = externals.length;
      const succeeded = externals.filter((r) => r.status === 'success').length;
      if (externalCount > 0 && succeeded < externalCount) {
        externalQualifier = `${succeeded} external succeeded`;
      }
    }
    mode = 'multi-model';
    reason = parsed.path_and_reason_header
      ? extractReasonFromHeader(parsed.path_and_reason_header)
      : reason;
  } else {
    log(`[workflow cycle ${cycle}] multi-model-review-orchestrator returned no parseable envelope; continuing native-only for this cycle`);
  }
}

const dedup = dedupeFindings(allFindings);
log(`[workflow cycle ${cycle}] ${dedup.findings.length} consolidated finding(s) (${dedup.duplicatesMerged} merged)`);

// ── FR-HM17 adversarial refute pass (Task 58) ───────────────────────────
//
// Gated on `code_review.refute_pass: on|off` (default `off`) — a SEPARATE
// config key from `code_review.verification: prose|off`, which gates the
// PROSE path's own "Verification pass" section in code-reviewer.md /
// security-reviewer.md / performance-engineer.md (Task 56/57, D18) and is
// left completely untouched by this block. The command preamble resolves
// `code_review.refute_pass` and passes it here as `args.refutePass.enabled`
// — see docs/engines/review-code-workflow.md "Adversarial Refute Pass
// (FR-HM17, Task 58)" for why the two config keys are kept separate.
//
// Every CRITICAL/HIGH finding surviving dedupe gets 3 independent
// refuters (Sonnet 5, effort: low, per Task 7) in their own parallel()
// group; a finding survives (tallyRefuterVotes) when at most 1 of the 3
// refuted it. Refuted findings are dropped from the RENDERED report but
// kept (with their `verification` field) in the `findings` this script
// returns, so a caller writing an audit artifact still has them — FR-HM17:
// "Refuted findings remain in the audit artifact."
let reportFindings = dedup.findings;
if (refutePass && refutePass.enabled) {
  const toVerify = dedup.findings.filter((f) => {
    const sev = String(f && f.severity || '').toLowerCase();
    return sev === 'critical' || sev === 'high';
  });

  if (toVerify.length) {
    phase('Verification');
    log(`[workflow cycle ${cycle}] running the FR-HM17 adversarial refute pass on ${toVerify.length} CRITICAL/HIGH finding(s) (3 Sonnet 5 refuters each, effort: low)`);

    await parallel(toVerify.map((finding) => async () => {
      const votes = await parallel(REFUTER_LENSES.map((lens) => () => agent(
        refuterPrompt(finding, lens),
        {
          model: 'sonnet',
          effort: 'low',
          schema: REFUTER_VOTE_SCHEMA,
          phase: 'Verification',
          label: `refute:${lens.id}:${finding.finding_id}`,
        },
      )));
      finding.verification = buildVerificationRecord(votes);
    }));

    const refutedCount = toVerify.filter((f) => f.verification && f.verification.status === 'refuted').length;
    if (refutedCount) {
      log(`[workflow cycle ${cycle}] ${refutedCount} CRITICAL/HIGH finding(s) refuted by the adversarial pass (2-of-3) — dropped from the rendered report, kept in the returned findings for the audit artifact`);
    }

    reportFindings = dedup.findings.filter(
      (f) => !(f.verification && f.verification.status === 'refuted'),
    );
  }
}

phase('Verdict');
const verdictResult = await agent(
  verdictSynthesisPrompt(reviewed, reportFindings, allPositives),
  {
    schema: VERDICT_SCHEMA,
    effort: 'medium',
    phase: 'Verdict',
    label: 'verdict-synthesis',
  },
);

const pathHeader = renderPathHeader({ mode, reason, nativeCount, externalCount, externalQualifier });
const report = renderReport({
  pathHeader,
  reviewed,
  date,
  reviewerTable,
  findings: reportFindings,
  positives: allPositives,
  summary: verdictResult && verdictResult.summary ? verdictResult.summary : 'No summary was returned.',
});

// FR-HM16's text says this step "calls ReportFindings once per cycle
// with the consolidated list." Checked against the actual prose path
// (plugins/synthex/commands/review-code.md) before writing this script:
// review-code.md never calls a ReportFindings tool anywhere, and the
// Workflow script API confirmed by the Task 9 spike (meta/agent/
// parallel/pipeline/phase/log/args/budget/workflow) documents no such
// hook. Per this task's instruction to "match whatever the prose path
// does" when the two disagree, this call is intentionally omitted here.
// See docs/engines/review-code-workflow.md "ReportFindings" for the
// full reasoning and the condition under which this should be revisited.

return {
  report,
  verdict: aggregateVerdict(reportFindings),
  cycle,
  // Full dedup'd findings, including any CRITICAL/HIGH finding the
  // FR-HM17 refute pass dropped from `report` — each carries a
  // `verification: {status, method, failure_scenario}` field when the
  // refute pass checked it. A caller writing an audit artifact (e.g. via
  // scripts/write-audit.mjs) should use THIS list, not re-parse `report`.
  findings: dedup.findings,
};

export const meta = {
  name: 'review-code',
  description: 'FR-HM16 workflow engine for /synthex:review-code: parallel reviewers with a forced findings envelope, JS dedupe, one effort:medium verdict-synthesis call, and the D21/FR-MR17 rendered report.',
  phases: [
    { title: 'Native Review', detail: 'run each configured reviewer in parallel with a forced findings envelope' },
    { title: 'Multi-Model Review', detail: 'run the multi-model-review-orchestrator in a second parallel() group when enabled' },
    { title: 'Verdict', detail: 'a single effort: medium call synthesizes the summary prose' },
  ],
};

/**
 * plugins/synthex/workflows/review-code.js
 *
 * FR-HM16 workflow review engine for `/synthex:review-code` (Task 57, D4).
 * Auto-discovered from the plugin's `workflows/` directory with no
 * `plugin.json` entry (confirmed by the Task 9 spike,
 * docs/specs/harness-modernization/spikes.md "Task 9 — Workflow
 * capability spike"). Invoked by the capability ladder's level 2
 * (plugins/synthex/docs/standing-pool-routing.md, "## Capability Ladder
 * (FR-HM21)") as `Workflow {"name": "synthex:review-code"}` once the
 * command's own instruction to call it is the opt-in the Workflow tool's
 * contract requires (D31).
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

  return {
    ...primary,
    raised_by: mergedRaisedBy,
    severity: incomingWins ? incoming.severity : base.severity,
    severity_disagreement: severitiesSeen.size > 1,
  };
}

function dedupeFindings(findings, opts = {}) {
  const jaccardThreshold = opts.jaccardThreshold ?? 0.8;
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
        if (score >= jaccardThreshold) {
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

const input = args || {};
const reviewed = input.reviewed || 'staged changes';
const date = input.date || '(date not provided)';
const diffText = input.diffText || '';
const projectContext = input.projectContext || '';
const reviewers = Array.isArray(input.reviewers) && input.reviewers.length
  ? input.reviewers
  : ['code-reviewer', 'security-reviewer'];
const reviewLoops = input.reviewLoops || {};
const maxCycles = reviewLoops.maxCycles || reviewLoops.max_cycles || 2;
const minSeverityToAddress = reviewLoops.minSeverityToAddress || reviewLoops.min_severity_to_address || 'high';
const multiModel = input.multiModel || null;

// Finding lifecycle (fixed / carried / new) is tracked in this script
// variable across cycles, never in a tool call's `outcome` field (FR-HM16:
// "its outcome field is undocumented").
const findingLifecycle = new Map();

function updateLifecycle(cycleNumber, findings) {
  const seenThisCycle = new Set();
  for (const finding of findings) {
    if (!finding.finding_id) continue;
    seenThisCycle.add(finding.finding_id);
    const existing = findingLifecycle.get(finding.finding_id);
    if (existing) {
      existing.lastSeenCycle = cycleNumber;
      existing.status = 'carried';
    } else {
      findingLifecycle.set(finding.finding_id, {
        firstSeenCycle: cycleNumber,
        lastSeenCycle: cycleNumber,
        status: 'new',
      });
    }
  }
  for (const [id, record] of findingLifecycle) {
    if (!seenThisCycle.has(id) && record.lastSeenCycle < cycleNumber) {
      record.status = 'fixed';
    }
  }
}

let cycle = 0;
let lastReport = null;
let lastVerdict = 'PASS';
let carrySummary = input.priorCycleSummary || null;

phase('Native Review');

while (cycle < maxCycles) {
  cycle += 1;
  log(`[workflow cycle ${cycle}/${maxCycles}] launching ${reviewers.length} native reviewer(s) in parallel`);

  const nativeResults = await parallel(
    reviewers.map((reviewerName) => () => agent(
      reviewerPrompt(reviewerName, diffText, projectContext, carrySummary),
      {
        agentType: `synthex:${reviewerName}`,
        schema: REVIEWER_ENVELOPE_SCHEMA,
        phase: 'Native Review',
        label: reviewerName,
      },
    )),
  );

  const reviewerTable = reviewers.map((name, i) => {
    const result = nativeResults[i];
    const findings = result && Array.isArray(result.findings) ? result.findings : [];
    const counts = countsBySeverity(findings);
    const summaryParts = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([sev, n]) => `${n} ${sev.toUpperCase()}`);
    return {
      name,
      verdict: result ? aggregateVerdict(findings) : 'FAIL (no response)',
      summary: summaryParts.length ? summaryParts.join(', ') : '0 findings',
    };
  });

  let allFindings = nativeResults.filter(Boolean).flatMap((r) => (Array.isArray(r.findings) ? r.findings : []));
  let allPositives = nativeResults.filter(Boolean).flatMap((r) => (Array.isArray(r.positives) ? r.positives : []));
  const nativeCount = reviewers.length;
  let externalCount = 0;
  let externalQualifier = null;
  let mode = 'native-only';
  let reason = cycle === 1 ? 'native review via the FR-HM16 workflow engine' : `re-review cycle ${cycle}`;

  if (multiModel && multiModel.enabled) {
    phase('Multi-Model Review');
    log(`[workflow cycle ${cycle}/${maxCycles}] launching the multi-model-review-orchestrator in a second parallel() group`);

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
      log(`[workflow cycle ${cycle}/${maxCycles}] multi-model-review-orchestrator returned no parseable envelope; continuing native-only for this cycle`);
    }
  }

  const dedup = dedupeFindings(allFindings);
  updateLifecycle(cycle, dedup.findings);
  log(`[workflow cycle ${cycle}/${maxCycles}] ${dedup.findings.length} consolidated finding(s) (${dedup.duplicatesMerged} merged)`);

  phase('Verdict');
  const verdictResult = await agent(
    verdictSynthesisPrompt(reviewed, dedup.findings, allPositives),
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
    findings: dedup.findings,
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

  lastVerdict = aggregateVerdict(dedup.findings);
  lastReport = report;

  if (lastVerdict !== 'FAIL') break;
  if (minSeverityToAddress !== 'critical' && minSeverityToAddress !== 'high') break;
  if (cycle >= maxCycles) break;

  carrySummary = dedup.findings
    .filter((f) => severityRank(f.severity) >= severityRank('high'))
    .map((f) => `- [${String(f.severity).toUpperCase()}] ${f.title} (${f.file})`)
    .join('\n');
}

return {
  report: lastReport,
  verdict: lastVerdict,
  cycles: cycle,
};

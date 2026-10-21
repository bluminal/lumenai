#!/usr/bin/env node
/*
lint-prd.mjs — structural and provenance audit of an epic page or PRD.

Ported from the retired `prd-linter` Haiku sub-agent (FR-HM26). The rubric
it enforced is reproduced here as executable checks so the audit costs zero
tokens and cannot drift from what the command claims it does.

Usage:
  node lint-prd.mjs <prd_path> [--document prd|epic_page]
                               [--sources <manifest.json>]
                               [--epic-page-present]
                               [--assumption-policy blocking|warn]

  --document            which rubric to apply. Default: prd.
  --sources            path to a JSON file holding either an assemble-bundle
                       manifest or a bare array of { path, summarized,
                       status, reason } entries. Enables the citation checks:
                       without it they are skipped and said to be skipped,
                       never implied to have passed.
  --epic-page-present  the why lives on an epic page, so Vision / Out of
                       Scope / Success Metrics belong there and not here.
  --assumption-policy  `blocking` (default) makes a surviving [A] CRITICAL;
                       `warn` downgrades that one check to MEDIUM and says so.

Output: a JSON report on stdout, same shape as lint-plan.mjs.
# Exit codes:
#   0 - no CRITICAL or HIGH findings (MEDIUM is the author's discretion)
#   1 - usage error: missing <prd_path>, unreadable file, or a bad flag value
#   2 - one or more CRITICAL or HIGH findings

── Reconciliation record ───────────────────────────────────────────────────
The sub-agent's rubric contained judgements a script cannot make. Each is
recorded here rather than silently dropped, so a reader can see the rubric
shrank deliberately and where the remaining coverage lives.

 1. DROPPED "success measures state something measurable". Deciding that
    "users are happy" is not a metric is a semantic judgement. The reviewers
    in /synthex:refine-requirements raise it; a regex cannot.
 2. DROPPED "every distinct claim in the prior content survives the reshape".
    Requires comparing two prose documents for meaning. This was the rubric's
    highest-value check and losing it is a real cost — write-prd therefore
    keeps it as an explicit instruction to the Product Manager.
 3. DROPPED "Out of Scope does not contradict a functional requirement" and
    "success metrics relate to the stated vision". Both are contradiction
    detection across prose.
 4. KEPT but narrowed: "volatile content outside the navigation block" fires
    only on unambiguous shapes — an ISO date, a `N/M` or percentage count, a
    status word from a closed list, or a `Phase N`/`Milestone N` heading.
    Prose implying staleness without one of those is left to a reader.
 5. ADDED (no sub-agent equivalent): section-number contiguity. The two PRD
    shapes number differently, so the rubric matches sections by NAME; this
    check is what keeps the numbering honest once names stop carrying it.
 6. ADDED: duplicate `FR-<id>` at HIGH. Downstream plans cite ids, and a
    duplicate is the observable symptom of one source ingested twice.
 7. ADDED: `[S]` may not cite a source whose manifest status is `unreadable`,
    and an `[S]` citing a `summarized: true` source must carry a verbatim
    excerpt. Both require the manifest, hence --sources.
 8. LOOSENED: "`[S]` names a document AND a location" accepts any of a page
    or section reference, a line or timestamp, or a quoted excerpt. The
    sub-agent's prose implied prose-judgement; this is the checkable core.
 9. KEPT verbatim: the disclaimer check compares against the exact sentence.
    Paraphrase dilutes the one inference it exists to name, so a substring
    match would defeat the check.
10. A `pending` Source Map cell is VALID and never a finding — it is a
    standing instruction to /synthex:refine-requirements, not an incomplete
    table. Any natural implementation would otherwise flag it.
*/

import { readFileSync } from 'node:fs';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM'];

const DISCLAIMER = 'This page is a summary, not the plan. For current status, follow the links above.';

const EPIC_STANDARD_SECTIONS = [
  'why this exists',
  'where the detail lives',
  'what changes',
  "how we'll know it worked",
  'out of scope',
  'additional context',
];

const GENERIC_CRITERIA = ['works correctly', 'functions as expected', 'works as intended', 'behaves correctly'];

const STATUS_WORDS = /\b(in progress|not started|blocked|shipped|done|complete[d]?|on track|at risk)\b/i;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const COUNT_SHAPE = /\b\d+\s*\/\s*\d+\b|\b\d+%/;
const PHASE_HEADING = /^#{1,6}\s+(phase|milestone)\s+\d/i;

const TAG_RE = /`\[(S|U|D|A)\]`/g;
const FR_HEADING_RE = /^####\s+(FR-[A-Za-z0-9._-]+)\s*:/;
const NFR_HEADING_RE = /^####\s+(NFR-[A-Za-z0-9._-]+)\s*:/;

function makeFinding(severity, title, location, rule, issue, fix) {
  return { severity, title, location, rule, issue, fix };
}

/** Split into lines, tracking which lines sit inside a fenced code block. */
function parseDocument(text) {
  const lines = text.split('\n');
  const fenced = new Array(lines.length).fill(false);
  let depth = 0;
  lines.forEach((line, i) => {
    const fence = line.match(/^\s*```(\S*)/);
    if (fence) {
      fenced[i] = true;
      depth += fence[1] ? 1 : -1;
      if (depth < 0) depth = 0;
      return;
    }
    fenced[i] = depth > 0;
  });

  const headings = [];
  lines.forEach((line, i) => {
    if (fenced[i]) return;
    const m = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (!m) return;
    const raw = m[2];
    const numbered = raw.match(/^(\d+)\.\s*(.*)$/);
    headings.push({
      level: m[1].length,
      raw,
      title: numbered ? numbered[2] : raw,
      ordinal: numbered ? Number(numbered[1]) : null,
      lineIndex: i,
    });
  });

  return { lines, fenced, headings };
}

/** The body lines under a heading, up to the next same-or-higher heading. */
function sectionBody({ lines, headings }, heading) {
  const next = headings.find((h) => h.lineIndex > heading.lineIndex && h.level <= heading.level);
  return lines.slice(heading.lineIndex + 1, next ? next.lineIndex : lines.length);
}

/** Find a heading whose title contains `needle` (lowercase substring). */
function findHeading(doc, needle) {
  return doc.headings.find((h) => h.title.toLowerCase().includes(needle));
}

/** Parse a markdown table into { headers, rows } of trimmed cells. */
function parseTable(bodyLines) {
  const rows = bodyLines
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
    .map((l) =>
      l
        .replace(/^\||\|$/g, '')
        .split(/(?<!\\)\|/)
        .map((c) => c.replace(/\\\|/g, '|').trim()),
    );
  if (rows.length === 0) return null;
  const headers = rows[0];
  const body = rows.slice(1).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
  return { headers, rows: body };
}

function colIndex(headers, name) {
  return headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
}

/** Normalize --sources input: an assemble-bundle manifest, or a bare array. */
function normalizeSources(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.sources)) return raw.sources;
    if (raw.manifest && Array.isArray(raw.manifest.sources)) return raw.manifest.sources;
  }
  return null;
}

// ── Epic-page rubric ────────────────────────────────────────────────────────

function lintEpicPage(doc, findings) {
  const why = findHeading(doc, 'why this exists');
  const nav = findHeading(doc, 'where the detail lives');

  if (!why) {
    findings.push(
      makeFinding(
        'CRITICAL',
        'Missing Why this exists',
        'document',
        'Epic-Level: `## Why this exists` present and non-empty',
        'No "## Why this exists" section found.',
        'Add a "## Why this exists" section stating what is broken, for whom, and what changes.',
      ),
    );
  } else if (sectionBody(doc, why).join('').trim() === '') {
    findings.push(
      makeFinding(
        'CRITICAL',
        'Why this exists is empty',
        `line ${why.lineIndex + 1}`,
        'Epic-Level: `## Why this exists` present and non-empty',
        'The "Why this exists" section has a heading but no content.',
        'State the reason this initiative exists, or remove the heading.',
      ),
    );
  }

  if (!nav) {
    findings.push(
      makeFinding(
        'CRITICAL',
        'Missing navigation block',
        'document',
        'Epic-Level: `## Where the detail lives` present',
        'No "## Where the detail lives" section found. A reader has no route to the live artifacts.',
        'Add the navigation block directly after "Why this exists", linking the requirements, the plan, and the work items.',
      ),
    );
  } else {
    if (why && nav.lineIndex < why.lineIndex) {
      findings.push(
        makeFinding(
          'HIGH',
          'Navigation block precedes Why this exists',
          `line ${nav.lineIndex + 1}`,
          'Epic-Level: the navigation block sits directly after `## Why this exists`',
          'The navigation block appears before the why.',
          'Move it directly after "Why this exists" so a skimmer reaches it before forming an impression.',
        ),
      );
    } else if (why) {
      const between = doc.headings.filter((h) => h.lineIndex > why.lineIndex && h.lineIndex < nav.lineIndex && h.level <= nav.level);
      if (between.length > 0) {
        findings.push(
          makeFinding(
            'HIGH',
            'Navigation block is not directly after Why this exists',
            `line ${nav.lineIndex + 1}`,
            'Epic-Level: the navigation block sits directly after `## Why this exists`',
            `"${between[0].raw}" sits between the why and the navigation block.`,
            'Move the navigation block up; it has to be above the fold.',
          ),
        );
      }
    }

    const navBody = sectionBody(doc, nav).join('\n');
    const navLines = navBody.split('\n').filter((l) => l.trim().startsWith('|'));
    for (const [needle, label] of [
      ['requirement', 'the requirements page'],
      ['plan', 'the implementation plan'],
      ['work item', 'the work items'],
    ]) {
      if (!navBody.toLowerCase().includes(needle)) {
        findings.push(
          makeFinding(
            'HIGH',
            `Navigation block does not route to ${label}`,
            `line ${nav.lineIndex + 1}`,
            'Epic-Level: the navigation block links the requirements page, the plan, and the work items',
            `No link to ${label}. A partial route is the same problem in miniature.`,
            `Add a row linking ${label}, with a current-state line.`,
          ),
        );
      }
    }

    const rowsWithoutState = navLines.filter((l) => {
      const cells = l.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
      if (cells.length < 2) return false;
      if (!/\[.*\]\(.*\)/.test(cells[0])) return false;
      return cells.slice(1).join('').trim() === '';
    });
    if (rowsWithoutState.length > 0) {
      findings.push(
        makeFinding(
          'HIGH',
          'Navigation row carries no current-state line',
          `line ${nav.lineIndex + 1}`,
          'Epic-Level: each navigation link carries a current-state line',
          `${rowsWithoutState.length} linked row(s) have an empty state cell.`,
          'Add the current state beside each link — without a freshness signal, detail elsewhere implies currency by itself.',
        ),
      );
    }

    if (!navBody.includes(DISCLAIMER)) {
      findings.push(
        makeFinding(
          'HIGH',
          'Summary-not-the-plan disclaimer missing or paraphrased',
          `line ${nav.lineIndex + 1}`,
          'Epic-Level: the disclaimer is present verbatim',
          'The navigation block does not contain the disclaimer exactly as specified.',
          `Add it verbatim: "${DISCLAIMER}"`,
        ),
      );
    }

    if (!/\*Maintained by Synthex/.test(navBody)) {
      findings.push(
        makeFinding(
          'MEDIUM',
          'Maintained-by-Synthex marker missing',
          `line ${nav.lineIndex + 1}`,
          'Epic-Level: `*Maintained by Synthex*` marker present',
          'Nothing tells a human the block is machine-owned.',
          'Add the "*Maintained by Synthex — edits here are overwritten.*" marker.',
        ),
      );
    }
  }

  const outOfScope = findHeading(doc, 'out of scope');
  if (!outOfScope) {
    findings.push(
      makeFinding(
        'HIGH',
        'Missing Out of scope',
        'document',
        'Epic-Level: `## Out of scope` present and non-empty',
        'No "Out of scope" section found. It is the most-skipped section and the one that bounds implementation.',
        'Add an "Out of scope" section listing the strategic exclusions.',
      ),
    );
  } else if (sectionBody(doc, outOfScope).join('').trim() === '') {
    findings.push(
      makeFinding(
        'HIGH',
        'Out of scope is empty',
        `line ${outOfScope.lineIndex + 1}`,
        'Epic-Level: `## Out of scope` present and non-empty',
        'The "Out of scope" section has a heading but no content.',
        'List what this initiative deliberately excludes.',
      ),
    );
  }

  if (!findHeading(doc, "know it worked")) {
    findings.push(
      makeFinding(
        'HIGH',
        'Missing success measures',
        'document',
        "Epic-Level: `## How we'll know it worked` present",
        'No success-measures section found. Unmeasurable success means nobody can tell if it worked.',
        'Add a "How we\'ll know it worked" section with measurable outcomes.',
      ),
    );
  }

  // Reconciliation #4 — volatile content, narrowed to unambiguous shapes.
  const navRange = nav
    ? (() => {
        const next = doc.headings.find((h) => h.lineIndex > nav.lineIndex && h.level <= nav.level);
        return [nav.lineIndex, next ? next.lineIndex : doc.lines.length];
      })()
    : [-1, -1];

  doc.lines.forEach((line, i) => {
    if (doc.fenced[i]) return;
    if (i >= navRange[0] && i < navRange[1]) return;
    const hit =
      (ISO_DATE.test(line) && 'a date') ||
      (COUNT_SHAPE.test(line) && 'a count') ||
      (STATUS_WORDS.test(line) && 'a status') ||
      (PHASE_HEADING.test(line) && 'a phase or milestone');
    if (!hit) return;
    findings.push(
      makeFinding(
        'CRITICAL',
        `Volatile content on the epic page (${hit})`,
        `line ${i + 1}`,
        'Epic-Level: no status, date, count, task, or milestone outside `## Where the detail lives`',
        `Line ${i + 1} carries ${hit}: "${line.trim().slice(0, 90)}"`,
        'Move it to the plan (milestone- or task-shaped) or the work items (status-shaped). Relocate; never delete.',
      ),
    );
  });

  const extras = doc.headings.filter(
    (h) => h.level === 2 && !EPIC_STANDARD_SECTIONS.some((s) => h.title.toLowerCase().includes(s)),
  );
  for (const extra of extras) {
    findings.push(
      makeFinding(
        'MEDIUM',
        `Non-standard epic section "${extra.raw}"`,
        `line ${extra.lineIndex + 1}`,
        'Epic-Level: no section beyond the standard five plus `Additional context`',
        `"${extra.raw}" is not part of the standard epic-page format.`,
        'Fold it into a standard section, or move it under "Additional context".',
      ),
    );
  }
}

// ── PRD rubric ──────────────────────────────────────────────────────────────

function lintPrd(doc, findings, opts) {
  const text = doc.lines.join('\n');

  if (!/^#\s+Product Requirements Document:/m.test(text)) {
    findings.push(
      makeFinding(
        'HIGH',
        'Missing PRD header',
        'document',
        'Document-Level: `# Product Requirements Document:` header present',
        'The document does not open with the PRD header.',
        'Add "# Product Requirements Document: <name>" as the first heading.',
      ),
    );
  }

  if (opts.epicPagePresent && !/^\*\*Epic:\*\*/m.test(text)) {
    findings.push(
      makeFinding(
        'HIGH',
        'Missing Epic reference',
        'document',
        'Document-Level: `**Epic:**` reference present when an epic page holds the why',
        'Under this shape the PRD is deliberately not self-contained, and without the link a reader cannot reach the why.',
        'Add "**Epic:** [name](url)" beneath the H1.',
      ),
    );
  }

  if (!/^\*\*Provenance:\*\*/m.test(text)) {
    findings.push(
      makeFinding(
        'MEDIUM',
        'Missing provenance legend',
        'document',
        'Document-Level: `**Provenance:**` legend present',
        'A reader has no key for the tags.',
        'Add the "**Provenance:**" legend line.',
      ),
    );
  }

  // Reconciliation #5 — sections are matched by NAME; contiguity carries numbering.
  const required = [
    ['functional requirements', 'Functional Requirements', 'HIGH'],
    ['non-functional', 'Non-Functional Requirements', 'HIGH'],
    ['assumptions', 'Assumptions & Constraints', 'MEDIUM'],
    ['open questions', 'Open Questions', 'MEDIUM'],
    ['target users', 'Target Users / Personas', 'HIGH'],
  ];
  for (const [needle, label, severity] of required) {
    if (needle === 'functional requirements') continue;
    if (!findHeading(doc, needle)) {
      findings.push(
        makeFinding(
          severity,
          `Missing ${label}`,
          'document',
          `Document-Level: a \`${label}\` section present`,
          `No "${label}" section found.`,
          `Add a "${label}" section.`,
        ),
      );
    }
  }

  const frHeading = doc.headings.find(
    (h) => h.title.toLowerCase().includes('functional requirements') && !h.title.toLowerCase().includes('non-functional'),
  );
  const frIds = doc.lines.map((l, i) => ({ l, i })).filter(({ l, i }) => !doc.fenced[i] && FR_HEADING_RE.test(l));
  if (!frHeading || frIds.length === 0) {
    findings.push(
      makeFinding(
        'CRITICAL',
        'No functional requirements',
        'document',
        'Document-Level: a `Functional Requirements` section present with at least one requirement',
        frHeading ? 'The Functional Requirements section contains no `#### FR-` requirement.' : 'No Functional Requirements section found.',
        'Add at least one requirement as "#### FR-<id>: <title> `[tag]`".',
      ),
    );
  }

  const numbered = doc.headings.filter((h) => h.level === 2 && h.ordinal !== null).map((h) => h.ordinal);
  if (numbered.length > 0) {
    const expected = Array.from({ length: numbered.length }, (_, i) => i + 1);
    if (numbered.join(',') !== expected.join(',')) {
      findings.push(
        makeFinding(
          'MEDIUM',
          'Section numbering is not contiguous',
          'document',
          'Document-Level: section numbers run contiguously from 1 with no gaps or repeats',
          `Section ordinals are [${numbered.join(', ')}]; expected [${expected.join(', ')}].`,
          'Renumber the sections so downstream prose citing them stays correct.',
        ),
      );
    }
  }

  const shapeSections = [
    ['vision', 'Vision & Purpose'],
    ['out of scope', 'Out of Scope'],
    ['success metrics', 'Success Metrics'],
  ];
  for (const [needle, label] of shapeSections) {
    const present = Boolean(findHeading(doc, needle));
    if (opts.epicPagePresent && present) {
      findings.push(
        makeFinding(
          'MEDIUM',
          `${label} duplicated from the epic page`,
          'document',
          'Document-Level: no Vision, Out of Scope, or Success Metrics section when an epic page holds the why',
          `"${label}" lives on the epic page under this shape; a second copy can disagree with it.`,
          `Remove "${label}" from the PRD and rely on the epic reference.`,
        ),
      );
    } else if (!opts.epicPagePresent && !present) {
      findings.push(
        makeFinding(
          'HIGH',
          `Missing ${label}`,
          'document',
          'Document-Level: Vision, Out of Scope, and Success Metrics all present when there is no epic page',
          `Without an epic page the PRD is the only home for the why, and one missing "${label}" is a feature list.`,
          `Add a "${label}" section.`,
        ),
      );
    }
  }

  lintCurrentAndTargetState(doc, findings);
  lintRequirements(doc, findings, opts);
  lintSourceAccounting(doc, findings, opts);
}

function lintCurrentAndTargetState(doc, findings) {
  const heading = findHeading(doc, 'current and target state');
  if (!heading) {
    findings.push(
      makeFinding(
        'MEDIUM',
        'Missing Current and Target State',
        'document',
        'Document-Level: a `Current and Target State` section present',
        'No before/after diagram section. A reader sees a change far faster than they read one.',
        'Add a "Current and Target State" section with a today and an once-delivered mermaid diagram — or omit it deliberately when the work changes no system shape.',
      ),
    );
    return;
  }

  const body = sectionBody(doc, heading).join('\n');
  const loc = `line ${heading.lineIndex + 1}`;
  const fences = body.match(/```mermaid/g) ?? [];

  if (fences.length < 2) {
    findings.push(
      makeFinding(
        'HIGH',
        'Current and Target State does not hold both diagrams',
        loc,
        'Document-Level: both a today and an once-delivered diagram when the section is present',
        `Found ${fences.length} mermaid diagram(s); the value is the delta, so both are required.`,
        'Add whichever of the today / once-delivered diagrams is missing.',
      ),
    );
  }

  const otherFences = (body.match(/```(\S*)/g) ?? []).filter((f) => f !== '```mermaid' && f !== '```');
  if (otherFences.length > 0) {
    findings.push(
      makeFinding(
        'HIGH',
        'Diagram is not a mermaid block',
        loc,
        'Document-Level: each diagram is a fenced ```mermaid block',
        `Found a fenced block tagged ${otherFences.join(', ')}. Anything else renders as literal text.`,
        'Tag the diagram fence as ```mermaid.',
      ),
    );
  }

  if (fences.length > 0 && !/^\s*\*[^*].*\*\s*$/m.test(body)) {
    findings.push(
      makeFinding(
        'HIGH',
        'Today diagram carries no basis line',
        loc,
        'Document-Level: the today diagram carries an italic basis line',
        'The today diagram is a claim about a system that already exists, and nothing records what it was read off.',
        'Add an italic line naming the source document, the codebase, or the answer it was drawn from.',
      ),
    );
  }

  const milestoneLabel = body.match(/\(M\d[\d.]*\)/);
  if (milestoneLabel) {
    findings.push(
      makeFinding(
        'HIGH',
        'Milestone label in the PRD',
        loc,
        'Document-Level: no milestone labels in `Current and Target State`',
        `Found "${milestoneLabel[0]}". Sequencing is the implementation plan's, and it re-phases without anything touching the PRD.`,
        'Remove the milestone labels here; the plan carries its own Target State by Milestone diagram.',
      ),
    );
  }

  // Unquoted parens in a node label are a mermaid parse error that renders nothing.
  for (const block of body.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    for (const label of block[1].matchAll(/\[([^\]]*)\]/g)) {
      const inner = label[1];
      if (inner.includes('(') && !inner.startsWith('(') && !inner.startsWith('"')) {
        findings.push(
          makeFinding(
            'HIGH',
            'Unquoted parentheses in a mermaid node label',
            loc,
            'Document-Level: node labels containing parentheses are quoted',
            `\`${label[0]}\` — mermaid rejects unquoted parentheses and renders nothing at all.`,
            `Quote the label: ["${inner}"]`,
          ),
        );
      }
    }
  }
}

function lintRequirements(doc, findings, opts) {
  const seen = new Map();
  const reqLines = doc.lines
    .map((l, i) => ({ l, i }))
    .filter(({ l, i }) => !doc.fenced[i] && (FR_HEADING_RE.test(l) || NFR_HEADING_RE.test(l)));

  for (const { l, i } of reqLines) {
    const id = (l.match(FR_HEADING_RE) ?? l.match(NFR_HEADING_RE))[1];
    const loc = `${id} (line ${i + 1})`;

    if (seen.has(id)) {
      findings.push(
        makeFinding(
          'HIGH',
          `Duplicate requirement id ${id}`,
          loc,
          'Requirement-Level: no `FR-<id>` appears twice',
          `${id} is also defined at line ${seen.get(id) + 1}. Downstream plans cite ids, and a duplicate is the observable symptom of one source ingested twice.`,
          'Give the newer requirement the next unused id; never renumber an existing one.',
        ),
      );
    } else {
      seen.set(id, i);
    }

    const next = reqLines.find((r) => r.i > i);
    const nextHeading = doc.headings.find((h) => h.lineIndex > i && h.level <= 3);
    const end = Math.min(next ? next.i : doc.lines.length, nextHeading ? nextHeading.lineIndex : doc.lines.length);
    const block = doc.lines.slice(i, end).join('\n');

    const tags = [...block.matchAll(TAG_RE)].map((m) => m[1]);
    if (tags.length === 0) {
      findings.push(
        makeFinding(
          'CRITICAL',
          `${id} carries no provenance tag`,
          loc,
          'Requirement-Level: carries one of `[S]` / `[U]` / `[D]` / `[A]`',
          'An untagged requirement has unknown origin.',
          'Tag it `[S]`, `[U]`, `[D]`, or `[A]` and add a **Source:** line.',
        ),
      );
    } else if (new Set(tags).size > 1) {
      findings.push(
        makeFinding(
          'HIGH',
          `${id} carries more than one provenance tag`,
          loc,
          'Requirement-Level: carries exactly one tag',
          `Tags found: ${[...new Set(tags)].map((t) => `[${t}]`).join(', ')}. Ambiguous provenance is no provenance.`,
          'Pick the single tag that describes where this requirement actually came from.',
        ),
      );
    }

    const sourceLine = block.match(/^\*\*Source:\*\*\s*(.+)$/m);
    if (!sourceLine) {
      findings.push(
        makeFinding(
          'CRITICAL',
          `${id} has no Source line`,
          loc,
          'Requirement-Level: has a `**Source:**` line',
          'The tag is a claim; the source line is the evidence.',
          'Add a "**Source:**" line naming where this came from.',
        ),
      );
    } else if (tags.includes('S')) {
      const src = sourceLine[1];
      const hasLocation = /\b(p+\.|page|section|§|line|at \d|\d{2}:\d{2}|"|“)/i.test(src);
      if (!hasLocation) {
        findings.push(
          makeFinding(
            'HIGH',
            `${id} cites a document without a location`,
            loc,
            'Requirement-Level: `[S]` source line names a document **and** a location within it',
            `"${src.slice(0, 90)}" — "from the meeting notes" is not a citation.`,
            'Add the page, section, line, timestamp, or a quoted excerpt.',
          ),
        );
      }
      if (opts.sources) {
        const cited = opts.sources.find((s) => s.path && src.includes(basename(s.path)));
        if (!cited) {
          findings.push(
            makeFinding(
              'HIGH',
              `${id} cites a document that was not supplied`,
              loc,
              'Requirement-Level: `[S]` source line names a document that appears in `sources`',
              `"${src.slice(0, 90)}" matches no entry in the supplied manifest. A citation to an input that was never supplied is unverifiable.`,
              'Cite a supplied source, or retag the requirement to reflect where it actually came from.',
            ),
          );
        } else if (cited.status === 'unreadable') {
          findings.push(
            makeFinding(
              'HIGH',
              `${id} cites an unreadable source`,
              loc,
              'Requirement-Level: `[S]` does not cite a source whose manifest status is `unreadable`',
              `${cited.path} could not be read (${cited.reason ?? 'no reason recorded'}). A citation is a claim the document was read.`,
              'Remove the citation or obtain the document; a requirement citing one nobody could open is a fabrication with a footnote.',
            ),
          );
        } else if (cited.summarized === true && !/["“][^"”]{12,}["”]/.test(src)) {
          findings.push(
            makeFinding(
              'HIGH',
              `${id} cites a summarized source without an excerpt`,
              loc,
              'Requirement-Level: `[S]` citing a `summarized: true` source carries a verbatim excerpt',
              `${cited.path} was summarized before the author saw it, so a remembered location satisfies the citation check while pointing at nothing.`,
              'Quote the supporting text verbatim, or demote the requirement to an Open Question.',
            ),
          );
        }
      }
    }

    if (tags.includes('A')) {
      const severity = opts.assumptionPolicy === 'warn' ? 'MEDIUM' : 'CRITICAL';
      findings.push(
        makeFinding(
          severity,
          `${id} is an unconfirmed assumption`,
          loc,
          'Assumption: no `[A]` tag remains, under the default blocking policy',
          'An unconfirmed assumption presented as a requirement is the failure mode this process exists to prevent.',
          'Confirm it with the user (making it `[U]`), ground it in a source (`[S]`/`[D]`), or demote it to an Open Question.',
        ),
      );
      if (sourceLine && sourceLine[1].trim().length < 12) {
        findings.push(
          makeFinding(
            'HIGH',
            `${id} states no reasoning for its assumption`,
            loc,
            'Assumption: every `[A]` states its reasoning',
            'An assumption without reasoning cannot be evaluated or confirmed.',
            'Record why this was assumed.',
          ),
        );
      }
    }

    const ac = block.match(/\*\*Acceptance Criteria:\*\*([\s\S]*)$/);
    if (!ac || ac[1].trim() === '') {
      findings.push(
        makeFinding(
          'HIGH',
          `${id} has no acceptance criteria`,
          loc,
          'Requirement-Level: has acceptance criteria',
          'A requirement nobody can check is not a requirement.',
          'Add specific, testable acceptance criteria.',
        ),
      );
    } else {
      const generic = GENERIC_CRITERIA.find((g) => ac[1].toLowerCase().includes(g));
      if (generic) {
        findings.push(
          makeFinding(
            'HIGH',
            `${id} has unfalsifiable acceptance criteria`,
            loc,
            'Requirement-Level: acceptance criteria are specific, not "works correctly"',
            `Criteria contain "${generic}", which passes trivially.`,
            'State what specifically must be observable.',
          ),
        );
      }
    }
  }
}

function basename(p) {
  return String(p).split(/[\\/]/).pop();
}

function lintSourceAccounting(doc, findings, opts) {
  const heading = findHeading(doc, 'source map');
  const text = doc.lines.join('\n');

  if (!heading) {
    if (opts.sources && opts.sources.length > 0) {
      findings.push(
        makeFinding(
          'HIGH',
          'Missing Source Map',
          'document',
          'Document-Level: a `Source Map` section present when `sources` were supplied',
          'Sources were supplied but the PRD accounts for none of them.',
          'Add a "Source Map" section listing each supplied document and what it contributed.',
        ),
      );
    }
    return;
  }

  const table = parseTable(sectionBody(doc, heading));
  const rows = table?.rows ?? [];
  const contributedIdx = table ? colIndex(table.headers, 'contributed') : -1;

  if (opts.sources) {
    for (const s of opts.sources) {
      const present = rows.some((r) => r[0] && r[0].includes(basename(s.path)));
      if (!present) {
        findings.push(
          makeFinding(
            'MEDIUM',
            `Supplied source missing from the Source Map: ${basename(s.path)}`,
            `line ${heading.lineIndex + 1}`,
            'Cross-Referential: every supplied source appears in the Source Map',
            'A source that contributed nothing is still worth knowing about.',
            `Add a row for ${s.path}, with "none" in Contributed if it contributed nothing.`,
          ),
        );
      }
    }

    // Reconciliation #10 — a `pending` cell is a standing instruction, not a finding.
    for (const r of rows) {
      const doc0 = r[0] ?? '';
      const contributed = contributedIdx >= 0 ? (r[contributedIdx] ?? '') : (r[1] ?? '');
      if (!doc0) continue;
      const pending = contributed.trim() === '' || /^pending$/i.test(contributed.trim());
      if (pending) continue;
      const supplied = opts.sources.some((s) => doc0.includes(basename(s.path)));
      if (!supplied) {
        findings.push(
          makeFinding(
            'HIGH',
            'Source Map cites a document that was not supplied',
            `line ${heading.lineIndex + 1}`,
            'Cross-Referential: no Source Map entry cites a document not in `sources`, when its Contributed cell is filled',
            `"${doc0.slice(0, 70)}" claims a contribution but appears in no supplied manifest. Indicates a fabricated citation.`,
            'Remove the row, or mark it `pending` if it is a source still awaiting ingest.',
          ),
        );
      }
    }
  }

  // Accounting, not a judgement about what the link is.
  const accounted = new Set();
  for (const r of rows) for (const c of r) for (const m of String(c).matchAll(/\((https?:\/\/[^)]+)\)|\b(\S+\.(?:md|txt|pdf|docx?))\b/g)) accounted.add(m[1] ?? m[2]);
  doc.lines.forEach((line, i) => {
    if (doc.fenced[i]) return;
    if (heading && i > heading.lineIndex) return;
    if (/^\*\*(Source|Epic):\*\*/.test(line.trim())) return;
    for (const m of line.matchAll(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/g)) {
      if (accounted.has(m[1])) continue;
      findings.push(
        makeFinding(
          'MEDIUM',
          'Unaccounted-for link in the PRD body',
          `line ${i + 1}`,
          'Cross-Referential: every link in the PRD body is accounted for — a Source Map row, a `**Source:**` line, or the `**Epic:**` link',
          `${m[1].slice(0, 70)} appears in no Source Map row. This is an accounting check, not a judgement about what the link is.`,
          'Add it to the Source Map (marked `pending` if it should be ingested), or leave it if it is an ordinary reference.',
        ),
      );
    }
  });
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function lintPrdText(text, opts) {
  const doc = parseDocument(text);
  const findings = [];
  if (opts.document === 'epic_page') lintEpicPage(doc, findings);
  else lintPrd(doc, findings, opts);
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

function parseArgs(argv) {
  const opts = { path: null, document: 'prd', sources: null, epicPagePresent: false, assumptionPolicy: 'blocking', sourcesSkipped: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--document') opts.document = argv[++i];
    else if (a === '--sources') opts.sourcesPath = argv[++i];
    else if (a === '--epic-page-present') opts.epicPagePresent = true;
    else if (a === '--assumption-policy') opts.assumptionPolicy = argv[++i];
    else if (a.startsWith('--')) return { error: `unknown flag ${a}` };
    else if (opts.path === null) opts.path = a;
    else return { error: `unexpected argument ${a}` };
  }
  if (!opts.path) return { error: 'usage: node lint-prd.mjs <prd_path> [--document prd|epic_page] [--sources <manifest.json>] [--epic-page-present] [--assumption-policy blocking|warn]' };
  if (!['prd', 'epic_page'].includes(opts.document)) return { error: `--document must be prd or epic_page, got "${opts.document}"` };
  if (!['blocking', 'warn'].includes(opts.assumptionPolicy)) return { error: `--assumption-policy must be blocking or warn, got "${opts.assumptionPolicy}"` };
  return { opts };
}

function main() {
  const { opts, error } = parseArgs(process.argv.slice(2));
  if (error) {
    process.stderr.write(`lint-prd: ${error}\n`);
    process.exit(1);
  }

  let text;
  try {
    text = readFileSync(opts.path, 'utf8');
  } catch (err) {
    process.stderr.write(`lint-prd: cannot read ${opts.path} — ${err.message}\n`);
    process.exit(1);
  }

  if (opts.sourcesPath) {
    try {
      opts.sources = normalizeSources(JSON.parse(readFileSync(opts.sourcesPath, 'utf8')));
      opts.sourcesSkipped = false;
    } catch (err) {
      process.stderr.write(`lint-prd: cannot read --sources ${opts.sourcesPath} — ${err.message}\n`);
      process.exit(1);
    }
    if (!opts.sources) {
      process.stderr.write('lint-prd: --sources holds no sources array\n');
      process.exit(1);
    }
  }

  const findings = lintPrdText(text, opts);
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  for (const f of findings) counts[f.severity] += 1;

  const skipped = [];
  if (opts.sourcesSkipped) skipped.push('citation checks (no --sources manifest supplied)');
  skipped.push('measurable-success, prior-content survival, and contradiction checks (see the reconciliation record)');

  const result = {
    prd_file: opts.path,
    document: opts.document,
    rubric_version: 'lint-prd.mjs v1 (synthex; ported from the prd-linter sub-agent, FR-HM26)',
    total_findings: findings.length,
    counts,
    findings,
    checks_skipped: skipped,
    passed: counts.CRITICAL === 0 && counts.HIGH === 0,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(counts.CRITICAL > 0 || counts.HIGH > 0 ? 2 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

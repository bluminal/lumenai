#!/usr/bin/env node
/*
lint-plan.mjs — fast structural lint for a draft implementation plan
(FR-HM26, Task 45). Replaces the now-retired `plan-linter` Haiku sub-agent:
same checks, same CRITICAL/HIGH/MEDIUM severities, JSON instead of markdown
so `write-implementation-plan.md` Step 5.5 can hand the report straight to
the Product Manager without a parsing step.

Called as:
  node lint-plan.mjs <plan_path>

Two rubrics existed before this script and disagreed in places:
  - `agents/plan-linter.md`'s "Built-in Rubric" (deterministic-by-prose,
    never machine-checked)
  - `tests/schemas/implementation-plan.ts` (machine-checked, but only ever
    run against agent-output fixtures, never against real docs/plans/*.md)

Reconciling them meant running both sets of rules against the real plans in
docs/plans/ and keeping whichever version each real, already-shipped plan
actually satisfies. Decisions (see tests/schemas/lint-plan.test.ts for the
parity proof):

  1. Header/Overview/Decisions/Open Questions presence, and "at least one
     Phase section": kept from plan-linter, same severities (HIGH / MEDIUM /
     HIGH / HIGH / CRITICAL).
  2. "Each phase name contains 'Delivers X Value'": DROPPED. No phase
     heading in docs/plans/*.md follows this convention (e.g. "Phase 5:
     Zero-Token Scripts and Utility Retirement") — plan-linter's rubric was
     aspirational and never actually enforced.
  3. "At least one Milestone section": ADDED (ported from
     implementation-plan.ts, CRITICAL). plan-linter had milestone-level
     checks but no document-level "milestones exist at all" gate.
  4. Decisions/Open-Questions/Task table column checks: ported
     implementation-plan.ts's lenient substring match verbatim (a header
     "Context / Rationale" satisfies both "Context" and "Rationale"). A
     strict distinct-column check would fail every real plan — the shipped
     Decisions tables merge those two columns.
  5. Complexity S/M/L: kept, elevated from implementation-plan.ts's WARNING
     to plan-linter's HIGH (a non-S/M/L value is a real defect, not a nit).
  6. Dependencies/Status populated: ported from plan-linter (HIGH/MEDIUM).
     implementation-plan.ts has no equivalent.
  7. Parallelizable / Milestone Value / Observational Outcomes: kept
     plan-linter's *conditional* presence logic (Parallelizable required
     only when the milestone has more than one task; Observational Outcomes
     required only when an `[O]` tag appears in the milestone) rather than
     implementation-plan.ts's whole-document substring check, which is
     satisfied by a single instance anywhere in the file and so cannot
     catch a milestone that is actually missing one. The per-milestone
     version is what real plans (19/21 Parallelizable, 21/21 Milestone
     Value in docs/plans/harness-modernization.md) actually satisfy.
  8. "Every acceptance criterion in a Task N block is tagged
     `[T]`/`[H]`/`[O]`": LOOSENED from plan-linter's literal wording to "the
     block contains at least one recognized tag". Shipped plans write a
     Task's Acceptance Criteria as one narrative line mixing tags with free
     -form completion notes (e.g. "`[T]` ... → done in `d4663f1`: ...
     Suite 174 files / 5328 passed."); per-clause exhaustive tagging can't
     be verified against that prose without flagging legitimate completion
     notes as violations. Still CRITICAL when the block is missing entirely
     or has zero tags.
  9. "At least one `[T]` criterion (for functional tasks)": DROPPED. Real
     plans legitimately have all-`[H]` tasks (Milestone 1.2/1.3's spike
     tasks in docs/plans/harness-modernization.md have zero `[T]` criteria
     by design — a spike produces a recorded result and a human sign-off,
     not testable code). Distinguishing "legitimately investigative" from
     "should have had a `[T]`" isn't something a deterministic script can
     do, so the check is left to the human reviewers plan-linter always
     deferred substantive judgment to.
  10. Generic acceptance-criteria phrases ("works correctly", "functions as
      expected"): kept as HIGH, exact-phrase deny-list (case-insensitive).
  11. Dependency cross-references (target task exists; no forward
      reference to a task that appears later in the document): ADDED,
      ported from plan-linter's cross-referential checks (HIGH / CRITICAL).
      implementation-plan.ts has nothing here. Task numbers are only
      extracted when the Dependencies cell contains the word "Task"/"Tasks"
      so older-template cells like "M1.1, spike Q2 result" (docs/plans/
      plus.md) are left alone instead of misreading "1.1" as task 1.
  12. `[O]` tags must appear only at milestone/phase level, never inside a
      Task N Acceptance Criteria block: kept, MEDIUM. Zero violations across
      docs/plans/harness-modernization.md and docs/plans/multi-model-review.md.
  13. "`[H]` tasks are flagged in the Parallelizable note": DROPPED. Real
      plans satisfy this only through loose natural-language proximity
      ("27, 28 `[H]`: start early") that cannot be matched deterministically
      without a high false-positive rate, and the `[H]` gate itself is
      enforced at execution time by next-priority.md, not by static lint.
  14. Table-cell parsing unescapes `\|` before splitting on `|` (a table
      cell in docs/plans/harness-modernization.md's Task 56 row contains
      literal `` `prose\|workflow` `` inline code). implementation-plan.ts's
      shared table-row splitter (tests/schemas/helpers.ts, used by a dozen
      other schema validators) does not do this and consequently misreads
      that one row's Complexity column as a warning-level violation —
      a latent bug in the shared helper, out of scope to fix here since it
      is not specific to plan linting. tests/schemas/lint-plan.test.ts
      documents this as the one known, intentional divergence rather than
      silently asserting exact parity.

Plans that don't follow the `# Implementation Plan:` / `## Phase` /
`### Milestone` template at all (e.g. docs/plans/cross-harness-compatibility
-testing.md, which is a different kind of document) simply fail the
document-level checks under both the old rubric and this script — that is
agreement, not an exception.

# Exit codes:
#   0 - no CRITICAL or HIGH findings (MEDIUM findings, if any, are left to
#       the Product Manager's discretion per write-implementation-plan.md
#       Step 5.5)
#   1 - usage error: missing <plan_path> argument, or the file could not be
#       read
#   2 - one or more CRITICAL or HIGH findings
*/

import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Markdown parsing (mirrors tests/schemas/helpers.ts's parseSections/
// parseTables semantics closely enough to agree with implementation-plan.ts
// on the same input, without importing the TS test helper from a shipped
// runtime script).
// ---------------------------------------------------------------------------

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const TABLE_ROW_RE = /^\|(.+)\|$/;
const TABLE_SEP_RE = /^\|[\s\-:|]+\|$/;

function parseTableRow(line) {
  // Split on unescaped pipes only — real rows in docs/plans/*.md contain
  // literal `\|` inside inline code (e.g. "code_review.engine: prose\|workflow")
  // that must NOT be treated as a column separator.
  return line
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function colIndex(headers, name) {
  const lower = name.toLowerCase();
  return headers.findIndex((h) => h.toLowerCase().includes(lower));
}

/**
 * Walks the document once, producing:
 *   - headings: [{ level, title, lineIndex }]
 *   - tables: [{ sectionTitle, headers, rows, headerLineIndex, rowLineIndices }]
 *     `sectionTitle` is the most recently seen heading text of ANY level,
 *     exactly like helpers.ts's parseTables — a table right under a
 *     Milestone heading gets that milestone's title as its sectionTitle.
 */
function parseDocument(text) {
  const lines = text.split('\n');
  const headings = [];
  const tables = [];
  let currentSection = '';
  let i = 0;

  while (i < lines.length) {
    const headingMatch = lines[i].match(HEADING_RE);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      headings.push({ level, title, lineIndex: i });
      currentSection = title;
      i++;
      continue;
    }

    if (TABLE_ROW_RE.test(lines[i]) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const headers = parseTableRow(lines[i]);
      const headerLineIndex = i;
      i += 2;
      const rows = [];
      const rowLineIndices = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i]) && !TABLE_SEP_RE.test(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        rowLineIndices.push(i);
        i++;
      }
      tables.push({ sectionTitle: currentSection, headers, rows, headerLineIndex, rowLineIndices });
      continue;
    }

    i++;
  }

  return { lines, headings, tables };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

function makeFinding(severity, title, location, rule, issue, fix) {
  return { severity, title, location, rule, issue, fix };
}

function lintPlan(text) {
  const findings = [];
  const { lines, headings, tables } = parseDocument(text);

  // ── Document-level checks ────────────────────────────────────────────

  if (!/^#\s+Implementation Plan:/m.test(text)) {
    findings.push(
      makeFinding(
        'HIGH',
        'Missing top-level heading',
        'document start',
        'Document-Level: `# Implementation Plan:` header present',
        'The document does not start with "# Implementation Plan: [Product Name]".',
        'Add "# Implementation Plan: [Product Name]" as the first heading.',
      ),
    );
  }

  const hasHeading = (needle) => headings.some((h) => h.title.toLowerCase().includes(needle));

  if (!hasHeading('overview')) {
    findings.push(
      makeFinding(
        'MEDIUM',
        'Missing Overview section',
        'document',
        'Document-Level: `## Overview` section present',
        'No "## Overview" section found.',
        'Add a "## Overview" section orienting readers to the plan.',
      ),
    );
  }

  if (!hasHeading('decisions')) {
    findings.push(
      makeFinding(
        'HIGH',
        'Missing Decisions section',
        'document',
        'Document-Level: `## Decisions` section present',
        'No "## Decisions" section found.',
        'Add a "## Decisions" section recording planning decisions and rationale.',
      ),
    );
  }

  if (!hasHeading('open questions')) {
    findings.push(
      makeFinding(
        'HIGH',
        'Missing Open Questions section',
        'document',
        'Document-Level: `## Open Questions` section present',
        'No "## Open Questions" section found.',
        'Add an "## Open Questions" section tracking unresolved items.',
      ),
    );
  }

  // Level-pinned to match implementation-plan.ts's `/^##\s+Phase\s+\d+/m`
  // exactly — a `### Phase N` sub-heading in a differently-shaped document
  // (e.g. docs/plans/cross-harness-compatibility-testing.md) must NOT count.
  const phaseHeadings = headings.filter((h) => h.level === 2 && /^Phase\s+\d+/i.test(h.title));
  if (phaseHeadings.length === 0) {
    findings.push(
      makeFinding(
        'CRITICAL',
        'No Phase sections',
        'document',
        'Document-Level: at least one `## Phase` section',
        'The plan has no "## Phase N: [Name]" sections — it has no content.',
        'Add at least one "## Phase N: [Name]" section.',
      ),
    );
  }

  // Level-pinned to match implementation-plan.ts's
  // `/^###\s+Milestone\s+\d+\.\d+/m` exactly, for the same reason.
  const milestoneHeadings = headings.filter((h) => h.level === 3 && /^Milestone\s+\d+\.\d+/i.test(h.title));
  if (milestoneHeadings.length === 0) {
    findings.push(
      makeFinding(
        'CRITICAL',
        'No Milestone sections',
        'document',
        'Document-Level: at least one `### Milestone` section',
        'The plan has no "### Milestone N.N: [Name]" sections.',
        'Add at least one "### Milestone N.N: [Name]" section under a Phase.',
      ),
    );
  }

  // ── Decisions / Open Questions table column checks ─────────────────────

  const decisionsTable = tables.find((t) => t.sectionTitle.toLowerCase().includes('decisions'));
  if (decisionsTable) {
    for (const col of ['#', 'Decision', 'Context', 'Rationale']) {
      if (colIndex(decisionsTable.headers, col) === -1) {
        findings.push(
          makeFinding(
            'HIGH',
            `Decisions table missing column "${col}"`,
            `Decisions table (line ${decisionsTable.headerLineIndex + 1})`,
            'Cross-Referential: Decisions table column structure',
            `The Decisions table has no column matching "${col}".`,
            `Add a "${col}" column (or a merged column whose header text includes "${col}") to the Decisions table.`,
          ),
        );
      }
    }
  }

  const openQuestionsTable = tables.find((t) => t.sectionTitle.toLowerCase().includes('open questions'));
  if (openQuestionsTable) {
    for (const col of ['#', 'Question', 'Impact', 'Status']) {
      if (colIndex(openQuestionsTable.headers, col) === -1) {
        findings.push(
          makeFinding(
            'HIGH',
            `Open Questions table missing column "${col}"`,
            `Open Questions table (line ${openQuestionsTable.headerLineIndex + 1})`,
            'Cross-Referential: Open Questions table column structure',
            `The Open Questions table has no column matching "${col}".`,
            `Add a "${col}" column (or a merged column whose header text includes "${col}") to the Open Questions table.`,
          ),
        );
      }
    }
  }

  // ── Milestone-level + Task-level + cross-referential checks ────────────

  // Registry of every task number seen, for XREF checks: number -> earliest
  // row line index (document-order proxy for "which phase/milestone").
  const taskLineIndex = new Map();

  // Milestone body spans: from the heading's line to the next heading with
  // level <= 3 (the next Milestone or Phase), or EOF.
  function milestoneBodyRange(idx) {
    const start = milestoneHeadings[idx].lineIndex;
    let end = lines.length;
    for (const h of headings) {
      if (h.lineIndex > start && h.level <= 3) {
        end = h.lineIndex;
        break;
      }
    }
    return [start, end];
  }

  const milestoneTasks = []; // [{ milestoneTitle, taskNum, complexity, deps, status, lineIndex }]

  milestoneHeadings.forEach((milestone, idx) => {
    const [start, end] = milestoneBodyRange(idx);
    const bodyText = lines.slice(start, end).join('\n');

    const taskTable = tables.find(
      (t) => t.sectionTitle === milestone.title && t.headerLineIndex >= start && t.headerLineIndex < end,
    );

    if (!taskTable) {
      findings.push(
        makeFinding(
          'CRITICAL',
          `${milestone.title}: no task table`,
          `${milestone.title} (line ${milestone.lineIndex + 1})`,
          'Milestone-Level: task table present',
          'No "| # | Task | Complexity | Dependencies | Status |"-shaped table found in this milestone.',
          'Add a task table immediately under the milestone heading.',
        ),
      );
    } else {
      for (const col of ['#', 'Task', 'Complexity', 'Dependencies', 'Status']) {
        if (colIndex(taskTable.headers, col) === -1) {
          findings.push(
            makeFinding(
              'HIGH',
              `${milestone.title}: task table missing column "${col}"`,
              `${milestone.title} task table (line ${taskTable.headerLineIndex + 1})`,
              'Milestone-Level: task table column structure',
              `The task table has no column matching "${col}".`,
              `Add a "${col}" column to the task table.`,
            ),
          );
        }
      }

      const numIdx = colIndex(taskTable.headers, '#');
      const complexityIdx = colIndex(taskTable.headers, 'Complexity');
      const depsIdx = colIndex(taskTable.headers, 'Dependencies');
      const statusIdx = colIndex(taskTable.headers, 'Status');

      taskTable.rows.forEach((row, rowIdx) => {
        const lineIndex = taskTable.rowLineIndices[rowIdx];
        const taskNumRaw = numIdx >= 0 ? (row[numIdx] ?? '').trim() : '';
        // Task ids are opaque strings, not always plain integers — the
        // consolidation-pipeline sub-tasks in docs/plans/multi-model-review.md
        // use "29a"/"29b" for a split task. Only `\d+[a-zA-Z]?` is accepted as
        // a task id so this script never confuses a milestone number ("1.1")
        // or arbitrary prose in a malformed "#" cell for a task reference.
        const taskNum = /^\d+[a-zA-Z]?$/.test(taskNumRaw) ? taskNumRaw : undefined;
        const complexity = complexityIdx >= 0 ? (row[complexityIdx] ?? '').trim() : '';
        const deps = depsIdx >= 0 ? (row[depsIdx] ?? '').trim() : '';
        const status = statusIdx >= 0 ? (row[statusIdx] ?? '').trim() : '';
        const taskLabel = taskNum !== undefined ? `Task ${taskNum}` : `row ${rowIdx + 1}`;

        if (taskNum !== undefined && !taskLineIndex.has(taskNum)) {
          taskLineIndex.set(taskNum, lineIndex);
        }

        if (complexityIdx >= 0 && complexity && !['S', 'M', 'L'].includes(complexity)) {
          findings.push(
            makeFinding(
              'HIGH',
              `${taskLabel}: invalid complexity "${complexity}"`,
              `${milestone.title}, ${taskLabel} (line ${lineIndex + 1})`,
              'Task-Level: complexity is S, M, or L',
              `Complexity value "${complexity}" is not one of S, M, L.`,
              'Set Complexity to S, M, or L.',
            ),
          );
        }

        if (depsIdx >= 0 && !deps) {
          findings.push(
            makeFinding(
              'HIGH',
              `${taskLabel}: Dependencies field empty`,
              `${milestone.title}, ${taskLabel} (line ${lineIndex + 1})`,
              'Task-Level: Dependencies field populated',
              'The Dependencies cell is empty.',
              'Populate Dependencies with the depended-on task numbers, or "None".',
            ),
          );
        }

        if (statusIdx >= 0 && !status) {
          findings.push(
            makeFinding(
              'MEDIUM',
              `${taskLabel}: Status field empty`,
              `${milestone.title}, ${taskLabel} (line ${lineIndex + 1})`,
              'Task-Level: Status field populated',
              'The Status cell is empty.',
              'Populate Status (default: "pending").',
            ),
          );
        }

        if (taskNum !== undefined) {
          milestoneTasks.push({
            milestoneTitle: milestone.title,
            taskNum,
            deps,
            lineIndex,
          });
        }
      });

      // Milestone Value / Parallelizable / Observational Outcomes
      if (!bodyText.includes('**Milestone Value:**')) {
        findings.push(
          makeFinding(
            'HIGH',
            `${milestone.title}: missing Milestone Value`,
            `${milestone.title} (line ${milestone.lineIndex + 1})`,
            'Milestone-Level: `**Milestone Value:**` line present',
            'No "**Milestone Value:**" line found in this milestone.',
            'Add a "**Milestone Value:** [description]" line after the task table.',
          ),
        );
      }

      if (taskTable.rows.length > 1 && !bodyText.includes('**Parallelizable:**')) {
        findings.push(
          makeFinding(
            'HIGH',
            `${milestone.title}: missing Parallelizable callout`,
            `${milestone.title} (line ${milestone.lineIndex + 1})`,
            'Milestone-Level: `**Parallelizable:**` line present when milestone has multiple tasks',
            'This milestone has more than one task but no "**Parallelizable:**" line.',
            'Add a "**Parallelizable:**" line describing which tasks can run concurrently.',
          ),
        );
      }

      if (/`\[O\]`/.test(bodyText) && !bodyText.includes('**Observational Outcomes:**')) {
        findings.push(
          makeFinding(
            'MEDIUM',
            `${milestone.title}: missing Observational Outcomes`,
            `${milestone.title} (line ${milestone.lineIndex + 1})`,
            'Milestone-Level: `**Observational Outcomes:**` line present when an `[O]` criterion exists',
            'This milestone contains an `[O]`-tagged criterion but no "**Observational Outcomes:**" line.',
            'Add a "**Observational Outcomes:**" line listing the outcome(s) to observe post-deployment.',
          ),
        );
      }
    }
  });

  // ── Task N Acceptance Criteria blocks ───────────────────────────────

  const AC_MARKER_RE = /^\*\*Task\s+(\d+[a-zA-Z]?)\s+Acceptance Criteria:\*\*/;
  const GENERIC_PHRASES = ['works correctly', 'functions as expected'];

  for (const { milestoneTitle, taskNum, lineIndex } of milestoneTasks) {
    let acLineIdx = -1;
    let acMarkerMatch = null;
    for (let idx = 0; idx < lines.length; idx++) {
      const m = lines[idx].match(AC_MARKER_RE);
      if (m && m[1] === taskNum) {
        acLineIdx = idx;
        acMarkerMatch = m;
        break;
      }
    }

    const taskLabel = `Task ${taskNum}`;

    if (acLineIdx === -1) {
      findings.push(
        makeFinding(
          'CRITICAL',
          `${taskLabel}: no Acceptance Criteria block`,
          `${milestoneTitle}, ${taskLabel} (line ${lineIndex + 1})`,
          'Task-Level: has a `**Task N Acceptance Criteria:**` block after the table',
          `No "**Task ${taskNum} Acceptance Criteria:**" line found.`,
          `Add a "**Task ${taskNum} Acceptance Criteria:**" line with at least one tagged criterion.`,
        ),
      );
      continue;
    }

    // Content = the marker line's remainder, plus any immediately
    // following bullet ("- ...") lines (the bulleted-list AC style).
    let content = lines[acLineIdx].slice(acMarkerMatch[0].length);
    let j = acLineIdx + 1;
    while (j < lines.length && /^\s*-\s/.test(lines[j])) {
      content += `\n${lines[j]}`;
      j++;
    }

    const tags = content.match(/`\[(T|H|O)\]`/g) ?? [];

    if (tags.length === 0) {
      findings.push(
        makeFinding(
          'CRITICAL',
          `${taskLabel}: Acceptance Criteria has no typed tags`,
          `${milestoneTitle}, ${taskLabel} (line ${acLineIdx + 1})`,
          'Task-Level: every acceptance criterion is tagged `[T]`, `[H]`, or `[O]`',
          'The Acceptance Criteria block contains no `[T]`/`[H]`/`[O]` tag.',
          'Tag each criterion `[T]` (testable), `[H]` (human-validated), or `[O]` (observational).',
        ),
      );
    }
    // NOTE: "at least one [T] criterion" is intentionally NOT checked here
    // — see reconciliation decision #9 in the header comment.

    if (/`\[O\]`/.test(content)) {
      findings.push(
        makeFinding(
          'MEDIUM',
          `${taskLabel}: [O] criterion inside a task block`,
          `${milestoneTitle}, ${taskLabel} (line ${acLineIdx + 1})`,
          'Cross-Referential: `[O]` criteria appear at milestone or phase level, not inside individual task blocks',
          'An `[O]`-tagged criterion appears inside this task\'s Acceptance Criteria block.',
          'Move the `[O]` criterion to the milestone\'s "**Observational Outcomes:**" line.',
        ),
      );
    }

    const lowerContent = content.toLowerCase();
    for (const phrase of GENERIC_PHRASES) {
      if (lowerContent.includes(phrase)) {
        findings.push(
          makeFinding(
            'HIGH',
            `${taskLabel}: generic acceptance criterion`,
            `${milestoneTitle}, ${taskLabel} (line ${acLineIdx + 1})`,
            'Task-Level: acceptance criteria are specific (not "Works correctly", "Functions as expected")',
            `The Acceptance Criteria block contains the generic phrase "${phrase}".`,
            'Replace the generic phrase with a specific, verifiable criterion.',
          ),
        );
      }
    }
  }

  // ── Cross-referential: dependency references ────────────────────────

  // Only pulled from cells that mention "task" at all — this keeps
  // older-template Dependencies cells like docs/plans/plus.md's
  // "M1.1, spike Q2 result" (a milestone reference, not a task reference)
  // from being misread as a dependency on task 1.
  const TASK_ID_RE = /\b\d+[a-zA-Z]?\b/g;

  for (const { milestoneTitle, taskNum, deps, lineIndex } of milestoneTasks) {
    if (!deps || !/task/i.test(deps)) continue;
    const refs = new Set(deps.match(TASK_ID_RE) ?? []);

    for (const ref of refs) {
      if (ref === taskNum) continue; // self-reference typo, not this check's concern
      if (!taskLineIndex.has(ref)) {
        findings.push(
          makeFinding(
            'HIGH',
            `Task ${taskNum}: dependency on unknown Task ${ref}`,
            `${milestoneTitle}, Task ${taskNum} (line ${lineIndex + 1})`,
            'Cross-Referential: task dependencies reference tasks that exist in the plan',
            `Task ${taskNum} depends on Task ${ref}, which does not appear in any task table.`,
            `Fix the Dependencies cell, or add Task ${ref} to the plan.`,
          ),
        );
        continue;
      }
      if (taskLineIndex.get(ref) > lineIndex) {
        findings.push(
          makeFinding(
            'CRITICAL',
            `Task ${taskNum}: forward dependency on Task ${ref}`,
            `${milestoneTitle}, Task ${taskNum} (line ${lineIndex + 1})`,
            'Cross-Referential: no task depends on a task in a later phase or milestone',
            `Task ${taskNum} depends on Task ${ref}, which appears later in the plan.`,
            'Reorder the tasks, or fix the Dependencies cell.',
          ),
        );
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const planPath = process.argv[2];
  if (!planPath) {
    process.stderr.write('lint-plan: usage: node lint-plan.mjs <plan_path>\n');
    process.exit(1);
  }

  let text;
  try {
    text = readFileSync(planPath, 'utf8');
  } catch (err) {
    process.stderr.write(`lint-plan: cannot read ${planPath} — ${err.message}\n`);
    process.exit(1);
  }

  const findings = lintPlan(text);
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  for (const f of findings) counts[f.severity]++;

  const result = {
    plan_file: planPath,
    rubric_version: 'lint-plan.mjs v1 (synthex; ported from plan-linter, reconciled with implementation-plan.ts)',
    total_findings: findings.length,
    counts,
    findings,
    passed: counts.CRITICAL === 0 && counts.HIGH === 0,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(counts.CRITICAL > 0 || counts.HIGH > 0 ? 2 : 0);
}

main();

/**
 * Layer 1 validator: team-review multi-model spawn-prompt blob assertions.
 *
 * Task 17 — FR-MMT4, FR-MMT20, D22 resolution.
 *
 * Test surface: composed spawn-prompt blob strings that the team-review command
 * writes when spawning Lead and native reviewers with multi_model=true.
 * Per D22: these tests do NOT invoke live teammates. They assert raw-string
 * presence/absence of overlay text in the spawn-prompt blob the command composes
 * from plugins/synthex-plus/templates/review.md.
 *
 * Per D22 composition note (verbatim from review.md):
 *   "Commands compose teammate spawn prompts by reading this file and including
 *    the relevant overlay sections verbatim (raw inclusion) when their flags
 *    resolve true."
 *
 * Three test groups:
 *   1. Composed Lead spawn-prompt blob — FR-MMT4 suppression verbatim
 *   2. Composed reviewer spawn-prompt blob — FR-MMT20 envelope clause verbatim
 *   3. team-review output shape (multi-model branch) — ## Code Review Report
 *   4. multi-model disabled — overlay absence regression (FR-MMT3 criterion 8)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ── Review template path ─────────────────────────────────────────────────────

export const REVIEW_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'templates', 'review.md'
);

// ── Helper: extract a named section ─────────────────────────────────────────
//
// Reads from the given heading to the next `\n---\n` or `\n### ` at the same
// nesting level, returning the entire contiguous subtree verbatim.

export function extractSection(content: string, heading: string): string {
  const headingIndex = content.indexOf(heading);
  if (headingIndex === -1) return '';
  const afterHeading = content.slice(headingIndex);
  const nextSectionMatch = afterHeading.match(/\n---\n|\n### /);
  if (!nextSectionMatch || nextSectionMatch.index === undefined) return afterHeading;
  return afterHeading.slice(0, nextSectionMatch.index);
}

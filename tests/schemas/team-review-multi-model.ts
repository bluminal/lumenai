/**
 * Layer 1 validator: multi-model spawn-prompt blob assertions for the
 * standing-pool Lead/reviewer overlay in templates/review.md.
 *
 * Task 17 — FR-MMT4, FR-MMT20, D22 resolution. Repointed by Task 55
 * (FR-HM2, FR-HM24): the original `team-review` command that composed
 * these spawn prompts is retired outright (not folded — its behavior is
 * the capability ladder inside review-code.md); the synthex-plus plugin
 * tree is deleted. The template content this validator exercises (the Multi-Model
 * Conditional Overlay section) was folded byte-for-byte into
 * plugins/synthex/templates/review.md in Task 48 and is still composed
 * verbatim into pool-reviewer spawn prompts, so the overlay assertions
 * below still apply — only the source path changed.
 *
 * Test surface: composed spawn-prompt blob strings written when spawning
 * Lead and native reviewers with multi_model=true. Per D22: these tests do
 * NOT invoke live teammates. They assert raw-string presence/absence of
 * overlay text in the spawn-prompt blob the command composes from
 * plugins/synthex/templates/review.md.
 *
 * Per D22 composition note (verbatim from review.md):
 *   "Commands compose teammate spawn prompts by reading this file and including
 *    the relevant overlay sections verbatim (raw inclusion) when their flags
 *    resolve true."
 *
 * Four test groups:
 *   1. Composed Lead spawn-prompt blob — FR-MMT4 suppression verbatim
 *   2. Composed reviewer spawn-prompt blob — FR-MMT20 envelope clause verbatim
 *   3. Consolidated report output shape (multi-model branch) — ## Code Review Report
 *   4. multi-model disabled — overlay absence regression (FR-MMT3 criterion 8)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ── Review template path ─────────────────────────────────────────────────────

export const REVIEW_MD_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex', 'templates', 'review.md'
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

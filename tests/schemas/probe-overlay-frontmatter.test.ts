/**
 * Layer 1: Structural tests for tests/compat/lib/probe-overlay.mjs's
 * frontmatter split (Phase 1, Milestone 1.1, Task 4b; FR-HM14, NFR-HM5).
 *
 * `createProbeOverlay` injects a `SYNTHEX_COMPAT_ACTIVATION_PROBE` marker
 * right after a canonical file's YAML frontmatter closes, so the probe
 * never corrupts the frontmatter itself. Before this task the split point
 * was found with `contents.indexOf('\n---\n', 4)` -- a literal, zero-width
 * substring search. That already tolerates properly *indented*
 * block-scalar content (an indented `---` line never forms the exact
 * substring `\n---\n`), but it is not robust to CRLF line endings or a
 * closing fence with no trailing newline, and it duplicates logic that
 * should be expressed once as "the real closing frontmatter delimiter: a
 * line that is exactly `---` after the opening one." `findFrontmatterEnd`
 * replaces it with an explicit line-by-line scan.
 *
 * `createProbeOverlay` (the existing public API, exercised end-to-end in
 * cross-harness-compat.test.ts) is unchanged in shape; this file tests the
 * newly-exported `findFrontmatterEnd` helper directly, per Task 4's note
 * to export helpers rather than duplicate frontmatter-parsing regexes in
 * tests.
 *
 * Plan: docs/plans/harness-modernization.md, Phase 1 / Milestone 1.1 / Task 4b.
 */

import { describe, it, expect } from 'vitest';
import { findFrontmatterEnd } from '../compat/lib/probe-overlay.mjs';

describe('probe-overlay.mjs frontmatter split', () => {
  it('finds the close of ordinary frontmatter', () => {
    const source = '---\nmodel: sonnet\n---\n\n# Tech Lead\n\nBody.\n';
    const end = findFrontmatterEnd(source);

    expect(end).toBeGreaterThan(0);
    expect(source.slice(end)).toBe('\n# Tech Lead\n\nBody.\n');
  });

  it('returns -1 when the file has no frontmatter', () => {
    expect(findFrontmatterEnd('# Title\n\nBody.\n')).toBe(-1);
  });

  it('returns -1 when the frontmatter never closes', () => {
    expect(findFrontmatterEnd('---\nname: fixture\nstill open\n')).toBe(-1);
  });

  it(
    'skips a `# ` line and an indented `---` line inside a block-scalar ' +
      '`description:` value, landing after the real closing fence',
    () => {
      const source = `---
name: fixture-probe-guard
description: |
  Intro sentence for the fixture agent.

  ---

  More description text after an indented horizontal rule.
---

# The Real Title

Body paragraph for the fixture agent.
`;

      const end = findFrontmatterEnd(source);

      expect(end).toBeGreaterThan(0);
      expect(source.slice(end)).toBe('\n# The Real Title\n\nBody paragraph for the fixture agent.\n');

      // Confirm the pre-fix substring search would have landed at the same
      // point for this (realistically indented) fixture -- the hardening
      // here is making the "real closing delimiter" rule explicit and
      // CRLF/EOF-safe, not merely accidental.
      const oldSubstringSearch = source.indexOf('\n---\n', 4) + '\n---\n'.length;
      expect(oldSubstringSearch).toBe(end);
    },
  );

  it('tolerates CRLF line endings around the closing fence', () => {
    const source = '---\r\nmodel: sonnet\r\n---\r\n\r\n# Title\r\n';
    const end = findFrontmatterEnd(source);

    expect(end).toBeGreaterThan(0);
    expect(source.slice(end)).toBe('\r\n# Title\r\n');
  });

  it('handles a closing fence with no trailing newline (EOF)', () => {
    const source = '---\nname: fixture\n---';
    expect(findFrontmatterEnd(source)).toBe(source.length);
  });
});

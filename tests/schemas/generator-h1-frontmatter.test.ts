/**
 * Layer 1: Structural tests for generate-codex-skills.mjs H1 detection
 * (Phase 1, Milestone 1.1, Task 4a; FR-HM14, NFR-HM5).
 *
 * The generator picks a wrapper's title from the canonical command/agent
 * file's first Markdown H1. Before this task it did so with a multiline
 * regex (`/^#\s+(.+)$/m`) applied to the *whole file*, including any
 * frontmatter. Once Task 28 adds `description:` fields, a multi-line
 * YAML block-scalar description could contain a line starting with `#`
 * (a stray heading-like line, or a plain top-level YAML comment) that the
 * whole-file regex would wrongly pick as the title. The fix confines the
 * H1 search to the body: strip a well-formed frontmatter block first
 * (delimited by the opening `---` and the first subsequent line that is
 * *exactly* `---`), then search only what follows.
 *
 * `extractTitle`/`stripFrontmatter` are exported directly from the
 * generator script (an ESM module) so this test exercises the real
 * implementation rather than a duplicated regex. Importing the module for
 * these exports must not write or check any wrapper files as a side
 * effect -- `generate-codex-skills.mjs` only runs its `main()` when
 * executed directly, which `generator-runs-check-unmodified.test.ts`-style
 * coverage already lives in codex-plugin.test.ts / grok-plugin.test.ts via
 * `execFileSync`.
 *
 * Plan: docs/plans/harness-modernization.md, Phase 1 / Milestone 1.1 / Task 4a.
 */

import { describe, it, expect } from 'vitest';
import {
  extractTitle,
  stripFrontmatter,
} from '../../plugins/synthex/scripts/generate-codex-skills.mjs';

describe('generate-codex-skills.mjs H1 detection', () => {
  it('extracts the H1 from a file with ordinary frontmatter', () => {
    const source = `---
model: sonnet
---

# Tech Lead

Body text.
`;

    expect(extractTitle(source)).toBe('Tech Lead');
  });

  it('extracts the H1 from a file with no frontmatter at all', () => {
    const source = `# Bare Title

Body text.
`;

    expect(extractTitle(source)).toBe('Bare Title');
  });

  it(
    'ignores a `# ` line and a bare `---` line inside a block-scalar ' +
      '`description:` value, and still finds the real title',
    () => {
      // The description block scalar's own indentation is established by
      // its first content line ("  Intro sentence..."), then deliberately
      // dropped to column 0 for the trap lines below -- simulating a
      // hand-edited or pasted-in description that lost its indentation.
      // Both trap lines sit *before* the real closing fence, so a
      // whole-file H1 regex (the pre-fix behavior) matches the trap line
      // instead of "The Real Title".
      const source = `---
name: fixture-h1-guard
description: |
  Intro sentence for the fixture agent.
# Not a real markdown heading -- stray text inside the description value
---
  More description text that would follow a false closing fence.
---

# The Real Title

Body paragraph for the fixture agent.
`;

      expect(extractTitle(source)).toBe('The Real Title');

      // Confirm this fixture actually exercises the pre-fix bug: the old
      // whole-file regex would have matched the trap line, not the title.
      const oldWholeFileRegex = /^#\s+(.+)$/m;
      expect(source.match(oldWholeFileRegex)?.[1]?.trim()).toBe(
        'Not a real markdown heading -- stray text inside the description value',
      );
    },
  );

  it('strips frontmatter down to the body only', () => {
    const source = `---
name: fixture
---

# Title

Body.
`;

    expect(stripFrontmatter(source)).toBe('\n# Title\n\nBody.\n');
  });

  it('returns the source unchanged when there is no closing fence', () => {
    const source = `---
name: fixture
no closing fence here
`;

    expect(stripFrontmatter(source)).toBe(source);
  });

  it('returns the source unchanged when the file does not open with a fence', () => {
    const source = '# Title\n\nBody.\n';

    expect(stripFrontmatter(source)).toBe(source);
  });
});

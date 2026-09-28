/**
 * Layer 1: Schema validation for Task 47 (FR-HM24, D20) —
 * `.github/workflows/agent-tests.yml` must run on `harness/**` branches, not
 * just `main`.
 *
 * D20: Phase 6 = PR 1 (Tasks 47-54) ships on a long-lived `harness/one-plugin`
 * branch with its own CI before that branch's PR-1 release, so both
 * `pull_request` and `push` triggers need to include `harness/**` alongside
 * `main`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as yaml from 'js-yaml';

const repoRoot = resolve(import.meta.dirname, '../..');
const WORKFLOW_PATH = join(repoRoot, '.github', 'workflows', 'agent-tests.yml');

const content = readFileSync(WORKFLOW_PATH, 'utf8');
const parsed = yaml.load(content) as any;

describe("Task 47 (FR-HM24, D20): agent-tests.yml triggers on harness/**", () => {
  it('parses as valid YAML with an "on" trigger block', () => {
    expect(parsed).toBeTruthy();
    // YAML parses the bare key `on:` as the boolean `true` unless quoted;
    // js-yaml (like most parsers) does this, so the trigger block is keyed
    // by the boolean `true`, not the string "on".
    const triggers = parsed.on ?? parsed[true as unknown as string];
    expect(triggers).toBeTruthy();
  });

  it('pull_request.branches includes both "main" and "harness/**"', () => {
    const triggers = parsed.on ?? parsed[true as unknown as string];
    expect(triggers.pull_request).toBeTruthy();
    expect(triggers.pull_request.branches).toContain('main');
    expect(triggers.pull_request.branches).toContain('harness/**');
  });

  it('push.branches includes both "main" and "harness/**"', () => {
    const triggers = parsed.on ?? parsed[true as unknown as string];
    expect(triggers.push).toBeTruthy();
    expect(triggers.push.branches).toContain('main');
    expect(triggers.push.branches).toContain('harness/**');
  });

  it('the raw file contains the harness/** glob verbatim (quoted, since ** is not valid unquoted YAML)', () => {
    expect(content).toContain("'harness/**'");
  });

  it('workflow_dispatch is still present (manual Layer 2/3 trigger unaffected)', () => {
    const triggers = parsed.on ?? parsed[true as unknown as string];
    expect(triggers.workflow_dispatch).toBeTruthy();
  });
});

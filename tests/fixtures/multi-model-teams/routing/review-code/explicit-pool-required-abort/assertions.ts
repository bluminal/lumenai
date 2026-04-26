/**
 * Assertion helpers for scenario (e): explicit-pool-required-abort.
 *
 * No matching pool; routing_mode is explicit-pool-required.
 * Expected: command aborts with verbatim FR-MMT17 error; routing_decision is
 * "skipped-routing-mode-explicit"; no fallback occurs.
 */

import fixtureData from './fixture.json' assert { type: 'json' };

export interface ExplicitPoolRequiredAbortFixture {
  scenario: string;
  description: string;
  setup: {
    index_json: { pools: unknown[] };
    config: Record<string, unknown>;
    command_args: Record<string, unknown>;
  };
  expected: {
    routing_decision: string;
    pool_name: string | null;
    multi_model: boolean | null;
    abort: boolean;
    error_shown: boolean;
    error_message: string;
    error_contains: string[];
  };
}

export const fixture = fixtureData as ExplicitPoolRequiredAbortFixture;

/** Asserts routing_decision is "skipped-routing-mode-explicit". */
export function assertSkippedRoutingModeExplicit(): string | null {
  const decision = fixture.expected.routing_decision;
  if (decision !== 'skipped-routing-mode-explicit') {
    return `Expected routing_decision "skipped-routing-mode-explicit", got "${decision}"`;
  }
  return null;
}

/** Asserts abort is true — command does not proceed. */
export function assertAbortIsTrue(): string | null {
  const abort = fixture.expected.abort;
  if (abort !== true) {
    return `Expected abort true, got ${JSON.stringify(abort)}`;
  }
  return null;
}

/** Asserts error_shown is true. */
export function assertErrorShown(): string | null {
  const shown = fixture.expected.error_shown;
  if (shown !== true) {
    return `Expected error_shown true, got ${JSON.stringify(shown)}`;
  }
  return null;
}

/** Asserts all verbatim FR-MMT17 error fragments are present in error_message. */
export function assertVerbatimErrorFragments(): string | null {
  const message = fixture.expected.error_message;
  const fragments = fixture.expected.error_contains;
  for (const fragment of fragments) {
    if (!message.includes(fragment)) {
      return `error_message missing verbatim fragment: "${fragment}"`;
    }
  }
  return null;
}

/** Asserts the first line of error_message matches FR-MMT17 verbatim. */
export function assertFirstLineVerbatim(): string | null {
  const message = fixture.expected.error_message;
  const expectedFirstLine =
    'No standing pool matches the required reviewers (code-reviewer, security-reviewer).';
  if (!message.startsWith(expectedFirstLine)) {
    return (
      `error_message does not start with FR-MMT17 first line.\n` +
      `Expected: "${expectedFirstLine}"\n` +
      `Got first line: "${message.split('\n')[0]}"`
    );
  }
  return null;
}

/** Asserts start-review-team remediation hint is present. */
export function assertStartReviewTeamHintPresent(): string | null {
  const message = fixture.expected.error_message;
  const hint = '/synthex-plus:start-review-team --reviewers code-reviewer,security-reviewer';
  if (!message.includes(hint)) {
    return `error_message missing start-review-team remediation hint: "${hint}"`;
  }
  return null;
}

/** Asserts config change remediation hint is present. */
export function assertConfigChangeHintPresent(): string | null {
  const message = fixture.expected.error_message;
  const hint = "Change routing_mode to 'prefer-with-fallback' in .synthex-plus/config.yaml";
  if (!message.includes(hint)) {
    return `error_message missing config change remediation hint: "${hint}"`;
  }
  return null;
}

/**
 * Task 48: Layer 2 fixture tests for init multi-model review paths.
 *
 * Validates 3 fixture scenarios for the init command's step 4
 * "Configure Multi-Model Review (optional)":
 *
 *   (a) enabled-with-detected — mixed scan; user picks option 1
 *       - Config writes enabled: true + authenticated CLIs only
 *       - Unauthenticated CLI (gemini) excluded from reviewers list (D22)
 *       - Remediation hints surface gemini separately
 *       - docs/reviews/ created
 *
 *   (b) enabled-later-with-snippet — user picks option 2
 *       - No config writes
 *       - Snippet starts with multi_model_review: as top-level key
 *       - Snippet is syntactically valid YAML
 *       - All detected CLIs (incl. unauthenticated) appear as commented-out reviewers
 *       - No docs/reviews/ created
 *
 *   (c) skip — user picks option 3
 *       - No config writes
 *       - No multi_model_review section
 *       - No docs/reviews/ created
 *
 * Cost: $0 (no LLM calls — pure fixture validation)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

// ── Paths ────────────────────────────────────────────────────────────────────

const FIXTURES_BASE = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'multi-model-review',
  'init'
);

// ── Types ────────────────────────────────────────────────────────────────────

interface RemediationHint {
  cli: string;
  remediation_hint: string;
}

interface DetectionResults {
  detected_and_authenticated: string[];
  detected_but_unauthenticated: RemediationHint[];
  not_detected: string[];
}

interface EnabledWithDetectedFixture {
  scenario: string;
  description: string;
  detection_results: DetectionResults;
  user_choice: 1;
  expected_config_writes: {
    'multi_model_review.enabled': boolean;
    'multi_model_review.reviewers': string[];
  };
  expected_option_label_includes: string[];
  expected_option_label_excludes: string[];
  expected_remediation_hints_section_includes: string[];
  expected_docs_reviews_created: true;
}

interface EnabledLaterFixture {
  scenario: string;
  description: string;
  detection_results: DetectionResults;
  user_choice: 2;
  expected_config_writes: Record<string, never>;
  expected_yaml_snippet_starts_with: string;
  expected_yaml_snippet_includes_commented_reviewers: string[];
  expected_yaml_snippet_yaml_valid: true;
  expected_docs_reviews_created: false;
}

interface SkipFixture {
  scenario: string;
  description: string;
  detection_results: DetectionResults;
  user_choice: 3;
  expected_config_writes: Record<string, never>;
  expected_no_multi_model_section: true;
  expected_docs_reviews_created: false;
}

// ── Loaders ──────────────────────────────────────────────────────────────────

function loadFixture<T>(scenario: string): T {
  const path = join(FIXTURES_BASE, scenario, 'fixture.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function fixtureExists(scenario: string): boolean {
  return existsSync(join(FIXTURES_BASE, scenario, 'fixture.json'));
}

function scenarioMdExists(scenario: string): boolean {
  return existsSync(join(FIXTURES_BASE, scenario, 'scenario.md'));
}

function loadSnippet(scenario: string): string {
  const path = join(FIXTURES_BASE, scenario, 'expected-snippet.yaml');
  return readFileSync(path, 'utf-8');
}

// ── (a) enabled-with-detected ────────────────────────────────────────────────

describe('init fixture (a): enabled-with-detected', () => {
  const SCENARIO = 'enabled-with-detected';

  it('fixture.json exists', () => {
    expect(fixtureExists(SCENARIO)).toBe(true);
  });

  it('scenario.md exists', () => {
    expect(scenarioMdExists(SCENARIO)).toBe(true);
  });

  it('scenario field is "enabled-with-detected-mixed"', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    expect(fixture.scenario).toBe('enabled-with-detected-mixed');
  });

  it('user_choice is 1 (Enable with detected CLIs)', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    expect(fixture.user_choice).toBe(1);
  });

  it('detection_results has two authenticated CLIs: codex and ollama', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    expect(fixture.detection_results.detected_and_authenticated).toContain('codex');
    expect(fixture.detection_results.detected_and_authenticated).toContain('ollama');
    expect(fixture.detection_results.detected_and_authenticated).toHaveLength(2);
  });

  it('detection_results has one unauthenticated CLI: gemini', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    const unauthenticated = fixture.detection_results.detected_but_unauthenticated;
    expect(unauthenticated).toHaveLength(1);
    expect(unauthenticated[0].cli).toBe('gemini');
  });

  it('gemini remediation hint mentions gcloud auth login', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    const geminiHint = fixture.detection_results.detected_but_unauthenticated.find(
      (u) => u.cli === 'gemini'
    );
    expect(geminiHint).toBeDefined();
    expect(geminiHint!.remediation_hint).toContain('gcloud auth login');
  });

  it('expected_config_writes sets multi_model_review.enabled to true', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    expect(fixture.expected_config_writes['multi_model_review.enabled']).toBe(true);
  });

  it('expected_config_writes.reviewers contains only authenticated CLI prompters', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    const reviewers = fixture.expected_config_writes['multi_model_review.reviewers'];
    expect(reviewers).toContain('codex-review-prompter');
    expect(reviewers).toContain('ollama-review-prompter');
    // gemini must be excluded — unauthenticated (D22)
    expect(reviewers).not.toContain('gemini-review-prompter');
  });

  it('expected_config_writes.reviewers has exactly 2 entries (authenticated CLIs only)', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    const reviewers = fixture.expected_config_writes['multi_model_review.reviewers'];
    expect(reviewers).toHaveLength(2);
  });

  it('expected_option_label_includes contains codex and ollama', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    expect(fixture.expected_option_label_includes).toContain('codex');
    expect(fixture.expected_option_label_includes).toContain('ollama');
  });

  it('expected_option_label_excludes contains gemini', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    expect(fixture.expected_option_label_excludes).toContain('gemini');
  });

  it('expected_option_label_includes and expected_option_label_excludes are mutually exclusive', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    const includes = new Set(fixture.expected_option_label_includes);
    const excludes = new Set(fixture.expected_option_label_excludes);
    for (const cli of includes) {
      expect(excludes.has(cli)).toBe(false);
    }
  });

  it('expected_remediation_hints_section_includes contains "gemini"', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    expect(fixture.expected_remediation_hints_section_includes).toContain('gemini');
  });

  it('expected_remediation_hints_section_includes contains "gcloud auth login"', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    expect(fixture.expected_remediation_hints_section_includes).toContain('gcloud auth login');
  });

  it('expected_docs_reviews_created is true', () => {
    const fixture = loadFixture<EnabledWithDetectedFixture>(SCENARIO);
    expect(fixture.expected_docs_reviews_created).toBe(true);
  });
});

// ── (b) enabled-later-with-snippet ───────────────────────────────────────────

describe('init fixture (b): enabled-later-with-snippet', () => {
  const SCENARIO = 'enabled-later-with-snippet';

  it('fixture.json exists', () => {
    expect(fixtureExists(SCENARIO)).toBe(true);
  });

  it('scenario.md exists', () => {
    expect(scenarioMdExists(SCENARIO)).toBe(true);
  });

  it('expected-snippet.yaml exists', () => {
    expect(existsSync(join(FIXTURES_BASE, SCENARIO, 'expected-snippet.yaml'))).toBe(true);
  });

  it('scenario field is "enabled-later-with-snippet"', () => {
    const fixture = loadFixture<EnabledLaterFixture>(SCENARIO);
    expect(fixture.scenario).toBe('enabled-later-with-snippet');
  });

  it('user_choice is 2 (Enable later)', () => {
    const fixture = loadFixture<EnabledLaterFixture>(SCENARIO);
    expect(fixture.user_choice).toBe(2);
  });

  it('expected_config_writes is empty (no config written for option 2)', () => {
    const fixture = loadFixture<EnabledLaterFixture>(SCENARIO);
    expect(fixture.expected_config_writes).toEqual({});
  });

  it('expected_yaml_snippet_starts_with is "multi_model_review:"', () => {
    const fixture = loadFixture<EnabledLaterFixture>(SCENARIO);
    expect(fixture.expected_yaml_snippet_starts_with).toBe('multi_model_review:');
  });

  it('expected-snippet.yaml content starts with "# multi_model_review:" as top-level key', () => {
    const snippet = loadSnippet(SCENARIO);
    expect(snippet.trimStart()).toMatch(/^#\s*multi_model_review:/);
  });

  it('expected-snippet.yaml is syntactically valid YAML (parses without throwing)', () => {
    const snippet = loadSnippet(SCENARIO);
    let parseError: unknown = null;
    try {
      parseYaml(snippet);
    } catch (err) {
      parseError = err;
    }
    expect(parseError).toBeNull();
  });

  it('expected_yaml_snippet_yaml_valid is true', () => {
    const fixture = loadFixture<EnabledLaterFixture>(SCENARIO);
    expect(fixture.expected_yaml_snippet_yaml_valid).toBe(true);
  });

  it('expected_yaml_snippet_includes_commented_reviewers contains codex-review-prompter', () => {
    const fixture = loadFixture<EnabledLaterFixture>(SCENARIO);
    expect(fixture.expected_yaml_snippet_includes_commented_reviewers).toContain(
      'codex-review-prompter'
    );
  });

  it('expected_yaml_snippet_includes_commented_reviewers contains gemini-review-prompter', () => {
    const fixture = loadFixture<EnabledLaterFixture>(SCENARIO);
    expect(fixture.expected_yaml_snippet_includes_commented_reviewers).toContain(
      'gemini-review-prompter'
    );
  });

  it('expected_yaml_snippet_includes_commented_reviewers contains ollama-review-prompter', () => {
    const fixture = loadFixture<EnabledLaterFixture>(SCENARIO);
    expect(fixture.expected_yaml_snippet_includes_commented_reviewers).toContain(
      'ollama-review-prompter'
    );
  });

  it('expected-snippet.yaml contains commented codex-review-prompter line', () => {
    const snippet = loadSnippet(SCENARIO);
    // Each reviewer must appear on a commented-out line (# prefix at some indent)
    expect(snippet).toMatch(/^#.*codex-review-prompter/m);
  });

  it('expected-snippet.yaml contains commented gemini-review-prompter line', () => {
    const snippet = loadSnippet(SCENARIO);
    expect(snippet).toMatch(/^#.*gemini-review-prompter/m);
  });

  it('expected-snippet.yaml contains commented ollama-review-prompter line', () => {
    const snippet = loadSnippet(SCENARIO);
    expect(snippet).toMatch(/^#.*ollama-review-prompter/m);
  });

  it('every non-empty line in expected-snippet.yaml starts with # (fully commented out)', () => {
    const snippet = loadSnippet(SCENARIO);
    const nonEmptyLines = snippet.split('\n').filter((line) => line.trim().length > 0);
    for (const line of nonEmptyLines) {
      expect(line.trimStart()).toMatch(/^#/);
    }
  });

  it('expected_docs_reviews_created is false', () => {
    const fixture = loadFixture<EnabledLaterFixture>(SCENARIO);
    expect(fixture.expected_docs_reviews_created).toBe(false);
  });
});

// ── (c) skip ─────────────────────────────────────────────────────────────────

describe('init fixture (c): skip', () => {
  const SCENARIO = 'skip';

  it('fixture.json exists', () => {
    expect(fixtureExists(SCENARIO)).toBe(true);
  });

  it('scenario.md exists', () => {
    expect(scenarioMdExists(SCENARIO)).toBe(true);
  });

  it('scenario field is "skip"', () => {
    const fixture = loadFixture<SkipFixture>(SCENARIO);
    expect(fixture.scenario).toBe('skip');
  });

  it('user_choice is 3 (Skip)', () => {
    const fixture = loadFixture<SkipFixture>(SCENARIO);
    expect(fixture.user_choice).toBe(3);
  });

  it('expected_config_writes is empty (no config written for skip)', () => {
    const fixture = loadFixture<SkipFixture>(SCENARIO);
    expect(fixture.expected_config_writes).toEqual({});
  });

  it('expected_no_multi_model_section is true', () => {
    const fixture = loadFixture<SkipFixture>(SCENARIO);
    expect(fixture.expected_no_multi_model_section).toBe(true);
  });

  it('expected_docs_reviews_created is false', () => {
    const fixture = loadFixture<SkipFixture>(SCENARIO);
    expect(fixture.expected_docs_reviews_created).toBe(false);
  });

  it('fixture has detection_results (scan runs regardless of user choice)', () => {
    const fixture = loadFixture<SkipFixture>(SCENARIO);
    expect(fixture.detection_results).toBeDefined();
    expect(fixture.detection_results.detected_and_authenticated).toBeDefined();
    expect(fixture.detection_results.detected_but_unauthenticated).toBeDefined();
    expect(fixture.detection_results.not_detected).toBeDefined();
  });
});

// ── Cross-fixture invariants ──────────────────────────────────────────────────

describe('init fixtures — cross-fixture invariants', () => {
  const SCENARIOS = [
    'enabled-with-detected',
    'enabled-later-with-snippet',
    'skip',
  ] as const;

  for (const scenario of SCENARIOS) {
    it(`${scenario}: fixture.json has required top-level fields`, () => {
      const fixture = loadFixture<Record<string, unknown>>(scenario);
      expect(fixture).toHaveProperty('scenario');
      expect(fixture).toHaveProperty('description');
      expect(fixture).toHaveProperty('user_choice');
      expect(fixture).toHaveProperty('expected_config_writes');
      expect(fixture).toHaveProperty('expected_docs_reviews_created');
    });

    it(`${scenario}: user_choice is 1, 2, or 3`, () => {
      const fixture = loadFixture<{ user_choice: number }>(scenario);
      expect([1, 2, 3]).toContain(fixture.user_choice);
    });

    it(`${scenario}: description is a non-empty string`, () => {
      const fixture = loadFixture<{ description: string }>(scenario);
      expect(typeof fixture.description).toBe('string');
      expect(fixture.description.length).toBeGreaterThan(0);
    });
  }

  it('only option 1 (enabled-with-detected) sets expected_docs_reviews_created: true', () => {
    const fixtures = SCENARIOS.map((s) =>
      loadFixture<{ user_choice: number; expected_docs_reviews_created: boolean }>(s)
    );
    const docsCreatedForChoices = fixtures
      .filter((f) => f.expected_docs_reviews_created)
      .map((f) => f.user_choice);
    expect(docsCreatedForChoices).toEqual([1]);
  });

  it('options 2 and 3 both have empty expected_config_writes', () => {
    const laterFixture = loadFixture<{ expected_config_writes: Record<string, unknown> }>(
      'enabled-later-with-snippet'
    );
    const skipFixture = loadFixture<{ expected_config_writes: Record<string, unknown> }>('skip');
    expect(laterFixture.expected_config_writes).toEqual({});
    expect(skipFixture.expected_config_writes).toEqual({});
  });
});

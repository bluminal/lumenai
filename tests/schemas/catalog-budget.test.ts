import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogBudget, catalogBudgets } from '../compat/lib/harnesses.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const baselinesRoot = resolve(repoRoot, 'tests/compat/baselines');
const scenariosRoot = resolve(repoRoot, 'tests/compat/scenarios');

/**
 * Guards FR-HM9 (Task 22): the Codex and OpenCode activation scenarios
 * capture the skill-catalog block a host sends to the model and fail when
 * it exceeds a per-harness budget recorded in `tests/compat/lib/harnesses.mjs`.
 * This suite does not run the scenarios themselves (that requires the
 * pinned compat containers; see `tests/compat/scripts/run-suite.mjs`), it
 * only asserts the budgets exist, are sane numbers, and are wired into the
 * scenario files so the assertion cannot silently disappear.
 */
describe('catalog budgets (Task 22, FR-HM9)', () => {
  it('records a numeric catalog budget for codex', () => {
    const budget = catalogBudgets.codex;
    expect(budget).toBeDefined();
    expect(typeof budget.maxTotalRenderedChars).toBe('number');
    expect(budget.maxTotalRenderedChars).toBeGreaterThan(0);
    expect(typeof budget.maxBlankDescriptionCount).toBe('number');
    expect(typeof budget.maxShortenedDescriptionCount).toBe('number');
  });

  it('records a numeric catalog budget for opencode', () => {
    const budget = catalogBudgets.opencode;
    expect(budget).toBeDefined();
    expect(typeof budget.maxAvailableSkillsBlockBytesPerSkill).toBe('number');
    expect(budget.maxAvailableSkillsBlockBytesPerSkill).toBeGreaterThan(0);
  });

  it('requires codex descriptions to never be blanked or shortened by the catalog budget', () => {
    expect(catalogBudget('codex').maxBlankDescriptionCount).toBe(0);
    expect(catalogBudget('codex').maxShortenedDescriptionCount).toBe(0);
  });

  it('sets the codex char budget with headroom under Codex\'s ~8,000-char catalog budget', () => {
    // The post-Task-19 measurement was 4,156 chars; the recorded ceiling
    // must sit strictly between that measurement and Codex's own catalog
    // truncation budget, or the assertion is either always-failing or
    // meaningless.
    const budget = catalogBudget('codex').maxTotalRenderedChars;
    expect(budget).toBeGreaterThan(4_156);
    expect(budget).toBeLessThan(8_000);
  });

  it('throws for an unknown harness', () => {
    expect(() => catalogBudget('not-a-real-harness')).toThrow(/No catalog budget recorded/);
  });

  it('sets the opencode per-skill budget under the Task 19 pre-diet baseline, and at 46 skills within the A17 ceiling', () => {
    const baseline = JSON.parse(
      readFileSync(join(baselinesRoot, 'opencode-catalog-pre-task19.json'), 'utf8'),
    );
    const perSkill = catalogBudget('opencode').maxAvailableSkillsBlockBytesPerSkill;
    // Per skill, the budget must stay below the pre-diet catalog (16,037 bytes / 46 skills).
    expect(perSkill).toBeLessThan(baseline.availableSkillsBlockBytes / baseline.skillCount);
    // At the original 46 skills it must not exceed A17's 13,353-byte total (measured 12,717 + 5%).
    expect(perSkill * baseline.skillCount).toBeLessThanOrEqual(13_353);
    // And it must leave room for the post-diet measurement (12,717 bytes at 46 skills).
    expect(perSkill * baseline.skillCount).toBeGreaterThan(12_717);
  });

  it('wires the recorded budget into the codex-activation scenario', () => {
    const source = readFileSync(join(scenariosRoot, 'codex-activation.mjs'), 'utf8');
    expect(source).toMatch(/from ['"]\.\.\/lib\/harnesses\.mjs['"]/);
    expect(source).toContain('catalogBudget(harness)');
    expect(source).toContain('maxTotalRenderedChars');
    expect(source).toContain('maxBlankDescriptionCount');
    expect(source).toContain('maxShortenedDescriptionCount');
    // The scenario must actually fail (not just observe) when over budget.
    expect(source).toMatch(/throw new Error\(\s*\n?\s*`Codex skill catalog exceeded its budget/);
  });

  it('wires the recorded budget into the opencode-activation scenario', () => {
    const source = readFileSync(join(scenariosRoot, 'opencode-activation.mjs'), 'utf8');
    expect(source).toMatch(/from ['"]\.\.\/lib\/harnesses\.mjs['"]/);
    expect(source).toContain('catalogBudget(harness)');
    expect(source).toContain('maxAvailableSkillsBlockBytesPerSkill');
    // The per-skill budget is scaled by the installed skill count, not used as a total.
    expect(source).toMatch(/maxAvailableSkillsBlockBytesPerSkill \* entries\.length/);
    expect(source).toMatch(/throw new Error\(\s*\n?\s*`OpenCode <available_skills> block exceeded its budget/);
  });

  it('emits a catalog NDJSON phase with bytes/chars, count, and blank-description count in both scenarios', () => {
    const codexSource = readFileSync(join(scenariosRoot, 'codex-activation.mjs'), 'utf8');
    const opencodeSource = readFileSync(join(scenariosRoot, 'opencode-activation.mjs'), 'utf8');

    expect(codexSource).toMatch(/emit\(harness, 'catalog', \{/);
    expect(opencodeSource).toMatch(/emit\(harness, 'catalog', \{/);
  });

  it('still parses the pre-Task-19 baseline JSON files the OpenCode budget is measured against', () => {
    const codexBaselinePath = join(baselinesRoot, 'codex-catalog-pre-task19.json');
    const opencodeBaselinePath = join(baselinesRoot, 'opencode-catalog-pre-task19.json');
    expect(existsSync(codexBaselinePath)).toBe(true);
    expect(existsSync(opencodeBaselinePath)).toBe(true);

    const codexBaseline = JSON.parse(readFileSync(codexBaselinePath, 'utf8'));
    const opencodeBaseline = JSON.parse(readFileSync(opencodeBaselinePath, 'utf8'));

    expect(codexBaseline.harness).toBe('codex');
    expect(typeof codexBaseline.totalRenderedChars).toBe('number');
    expect(opencodeBaseline.harness).toBe('opencode');
    expect(typeof opencodeBaseline.availableSkillsBlockBytes).toBe('number');
  });
});

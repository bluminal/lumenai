/**
 * Task 43 (FR-HM28): D17 aggregator tier table single-sourced in
 * `defaults.yaml`.
 *
 * Before this task, `multi-model-review-orchestrator.md` carried the D17
 * strict-total-order tier table (Claude Opus > GPT-5 > Claude Sonnet >
 * Gemini 2.5 Pro > DeepSeek V3 > Qwen 32B) only as inline prose. This test
 * pins that the table now lives as structured, family-keyed rows under
 * `multi_model_review.aggregator.tier_table` in
 * `plugins/synthex/config/defaults.yaml`, and that the orchestrator reads
 * it from config (Step 2 / 0e) rather than re-declaring the full
 * tier/family/model table inline — it may still document the resulting
 * strict order as a one-line human-readable summary for readability.
 */

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadDefaultsYaml, loadDefaultsYamlText } from '../helpers/load-defaults';

const ROOT = join(__dirname, '..', '..');
const ORCHESTRATOR_PATH = join(
  ROOT,
  'plugins',
  'synthex',
  'agents',
  'multi-model-review-orchestrator.md',
);

describe('Task 43 (FR-HM28): D17 tier table single-sourced in defaults.yaml', () => {
  it('multi_model_review.aggregator.tier_table exists and is a non-empty array', async () => {
    const cfg = await loadDefaultsYaml();
    const tierTable = cfg?.multi_model_review?.aggregator?.tier_table;
    expect(Array.isArray(tierTable)).toBe(true);
    expect(tierTable.length).toBeGreaterThan(0);
  });

  it('every row is family-keyed with a tier, family, and model', async () => {
    const cfg = await loadDefaultsYaml();
    const tierTable = cfg.multi_model_review.aggregator.tier_table as Array<{
      tier: number;
      family: string;
      model: string;
    }>;
    for (const row of tierTable) {
      expect(row).toHaveProperty('tier');
      expect(row).toHaveProperty('family');
      expect(row).toHaveProperty('model');
      expect(typeof row.family).toBe('string');
      expect(row.family.length).toBeGreaterThan(0);
    }
  });

  it('rows are in strict ascending tier order (tier: 1 wins) with no duplicate tiers', async () => {
    const cfg = await loadDefaultsYaml();
    const tierTable = cfg.multi_model_review.aggregator.tier_table as Array<{ tier: number }>;
    const tiers = tierTable.map((r) => r.tier);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    expect(new Set(tiers).size).toBe(tiers.length);
  });

  it('covers the documented family set (anthropic, openai, google, and local-* families)', async () => {
    const cfg = await loadDefaultsYaml();
    const tierTable = cfg.multi_model_review.aggregator.tier_table as Array<{ family: string }>;
    const families = tierTable.map((r) => r.family);
    expect(families).toContain('anthropic');
    expect(families).toContain('openai');
    expect(families).toContain('google');
    expect(families.some((f) => f.startsWith('local-'))).toBe(true);
  });

  it('defaults.yaml documents the tier_table with comments (FR-HM28 single-sourcing rationale)', () => {
    const text = loadDefaultsYamlText();
    expect(text).toContain('tier_table');
    expect(text).toMatch(/D17/);
    expect(text).toMatch(/family-keyed/i);
    expect(text).toContain('FR-HM28');
  });

  it('the orchestrator reads tier_table from config instead of hardcoding the chain', () => {
    const content = readFileSync(ORCHESTRATOR_PATH, 'utf8');
    expect(content).toContain('multi_model_review.aggregator.tier_table');
    expect(content).toMatch(/family-keyed/i);
  });

  it('the orchestrator no longer inlines the full tier/family/model table as a markdown table', () => {
    const content = readFileSync(ORCHESTRATOR_PATH, 'utf8');
    // A re-inlined table would render as a markdown pipe-table with a
    // "Tier" (or "tier") header column; the orchestrator should carry at
    // most the short human-readable order string, not a structured table.
    const tableHeaderRow = /^\|.*\btier\b.*\|.*\bfamily\b.*\|/im;
    expect(content).not.toMatch(tableHeaderRow);
  });
});

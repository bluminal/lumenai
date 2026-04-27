import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ORCHESTRATOR = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents', 'multi-model-review-orchestrator.md');

describe('Task 21: preflight subroutine in multi-model-review-orchestrator.md (FR-MR20)', () => {
  let content: string;
  beforeAll(() => { content = readFileSync(ORCHESTRATOR, 'utf8'); });

  // 1. File exists
  it('orchestrator .md file exists', () => {
    expect(existsSync(ORCHESTRATOR)).toBe(true);
  });

  // 2. Step 0 Preflight section present
  it('contains Step 0 — Preflight (FR-MR20) section', () => {
    // Match either heading form from the task spec
    const hasStep0 = content.includes('Step 0 — Preflight') || content.includes('Preflight (FR-MR20)');
    expect(hasStep0).toBe(true);
  });

  // 3. FR-MR20 reference present
  it('contains FR-MR20 reference', () => {
    expect(content).toContain('FR-MR20');
  });

  // 4. Concurrency instruction verbatim
  it('concurrency instruction: all which and auth checks dispatch concurrently in a single parallel Bash batch', () => {
    expect(content).toContain('dispatch concurrently in a single parallel Bash batch');
  });

  // 5. Preflight target: < 2 seconds on 3-adapter config
  it('documents preflight target of < 2 seconds on a 3-adapter config', () => {
    const has2sec = content.includes('< 2 seconds') || content.includes('< 2 sec');
    expect(has2sec).toBe(true);
    expect(content).toContain('3-adapter');
  });

  // 6. Family diversity warning text
  it('contains Family diversity warning text', () => {
    expect(content).toContain('Family diversity warning');
  });

  // 7. Self-preference warning text (fires independently)
  it('contains Self-preference warning text', () => {
    expect(content).toContain('Self-preference warning');
  });

  // 8. min_proposers_to_proceed check with verbatim error text
  it('contains min_proposers_to_proceed check', () => {
    expect(content).toContain('min_proposers_to_proceed');
  });
  it('contains verbatim min_proposers_to_proceed error text', () => {
    expect(content).toContain('Insufficient proposers:');
    expect(content).toContain('config: min_proposers_to_proceed');
    expect(content).toContain('Aborting.');
  });

  // 9. Aggregator resolution check referencing D17 tier table + verbatim error text
  it('contains aggregator resolution check referencing D17 tier table', () => {
    expect(content).toContain('D17 tier table');
    // The sub-step 0e should walk the D17 tier table
    expect(content).toMatch(/0e.*D17|D17.*0e|Step 0e|aggregator resolution check.*D17|D17.*aggregator resolution/si);
  });
  it('contains verbatim aggregator resolution failed error text', () => {
    expect(content).toContain("Aggregator resolution failed: 'auto' could not resolve via D17 tier table and host-fallback unavailable.");
  });

  // 10. FR-MR20 summary regex pattern present
  it('FR-MR20 summary pattern: N reviewers configured, M available, K families, aggregator:', () => {
    expect(content).toContain('N reviewers configured, M available, K families, aggregator:');
  });

  // 11. Auth checks exiting 0 treated as authenticated regardless of stdout/stderr
  it('documents that auth checks exiting 0 are treated as authenticated regardless of stdout/stderr', () => {
    expect(content).toContain('exit 0 are treated as authenticated');
  });

  // 12. D17 tier table is referenced in the preflight section (walk the D17 tier table)
  it('D17 tier table is referenced within the preflight section', () => {
    // The orchestrator already has the full D17 tier table; verify it appears AND is linked from Step 0
    expect(content).toContain('Claude Opus > GPT-5 > Claude Sonnet > Gemini 2.5 Pro > DeepSeek V3 > Qwen 32B');
    // Step 0e specifically says "D17 tier table"
    expect(content).toMatch(/0e[\s\S]{0,300}D17/);
  });

  describe('Source authority: FR-MR20 added to Source Authority section', () => {
    it('Source Authority section lists FR-MR20', () => {
      // Find Source Authority section and check FR-MR20 appears there
      const sourceStart = content.indexOf('## Source Authority');
      expect(sourceStart).toBeGreaterThan(-1);
      const sourceSection = content.slice(sourceStart, sourceStart + 1500);
      expect(sourceSection).toContain('FR-MR20');
    });
  });

  describe('Self-preference and family diversity warnings fire independently', () => {
    it('both warnings documented to be capable of firing on the same invocation', () => {
      expect(content).toMatch(/both can fire on the same invocation/);
    });
    it('self-preference warning fires INDEPENDENTLY', () => {
      expect(content).toMatch(/INDEPENDENTLY/);
    });
  });

  describe('Preflight emits summary regardless of warnings', () => {
    it('summary is emitted regardless of warnings; errors replace the summary', () => {
      expect(content).toContain('emitted regardless of warnings');
    });
  });
});

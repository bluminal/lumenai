import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const FAILURE_MODES_PATH = join(
  __dirname,
  '..',
  '..',
  'docs',
  'specs',
  'multi-model-review',
  'failure-modes.md'
);

describe('Task 51: failure-modes.md', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(FAILURE_MODES_PATH, 'utf8');
  });

  // Test 1: file exists
  it('file exists', () => {
    expect(existsSync(FAILURE_MODES_PATH)).toBe(true);
  });

  // Test 2: ## Status: Final present
  it('"## Status: Final" present', () => {
    expect(content).toContain('## Status: Final');
  });

  // Test 3: All 7 FR-MR16 error_code values documented
  describe('FR-MR16 error_code enum — all 7 values documented', () => {
    it.each([
      'cli_missing',
      'cli_auth_failed',
      'cli_failed',
      'parse_failed',
      'timeout',
      'sandbox_violation',
      'unknown_error',
    ])('error_code value "%s" present', (errorCode) => {
      expect(content).toContain(errorCode);
    });

    it('FR-MR16 source reference present', () => {
      expect(content).toContain('FR-MR16');
    });

    it('no new error_code values permitted rule stated', () => {
      expect(content).toMatch(/MUST NOT introduce new error_code values/i);
    });
  });

  // Test 4: FR-MR17 continuation flow (externals-failed variant) with verbatim warning
  describe('FR-MR17 native-only continuation (externals-failed variant)', () => {
    it('FR-MR17 reference present', () => {
      expect(content).toContain('FR-MR17');
    });

    it('all-externals-failed verbatim warning text present', () => {
      expect(content).toContain(
        'All external reviewers failed; continuing with natives only'
      );
    });

    it('continuation_event.type = "all-externals-failed" documented', () => {
      expect(content).toContain('all-externals-failed');
    });

    it('native-only consolidation continues after externals fail', () => {
      expect(content).toMatch(/native.{0,100}consolidation|consolidation.{0,100}native/is);
    });
  });

  // Test 5: All-natives-failed CRITICAL warning verbatim
  describe('All-natives-failed CRITICAL path (Task 23b)', () => {
    it('all-natives-failed CRITICAL warning text verbatim', () => {
      expect(content).toContain(
        'All native Synthex reviewers failed. Cannot continue — multi-model review has no findings to consolidate. Check sub-agent error logs.'
      );
    });

    it('continuation_event.type = "all-natives-failed" documented', () => {
      expect(content).toContain('all-natives-failed');
    });

    it('CRITICAL stop (no consolidation) documented', () => {
      expect(content).toMatch(/CRITICAL.{0,200}STOP|STOP.{0,200}CRITICAL/is);
    });

    it('all-natives-failed warning is DISTINCT from all-externals-failed warning', () => {
      expect(content).toContain('DISTINCT');
    });
  });

  // Test 6: Cloud-surface remediation documented (NFR-MR2 reference + verbatim message)
  describe('Cloud-surface remediation (NFR-MR2, Task 23c)', () => {
    it('NFR-MR2 reference present', () => {
      expect(content).toContain('NFR-MR2');
    });

    it('cloud-surface remediation verbatim message present', () => {
      expect(content).toContain(
        'Multi-model review cannot run on this surface — no external review CLIs are available. See docs/specs/multi-model-review/adapter-recipes.md for setup, or run on a host with the configured CLIs installed.'
      );
    });

    it('single remediation message (not per-CLI cascade) documented', () => {
      expect(content).toMatch(/SINGLE remediation|single remediation/i);
      expect(content).toMatch(/NOT a per-CLI cascade|not a per-CLI cascade|per-CLI cascade/i);
    });

    it('continuation_event.type = "cloud-surface-no-clis" documented', () => {
      expect(content).toContain('cloud-surface-no-clis');
    });
  });

  // Test 7: Q6 aggregator-failure fallback documented (host-fallback)
  describe('Aggregator-failure fallback (Q6, OQ-6)', () => {
    it('Q6 reference present', () => {
      expect(content).toContain('Q6');
    });

    it('OQ-6 reference present', () => {
      expect(content).toContain('OQ-6');
    });

    it('host-fallback documented as Q6 answer', () => {
      expect(content).toContain('host-fallback');
    });

    it('aggregator runtime failure → host Claude session fallback documented', () => {
      expect(content).toMatch(/host Claude session/i);
    });

    it('aggregator_resolution.source field with host-fallback value documented', () => {
      expect(content).toMatch(/aggregator_resolution/i);
    });
  });

  // Test 8: Strict mode (FR-MR18) documented
  describe('Strict mode (FR-MR18)', () => {
    it('FR-MR18 reference present', () => {
      expect(content).toContain('FR-MR18');
    });

    it('strict_mode: false default documented', () => {
      expect(content).toMatch(/strict_mode.*false|strict.mode.*false/i);
    });

    it('strict_mode: true fail-hard behavior documented', () => {
      expect(content).toMatch(/strict_mode.*true|strict.mode.*true/i);
    });
  });

  // Test 9: Failure-mode decision tree present
  describe('Failure-mode decision tree', () => {
    it('decision tree section present', () => {
      expect(content).toMatch(/decision tree|Decision Tree/i);
    });

    it('tree contains branch characters or decision flow', () => {
      // Accept either box-drawing characters or ASCII tree characters
      const hasBoxDrawing = /[├└│]/.test(content);
      const hasAsciiTree = /[|\\-].*→/.test(content);
      expect(hasBoxDrawing || hasAsciiTree).toBe(true);
    });
  });

  // Test 10: Cross-references to adapter-contract.md, architecture.md, adapter-recipes.md
  describe('Cross-references to related docs', () => {
    it('links to adapter-contract.md', () => {
      expect(content).toContain('adapter-contract.md');
    });

    it('links to architecture.md', () => {
      expect(content).toContain('architecture.md');
    });

    it('links to adapter-recipes.md', () => {
      expect(content).toContain('adapter-recipes.md');
    });
  });

  // Test 11: Source authority references — FR-MR16, FR-MR17, FR-MR18, NFR-MR2, D12, D17, Q6
  describe('Source authority cross-references', () => {
    it.each(['FR-MR16', 'FR-MR17', 'FR-MR18', 'NFR-MR2', 'D12', 'D17', 'Q6'])(
      'references %s',
      (ref) => {
        expect(content).toContain(ref);
      }
    );
  });
});

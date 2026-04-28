import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AGENT_PATH = join(__dirname, '..', '..', 'plugins', 'synthex', 'agents', 'audit-artifact-writer.md');

describe('Task 39: audit-artifact-writer.md', () => {
  let content: string;
  beforeAll(() => {
    content = readFileSync(AGENT_PATH, 'utf8');
  });

  // 1. File exists
  it('file exists', () => expect(existsSync(AGENT_PATH)).toBe(true));

  // 2. Declares Haiku model (frontmatter)
  describe('Frontmatter', () => {
    it('declares Haiku model', () => {
      expect(content).toMatch(/^---[\s\S]*?model:\s*haiku[\s\S]*?---/);
    });
  });

  // 3. Command-agnostic claim (raw-string for "command-agnostic" + "D20")
  describe('Command-agnostic identity (D20)', () => {
    it('contains "command-agnostic" claim', () => {
      expect(content).toContain('command-agnostic');
    });
    it('references D20', () => {
      expect(content).toContain('D20');
    });
    it('command parameter described as the ONLY command-specific input', () => {
      expect(content).toMatch(/command.*ONLY command-specific input/);
    });
  });

  // 4. Documents the 7 required sections
  describe('7 required sections (FR-MR24)', () => {
    it('documents Section 1: Invocation Metadata', () => {
      expect(content).toContain('Invocation Metadata');
    });
    it('documents Section 2: Config Snapshot', () => {
      expect(content).toContain('Config Snapshot');
    });
    it('documents Section 3: Preflight Result', () => {
      expect(content).toContain('Preflight Result');
    });
    it('documents Section 4: Per-Reviewer Results', () => {
      expect(content).toContain('Per-Reviewer Results');
    });
    it('documents Section 5: Consolidated Findings with Attribution', () => {
      expect(content).toContain('Consolidated Findings with Attribution');
    });
    it('documents Section 6: Aggregator Trace', () => {
      expect(content).toContain('Aggregator Trace');
    });
    it('documents Section 7: Continuation Event', () => {
      expect(content).toContain('Continuation Event');
    });
    it('states all 7 sections are present in FR-MR24 behavioral rule', () => {
      expect(content).toMatch(/[Aa]ll 7 sections/);
    });
  });

  // 5. Filename pattern documented: <YYYY-MM-DD>-<command>-<short-hash>.md
  describe('Filename pattern', () => {
    it('documents filename pattern with YYYY-MM-DD, command, short-hash', () => {
      expect(content).toMatch(/<YYYY-MM-DD>-<command>-<short-hash>\.md/);
    });
  });

  // 6. Both command values mentioned in filename examples (review-code AND write-implementation-plan)
  describe('Command values in filename examples', () => {
    it('includes "review-code" in filename examples', () => {
      expect(content).toMatch(/review-code.*\.md/);
    });
    it('includes "write-implementation-plan" in filename examples', () => {
      expect(content).toMatch(/write-implementation-plan.*\.md/);
    });
  });

  // 7. Skip-write rule documented (audit.enabled: false → no write)
  describe('Skip-write rule', () => {
    it('documents skip when audit_config.enabled is false', () => {
      expect(content).toMatch(/enabled.*false/);
    });
    it('no file is written when disabled', () => {
      expect(content).toMatch(/no file.*written|Do NOT write/i);
    });
    it('documents status: "skipped" return value', () => {
      expect(content).toMatch(/"status":\s*"skipped"/);
    });
  });

  // 8. NFR-MR4 usage verbatim documented
  describe('NFR-MR4 usage verbatim', () => {
    it('mentions "usage" object', () => {
      expect(content).toContain('usage');
    });
    it('mentions "verbatim" for usage surfacing', () => {
      expect(content).toContain('verbatim');
    });
    it('documents "not_reported" for null usage', () => {
      expect(content).toContain('not_reported');
    });
  });

  // 9. Native/external split in Section 4 documented
  describe('Native/external split in Per-Reviewer Results (Section 4)', () => {
    it('documents native reviewers sub-section', () => {
      expect(content).toMatch(/[Nn]ative reviewers/);
    });
    it('documents external reviewers sub-section', () => {
      expect(content).toMatch(/[Ee]xternal reviewers/);
    });
    it('uses source_type to distinguish native-team from external', () => {
      expect(content).toContain('source_type: native-team');
      expect(content).toContain('source_type: external');
    });
    it('states native/external split is REQUIRED', () => {
      expect(content).toMatch(/native.*external split is REQUIRED/i);
    });
  });

  // 10. Atomic write (.tmp + rename) documented
  describe('Atomic write behavior', () => {
    it('documents .tmp + rename pattern', () => {
      expect(content).toMatch(/\.tmp.*rename|rename.*\.tmp/);
    });
    it('mentions atomic writes in Behavioral Rules', () => {
      expect(content).toMatch(/[Aa]tomic writes?/);
    });
  });

  // 11. Source Authority cross-references: FR-MR24, D20, NFR-MR4, D21
  describe('Source Authority cross-references', () => {
    it.each(['FR-MR24', 'D20', 'NFR-MR4', 'D21'])('references %s', (ref) => {
      expect(content).toContain(ref);
    });
  });

  // 12. Output contract documents status: "written" and status: "skipped" shapes
  describe('Output contract', () => {
    it('documents status: "written" shape', () => {
      expect(content).toMatch(/"status":\s*"written"/);
    });
    it('documents status: "skipped" shape', () => {
      expect(content).toMatch(/"status":\s*"skipped"/);
    });
    it('written shape includes path, filename, size_bytes, sections_present, continuation_event_included', () => {
      expect(content).toContain('"path"');
      expect(content).toContain('"filename"');
      expect(content).toContain('"size_bytes"');
      expect(content).toContain('"sections_present"');
      expect(content).toContain('"continuation_event_included"');
    });
    it('skipped shape includes reason field', () => {
      expect(content).toContain('"reason"');
    });
  });
});

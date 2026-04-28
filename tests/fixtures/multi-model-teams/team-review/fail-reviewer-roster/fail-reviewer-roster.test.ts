import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixtureDir = join(__dirname);

describe('team-review fail-reviewer-roster fixture', () => {
  const input = JSON.parse(readFileSync(join(fixtureDir, 'input.json'), 'utf-8'));
  const expected = JSON.parse(readFileSync(join(fixtureDir, 'expected-output.json'), 'utf-8'));

  it('fixture has multi_model: true and unsupported reviewer in roster', () => {
    expect(input.multi_model).toBe(true);
    expect(input.roster).toContain('quality-engineer');
  });

  it('expected output aborts before team spawn', () => {
    expect(expected.outcome).toBe('abort');
    expect(expected.team_spawned).toBe(false);
    expect(expected.active_team_file_written).toBe(false);
  });

  it('error message matches FR-MMT20 verbatim', () => {
    expect(expected.error_message).toBe(
      "Multi-model mode is not supported for reviewer 'quality-engineer' in v1. Supported reviewers for multi-model pools: code-reviewer, security-reviewer, design-system-agent, performance-engineer. Either remove this reviewer from the roster, or omit --multi-model."
    );
  });

  it('unsupported_reviewer identifies quality-engineer', () => {
    expect(expected.unsupported_reviewer).toBe('quality-engineer');
  });

  it('abort_reason is unsupported_reviewer', () => {
    expect(expected.abort_reason).toBe('unsupported_reviewer');
  });

  it('error message contains all four v1-supported reviewer names', () => {
    const msg = expected.error_message;
    expect(msg).toContain('code-reviewer');
    expect(msg).toContain('security-reviewer');
    expect(msg).toContain('design-system-agent');
    expect(msg).toContain('performance-engineer');
  });
});

/**
 * Layer 1: Structural tests for tests/helpers/invoke-agent.ts frontmatter
 * support (Phase 1, Milestone 1.1, Task 3; FR-HM14).
 *
 * FR-HM14 requires that `invoke-agent.ts` read `model:` and `effort:` from
 * an invoked agent's own frontmatter instead of hardcoding `sonnet`, and
 * that the Layer 2 cache key (tests/helpers/cache.ts:getCacheKey) include
 * both so that re-tiering an agent's effort invalidates its cached output.
 *
 * These tests exercise `parseAgentFrontmatter`, `buildEffortArgs`, and
 * `getCacheKey` directly against synthetic frontmatter strings. No LLM is
 * invoked: `invokeAgent()` itself (which shells out to `claude -p`) is
 * intentionally not called here — see tests/schemas/ (Layer 1) vs.
 * tests/promptfoo.config.yaml (Layer 2/3) in the repo root CLAUDE.md.
 *
 * Plan: docs/plans/harness-modernization.md, Phase 1 / Milestone 1.1 / Task 3.
 */

import { describe, it, expect } from 'vitest';
import {
  parseAgentFrontmatter,
  buildEffortArgs,
  DEFAULT_MODEL,
} from '../helpers/invoke-agent';
import { getCacheKey } from '../helpers/cache';

// ---------------------------------------------------------------------------
// Synthetic agent markdown fixtures (frontmatter shapes)
// ---------------------------------------------------------------------------

const AGENT_MODEL_AND_EFFORT_LOW = `---
model: haiku
effort: low
---

# Some Utility Agent

Body text.
`;

const AGENT_MODEL_AND_EFFORT_HIGH = `---
model: haiku
effort: high
---

# Some Utility Agent

Body text.
`;

/** Today's shape: only `model:`, no `effort:` key at all. */
const AGENT_MODEL_ONLY = `---
model: sonnet
---

# Tech Lead

Body text.
`;

/** No frontmatter block whatsoever. */
const AGENT_NO_FRONTMATTER = `# Some Agent

No frontmatter at the top of this file.
`;

/** Frontmatter with description/tools around model/effort, quoted value. */
const AGENT_FULL_FRONTMATTER = `---
description: "A narrow-scope utility agent."
model: "haiku"
effort: 'medium'
tools: Read, Grep
---

# Full Frontmatter Agent
`;

// ---------------------------------------------------------------------------
// parseAgentFrontmatter
// ---------------------------------------------------------------------------

describe('parseAgentFrontmatter', () => {
  it('parses model: haiku and effort: low correctly', () => {
    const fm = parseAgentFrontmatter(AGENT_MODEL_AND_EFFORT_LOW);
    expect(fm.model).toBe('haiku');
    expect(fm.effort).toBe('low');
  });

  it('parses model: haiku and effort: high correctly (distinct from low)', () => {
    const fm = parseAgentFrontmatter(AGENT_MODEL_AND_EFFORT_HIGH);
    expect(fm.model).toBe('haiku');
    expect(fm.effort).toBe('high');
  });

  it('parses frontmatter with only model: (no effort: key) — today\'s shape', () => {
    const fm = parseAgentFrontmatter(AGENT_MODEL_ONLY);
    expect(fm.model).toBe('sonnet');
    expect(fm.effort).toBeUndefined();
  });

  it('returns {} for an agent with no frontmatter block', () => {
    const fm = parseAgentFrontmatter(AGENT_NO_FRONTMATTER);
    expect(fm.model).toBeUndefined();
    expect(fm.effort).toBeUndefined();
    expect(fm).toEqual({});
  });

  it('extracts model/effort from frontmatter that also has other keys, stripping quotes', () => {
    const fm = parseAgentFrontmatter(AGENT_FULL_FRONTMATTER);
    expect(fm.model).toBe('haiku');
    expect(fm.effort).toBe('medium');
  });

  it('handles CRLF line endings in the frontmatter block', () => {
    const crlf = AGENT_MODEL_AND_EFFORT_LOW.replace(/\n/g, '\r\n');
    const fm = parseAgentFrontmatter(crlf);
    expect(fm.model).toBe('haiku');
    expect(fm.effort).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// buildEffortArgs
// ---------------------------------------------------------------------------

describe('buildEffortArgs', () => {
  it('returns ["--effort", <level>] when an effort tier is given', () => {
    expect(buildEffortArgs('low')).toEqual(['--effort', 'low']);
    expect(buildEffortArgs('high')).toEqual(['--effort', 'high']);
  });

  it('returns [] when effort is undefined', () => {
    expect(buildEffortArgs(undefined)).toEqual([]);
  });

  it('returns [] when effort is an empty string', () => {
    expect(buildEffortArgs('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_MODEL fallback
// ---------------------------------------------------------------------------

describe('DEFAULT_MODEL', () => {
  it('is "sonnet", the pre-FR-HM14 hardcoded default', () => {
    expect(DEFAULT_MODEL).toBe('sonnet');
  });
});

// ---------------------------------------------------------------------------
// Cache key: effort must be part of the key (FR-HM14)
// ---------------------------------------------------------------------------

describe('getCacheKey — effort tier is part of the Layer 2 cache key (FR-HM14)', () => {
  const agentContent = AGENT_MODEL_AND_EFFORT_LOW; // model: haiku, effort: low
  const fixtureContent = 'Some fixture input.';

  it('produces a different key for effort: low vs. effort: high (same model, same input)', () => {
    const lowKey = getCacheKey(agentContent, fixtureContent, 'haiku', 'low');
    const highKey = getCacheKey(agentContent, fixtureContent, 'haiku', 'high');
    expect(lowKey).not.toBe(highKey);
  });

  it('produces a different key for an explicit effort vs. no effort at all', () => {
    const withEffort = getCacheKey(agentContent, fixtureContent, 'haiku', 'low');
    const withoutEffort = getCacheKey(agentContent, fixtureContent, 'haiku');
    expect(withEffort).not.toBe(withoutEffort);
  });

  it('is stable (deterministic) for identical inputs', () => {
    const a = getCacheKey(agentContent, fixtureContent, 'haiku', 'low');
    const b = getCacheKey(agentContent, fixtureContent, 'haiku', 'low');
    expect(a).toBe(b);
  });

  it('still varies by agent content and fixture content (pre-existing inputs preserved)', () => {
    const base = getCacheKey(agentContent, fixtureContent, 'haiku', 'low');
    const differentAgent = getCacheKey(agentContent + '\nextra', fixtureContent, 'haiku', 'low');
    const differentFixture = getCacheKey(agentContent, fixtureContent + ' more', 'haiku', 'low');
    expect(differentAgent).not.toBe(base);
    expect(differentFixture).not.toBe(base);
  });

  it('still varies by model, independent of effort', () => {
    const sonnetKey = getCacheKey(agentContent, fixtureContent, 'sonnet', 'low');
    const haikuKey = getCacheKey(agentContent, fixtureContent, 'haiku', 'low');
    expect(sonnetKey).not.toBe(haikuKey);
  });

  it('is a 16-character lowercase hex string', () => {
    const key = getCacheKey(agentContent, fixtureContent, 'haiku', 'low');
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// End-to-end resolution: frontmatter -> (model, effort) -> cache key
// ---------------------------------------------------------------------------

describe('frontmatter -> cache key resolution (end-to-end, no LLM call)', () => {
  const fixtureContent = 'Fixture body.';

  function resolveCacheKey(agentContent: string, modelOverride?: string, effortOverride?: string): string {
    const fm = parseAgentFrontmatter(agentContent);
    const model = modelOverride ?? fm.model ?? DEFAULT_MODEL;
    const effort = effortOverride ?? fm.effort;
    return getCacheKey(agentContent, fixtureContent, model, effort);
  }

  it('effort: low vs. effort: high on the same agent name produce different cache keys', () => {
    const lowKey = resolveCacheKey(AGENT_MODEL_AND_EFFORT_LOW);
    const highKey = resolveCacheKey(AGENT_MODEL_AND_EFFORT_HIGH);
    expect(lowKey).not.toBe(highKey);
  });

  it('an agent with only model: (no effort:) resolves to DEFAULT_MODEL fallback semantics only when model itself is absent', () => {
    // model: sonnet is present, so it is honored; effort is absent, so no
    // --effort flag would be built and the cache key uses the "no effort"
    // branch of getCacheKey's default parameter.
    const fm = parseAgentFrontmatter(AGENT_MODEL_ONLY);
    expect(fm.model).toBe('sonnet');
    expect(buildEffortArgs(fm.effort)).toEqual([]);

    const keyWithNoEffort = resolveCacheKey(AGENT_MODEL_ONLY);
    const keyWithExplicitDefault = getCacheKey(AGENT_MODEL_ONLY, fixtureContent, 'sonnet');
    expect(keyWithNoEffort).toBe(keyWithExplicitDefault);
  });

  it('an agent with no frontmatter falls back to DEFAULT_MODEL and no effort flag', () => {
    const fm = parseAgentFrontmatter(AGENT_NO_FRONTMATTER);
    const model = fm.model ?? DEFAULT_MODEL;
    expect(model).toBe(DEFAULT_MODEL);
    expect(buildEffortArgs(fm.effort)).toEqual([]);

    const key = resolveCacheKey(AGENT_NO_FRONTMATTER);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });
});

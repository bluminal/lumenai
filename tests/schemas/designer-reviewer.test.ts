/**
 * Layer 1: the default reviewer rosters must name agents that exist.
 *
 * `agent: designer` was never a registered agent. Plan review maps it to
 * design-system-agent (that agent's own "Plan Reviewer" role); PRD review maps
 * it to lead-frontend-engineer (refine-requirements' UX questions). `designer`
 * stays accepted as a legacy alias so existing project configs keep working.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', 'plugins', 'synthex');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
const registered = new Set(
  (plugin.agents as string[]).map((a) => a.replace(/^.*\//, '').replace(/\.md$/, '')),
);

describe('default reviewer rosters', () => {
  it.each([
    'config/defaults.yaml',
    'commands/init.md',
    'commands/write-implementation-plan.md',
    'commands/refine-requirements.md',
  ])('%s names only registered agents', (rel) => {
    const agents = [...read(rel).matchAll(/^\s*- agent: ([a-z0-9-]+)/gm)].map((m) => m[1]);
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) expect(registered, `${rel}: ${agent}`).toContain(agent);
  });

  it('keeps `designer` as a legacy alias, resolved per command', () => {
    expect(read('commands/write-implementation-plan.md')).toContain(
      'legacy `agent: designer` means `design-system-agent`',
    );
    expect(read('commands/refine-requirements.md')).toContain(
      'legacy `agent: designer` means `lead-frontend-engineer`',
    );
  });
});

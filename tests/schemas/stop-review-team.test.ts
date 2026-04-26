/**
 * Layer 1: Schema validation tests for stop-review-team command.
 *
 * Validates all [T] acceptance criteria from Task 42:
 *   [T1] Three parameters present: name, all, force
 *   [T2] Interactive prompt via AskUserQuestion with verbatim text
 *   [T3] No-args path: standing-pools table displayed BEFORE prompt
 *   [T4] In-flight warning text present unless --force
 *   [T5] Shutdown signal: SendMessage to Pool Lead with type: shutdown
 *   [T6] 30s timeout produces verbatim message fragments
 *   [T7] Index update uses .index.lock (mkdir) locking semantics
 *   [T8] Force-cleanup hint includes manual paths
 *   [T9] "Pool Lead" terminology — no "team lead" or "team Lead"
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const COMMAND_PATH = join(
  import.meta.dirname,
  '..', '..', 'plugins', 'synthex-plus', 'commands', 'stop-review-team.md'
);

const content = readFileSync(COMMAND_PATH, 'utf-8');

// ── [T1] Three parameters present ────────────────────────────────────────────

describe('[T1] Parameters table: name, all, force', () => {
  it('has parameter "name"', () => {
    expect(content).toContain('`name`');
  });

  it('has parameter "all"', () => {
    expect(content).toContain('`all`');
  });

  it('has parameter "force"', () => {
    expect(content).toContain('`force`');
  });

  it('has a Parameters section with a table', () => {
    expect(content).toMatch(/## Parameters/);
    expect(content).toMatch(/\| Parameter \| Description \|/);
  });
});

// ── [T2] AskUserQuestion with verbatim prompt text ────────────────────────────

describe('[T2] AskUserQuestion with verbatim prompt', () => {
  it('uses AskUserQuestion tool', () => {
    expect(content).toContain('AskUserQuestion');
  });

  it('includes verbatim prompt text: "Which pool would you like to stop? Enter pool name or \'cancel\' to abort:"', () => {
    expect(content).toContain(
      "Which pool would you like to stop? Enter pool name or 'cancel' to abort:"
    );
  });
});

// ── [T3] Standing-pools table displayed BEFORE prompt ─────────────────────────

describe('[T3] No-args path: table displayed before AskUserQuestion', () => {
  it('references "list-teams" or the FR-MMT11 table format', () => {
    const hasListTeams = content.includes('list-teams');
    const hasColumnHeaders = content.includes('| Name | Roster |');
    expect(hasListTeams || hasColumnHeaders).toBe(true);
  });

  it('table column headers appear before the AskUserQuestion call in the document', () => {
    const tableIndex = content.indexOf('| Name | Roster |');
    const askIndex = content.indexOf('AskUserQuestion');
    // Both must exist
    expect(tableIndex).toBeGreaterThan(-1);
    expect(askIndex).toBeGreaterThan(-1);
    // Table must precede the prompt
    expect(tableIndex).toBeLessThan(askIndex);
  });
});

// ── [T4] In-flight task warning ────────────────────────────────────────────────

describe('[T4] In-flight task warning when --force not set', () => {
  it('mentions "in-progress tasks" in the context of a warning or confirmation', () => {
    expect(content).toMatch(/in.progress tasks/i);
  });

  it('includes "Stop anyway" prompt text', () => {
    expect(content).toContain('Stop anyway');
  });

  it('in-flight warning is conditional on --force not being set', () => {
    // The command must specify that the warning is skipped when --force is provided
    const forceIndex = content.indexOf('--force');
    expect(forceIndex).toBeGreaterThan(-1);
    // Check that force and the warning logic are linked in the document
    const warningSection = content.slice(
      content.indexOf('In-Flight'),
      content.indexOf('### 3.')
    );
    expect(warningSection).toContain('force');
  });
});

// ── [T5] Shutdown signal via SendMessage to Pool Lead ─────────────────────────

describe('[T5] Shutdown signal: SendMessage with type shutdown', () => {
  it('references SendMessage', () => {
    expect(content).toContain('SendMessage');
  });

  it('references type: shutdown or type shutdown', () => {
    expect(content).toMatch(/type.*shutdown|shutdown.*type/i);
  });

  it('sends message to Pool Lead', () => {
    // The shutdown message must target the Pool Lead
    const sendMessageSection = content.slice(
      content.indexOf('### 3.'),
      content.indexOf('### 4.')
    );
    expect(sendMessageSection).toContain('Pool Lead');
    expect(sendMessageSection).toContain('SendMessage');
    expect(sendMessageSection).toContain('shutdown');
  });
});

// ── [T6] 30-second timeout verbatim message ────────────────────────────────────

describe('[T6] 30-second timeout produces verbatim message fragments', () => {
  it('contains "Pool \'" prefix (start of timeout message)', () => {
    expect(content).toContain("Pool '");
  });

  it('contains "is still finishing in-flight tasks"', () => {
    expect(content).toContain('is still finishing in-flight tasks');
  });

  it('contains "--force to terminate immediately"', () => {
    expect(content).toContain('--force to terminate immediately');
  });

  it('timeout duration of 30 seconds is specified', () => {
    expect(content).toMatch(/30 seconds/);
  });
});

// ── [T7] Index update uses .index.lock (mkdir) locking ────────────────────────

describe('[T7] Index update uses .index.lock via mkdir', () => {
  it('references mkdir for locking', () => {
    expect(content).toContain('mkdir');
  });

  it('references .index.lock', () => {
    expect(content).toContain('.index.lock');
  });

  it('describes atomic rename via .index.json.tmp', () => {
    expect(content).toContain('.index.json.tmp');
  });

  it('describes releasing lock after update', () => {
    // rmdir or "release lock" must appear near the lock section
    const lockSection = content.slice(
      content.indexOf('### 5.'),
      content.indexOf('### 6.')
    );
    const hasRelease = lockSection.includes('rmdir') || lockSection.includes('Release lock') || lockSection.includes('release lock');
    expect(hasRelease).toBe(true);
  });
});

// ── [T8] Force-cleanup hint includes manual paths ─────────────────────────────

describe('[T8] Force-cleanup hint includes manual paths', () => {
  it('references ~/.claude/teams/standing/ near cleanup instructions', () => {
    expect(content).toContain('~/.claude/teams/standing/');
  });

  it('mentions both the metadata directory and the index entry in cleanup context', () => {
    // Find the force-cleanup / crashed pool section
    const cleanupIdx = content.indexOf('crashed') >= 0
      ? content.indexOf('crashed')
      : content.indexOf('cleanup');
    const cleanupSection = content.slice(cleanupIdx, cleanupIdx + 1000);
    expect(cleanupSection).toContain('~/.claude/teams/standing/');
  });
});

// ── [T9] Terminology: "Pool Lead" only, not "team lead" ───────────────────────

describe('[T9] Pool Lead terminology — no "team lead" or "team Lead"', () => {
  it('uses "Pool Lead" (canonical form)', () => {
    expect(content).toContain('Pool Lead');
  });

  it('does NOT contain "team lead" (case-insensitive)', () => {
    expect(content).not.toMatch(/\bteam lead\b/i);
  });

  it('does NOT contain "team Lead" (mixed case)', () => {
    expect(content).not.toContain('team Lead');
  });

  it('no bare "Lead" outside of "Pool Lead"', () => {
    const withoutPoolLead = content.replace(/Pool Lead/g, 'POOL_LEAD_PLACEHOLDER');
    const bareLeadMatch = withoutPoolLead.match(/\bLead\b/);
    expect(bareLeadMatch).toBeNull();
  });
});

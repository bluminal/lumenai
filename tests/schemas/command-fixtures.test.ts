/**
 * Layer 2: Command fixture tests for multi-model-teams commands.
 *
 * 10 scenarios covering start-review-team, stop-review-team, and list-teams
 * command flows. All fixtures are synthetic (no live LLM calls).
 *
 * Acceptance criteria coverage:
 *   [a] start-default       — D6 default roster; D16 no cost warning; T6 idle state; T11 Identity Confirm Overlay
 *   [b] start-multi-model   — T11/T12/T13 overlay routing; T14 multi-model conditional overlay
 *   [c] start-invalid-name  — T2 name regex; T3 verbatim rejection message; abort before any FS write
 *   [d] start-duplicate-name — pre-flight duplicate detection; remediation hints
 *   [e] start-cost-warning  — D16/T9 cost advisory verbatim text; cost_warning_shown recorded
 *   [f] stop-with-inflight  — --force suppresses warning; shutdown signal dispatched; force_stopped result
 *   [g] list-empty          — empty state with actionable guidance
 *   [h] list-with-mixed-states — all 4 pool states represented; TTL=0 for terminal states
 *   [i] stop-no-args-interactive — table before prompt; verbatim prompt text; clean stop
 *   [j] stop-no-args-cancel — cancel response; no side effects
 */

import { describe, it, expect } from 'vitest';

import {
  frames as startDefaultFrames,
  FRAME_NAMES as startDefaultFrameNames,
  getFrame as getStartDefaultFrame,
  assertPoolStateIdle,
  assertPoolLeadHasIdentityConfirmOverlay,
  assertNoCostWarning,
} from '../fixtures/multi-model-teams/commands/start-default/assertions.js';

import {
  frames as startMultiModelFrames,
  FRAME_NAMES as startMultiModelFrameNames,
  getFrame as getStartMultiModelFrame,
  assertPoolLeadHasAllThreeOverlays,
  assertReviewerHasIdentityAndMultiModelButNotLifecycle,
  assertMultiModelTrueInConfig,
} from '../fixtures/multi-model-teams/commands/start-multi-model/assertions.js';

import {
  frames as startInvalidNameFrames,
  FRAME_NAMES as startInvalidNameFrameNames,
  getFrame as getStartInvalidNameFrame,
  assertVerbatimErrorMessage,
  assertNoFilesystemWrites as assertInvalidNameNoFsWrites,
} from '../fixtures/multi-model-teams/commands/start-invalid-name/assertions.js';

import {
  frames as startDuplicateNameFrames,
  FRAME_NAMES as startDuplicateNameFrameNames,
  getFrame as getStartDuplicateNameFrame,
  assertRemediationHintPresent,
  assertConflictDetected,
  assertNoFilesystemWrites as assertDuplicateNameNoFsWrites,
} from '../fixtures/multi-model-teams/commands/start-duplicate-name/assertions.js';

import {
  frames as startCostWarningFrames,
  FRAME_NAMES as startCostWarningFrameNames,
  getFrame as getStartCostWarningFrame,
  assertAdvisoryTextVerbatim,
  assertCostWarningRecordedInConfirmation,
  assertFourReviewerRoster,
} from '../fixtures/multi-model-teams/commands/start-cost-warning/assertions.js';

import {
  frames as stopWithInflightFrames,
  FRAME_NAMES as stopWithInflightFrameNames,
  getFrame as getStopWithInflightFrame,
  assertForceSkipsWarning,
  assertShutdownMessageSent,
  assertForceStoppedResult,
} from '../fixtures/multi-model-teams/commands/stop-with-inflight/assertions.js';

import {
  frames as listEmptyFrames,
  FRAME_NAMES as listEmptyFrameNames,
  getFrame as getListEmptyFrame,
  assertStandingPoolsIsEmptyArray,
  assertEmptyMessageContainsStartHint,
} from '../fixtures/multi-model-teams/commands/list-empty/assertions.js';

import {
  frames as listMixedStatesFrames,
  FRAME_NAMES as listMixedStatesFrameNames,
  getFrame as getListMixedStatesFrame,
  assertFourStandingPools,
  assertAllFourStatesRepresented,
  assertTerminalStatesHaveZeroTtl,
  assertOneNonStandingTeam,
} from '../fixtures/multi-model-teams/commands/list-with-mixed-states/assertions.js';

import {
  frames as stopInteractiveFrames,
  FRAME_NAMES as stopInteractiveFrameNames,
  getFrame as getStopInteractiveFrame,
  assertTableShownBeforePrompt,
  assertVerbatimPromptText,
  assertPrePromptTableShownInConfirmation,
  assertCleanStopResult,
} from '../fixtures/multi-model-teams/commands/stop-no-args-interactive/assertions.js';

import {
  frames as stopCancelFrames,
  FRAME_NAMES as stopCancelFrameNames,
  getFrame as getStopCancelFrame,
  assertCancelledWithNoSideEffects,
  assertCancelledResult,
  assertUserRespondedCancel,
} from '../fixtures/multi-model-teams/commands/stop-no-args-cancel/assertions.js';

// ── [a] start-default ────────────────────────────────────────────────────────

describe('[a] start-default — default parameters, no flags', () => {
  it('has exactly 5 frames in expected order', () => {
    expect(startDefaultFrames).toHaveLength(startDefaultFrameNames.length);
    for (let i = 0; i < startDefaultFrameNames.length; i++) {
      expect(startDefaultFrames[i].frame).toBe(startDefaultFrameNames[i]);
    }
  });

  it('every frame has required fields', () => {
    for (const frame of startDefaultFrames) {
      expect(frame).toHaveProperty('frame');
      expect(frame).toHaveProperty('description');
      expect(frame).toHaveProperty('event');
      expect(frame).toHaveProperty('state');
      expect(frame).toHaveProperty('assertion');
    }
  });

  it('[T6] metadata_written frame has pool_state: idle', () => {
    const error = assertPoolStateIdle();
    expect(error).toBeNull();
  });

  it('[T6] config_json.pool_state is exactly "idle"', () => {
    const frame = getStartDefaultFrame('metadata_written');
    const configJson = frame.state['config_json'] as Record<string, unknown>;
    expect(configJson['pool_state']).toBe('idle');
  });

  it('[T11] Pool Lead spawn prompt contains "### Standing Pool Identity Confirm Overlay" verbatim', () => {
    const error = assertPoolLeadHasIdentityConfirmOverlay();
    expect(error).toBeNull();
  });

  it('[D16] cost_warning_shown is false for default 2-reviewer roster', () => {
    const error = assertNoCostWarning();
    expect(error).toBeNull();
  });

  it('[D6] resolved_reviewers has code-reviewer and security-reviewer', () => {
    const frame = getStartDefaultFrame('validation_passed');
    const reviewers = frame.state['resolved_reviewers'] as string[];
    expect(reviewers).toContain('code-reviewer');
    expect(reviewers).toContain('security-reviewer');
    expect(reviewers).toHaveLength(2);
  });

  it('lock_acquired frame has method: mkdir', () => {
    const frame = getStartDefaultFrame('lock_acquired');
    expect(frame.state['method']).toBe('mkdir');
  });
});

// ── [b] start-multi-model ────────────────────────────────────────────────────

describe('[b] start-multi-model — --multi-model flag with 3-reviewer roster', () => {
  it('has exactly 6 frames in expected order', () => {
    expect(startMultiModelFrames).toHaveLength(startMultiModelFrameNames.length);
    for (let i = 0; i < startMultiModelFrameNames.length; i++) {
      expect(startMultiModelFrames[i].frame).toBe(startMultiModelFrameNames[i]);
    }
  });

  it('[T11/T12] Pool Lead prompt contains all three overlays', () => {
    const error = assertPoolLeadHasAllThreeOverlays();
    expect(error).toBeNull();
  });

  it('[T11] Pool Lead prompt contains "### Standing Pool Identity Confirm Overlay"', () => {
    const frame = getStartMultiModelFrame('spawn_prompts_composed');
    const prompt = frame.state['pool_lead_prompt'] as string;
    expect(prompt).toContain('### Standing Pool Identity Confirm Overlay');
  });

  it('[T12] Pool Lead prompt contains "### Standing Pool Lifecycle Overlay"', () => {
    const frame = getStartMultiModelFrame('spawn_prompts_composed');
    const prompt = frame.state['pool_lead_prompt'] as string;
    expect(prompt).toContain('### Standing Pool Lifecycle Overlay');
  });

  it('[T14] Pool Lead prompt contains "### Multi-Model Conditional Overlay"', () => {
    const frame = getStartMultiModelFrame('spawn_prompts_composed');
    const prompt = frame.state['pool_lead_prompt'] as string;
    expect(prompt).toContain('### Multi-Model Conditional Overlay');
  });

  it('[T13] Reviewer prompts contain Identity Confirm + Multi-Model but NOT Lifecycle overlay', () => {
    const error = assertReviewerHasIdentityAndMultiModelButNotLifecycle();
    expect(error).toBeNull();
  });

  it('[T13] code-reviewer prompt does NOT contain "### Standing Pool Lifecycle Overlay"', () => {
    const frame = getStartMultiModelFrame('spawn_prompts_composed');
    const reviewerPrompts = frame.state['reviewer_prompts'] as Record<string, string>;
    expect(reviewerPrompts['code-reviewer']).not.toContain('### Standing Pool Lifecycle Overlay');
  });

  it('[T14] config_json has multi_model: true', () => {
    const error = assertMultiModelTrueInConfig();
    expect(error).toBeNull();
  });

  it('confirmation_shown has multi_model: true', () => {
    const frame = getStartMultiModelFrame('confirmation_shown');
    expect(frame.state['multi_model']).toBe(true);
  });
});

// ── [c] start-invalid-name ───────────────────────────────────────────────────

describe('[c] start-invalid-name — underscore in name aborts before FS write', () => {
  it('has exactly 3 frames in expected order', () => {
    expect(startInvalidNameFrames).toHaveLength(startInvalidNameFrameNames.length);
    for (let i = 0; i < startInvalidNameFrameNames.length; i++) {
      expect(startInvalidNameFrames[i].frame).toBe(startInvalidNameFrameNames[i]);
    }
  });

  it('[T3] error_message contains "Pool name \'"', () => {
    const frame = getStartInvalidNameFrame('validation_failed');
    const msg = frame.state['error_message'] as string;
    expect(msg).toContain("Pool name '");
  });

  it('[T3] error_message contains "is invalid"', () => {
    const frame = getStartInvalidNameFrame('validation_failed');
    const msg = frame.state['error_message'] as string;
    expect(msg).toContain('is invalid');
  });

  it('[T3] error_message contains "Names must be 1–48"', () => {
    const frame = getStartInvalidNameFrame('validation_failed');
    const msg = frame.state['error_message'] as string;
    expect(msg).toContain('Names must be 1–48');
  });

  it('[T3] all three verbatim fragments present in error_message', () => {
    const error = assertVerbatimErrorMessage();
    expect(error).toBeNull();
  });

  it('[T2] regex_matched is false for "Review_Pool"', () => {
    const frame = getStartInvalidNameFrame('validation_failed');
    expect(frame.state['regex_matched']).toBe(false);
  });

  it('aborted_no_fs_write: config_json_written is false', () => {
    const frame = getStartInvalidNameFrame('aborted_no_fs_write');
    expect(frame.state['config_json_written']).toBe(false);
  });

  it('aborted_no_fs_write: index_updated is false', () => {
    const frame = getStartInvalidNameFrame('aborted_no_fs_write');
    expect(frame.state['index_updated']).toBe(false);
  });

  it('aborted_no_fs_write: lock_acquired is false', () => {
    const frame = getStartInvalidNameFrame('aborted_no_fs_write');
    expect(frame.state['lock_acquired']).toBe(false);
  });

  it('no filesystem writes occurred (aggregate check)', () => {
    const error = assertInvalidNameNoFsWrites();
    expect(error).toBeNull();
  });
});

// ── [d] start-duplicate-name ─────────────────────────────────────────────────

describe('[d] start-duplicate-name — pre-flight detects existing pool', () => {
  it('has exactly 3 frames in expected order', () => {
    expect(startDuplicateNameFrames).toHaveLength(startDuplicateNameFrameNames.length);
    for (let i = 0; i < startDuplicateNameFrameNames.length; i++) {
      expect(startDuplicateNameFrames[i].frame).toBe(startDuplicateNameFrameNames[i]);
    }
  });

  it('pre_flight_failed: conflict_detected is true', () => {
    const error = assertConflictDetected();
    expect(error).toBeNull();
  });

  it('aborted_duplicate: error_message references "/list-teams" or "/stop-review-team"', () => {
    const error = assertRemediationHintPresent();
    expect(error).toBeNull();
  });

  it('aborted_duplicate: no filesystem writes', () => {
    const error = assertDuplicateNameNoFsWrites();
    expect(error).toBeNull();
  });

  it('aborted_duplicate: error_message is a non-empty string', () => {
    const frame = getStartDuplicateNameFrame('aborted_duplicate');
    const msg = frame.state['error_message'];
    expect(typeof msg).toBe('string');
    expect((msg as string).length).toBeGreaterThan(0);
  });
});

// ── [e] start-cost-warning ───────────────────────────────────────────────────

describe('[e] start-cost-warning — 4 reviewers triggers D16 cost advisory', () => {
  it('has exactly 4 frames in expected order', () => {
    expect(startCostWarningFrames).toHaveLength(startCostWarningFrameNames.length);
    for (let i = 0; i < startCostWarningFrameNames.length; i++) {
      expect(startCostWarningFrames[i].frame).toBe(startCostWarningFrameNames[i]);
    }
  });

  it('[D16] 4 reviewers in roster', () => {
    const error = assertFourReviewerRoster();
    expect(error).toBeNull();
  });

  it('[T9] advisory_text contains "Heads up: this pool will keep"', () => {
    const frame = getStartCostWarningFrame('cost_warning_shown');
    const text = frame.state['advisory_text'] as string;
    expect(text).toContain('Heads up: this pool will keep');
  });

  it('[T9] advisory_text contains "idle for up to"', () => {
    const frame = getStartCostWarningFrame('cost_warning_shown');
    const text = frame.state['advisory_text'] as string;
    expect(text).toContain('idle for up to');
  });

  it('[T9] advisory_text contains "minutes"', () => {
    const frame = getStartCostWarningFrame('cost_warning_shown');
    const text = frame.state['advisory_text'] as string;
    expect(text).toContain('minutes');
  });

  it('[T9] advisory_text contains "Continue?"', () => {
    const frame = getStartCostWarningFrame('cost_warning_shown');
    const text = frame.state['advisory_text'] as string;
    expect(text).toContain('Continue?');
  });

  it('[T9] all verbatim advisory fragments present (aggregate check)', () => {
    const error = assertAdvisoryTextVerbatim();
    expect(error).toBeNull();
  });

  it('[D16] confirmation_shown has cost_warning_shown: true', () => {
    const error = assertCostWarningRecordedInConfirmation();
    expect(error).toBeNull();
  });
});

// ── [f] stop-with-inflight ───────────────────────────────────────────────────

describe('[f] stop-with-inflight — --force skips in-flight warning', () => {
  it('has exactly 4 frames in expected order', () => {
    expect(stopWithInflightFrames).toHaveLength(stopWithInflightFrameNames.length);
    for (let i = 0; i < stopWithInflightFrameNames.length; i++) {
      expect(stopWithInflightFrames[i].frame).toBe(stopWithInflightFrameNames[i]);
    }
  });

  it('inflight_check: warning_shown is false (force=true suppresses it)', () => {
    const error = assertForceSkipsWarning();
    expect(error).toBeNull();
  });

  it('shutdown_sent: message_type is "shutdown"', () => {
    const error = assertShutdownMessageSent();
    expect(error).toBeNull();
  });

  it('shutdown_sent: message directed to Pool Lead', () => {
    const frame = getStopWithInflightFrame('shutdown_sent');
    const messageTo = frame.state['message_to'] as string;
    expect(messageTo).toMatch(/Pool Lead/i);
  });

  it('confirmation_shown: result is "force_stopped"', () => {
    const error = assertForceStoppedResult();
    expect(error).toBeNull();
  });

  it('inflight_check: 1 task_in_progress with force=true', () => {
    const frame = getStopWithInflightFrame('inflight_check');
    expect(frame.state['tasks_in_progress']).toBe(1);
    expect(frame.state['force']).toBe(true);
  });
});

// ── [g] list-empty ───────────────────────────────────────────────────────────

describe('[g] list-empty — no teams exist', () => {
  it('has exactly 2 frames in expected order', () => {
    expect(listEmptyFrames).toHaveLength(listEmptyFrameNames.length);
    for (let i = 0; i < listEmptyFrameNames.length; i++) {
      expect(listEmptyFrames[i].frame).toBe(listEmptyFrameNames[i]);
    }
  });

  it('output_shown: standing_pools is an empty array', () => {
    const error = assertStandingPoolsIsEmptyArray();
    expect(error).toBeNull();
  });

  it('output_shown: standing_pools has 0 entries', () => {
    const frame = getListEmptyFrame('output_shown');
    expect(frame.state['standing_pools']).toEqual([]);
  });

  it('output_shown: non_standing_teams is an empty array', () => {
    const frame = getListEmptyFrame('output_shown');
    expect(frame.state['non_standing_teams']).toEqual([]);
  });

  it('output_shown: empty_message contains "start" or "create" hint', () => {
    const error = assertEmptyMessageContainsStartHint();
    expect(error).toBeNull();
  });

  it('output_shown: empty_message is a non-empty string', () => {
    const frame = getListEmptyFrame('output_shown');
    const msg = frame.state['empty_message'] as string;
    expect(typeof msg).toBe('string');
    expect(msg.trim().length).toBeGreaterThan(0);
  });
});

// ── [h] list-with-mixed-states ───────────────────────────────────────────────

describe('[h] list-with-mixed-states — 4 pools in different states + 1 non-standing', () => {
  it('has exactly 2 frames in expected order', () => {
    expect(listMixedStatesFrames).toHaveLength(listMixedStatesFrameNames.length);
    for (let i = 0; i < listMixedStatesFrameNames.length; i++) {
      expect(listMixedStatesFrames[i].frame).toBe(listMixedStatesFrameNames[i]);
    }
  });

  it('output_shown: standing_pools has exactly 4 entries', () => {
    const error = assertFourStandingPools();
    expect(error).toBeNull();
  });

  it('output_shown: all 4 pool states (idle, active, draining, stopping) represented', () => {
    const error = assertAllFourStatesRepresented();
    expect(error).toBeNull();
  });

  it('output_shown: draining pool has ttl_remaining_minutes: 0', () => {
    const frame = getListMixedStatesFrame('output_shown');
    const pools = frame.state['standing_pools'] as Array<{ name: string; pool_state: string; ttl_remaining_minutes: number }>;
    const draining = pools.find((p) => p.pool_state === 'draining');
    expect(draining).toBeDefined();
    expect(draining!.ttl_remaining_minutes).toBe(0);
  });

  it('output_shown: stopping pool has ttl_remaining_minutes: 0', () => {
    const frame = getListMixedStatesFrame('output_shown');
    const pools = frame.state['standing_pools'] as Array<{ name: string; pool_state: string; ttl_remaining_minutes: number }>;
    const stopping = pools.find((p) => p.pool_state === 'stopping');
    expect(stopping).toBeDefined();
    expect(stopping!.ttl_remaining_minutes).toBe(0);
  });

  it('output_shown: terminal states have ttl_remaining_minutes: 0 (aggregate check)', () => {
    const error = assertTerminalStatesHaveZeroTtl();
    expect(error).toBeNull();
  });

  it('output_shown: non_standing_teams has exactly 1 entry', () => {
    const error = assertOneNonStandingTeam();
    expect(error).toBeNull();
  });
});

// ── [i] stop-no-args-interactive ─────────────────────────────────────────────

describe('[i] stop-no-args-interactive — table before prompt, user selects pool', () => {
  it('has exactly 5 frames in expected order', () => {
    expect(stopInteractiveFrames).toHaveLength(stopInteractiveFrameNames.length);
    for (let i = 0; i < stopInteractiveFrameNames.length; i++) {
      expect(stopInteractiveFrames[i].frame).toBe(stopInteractiveFrameNames[i]);
    }
  });

  it('table_displayed: table_shown is true before prompt', () => {
    const error = assertTableShownBeforePrompt();
    expect(error).toBeNull();
  });

  it('table_displayed: table_shown is true', () => {
    const frame = getStopInteractiveFrame('table_displayed');
    expect(frame.state['table_shown']).toBe(true);
  });

  it('table_displayed: prompt_shown_yet is false (table precedes prompt)', () => {
    const frame = getStopInteractiveFrame('table_displayed');
    expect(frame.state['prompt_shown_yet']).toBe(false);
  });

  it('user_prompted: prompt_text matches verbatim', () => {
    const error = assertVerbatimPromptText();
    expect(error).toBeNull();
  });

  it('user_prompted: exact prompt text', () => {
    const frame = getStopInteractiveFrame('user_prompted');
    expect(frame.state['prompt_text']).toBe(
      "Which pool would you like to stop? Enter pool name or 'cancel' to abort:"
    );
  });

  it('confirmation_shown: pre_prompt_table_shown is true', () => {
    const error = assertPrePromptTableShownInConfirmation();
    expect(error).toBeNull();
  });

  it('confirmation_shown: result is "stopped_cleanly"', () => {
    const error = assertCleanStopResult();
    expect(error).toBeNull();
  });
});

// ── [j] stop-no-args-cancel ──────────────────────────────────────────────────

describe('[j] stop-no-args-cancel — user cancels, no side effects', () => {
  it('has exactly 4 frames in expected order', () => {
    expect(stopCancelFrames).toHaveLength(stopCancelFrameNames.length);
    for (let i = 0; i < stopCancelFrameNames.length; i++) {
      expect(stopCancelFrames[i].frame).toBe(stopCancelFrameNames[i]);
    }
  });

  it('user_prompted: user_response is "cancel"', () => {
    const error = assertUserRespondedCancel();
    expect(error).toBeNull();
  });

  it('aborted_cleanly: index_changed is false', () => {
    const frame = getStopCancelFrame('aborted_cleanly');
    expect(frame.state['index_changed']).toBe(false);
  });

  it('aborted_cleanly: shutdown_sent is false', () => {
    const frame = getStopCancelFrame('aborted_cleanly');
    expect(frame.state['shutdown_sent']).toBe(false);
  });

  it('aborted_cleanly: no side effects (aggregate check)', () => {
    const error = assertCancelledWithNoSideEffects();
    expect(error).toBeNull();
  });

  it('aborted_cleanly: result is "cancelled"', () => {
    const error = assertCancelledResult();
    expect(error).toBeNull();
  });

  it('aborted_cleanly: result is exactly "cancelled"', () => {
    const frame = getStopCancelFrame('aborted_cleanly');
    expect(frame.state['result']).toBe('cancelled');
  });
});

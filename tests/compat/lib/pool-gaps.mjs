// Kept out of harnesses.mjs on purpose: harnesses.mjs is copied into the
// compat containers (/opt/synthex-compat/lib), where the plugins/ tree is
// not at this relative path. Only the host-side schema test imports this.
import { GAP_MESSAGES } from '../../../plugins/synthex/scripts/lib/host-matrix.mjs';

/**
 * FR-HM25 (docs/reqs/harness-modernization.md): standing review pools are a
 * documented capability gap on every host that does not expose Claude
 * Code's Agent Teams tools (`SendMessage` and `ListAgents`) -- Codex
 * (ephemeral in-session teams only), Gemini CLI, OpenCode, and Grok. Claude
 * Code is excluded here because it is the one host that natively supports
 * standing pools. Grok is included even though it is not part of the
 * Docker-based `harnesses` matrix in harnesses.mjs (no offline/activation/canary
 * lifecycle is admitted for it yet); FR-HM25 names it explicitly as a pool
 * gap regardless. Hermes' Kanban board is noted in the PRD as a possible
 * future pool backend, not implemented, and is intentionally left out of
 * this table.
 *
 * Every value is the same `GAP_MESSAGES.pool` sentence, imported (never
 * copied) from `plugins/synthex/scripts/lib/host-matrix.mjs` -- the single
 * source the gated pool commands (`start-review-team`, `stop-review-team`,
 * `list-teams`) print verbatim -- so this table, the commands, and
 * `tests/compat/README.md` can never drift from one another.
 * `tests/schemas/cross-harness-compat.test.ts` asserts all three stay in
 * sync.
 */
export const poolCapabilityGaps = Object.freeze({
  codex: GAP_MESSAGES.pool,
  gemini: GAP_MESSAGES.pool,
  opencode: GAP_MESSAGES.pool,
  grok: GAP_MESSAGES.pool,
});

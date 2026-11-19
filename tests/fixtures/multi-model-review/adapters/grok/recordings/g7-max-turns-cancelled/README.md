# G7: max turns exhausted by a denied tool attempt (Risk 15, U25, U26)

**Purpose:** reproduce the silent-false-negative class from the field incident under the runner's flags.

**Prompt:** a neutral request to open `/tmp/synthex-spike-src/review-target.js` "with your file-reading tool", review it, and answer in a findings JSON shape. The argv uses `--max-turns 1`.

**Observed:** exit 1 in 4 s. stderr was `Error: max turns reached`. stdout was still a full wrapper, with `stopReason: "cancelled"`, `num_turns: 1` and no `thought` field. `.text` is only the model's preamble ("I'll open the review target…"). The model spent its only turn on a tool call that the deny rules refused.

**Expected runner mapping:** `cli_failed`, decided by the incomplete-run guard before any parsing.
- `stopReason` is not on the allowlist (`end_turn` only), and stderr contains `max turns reached`.
- The message names `stopReason: cancelled` and says the code was not reviewed.
- `.text` is never passed to `validate-findings`, and there is no retry.

**Note for Task 68:** in the field incident, `.text` was `{"findings": []}`, which parses as a clean review. This recording's text is a prose preamble instead. Task 68 should also run the guard on a synthetic copy of this wrapper whose `.text` is `{"findings": []}`, because that is the dangerous variant.

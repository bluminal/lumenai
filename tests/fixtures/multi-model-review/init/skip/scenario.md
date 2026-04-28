# Scenario (c): skip

## Overview

During `/init`, the detection scan (step 4a) runs for all candidate CLIs. Regardless of results,
the user selects **option 3: Skip**.

## User Action

The user sees the `AskUserQuestion` prompt listing detection results and chooses option 3.

## Expected Behavior (FR-MR23 — default behavior preserved)

1. **No config writes** — `expected_config_writes` is empty `{}`.
2. **No `multi_model_review` section** written to `.synthex/config.yaml`.
   - `expected_no_multi_model_section: true` — the config file must NOT contain a
     `multi_model_review:` top-level key after init completes.
3. **No `docs/reviews/` creation** — `expected_docs_reviews_created: false`.
4. **No warnings or errors** — init continues normally to steps 5 (update .gitignore),
   6 (create document directories), and 7 (confirm and guide).
5. Multi-model review remains disabled by default (FR-MR23 regression contract).

## Key Invariant

Skip is the default non-destructive path. It must produce NO `multi_model_review` side-effects —
neither config keys nor directory creation. The existing native-only review behavior is preserved
byte-identically.

## Fixture Files

| File          | Purpose                                              |
|---------------|------------------------------------------------------|
| `fixture.json`  | User choice 3, expected no-op config state         |
| `scenario.md`   | This document                                      |

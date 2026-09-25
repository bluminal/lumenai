# DECOY-PROJECT-DOCS-MARKER

This file intentionally shadows the plugin-shipped
`plugins/synthex/docs/standing-pool-routing.md` by sharing its filename
under the PROJECT's own `docs/` directory (not the plugin's). It exists
only to prove the D17 gate in `/synthex:review-code` Step 1b resolves
`${CLAUDE_PLUGIN_ROOT}/docs/standing-pool-routing.md` — the plugin's own
doc — and never a project-local `docs/standing-pool-routing.md` that
happens to share the same relative path. If a test run ever reads THIS
file's content instead of the plugin's, the D17 form is broken (D17,
FR-HM5, FR-HM13).

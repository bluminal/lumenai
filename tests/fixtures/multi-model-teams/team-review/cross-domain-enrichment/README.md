# Fixture: cross-domain-enrichment

multi-model enabled. code-reviewer sends a cross-domain tip to security-reviewer
during review. security-reviewer incorporates the tip into their findings_json.

Key assertions:
- FR-MMT4 suppression does NOT block cross-domain reviewer-to-reviewer messages
- security-reviewer's findings_json reflects the cross-domain context (enriched finding)
- Orchestrator receives the enriched findings via bridge (findings_json from security-reviewer)
- Orchestrator does NOT separately parse cross-domain messages — the enrichment is already
  embedded in security-reviewer's findings_json

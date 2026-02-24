# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in LumenAI or the Synthex plugin, please report it responsibly.

**Do not open a public issue.** Instead, email security concerns to: **security@bluminal.com**

We will acknowledge receipt within 48 hours and provide an estimated timeline for a fix.

## Scope

This policy covers:

- The LumenAI marketplace infrastructure
- All Synthex agent definitions and command definitions
- The automated testing framework
- CI/CD pipeline configuration

## Known Considerations

### LLM Prompt Injection

Synthex agents process user-provided input (code diffs, terraform plans, requirements documents, etc.). Like all LLM-based tools, there is an inherent risk that crafted input could influence agent behavior. Mitigations in place:

- All advisory agents are **read-only** — they produce findings and recommendations but never take actions
- Agent output follows **structured formats** (PASS/WARN/FAIL with standardized sections), making deviations detectable
- The Tech Lead agent explicitly states that **git workflow is owned by the caller**, not the agent

### Test Fixture Credentials

The `tests/fixtures/security/` directory contains **intentionally fake credentials** (AWS example keys, Stripe test keys) used to test the security-reviewer agent. These are non-functional values from vendor documentation. A `.gitleaks.toml` configuration suppresses false-positive alerts from these fixtures.

### GPG Signing

The `next-priority` command instructs the Tech Lead to commit with `--no-gpg-sign`. This is an intentional decision — automated agents typically cannot access GPG keys. Commits made via Synthex commands will not carry GPG signatures.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

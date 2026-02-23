# Product Requirements Document: KeyVault CLI

## 1. Vision & Purpose

Modern development teams manage dozens of API keys, tokens, and credentials across multiple cloud providers (AWS, GCP, Azure), SaaS platforms (Stripe, Twilio, SendGrid), and internal services. These secrets are scattered across environment files, CI/CD pipelines, secret managers, and developer laptops with no unified view, no rotation tracking, and no expiration alerts.

**KeyVault CLI** is an open-source command-line tool that provides a single interface to discover, audit, rotate, and monitor API keys across all providers. It treats secret lifecycle management as a first-class engineering concern, not an afterthought.

### Why Now

- Supply chain attacks targeting leaked credentials increased 300% in the past two years.
- Most organizations cannot answer "how many active API keys do we have?" without manual investigation.
- Secret rotation is manual, error-prone, and frequently skipped.
- Compliance frameworks (SOC 2, PCI DSS, HIPAA) increasingly require evidence of key rotation policies.

### What Happens If We Don't Build This

Teams continue managing secrets ad hoc. Keys go unrotated for months or years. Leaked keys in logs or repositories go undetected. Compliance audits require weeks of manual evidence gathering.

## 2. Target Users / Personas

### Primary: Platform Engineer (Priya)
- **Role:** Manages cloud infrastructure and developer tooling for a 50-person engineering team.
- **Pain Points:** Spends 4+ hours per month manually auditing and rotating keys. Cannot track which keys are used by which services. Gets surprised by expired keys causing production incidents.
- **Current Solution:** Spreadsheet tracking key metadata, manual rotation scripts per provider, Slack reminders.
- **Success Looks Like:** A single command shows all active keys, their age, which service uses them, and which are overdue for rotation.

### Secondary: Security Engineer (Marcus)
- **Role:** Responsible for security posture and compliance evidence.
- **Pain Points:** Quarterly SOC 2 audits require manual evidence of key rotation. Cannot produce a report of key age distribution across providers. No alerting when keys exceed age thresholds.
- **Current Solution:** Manual queries against each cloud provider's API, screenshots for auditors.
- **Success Looks Like:** Automated compliance reports showing key rotation history and current status.

### Tertiary: Individual Developer (Alex)
- **Role:** Full-stack developer who manages their own development and staging API keys.
- **Pain Points:** Forgets which keys are active, where they are stored, and when they were last rotated. Has accidentally committed keys to git.
- **Current Solution:** `.env` files, `~/.aws/credentials`, scattered `config.json` files.
- **Success Looks Like:** Quickly check personal key health, rotate a staging key in one command.

## 3. Functional Requirements

### Theme: Key Discovery & Inventory

#### FR-1: Multi-Provider Key Discovery
KeyVault CLI connects to configured cloud providers and SaaS platforms to discover all active API keys, access tokens, and service account credentials.

**Acceptance Criteria:**
- Discovers AWS IAM access keys (active and inactive) for all users in the account
- Discovers GCP service account keys
- Discovers Azure AD application credentials
- Returns a unified list with provider, key ID, owner, creation date, last used date, and status
- Handles authentication errors gracefully with clear error messages per provider

#### FR-2: Local Secret Scanner
Scans local filesystem paths for secrets stored in configuration files, environment files, and credential files.

**Acceptance Criteria:**
- Scans `~/.aws/credentials`, `~/.config/gcloud/`, `~/.azure/`
- Scans project `.env`, `.env.local`, `.env.production` files
- Identifies key type (AWS, GCP, Azure, Stripe, generic) using pattern matching
- Reports file path, line number, key type, and a redacted preview
- Supports custom scan paths via configuration
- Never outputs full secret values; always redacts

#### FR-3: Unified Key Inventory
Provides a consolidated view of all discovered keys across providers and local files.

**Acceptance Criteria:**
- Displays key ID, provider, owner, creation date, last used, age in days, and rotation status
- Supports filtering by provider, owner, age, and status
- Supports output formats: table (default), JSON, CSV
- Marks keys as "overdue" based on configurable rotation policy (default: 90 days)

### Theme: Key Rotation

#### FR-4: Provider-Native Key Rotation
Rotates API keys through the provider's native API, creating a new key and optionally deactivating the old one.

**Acceptance Criteria:**
- Supports rotation for AWS IAM access keys
- Supports rotation for GCP service account keys
- Creates new key, outputs new credentials, and optionally deactivates old key
- Provides a `--dry-run` flag that shows what would happen without making changes
- Logs rotation event with timestamp, old key ID (redacted), new key ID, and operator

#### FR-5: Rotation Policy Configuration
Allows teams to define rotation policies per provider, key type, or environment.

**Acceptance Criteria:**
- Configuration file (YAML) defines rotation intervals per provider or key pattern
- Default rotation interval is 90 days
- Supports overrides per key using key ID or naming pattern
- `keyvault policy check` command reports compliance status against defined policies

### Theme: Monitoring & Alerts

#### FR-6: Age-Based Alerts
Alerts when keys approach or exceed their rotation deadline.

**Acceptance Criteria:**
- `keyvault check` command reports keys approaching rotation deadline (configurable warning threshold, default: 14 days before due)
- `keyvault check` exits with non-zero exit code when overdue keys exist (for CI/CD integration)
- Supports webhook notifications (Slack, PagerDuty, generic HTTP POST)
- Alert payload includes key ID, provider, age, policy, and owner

#### FR-7: Audit Log
Maintains a local audit log of all key operations performed through KeyVault CLI.

**Acceptance Criteria:**
- Logs all rotation, deactivation, and deletion operations
- Each log entry includes timestamp, operation, key ID (redacted), provider, operator, and result
- Log is stored locally in `~/.keyvault/audit.log`
- Supports export to JSON for compliance evidence

## 4. Non-Functional Requirements

### Performance
- Key discovery across 3 providers must complete within 30 seconds for accounts with up to 500 keys
- Local filesystem scan must complete within 5 seconds for typical developer machines
- CLI startup time must be under 500ms

### Security
- Never stores or caches full secret values; only metadata (key IDs, creation dates, etc.)
- All provider API calls use existing credential chains (environment variables, credential files, instance profiles)
- Audit log entries never contain secret values
- Supports MFA-protected provider sessions where required

### Compatibility
- Runs on macOS, Linux, and Windows (via WSL2)
- Distributed as a single static binary (no runtime dependencies)
- Supports installation via Homebrew, apt, and direct download

### Accessibility
- All CLI output is screen-reader compatible (proper text structure, no decoration-only characters)
- Color output is disabled when NO_COLOR environment variable is set or stdout is not a TTY
- All commands support `--json` output for programmatic consumption

## 5. Out of Scope

- **Secret storage/vault functionality** -- KeyVault CLI is an audit and lifecycle tool, not a secrets manager. It does not store secrets. Use HashiCorp Vault, AWS Secrets Manager, etc. for storage.
- **Application-level secret injection** -- KeyVault CLI does not inject secrets into running applications. Use existing tools (dotenv, chamber, etc.) for that.
- **Kubernetes secrets management** -- Not in MVP scope. May be added in future versions.
- **GUI or web dashboard** -- CLI-first approach. A web UI may be considered in the future.
- **Custom provider plugins** -- MVP supports AWS, GCP, Azure only. Plugin architecture for custom providers is future work.

## 6. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to full key audit | < 2 minutes (down from 4+ hours manual) | User testing |
| Key rotation compliance | 95% of keys within policy | `keyvault check` CI integration |
| Adoption | 500 GitHub stars, 100 active installations within 6 months | GitHub analytics, Homebrew stats |
| Incident reduction | 50% fewer key-related incidents within 6 months of adoption | User surveys |

## 7. Assumptions & Constraints

### Assumptions
- Users have appropriate IAM permissions to list and rotate keys in their cloud accounts
- Users are comfortable with CLI tools and YAML configuration
- Provider APIs for key management are stable and well-documented

### Constraints
- Initial release targets AWS, GCP, and Azure only
- Single-developer project with limited time; MVP must be achievable in 8 weeks
- Must be open source (MIT license) to encourage adoption
- Binary size should be under 50MB for reasonable download times

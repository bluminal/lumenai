# Cross-Harness Compatibility Testing Plan

## Objective

Prove that a single Synthex source distribution mechanically works in every
supported coding-agent harness without evaluating the quality of model output.
The suite must verify that each harness can:

1. install Synthex in a clean environment;
2. discover every expected command and specialist entrypoint; and
3. load and use each entrypoint in an agent session.

The suite must never read from or write to a developer's real Claude Code,
Codex, OpenCode, Gemini, or other harness installation.

## Implementation Status

- Phase 1 is complete: the shared contract, version lock, isolation guard, and
  container-only runner are implemented.
- Phase 2 is complete for the initial matrix: Claude Code, Codex, Gemini, and
  OpenCode all pass offline install, complete inventory, reference integrity,
  and uninstall checks for the current 46 entrypoints.
- Phase 3 emulated activation is complete for the initial matrix. Claude Code,
  Codex, Gemini, and OpenCode each explicitly load all 46 entrypoints through a
  loopback provider, for 184 nonce-backed activation checks. The remaining
  Phase 3 item is a small authenticated canary for emulator-drift detection.
  Its scheduled, credential-gated workflow and two-probe adapters are
  implemented; it awaits dedicated provider credentials and its first run.
- CI integration for the pull-request profiles is complete: offline and
  emulated activation run as isolated four-harness matrix jobs, use Buildx layer
  caching, and upload per-harness NDJSON reports.
- The release pipeline validates the staged, version-bumped Synthex artifact
  through the stable offline and emulated-activation matrices before it can
  commit, tag, or publish that release.
- Phase 4 foundations are complete: adapter capabilities and required profiles
  are centralized, an admission guide covers skills-capable harnesses, and a
  weekly latest-version drift matrix is isolated from the pinned pull-request
  baseline. The current pinned versions are also the formally declared oldest
  support versions until an earlier version is deliberately adopted.

## Scope

### In scope

- Claude Code, Codex CLI, OpenCode, and Gemini CLI as the initial matrix.
- Additional harnesses through adapters that implement the same test contract.
- Native plugin installation where a harness supports it.
- Agent Skills installation where a harness supports skills but not the full
  plugin format.
- Deterministic inventory and reference-integrity checks.
- Minimal authenticated probes that establish that a skill can be loaded.
- Pinned harness versions and isolated, reproducible execution.

### Out of scope

- Judging whether a workflow produces a correct or high-quality answer.
- Comparing model responses across providers.
- Exercising every branch inside a Synthex workflow.
- Reusing a developer's login session, API keys, configuration, cache, or
  installed plugins.

## Safety Boundary

Every harness runs in its own disposable Linux container. The host runner is
allowed to invoke only Docker or Podman. It must never invoke `claude`, `codex`,
`opencode`, or `gemini` from the host PATH.

At runtime, a container receives only:

- the staged Synthex plugin mounted read-only at `/fixture/synthex`;
- a tmpfs home directory at `/home/synthex-test`;
- a tmpfs project workspace at `/workspace`; and
- explicitly allowlisted test credentials in the authenticated profile.

The container runs as an unprivileged user with:

- no Docker socket;
- no host home, SSH directory, Git configuration, or harness configuration;
- a read-only root filesystem;
- all Linux capabilities dropped;
- `no-new-privileges` enabled; and
- networking disabled for offline phases.

An in-container guard fails before a harness starts if these invariants are not
present. Each adapter image installs its own pinned copy of its harness.

## Source-of-Truth Contract

The Claude plugin manifest currently enumerates Synthex's canonical commands
and agents. The compatibility test derives the expected entrypoint IDs directly
from that manifest and verifies that the generated `skills/*/SKILL.md` tree is
an exact match. This avoids a second hand-maintained list.

For every manifest entry, the oracle records:

- ID: the Markdown filename without `.md`;
- kind: `command` or `agent`;
- canonical source path; and
- generated skill path.

Duplicate IDs across commands and agents are an error because skill-based
harnesses expose a flat skill namespace.

## Adapter Contract

Each harness adapter produces the same newline-delimited JSON events:

| Phase | Required evidence |
|---|---|
| `environment` | Harness name/version and isolation guard result |
| `install` | Installation method, destination, and success |
| `inventory` | Discovered entrypoint IDs from the harness itself |
| `references` | Every generated skill can resolve its canonical source |
| `activate` | Requested entrypoint ID and proof that its body was loaded |
| `uninstall` | Harness no longer reports Synthex entrypoints |

Adapters may normalize native names such as `/synthex:review-code` to the
portable ID `review-code`, but raw discovery output is retained for diagnosis.

## Harness Matrix

| Harness | Installation under test | Inventory mechanism | Activation probe |
|---|---|---|---|
| Claude Code | local marketplace plus plugin install | plugin list/details and command/agent metadata | invoke a namespaced command or agent with a nonce-bearing probe overlay |
| Codex CLI | local marketplace plus plugin install | structured skill listing through the supported Codex interface | invoke `$<skill>` and require the probe nonce |
| OpenCode | copy the complete bundle into project `.agents` compatibility layout | `opencode debug skill` | request the skill tool for the exact ID and require the probe nonce |
| Gemini CLI | workspace skill installation | `gemini skills list` | invoke the installed skill and require the probe nonce |

The probe nonce is injected into a temporary copy of the generated entrypoint,
not into canonical prompts. A successful response need only echo the nonce. It
does not need to complete or correctly answer the workflow.

## Test Profiles

### Offline profile: every pull request

Runs with `--network none` after images have been built.

1. Validate the manifest and generated skill tree.
2. Start a clean container with empty tmpfs home and workspace.
3. Verify the container isolation contract.
4. Install the staged plugin using the adapter's supported mechanism.
5. Ask the harness to enumerate installed commands/skills.
6. Compare normalized IDs with the manifest-derived oracle.
7. Verify every generated entrypoint resolves its canonical source.
8. Uninstall and verify the inventory is clean.

### Emulated activation profile: every pull request

Runs with runtime networking disabled and a loopback-only fake model provider.

1. Perform the complete offline profile first.
2. Overlay a unique probe nonce on a temporary installed entrypoint.
3. Point the harness at a local protocol emulator, or use the harness's built-in
   fake-response facility when one is available.
4. Explicitly invoke the entrypoint through the harness.
5. Inspect the request received by the emulator and pass only if the resolved
   skill instructions contain the nonce.
6. Repeat for every entrypoint, then discard the container.

This checks the harness-to-skill loading boundary directly. The fake model's
response is canned and is not graded.

The implemented adapters exercise each harness's native boundary:

- Claude Code runs plugin commands as `/synthex:<id>` and plugin agents with
  `--agent synthex:<id>` against an Anthropic Messages emulator.
- Codex passes explicit `skill` input items through app-server and captures the
  resulting Responses API request.
- Gemini's emulator returns `activate_skill` calls and checks the follow-up
  Gemini request after local tool execution.
- OpenCode's emulator returns `skill` calls and checks the follow-up Responses
  API request after local tool execution.

### Authenticated canary: nightly and before release

Runs with outbound networking and dedicated low-privilege test credentials.

1. Perform the complete offline profile first.
2. Run a small representative subset of the nonce probes against the real
   provider as a canary for protocol-emulator drift.
3. Discard the entire container after each harness run.

The implementation runs only from the trusted `main` branch, verifies the
offline lifecycle first, and then uses two representative probe overlays
(`review-code` and `code-reviewer`). Missing dedicated credentials skip that
harness with a visible workflow warning rather than falling back to a developer
login or a broad environment pass-through.

No developer login state is mounted. Provider keys are supplied individually,
never through a broad host environment pass-through, and are redacted from
captured output.

## Coverage Strategy

- Pull requests: full installation and inventory matrix, reference checks, and
  emulated activation for all entrypoints.
- Nightly: the pull-request matrix plus a small authenticated activation canary.
- Release: the nightly matrix against the exact release artifact and locked
  stable harness versions. **Complete:** the release workflow runs the stable
  offline and emulated-activation matrices after staging version and changelog
  changes, but before commit/tag/publish.
- Compatibility canary: optional scheduled run against latest harness versions;
  failures report drift but do not silently change the locked matrix.

## Version Policy

`tests/compat/versions.lock.json` pins the container base and every harness
version. Dependabot or a scheduled compatibility PR may update those pins. A
version update is reviewed like a code change and must pass the complete matrix.

The stable matrix should eventually include the oldest supported harness
version as well as the current pinned version when their plugin or skill
interfaces differ.

## Failure Reporting

Every run emits normalized JSON containing:

- harness and version;
- phase and elapsed time;
- expected, discovered, missing, and unexpected IDs;
- exit code and a bounded raw-output excerpt; and
- whether the run was offline or authenticated.

Secrets and authorization headers are never included. CI uploads these reports
as artifacts so a discovery regression can be distinguished from an install or
activation regression.

## Implementation Phases

### Phase 1 — Safe vertical slice

- Add the plan, version lock, manifest-derived contract, and isolation guard.
- Add a container-only host runner that rejects unsupported engines/harnesses.
- Implement OpenCode offline installation, discovery, and reference checks.
- Add schema tests for the shared contract and runner safety properties.

Exit criteria: one command runs the OpenCode offline adapter without touching
the host's OpenCode installation, and all 46 current entries are discovered.

### Phase 2 — Complete offline matrix

- Add Claude Code, Codex, and Gemini images and adapters.
- Implement native install, inventory, and uninstall for each.
- Normalize their inventories into the shared result format.
- Add CI image caching and offline matrix jobs.

  **Complete:** the Agent Tests workflow runs the four-harness matrix with
  Buildx GHA caching and uploads per-harness reports.

Exit criteria: every harness passes clean install, complete inventory, reference
integrity, and clean uninstall from an empty container.

### Phase 3 — Mechanical activation

- Add the temporary nonce overlay builder. **Complete.**
- Add loopback provider emulators and all-entrypoint probes for pull requests.
  **Complete for the initial four-harness matrix.**
- Add representative authenticated nightly/release probes with timeouts and
  cost ceilings to detect emulator drift.
- Add secret redaction and machine-readable reports.

  **Implemented, pending credentials:** the nightly/manual trusted-main
  workflow isolates each harness and its one dedicated credential, probes two
  representative entrypoints, limits jobs to 12 minutes, applies Claude's
  configurable dollar cap and OpenCode's output-token cap, and uploads
  redacted NDJSON reports. Configure dedicated provider keys and confirm the
  first scheduled run before treating the canary as operational.

  **Complete for CI reporting:** the runner persists per-harness NDJSON reports
  and never forwards credentials in the offline or emulated profiles. The
  authenticated profile redacts its allowlisted credential before console or
  artifact output.

Emulated exit criteria are met: every expected entrypoint can be explicitly
loaded by every supported harness; response quality remains deliberately
ungraded. Persisted reporting and the authenticated-canary implementation are
complete; configuring dedicated credentials and confirming the first real run
remain operational prerequisites.

### Phase 4 — Extensibility and compatibility policy

- Extract adapter metadata and reusable assertions. **Complete:**
  `lib/harnesses.mjs` declares each adapter's installation, inventory,
  activation, required profiles, and credential-gated profile.
- Document how to add a skill-capable harness. **Complete:**
  `tests/compat/ADDING_HARNESS.md` defines admission, isolation, and validation
  requirements.
- Add latest-version canaries and oldest-supported-version coverage.
  **Complete for the initial policy:** weekly latest-tag offline/activation
  drift jobs are implemented, and `support-policy.json` records the current
  pin as the oldest supported version until a prior version is explicitly
  adopted.
- Decide whether failures in compatibility modes unsupported by a harness are
  hard failures or documented capability gaps. **Complete:** required profiles
  are hard failures for a supported harness; optional unavailable capabilities
  must be declared as documented gaps and cannot silently skip a required
  profile.

## Risks and Decisions

- The first release that ships the shared cross-harness distribution is an
  explicit major bump. `.release-intent.json` raises that release to major only
  while its change remains in the unreleased commit range; subsequent releases
  resume normal Conventional Commit versioning.
- Native plugin formats are not standardized. The common denominator is Agent
  Skills, while adapters preserve native install testing where available.
- A harness may discover `SKILL.md` but resolve relative resources from a
  different base. Reference-integrity and activation phases both cover this.
- Harness inventory output may be human-oriented. Prefer structured APIs when
  available; keep parsers version-specific and pinned.
- Authentication is the greatest isolation risk. Only dedicated test keys are
  supported; mounting host session databases is prohibited.
- Provider protocol emulators can drift from real APIs. Keep their responses
  minimal, test only request construction, and retain a small authenticated
  canary rather than making paid model output the main compatibility signal.
- Harness auto-update behavior can make tests nondeterministic. Images install
  exact versions and runtime networking is disabled in the offline profile.

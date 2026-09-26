# Harness compatibility tests

These tests run coding-agent CLIs only inside disposable containers. They do not
invoke or mount the host's Claude Code, Codex, OpenCode, or Gemini installation.

## Run the compatibility profiles

From `tests/`:

```bash
npm run test:compat:offline
```

Run mechanical activation for every installed entrypoint in every harness:

```bash
npm run test:compat:activation
```

Force a clean harness image build:

```bash
npm run test:compat:offline -- --rebuild
```

Docker is used by default. To use Podman:

```bash
SYNTHEX_CONTAINER_ENGINE=podman npm run test:compat:offline
```

The runner mounts only `plugins/synthex` and mounts it read-only. Container home,
workspace, and temporary directories are tmpfs volumes discarded when the run
exits.
Image builds receive only `tests/compat` as their build context, so unrelated
repository files are not sent to the container engine. Harness versions are
pinned in `versions.lock.json`.

The default command runs the Claude Code, Codex, Gemini, and OpenCode offline
adapters. To run only one harness, invoke the runner directly from `tests/`:

```bash
node compat/scripts/run-suite.mjs --harness codex
node compat/scripts/run-suite.mjs --profile activation --harness codex
```

## Support policy and version lanes

`versions.lock.json` is the pinned stable matrix used by pull requests.
`support-policy.json` records the oldest formally supported version for every
harness. At present, each oldest version intentionally equals its stable pin:
Synthex does not claim backwards compatibility until a prior version is added
explicitly.

Run the recorded oldest lane locally with:

```bash
npm run test:compat:oldest
```

The weekly `Latest Harness Compatibility` workflow uses npm's `latest` tag in
an isolated offline-plus-emulated-activation matrix. It reports upstream drift
but never writes a new version into the lockfile. Run it locally with:

```bash
npm run test:compat:latest
```

See [ADDING_HARNESS.md](ADDING_HARNESS.md) for the admission contract and the
steps to add another skills-capable coding agent.

The offline matrix covers clean installation, native harness inventory, local
reference integrity, and uninstall. The activation matrix creates a disposable
copy of the plugin with a unique nonce in every entrypoint, invokes each through
the harness's native command, agent, or skill interface, and checks that the
nonce reaches a loopback-only fake model provider. The canned response is not
graded.

The runtime still uses `--network none`: Linux loopback remains available inside
the container, but the harness cannot reach a real provider. Test-only API keys
are created inside the container, and no host harness configuration, login
session, or credential is mounted or forwarded.

For CI, pass `--report-dir` (or set `SYNTHEX_COMPAT_REPORT_DIR`) to persist the
newline-delimited JSON result for each harness. The GitHub Actions compatibility
jobs use this mode and upload the report as an artifact, including a runner-level
event when image construction or container startup fails. CI also sets
`SYNTHEX_COMPAT_BUILD_CACHE=gha` so Docker Buildx reuses the pinned harness image
layers between runs.

OpenCode's activation image includes `ripgrep` because its native `skill` tool
uses `rg` to resolve skill files. Harness versions remain pinned in
`versions.lock.json`.

## Authenticated canary

`.github/workflows/authenticated-compatibility-canary.yml` runs nightly and can
be dispatched manually from `main`. It first runs the selected harness's
offline lifecycle profile, then invokes only two representative temporary
probes (`review-code` and `code-reviewer`) against a real provider. The probes
must return their injected token; their workflow outcomes are not evaluated.

Codex and OpenCode additionally run two tiny, one-turn tool-BEHAVIOR probes
(Task 23; NFR-HM4, FR-HM7, FR-HM12; D22) that only a real provider can
exercise — the loopback offline/activation scenarios only assert
request-side facts, never emitting an actual tool call:

- **Workflow-step probe** (`workflow-step-gate`): a Synthex-style
  tool-presence gate naming a tool (`Workflow`) that exists on neither
  host. Passes when the host attempts the nonexistent tool at most once
  (FR-HM12's skip-once rule: no retry).
- **No-injected-context probe** (`no-injected-context`): run from a
  throwaway project whose only instruction files are `GEMINI.md` and
  `.hermes.md` — files neither host auto-injects (Codex always injects
  `AGENTS.md`, so a project with no host-injected file at all isn't
  reachable there) — with the canonical FR-HM7 sentence. Passes when the
  model issues a Read of one of those files rather than claiming the
  context was already injected.

Both probes' prompt builders, per-host "attempt"/"read" definitions, and
assertion helpers live in `tests/compat/lib/tool-probes.mjs`; see that
module's header comment for the exact per-host definitions and
`tests/schemas/compat-canary-tool-probes.test.ts` /
`tests/fixtures/compat-canary/` for their Layer 1 fixture coverage.

Configure these repository secrets only with dedicated, low-privilege keys:

- `SYNTHEX_COMPAT_CLAUDE_API_KEY`
- `SYNTHEX_COMPAT_CODEX_API_KEY`
- `SYNTHEX_COMPAT_GEMINI_API_KEY`
- `SYNTHEX_COMPAT_OPENCODE_API_KEY`

Each secret is scoped to its one canary step, is passed into one disposable
container as `SYNTHEX_COMPAT_CANARY_CREDENTIAL`, and is never mounted from a
developer machine or written into artifacts. Captured container output is
redacted before it is printed or uploaded. Missing secrets skip only that
harness and produce a workflow warning.

Optional repository variables `SYNTHEX_COMPAT_<HARNESS>_MODEL` select a
specific canary model. The Claude canary additionally honors
`SYNTHEX_COMPAT_CANARY_MAX_BUDGET_USD` (default `0.10`) when provided to the
container runner. OpenCode caps output at 128 tokens. Codex and Gemini do not
offer a compatible per-request dollar ceiling through the exercised interfaces,
so their dedicated test projects must have provider-side spend or quota caps;
the runner additionally limits every harness to the same two representative
probes, plus (Codex and OpenCode only) the two tiny, one-turn tool-behavior
probes above. Keep provider keys and model choices outside the repository.

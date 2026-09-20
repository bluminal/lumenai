# Adding a skills-capable harness

The compatibility suite supports any coding-agent harness that can load Agent
Skills or a native plugin that exposes the generated `skills/*/SKILL.md` tree.
An adapter proves mechanics only: installation, discovery, reference handling,
and prompt loading. It does not grade model output.

## Admission policy

A harness becomes supported only when it implements both required profiles:

| Profile | Required proof |
|---|---|
| `offline` | clean install, complete inventory, reference integrity, uninstall |
| `activation` | every manifest-derived entrypoint reaches a loopback provider with its unique nonce |

`canary` is credential-gated. It is implemented after the required profiles
and runs a small, real-provider subset only from trusted `main`.

If a harness lacks a native plugin feature, use its Agent Skills mechanism and
record that capability in `lib/harnesses.mjs`. It is a documented capability
gap, not a reason to silently skip a required profile. A harness that cannot
meet either required profile is not added to the supported matrix.

## Adapter checklist

1. Add the pinned package version and package name to `versions.lock.json`.
   Never use a floating version in the pull-request matrix.
2. Add metadata to `lib/harnesses.mjs`:
   installation mode, native inventory mechanism, activation boundary,
   required profiles, and the dedicated canary credential variable.
3. Add `harnesses/<id>/Dockerfile`. It must install only the pinned harness,
   copy the compatibility fixture, create UID/GID `10001`, and end with
   `USER 10001:10001`.
4. Add `<id>-offline.mjs`. Begin with `assertIsolatedEnvironment()`, emit the
   shared NDJSON phases, derive entries with `readExpectedEntrypoints()`, and
   complete install, inventory, references, and uninstall checks.
5. Add `<id>-activation.mjs`. Build a temporary overlay with
   `createProbeOverlay()`, invoke every entrypoint through the native skill or
   plugin boundary, and prove each nonce reaches the loopback provider.
6. Add `<id>-canary.mjs` only after the two required profiles pass. Use
   `selectRepresentativeProbes()`, `canaryCredential()`, and
   `assertCanaryToken()`; never write the credential to a project file or
   report.
7. Add the harness to the pull-request matrix in `agent-tests.yml` and, if a
   dedicated low-privilege credential is available, the authenticated canary
   workflow.
8. Extend `schemas/cross-harness-compat.test.ts`, then run the contract,
   offline, and activation profiles for the new harness.

## Isolation requirements

The host runner may call only Docker or Podman. It must not invoke the harness
from the developer's PATH. Runtime containers must preserve the existing
read-only root, non-root user, dropped capabilities, `no-new-privileges`, tmpfs
home/workspace/temp directories, and read-only fixture mount.

`offline` and `activation` run with `--network none`. A canary may use bridge
networking only after the offline lifecycle has passed, and it receives only
the generic `SYNTHEX_COMPAT_CANARY_CREDENTIAL` environment variable supplied by
the runner's harness-specific allowlist.

## Version lanes

The locked pull-request matrix is the current support baseline. A future
oldest-supported lane must name an actual supported version in the policy; do
not invent a historical version just to fill the matrix. Latest-version runs
are drift detectors and must never rewrite `versions.lock.json`.

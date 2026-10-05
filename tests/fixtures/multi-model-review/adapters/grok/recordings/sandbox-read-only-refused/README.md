# Sandbox refusal: `--sandbox read-only` on macOS

**Purpose:** U3, which asks whether `--sandbox read-only` applies with HOME in `/tmp`.

**Argv:** the full D25 set, including `--sandbox read-only`.

**Observed:** exit 1 within 1 s (0 s by the harness clock), before any prompt was sent. stderr:

```
warning: sandbox could not be applied: socket deny resolution failed: could not resolve runtime-socket deny path /var/run/docker.sock: endpoint is a symlink
error: could not apply the 'read-only' sandbox profile; see the warning above for the cause. Refusing to start with its protections missing.
```

On this machine, `/var/run/docker.sock` is OrbStack's symlink. The operator reports that `--sandbox strict` refused with the same cause; that run was not saved. This is fail-closed behaviour, although Grok's `18-sandbox.md` says a built-in profile that fails to apply warns and continues.

**stdout was not preserved:** the harness labelled this run `G2` and overwrote its stdout when G2 was rerun without `--sandbox`. A runner must not depend on stdout for this case.

**Expected runner mapping:** this is the proposed fallback, still a decision for the user.
- On exit ≠ 0 with stderr containing `runtime-socket deny path /var/run/docker.sock`, `endpoint is a symlink` and `Refusing to start with its protections missing`, retry once without `--sandbox` (and with `GROK_SANDBOX` unset). Record a warning in the envelope's `error_message` and the stderr log.
- Any other sandbox refusal gives `cli_failed`. The runner never drops `--sandbox` silently.

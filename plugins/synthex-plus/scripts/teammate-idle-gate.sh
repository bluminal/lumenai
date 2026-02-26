#!/usr/bin/env bash
# teammate-idle-gate.sh — Work assignment for TeammateIdle hook events
#
# Triggered when a teammate has no active tasks and becomes idle.
# This shim is the entry point; behavioral logic is in hooks/teammate-idle-gate.md.
#
# Exit codes:
#   0 = allow idle (no matching work available, teammate can be dismissed)
#   2 = keep working (pending task assigned, teammate should continue)
#
# The Agent Teams hook system passes teammate metadata via environment variables.
# This shim delegates to the prompt-mediated work assignment system — the actual
# task matching and assignment happen in the LLM layer, guided by
# hooks/teammate-idle-gate.md.

# Default: allow idle. The LLM-driven assignment system overrides this
# by returning exit code 2 when a pending task matches the idle teammate's role.
exit 0

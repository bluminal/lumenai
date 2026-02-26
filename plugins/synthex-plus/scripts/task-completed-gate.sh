#!/usr/bin/env bash
# task-completed-gate.sh — Review gate for TaskCompleted hook events
#
# Triggered when a teammate marks a task as completed on the shared task list.
# This shim is the entry point; behavioral logic is in hooks/task-completed-gate.md.
#
# Exit codes:
#   0 = allow completion (PASS/WARN verdict from reviewers)
#   2 = block completion (FAIL verdict — task reopened with findings)
#
# The Agent Teams hook system passes task metadata via environment variables.
# This shim delegates to the prompt-mediated review system — the actual review
# routing (code/frontend/infrastructure) and verdict evaluation happen in the
# LLM layer, guided by hooks/task-completed-gate.md.

# Default: allow completion. The LLM-driven review gate overrides this
# by returning exit code 2 when a reviewer produces a FAIL verdict.
exit 0

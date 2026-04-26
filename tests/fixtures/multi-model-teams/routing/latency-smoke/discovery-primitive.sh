#!/usr/bin/env bash
# discovery-primitive.sh — FR-MMT15 inline-discovery filter primitive (reference implementation).
#
# Usage:
#   ./discovery-primitive.sh <index.json> <required-reviewers> <matching-mode> <ttl-minutes>
#
# Arguments:
#   $1  Path to index.json
#   $2  Required reviewer set, comma-separated (e.g. "code-reviewer,security-reviewer")
#   $3  Matching mode: "covers" | "exact"
#   $4  TTL minutes (integer) — pools whose last_active_at is older than this are skipped
#
# Output (stdout): one JSON object matching the InlineDiscoveryOutput schema:
#   {
#     "routing_decision": "routed-to-pool" | "fell-back-no-pool" | "fell-back-roster-mismatch"
#                       | "fell-back-pool-draining" | "fell-back-pool-stale"
#                       | "fell-back-timeout" | "skipped-routing-mode-explicit",
#     "pool_name":        string   (present when routed-to-pool / fell-back-pool-draining / fell-back-pool-stale),
#     "multi_model":      boolean  (present when routed-to-pool),
#     "match_rationale":  string   (present when routed-to-pool)
#   }
#
# Discovery procedure (FR-MMT15 §1.3, routing.md):
#   Step 2: Read index.json; skip pools where pool_state is draining/stopping or TTL expired.
#   Step 3: Apply matching_mode (covers = superset, exact = equal).
#   Step 4: Pick first match by name sort order.
#   Step 5: Emit routing decision.
#
# This script is intentionally minimal — no features beyond filter + first-match-pick + emit.
# It is the production-shape primitive that Tasks 54/57 will adapt for /review-code and
# /performance-audit. Do NOT add LLM calls, sub-agent invocations, or cleanup logic here.
#
# Dependencies: jq (preferred) or python3 (fallback).
# Both paths produce identical output.

set -euo pipefail

INDEX_PATH="${1:?Usage: $0 <index.json> <required-reviewers> <matching-mode> <ttl-minutes>}"
REQUIRED_RAW="${2:?Missing required-reviewers argument}"
MATCHING_MODE="${3:?Missing matching-mode argument (covers|exact)}"
TTL_MINUTES="${4:?Missing ttl-minutes argument}"

# Validate matching mode
if [[ "${MATCHING_MODE}" != "covers" && "${MATCHING_MODE}" != "exact" ]]; then
  echo '{"routing_decision":"fell-back-no-pool"}' >&2
  echo "Error: matching-mode must be 'covers' or 'exact', got: ${MATCHING_MODE}" >&2
  exit 1
fi

# Validate index file exists
if [[ ! -f "${INDEX_PATH}" ]]; then
  echo '{"routing_decision":"fell-back-no-pool"}'
  exit 0
fi

# ── Choose implementation: jq or python3 fallback ──────────────────────────────

if command -v jq &>/dev/null; then
  # ── jq implementation ────────────────────────────────────────────────────────
  #
  # Pass shell variables into jq via --arg / --argjson to avoid injection.
  # TTL check: now() - strptime("%Y-%m-%dT%H:%M:%SZ"; last_active_at) < ttl_minutes * 60

  jq -c \
    --arg required_raw "${REQUIRED_RAW}" \
    --arg mode "${MATCHING_MODE}" \
    --argjson ttl_sec "$((TTL_MINUTES * 60))" \
    '
    # Build required set array from comma-separated arg
    ($required_raw | split(",") | map(ltrimstr(" ") | rtrimstr(" ")) | sort) as $required |

    # Filter eligible pools (Step 2):
    #   - standing: true
    #   - pool_state not draining or stopping
    #   - TTL not expired: now - last_active_at_epoch < ttl_sec
    [
      .pools[]
      | select(.standing == true)
      | select(.pool_state != "draining" and .pool_state != "stopping")
      | select(
          (now - (.last_active_at | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime)) < $ttl_sec
        )
    ] as $eligible |

    # Apply matching mode (Step 3) and sort by name (Step 4)
    [
      $eligible[]
      | (.reviewers | sort) as $pool_roster
      | if $mode == "covers" then
          # covers: pool roster must be a superset of required set
          # every element of $required must appear in $pool_roster
          select( ($required | all(. as $r | $pool_roster | any(. == $r))) )
        else
          # exact: pool roster must equal required set
          select( $pool_roster == $required )
        end
    ]
    | sort_by(.name)
    | if length > 0 then
        .[0] as $match |
        {
          routing_decision: "routed-to-pool",
          pool_name: $match.name,
          multi_model: false,
          match_rationale: (
            $mode + ": pool [" +
            ($match.reviewers | sort | join(", ")) +
            "] satisfies required [" +
            ($required | join(", ")) +
            "]"
          )
        }
      else
        { routing_decision: "fell-back-no-pool" }
      end
    ' "${INDEX_PATH}"

else
  # ── python3 fallback ─────────────────────────────────────────────────────────
  # Used when jq is not available. Produces identical output.

  python3 - "${INDEX_PATH}" "${REQUIRED_RAW}" "${MATCHING_MODE}" "${TTL_MINUTES}" <<'PYEOF'
import sys
import json
import time

index_path = sys.argv[1]
required_raw = sys.argv[2]
mode = sys.argv[3]
ttl_minutes = int(sys.argv[4])
ttl_sec = ttl_minutes * 60

required = sorted([r.strip() for r in required_raw.split(",")])

with open(index_path) as f:
    data = json.load(f)

now = time.time()

def parse_iso(s):
    # Parse ISO-8601 UTC timestamp without external deps
    import datetime
    dt = datetime.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ")
    return dt.replace(tzinfo=datetime.timezone.utc).timestamp()

eligible = []
for pool in data.get("pools", []):
    if not pool.get("standing", False):
        continue
    if pool.get("pool_state") in ("draining", "stopping"):
        continue
    try:
        last_active = parse_iso(pool["last_active_at"])
    except Exception:
        continue
    if (now - last_active) >= ttl_sec:
        continue
    eligible.append(pool)

matches = []
for pool in eligible:
    roster = sorted(pool.get("reviewers", []))
    if mode == "covers":
        if all(r in roster for r in required):
            matches.append(pool)
    else:  # exact
        if roster == required:
            matches.append(pool)

matches.sort(key=lambda p: p["name"])

if matches:
    m = matches[0]
    rationale = (
        mode + ": pool [" +
        ", ".join(sorted(m.get("reviewers", []))) +
        "] satisfies required [" +
        ", ".join(required) +
        "]"
    )
    result = {
        "routing_decision": "routed-to-pool",
        "pool_name": m["name"],
        "multi_model": False,
        "match_rationale": rationale,
    }
else:
    result = {"routing_decision": "fell-back-no-pool"}

print(json.dumps(result, separators=(",", ":")))
PYEOF

fi

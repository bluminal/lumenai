#!/usr/bin/env bash
# generate-fixture.sh — Write a synthetic 10-pool index.json to the path given as $1.
#
# Usage:
#   ./generate-fixture.sh /path/to/output/index.json
#
# Output: a top-level {"pools": [...]} JSON object with 10 entries conforming to the
# FR-MMT9b index entry schema (pool_lifecycle.md §2).
#
# Roster distribution (chosen to give the filter in discovery-primitive.sh real work):
#   Pools 01–04: code-reviewer, security-reviewer            (4 pools)
#   Pools 05–07: code-reviewer, security-reviewer, design-system-agent  (3 pools)
#   Pools 08–09: performance-engineer                        (2 pools)
#   Pool  10:    code-reviewer                               (1 pool)
#
# All pools are active or idle; last_active_at is recent enough to pass a 60-min TTL.
# pool_state: pools 01-08 = "idle", pools 09-10 = "active"
# (no pool is draining or stopping — they should all pass the basic filter).

set -euo pipefail

OUTPUT_PATH="${1:?Usage: $0 <output-path>}"

NOW_EPOCH=$(date +%s)
# Five minutes ago — well within any reasonable TTL
RECENT=$(date -u -r $((NOW_EPOCH - 300)) "+%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -d "@$((NOW_EPOCH - 300))" "+%Y-%m-%dT%H:%M:%SZ")
# Fifteen minutes ago — also well within 60-min TTL
OLDER=$(date -u -r $((NOW_EPOCH - 900)) "+%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -d "@$((NOW_EPOCH - 900))" "+%Y-%m-%dT%H:%M:%SZ")

cat > "${OUTPUT_PATH}" <<JSON
{
  "pools": [
    {
      "name": "review-pool-01",
      "pool_state": "idle",
      "standing": true,
      "last_active_at": "${RECENT}",
      "ttl_minutes": 120,
      "metadata_dir": "~/.claude/teams/standing/review-pool-01",
      "reviewers": ["code-reviewer", "security-reviewer"]
    },
    {
      "name": "review-pool-02",
      "pool_state": "idle",
      "standing": true,
      "last_active_at": "${OLDER}",
      "ttl_minutes": 120,
      "metadata_dir": "~/.claude/teams/standing/review-pool-02",
      "reviewers": ["code-reviewer", "security-reviewer"]
    },
    {
      "name": "review-pool-03",
      "pool_state": "idle",
      "standing": true,
      "last_active_at": "${RECENT}",
      "ttl_minutes": 60,
      "metadata_dir": "~/.claude/teams/standing/review-pool-03",
      "reviewers": ["code-reviewer", "security-reviewer"]
    },
    {
      "name": "review-pool-04",
      "pool_state": "idle",
      "standing": true,
      "last_active_at": "${OLDER}",
      "ttl_minutes": 60,
      "metadata_dir": "~/.claude/teams/standing/review-pool-04",
      "reviewers": ["code-reviewer", "security-reviewer"]
    },
    {
      "name": "review-pool-05",
      "pool_state": "idle",
      "standing": true,
      "last_active_at": "${RECENT}",
      "ttl_minutes": 120,
      "metadata_dir": "~/.claude/teams/standing/review-pool-05",
      "reviewers": ["code-reviewer", "security-reviewer", "design-system-agent"]
    },
    {
      "name": "review-pool-06",
      "pool_state": "idle",
      "standing": true,
      "last_active_at": "${OLDER}",
      "ttl_minutes": 120,
      "metadata_dir": "~/.claude/teams/standing/review-pool-06",
      "reviewers": ["code-reviewer", "security-reviewer", "design-system-agent"]
    },
    {
      "name": "review-pool-07",
      "pool_state": "idle",
      "standing": true,
      "last_active_at": "${RECENT}",
      "ttl_minutes": 60,
      "metadata_dir": "~/.claude/teams/standing/review-pool-07",
      "reviewers": ["code-reviewer", "security-reviewer", "design-system-agent"]
    },
    {
      "name": "review-pool-08",
      "pool_state": "idle",
      "standing": true,
      "last_active_at": "${RECENT}",
      "ttl_minutes": 120,
      "metadata_dir": "~/.claude/teams/standing/review-pool-08",
      "reviewers": ["performance-engineer"]
    },
    {
      "name": "review-pool-09",
      "pool_state": "active",
      "standing": true,
      "last_active_at": "${RECENT}",
      "ttl_minutes": 120,
      "metadata_dir": "~/.claude/teams/standing/review-pool-09",
      "reviewers": ["performance-engineer"]
    },
    {
      "name": "review-pool-10",
      "pool_state": "active",
      "standing": true,
      "last_active_at": "${OLDER}",
      "ttl_minutes": 60,
      "metadata_dir": "~/.claude/teams/standing/review-pool-10",
      "reviewers": ["code-reviewer"]
    }
  ]
}
JSON

echo "Wrote synthetic 10-pool index to: ${OUTPUT_PATH}"

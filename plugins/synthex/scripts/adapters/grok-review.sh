#!/usr/bin/env bash
# grok-review.sh — multi-model-review runner for the xAI Grok Build CLI
# (multi-model-review Task 68; D25, D26, D28, D29, D31, D33-D36).
#
# grok-review-prompter.md and the orchestrator's depth-1 direct-CLI path
# both run this script, so the isolation below never depends on an LLM
# rebuilding it from prose (D28). It does FR-MR8 responsibilities 1-8
# itself and prints the FR-MR9 envelope that scripts/validate-findings
# builds.
#
# Usage:
#   grok-review.sh --input <envelope.json> [--envelope-out <path>]
#     <envelope.json> is the FR-MR9 input envelope: {command,
#     context_bundle, config: {model, family, raw_output_path,
#     judge_mode_prompt?, allow_api_key_billing?}}. Prints the envelope on
#     stdout and, with --envelope-out, also writes it there atomically so a
#     depth-1 host can background this script and poll for the file.
#   grok-review.sh --auth-check
#     Runs `grok models` under the same isolation and reads its first line.
#     The probe is bounded by min(30 s, the review budget below) in both
#     modes; in --input mode it spends that budget, which starts before it.
#
# Text-only isolation (D25), applied to every grok call:
#   - cwd is a fresh `mktemp -d /tmp/synthex-grok.XXXXXX` dir (canonicalised,
#     guarded, removed by an EXIT trap): untrusted, so project hooks, MCP,
#     rules and skills never load;
#   - HOME=<scratch>/home; GROK_HOME stays the real (canonical) grok home,
#     which holds the grok.com session; GROK_DISABLE_AUTOUPDATER=1;
#     GROK_MEMORY=0 (the process-wide force-disable: no memory index is
#     injected and nothing is written to the user's memory store); every
#     GROK_CLAUDE_*_ENABLED and GROK_CURSOR_*_ENABLED is 0; GROK_CONFIG,
#     GROK_CONFIG_PATH, GROK_FOLDER_TRUST and GROK_SANDBOX are unset;
#   - XAI_API_KEY and its alias GROK_CODE_XAI_API_KEY are unset unless
#     multi_model_review.per_reviewer.grok-review-prompter.allow_api_key_billing
#     (or the envelope's config.allow_api_key_billing) is true (D26);
#   - argv: --prompt-file, --output-format json, --json-schema <strict
#     findings schema> (D33), --disallowed-tools <every built-in>,
#     --deny '*', --deny 'mcp__*', --permission-mode dontAsk,
#     --sandbox read-only (D34), --no-subagents, --disable-web-search,
#     --max-turns 3 (D36), -m only when config.model is set, --rules
#     <judge_mode_prompt> when present (D31). Never an approval bypass.
#
# D34: the only case that drops --sandbox is grok's exact refusal to start
# because a runtime-socket deny path is a symlink (OrbStack/Docker Desktop
# docker.sock). It is retried once without --sandbox, with a warning on
# stderr and in the raw stderr log (never in error_message). Any other
# refusal is cli_failed.
#
# D36: before any parsing, a wrapper whose stopReason is not exactly
# end_turn (absent included), or stderr containing "max turns reached", is
# cli_failed: the code was not reviewed, so its text is never passed on.
#
# Prefers node (guarded by `command -v node`); falls back to jq; with
# neither, prints an unknown_error envelope. No python (harness-modernization
# D19).
#
# Exit codes:
#   0 - --input: an envelope was printed (read its "status", not this code).
#       --auth-check: a grok.com session login is usable.
#   2 - usage error (unknown argument, or --input missing/unreadable).
#   10 - --auth-check: the grok binary is not on PATH.
#   11 - --auth-check: not authenticated (or the probe output was not
#        recognised, or `grok models` did not answer in time; this fails
#        closed).
#   12 - --auth-check: only XAI_API_KEY (or GROK_CODE_XAI_API_KEY) is
#        available and per-token billing is not opted into
#        (allow_api_key_billing is not true).

set -eu

SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
case "$SCRIPT_SOURCE" in
  */*) SCRIPT_DIR_RAW="${SCRIPT_SOURCE%/*}" ;;
  *) SCRIPT_DIR_RAW="." ;;
esac
SCRIPT_DIR="$(cd -- "$SCRIPT_DIR_RAW" && pwd -P)"
PLUGIN_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
VALIDATE="$PLUGIN_ROOT/scripts/validate-findings"
CONFIG_GET="$PLUGIN_ROOT/scripts/lib/config-get.sh"
HOSTS_ENV="$PLUGIN_ROOT/config/hosts.env"
# One strict findings schema shared with the Codex adapter (D33).
SCHEMA_FILE="$PLUGIN_ROOT/agents/_shared/codex-findings.schema.json"

REVIEWER_ID="grok-review-prompter"
DISALLOWED_TOOLS="read_file,grep,list_dir,run_terminal_cmd,search_replace,write_file,web_search,web_fetch,todo_write,task,Agent"
MAX_TURNS=3
PROBE_CAP=30
REFUSAL_A="could not resolve runtime-socket deny path"
REFUSAL_B="endpoint is a symlink"
REFUSAL_C="Refusing to start with its protections missing"
AUTH_RE='not signed in|not authenticated|(^|[^0-9])401([^0-9]|$)|expired|grok login'
INSTALL_HINT="curl -fsSL https://x.ai/cli/install.sh | bash"

MODE=""
INPUT=""
ENVELOPE_OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --input) INPUT="${2:-}"; MODE="review"; shift 2 || shift ;;
    --envelope-out) ENVELOPE_OUT="${2:-}"; shift 2 || shift ;;
    --auth-check) MODE="auth"; shift ;;
    *) printf 'grok-review.sh: unknown argument "%s"\n' "$1" >&2; exit 2 ;;
  esac
done
if [ -z "$MODE" ]; then
  printf 'grok-review.sh: usage: --input <envelope.json> [--envelope-out <path>] | --auth-check\n' >&2
  exit 2
fi
if [ "$MODE" = "review" ] && { [ -z "$INPUT" ] || [ ! -r "$INPUT" ]; }; then
  printf 'grok-review.sh: --input must name a readable envelope file\n' >&2
  exit 2
fi

if command -v node >/dev/null 2>&1; then
  JSON_TOOL="node"
elif command -v jq >/dev/null 2>&1; then
  JSON_TOOL="jq"
else
  JSON_TOOL=""
fi

cfg() {
  bash "$CONFIG_GET" "$1" "${2:-}" 2>/dev/null || printf '%s' "${2:-}"
}

note() {
  printf 'grok-review.sh: %s\n' "$1" >&2
}

# Control characters out, length capped: messages go into JSON strings.
clean_msg() {
  local m
  m="$(printf '%s' "$1" | tr -d '\000-\010\013\014\016-\037' | tr '\n\r\t' '   ')"
  printf '%s' "${m:0:600}"
}

RAW=""
RAW_ABS=""
emit() {
  if [ -n "$ENVELOPE_OUT" ]; then
    case "$ENVELOPE_OUT" in */*) mkdir -p -- "${ENVELOPE_OUT%/*}" 2>/dev/null || true ;; esac
    printf '%s\n' "$1" > "$ENVELOPE_OUT.tmp.$$" && mv -f -- "$ENVELOPE_OUT.tmp.$$" "$ENVELOPE_OUT"
  fi
  printf '%s\n' "$1"
}

fail() {
  local out
  if [ -n "$RAW" ]; then
    out="$(bash "$VALIDATE" --error "$1" --message "$(clean_msg "$2")" --raw-output-path "$RAW")"
  else
    out="$(bash "$VALIDATE" --error "$1" --message "$(clean_msg "$2")")"
  fi
  emit "$out"
  exit 0
}

# --- JSON helpers: node first, jq fallback ------------------------------

# env_get <key>: config.<key> (or top-level <key>) as a raw string; "" if
# null or absent. Arrays/objects come back serialized.
env_get() {
  if [ "$JSON_TOOL" = "node" ]; then
    node -e '
const fs = require("fs");
let e; try { e = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { process.exit(0); }
const k = process.argv[2];
let v = e && e.config && typeof e.config === "object" && e.config[k] != null ? e.config[k] : (e ? e[k] : undefined);
if (v === undefined || v === null) process.exit(0);
process.stdout.write(typeof v === "string" ? v : JSON.stringify(v));
' "$INPUT" "$1" 2>/dev/null || true
  else
    jq -rj --arg k "$1" '(if (.config|type)=="object" and .config[$k] != null then .config[$k] else .[$k] end) // empty | if type=="string" then . else tojson end' "$INPUT" 2>/dev/null || true
  fi
}

# bundle_sections: the context bundle, grouped like the adapter-common
# skeleton (conventions, touched files, specs, then the artifact).
bundle_sections() {
  if [ "$JSON_TOOL" = "node" ]; then
    node -e '
const fs = require("fs");
const e = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const b = (e && e.context_bundle) || {};
const m = (b && b.manifest) || {};
const files = Array.isArray(b.files) ? b.files : [];
const p = (x) => (x && typeof x === "object" ? x.path : x);
const list = (k) => new Set((Array.isArray(m[k]) ? m[k] : []).map(p));
const art = p(m.artifact), conv = list("conventions"), spec = list("specs");
const groups = { CONVENTIONS: [], "TOUCHED FILES": [], SPECS: [], "ARTIFACT UNDER REVIEW": [] };
for (const f of files) {
  if (!f || typeof f !== "object") continue;
  const g = f.path === art ? "ARTIFACT UNDER REVIEW" : conv.has(f.path) ? "CONVENTIONS" : spec.has(f.path) ? "SPECS" : "TOUCHED FILES";
  groups[g].push("=== " + String(f.path) + " ===\n" + String(f.content == null ? "" : f.content) + "\n");
}
let out = "";
for (const [g, items] of Object.entries(groups)) out += "--- " + g + " ---\n" + items.join("");
process.stdout.write(out);
' "$INPUT"
  else
    jq -rj '
def p: if type == "object" then .path else . end;
(.context_bundle // {}) as $b | ($b.manifest // {}) as $m
| ($m.artifact | p) as $art
| [($m.conventions // [])[] | p] as $conv
| [($m.specs // [])[] | p] as $spec
| [($b.files // [])[] | select(type == "object")
   | . as $f
   | (if $f.path == $art then "ARTIFACT UNDER REVIEW"
      elif ($conv | index([$f.path])) then "CONVENTIONS"
      elif ($spec | index([$f.path])) then "SPECS"
      else "TOUCHED FILES" end) as $g
   | {g: $g, s: ("=== " + ($f.path | tostring) + " ===\n" + (($f.content // "") | tostring) + "\n")}] as $all
| ["CONVENTIONS", "TOUCHED FILES", "SPECS", "ARTIFACT UNDER REVIEW"]
| map(. as $g | "--- " + $g + " ---\n" + ([$all[] | select(.g == $g) | .s] | join("")))
| join("")' "$INPUT"
  fi
}

minify_schema() {
  if [ "$JSON_TOOL" = "node" ]; then
    node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))))' "$SCHEMA_FILE"
  else
    jq -cj . "$SCHEMA_FILE"
  fi
}

# read_wrapper <stdout-file>: writes $W/w.kind (object|error|invalid),
# $W/w.stop (stopReason, or <absent>), $W/w.msg (an error's message),
# $W/w.payload (serialized structuredOutput when present, else .text) and
# $W/w.usage ({input_tokens, output_tokens, model} from the wrapper, or
# empty). usage.model is the modelUsage key verbatim (the serving model).
read_wrapper() {
  : > "$W/w.kind"; : > "$W/w.stop"; : > "$W/w.msg"; : > "$W/w.payload"; : > "$W/w.usage"
  if [ "$JSON_TOOL" = "node" ]; then
    node -e '
const fs = require("fs");
const [, src, dir] = process.argv;
const put = (n, s) => fs.writeFileSync(dir + "/w." + n, s);
let w;
try { w = JSON.parse(fs.readFileSync(src, "utf8")); } catch { put("kind", "invalid"); process.exit(0); }
if (!w || typeof w !== "object" || Array.isArray(w)) { put("kind", "invalid"); process.exit(0); }
if (w.type === "error") { put("kind", "error"); put("msg", typeof w.message === "string" ? w.message : JSON.stringify(w.message ?? "")); process.exit(0); }
put("kind", "object");
put("stop", typeof w.stopReason === "string" ? w.stopReason : "<absent>");
if (w.structuredOutput !== undefined && w.structuredOutput !== null) put("payload", JSON.stringify(w.structuredOutput));
else if (typeof w.text === "string") put("payload", w.text);
else if (w.text !== undefined && w.text !== null) put("payload", JSON.stringify(w.text));
const u = w.usage;
if (u && typeof u === "object" && typeof u.input_tokens === "number" && typeof u.output_tokens === "number") {
  const usage = { input_tokens: u.input_tokens, output_tokens: u.output_tokens };
  const mu = w.modelUsage && typeof w.modelUsage === "object" && !Array.isArray(w.modelUsage) ? Object.entries(w.modelUsage) : [];
  let best = null;
  for (const [k, v] of mu) { const c = v && typeof v.modelCalls === "number" ? v.modelCalls : 0; if (best === null || c > best[1]) best = [k, c]; }
  if (best) usage.model = best[0];
  put("usage", JSON.stringify(usage));
}
' "$1" "$W" 2>/dev/null || printf 'invalid' > "$W/w.kind"
  else
    local kind
    kind="$(jq -rs 'if length == 1 and (.[0] | type) == "object" then (if .[0].type == "error" then "error" else "object" end) else "invalid" end' "$1" 2>/dev/null || true)"
    case "$kind" in object|error) ;; *) kind="invalid" ;; esac
    printf '%s' "$kind" > "$W/w.kind"
    if [ "$kind" = "error" ]; then
      jq -rj '.message // "" | if type == "string" then . else tojson end' "$1" > "$W/w.msg" 2>/dev/null || true
    elif [ "$kind" = "object" ]; then
      jq -rj 'if (.stopReason | type) == "string" then .stopReason else "<absent>" end' "$1" > "$W/w.stop" 2>/dev/null || true
      jq -rj 'if .structuredOutput != null then (.structuredOutput | tojson) elif (.text | type) == "string" then .text elif .text != null then (.text | tojson) else empty end' "$1" > "$W/w.payload" 2>/dev/null || true
      jq -cj 'if (.usage | type) == "object" and (.usage.input_tokens | type) == "number" and (.usage.output_tokens | type) == "number"
          then {input_tokens: .usage.input_tokens, output_tokens: .usage.output_tokens}
            + (if (.modelUsage | type) == "object" and (.modelUsage | length) > 0
               then {model: (.modelUsage | to_entries | reduce .[] as $e (null; if . == null or (($e.value.modelCalls // 0) > (.value.modelCalls // 0)) then $e else . end) | .key)}
               else {} end)
          else empty end' "$1" > "$W/w.usage" 2>/dev/null || true
    fi
  fi
}

# --- Configuration -------------------------------------------------------

ALLOW_KEY="false"
case "$(cfg multi_model_review.per_reviewer.grok-review-prompter.allow_api_key_billing false)" in
  true|True|TRUE|yes|on) ALLOW_KEY="true" ;;
esac

# Real grok home, canonical (a symlinked GROK_HOME is refused at sandbox
# start). Resolved before HOME is isolated.
REAL_GROK_HOME="${GROK_HOME:-${HOME:-}/.grok}"
if [ -d "$REAL_GROK_HOME" ]; then
  REAL_GROK_HOME="$(cd -P -- "$REAL_GROK_HOME" && pwd -P)"
fi
PARENT_HAS_KEY="false"
if [ -n "${XAI_API_KEY:-}" ] || [ -n "${GROK_CODE_XAI_API_KEY:-}" ]; then PARENT_HAS_KEY="true"; fi

TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="gtimeout"
fi

W=""
WATCHDOG_PID=""
GROK_PID=""
cleanup() {
  if [ -n "$GROK_PID" ]; then kill -TERM "$GROK_PID" 2>/dev/null || true; fi
  if [ -n "$WATCHDOG_PID" ]; then kill "$WATCHDOG_PID" 2>/dev/null || true; fi
  if [ -n "$W" ] && [ -d "$W" ] && [ "$W" != "/" ]; then rm -rf -- "$W"; fi
}

# make_scratch: the untrusted cwd every grok call runs in.
make_scratch() {
  W="$(mktemp -d /tmp/synthex-grok.XXXXXX 2>/dev/null || true)"
  if [ -n "$W" ]; then W="$(cd -P -- "$W" && pwd -P || true)"; fi
  [ -n "$W" ] && [ -d "$W" ] && [ "$W" != "$PWD" ] || return 1
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  mkdir -p -- "$W/home"
}

# isolate: call only inside a subshell. Applies the D25/D26 environment.
isolate() {
  cd -- "$W"
  export HOME="$W/home"
  export GROK_HOME="$REAL_GROK_HOME"
  export GROK_DISABLE_AUTOUPDATER=1
  export GROK_MEMORY=0
  local v
  for v in AGENTS HOOKS MCPS RULES SKILLS; do
    export "GROK_CLAUDE_${v}_ENABLED=0" "GROK_CURSOR_${v}_ENABLED=0"
  done
  unset GROK_CONFIG GROK_CONFIG_PATH GROK_FOLDER_TRUST GROK_SANDBOX
  if [ "$ALLOW_KEY" != "true" ]; then unset XAI_API_KEY GROK_CODE_XAI_API_KEY; fi
}

# guarded <limit> <stdout-file> <stderr-file> <grok args...>: one isolated
# grok call, backgrounded and waited on (so an INT/TERM trap runs promptly
# and cleanup can stop the child), killed after <limit> seconds by
# timeout/gtimeout or else by a bash watchdog. Sets RC and TIMED_OUT. Both
# the auth probe and the review go through here, so the two timeout
# branches always run the same argv.
RC=0
TIMED_OUT=0
guarded() {
  local limit="$1" out="$2" err="$3"
  shift 3
  if [ "$limit" -lt 1 ]; then limit=1; fi
  RC=0
  TIMED_OUT=0
  rm -f -- "$W/.timedout"
  if [ -n "$TIMEOUT_BIN" ]; then
    (isolate; exec "$TIMEOUT_BIN" -k 5 "$limit" grok "$@") > "$out" 2> "$err" < /dev/null &
    GROK_PID=$!
  else
    (isolate; exec grok "$@") > "$out" 2> "$err" < /dev/null &
    GROK_PID=$!
    local pid=$GROK_PID
    (sleep "$limit"; : > "$W/.timedout"; kill -TERM "$pid" 2>/dev/null; sleep 5; kill -KILL "$pid" 2>/dev/null) \
      < /dev/null > /dev/null 2>&1 &
    WATCHDOG_PID=$!
  fi
  wait "$GROK_PID" || RC=$?
  GROK_PID=""
  if [ -n "$WATCHDOG_PID" ]; then
    kill "$WATCHDOG_PID" 2>/dev/null || true
    WATCHDOG_PID=""
  fi
  if [ -n "$TIMEOUT_BIN" ]; then
    case "$RC" in 124|137) TIMED_OUT=1 ;; esac
  elif [ -e "$W/.timedout" ]; then
    TIMED_OUT=1
  fi
}

# compute_budget: per_reviewer_timeout_seconds - 10, clamped in the
# foreground (no --envelope-out) to the host shell cap - 15.
compute_budget() {
  local prt cap host_id cap_var
  prt="$(cfg multi_model_review.per_reviewer_timeout_seconds 180)"
  case "$prt" in ''|*[!0-9]*) prt=180 ;; esac
  BUDGET=$((prt - 10))
  if [ -z "$ENVELOPE_OUT" ]; then
    host_id="$(printf '%s' "${SYNTHEX_HOST:-claude}" | tr 'a-z' 'A-Z')"
    case "$host_id" in ''|*[!A-Z0-9_]*) host_id="CLAUDE" ;; esac
    cap=""
    if [ -r "$HOSTS_ENV" ]; then
      # shellcheck disable=SC1090
      . "$HOSTS_ENV"
      cap_var="SYNTHEX_HOST_${host_id}_SHELL_CAP"
      cap="${!cap_var:-}"
    fi
    case "$cap" in ''|*[!0-9]*) ;; *)
      if [ $((cap - 15)) -lt "$BUDGET" ]; then BUDGET=$((cap - 15)); fi ;;
    esac
  fi
  if [ "$BUDGET" -lt 1 ]; then BUDGET=1; fi
}

# auth_probe: 0 session (or opted-in key), 10 missing, 11 not
# authenticated / unrecognised, 12 key only without opt-in, 13 no
# recognisable answer before the bound (PROBE_LIMIT seconds).
PROBE_LIMIT=$PROBE_CAP
auth_probe() {
  command -v grok >/dev/null 2>&1 || return 10
  local line=""
  guarded "$PROBE_LIMIT" "$W/models.out" "$W/models.err" models
  line="$(head -n 1 "$W/models.out" 2>/dev/null || true)"
  case "$line" in
    "You are logged in"*) return 0 ;;
    "You are using XAI_API_KEY"*)
      if [ "$ALLOW_KEY" = "true" ]; then return 0; fi
      return 12 ;;
  esac
  if [ "$TIMED_OUT" = 1 ]; then return 13; fi
  if [ "$PARENT_HAS_KEY" = "true" ] && [ "$ALLOW_KEY" != "true" ]; then return 12; fi
  return 11
}

# probe_limit: min(PROBE_CAP, what is left of BUDGET).
probe_limit() {
  PROBE_LIMIT=$((BUDGET - SECONDS))
  if [ "$PROBE_LIMIT" -gt "$PROBE_CAP" ]; then PROBE_LIMIT=$PROBE_CAP; fi
  if [ "$PROBE_LIMIT" -lt 1 ]; then PROBE_LIMIT=1; fi
}

# --- --auth-check --------------------------------------------------------

if [ "$MODE" = "auth" ]; then
  if ! command -v grok >/dev/null 2>&1; then
    note "grok is not on PATH; install with: $INSTALL_HINT"
    exit 10
  fi
  if ! make_scratch; then
    note "could not create a safe scratch dir under /tmp"
    exit 11
  fi
  compute_budget
  SECONDS=0
  probe_limit
  rc=0
  auth_probe || rc=$?
  case "$rc" in
    0) printf 'grok: authenticated\n' ;;
    13) note "grok models did not answer within ${PROBE_LIMIT}s; treating as not authenticated"; rc=11 ;;
    12) note "only XAI_API_KEY is available; it bills per token. Run grok login, or opt in with multi_model_review.per_reviewer.grok-review-prompter.allow_api_key_billing: true" ;;
    *) note "not authenticated; run grok login" ;;
  esac
  exit "$rc"
fi

# --- --input -------------------------------------------------------------

if [ -z "$JSON_TOOL" ]; then
  fail unknown_error "grok-review.sh needs node or jq to read the input envelope and grok's JSON output; neither is on PATH."
fi

RAW="$(env_get raw_output_path)"
if [ -z "$RAW" ]; then
  RAW="${INPUT%.input.json}.raw.json"
fi
case "$RAW" in
  /*) RAW_ABS="$RAW" ;;
  *) RAW_ABS="$PWD/$RAW" ;;
esac
mkdir -p -- "${RAW_ABS%/*}" 2>/dev/null || true
STDERR_LOG="$RAW_ABS.stderr.log"
# The raw output must land before parsing; if it cannot, say so in an
# envelope instead of letting set -e end the run without one.
if ! { : > "$STDERR_LOG"; } 2>/dev/null; then
  BAD_RAW="$RAW"
  RAW=""
  fail unknown_error "grok-review.sh cannot write raw_output_path $BAD_RAW (or its .stderr.log); no grok call was made."
fi

case "$(env_get allow_api_key_billing)" in
  true) ALLOW_KEY="true" ;;
esac

# D29: parent-mediated is unsupported; sandbox-yolo is a no-op alias of
# read-only. The CLI is never spawned for an unsupported mode.
PERM="$(cfg multi_model_review.external_permission_mode.grok "")"
if [ -z "$PERM" ]; then PERM="$(cfg multi_model_review.external_permission_mode.default read-only)"; fi
case "$PERM" in
  parent-mediated)
    fail cli_unsupported_mode "grok: external_permission_mode parent-mediated is not supported (text-only adapter, D29); use read-only." ;;
  read-only|sandbox-yolo|"") ;;
  *) note "unknown external_permission_mode.grok '$PERM'; running read-only" ;;
esac

# 1. CLI presence (the binary name is hardcoded; never from config).
if ! command -v grok >/dev/null 2>&1; then
  fail cli_missing "grok is not installed. Install: $INSTALL_HINT, then run grok login."
fi

if ! make_scratch; then
  fail unknown_error "grok-review.sh could not create a safe scratch dir under /tmp."
fi

# 4. Wall-clock guard: per_reviewer_timeout_seconds - 10, clamped in the
# foreground (no --envelope-out) to the host shell cap - 15. The clock
# starts here, so the auth probe spends the same budget as the review.
compute_budget
SECONDS=0

# 2. Auth (D26).
probe_limit
arc=0
auth_probe || arc=$?
case "$arc" in
  0) ;;
  13) fail timeout "grok models (the auth probe) did not answer within ${PROBE_LIMIT}s of the ${BUDGET}s wall-clock budget; no review was run." ;;
  12) fail cli_auth_failed "grok: only XAI_API_KEY is available, which bills per token. Run grok login, or opt in with per_reviewer.grok-review-prompter.allow_api_key_billing: true." ;;
  *) fail cli_auth_failed "grok: not authenticated. Run grok login." ;;
esac

MODEL="$(env_get model)"
FAMILY="$(env_get family)"
if [ -z "$FAMILY" ]; then
  case "$MODEL" in
    ""|grok-*) FAMILY="xai" ;;
    *) FAMILY="unknown" ;;
  esac
fi
JUDGE="$(env_get judge_mode_prompt)"
COMMAND_CTX="$(env_get command)"

SCHEMA_JSON="$(minify_schema 2>/dev/null || true)"
if [ -z "$SCHEMA_JSON" ]; then
  fail unknown_error "grok-review.sh could not read the strict findings schema at agents/_shared/codex-findings.schema.json."
fi

# 3. Prompt construction: the bundle is inlined; the model has no tools.
PROMPT="$W/prompt.txt"
{
  printf '%s\n' "You are a code reviewer, one proposer in a multi-model review. You have NO tools: do not try to read files, run commands, search the web or call any tool. Everything you need is in this prompt."
  printf '%s\n' "Review the artifact under review and return ONLY a JSON object (no prose, no markdown fences) that matches the schema below. Each finding has exactly: finding_id (no line numbers in it), severity (critical|high|medium|low), category, title, description, file, symbol (string or null), line_range ({\"start\",\"end\"} or null) and confidence (low|medium|high). Use {\"findings\": []} only when you find no issues."
  printf 'Command context: %s\n' "${COMMAND_CTX:-review-code}"
  printf '%s\n%s\n' "--- FINDINGS SCHEMA ---" "$SCHEMA_JSON"
} > "$PROMPT"
if ! bundle_sections >> "$PROMPT" 2>/dev/null; then
  fail unknown_error "grok-review.sh could not read context_bundle from the input envelope."
fi

USE_SANDBOX=1
SANDBOX_RETRIED=0
PARSE_RETRIED=0
ATTEMPT=0

# run_grok: one isolated invocation. Raw stdout lands in $RAW_ABS (atomic
# rename on every path, timeout included) before anything parses it.
run_grok() {
  ATTEMPT=$((ATTEMPT + 1))
  local left=$((BUDGET - SECONDS))
  if [ "$left" -lt 1 ]; then
    fail timeout "grok exceeded the ${BUDGET}s wall-clock budget (per_reviewer_timeout_seconds - 10, host-clamped) before review attempt $ATTEMPT could start."
  fi
  local -a args
  args=(--prompt-file "$PROMPT" --output-format json --json-schema "$SCHEMA_JSON"
    --disallowed-tools "$DISALLOWED_TOOLS" --deny '*' --deny 'mcp__*'
    --permission-mode dontAsk)
  if [ "$USE_SANDBOX" = 1 ]; then args+=(--sandbox read-only); fi
  args+=(--no-subagents --disable-web-search --max-turns "$MAX_TURNS")
  if [ -n "$MODEL" ]; then args+=(-m "$MODEL"); fi
  if [ -n "$JUDGE" ]; then args+=(--rules "$JUDGE"); fi
  guarded "$left" "$RAW_ABS.tmp" "$W/stderr.$ATTEMPT" "${args[@]}"
  if ! mv -f -- "$RAW_ABS.tmp" "$RAW_ABS" 2>/dev/null; then
    BAD_RAW="$RAW"
    RAW=""
    fail unknown_error "grok-review.sh could not write grok's output to raw_output_path $BAD_RAW (attempt $ATTEMPT exit $RC)."
  fi
  {
    printf '[grok-review.sh] attempt %s exit %s\n' "$ATTEMPT" "$RC"
    cat -- "$W/stderr.$ATTEMPT"
  } >> "$STDERR_LOG" 2>/dev/null || true
}

attempt_stderr() {
  cat -- "$W/stderr.$ATTEMPT" 2>/dev/null || true
}

while :; do
  run_grok
  ERR="$(attempt_stderr)"

  if [ "$TIMED_OUT" = 1 ]; then
    fail timeout "grok exceeded the ${BUDGET}s wall-clock budget (per_reviewer_timeout_seconds - 10, host-clamped); partial raw output kept at raw_output_path."
  fi
  if [ "$RC" = 130 ]; then
    fail cli_failed "grok was interrupted (exit 130); the code was not reviewed."
  fi

  # D34: the one refusal that drops --sandbox, retried once.
  if [ "$RC" != 0 ] && [ "$USE_SANDBOX" = 1 ] && [ "$SANDBOX_RETRIED" = 0 ] \
    && case "$ERR" in *"$REFUSAL_A"*) true ;; *) false ;; esac \
    && case "$ERR" in *"$REFUSAL_B"*) true ;; *) false ;; esac \
    && case "$ERR" in *"$REFUSAL_C"*) true ;; *) false ;; esac; then
    WARN="warning: grok refused --sandbox read-only because a runtime-socket deny path is a symlink (e.g. /var/run/docker.sock under OrbStack or Docker Desktop); retrying once without --sandbox (D34). Tool removal and --deny '*' still apply."
    note "$WARN"
    printf '[grok-review.sh] %s\n' "$WARN" >> "$STDERR_LOG"
    USE_SANDBOX=0
    SANDBOX_RETRIED=1
    continue
  fi

  read_wrapper "$RAW_ABS"
  KIND="$(cat "$W/w.kind")"

  if [ "$KIND" = "error" ]; then
    MSG="$(cat "$W/w.msg")"
    if printf '%s\n%s\n' "$MSG" "$ERR" | grep -Eiq "$AUTH_RE"; then
      fail cli_auth_failed "grok: $MSG Run grok login."
    fi
    fail cli_failed "grok error (exit $RC): ${MSG:-$ERR}"
  fi

  if [ "$KIND" != "object" ]; then
    if printf '%s\n' "$ERR" | grep -Eiq "$AUTH_RE"; then
      fail cli_auth_failed "grok: ${ERR:-not authenticated}. Run grok login."
    fi
    fail cli_failed "grok exited $RC without a JSON result: ${ERR:-no stderr}"
  fi

  # D36 incomplete-run guard (Risk 15): allowlist {end_turn}, before parsing.
  STOP="$(cat "$W/w.stop")"
  if [ "$STOP" != "end_turn" ] || case "$ERR" in *"max turns reached"*) true ;; *) false ;; esac; then
    fail cli_failed "grok run incomplete (stopReason: ${STOP:-<absent>}, exit $RC): the code was not reviewed, so this run's output was discarded."
  fi
  if [ "$RC" != 0 ]; then
    fail cli_failed "grok exited $RC (stopReason: end_turn): ${ERR:-no stderr}"
  fi

  # 5. Output parsing: structuredOutput first, else .text (D33).
  USAGE="$(cat "$W/w.usage")"
  if [ -n "$USAGE" ]; then
    ENV_OUT="$(bash "$VALIDATE" --reviewer-id "$REVIEWER_ID" --family "$FAMILY" --raw-output-path "$RAW" --input "$W/w.payload" --usage-json "$USAGE")"
  elif [ -n "$MODEL" ]; then
    ENV_OUT="$(bash "$VALIDATE" --reviewer-id "$REVIEWER_ID" --family "$FAMILY" --raw-output-path "$RAW" --input "$W/w.payload" --model "$MODEL")"
  else
    ENV_OUT="$(bash "$VALIDATE" --reviewer-id "$REVIEWER_ID" --family "$FAMILY" --raw-output-path "$RAW" --input "$W/w.payload")"
  fi

  # 6. Retry once on parse_failed (the fallback argv, if any, is kept).
  if [ "$PARSE_RETRIED" = 0 ] && printf '%s' "$ENV_OUT" | grep -Eq '"error_code"[[:space:]]*:[[:space:]]*"parse_failed"'; then
    PARSE_RETRIED=1
    printf '\n%s\n' "Your previous response could not be parsed as JSON. Respond with ONLY valid JSON, no markdown fences, no prose." >> "$PROMPT"
    continue
  fi

  # 7-8. validate-findings already normalized it; return it unchanged.
  emit "$ENV_OUT"
  exit 0
done

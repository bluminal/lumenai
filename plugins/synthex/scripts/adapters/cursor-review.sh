#!/usr/bin/env bash
# cursor-review.sh — multi-model-review runner for the Cursor Agent CLI
# (multi-model-review Task 69; D25, D26, D28, D29, D31, D37-D43).
#
# cursor-review-prompter.md and the orchestrator's depth-1 direct-CLI path
# both run this script, so the isolation below never depends on an LLM
# rebuilding it from prose (D28). It does FR-MR8 responsibilities 1-8
# itself and prints the FR-MR9 envelope that scripts/validate-findings
# builds.
#
# Usage:
#   cursor-review.sh --input <envelope.json> [--envelope-out <path>]
#     <envelope.json> is the FR-MR9 input envelope: {command,
#     context_bundle, config: {model, family, raw_output_path,
#     judge_mode_prompt?, allow_api_key_billing?}}. config.model and
#     config.family fall back to
#     multi_model_review.per_reviewer.cursor-review-prompter.{model,family}.
#     Prints the envelope on stdout and, with --envelope-out, also writes it
#     there atomically so a depth-1 host can background this script and poll
#     for the file.
#   cursor-review.sh --auth-check
#     Runs the D26 model/family guard, then `cursor-agent status --format
#     json` under the same isolation, bounded by min(30 s, the review budget
#     below). In --input mode the same probe spends the review budget, whose
#     clock starts before it.
#
# Text-only isolation (D25, D37), applied to every cursor-agent call:
#   - cwd is a fresh `mktemp -d /tmp/synthex-cursor.XXXXXX` dir
#     (canonicalised, guarded, removed by an EXIT trap). The runner's own
#     working files live in a second private dir, so the ONLY file it ever
#     writes to the workspace is .cursor/cli.json;
#   - before any cursor-agent call it writes <scratch>/.cursor/cli.json
#     byte-for-byte from scripts/adapters/cursor-deny-all.cli.json (the
#     deny-all rules Task 67 tested in C7, D37) and reads it back; any
#     failure is cli_failed (exit 11 for --auth-check) with no call made;
#   - CURSOR_CONFIG_DIR is unset (never set: the login lives in the real
#     ~/.cursor/cli-config.json); CURSOR_API_KEY is unset unless
#     multi_model_review.per_reviewer.cursor-review-prompter.allow_api_key_billing
#     (or the envelope's config.allow_api_key_billing) is true (D26, Q10);
#   - cwd is checked inside the subshell that execs cursor-agent (cd ||
#     exit 125, then pwd -P must equal the scratch dir); a failed check runs
#     no cursor-agent and fails closed (unknown_error; --auth-check 11);
#   - argv is exactly: -p --mode ask --sandbox enabled --trust
#     --output-format stream-json --model <slug>. No prompt argument: the
#     one inlined prompt (with the D31 `--- ROLE ---` judge_mode_prompt
#     prefix) is piped to stdin, and no prompt or bundle file is written
#     anywhere (D39). Never -f/--force, --yolo, --approve-mcps,
#     --auto-review, --api-key, --add-dir, --plugin-dir or
#     --stream-partial-output.
#
# D26: the model must be explicit and not Auto (null, '' and auto* are
# refused, and it must look like a model slug) and the family must be set;
# otherwise cli_failed with no call (--auth-check exits 12). Never an Auto
# fallback, including on the Free-plan refusal (D43).
#
# D38: every stream is scanned in node/jq (the spike's frozen result-shape
# allowlist) before the exit code or the result event is mapped. Only an
# `error` result, a `permissionDenied` result and an empty globToolCall
# success are tolerated; anything else, including any unrecognised shape,
# is sandbox_violation, which outranks success, cli_failed and timeout. The
# raw output is always kept.
#
# D40: findings come from the last `assistant` message (else the result
# event's .result); the result event's subtype must be exactly "success"
# and is_error exactly false, decided in node/jq.
#
# D42: on exit (success, failure, timeout or interrupt) it deletes exactly
# $HOME/.cursor/projects/<slug of the scratch dir> and
# $HOME/.cursor/chats/*/<session_id> for each session_id its own streams
# opened, only when the slug and the id match strict patterns, never
# through a symlink, and nothing else. The runner never edits hook config
# (D41) and writes nothing under ~/.cursor.
#
# Prefers node (guarded by `command -v node`); falls back to jq; with
# neither, prints an unknown_error envelope. No python (harness-modernization
# D19).
#
# Exit codes:
#   0 - --input: an envelope was printed (read its "status", not this code).
#       --auth-check: a logged-in status was positively matched.
#   2 - usage error (unknown argument, or --input missing/unreadable).
#   10 - --auth-check: the cursor-agent binary is not on PATH.
#   11 - --auth-check: not authenticated (or the status output was not a
#        recognised logged-in form, `cursor-agent status` did not answer in
#        time, the deny file could not be written, or the scratch dir could
#        not be entered so cursor-agent was not run; this fails closed).
#   12 - --auth-check: the D26 guard failed (no explicit non-Auto model or
#        no family configured), or only CURSOR_API_KEY is available and
#        per-request billing is not opted into.
#   130 - interrupted by SIGINT; 143 - by SIGTERM. cursor-agent is stopped
#        first; in --input mode a cli_failed envelope ("cursor-review.sh was
#        interrupted; the code was not reviewed.") is still printed and
#        written to --envelope-out, and a partial raw output is kept.

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
# The strict findings schema shared with the Codex and Grok runners.
SCHEMA_FILE="$PLUGIN_ROOT/agents/_shared/codex-findings.schema.json"
# The D37 deny-all rules, byte-identical to Task 67's tested file.
DENY_SRC="$SCRIPT_DIR/cursor-deny-all.cli.json"

REVIEWER_ID="cursor-review-prompter"
PROBE_CAP=30
FREE_PLAN_TEXT="Named models unavailable"
UNKNOWN_MODEL_TEXT="Cannot use this model:"
AUTH_RE='not authenticated|not logged in|unauthenticated|unauthorized|(^|[^0-9])401([^0-9]|$)|login'
MODEL_RE='^[A-Za-z0-9][A-Za-z0-9._:=-]*(\[[A-Za-z0-9._:=,-]*\])?$'
FAMILY_RE='^[A-Za-z0-9][A-Za-z0-9._-]*$'
INSTALL_HINT="curl https://cursor.com/install -fsS | bash"
PROMPT_HEAD="You are a code reviewer, one proposer in a multi-model review. You have NO tools: do not try to read files, run commands, search, fetch URLs or call any tool; every tool is denied. Everything you need is in this prompt."
PROMPT_RULES="Review the artifact under review and return ONLY a JSON object (no prose, no markdown fences) that matches the schema below. Each finding has exactly: finding_id (no line numbers in it), severity (critical|high|medium|low), category, title, description, file, symbol (string or null), line_range ({\"start\",\"end\"} or null) and confidence (low|medium|high). Use {\"findings\": []} only when you find no issues."
RETRY_TEXT="Your previous response could not be parsed as JSON. Respond with ONLY valid JSON, no markdown fences, no prose."

MODE=""
INPUT=""
ENVELOPE_OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --input) INPUT="${2:-}"; MODE="review"; shift 2 || shift ;;
    --envelope-out) ENVELOPE_OUT="${2:-}"; shift 2 || shift ;;
    --auth-check) MODE="auth"; shift ;;
    *) printf 'cursor-review.sh: unknown argument "%s"\n' "$1" >&2; exit 2 ;;
  esac
done
if [ -z "$MODE" ]; then
  printf 'cursor-review.sh: usage: --input <envelope.json> [--envelope-out <path>] | --auth-check\n' >&2
  exit 2
fi
if [ "$MODE" = "review" ] && { [ -z "$INPUT" ] || [ ! -r "$INPUT" ]; }; then
  printf 'cursor-review.sh: --input must name a readable envelope file\n' >&2
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
  printf 'cursor-review.sh: %s\n' "$1" >&2
}

# Control characters out, length capped: messages go into JSON strings.
clean_msg() {
  local m
  m="$(printf '%s' "$1" | tr -d '\000-\010\013\014\016-\037' | tr '\n\r\t' '   ')"
  printf '%s' "${m:0:600}"
}

RAW=""
RAW_ABS=""
W=""
S=""
SLUG=""
WATCHDOG_PID=""
CLI_PID=""
FAIL_EXIT=0
# emit and fail ignore INT/TERM, so an interrupt cannot re-enter them and
# replace the envelope they are writing.
emit() {
  trap '' INT TERM
  if [ -n "$ENVELOPE_OUT" ]; then
    case "$ENVELOPE_OUT" in */*) mkdir -p -- "${ENVELOPE_OUT%/*}" 2>/dev/null || true ;; esac
    printf '%s\n' "$1" > "$ENVELOPE_OUT.tmp.$$" && mv -f -- "$ENVELOPE_OUT.tmp.$$" "$ENVELOPE_OUT"
  fi
  printf '%s\n' "$1"
}

fail() {
  trap '' INT TERM
  local out
  if [ -n "$RAW" ]; then
    out="$(bash "$VALIDATE" --error "$1" --message "$(clean_msg "$2")" --raw-output-path "$RAW")"
  else
    out="$(bash "$VALIDATE" --error "$1" --message "$(clean_msg "$2")")"
  fi
  emit "$out"
  exit "$FAIL_EXIT"
}

# stop_cli: TERM the running cursor-agent and wait for it to exit (so its
# local state is written before the D42 cleanup runs), with a KILL after
# 2 s in case it ignores TERM.
stop_cli() {
  local pid="$CLI_PID" killer
  CLI_PID=""
  if [ -n "$WATCHDOG_PID" ]; then kill "$WATCHDOG_PID" 2>/dev/null || true; WATCHDOG_PID=""; fi
  if [ -n "$pid" ]; then
    kill -TERM "$pid" 2>/dev/null || true
    (sleep 2; kill -KILL "$pid" 2>/dev/null) < /dev/null > /dev/null 2>&1 &
    killer=$!
    wait "$pid" 2>/dev/null || true
    kill "$killer" 2>/dev/null || true
  fi
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

# emit_prompt <retry 0|1>: the one inlined prompt, on stdout only (D39: it
# is piped to cursor-agent and never written to disk). judge_mode_prompt
# comes first under `--- ROLE ---` (D31); then the instructions, the strict
# findings schema and the context bundle grouped like the adapter-common
# skeleton; on a retry, the parse-failure clarification.
emit_prompt() {
  if [ "$JSON_TOOL" = "node" ]; then
    node -e '
const fs = require("fs");
const [, inp, schemaPath, retry, head, rules, retryText] = process.argv;
const e = JSON.parse(fs.readFileSync(inp, "utf8"));
const schema = JSON.stringify(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
const c = e && e.config && typeof e.config === "object" ? e.config : {};
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
if (typeof c.judge_mode_prompt === "string" && c.judge_mode_prompt !== "") out += "--- ROLE ---\n" + c.judge_mode_prompt + "\n\n";
out += head + "\n" + rules + "\n";
out += "Command context: " + (e && e.command != null ? String(e.command) : "review-code") + "\n";
out += "--- FINDINGS SCHEMA ---\n" + schema + "\n";
for (const [g, items] of Object.entries(groups)) out += "--- " + g + " ---\n" + items.join("");
if (retry === "1") out += "\n" + retryText + "\n";
process.stdout.write(out);
' "$INPUT" "$SCHEMA_FILE" "$1" "$PROMPT_HEAD" "$PROMPT_RULES" "$RETRY_TEXT"
  else
    jq -rj --argjson schema "$SCHEMA_JSON" --arg retry "$1" --arg head "$PROMPT_HEAD" \
      --arg rules "$PROMPT_RULES" --arg retryText "$RETRY_TEXT" '
def p: if type == "object" then .path else . end;
(if (.config | type) == "object" then .config else {} end) as $c
| (.context_bundle // {}) as $b | ($b.manifest // {}) as $m
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
| (if ($c.judge_mode_prompt | type) == "string" and $c.judge_mode_prompt != "" then "--- ROLE ---\n" + $c.judge_mode_prompt + "\n\n" else "" end)
  + $head + "\n" + $rules + "\n"
  + "Command context: " + (if .command == null then "review-code" else (.command | tostring) end) + "\n"
  + "--- FINDINGS SCHEMA ---\n" + ($schema | tojson) + "\n"
  + (["CONVENTIONS", "TOUCHED FILES", "SPECS", "ARTIFACT UNDER REVIEW"]
     | map(. as $g | "--- " + $g + " ---\n" + ([$all[] | select(.g == $g) | .s] | join("")))
     | join(""))
  + (if $retry == "1" then "\n" + $retryText + "\n" else "" end)' "$INPUT"
  fi
}

# deny_readback: 0 only when <scratch>/.cursor/cli.json is byte-identical to
# the shipped deny file and parses to allow [] plus every tested deny rule.
deny_readback() {
  local verdict=""
  if [ "$JSON_TOOL" = "node" ]; then
    verdict="$(node -e '
const fs = require("fs");
const [, src, dst] = process.argv;
const a = fs.readFileSync(src), b = fs.readFileSync(dst);
if (!a.equals(b)) { process.stdout.write("differs"); process.exit(0); }
const j = JSON.parse(b.toString("utf8"));
const need = ["Read(**)", "Read(/**)", "Read(~/**)", "Write(**)", "Write(/**)", "Shell(*)", "Mcp(*:*)"];
const pm = j && j.permissions;
const ok = pm && Array.isArray(pm.allow) && pm.allow.length === 0 && Array.isArray(pm.deny) && need.every((r) => pm.deny.includes(r));
process.stdout.write(ok ? "ok" : "rules");
' "$DENY_SRC" "$W/.cursor/cli.json" 2>/dev/null || true)"
  else
    verdict="$(jq -nrj --rawfile a "$DENY_SRC" --rawfile b "$W/.cursor/cli.json" '
if $a != $b then "differs"
else ($b | fromjson | .permissions) as $pm
  | if ($pm | type) == "object" and ($pm.allow | type) == "array" and ($pm.allow | length) == 0
       and ($pm.deny | type) == "array"
       and all(["Read(**)", "Read(/**)", "Read(~/**)", "Write(**)", "Write(/**)", "Shell(*)", "Mcp(*:*)"][]; . as $r | $pm.deny | index([$r]) != null)
    then "ok" else "rules" end
end' 2>/dev/null || true)"
  fi
  [ "$verdict" = "ok" ]
}

# status_verdict <stdout-file>: "in" for a positively matched logged-in
# form, "out" for an explicit logged-out form, else "unknown". JSON forms:
# isAuthenticated/authenticated/isLoggedIn/loggedIn true, or status
# authenticated/logged_in/logged-in/loggedin; the observed text form
# "Logged in as ..." (C1) also counts. Any explicit false wins.
status_verdict() {
  if [ "$JSON_TOOL" = "node" ]; then
    node -e '
const fs = require("fs");
let t = ""; try { t = fs.readFileSync(process.argv[1], "utf8"); } catch {}
let j; try { j = JSON.parse(t); } catch {}
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const KEYS = ["isAuthenticated", "authenticated", "isLoggedIn", "loggedIn"];
const IN = ["authenticated", "logged_in", "logged-in", "loggedin"];
const OUT = ["unauthenticated", "not_authenticated", "logged_out", "logged-out", "loggedout"];
let v = "unknown";
if (isObj(j)) {
  const vals = KEYS.filter((k) => Object.prototype.hasOwnProperty.call(j, k)).map((k) => j[k]);
  const st = typeof j.status === "string" ? j.status.toLowerCase() : "";
  if (vals.some((x) => x === false) || OUT.includes(st)) v = "out";
  else if (vals.some((x) => x === true) || IN.includes(st)) v = "in";
} else if (j === undefined && /^Logged in as \S/.test(t.split("\n")[0])) v = "in";
process.stdout.write(v);
' "$1" 2>/dev/null || printf 'unknown'
  else
    local v
    v="$(jq -rsj '
if length == 1 and (.[0] | type) == "object" then .[0] as $j
  | ([("isAuthenticated", "authenticated", "isLoggedIn", "loggedIn") as $k | select($j | has($k)) | $j[$k]]) as $vals
  | (if ($j.status | type) == "string" then ($j.status | ascii_downcase) else "" end) as $st
  | if ($vals | index([false])) != null or (["unauthenticated", "not_authenticated", "logged_out", "logged-out", "loggedout"] | index([$st])) != null then "out"
    elif ($vals | index([true])) != null or (["authenticated", "logged_in", "logged-in", "loggedin"] | index([$st])) != null then "in"
    else "unknown" end
else "unknown" end' "$1" 2>/dev/null || true)"
    if [ -z "$v" ]; then
      # Not JSON at all: the observed text form.
      case "$(head -n 1 "$1" 2>/dev/null || true)" in
        "Logged in as "?*) v="in" ;;
        *) v="unknown" ;;
      esac
    fi
    printf '%s' "$v"
  fi
}

# summarize <raw-stream>: parses the stream-json log in node/jq and writes
# $S/s.* — nviol (violation count), viol (up to 5 descriptions: tool kinds
# and result shapes only, never payload content), invalid (lines that are
# not JSON objects), verdict (ok | missing | is_error | subtype |
# is_error_absent, the D40 terminal check), subtype, psrc (assistant |
# result | none), payload (the last assistant message's text, else
# .result), usage ({input_tokens, output_tokens} from result.usage), sid
# (system:init session_id) and init (the logged init fields).
summarize() {
  rm -f -- "$S"/s.* 2>/dev/null || true
  if [ "$JSON_TOOL" = "node" ]; then
    node -e '
const fs = require("fs");
const [, src, dir] = process.argv;
const put = (n, s) => fs.writeFileSync(dir + "/s." + n, s);
let text = ""; try { text = fs.readFileSync(src, "utf8"); } catch {}
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const carries = (v) => Array.isArray(v) ? v.some(carries) : isObj(v) ? Object.entries(v).some(([k, x]) => k.endsWith("ToolCall") || carries(x)) : false;
const tok = (s) => (typeof s === "string" && /^[A-Za-z0-9_]{1,64}$/.test(s) ? s : "<unrecognised>");
const shape = (r) => (isObj(r) && Object.keys(r).length === 1 ? "a " + tok(Object.keys(r)[0]) + " result" : "an unrecognised result");
function tolerated(kind, r) {
  if (!isObj(r) || Object.keys(r).length !== 1) return false;
  if ("error" in r) { const x = r.error; return isObj(x) && Object.keys(x).every((k) => k === "errorMessage") && typeof x.errorMessage === "string"; }
  if ("permissionDenied" in r) { const x = r.permissionDenied; const ok = ["command", "workingDirectory", "error", "isReadonly"]; return isObj(x) && Object.keys(x).every((k) => ok.includes(k)); }
  if ("success" in r && kind === "globToolCall") { const x = r.success; return isObj(x) && Array.isArray(x.files) && x.files.length === 0 && x.totalFiles === 0; }
  return false;
}
const evs = [], v = [];
let invalid = 0;
for (const l of text.split("\n")) {
  if (l.trim() === "") continue;
  let e;
  try { e = JSON.parse(l); } catch { invalid++; if (l.includes("ToolCall\"")) v.push("an unparseable line naming a *ToolCall payload"); continue; }
  if (!isObj(e)) { invalid++; if (carries(e)) v.push("a non-object line carrying a *ToolCall payload"); continue; }
  evs.push(e);
}
const started = new Map(), completed = new Set();
for (const e of evs) {
  if (e.type !== "tool_call") { if (carries(e)) v.push("a " + tok(e.type) + " event carrying a *ToolCall payload"); continue; }
  const kinds = isObj(e.tool_call) ? Object.keys(e.tool_call).filter((k) => k.endsWith("ToolCall")) : [];
  if (kinds.length !== 1) { v.push("a tool_call event with " + kinds.length + " *ToolCall payloads"); continue; }
  const kind = kinds[0];
  if (e.subtype === "started") { started.set(String(e.call_id), kind); continue; }
  if (e.subtype !== "completed") { v.push(tok(kind) + " with tool_call subtype " + tok(e.subtype)); continue; }
  completed.add(String(e.call_id));
  const pl = e.tool_call[kind];
  const r = isObj(pl) ? pl.result : undefined;
  if (!tolerated(kind, r)) v.push(tok(kind) + " completed with " + shape(r));
}
for (const [id, kind] of started) if (!completed.has(id)) v.push(tok(kind) + " started and never completed");
const init = evs.find((e) => e.type === "system" && e.subtype === "init");
const logv = (x) => (x == null ? "<absent>" : JSON.stringify(x).slice(0, 120));
const results = evs.filter((e) => e.type === "result");
const res = results.length ? results[results.length - 1] : null;
let verdict = "missing", subtype = "<absent>";
if (res) {
  if (typeof res.subtype === "string") subtype = /^[A-Za-z0-9_-]{1,64}$/.test(res.subtype) ? res.subtype : JSON.stringify(res.subtype).slice(0, 80);
  verdict = res.is_error === true ? "is_error" : res.subtype !== "success" ? "subtype" : res.is_error !== false ? "is_error_absent" : "ok";
}
const asst = evs.filter((e) => e.type === "assistant");
let psrc = "none", payload = "";
if (asst.length) {
  const last = asst[asst.length - 1];
  const c = isObj(last.message) && Array.isArray(last.message.content) ? last.message.content : [];
  payload = c.map((x) => (isObj(x) && typeof x.text === "string" ? x.text : "")).join("");
  psrc = "assistant";
} else if (res && typeof res.result === "string") { payload = res.result; psrc = "result"; }
const u = res && isObj(res.usage) ? res.usage : null;
put("nviol", String(v.length));
put("viol", v.slice(0, 5).join("; "));
put("invalid", String(invalid));
put("verdict", verdict);
put("subtype", subtype);
put("psrc", psrc);
put("payload", payload);
put("usage", u && typeof u.inputTokens === "number" && typeof u.outputTokens === "number" ? JSON.stringify({ input_tokens: u.inputTokens, output_tokens: u.outputTokens }) : "");
put("sid", init && typeof init.session_id === "string" ? init.session_id : "");
put("init", init ? "init.model=" + logv(init.model) + " init.permissionMode=" + logv(init.permissionMode) + " init.apiKeySource=" + logv(init.apiKeySource) : "init=<absent>");
' "$1" "$S" 2>/dev/null || return 1
  else
    jq -Rsc '
def isobj: type == "object";
def carries: if type == "array" then any(.[]; carries) elif type == "object" then any(to_entries[]; (.key | endswith("ToolCall")) or (.value | carries)) else false end;
def tok: if type == "string" and test("\\A[A-Za-z0-9_]{1,64}\\z") then . else "<unrecognised>" end;
def shape: if isobj then (if (keys | length) == 1 then "a " + (keys[0] | tok) + " result" else "an unrecognised result" end) else "an unrecognised result" end;
def tolerated($kind):
  if isobj | not then false
  elif (keys | length) != 1 then false
  elif has("error") then (.error | if isobj then ((keys - ["errorMessage"]) | length) == 0 and (.errorMessage | type) == "string" else false end)
  elif has("permissionDenied") then (.permissionDenied | if isobj then ((keys - ["command", "workingDirectory", "error", "isReadonly"]) | length) == 0 else false end)
  elif has("success") and $kind == "globToolCall" then (.success | if isobj then (.files | type) == "array" and (.files | length) == 0 and .totalFiles == 0 else false end)
  else false end;
def logv: if . == null then "<absent>" else tojson | .[0:120] end;
[split("\n")[] | select(test("\\S")) | . as $l | (try {ok: true, v: fromjson} catch {ok: false, raw: $l})] as $parsed
| [$parsed[] | select(.ok and (.v | isobj)) | .v] as $evs
| ([$parsed[] | select(.ok | not) | select(.raw | contains("ToolCall\"")) | "an unparseable line naming a *ToolCall payload"]
   + [$parsed[] | select(.ok and (.v | isobj | not)) | select(.v | carries) | "a non-object line carrying a *ToolCall payload"]) as $v0
| ([$parsed[] | select((.ok | not) or (.v | isobj | not))] | length) as $invalid
| (reduce $evs[] as $e ({v: [], started: [], completed: []};
    if $e.type != "tool_call" then
      (if ($e | carries) then .v += ["a " + ($e.type | tok) + " event carrying a *ToolCall payload"] else . end)
    else
      ([($e.tool_call | if isobj then keys_unsorted[] else empty end) | select(endswith("ToolCall"))]) as $kinds
      | if ($kinds | length) != 1 then .v += ["a tool_call event with \($kinds | length) *ToolCall payloads"]
        elif $e.subtype == "started" then .started += [{id: ($e.call_id | tostring), kind: $kinds[0]}]
        elif $e.subtype != "completed" then .v += [($kinds[0] | tok) + " with tool_call subtype " + ($e.subtype | tok)]
        else .completed += [($e.call_id | tostring)]
          | ($e.tool_call[$kinds[0]] | if isobj then .result else null end) as $r
          | if ($r | tolerated($kinds[0])) then . else .v += [($kinds[0] | tok) + " completed with " + ($r | shape)] end
        end
    end)) as $scan
| ($scan.completed) as $done
| ($v0 + $scan.v + [$scan.started | unique_by(.id)[] | select(.id as $i | $done | index([$i]) | not) | (.kind | tok) + " started and never completed"]) as $viol
| ([$evs[] | select(.type == "system" and .subtype == "init")] | first) as $init
| ([$evs[] | select(.type == "result")] | last) as $res
| ([$evs[] | select(.type == "assistant")]) as $asst
| {
    nviol: ($viol | length),
    viol: ($viol[0:5] | join("; ")),
    invalid: $invalid,
    verdict: (if $res == null then "missing"
              elif $res.is_error == true then "is_error"
              elif $res.subtype != "success" then "subtype"
              elif $res.is_error != false then "is_error_absent"
              else "ok" end),
    subtype: (if $res != null and ($res.subtype | type) == "string"
              then ($res.subtype | if test("\\A[A-Za-z0-9_-]{1,64}\\z") then . else (tojson | .[0:80]) end)
              else "<absent>" end),
    psrc: (if ($asst | length) > 0 then "assistant" elif $res != null and ($res.result | type) == "string" then "result" else "none" end),
    payload: (if ($asst | length) > 0
              then ($asst | last | (if (.message | type) == "object" and (.message.content | type) == "array" then .message.content else [] end)
                    | map(if type == "object" and (.text | type) == "string" then .text else "" end) | join(""))
              elif $res != null and ($res.result | type) == "string" then $res.result
              else "" end),
    usage: (if $res != null and ($res.usage | type) == "object" and ($res.usage.inputTokens | type) == "number" and ($res.usage.outputTokens | type) == "number"
            then ({input_tokens: $res.usage.inputTokens, output_tokens: $res.usage.outputTokens} | tojson) else "" end),
    sid: (if $init != null and ($init.session_id | type) == "string" then $init.session_id else "" end),
    init: (if $init == null then "init=<absent>"
           else "init.model=" + ($init.model | logv) + " init.permissionMode=" + ($init.permissionMode | logv) + " init.apiKeySource=" + ($init.apiKeySource | logv) end)
  }' "$1" > "$S/summary.json" 2>/dev/null || return 1
    local k
    for k in nviol viol invalid verdict subtype psrc payload usage sid init; do
      jq -rj --arg k "$k" '.[$k] | tostring' "$S/summary.json" > "$S/s.$k" 2>/dev/null || return 1
    done
  fi
}

# --- Configuration -------------------------------------------------------

ALLOW_KEY="false"
case "$(cfg multi_model_review.per_reviewer.cursor-review-prompter.allow_api_key_billing false)" in
  true|True|TRUE|yes|on) ALLOW_KEY="true" ;;
esac
PARENT_HAS_KEY="false"
if [ -n "${CURSOR_API_KEY:-}" ]; then PARENT_HAS_KEY="true"; fi

TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="gtimeout"
fi

# safe_sid <id>: a session_id the D42 cleanup may use (8-128 of
# [A-Za-z0-9_-], starting alphanumeric: no '/', '.', glob or space).
safe_sid() {
  case "$1" in ''|*[!A-Za-z0-9_-]*|[!A-Za-z0-9]*) return 1 ;; esac
  [ "${#1}" -ge 8 ] && [ "${#1}" -le 128 ]
}

# derive_slug: Cursor's ~/.cursor/projects name for the scratch dir (U15:
# the canonical path without its leading '/', with '/' and '.' as '-',
# e.g. private-tmp-synthex-cursor-<suffix>). Set only when the scratch dir
# is exactly /private/tmp/ or /tmp/ synthex-cursor.<6-32 alphanumerics>;
# anything else leaves SLUG empty and its projects entry is not deleted.
derive_slug() {
  local suffix prefix
  SLUG=""
  case "$W" in
    /private/tmp/synthex-cursor.*) prefix="private-tmp" ;;
    /tmp/synthex-cursor.*) prefix="tmp" ;;
    *) return 0 ;;
  esac
  suffix="${W##*/synthex-cursor.}"
  case "$suffix" in ''|*[!A-Za-z0-9]*) return 0 ;; esac
  if [ "${#suffix}" -lt 6 ] || [ "${#suffix}" -gt 32 ]; then return 0; fi
  case "$W" in
    "/private/tmp/synthex-cursor.$suffix"|"/tmp/synthex-cursor.$suffix") SLUG="$prefix-synthex-cursor-$suffix" ;;
  esac
}

# record_session: this attempt's system:init session_id, when safe.
record_session() {
  local sid
  sid="$(cat -- "$S/s.sid" 2>/dev/null || true)"
  if safe_sid "$sid"; then printf '%s\n' "$sid" >> "$S/sessions"; fi
}

# cursor_state_cleanup (D42): deletes exactly $HOME/.cursor/projects/$SLUG
# and $HOME/.cursor/chats/<hash>/<session_id> for this run's recorded
# sessions. Every path component must be a real directory (no symlink is
# followed); a missing or unsafe slug or id deletes nothing for that path.
cursor_state_cleanup() {
  local home="${HOME:-}" base e h sid
  case "$home" in /*) ;; *) return 0 ;; esac
  base="$home/.cursor"
  if [ ! -d "$base" ] || [ -L "$base" ]; then return 0; fi
  if [ -n "$SLUG" ] && [ -d "$base/projects" ] && [ ! -L "$base/projects" ]; then
    e="$base/projects/$SLUG"
    if [ -d "$e" ] && [ ! -L "$e" ]; then rm -rf -- "$e" 2>/dev/null || true; fi
  fi
  if [ -z "$S" ] || [ ! -s "$S/sessions" ]; then return 0; fi
  if [ ! -d "$base/chats" ] || [ -L "$base/chats" ]; then return 0; fi
  while IFS= read -r sid; do
    safe_sid "$sid" || continue
    for h in "$base/chats"/*; do
      if [ ! -d "$h" ] || [ -L "$h" ]; then continue; fi
      case "${h##*/}" in ''|*[!A-Za-z0-9_-]*) continue ;; esac
      e="$h/$sid"
      if [ -d "$e" ] && [ ! -L "$e" ]; then rm -rf -- "$e" 2>/dev/null || true; fi
    done
  done < "$S/sessions"
}

cleanup() {
  stop_cli
  cursor_state_cleanup || true
  if [ -n "$W" ] && [ -d "$W" ] && [ "$W" != "/" ]; then rm -rf -- "$W" 2>/dev/null || true; fi
  if [ -n "$S" ] && [ -d "$S" ] && [ "$S" != "/" ]; then rm -rf -- "$S" 2>/dev/null || true; fi
}

# on_signal <exit>: the runner itself was interrupted. Stop cursor-agent;
# in --input mode keep any partial raw output and still leave an envelope.
on_signal() {
  trap '' INT TERM
  stop_cli
  if [ "$MODE" = "review" ]; then
    if [ -n "$RAW_ABS" ] && [ -e "$RAW_ABS.tmp" ]; then
      mv -f -- "$RAW_ABS.tmp" "$RAW_ABS" 2>/dev/null || true
      if summarize "$RAW_ABS"; then record_session; fi
    fi
    FAIL_EXIT="$1"
    fail cli_failed "cursor-review.sh was interrupted; the code was not reviewed."
  fi
  exit "$1"
}
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

# make_scratch: the untrusted workspace (W) every cursor-agent call runs in,
# and a separate private dir (S) for the runner's own working files.
make_scratch() {
  W="$(mktemp -d /tmp/synthex-cursor.XXXXXX 2>/dev/null || true)"
  if [ -n "$W" ]; then W="$(cd -P -- "$W" && pwd -P || true)"; fi
  [ -n "$W" ] && [ -d "$W" ] && [ "$W" != "$PWD" ] || return 1
  trap cleanup EXIT
  S="$(mktemp -d /tmp/synthex-cursor-run.XXXXXX 2>/dev/null || true)"
  if [ -n "$S" ]; then S="$(cd -P -- "$S" && pwd -P || true)"; fi
  [ -n "$S" ] && [ -d "$S" ] && [ "$S" != "$PWD" ] && [ "$S" != "$W" ] || return 1
  derive_slug
}

# write_deny_file (D37): <scratch>/.cursor/cli.json from the shipped file,
# written without clobbering anything already there, then read back.
write_deny_file() {
  mkdir -- "$W/.cursor" 2>/dev/null || return 1
  ( set -C; cat -- "$DENY_SRC" > "$W/.cursor/cli.json" ) 2>/dev/null || return 1
  deny_readback
}

# isolate: call only inside a subshell. Enters the scratch dir, checking it
# explicitly (errexit is ignored when the caller runs as `auth_probe ||
# rc=$?`), then applies the D26/D37 environment. Exit 125 runs no
# cursor-agent.
isolate() {
  cd -- "$W" 2>/dev/null || exit 125
  [ "$(pwd -P)" = "$W" ] || exit 125
  unset CURSOR_CONFIG_DIR
  if [ "$ALLOW_KEY" != "true" ]; then unset CURSOR_API_KEY; fi
}

# guarded <limit> <stdin: prompt|none> <stdout-file> <stderr-file>
# <cursor-agent args...>: one isolated cursor-agent call, backgrounded and
# waited on (so an INT/TERM trap runs promptly and can stop the child),
# killed after <limit> seconds by timeout/gtimeout or else by a bash
# watchdog. Sets RC, TIMED_OUT and ISOLATE_FAILED. The auth probe and the
# review both go through here, so the two timeout branches always run the
# same argv. With stdin "prompt" the prompt is piped straight from
# emit_prompt (D39). The output files are opened only by the exec, after
# isolate's checks, so a failed check (exit 125 and no <stderr-file>)
# writes nothing and runs no cursor-agent.
RC=0
TIMED_OUT=0
ISOLATE_FAILED=0
PROMPT_RETRY=0
guarded() {
  local limit="$1" feed="$2" out="$3" err="$4"
  shift 4
  if [ "$limit" -lt 1 ]; then limit=1; fi
  RC=0
  TIMED_OUT=0
  ISOLATE_FAILED=0
  rm -f -- "$S/.timedout" "$out" "$err" 2>/dev/null || true
  local -a cmd
  if [ -n "$TIMEOUT_BIN" ]; then
    cmd=("$TIMEOUT_BIN" -k 5 "$limit" cursor-agent "$@")
  else
    cmd=(cursor-agent "$@")
  fi
  if [ "$feed" = "prompt" ]; then
    { emit_prompt "$PROMPT_RETRY" 2>/dev/null || true; } | (isolate; exec "${cmd[@]}" > "$out" 2> "$err") &
  else
    (isolate; exec "${cmd[@]}" > "$out" 2> "$err") < /dev/null &
  fi
  CLI_PID=$!
  if [ -z "$TIMEOUT_BIN" ]; then
    local pid=$CLI_PID
    (sleep "$limit"; : > "$S/.timedout"; kill -TERM "$pid" 2>/dev/null; sleep 5; kill -KILL "$pid" 2>/dev/null) \
      < /dev/null > /dev/null 2>&1 &
    WATCHDOG_PID=$!
  fi
  wait "$CLI_PID" || RC=$?
  CLI_PID=""
  if [ -n "$WATCHDOG_PID" ]; then
    kill "$WATCHDOG_PID" 2>/dev/null || true
    WATCHDOG_PID=""
  fi
  if [ "$RC" = 125 ] && [ ! -e "$err" ]; then
    ISOLATE_FAILED=1
  elif [ -n "$TIMEOUT_BIN" ]; then
    case "$RC" in 124|137) TIMED_OUT=1 ;; esac
  elif [ -e "$S/.timedout" ]; then
    TIMED_OUT=1
  fi
}

SCRATCH_MSG="cursor-review.sh could not enter its scratch dir (it vanished or no longer resolves to itself), so cursor-agent was not run and the code was not reviewed."
DENY_MSG="cursor-review.sh could not write and read back the D37 deny file <scratch>/.cursor/cli.json, so cursor-agent was not run (reads would not be confined) and the code was not reviewed."
GUARD_MSG="cursor-review-prompter needs an explicit, non-Auto model slug and an explicit family: set multi_model_review.per_reviewer.cursor-review-prompter.model (e.g. claude-opus-5-thinking-high; never auto) and .family (e.g. anthropic). Auto hides the model that answers, so it is never used (D26); the code was not reviewed."

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

# model_guard (D26): MODEL and FAMILY explicit; the model not Auto and
# shaped like a slug (it is an argv value, so never a leading '-').
model_guard() {
  case "$MODEL" in ''|[Aa][Uu][Tt][Oo]*) return 1 ;; esac
  [[ $MODEL =~ $MODEL_RE ]] || return 1
  [ -n "$FAMILY" ] || return 1
  [[ $FAMILY =~ $FAMILY_RE ]] || return 1
}

# auth_probe: 0 logged in (positively matched), 10 missing, 11 not
# authenticated / unrecognised, 12 key only without opt-in, 13 no answer
# before the bound (PROBE_LIMIT seconds), 14 the scratch dir could not be
# entered (cursor-agent was not run).
PROBE_LIMIT=$PROBE_CAP
auth_probe() {
  command -v cursor-agent >/dev/null 2>&1 || return 10
  local v
  guarded "$PROBE_LIMIT" none "$S/status.out" "$S/status.err" status --format json
  if [ "$ISOLATE_FAILED" = 1 ]; then return 14; fi
  v="$(status_verdict "$S/status.out")"
  if [ "$v" = "in" ] && [ "$RC" = 0 ]; then return 0; fi
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
  if ! command -v cursor-agent >/dev/null 2>&1; then
    note "cursor-agent is not on PATH; install with: $INSTALL_HINT"
    exit 10
  fi
  MODEL="$(cfg multi_model_review.per_reviewer.cursor-review-prompter.model "")"
  FAMILY="$(cfg multi_model_review.per_reviewer.cursor-review-prompter.family "")"
  if ! model_guard; then
    note "$GUARD_MSG"
    exit 12
  fi
  if [ -z "$JSON_TOOL" ]; then
    note "node or jq is needed to read cursor-agent status --format json; treating as not authenticated"
    exit 11
  fi
  if ! make_scratch; then
    note "could not create a safe scratch dir under /tmp"
    exit 11
  fi
  compute_budget
  SECONDS=0
  if ! write_deny_file; then
    note "$DENY_MSG"
    exit 11
  fi
  probe_limit
  rc=0
  auth_probe || rc=$?
  case "$rc" in
    0) printf 'cursor-agent: authenticated\n' ;;
    13) note "cursor-agent status did not answer within ${PROBE_LIMIT}s; treating as not authenticated"; rc=11 ;;
    14) note "$SCRATCH_MSG"; rc=11 ;;
    12) note "only CURSOR_API_KEY is available; it bills per request. Run cursor-agent login, or opt in with multi_model_review.per_reviewer.cursor-review-prompter.allow_api_key_billing: true" ;;
    *) note "not authenticated (or cursor-agent status --format json gave no recognised logged-in form); run cursor-agent login" ;;
  esac
  exit "$rc"
fi

# --- --input -------------------------------------------------------------

if [ -z "$JSON_TOOL" ]; then
  fail unknown_error "cursor-review.sh needs node or jq to read the input envelope and cursor-agent's stream-json output; neither is on PATH."
fi

RAW="$(env_get raw_output_path)"
if [ -z "$RAW" ]; then
  RAW="${INPUT%.input.json}.raw.ndjson"
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
  fail unknown_error "cursor-review.sh cannot write raw_output_path $BAD_RAW (or its .stderr.log); no cursor-agent call was made."
fi

case "$(env_get allow_api_key_billing)" in
  true) ALLOW_KEY="true" ;;
esac

# D29: parent-mediated is unsupported; sandbox-yolo is a no-op alias of
# read-only. The CLI is never spawned for an unsupported mode.
PERM="$(cfg multi_model_review.external_permission_mode.cursor "")"
if [ -z "$PERM" ]; then PERM="$(cfg multi_model_review.external_permission_mode.default read-only)"; fi
case "$PERM" in
  parent-mediated)
    fail cli_unsupported_mode "cursor: external_permission_mode parent-mediated is not supported (text-only adapter, D29); use read-only." ;;
  read-only|sandbox-yolo|"") ;;
  *) note "unknown external_permission_mode.cursor '$PERM'; running read-only" ;;
esac

# 1. CLI presence (the binary name is hardcoded; never from config, and
# never the `agent` alias, which can be Grok's).
if ! command -v cursor-agent >/dev/null 2>&1; then
  fail cli_missing "cursor-agent is not installed. Install: $INSTALL_HINT, then run cursor-agent login."
fi

# D26 model and family guard, before anything is spawned.
MODEL="$(env_get model)"
if [ -z "$MODEL" ]; then MODEL="$(cfg multi_model_review.per_reviewer.cursor-review-prompter.model "")"; fi
FAMILY="$(env_get family)"
if [ -z "$FAMILY" ]; then FAMILY="$(cfg multi_model_review.per_reviewer.cursor-review-prompter.family "")"; fi
if ! model_guard; then
  fail cli_failed "$GUARD_MSG"
fi

SCHEMA_JSON="$(
  if [ "$JSON_TOOL" = "node" ]; then
    node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))))' "$SCHEMA_FILE"
  else
    jq -cj . "$SCHEMA_FILE"
  fi 2>/dev/null || true
)"
if [ -z "$SCHEMA_JSON" ]; then
  fail unknown_error "cursor-review.sh could not read the strict findings schema at agents/_shared/codex-findings.schema.json."
fi
# 3. Prompt construction: built in memory on every call (D39); checked
# here once so a bad envelope never reaches cursor-agent as an empty prompt.
if ! emit_prompt 0 > /dev/null 2>&1; then
  fail unknown_error "cursor-review.sh could not read context_bundle from the input envelope."
fi

if ! make_scratch; then
  fail unknown_error "cursor-review.sh could not create a safe scratch dir under /tmp."
fi

# 4. Wall-clock guard: per_reviewer_timeout_seconds - 10, clamped in the
# foreground (no --envelope-out) to the host shell cap - 15. The clock
# starts here, so the auth probe spends the same budget as the review.
compute_budget
SECONDS=0

# D37: the deny file, before any cursor-agent call.
if ! write_deny_file; then
  fail cli_failed "$DENY_MSG"
fi

# 2. Auth (D26).
probe_limit
arc=0
auth_probe || arc=$?
case "$arc" in
  0) ;;
  13) fail timeout "cursor-agent status (the auth probe) did not answer within ${PROBE_LIMIT}s of the ${BUDGET}s wall-clock budget; no review was run." ;;
  14) fail unknown_error "$SCRATCH_MSG" ;;
  12) fail cli_auth_failed "cursor: only CURSOR_API_KEY is available, which bills per request. Run cursor-agent login, or opt in with per_reviewer.cursor-review-prompter.allow_api_key_billing: true." ;;
  *) fail cli_auth_failed "cursor: not authenticated (cursor-agent status --format json gave no recognised logged-in form). Run cursor-agent login." ;;
esac

PARSE_RETRIED=0
ATTEMPT=0

# run_cursor: one isolated review invocation. Raw stdout lands in $RAW_ABS
# (atomic rename on every path, timeout included) before anything parses
# it; the scan then runs on whatever stream exists.
run_cursor() {
  ATTEMPT=$((ATTEMPT + 1))
  local left=$((BUDGET - SECONDS))
  if [ "$left" -lt 1 ]; then
    fail timeout "cursor-agent exceeded the ${BUDGET}s wall-clock budget (per_reviewer_timeout_seconds - 10, host-clamped) before review attempt $ATTEMPT could start."
  fi
  PROMPT_RETRY="$PARSE_RETRIED"
  guarded "$left" prompt "$RAW_ABS.tmp" "$S/stderr.$ATTEMPT" \
    -p --mode ask --sandbox enabled --trust --output-format stream-json --model "$MODEL"
  if [ "$ISOLATE_FAILED" = 1 ]; then
    fail unknown_error "$SCRATCH_MSG"
  fi
  if ! mv -f -- "$RAW_ABS.tmp" "$RAW_ABS" 2>/dev/null; then
    BAD_RAW="$RAW"
    RAW=""
    fail unknown_error "cursor-review.sh could not write cursor-agent's output to raw_output_path $BAD_RAW (attempt $ATTEMPT exit $RC)."
  fi
  {
    printf '[cursor-review.sh] attempt %s exit %s\n' "$ATTEMPT" "$RC"
    cat -- "$S/stderr.$ATTEMPT"
  } >> "$STDERR_LOG" 2>/dev/null || true
}

while :; do
  run_cursor
  ERR="$(cat -- "$S/stderr.$ATTEMPT" 2>/dev/null || true)"

  if ! summarize "$RAW_ABS"; then
    fail unknown_error "cursor-review.sh could not scan cursor-agent's stream-json output (attempt $ATTEMPT exit $RC); raw output kept at raw_output_path."
  fi
  record_session
  # D37/f: logged for audit, never gated on.
  printf '[cursor-review.sh] attempt %s %s\n' "$ATTEMPT" "$(cat -- "$S/s.init")" >> "$STDERR_LOG" 2>/dev/null || true

  # D38: a violation outranks every other result; the raw output is kept.
  NVIOL="$(cat -- "$S/s.nviol")"
  if [ "$NVIOL" != "0" ]; then
    fail sandbox_violation "cursor-agent stream has $NVIOL tool-call violation(s) under the D38 allowlist ($(cat -- "$S/s.viol")): a tool call returned content, so the D37 deny file did not hold and file contents may have reached the provider. Raw output kept at raw_output_path; do not share it."
  fi

  if [ "$TIMED_OUT" = 1 ]; then
    fail timeout "cursor-agent exceeded the ${BUDGET}s wall-clock budget (per_reviewer_timeout_seconds - 10, host-clamped); partial raw output kept at raw_output_path."
  fi
  if [ "$RC" = 130 ]; then
    fail cli_failed "cursor-agent was interrupted (exit 130); the code was not reviewed."
  fi

  VERDICT="$(cat -- "$S/s.verdict")"
  if [ "$RC" != 0 ] || [ "$VERDICT" = "missing" ]; then
    case "$ERR" in
      *"$FREE_PLAN_TEXT"*)
        fail cli_failed "cursor-agent refused the named model '$MODEL' (Named models unavailable): Cursor's Free plan allows only Auto, and a named model needs a paid Cursor plan. Upgrade the plan, or remove cursor-review-prompter from multi_model_review.reviewers. The runner never falls back to Auto (D26, D43); the code was not reviewed." ;;
      *"$UNKNOWN_MODEL_TEXT"*)
        fail cli_failed "cursor-agent cannot use the configured model '$MODEL'. Run cursor-agent models to list the slugs this account can use, then set multi_model_review.per_reviewer.cursor-review-prompter.model; the code was not reviewed." ;;
    esac
    if printf '%s\n' "$ERR" | grep -Eiq "$AUTH_RE"; then
      fail cli_auth_failed "cursor: not authenticated (exit $RC). Run cursor-agent login; the code was not reviewed."
    fi
    if [ "$RC" != 0 ]; then
      fail cli_failed "cursor-agent exited $RC without a usable result (see the .stderr.log next to raw_output_path); the code was not reviewed."
    fi
    fail cli_failed "cursor-agent exited 0 without a result event; the code was not reviewed."
  fi

  INVALID="$(cat -- "$S/s.invalid")"
  if [ "$INVALID" != "0" ]; then
    fail cli_failed "cursor-agent printed $INVALID stream line(s) that are not JSON objects; the run cannot be trusted, so the code was not reviewed."
  fi

  # D40 terminal checks, decided in node/jq: subtype exactly "success",
  # is_error exactly false.
  case "$VERDICT" in
    ok) ;;
    is_error) fail cli_failed "cursor-agent's result event has is_error: true; the code was not reviewed." ;;
    subtype) fail cli_failed "cursor-agent's result subtype is $(cat -- "$S/s.subtype"), not success; the code was not reviewed." ;;
    *) fail cli_failed "cursor-agent's result event does not say is_error: false; the code was not reviewed." ;;
  esac

  # 5. Output parsing (D40): the last assistant message, else .result.
  # usage.model is the configured slug (init.model is a display name).
  USAGE="$(cat -- "$S/s.usage")"
  VF_ARGS=(--reviewer-id "$REVIEWER_ID" --family "$FAMILY" --raw-output-path "$RAW" --input "$S/s.payload" --model "$MODEL")
  if [ -n "$USAGE" ]; then VF_ARGS+=(--usage-json "$USAGE"); fi
  ENV_OUT="$(bash "$VALIDATE" "${VF_ARGS[@]}")"

  # 6. Retry once on parse_failed (a second billed call).
  if [ "$PARSE_RETRIED" = 0 ] && printf '%s' "$ENV_OUT" | grep -Eq '"error_code"[[:space:]]*:[[:space:]]*"parse_failed"'; then
    PARSE_RETRIED=1
    continue
  fi

  # 7-8. validate-findings already normalized it; return it unchanged.
  emit "$ENV_OUT"
  exit 0
done

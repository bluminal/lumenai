#!/usr/bin/env bash
# config-get.sh — portable dotted-key reader for Synthex project config (D26).
#
# Usage: config-get.sh <dotted.key> [default]
#
# Resolves a single scalar value for <dotted.key> by checking, in order:
#
#   1. <project>/.synthex/config.yaml        project override (current)
#   2. <project>/.synthex-plus/config.yaml    D6 legacy fallback (deprecated;
#                                              kept for one major version).
#                                              When the key resolves ONLY
#                                              here, a deprecation notice is
#                                              printed to stderr.
#   3. <plugin>/config/defaults.yaml          plugin-shipped default
#   4. the [default] argument, if given
#   5. an empty string
#
# <plugin> is resolved from this script's own location (two directories
# above plugins/synthex/scripts/lib/), so it works regardless of the
# caller's cwd. <project> is $CLAUDE_PROJECT_DIR if set, else $PWD.
#
# Only a documented SUBSET of YAML is understood (D26 "subset"): nested
# mappings via consistent (any-width) indentation, full-line and trailing
# `#` comments, and bare / single-quoted / double-quoted scalars. Lists,
# flow collections (`{...}`/`[...]`), anchors, and block scalars are not
# parsed; a dotted path landing on one of those (or on a mapping header
# with no inline scalar) resolves as not-found and falls through the chain
# above like a missing key.
#
# Node (guarded by `command -v node`) is preferred when present because it
# parses the same subset with a single pass and clearer string handling;
# a pure bash + awk parser with IDENTICAL resolution semantics is used
# otherwise. No `jq`, `yq`, or `python` is required either way.
#
# Fails open (D26): this script never blocks a caller with a non-zero exit
# for a data problem. A missing file, a missing key, or an unparseable
# (malformed) source all degrade to the [default] argument (or, for
# malformed input specifically, to an empty value) rather than erroring.
#
# Exit codes:
#   0 - always. A usage problem (no <dotted.key> given) or a malformed
#       source both print an empty value rather than raising an error;
#       check the printed value, not the exit status.

set -u

DOTTED_KEY="${1:-}"
CFG_DEFAULT="${2:-}"

if [ -z "$DOTTED_KEY" ]; then
  echo "config-get: usage: config-get.sh <dotted.key> [default]" >&2
  exit 0
fi

# Resolve this script's own directory using pure bash string manipulation
# (no `dirname` dependency) so it works on a minimal PATH.
SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
case "$SCRIPT_SOURCE" in
  */*) SCRIPT_DIR_RAW="${SCRIPT_SOURCE%/*}" ;;
  *) SCRIPT_DIR_RAW="." ;;
esac
SCRIPT_DIR="$(cd -- "$SCRIPT_DIR_RAW" 2>/dev/null && pwd -P)"
if [ -z "$SCRIPT_DIR" ]; then
  # Cannot even resolve our own location; fail open with the caller default.
  printf '%s\n' "$CFG_DEFAULT"
  exit 0
fi
PLUGIN_DIR="$(cd -- "$SCRIPT_DIR/../.." 2>/dev/null && pwd -P)"
DEFAULTS_FILE="${PLUGIN_DIR:-$SCRIPT_DIR}/config/defaults.yaml"

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
PROJECT_CONFIG="$PROJECT_ROOT/.synthex/config.yaml"
LEGACY_CONFIG="$PROJECT_ROOT/.synthex-plus/config.yaml"

DEPRECATION_NOTICE="config-get: '$DOTTED_KEY' resolved from deprecated .synthex-plus/config.yaml (D6 fallback); migrate to .synthex/config.yaml before the next major release."

# --- Preferred path: node -----------------------------------------------
if command -v node >/dev/null 2>&1; then
  node - "$DOTTED_KEY" "$CFG_DEFAULT" "$PROJECT_CONFIG" "$LEGACY_CONFIG" "$DEFAULTS_FILE" "$DEPRECATION_NOTICE" <<'NODE_SCRIPT'
const fs = require('fs');
const [, , dottedKey, defaultValue, projectConfig, legacyConfig, defaultsFile, deprecationNotice] =
  process.argv;

// Parses one already-unindented scalar token (the text after "key:").
// Returns the unquoted string, or null if it looks malformed (an
// unterminated quote, or non-comment junk after a closing quote).
function parseScalar(s) {
  if (s.length === 0) return '';
  const q = s[0];
  if (q === '"' || q === "'") {
    let out = '';
    let i = 1;
    while (i < s.length) {
      const c = s[i];
      if (q === '"' && c === '\\' && i + 1 < s.length) {
        out += s[i + 1];
        i += 2;
        continue;
      }
      if (q === "'" && c === "'" && s[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      if (c === q) {
        const after = s.slice(i + 1).trim();
        if (after !== '' && after[0] !== '#') return null;
        return out;
      }
      out += c;
      i++;
    }
    return null; // unterminated quote
  }
  const idx = s.search(/\s#/);
  const v = idx === -1 ? s : s.slice(0, idx);
  return v.trim();
}

// Reads one dotted key out of a subset-YAML file.
// Returns { status: 'missing' | 'notfound' | 'malformed' | 'found', value? }
function readKey(filePath, dotted) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { status: 'missing' };
  }
  const want = dotted.split('.');
  const stack = []; // [{ indent, key }]
  const lines = text.split(/\r\n|\r|\n/);
  for (const raw of lines) {
    const trimmed = raw.replace(/^[ \t]+/, '');
    if (trimmed === '' || trimmed[0] === '#') continue;
    const m = trimmed.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!m) continue; // list item, flow collection, block scalar, etc.: not in the subset
    const indent = raw.length - trimmed.length;
    const key = m[1];
    const rest = m[2];
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    stack.push({ indent, key });
    if (stack.length === want.length && stack.every((s, i) => s.key === want[i])) {
      const val = rest.replace(/^[ \t]+/, '');
      if (val === '') return { status: 'notfound' }; // mapping header, not a scalar
      const parsed = parseScalar(val);
      if (parsed === null) return { status: 'malformed' };
      return { status: 'found', value: parsed };
    }
  }
  return { status: 'notfound' };
}

let result = readKey(projectConfig, dottedKey);
if (result.status === 'found') {
  process.stdout.write(result.value + '\n');
  process.exit(0);
}
if (result.status === 'malformed') {
  process.stdout.write('\n');
  process.exit(0);
}

result = readKey(legacyConfig, dottedKey);
if (result.status === 'found') {
  process.stderr.write(deprecationNotice + '\n');
  process.stdout.write(result.value + '\n');
  process.exit(0);
}
if (result.status === 'malformed') {
  process.stdout.write('\n');
  process.exit(0);
}

result = readKey(defaultsFile, dottedKey);
if (result.status === 'found') {
  process.stdout.write(result.value + '\n');
  process.exit(0);
}
if (result.status === 'malformed') {
  process.stdout.write('\n');
  process.exit(0);
}

process.stdout.write(defaultValue + '\n');
process.exit(0);
NODE_SCRIPT
  exit $?
fi

# --- Fallback path: pure bash + awk (no node on PATH) --------------------
#
# Same resolution semantics as the node path above, implemented with an awk
# program per source file. The awk program emits exactly one line encoding
# its result as "<STATUS>\001<VALUE>" (STATUS one of FOUND/NOTFOUND/
# MALFORMED); \001 (SOH) is used as the field separator instead of ":" or a
# space because scalar values may legitimately contain either.
read_key() {
  # $1 = file path, $2 = dotted key. Sets RK_STATUS and RK_VALUE.
  local file="$1" dotted="$2" out
  if [ ! -r "$file" ]; then
    RK_STATUS="missing"
    RK_VALUE=""
    return
  fi
  out="$(awk -v dotted="$dotted" '
    function parse_scalar(s,    q, i, c, out, after) {
      if (length(s) == 0) return ""
      q = substr(s, 1, 1)
      if (q == "\"" || q == "\x27") {
        out = ""
        i = 2
        while (i <= length(s)) {
          c = substr(s, i, 1)
          if (q == "\"" && c == "\\" && i < length(s)) {
            out = out substr(s, i + 1, 1)
            i += 2
            continue
          }
          if (q == "\x27" && c == "\x27" && substr(s, i + 1, 1) == "\x27") {
            out = out "\x27"
            i += 2
            continue
          }
          if (c == q) {
            after = substr(s, i + 1)
            gsub(/^[ \t]+/, "", after)
            if (after != "" && substr(after, 1, 1) != "#") return "\002malformed\002"
            return out
          }
          out = out c
          i++
        }
        return "\002malformed\002"
      }
      idx = index(s, " #")
      if (idx > 0) s = substr(s, 1, idx - 1)
      gsub(/^[ \t]+|[ \t]+$/, "", s)
      return s
    }
    {
      line = $0
      t = line
      gsub(/^[ \t]+/, "", t)
      if (t == "" || substr(t, 1, 1) == "#") next
      if (match(line, /^[ \t]*/) == 0) { indent = 0 } else { indent = RLENGTH }
      keypart = substr(line, indent + 1)
      if (match(keypart, /^[A-Za-z0-9_-]+:/) == 0) next
      key = substr(keypart, 1, RLENGTH - 1)
      rest = substr(keypart, RLENGTH + 1)

      while (depth > 0 && stack_indent[depth] >= indent) depth--
      depth++
      stack_indent[depth] = indent
      stack_key[depth] = key

      if (depth == n_want) {
        ok = 1
        for (i = 1; i <= n_want; i++) if (stack_key[i] != want[i]) { ok = 0; break }
        if (ok) {
          val = rest
          gsub(/^[ \t]+/, "", val)
          if (val == "") { print "NOTFOUND\001"; found = 1; exit }
          parsed = parse_scalar(val)
          if (parsed == "\002malformed\002") { print "MALFORMED\001" }
          else { printf "FOUND\001%s\n", parsed }
          found = 1
          exit
        }
      }
    }
    BEGIN { n_want = split(dotted, want, ".") ; depth = 0 }
    END { if (!found) print "NOTFOUND\001" }
  ' "$file")"
  case "$out" in
    FOUND$'\001'*)
      RK_STATUS="found"
      RK_VALUE="${out#FOUND$'\001'}"
      ;;
    MALFORMED$'\001'*)
      RK_STATUS="malformed"
      RK_VALUE=""
      ;;
    *)
      RK_STATUS="notfound"
      RK_VALUE=""
      ;;
  esac
}

read_key "$PROJECT_CONFIG" "$DOTTED_KEY"
if [ "$RK_STATUS" = "found" ]; then printf '%s\n' "$RK_VALUE"; exit 0; fi
if [ "$RK_STATUS" = "malformed" ]; then printf '\n'; exit 0; fi

read_key "$LEGACY_CONFIG" "$DOTTED_KEY"
if [ "$RK_STATUS" = "found" ]; then
  echo "$DEPRECATION_NOTICE" >&2
  printf '%s\n' "$RK_VALUE"
  exit 0
fi
if [ "$RK_STATUS" = "malformed" ]; then printf '\n'; exit 0; fi

read_key "$DEFAULTS_FILE" "$DOTTED_KEY"
if [ "$RK_STATUS" = "found" ]; then printf '%s\n' "$RK_VALUE"; exit 0; fi
if [ "$RK_STATUS" = "malformed" ]; then printf '\n'; exit 0; fi

printf '%s\n' "$CFG_DEFAULT"
exit 0

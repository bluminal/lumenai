#!/usr/bin/env node
/*
write-audit.mjs — writes the per-invocation multi-model review audit
markdown artifact (FR-MR24, FR-HM26, FR-HM44) that the now-retired
audit-artifact-writer agent used to describe. Reproduces its file path,
naming, and markdown sections exactly (Task 42). Called from
multi-model-review-orchestrator.md's Step 9, guarded with
`command -v node`; when node is unavailable the orchestrator renders the
identical markdown itself with its Write tool (the documented prose
fallback — see multi-model-review-orchestrator.md Step 9).

Usage:
  node write-audit.mjs [<input-json-path>]

Reads the invocation envelope (below) from <input-json-path> if given,
otherwise from stdin, and prints a single JSON result line to stdout.

Input envelope (top-level object):
  command                 "review-code" | "write-implementation-plan"  (required)
  invocation_metadata      { target, timestamp (ISO 8601 UTC), short_hash,
                             config_file_path? (default ".synthex/config.yaml") }  (required)
  config_snapshot          the resolved `multi_model_review` block's inner
                            fields (this script supplies the wrapping
                            "multi_model_review:" YAML key)  (required)
  preflight_result         { summary: string, lines?: string[] }  (required)
  unified_envelope         { per_reviewer_results: [{ reviewer_id, source_type
                              ("native-team"|"native-recovery"|"external"),
                              family, status, findings_count, error_code,
                              usage }], findings: [{ finding_id, severity,
                              category, title, file, symbol?, raised_by:
                              [{reviewer_id, family, source_type}],
                              severity_range?, severity_reasoning?,
                              superseded_by_verification, verification_reasoning?,
                              verification? (FR-HM17/Task 58 — {status, method,
                              failure_scenario}; a SEPARATE field from
                              superseded_by_verification/verification_reasoning
                              above, never reused for it: that pair marks a
                              multi-model CoVe contradiction-adjudication
                              loser, this one marks an adversarial-refute-pass
                              outcome on a single finding),
                              minority_of_one? }], aggregator_resolution:
                              { name, source }, consolidation_trace?: {
                              stage4_calls_dispatched, stage4_calls_skipped,
                              stage4_audit_warning?, position_randomization_seed?,
                              judge_mode_indicator }, continuation_event: null
                              | { type, details, per_reviewer_error_codes? } }  (required)
  audit_config              { enabled, output_path (default "docs/reviews/"),
                              record_finding_attribution_telemetry? (default true) }  (required)
  team_metadata             optional — { team_name, team_type, multi_model?,
                              reviewer_roster: [{reviewer_id, spawn_timestamp}],
                              cross_domain_messages: { count, messages:
                              [{from, to, subject, timestamp}] } }
  pool_routing              optional — { routing_decision, pool_name,
                              pool_multi_model, match_rationale, would_have_routed }
  recovery                  optional — { occurred, failed_reviewer,
                              recovery_finding_count }

Output (stdout, one JSON object):
  { "status": "written", "path", "filename", "size_bytes", "sections_present",
    "continuation_event_included" }
  { "status": "skipped", "reason": "audit.enabled is false" }

Filename: <YYYY-MM-DD>-<command>-<short_hash>.md, written atomically
(".tmp" then rename) under <audit_config.output_path>, resolved against
$CLAUDE_PROJECT_DIR (falling back to the current working directory).
Before writing, the output directory's writability is proven the same
way loop-step.sh's check-writable and init-scaffold.sh's
check_writable_dir do: mkdir -p, then create-and-remove a probe file
(FR-HM18).

# Exit codes:
#   0 - audit written, or skipped (audit_config.enabled is false)
#   1 - invalid input: malformed JSON, or a required field is missing
#   2 - the output directory is not writable, or the write itself failed
*/

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// check_writable_dir — FR-HM18 writability preflight. Mirrors
// loop-step.sh/init-scaffold.sh's check_writable_dir: mkdir -p, then
// creates and removes a probe file to prove the directory is actually
// writable (not merely mkdir-able under some sandboxes).
// ---------------------------------------------------------------------------
function checkWritableDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return false;
  }
  const probe = join(dir, `.write-audit-check.${process.pid}`);
  try {
    writeFileSync(probe, '');
  } catch {
    return false;
  }
  try {
    unlinkSync(probe);
  } catch {
    // Non-fatal: the probe write itself already proved writability.
  }
  return true;
}

// ---------------------------------------------------------------------------
// Minimal YAML dumper (write-only; this script never parses YAML) for the
// Section 2 Config Snapshot fenced block. Matches the plain, unquoted style
// D26's config-get.sh reader already assumes elsewhere in the codebase.
// ---------------------------------------------------------------------------
function scalarToYaml(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const str = String(value);
  if (str === '' || /[:#]/.test(str)) return JSON.stringify(str);
  return str;
}

function toYaml(value, indent) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`;
    return value.map((entry) => `${pad}- ${scalarToYaml(entry)}\n`).join('');
  }
  if (value !== null && typeof value === 'object') {
    let out = '';
    for (const [key, val] of Object.entries(value)) {
      if (val !== null && typeof val === 'object') {
        out += `${pad}${key}:\n${toYaml(val, indent + 1)}`;
      } else {
        out += `${pad}${key}: ${scalarToYaml(val)}\n`;
      }
    }
    return out;
  }
  return `${pad}${scalarToYaml(value)}\n`;
}

// ---------------------------------------------------------------------------
// Section renderers (FR-MR24 §7 + FR-MMT30/30a §4)
// ---------------------------------------------------------------------------

function renderSection1(command, meta) {
  const configPath = meta.config_file_path || '.synthex/config.yaml';
  return [
    '## 1. Invocation Metadata',
    `- Command: ${command}`,
    `- Target: ${meta.target}`,
    `- Timestamp: ${meta.timestamp}`,
    `- Short hash: ${meta.short_hash}`,
    `- Config file path: ${configPath}`,
  ].join('\n');
}

function renderSection2(configSnapshot) {
  const yaml = toYaml({ multi_model_review: configSnapshot ?? {} }, 0).trimEnd();
  return ['## 2. Config Snapshot', '```yaml', yaml, '```'].join('\n');
}

function renderSection3(preflight) {
  const lines = ['## 3. Preflight Result', preflight.summary ?? ''];
  const detailLines = preflight.lines ?? [];
  if (detailLines.length > 0) {
    lines.push('');
    for (const line of detailLines) lines.push(`- ${line}`);
  }
  return lines.join('\n');
}

function usageText(usage) {
  if (usage === null || usage === undefined) return 'usage: not_reported';
  const entries = Object.entries(usage);
  if (entries.length === 0) return 'usage: not_reported';
  return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
}

function renderReviewerTable(rows) {
  const header = [
    '| Reviewer ID | Source Type | Family | Status | Findings Count | Error Code | Usage |',
    '|-------------|-------------|--------|--------|----------------|------------|-------|',
  ];
  const body = rows.map(
    (r) =>
      `| ${r.reviewer_id} | ${r.source_type} | ${r.family} | ${r.status} | ${r.findings_count} | ${
        r.error_code === null || r.error_code === undefined ? 'null' : r.error_code
      } | ${usageText(r.usage)} |`,
  );
  return [...header, ...body].join('\n');
}

function renderSection4(perReviewerResults) {
  const rows = perReviewerResults ?? [];
  const native = rows.filter((r) => r.source_type !== 'external');
  const external = rows.filter((r) => r.source_type === 'external');
  return [
    '## 4. Per-Reviewer Results',
    '',
    '### Native reviewers',
    renderReviewerTable(native),
    '',
    '### External reviewers',
    renderReviewerTable(external),
  ].join('\n');
}

function renderSection5(findings) {
  const lines = ['## 5. Consolidated Findings with Attribution'];
  (findings ?? []).forEach((f, i) => {
    lines.push('', `### Finding ${i + 1}`);
    lines.push(`- **Severity:** ${f.severity}`);
    lines.push(`- **Category:** ${f.category}`);
    lines.push(`- **Title:** ${f.title}`);
    lines.push(`- **File:** ${f.file}`);
    lines.push(`- **Symbol:** ${f.symbol ?? ''}`);
    lines.push('- **raised_by:**');
    for (const rb of f.raised_by ?? []) {
      lines.push(`  - { reviewer_id: ${rb.reviewer_id}, family: ${rb.family}, source_type: ${rb.source_type} }`);
    }
    if (f.severity_range !== undefined && f.severity_range !== null) {
      lines.push(`- **Severity range:** ${f.severity_range}`);
    }
    if (f.severity_reasoning !== undefined && f.severity_reasoning !== null) {
      lines.push(`- **Severity reasoning:** ${f.severity_reasoning}`);
    }
    lines.push(`- **superseded_by_verification:** ${Boolean(f.superseded_by_verification)}`);
    if (f.verification_reasoning !== undefined && f.verification_reasoning !== null) {
      lines.push(`- **Verification reasoning:** ${f.verification_reasoning}`);
    }
    // FR-HM17 (Task 58): the engine's adversarial-refute-pass outcome.
    // Deliberately rendered under its OWN field name, `verification`, and
    // never folded into superseded_by_verification/verification_reasoning
    // above — those two mark a multi-model Chain-of-Verification
    // contradiction-adjudication loser; this one marks whether a single
    // finding survived 3 independent refuters. Present only on findings
    // that went through the refute pass.
    if (f.verification !== undefined && f.verification !== null) {
      lines.push(`- **verification.status:** ${f.verification.status}`);
      lines.push(`- **verification.method:** ${f.verification.method}`);
      lines.push(
        `- **verification.failure_scenario:** ${
          f.verification.failure_scenario === undefined || f.verification.failure_scenario === null
            ? 'null'
            : f.verification.failure_scenario
        }`,
      );
    }
  });
  return lines.join('\n');
}

function renderSection6(aggregatorResolution, trace) {
  const t = trace ?? {};
  const lines = [
    '## 6. Aggregator Trace',
    `- Aggregator name: ${aggregatorResolution?.name}`,
    `- Resolution source: ${aggregatorResolution?.source}`,
  ];
  if (t.stage4_calls_dispatched !== undefined) {
    lines.push(`- Stage 4 LLM-tiebreaker calls dispatched: ${t.stage4_calls_dispatched}`);
  }
  if (t.stage4_calls_skipped !== undefined) {
    lines.push(`- Stage 4 LLM-tiebreaker calls skipped (cap): ${t.stage4_calls_skipped}`);
  }
  if (t.stage4_audit_warning) {
    lines.push(`- Stage 4 audit warning: ${t.stage4_audit_warning}`);
  }
  if (t.position_randomization_seed !== undefined) {
    lines.push(`- Position-randomization seed: ${t.position_randomization_seed}`);
  }
  if (t.judge_mode_indicator) {
    lines.push(`- Judge-mode prompt indicator: ${t.judge_mode_indicator}`);
  }
  return lines.join('\n');
}

function renderSection7(continuationEvent) {
  const lines = [
    '## 7. Continuation Event',
    `- Type: ${continuationEvent.type}`,
    `- Details: ${continuationEvent.details}`,
  ];
  if (continuationEvent.per_reviewer_error_codes) {
    lines.push(`- Per-reviewer error codes: ${JSON.stringify(continuationEvent.per_reviewer_error_codes)}`);
  }
  return lines.join('\n');
}

function renderSection8(teamMetadata) {
  const roster = teamMetadata.reviewer_roster ?? [];
  const messages = teamMetadata.cross_domain_messages?.messages ?? [];
  const count = teamMetadata.cross_domain_messages?.count ?? messages.length;
  const lines = [
    '## 8. Team Metadata',
    `- Team name: ${teamMetadata.team_name}`,
    `- Team type: ${teamMetadata.team_type}`,
  ];
  if (teamMetadata.multi_model !== undefined) {
    lines.push(`- Multi-model: ${teamMetadata.multi_model}`);
  }
  lines.push('', '### Reviewer Roster', '| Reviewer ID | Spawn Timestamp |', '|-------------|-----------------|');
  for (const r of roster) lines.push(`| ${r.reviewer_id} | ${r.spawn_timestamp} |`);
  lines.push('', '### Cross-Domain Messages', `Count: ${count}`, '| From | To | Subject | Timestamp |', '|------|----|---------|-----------|');
  for (const m of messages) lines.push(`| ${m.from} | ${m.to} | ${m.subject} | ${m.timestamp} |`);
  return lines.join('\n');
}

function renderSection9(poolRouting) {
  const wlr = poolRouting.would_have_routed;
  const wlrText = wlr === false || wlr === null || wlr === undefined
    ? 'false'
    : `{ pool_name: ${wlr.pool_name}, reason_not_used: ${wlr.reason_not_used} }`;
  return [
    '## 9. Pool Routing',
    `- routing_decision: ${poolRouting.routing_decision}`,
    `- pool_name: ${poolRouting.pool_name ?? 'null'}`,
    `- pool_multi_model: ${poolRouting.pool_multi_model ?? 'null'}`,
    `- match_rationale: ${poolRouting.match_rationale ?? 'null'}`,
    `- would_have_routed: ${wlrText}`,
  ].join('\n');
}

function renderSection10(recovery) {
  return [
    '## 10. Recovery',
    `- occurred: ${Boolean(recovery.occurred)}`,
    `- failed_reviewer: ${recovery.failed_reviewer ?? 'null'}`,
    `- recovery_finding_count: ${recovery.recovery_finding_count ?? 0}`,
  ].join('\n');
}

function renderSection11(findings) {
  const lines = ['## 11. Finding Attribution Telemetry'];
  for (const f of findings ?? []) {
    const raisedBy = f.raised_by ?? [];
    const consensusCount = raisedBy.length;
    const minorityOfOne = f.minority_of_one ?? (consensusCount === 1 && Boolean(f.minority_of_one));
    lines.push('', `### Finding: ${f.finding_id}`);
    lines.push(`- consolidated_finding_id: ${f.finding_id}`);
    lines.push('- raised_by:');
    for (const rb of raisedBy) {
      lines.push(`  - { reviewer_id: ${rb.reviewer_id}, family: ${rb.family}, source_type: ${rb.source_type} }`);
    }
    lines.push(`- consensus_count: ${consensusCount}`);
    lines.push(`- minority_of_one: ${Boolean(minorityOfOne)}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Envelope validation (exit 1 on failure)
// ---------------------------------------------------------------------------

function requireField(obj, name) {
  if (obj === undefined || obj === null || !(name in obj)) {
    throw new Error(`missing required field "${name}"`);
  }
  return obj[name];
}

function validateEnvelope(envelope) {
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('input envelope must be a JSON object');
  }
  const command = requireField(envelope, 'command');
  const invocationMetadata = requireField(envelope, 'invocation_metadata');
  requireField(invocationMetadata, 'target');
  requireField(invocationMetadata, 'timestamp');
  requireField(invocationMetadata, 'short_hash');
  requireField(envelope, 'config_snapshot');
  requireField(envelope, 'preflight_result');
  const unifiedEnvelope = requireField(envelope, 'unified_envelope');
  requireField(unifiedEnvelope, 'aggregator_resolution');
  const auditConfig = requireField(envelope, 'audit_config');
  requireField(auditConfig, 'enabled');
  return command;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function readInput() {
  const argPath = process.argv[2];
  if (argPath) {
    return readFileSync(argPath, 'utf8');
  }
  if (process.stdin.isTTY) {
    throw new Error('no input: pass <input-json-path> or pipe the envelope JSON on stdin');
  }
  return readFileSync(0, 'utf8');
}

function main() {
  let raw;
  try {
    raw = readInput();
  } catch (err) {
    process.stderr.write(`write-audit: ${err.message}\n`);
    process.exit(1);
  }

  let envelope;
  try {
    envelope = JSON.parse(raw);
    validateEnvelope(envelope);
  } catch (err) {
    process.stderr.write(`write-audit: invalid input — ${err.message}\n`);
    process.exit(1);
  }

  const {
    command,
    invocation_metadata: meta,
    config_snapshot: configSnapshot,
    preflight_result: preflight,
    unified_envelope: unifiedEnvelope,
    audit_config: auditConfig,
    team_metadata: teamMetadata,
    pool_routing: poolRouting,
    recovery,
  } = envelope;

  if (auditConfig.enabled === false) {
    process.stdout.write(`${JSON.stringify({ status: 'skipped', reason: 'audit.enabled is false' })}\n`);
    process.exit(0);
  }

  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const outputPath = auditConfig.output_path || 'docs/reviews/';
  const outputDir = join(projectRoot, outputPath);

  const date = String(meta.timestamp).slice(0, 10);
  const filename = `${date}-${command}-${meta.short_hash}.md`;
  const fullPath = join(outputDir, filename);

  if (!checkWritableDir(outputDir)) {
    process.stderr.write(
      `write-audit: cannot write to ${outputDir} — check directory permissions or the host sandbox mode (e.g. a read-only default sandbox).\n`,
    );
    process.exit(2);
  }

  const sectionsPresent = [1, 2, 3, 4, 5, 6];
  const blocks = [
    '# Multi-Model Review Audit',
    renderSection1(command, meta),
    renderSection2(configSnapshot),
    renderSection3(preflight),
    renderSection4(unifiedEnvelope.per_reviewer_results),
    renderSection5(unifiedEnvelope.findings),
    renderSection6(unifiedEnvelope.aggregator_resolution, unifiedEnvelope.consolidation_trace),
  ];

  const continuationEvent = unifiedEnvelope.continuation_event ?? null;
  if (continuationEvent !== null) {
    sectionsPresent.push(7);
    blocks.push(renderSection7(continuationEvent));
  }

  if (teamMetadata) {
    sectionsPresent.push(8);
    blocks.push(renderSection8(teamMetadata));
  }
  if (poolRouting) {
    sectionsPresent.push(9);
    blocks.push(renderSection9(poolRouting));
  }
  if (recovery) {
    sectionsPresent.push(10);
    blocks.push(renderSection10(recovery));
  }
  if (auditConfig.record_finding_attribution_telemetry !== false) {
    sectionsPresent.push(11);
    blocks.push(renderSection11(unifiedEnvelope.findings));
  }

  const markdown = `${blocks.join('\n\n')}\n`;

  try {
    const tmpPath = `${fullPath}.tmp.${process.pid}`;
    writeFileSync(tmpPath, markdown);
    renameSync(tmpPath, fullPath);
  } catch (err) {
    process.stderr.write(`write-audit: failed writing ${fullPath} — ${err.message}\n`);
    process.exit(2);
  }

  const result = {
    status: 'written',
    path: fullPath,
    filename,
    size_bytes: Buffer.byteLength(markdown, 'utf8'),
    sections_present: sectionsPresent,
    continuation_event_included: continuationEvent !== null,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

main();

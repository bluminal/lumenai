/**
 * Strict Codex structured-output schema parity
 * (plugins/synthex/agents/_shared/codex-findings.schema.json).
 *
 * `codex exec --output-schema <FILE>` requires a STRICT JSON Schema: every
 * property listed in `required` (optional ones made nullable), and
 * `additionalProperties: false` at every object level. The canonical finding
 * schema (agents/_shared/canonical-finding.schema.json) does not satisfy
 * that — most properties are optional, objects are open, and it carries
 * fields the model must never author (`source`, injected by
 * scripts/validate-findings; `raised_by`, `superseded_by_verification`,
 * `verification_reasoning`, populated downstream by consolidation and
 * verification). Passing the canonical schema directly makes Codex reject
 * the request.
 *
 * The strict schema is hand-written (it mirrors a live-verified reference
 * shape) and this test keeps it in lockstep with the canonical schema, so a
 * future canonical field, enum value, or type change cannot silently drift:
 *   1. the strict findings[] item covers EXACTLY the canonical model-authored
 *      properties (canonical minus the validator/consolidator-injected ones);
 *   2. each property's type is compatible: identical for canonical-required
 *      properties, identical or identical-plus-"null" for optional ones;
 *   3. enums are identical;
 *   4. every object level has additionalProperties:false and lists every
 *      property in `required`;
 *   5. it avoids keywords outside the subset the live-verified reference used
 *      (validate-findings re-applies minLength/maxLength/`not` afterwards).
 * It also checks the recorded Codex fixture's last message against both the
 * strict shape and the canonical validator (after `source` injection).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCanonicalFinding } from './canonical-finding';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SHARED = join(REPO_ROOT, 'plugins', 'synthex', 'agents', '_shared');
const CANONICAL = JSON.parse(readFileSync(join(SHARED, 'canonical-finding.schema.json'), 'utf8'));
const STRICT = JSON.parse(readFileSync(join(SHARED, 'codex-findings.schema.json'), 'utf8'));
const ADAPTER = readFileSync(
  join(REPO_ROOT, 'plugins', 'synthex', 'agents', 'codex-review-prompter.md'),
  'utf8',
);
const SUCCESS_FIXTURE = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'tests', 'fixtures', 'multi-model-review', 'adapters', 'codex', 'successful', 'fixture.json'),
    'utf8',
  ),
);

/** Canonical fields the model never authors: injected by validate-findings or populated downstream. */
const INJECTED_FIELDS = ['source', 'raised_by', 'superseded_by_verification', 'verification_reasoning'];

/** Keywords the strict schema avoids (not in the live-verified reference; validate-findings enforces them later). */
const AVOIDED_KEYWORDS = ['not', 'minLength', 'maxLength', '$ref', 'allOf', 'anyOf', 'oneOf', 'if', 'then', 'else'];

type Schema = Record<string, any>;

function typeSet(t: unknown): string[] {
  return (Array.isArray(t) ? t : [t]).map(String).sort();
}

/** Every object-typed schema node, with its JSON path. */
function objectNodes(node: Schema, path = '$'): Array<{ path: string; node: Schema }> {
  const out: Array<{ path: string; node: Schema }> = [];
  if (typeSet(node.type).includes('object')) out.push({ path, node });
  for (const [k, child] of Object.entries(node.properties ?? {})) {
    out.push(...objectNodes(child as Schema, `${path}.${k}`));
  }
  if (node.items) out.push(...objectNodes(node.items as Schema, `${path}[]`));
  return out;
}

function allKeys(node: unknown, acc: Set<string> = new Set()): Set<string> {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      // Keys under `properties` are property names, not keywords.
      if (k === 'properties' && v && typeof v === 'object') {
        for (const child of Object.values(v as Record<string, unknown>)) allKeys(child, acc);
      } else {
        acc.add(k);
        allKeys(v, acc);
      }
    }
  }
  return acc;
}

/** Minimal strict-schema checker: type, enum, required, additionalProperties:false, items. */
function strictErrors(schema: Schema, value: unknown, path = '$'): string[] {
  const types = typeSet(schema.type);
  const actual =
    value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  const typeOk = types.includes(actual) || (actual === 'integer' && types.includes('number'));
  if (!typeOk) return [`${path}: expected ${types.join('|')}, got ${actual}`];
  if (value === null) return [];
  const errors: string[] = [];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${String(value)} not in enum`);
  if (actual === 'object') {
    const obj = value as Record<string, unknown>;
    for (const r of schema.required ?? []) if (!(r in obj)) errors.push(`${path}: missing ${r}`);
    for (const k of Object.keys(obj)) {
      if (!(k in (schema.properties ?? {}))) errors.push(`${path}: unexpected ${k}`);
      else errors.push(...strictErrors(schema.properties[k], obj[k], `${path}.${k}`));
    }
  }
  if (actual === 'array' && schema.items) {
    (value as unknown[]).forEach((v, i) => errors.push(...strictErrors(schema.items, v, `${path}[${i}]`)));
  }
  return errors;
}

const ITEM: Schema = STRICT.properties?.findings?.items ?? {};
const CANONICAL_REQUIRED: string[] = CANONICAL.required;
const MODEL_AUTHORED = Object.keys(CANONICAL.properties).filter((k) => !INJECTED_FIELDS.includes(k));

describe('codex-findings.schema.json: top-level shape', () => {
  it('is {findings: [finding]} with findings required and no other top-level property', () => {
    expect(STRICT.type).toBe('object');
    expect(Object.keys(STRICT.properties)).toEqual(['findings']);
    expect(STRICT.required).toEqual(['findings']);
    expect(STRICT.properties.findings.type).toBe('array');
    expect(ITEM.type).toBe('object');
  });
});

describe('codex-findings.schema.json: parity with canonical-finding.schema.json', () => {
  it('the injected-field list only names fields that exist in the canonical schema', () => {
    for (const f of INJECTED_FIELDS) expect(Object.keys(CANONICAL.properties)).toContain(f);
  });

  it('covers exactly the canonical model-authored properties', () => {
    expect(Object.keys(ITEM.properties).sort()).toEqual([...MODEL_AUTHORED].sort());
  });

  it.each(INJECTED_FIELDS)('omits validator/consolidator-injected field %s', (field) => {
    expect(Object.keys(ITEM.properties)).not.toContain(field);
  });

  it.each(MODEL_AUTHORED)('property %s has a compatible type', (prop) => {
    const canonicalTypes = typeSet(CANONICAL.properties[prop].type);
    const strictTypes = typeSet(ITEM.properties[prop].type);
    if (CANONICAL_REQUIRED.includes(prop)) {
      expect(strictTypes, `${prop} is canonical-required, so it must not become nullable`).toEqual(canonicalTypes);
    } else {
      const allowed = [canonicalTypes, typeSet([...new Set([...canonicalTypes, 'null'])])].map((t) => t.join('|'));
      expect(allowed).toContain(strictTypes.join('|'));
    }
  });

  it.each(MODEL_AUTHORED)('property %s has the same enum as the canonical schema (if any)', (prop) => {
    expect(ITEM.properties[prop].enum).toEqual(CANONICAL.properties[prop].enum);
  });

  it('nested object properties match the canonical nested properties (e.g. line_range.start/end)', () => {
    for (const prop of MODEL_AUTHORED) {
      const canonicalNested = CANONICAL.properties[prop].properties;
      if (!canonicalNested) continue;
      const strictNested = ITEM.properties[prop].properties;
      expect(Object.keys(strictNested).sort(), prop).toEqual(Object.keys(canonicalNested).sort());
      for (const [k, v] of Object.entries(canonicalNested as Record<string, Schema>)) {
        expect(typeSet(strictNested[k].type), `${prop}.${k}`).toEqual(typeSet(v.type));
      }
    }
  });
});

describe('codex-findings.schema.json: Codex strict-mode requirements', () => {
  const nodes = objectNodes(STRICT);

  it('has at least the root, finding, and line_range object levels', () => {
    expect(nodes.map((n) => n.path)).toEqual(
      expect.arrayContaining(['$', '$.findings[]', '$.findings[].line_range']),
    );
  });

  it.each(nodes.map((n) => [n.path, n.node] as const))('%s has additionalProperties: false', (_p, node) => {
    expect(node.additionalProperties).toBe(false);
  });

  it.each(nodes.map((n) => [n.path, n.node] as const))('%s lists every property in required', (_p, node) => {
    expect([...(node.required ?? [])].sort()).toEqual(Object.keys(node.properties ?? {}).sort());
  });

  it('avoids keywords outside the live-verified strict subset', () => {
    const keys = allKeys(STRICT);
    for (const kw of AVOIDED_KEYWORDS) expect(keys.has(kw), `uses ${kw}`).toBe(false);
  });
});

describe('codex-review-prompter.md passes the strict schema, not the canonical one', () => {
  it('--output-schema points at codex-findings.schema.json', () => {
    expect(ADAPTER).toMatch(/--output-schema\s+\S*codex-findings\.schema\.json/);
    expect(ADAPTER).not.toMatch(/--output-schema\s+\S*canonical-finding\.schema\.json/);
  });
});

describe('recorded Codex last message (successful fixture)', () => {
  const last = SUCCESS_FIXTURE.recorded_last_message;

  it('conforms to the strict schema', () => {
    expect(strictErrors(STRICT, last)).toEqual([]);
  });

  it('every finding passes the canonical validator once validate-findings injects source', () => {
    for (const f of last.findings) {
      const result = validateCanonicalFinding({
        ...f,
        source: { reviewer_id: 'codex-review-prompter', family: 'openai', source_type: 'external' },
      });
      expect(result.errors).toEqual([]);
    }
  });

  it('the strict checker rejects a finding carrying source (sanity check of the checker)', () => {
    const bad = { findings: [{ ...last.findings[0], source: { reviewer_id: 'x', family: 'y', source_type: 'external' } }] };
    expect(strictErrors(STRICT, bad).join('\n')).toContain('unexpected source');
  });
});

describe('multi-model-review Task 68 (D33): the Grok runner shares this strict schema', () => {
  const runner = readFileSync(
    join(REPO_ROOT, 'plugins', 'synthex', 'scripts', 'adapters', 'grok-review.sh'),
    'utf8',
  );

  it('grok-review.sh reads agents/_shared/codex-findings.schema.json for --json-schema (one file, no copy)', () => {
    expect(runner).toMatch(/SCHEMA_FILE="\$PLUGIN_ROOT\/agents\/_shared\/codex-findings\.schema\.json"/);
    expect(runner).toContain('--json-schema "$SCHEMA_JSON"');
  });
});

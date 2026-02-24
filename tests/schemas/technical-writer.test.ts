/**
 * Layer 1: Schema validation tests for Technical Writer output.
 *
 * Validates structural compliance against the documentation type
 * formats defined in technical-writer.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateTechnicalWriterOutput, detectDocType } from './technical-writer.js';
import {
  parseMarkdownOutput,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadTechWriterSnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('technical-writer--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('technical-writer--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Technical Writer Schema', () => {
  const snapshots = loadTechWriterSnapshots();
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes full schema validation', () => {
          const result = validateTechnicalWriterOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
        });
      });
    }
  });
});

// ── Document Type Detection Tests ────────────────────────────────

describe('Document Type Detection', () => {
  it('detects API Documentation', () => {
    const api = `## Endpoint: POST /api/users\n\n### Quick Start\n\`\`\`bash\ncurl\n\`\`\`\n\n### Parameters\n| Param | Type |\n\n### Response`;
    expect(detectDocType(api)).toBe('api-doc');
  });

  it('detects Migration Guide', () => {
    const migration = `## Migration Guide: v2 to v3\n\n### Breaking Changes\n\n**Before (v2):**\n\`\`\`js\nold()\n\`\`\`\n\n**After (v3):**\n\`\`\`js\nnew()\n\`\`\``;
    expect(detectDocType(migration)).toBe('migration-guide');
  });

  it('detects Changelog', () => {
    const changelog = `## 2.1.0 - 2026-02-01\n\n### Added\n- New feature\n\n### Fixed\n- Bug fix`;
    expect(detectDocType(changelog)).toBe('changelog');
  });

  it('detects README', () => {
    const readme = `# My Project\n\nA great project.\n\n## Quick Start\n\n\`\`\`bash\nnpm install\n\`\`\`\n\n## Features\n\n## Contributing\n\n## License`;
    expect(detectDocType(readme)).toBe('readme');
  });

  it('detects Documentation Inventory', () => {
    const inventory = `## Documentation Inventory\n\n### Coverage Assessment\n| Area | Exists |`;
    expect(detectDocType(inventory)).toBe('doc-inventory');
  });
});

// ── Unit tests: API Documentation ────────────────────────────────

describe('API Documentation parser', () => {
  const sampleAPIDoc = `## Endpoint: POST /api/orders

### Description
Create a new order for the authenticated user.

### Quick Start
\`\`\`bash
curl -X POST https://api.example.com/api/orders \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"items": [{"productId": "prod_123", "quantity": 2}]}'
\`\`\`

### Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| items | OrderItem[] | Yes | — | Array of items to order |
| items[].productId | string | Yes | — | Product identifier |
| items[].quantity | number | Yes | — | Quantity (must be > 0) |
| shippingAddress | Address | No | User's default | Delivery address |
| couponCode | string | No | — | Discount coupon code |

### Response
\`\`\`json
{
  "id": "ord_abc123",
  "status": "pending",
  "items": [
    {"productId": "prod_123", "quantity": 2, "price": 29.99}
  ],
  "total": 59.98,
  "createdAt": "2026-02-14T10:30:00Z"
}
\`\`\`

### Error Handling
| Error Code | Meaning | Resolution |
|------------|---------|------------|
| 400 | Invalid request body | Check required fields and types |
| 401 | Missing or invalid token | Authenticate and retry |
| 404 | Product not found | Verify productId exists |
| 422 | Insufficient inventory | Reduce quantity or choose another product |

### Examples
#### Creating an order with shipping address
\`\`\`bash
curl -X POST https://api.example.com/api/orders \\
  -H "Authorization: Bearer <token>" \\
  -d '{"items": [...], "shippingAddress": {"street": "123 Main St", "city": "SF"}}'
\`\`\`

#### Creating an order with coupon
\`\`\`bash
curl -X POST https://api.example.com/api/orders \\
  -H "Authorization: Bearer <token>" \\
  -d '{"items": [...], "couponCode": "SAVE20"}'
\`\`\``;

  it('detects API doc type', () => {
    expect(detectDocType(sampleAPIDoc)).toBe('api-doc');
  });

  it('has Quick Start section', () => {
    const parsed = parseMarkdownOutput(sampleAPIDoc);
    expect(findSection(parsed.sections, 'Quick Start')).toBeDefined();
  });

  it('has Parameters table', () => {
    const parsed = parseMarkdownOutput(sampleAPIDoc);
    expect(findSection(parsed.sections, 'Parameters')).toBeDefined();

    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('parameter')
    );
    expect(table).toBeDefined();
    expect(table!.headers).toContain('Parameter');
    expect(table!.headers).toContain('Type');
    expect(table!.headers).toContain('Required');
  });

  it('has Response section with code block', () => {
    const parsed = parseMarkdownOutput(sampleAPIDoc);
    const section = findSection(parsed.sections, 'Response');
    expect(section).toBeDefined();
    expect(section!.content).toContain('```');
  });

  it('has Error Handling table', () => {
    const parsed = parseMarkdownOutput(sampleAPIDoc);
    expect(findSection(parsed.sections, 'Error Handling')).toBeDefined();

    const table = parsed.tables.find(t =>
      t.sectionTitle.toLowerCase().includes('error')
    );
    expect(table).toBeDefined();
  });

  it('has Examples section', () => {
    const parsed = parseMarkdownOutput(sampleAPIDoc);
    expect(findSection(parsed.sections, 'Examples')).toBeDefined();
  });

  it('passes schema validation', () => {
    const result = validateTechnicalWriterOutput(sampleAPIDoc);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

// ── Unit tests: Changelog ────────────────────────────────────────

describe('Changelog parser', () => {
  const sampleChangelog = `## 2.1.0 - 2026-02-14

### Added
- Order API endpoint with coupon support (#142)
- Bulk product import via CSV upload (#138)

### Changed
- Authentication tokens now expire after 24 hours (was 7 days) for security

### Fixed
- Fixed race condition in concurrent order placement (#145)
- Fixed incorrect total calculation when coupon exceeds subtotal (#147)

### Deprecated
- \`GET /api/v1/products\` — use \`GET /api/v2/products\` instead (removal in v3.0)`;

  it('detects changelog type', () => {
    expect(detectDocType(sampleChangelog)).toBe('changelog');
  });

  it('has Added section', () => {
    const parsed = parseMarkdownOutput(sampleChangelog);
    expect(findSection(parsed.sections, 'Added')).toBeDefined();
  });

  it('has Changed section', () => {
    const parsed = parseMarkdownOutput(sampleChangelog);
    expect(findSection(parsed.sections, 'Changed')).toBeDefined();
  });

  it('has Fixed section', () => {
    const parsed = parseMarkdownOutput(sampleChangelog);
    expect(findSection(parsed.sections, 'Fixed')).toBeDefined();
  });

  it('passes schema validation', () => {
    const result = validateTechnicalWriterOutput(sampleChangelog);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

/**
 * Layer 1: Schema validation tests for Code Reviewer output.
 *
 * Validates structural compliance against the format defined in
 * code-reviewer.md. Runs against golden snapshots and inline samples.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { validateCodeReviewerOutput } from './code-reviewer.js';
import {
  parseMarkdownOutput,
  areFindingsSorted,
  isVerdictConsistent,
  findSection,
} from './helpers.js';

// ── Snapshot Loading ─────────────────────────────────────────────

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

function loadCodeReviewSnapshots(): Record<string, string> {
  if (!existsSync(SNAPSHOT_DIR)) return {};

  const files = readdirSync(SNAPSHOT_DIR).filter(f =>
    f.startsWith('code-reviewer--') && f.endsWith('.snap.md')
  );

  const snapshots: Record<string, string> = {};
  for (const file of files) {
    const name = file
      .replace('code-reviewer--', '')
      .replace('.snap.md', '')
      .replace(/--/g, '/');
    snapshots[name] = readFileSync(join(SNAPSHOT_DIR, file), 'utf-8');
  }
  return snapshots;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Code Reviewer Schema', () => {
  const snapshots = loadCodeReviewSnapshots();
  const hasSnapshots = Object.keys(snapshots).length > 0;

  describe.runIf(hasSnapshots)('Golden snapshot validation', () => {
    for (const [fixture, output] of Object.entries(snapshots)) {
      describe(`Fixture: ${fixture}`, () => {
        it('passes full schema validation', () => {
          const result = validateCodeReviewerOutput(output);
          expect(result.errors, `Schema errors:\n${result.errors.join('\n')}`).toEqual([]);
        });

        it('has a verdict (PASS, WARN, or FAIL)', () => {
          const parsed = parseMarkdownOutput(output);
          expect(parsed.verdict, 'Could not detect verdict in output').not.toBeNull();
          expect(['PASS', 'WARN', 'FAIL']).toContain(parsed.verdict);
        });

        it('contains code-review-related content', () => {
          const lower = output.toLowerCase();
          expect(
            lower.includes('code review') ||
            lower.includes('finding') ||
            lower.includes('maintainability') ||
            lower.includes('correctness') ||
            lower.includes('convention')
          ).toBe(true);
        });
      });
    }
  });

  // Fixture-specific expectations
  describe.runIf(hasSnapshots && 'code-reviewer/clean-code' in snapshots)('Clean code (PASS or WARN)', () => {
    it('has PASS or WARN verdict (no critical issues in clean code)', () => {
      const parsed = parseMarkdownOutput(snapshots['code-reviewer/clean-code']);
      expect(['PASS', 'WARN']).toContain(parsed.verdict);
    });
  });

  describe.runIf(hasSnapshots && 'code-reviewer/god-object' in snapshots)('God object (FAIL or WARN)', () => {
    it('has FAIL or WARN verdict (multiple structural issues)', () => {
      const parsed = parseMarkdownOutput(snapshots['code-reviewer/god-object']);
      expect(['FAIL', 'WARN']).toContain(parsed.verdict);
    });

    it('mentions structural or maintainability concerns', () => {
      const lower = snapshots['code-reviewer/god-object'].toLowerCase();
      expect(
        lower.includes('single responsibility') ||
        lower.includes('god object') ||
        lower.includes('too many responsibilities') ||
        lower.includes('separation of concerns') ||
        lower.includes('maintainability') ||
        lower.includes('cohesion')
      ).toBe(true);
    });
  });

  describe.runIf(hasSnapshots && 'code-reviewer/missing-error-handling' in snapshots)('Missing error handling (FAIL)', () => {
    it('has FAIL verdict (critical correctness issues)', () => {
      const parsed = parseMarkdownOutput(snapshots['code-reviewer/missing-error-handling']);
      expect(parsed.verdict).toBe('FAIL');
    });

    it('mentions error handling', () => {
      const lower = snapshots['code-reviewer/missing-error-handling'].toLowerCase();
      expect(
        lower.includes('error handling') ||
        lower.includes('try/catch') ||
        lower.includes('try-catch') ||
        lower.includes('validation') ||
        lower.includes('null check')
      ).toBe(true);
    });
  });
});

// ── Unit tests for the parser ────────────────────────────────────

describe('Code Review output parser', () => {
  const sampleOutput = `## Code Review Verdict: FAIL

### Summary
Critical issues found: missing error handling in payment processing and potential null reference in product lookup.

### Specification Compliance
No project specifications found at docs/specs. Skipping specification compliance check.

### Findings

#### [CRITICAL] Missing Error Handling in Payment Processing
- **Category:** Correctness
- **Location:** src/api/orders.ts:34-40
- **Issue:** Stripe payment intent creation has no try/catch. If the Stripe API call fails, the order will be stuck in "pending" state with no error response to the client.
- **Why this matters:** Payment processing is a critical code path. Unhandled failures here lead to phantom orders, confused customers, and potential financial inconsistencies.
- **Suggestion:**
\`\`\`typescript
try {
  const charge = await stripe.paymentIntents.create({...});
} catch (error) {
  await db.order.update({ where: { id: order.id }, data: { status: 'payment_failed' } });
  return res.status(500).json({ error: 'Payment processing failed' });
}
\`\`\`

#### [HIGH] Potential Null Reference in Product Lookup
- **Category:** Correctness
- **Location:** src/api/orders.ts:30-31
- **Issue:** \`product\` could be null if the product ID doesn't exist. Accessing \`product.price\` will throw a TypeError.
- **Why this matters:** This will crash the server for any request containing an invalid product ID, which could be caused by a simple typo or stale data.
- **Suggestion:**
\`\`\`typescript
const product = await db.product.findUnique({ where: { id: item.productId } });
if (!product) {
  return res.status(400).json({ error: \`Product not found: \${item.productId}\` });
}
\`\`\`

#### [MEDIUM] No Input Validation
- **Category:** Convention
- **Location:** src/api/orders.ts:15
- **Issue:** userId, items, and paymentMethodId are destructured from req.body with no validation. Missing or malformed inputs will cause cryptic database errors.
- **Why this matters:** Input validation at the boundary prevents garbage-in, garbage-out. Express routes should validate inputs before passing them to the service layer.
- **Suggestion:** Use a validation library like Zod or Joi to validate the request body shape.

### Convention Compliance
Unable to verify against CLAUDE.md or configured linting rules — no convention files found.

### Reuse Opportunities
No existing patterns identified for comparison (new file).

### What's Done Well
- Clean Express router structure with clear RESTful endpoint design
- Good use of Prisma for database operations with proper relations

### Recommendations
1. Add a validation middleware to all routes (consider express-validator or Zod)
2. Wrap all async route handlers with an error-handling middleware to catch unhandled rejections
3. Add authorization checks to verify the requesting user has access to the resources`;

  it('extracts FAIL verdict', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.verdict).toBe('FAIL');
    expect(parsed.agentType).toBe('code-review');
  });

  it('extracts 3 findings', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings).toHaveLength(3);
  });

  it('first finding is CRITICAL', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings[0].severity).toBe('CRITICAL');
    expect(parsed.findings[0].title).toContain('Error Handling');
  });

  it('second finding is HIGH', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings[1].severity).toBe('HIGH');
    expect(parsed.findings[1].title).toContain('Null Reference');
  });

  it('third finding is MEDIUM', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings[2].severity).toBe('MEDIUM');
  });

  it('findings have code blocks where expected', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(parsed.findings[0].hasCodeBlock).toBe(true);
    expect(parsed.findings[1].hasCodeBlock).toBe(true);
  });

  it('findings are sorted by severity', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    expect(areFindingsSorted(parsed.findings)).toBe(true);
  });

  it('has What\'s Done Well section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const section = findSection(parsed.sections, 'What\'s Done Well');
    expect(section).toBeDefined();
    expect(section!.content).not.toBe('');
  });

  it('has Specification Compliance section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const section = findSection(parsed.sections, 'Specification Compliance');
    expect(section).toBeDefined();
  });

  it('has Reuse Opportunities section', () => {
    const parsed = parseMarkdownOutput(sampleOutput);
    const section = findSection(parsed.sections, 'Reuse Opportunities');
    expect(section).toBeDefined();
  });

  it('passes full schema validation', () => {
    const result = validateCodeReviewerOutput(sampleOutput);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

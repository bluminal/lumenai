import { describe, it, expect } from 'vitest';
import { validateContextBundle, STATUS_VALUES, ERROR_CODE_VALUES } from './context-bundle';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validSuccess = {
  status: 'success',
  manifest: {
    artifact: { path: 'src/x.ts', size_bytes: 100, summarized: false },
    conventions: [{ path: 'CLAUDE.md', size_bytes: 50, summarized: false }],
    touched_files: [{ path: 'src/x.ts', size_bytes: 100, summarized: false }],
    specs: [],
    total_bytes: 250,
  },
  files: [
    { path: 'src/x.ts', content: 'export const x = 1;' },
  ],
};

const validError = {
  status: 'error',
  error_code: 'narrow_scope_required',
  error_message: 'Artifact alone exceeds max_bundle_bytes (524288 > 200000). Narrow review scope and retry.',
  manifest: null,
  files: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Task 7: validateContextBundle', () => {
  // 1. Valid success bundle passes
  it('accepts a valid success bundle', () => {
    const result = validateContextBundle(validSuccess);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // 2. Valid error bundle (narrow_scope_required) passes
  it('accepts a valid error bundle (narrow_scope_required)', () => {
    const result = validateContextBundle(validError);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // 3. Bundle missing artifact fails
  it('rejects a success bundle missing artifact', () => {
    const bundle = deepClone(validSuccess);
    delete (bundle.manifest as Record<string, unknown>).artifact;
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('artifact'))).toBe(true);
  });

  // 4. Bundle missing files array fails
  it('rejects a bundle missing the files array', () => {
    const bundle = deepClone(validSuccess) as Record<string, unknown>;
    delete bundle.files;
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"files"'))).toBe(true);
  });

  // 5. Bundle exceeding total cap fails when maxBundleBytes provided
  it('rejects a bundle that exceeds maxBundleBytes when the option is set', () => {
    const result = validateContextBundle(validSuccess, { maxBundleBytes: 100 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maxBundleBytes'))).toBe(true);
  });

  // 6. artifact.summarized: true fails (Behavioral Rule 1)
  it('rejects a bundle where artifact.summarized is true', () => {
    const bundle = deepClone(validSuccess);
    bundle.manifest.artifact.summarized = true;
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('artifact.summarized'))).toBe(true);
  });

  // 7. Error bundle with non-empty files array fails
  it('rejects an error bundle with non-empty files array', () => {
    const bundle = deepClone(validError) as Record<string, unknown>;
    bundle.files = [{ path: 'src/x.ts', content: 'something' }];
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"files" must be empty array'))).toBe(true);
  });

  // 8. Error bundle with non-null manifest fails
  it('rejects an error bundle where manifest is not null', () => {
    const bundle = deepClone(validError) as Record<string, unknown>;
    bundle.manifest = { artifact: null, conventions: [], touched_files: [], specs: [], total_bytes: 0 };
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"manifest" must be null'))).toBe(true);
  });

  // 9. Error bundle with unknown error_code fails
  it('rejects an error bundle with an unknown error_code', () => {
    const bundle = deepClone(validError) as Record<string, unknown>;
    bundle.error_code = 'unknown_error_type';
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"error_code"'))).toBe(true);
  });

  // 10. Success bundle with status enum violation fails
  it('rejects a bundle with an invalid status value', () => {
    const bundle = deepClone(validSuccess) as Record<string, unknown>;
    bundle.status = 'pending';
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"status"'))).toBe(true);
  });

  // 11. Bundle missing total_bytes fails
  it('rejects a success bundle missing total_bytes', () => {
    const bundle = deepClone(validSuccess);
    delete (bundle.manifest as Record<string, unknown>).total_bytes;
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('total_bytes'))).toBe(true);
  });

  // 12. Bundle with negative size_bytes in artifact fails
  it('rejects a bundle where artifact.size_bytes is negative', () => {
    const bundle = deepClone(validSuccess);
    bundle.manifest.artifact.size_bytes = -1;
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('manifest.artifact.size_bytes'))).toBe(true);
  });

  // 13. Bundle with empty path string in artifact fails
  it('rejects a bundle where artifact.path is an empty string', () => {
    const bundle = deepClone(validSuccess);
    bundle.manifest.artifact.path = '';
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('manifest.artifact.path'))).toBe(true);
  });

  // 14. Bundle with non-array conventions fails
  it('rejects a success bundle where conventions is not an array', () => {
    const bundle = deepClone(validSuccess) as Record<string, unknown>;
    (bundle.manifest as Record<string, unknown>).conventions = 'CLAUDE.md';
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"manifest.conventions"'))).toBe(true);
  });

  // 15. files entries with missing path fail
  it('rejects a bundle where a files entry is missing path', () => {
    const bundle = deepClone(validSuccess) as Record<string, unknown>;
    bundle.files = [{ content: 'export const x = 1;' }];
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('files[0].path'))).toBe(true);
  });

  // 16. files entries with non-string content fail
  it('rejects a bundle where a files entry has non-string content', () => {
    const bundle = deepClone(validSuccess) as Record<string, unknown>;
    bundle.files = [{ path: 'src/x.ts', content: 42 }];
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('files[0].content'))).toBe(true);
  });

  // 17. Multiple-file scenario: artifact + 2 conventions + 3 touched + 1 spec all pass
  it('accepts a multi-file success bundle with varied manifest sections', () => {
    const bundle = {
      status: 'success',
      manifest: {
        artifact: { path: 'src/auth/handleLogin.ts', size_bytes: 4521, summarized: false },
        conventions: [
          { path: 'CLAUDE.md', size_bytes: 1234, summarized: false },
          { path: '.eslintrc.json', size_bytes: 512, summarized: false },
        ],
        touched_files: [
          { path: 'src/auth/handleLogin.ts', size_bytes: 4521, summarized: false },
          { path: 'src/utils/large-file.ts', size_bytes: 92341, summarized: true },
          { path: 'src/auth/session.ts', size_bytes: 2000, summarized: false },
        ],
        specs: [
          { path: 'docs/specs/auth.md', size_bytes: 2341, summarized: false },
        ],
        total_bytes: 102949,
      },
      files: [
        { path: 'src/auth/handleLogin.ts', content: 'export function handleLogin() {}' },
        { path: 'CLAUDE.md', content: '# Conventions' },
        { path: '.eslintrc.json', content: '{}' },
        { path: 'src/utils/large-file.ts', content: '[summarized content]' },
        { path: 'src/auth/session.ts', content: 'export function getSession() {}' },
        { path: 'docs/specs/auth.md', content: '# Auth spec' },
      ],
    };
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // 18. Cap check is off by default (no maxBundleBytes option)
  it('does not enforce a cap when maxBundleBytes is not provided', () => {
    // total_bytes is 250, which would normally pass; but even an enormous number
    // should pass since no cap is enforced without the option
    const bundle = deepClone(validSuccess);
    bundle.manifest.total_bytes = 999_999_999;
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(true);
  });

  // 19. Empty conventions/touched_files/specs arrays are accepted on success path
  it('accepts a success bundle with empty conventions, touched_files, and specs arrays', () => {
    const bundle = {
      status: 'success',
      manifest: {
        artifact: { path: 'src/x.ts', size_bytes: 100, summarized: false },
        conventions: [],
        touched_files: [],
        specs: [],
        total_bytes: 100,
      },
      files: [
        { path: 'src/x.ts', content: 'export const x = 1;' },
      ],
    };
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // 20. Manifest with extra unknown fields is tolerated (forward-compat)
  it('tolerates extra unknown fields in the manifest (forward-compat)', () => {
    const bundle = deepClone(validSuccess) as Record<string, unknown>;
    const manifest = bundle.manifest as Record<string, unknown>;
    manifest.overview = { path: 'README.md', size_bytes: 3000, summarized: false };
    manifest._version = '1.2.0';
    const result = validateContextBundle(bundle);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Bonus: STATUS_VALUES and ERROR_CODE_VALUES exports are correct
  it('exports STATUS_VALUES with expected values', () => {
    expect(STATUS_VALUES).toContain('success');
    expect(STATUS_VALUES).toContain('error');
    expect(STATUS_VALUES).toHaveLength(2);
  });

  it('exports ERROR_CODE_VALUES with expected values', () => {
    expect(ERROR_CODE_VALUES).toContain('narrow_scope_required');
    expect(ERROR_CODE_VALUES).toHaveLength(1);
  });

  // Edge: non-object input
  it('rejects null input', () => {
    const result = validateContextBundle(null);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('non-null object'))).toBe(true);
  });

  it('rejects array input', () => {
    const result = validateContextBundle([]);
    expect(result.valid).toBe(false);
  });
});

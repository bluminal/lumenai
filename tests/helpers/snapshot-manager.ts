/**
 * Golden output snapshot manager for regression testing.
 *
 * Snapshots are stored as markdown files in tests/__snapshots__/ with a naming
 * convention of `{agent}--{fixture-path}.snap.md`. This makes them easy to
 * inspect, diff in code review, and compare with fresh agent outputs.
 *
 * Snapshot workflow:
 *   1. First run: agent output is saved as the golden snapshot.
 *   2. Subsequent runs: fresh output is compared to the snapshot.
 *   3. Update mode: re-run with --update flag to overwrite snapshots.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'fs';
import { join } from 'path';

const SNAPSHOT_DIR = join(import.meta.dirname, '..', '__snapshots__');

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Build the snapshot file path for a given agent + fixture combination.
 *
 * The fixture path is flattened (slashes become double-dashes) and the file
 * extension is stripped, producing names like:
 *   terraform-plan-reviewer--terraform--public-rds.snap.md
 */
export function getSnapshotPath(agent: string, fixture: string): string {
  const sanitized = fixture
    .replace(/[/\\]/g, '--')
    .replace(/\.[^.]+$/, '');
  const name = `${agent}--${sanitized}.snap.md`;
  return join(SNAPSHOT_DIR, name);
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Load a snapshot from disk. Returns null if the snapshot does not exist.
 */
export function loadSnapshot(agent: string, fixture: string): string | null {
  const path = getSnapshotPath(agent, fixture);
  if (existsSync(path)) {
    return readFileSync(path, 'utf-8');
  }
  return null;
}

/**
 * Save (or overwrite) a snapshot on disk. Creates the __snapshots__
 * directory if it does not exist.
 */
export function saveSnapshot(
  agent: string,
  fixture: string,
  output: string,
): void {
  if (!existsSync(SNAPSHOT_DIR)) {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
  writeFileSync(getSnapshotPath(agent, fixture), output, 'utf-8');
}

/**
 * Check whether a snapshot exists for a given agent + fixture.
 */
export function snapshotExists(agent: string, fixture: string): boolean {
  return existsSync(getSnapshotPath(agent, fixture));
}

// ---------------------------------------------------------------------------
// Listing / querying
// ---------------------------------------------------------------------------

export interface SnapshotEntry {
  /** Agent name extracted from the filename */
  agent: string;
  /** Fixture path (re-expanded from the flattened filename) */
  fixture: string;
  /** Absolute path to the snapshot file */
  path: string;
}

/**
 * List all snapshots currently on disk.
 */
export function listSnapshots(): SnapshotEntry[] {
  if (!existsSync(SNAPSHOT_DIR)) return [];

  return readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.endsWith('.snap.md'))
    .map((f) => {
      const stem = f.replace('.snap.md', '');
      // Split on the first '--' to separate agent from fixture
      const firstSep = stem.indexOf('--');
      const agent = firstSep !== -1 ? stem.substring(0, firstSep) : stem;
      const fixture =
        firstSep !== -1
          ? stem.substring(firstSep + 2).replace(/--/g, '/')
          : '';
      return { agent, fixture, path: join(SNAPSHOT_DIR, f) };
    });
}

/**
 * Load ALL snapshots for a given agent, returning a map of
 * fixture name to output text.
 */
export function loadSnapshotsForAgent(
  agent: string,
): Record<string, string> {
  const matching = listSnapshots().filter((s) => s.agent === agent);
  const result: Record<string, string> = {};
  for (const snap of matching) {
    result[snap.fixture] = readFileSync(snap.path, 'utf-8');
  }
  return result;
}

/**
 * Return the absolute path to the snapshots directory (useful for diagnostics
 * and CLI scripts).
 */
export function getSnapshotDir(): string {
  return SNAPSHOT_DIR;
}

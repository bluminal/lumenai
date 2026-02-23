/**
 * File-based caching layer for LLM outputs.
 *
 * Cache key is a SHA-256 hash of (agent markdown + fixture content + model id).
 * Cached outputs are stored as plain text files in tests/.cache/ so they can
 * be inspected manually and excluded via .gitignore.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = join(import.meta.dirname, '..', '.cache');

/**
 * Produce a deterministic 16-character hex key from the combination of
 * agent definition, fixture input, and model identifier. Any change to
 * the agent prompt, the input data, or the target model invalidates
 * the cached output.
 */
export function getCacheKey(
  agentContent: string,
  fixtureContent: string,
  model: string = 'default',
): string {
  const hash = createHash('sha256');
  hash.update(agentContent);
  hash.update(fixtureContent);
  hash.update(model);
  return hash.digest('hex').substring(0, 16);
}

/**
 * Retrieve a cached LLM output by key. Returns null if the cache entry
 * does not exist.
 */
export function getCached(key: string): string | null {
  const path = join(CACHE_DIR, `${key}.txt`);
  if (existsSync(path)) {
    return readFileSync(path, 'utf-8');
  }
  return null;
}

/**
 * Store an LLM output in the cache. Creates the cache directory if it
 * does not exist.
 */
export function setCache(key: string, output: string): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  writeFileSync(join(CACHE_DIR, `${key}.txt`), output, 'utf-8');
}

/**
 * Delete the entire cache directory and all cached outputs.
 */
export function clearCache(): void {
  if (existsSync(CACHE_DIR)) {
    rmSync(CACHE_DIR, { recursive: true, force: true });
  }
}

/**
 * Return the absolute path to the cache directory (useful for diagnostics).
 */
export function getCacheDir(): string {
  return CACHE_DIR;
}

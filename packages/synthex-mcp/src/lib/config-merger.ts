import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { loadConfigDefaults } from "./markdown-loader.js";

type Config = Record<string, unknown>;

/**
 * Deep merges source into target. Arrays are replaced (not merged).
 */
function deepMerge(target: Config, source: Config): Config {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as Config, sourceVal as Config);
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

/**
 * Loads and parses the default configuration from the plugin's defaults.yaml.
 */
export async function loadDefaults(): Promise<Config> {
  const raw = await loadConfigDefaults();
  return parseYaml(raw) as Config;
}

/** Path to the user-level config, honoring $XDG_CONFIG_HOME. */
export function userConfigPath(): string {
  const base =
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return resolve(base, "synthex", "config.yaml");
}

async function readConfigFile(path: string): Promise<Config> {
  try {
    return (parseYaml(await readFile(path, "utf-8")) as Config) ?? {};
  } catch {
    // Missing or unreadable layer contributes nothing.
    return {};
  }
}

function asConfig(value: unknown): Config {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Config)
    : {};
}

/**
 * Collects every `*.enabled` path under `multi_model_review` whose value is
 * `false` in any layer. Returns dotted paths relative to `multi_model_review`.
 */
function disabledPaths(block: Config, prefix: string[] = []): string[][] {
  const found: string[][] = [];
  for (const [key, value] of Object.entries(block)) {
    if (key === "enabled" && value === false) {
      found.push(prefix);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      found.push(...disabledPaths(value as Config, [...prefix, key]));
    }
  }
  return found;
}

function forceDisabled(root: Config, path: string[]): void {
  let node = root;
  for (const key of path) {
    const next = node[key];
    if (next === null || typeof next !== "object" || Array.isArray(next)) return;
    node = next as Config;
  }
  node.enabled = false;
}

/**
 * Loads the full Synthex config cascade and merges it, lowest precedence first:
 *
 *   plugin defaults
 *   -> ~/.config/synthex/config.yaml      (user; $XDG_CONFIG_HOME aware)
 *   -> <project>/.synthex/config.yaml     (project, shared)
 *   -> <project>/.synthex/config.local.yaml (project-local, gitignored)
 *
 * `projectConfigPath` names the shared project file; the local file is read as
 * its sibling. Missing layers are skipped. User config sits below project
 * config, matching Claude Code's settings precedence, with two exceptions:
 *
 *   - `multi_model_review.per_reviewer.*` is user-owned. Which external models
 *     are installed and what they are called is a fact about the machine, so
 *     the user layer wins over the project's.
 *   - any `enabled` under `multi_model_review` is restrictive-wins: `false` in
 *     ANY layer disables it, the way Claude Code unions permission deny rules.
 *     A repo cannot turn on sending this machine's code to an external CLI when
 *     the user has turned it off.
 */
export async function mergeConfig(projectConfigPath: string): Promise<Config> {
  const defaults = await loadDefaults();
  const user = await readConfigFile(userConfigPath());
  const project = await readConfigFile(projectConfigPath);
  const local = await readConfigFile(
    join(dirname(projectConfigPath), "config.local.yaml"),
  );

  const merged = deepMerge(
    deepMerge(deepMerge(defaults, user), project),
    local,
  );

  const userOwned = asConfig(asConfig(user.multi_model_review).per_reviewer);
  if (Object.keys(userOwned).length > 0) {
    const mmr = asConfig(merged.multi_model_review);
    mmr.per_reviewer = deepMerge(asConfig(mmr.per_reviewer), userOwned);
    merged.multi_model_review = mmr;
  }

  for (const layer of [user, project, local]) {
    for (const path of disabledPaths(asConfig(layer.multi_model_review))) {
      forceDisabled(asConfig(merged.multi_model_review), path);
    }
  }

  return merged;
}

import { readFile } from "node:fs/promises";
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

/**
 * Loads a project-level config file and merges it with defaults.
 * If the project config doesn't exist, returns defaults only.
 */
export async function mergeConfig(projectConfigPath: string): Promise<Config> {
  const defaults = await loadDefaults();

  let projectConfig: Config = {};
  try {
    const raw = await readFile(projectConfigPath, "utf-8");
    projectConfig = (parseYaml(raw) as Config) ?? {};
  } catch {
    // Project config doesn't exist — use defaults only
  }

  return deepMerge(defaults, projectConfig);
}

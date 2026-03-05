import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolves the base path for Synthex plugin assets.
 * - Dev mode: resolves to ../../plugins/synthex/ (relative to src/lib/)
 * - Bundle mode: resolves to sibling directories next to server/index.js
 */
function getPluginRoot(): string {
  // In bundle mode, __dirname is inside server/
  const bundlePath = resolve(__dirname, "..");
  // In dev mode, __dirname is inside src/lib/
  const devPath = resolve(__dirname, "../../../../plugins/synthex");

  // Use a heuristic: if we're inside a 'src' directory, we're in dev mode
  if (__dirname.includes("/src/")) {
    return devPath;
  }
  return bundlePath;
}

export function getAgentsDir(): string {
  return resolve(getPluginRoot(), "agents");
}

export function getCommandsDir(): string {
  return resolve(getPluginRoot(), "commands");
}

export function getConfigDir(): string {
  return resolve(getPluginRoot(), "config");
}

export async function loadMarkdownFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

export async function loadAgent(name: string): Promise<string> {
  const filePath = resolve(getAgentsDir(), `${name}.md`);
  return loadMarkdownFile(filePath);
}

export async function loadCommand(name: string): Promise<string> {
  const filePath = resolve(getCommandsDir(), `${name}.md`);
  return loadMarkdownFile(filePath);
}

export async function loadConfigDefaults(): Promise<string> {
  const filePath = resolve(getConfigDir(), "defaults.yaml");
  return readFile(filePath, "utf-8");
}

/**
 * Lists all agent names by scanning the agents directory.
 * Returns names without the .md extension (e.g., "tech-lead", "code-reviewer").
 */
export async function listAgentNames(): Promise<string[]> {
  const dir = getAgentsDir();
  const files = await readdir(dir);
  return files
    .filter((f) => extname(f) === ".md")
    .map((f) => basename(f, ".md"))
    .sort();
}

/**
 * Lists all command names by scanning the commands directory.
 * Returns names without the .md extension.
 */
export async function listCommandNames(): Promise<string[]> {
  const dir = getCommandsDir();
  const files = await readdir(dir);
  return files
    .filter((f) => extname(f) === ".md")
    .map((f) => basename(f, ".md"))
    .sort();
}

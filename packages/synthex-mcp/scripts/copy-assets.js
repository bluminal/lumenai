/**
 * Copies Synthex plugin markdown assets into the server/ build directory.
 * This ensures the bundled MCP server can resolve agent/command/config files
 * without depending on the source tree.
 */
import { cp, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, "../../../plugins/synthex");
const serverRoot = resolve(__dirname, "../server");

const assets = [
  { src: "agents", dest: "agents" },
  { src: "commands", dest: "commands" },
  { src: "config", dest: "config" },
];

for (const { src, dest } of assets) {
  const srcPath = resolve(pluginRoot, src);
  const destPath = resolve(serverRoot, dest);
  await mkdir(destPath, { recursive: true });
  await cp(srcPath, destPath, { recursive: true });
}

console.log("Copied agent, command, and config assets to server/");

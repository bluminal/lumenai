import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdir, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfigDefaults } from "../lib/markdown-loader.js";

const DIRS_TO_CREATE = [
  "docs/reqs",
  "docs/plans",
  "docs/specs",
  "docs/specs/decisions",
  "docs/specs/rfcs",
  "docs/runbooks",
  "docs/retros",
];

/**
 * Registers the synthex_init tool.
 * Creates .synthex/config.yaml and standard document directories.
 */
export function registerInitTool(server: McpServer): void {
  server.tool(
    "synthex_init",
    "Initialize Synthex project configuration and document directories",
    {
      project_root: z
        .string()
        .describe("Absolute path to the project root directory"),
    },
    async ({ project_root }) => {
      const results: string[] = [];

      // Create .synthex/config.yaml
      const configDir = resolve(project_root, ".synthex");
      const configPath = resolve(configDir, "config.yaml");

      let configExists = false;
      try {
        await access(configPath);
        configExists = true;
      } catch {
        // Does not exist
      }

      if (configExists) {
        results.push(`Skipped: ${configPath} (already exists)`);
      } else {
        const defaults = await loadConfigDefaults();
        await mkdir(configDir, { recursive: true });
        await writeFile(configPath, defaults, "utf-8");
        results.push(`Created: ${configPath}`);
      }

      // Create document directories
      for (const dir of DIRS_TO_CREATE) {
        const fullPath = resolve(project_root, dir);
        await mkdir(fullPath, { recursive: true });
        results.push(`Ensured: ${fullPath}`);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Synthex initialized successfully.\n\n${results.join("\n")}`,
          },
        ],
      };
    },
  );
}

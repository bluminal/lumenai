import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { stringify as stringifyYaml } from "yaml";
import { mergeConfig } from "../lib/config-merger.js";
import { resolve } from "node:path";

/**
 * Registers the synthex_read_config tool.
 * Reads and merges project configuration with Synthex defaults.
 */
export function registerReadConfigTool(server: McpServer): void {
  server.tool(
    "synthex_read_config",
    "Read and merge project configuration with Synthex defaults",
    {
      project_root: z
        .string()
        .describe("Absolute path to the project root directory"),
    },
    async ({ project_root }) => {
      const configPath = resolve(project_root, ".synthex", "config.yaml");
      const merged = await mergeConfig(configPath);

      return {
        content: [
          {
            type: "text" as const,
            text: stringifyYaml(merged),
          },
        ],
      };
    },
  );
}

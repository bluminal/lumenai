import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildAgentCatalog } from "../lib/agent-metadata.js";

/**
 * Registers the synthex_list_agents tool.
 * Returns a formatted table of all available Synthex agents.
 */
export function registerListAgentsTool(server: McpServer): void {
  server.tool(
    "synthex_list_agents",
    "List all available Synthex agents with their roles and types",
    {},
    async () => {
      const catalog = await buildAgentCatalog();
      const header = "| Agent | Role |\n|-------|------|\n";
      const rows = catalog
        .map((a) => `| ${a.name} | ${a.role} |`)
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `## Synthex Agents\n\n${header}${rows}\n\nTotal: ${catalog.length} agents available.`,
          },
        ],
      };
    },
  );
}

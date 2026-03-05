import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfigDefaults } from "../lib/markdown-loader.js";

/**
 * Registers the Synthex defaults.yaml as an MCP Resource.
 */
export async function registerConfigResource(server: McpServer): Promise<void> {
  const content = await loadConfigDefaults();

  server.resource(
    "config-defaults",
    "synthex://config/defaults",
    {
      description: "Synthex default project configuration (YAML)",
      mimeType: "text/yaml",
    },
    async () => ({
      contents: [
        {
          uri: "synthex://config/defaults",
          mimeType: "text/yaml",
          text: content,
        },
      ],
    }),
  );
}

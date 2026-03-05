import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listAgentNames, loadAgent } from "../lib/markdown-loader.js";
import { extractAgentMetadata } from "../lib/agent-metadata.js";

/**
 * Registers all Synthex agent definitions as MCP Resources.
 * Each agent is available at synthex://agents/{agentName}
 */
export async function registerAgentResources(server: McpServer): Promise<void> {
  const agentNames = await listAgentNames();

  for (const name of agentNames) {
    const content = await loadAgent(name);
    const meta = extractAgentMetadata(name, content);

    server.resource(
      `agent-${name}`,
      `synthex://agents/${name}`,
      { description: meta.description, mimeType: "text/markdown" },
      async () => ({
        contents: [
          {
            uri: `synthex://agents/${name}`,
            mimeType: "text/markdown",
            text: content,
          },
        ],
      }),
    );
  }
}

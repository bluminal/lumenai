import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAgentResources } from "./resources/agents.js";
import { registerConfigResource } from "./resources/config.js";
import { registerAllPrompts } from "./prompts/register-all.js";
import { registerInitTool } from "./tools/init.js";
import { registerReadConfigTool } from "./tools/read-config.js";
import { registerListAgentsTool } from "./tools/list-agents.js";

async function main() {
  const server = new McpServer({
    name: "synthex",
    version: "0.1.0",
  });

  // Phase 2: Resources
  await registerAgentResources(server);
  await registerConfigResource(server);

  // Phase 3: Prompts
  await registerAllPrompts(server);

  // Phase 4: Tools
  registerInitTool(server);
  registerReadConfigTool(server);
  registerListAgentsTool(server);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Synthex MCP server failed to start:", err);
  process.exit(1);
});

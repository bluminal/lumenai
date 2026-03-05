import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAgentResources } from "../src/resources/agents.js";
import { registerConfigResource } from "../src/resources/config.js";
import { registerAllPrompts } from "../src/prompts/register-all.js";
import { registerInitTool } from "../src/tools/init.js";
import { registerReadConfigTool } from "../src/tools/read-config.js";
import { registerListAgentsTool } from "../src/tools/list-agents.js";

/**
 * Integration test: wires up the full server exactly as src/index.ts does,
 * then verifies the complete MCP protocol surface via an in-memory client.
 */
describe("full server integration", () => {
  let client: Client;

  beforeAll(async () => {
    const server = new McpServer({ name: "synthex", version: "0.1.0" });

    // Register everything (mirrors src/index.ts)
    await registerAgentResources(server);
    await registerConfigResource(server);
    await registerAllPrompts(server);
    registerInitTool(server);
    registerReadConfigTool(server);
    registerListAgentsTool(server);

    client = new Client({ name: "integration-test", version: "0.1.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  it("exposes 16 resources (15 agents + 1 config)", async () => {
    const result = await client.listResources();
    expect(result.resources).toHaveLength(16);
  });

  it("exposes 11 prompts", async () => {
    const result = await client.listPrompts();
    expect(result.prompts).toHaveLength(11);
  });

  it("exposes 3 tools", async () => {
    const result = await client.listTools();
    expect(result.tools).toHaveLength(3);
  });

  it("agent resource content is full markdown", async () => {
    const result = await client.readResource({
      uri: "synthex://agents/security-reviewer",
    });
    const text = result.contents[0].text as string;
    expect(text).toContain("# Security Reviewer");
    // Should be substantial content, not just a title
    expect(text.length).toBeGreaterThan(500);
  });

  it("prompt includes agent definitions matching command-agent map", async () => {
    // write-rfc uses: architect, product-manager, tech-lead, security-reviewer
    const result = await client.getPrompt({
      name: "synthex-write-rfc",
      arguments: { title: "test RFC" },
    });

    const agentDefs = result.messages.filter(
      (m) =>
        typeof m.content === "object" &&
        "text" in m.content &&
        m.content.text.includes("<agent-definition"),
    );
    expect(agentDefs).toHaveLength(4);

    // Verify specific agents are present
    const allText = agentDefs
      .map((m) => (m.content as { text: string }).text)
      .join("\n");
    expect(allText).toContain('name="architect"');
    expect(allText).toContain('name="product-manager"');
    expect(allText).toContain('name="tech-lead"');
    expect(allText).toContain('name="security-reviewer"');
  });

  it("synthex_list_agents returns markdown table", async () => {
    const result = await client.callTool({
      name: "synthex_list_agents",
      arguments: {},
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0]
      .text;
    expect(text).toContain("| Agent | Role |");
    expect(text).toContain("tech-lead");
    expect(text).toContain("15 agents");
  });

  it("all agent resource URIs are readable", async () => {
    const resources = await client.listResources();
    const agentUris = resources.resources
      .filter((r) => r.uri.startsWith("synthex://agents/"))
      .map((r) => r.uri);

    for (const uri of agentUris) {
      const result = await client.readResource({ uri });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].text).toBeTruthy();
    }
  });
});

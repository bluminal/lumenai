import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAgentResources } from "../src/resources/agents.js";
import { registerConfigResource } from "../src/resources/config.js";
import { listAgentNames } from "../src/lib/markdown-loader.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

describe("agent resources", () => {
  let client: Client;

  beforeAll(async () => {
    const server = new McpServer({ name: "test", version: "0.1.0" });
    await registerAgentResources(server);
    await registerConfigResource(server);

    client = new Client({ name: "test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  it("lists all 15 agent resources plus config", async () => {
    const result = await client.listResources();
    // 15 agents + 1 config defaults
    expect(result.resources.length).toBe(16);
  });

  it("each agent resource has synthex://agents/ URI", async () => {
    const result = await client.listResources();
    const agentResources = result.resources.filter((r) =>
      r.uri.startsWith("synthex://agents/"),
    );
    expect(agentResources).toHaveLength(15);
  });

  it("reads a specific agent resource", async () => {
    const result = await client.readResource({
      uri: "synthex://agents/tech-lead",
    });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("text/markdown");
    expect(result.contents[0].text).toContain("# Tech Lead");
  });

  it("reads config defaults resource", async () => {
    const result = await client.readResource({
      uri: "synthex://config/defaults",
    });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("text/yaml");
    expect(result.contents[0].text).toContain("implementation_plan:");
  });

  it("all discovered agents have corresponding resources", async () => {
    const agentNames = await listAgentNames();
    const result = await client.listResources();
    const resourceNames = result.resources
      .filter((r) => r.uri.startsWith("synthex://agents/"))
      .map((r) => r.uri.replace("synthex://agents/", ""));

    for (const name of agentNames) {
      expect(resourceNames).toContain(name);
    }
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllPrompts } from "../src/prompts/register-all.js";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

describe("command prompts", () => {
  let client: Client;

  beforeAll(async () => {
    const server = new McpServer({ name: "test", version: "0.1.0" });
    await registerAllPrompts(server);

    client = new Client({ name: "test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  it("lists all 11 command prompts", async () => {
    const result = await client.listPrompts();
    expect(result.prompts).toHaveLength(11);
  });

  it("all prompts have synthex- prefix", async () => {
    const result = await client.listPrompts();
    for (const prompt of result.prompts) {
      expect(prompt.name).toMatch(/^synthex-/);
    }
  });

  it("review-code prompt injects agent definitions and workflow", async () => {
    const result = await client.getPrompt({
      name: "synthex-review-code",
      arguments: { target: "src/" },
    });

    // Should have: 4 agent defs (code-reviewer, design-system-agent, performance-engineer, security-reviewer)
    // + 1 command workflow + 1 parameters message
    const agentMessages = result.messages.filter((m) =>
      typeof m.content === "object" &&
      "text" in m.content &&
      m.content.text.includes("<agent-definition"),
    );
    expect(agentMessages).toHaveLength(4);

    // Should have the workflow
    const workflowMessages = result.messages.filter((m) =>
      typeof m.content === "object" &&
      "text" in m.content &&
      m.content.text.includes("<command-workflow"),
    );
    expect(workflowMessages).toHaveLength(1);

    // Should have parameters
    const paramMessages = result.messages.filter((m) =>
      typeof m.content === "object" &&
      "text" in m.content &&
      m.content.text.includes("target: src/"),
    );
    expect(paramMessages).toHaveLength(1);
  });

  it("init prompt has no agent definitions (no agents orchestrated)", async () => {
    const result = await client.getPrompt({
      name: "synthex-init",
      arguments: {},
    });

    const agentMessages = result.messages.filter((m) =>
      typeof m.content === "object" &&
      "text" in m.content &&
      m.content.text.includes("<agent-definition"),
    );
    expect(agentMessages).toHaveLength(0);

    // But should still have the workflow
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
  });

  it("write-implementation-plan injects product-manager agent definition", async () => {
    const result = await client.getPrompt({
      name: "synthex-write-implementation-plan",
      arguments: { prd_path: "docs/reqs/main.md" },
    });

    const agentMessages = result.messages.filter((m) =>
      typeof m.content === "object" &&
      "text" in m.content &&
      m.content.text.includes("<agent-definition"),
    );
    // product-manager is the explicit orchestrator; reviewers are config-driven
    expect(agentMessages).toHaveLength(1);
    expect((agentMessages[0].content as { text: string }).text).toContain(
      'name="product-manager"',
    );
  });

  it("prompts without parameters omit the parameter message", async () => {
    const result = await client.getPrompt({
      name: "synthex-init",
      arguments: {},
    });

    const paramMessages = result.messages.filter((m) =>
      typeof m.content === "object" &&
      "text" in m.content &&
      m.content.text.includes("Execute the workflow above"),
    );
    expect(paramMessages).toHaveLength(0);
  });
});

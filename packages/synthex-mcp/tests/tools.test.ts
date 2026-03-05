import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerInitTool } from "../src/tools/init.js";
import { registerReadConfigTool } from "../src/tools/read-config.js";
import { registerListAgentsTool } from "../src/tools/list-agents.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm, access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

describe("MCP tools", () => {
  let client: Client;
  let tmpDir: string;

  beforeAll(async () => {
    const server = new McpServer({ name: "test", version: "0.1.0" });
    registerInitTool(server);
    registerReadConfigTool(server);
    registerListAgentsTool(server);

    client = new Client({ name: "test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    tmpDir = await mkdtemp(resolve(tmpdir(), "synthex-test-"));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("lists 3 tools", async () => {
    const result = await client.listTools();
    expect(result.tools).toHaveLength(3);
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("synthex_init");
    expect(names).toContain("synthex_read_config");
    expect(names).toContain("synthex_list_agents");
  });

  describe("synthex_init", () => {
    it("creates config file and directories", async () => {
      const result = await client.callTool({
        name: "synthex_init",
        arguments: { project_root: tmpDir },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Synthex initialized successfully");

      // Config file should exist
      const configPath = resolve(tmpDir, ".synthex", "config.yaml");
      const config = await readFile(configPath, "utf-8");
      expect(config).toContain("implementation_plan:");

      // Directories should exist
      const dirs = [
        "docs/reqs",
        "docs/plans",
        "docs/specs",
        "docs/specs/decisions",
        "docs/specs/rfcs",
        "docs/runbooks",
        "docs/retros",
      ];
      for (const dir of dirs) {
        await expect(access(resolve(tmpDir, dir))).resolves.toBeUndefined();
      }
    });

    it("skips config file if already exists", async () => {
      const result = await client.callTool({
        name: "synthex_init",
        arguments: { project_root: tmpDir },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("already exists");
    });
  });

  describe("synthex_read_config", () => {
    it("returns merged config", async () => {
      const result = await client.callTool({
        name: "synthex_read_config",
        arguments: { project_root: tmpDir },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("implementation_plan:");
      expect(text).toContain("code_review:");
      expect(text).toContain("quality:");
    });

    it("returns defaults when no project config exists", async () => {
      const emptyDir = await mkdtemp(resolve(tmpdir(), "synthex-empty-"));
      try {
        const result = await client.callTool({
          name: "synthex_read_config",
          arguments: { project_root: emptyDir },
        });

        const text = (
          result.content as Array<{ type: string; text: string }>
        )[0].text;
        expect(text).toContain("implementation_plan:");
      } finally {
        await rm(emptyDir, { recursive: true });
      }
    });
  });

  describe("synthex_list_agents", () => {
    it("returns agent table with 15 agents", async () => {
      const result = await client.callTool({
        name: "synthex_list_agents",
        arguments: {},
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("## Synthex Agents");
      expect(text).toContain("tech-lead");
      expect(text).toContain("security-reviewer");
      expect(text).toContain("Total: 15 agents available");
    });
  });
});

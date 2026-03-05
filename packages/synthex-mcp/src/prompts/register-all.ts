import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assemblePromptMessages } from "./registry.js";
import {
  extractCommandMetadata,
  buildCommandAgentMap,
} from "../lib/command-metadata.js";
import { listCommandNames, loadCommand } from "../lib/markdown-loader.js";

/**
 * Parameter schemas for commands that accept user input.
 * Commands not listed here have no parameters.
 */
const COMMAND_PARAMS: Record<string, Record<string, z.ZodString>> = {
  "review-code": {
    target: z
      .string()
      .describe(
        "File paths, directory, or git diff range to review (default: staged changes)",
      ),
  },
  "write-implementation-plan": {
    prd_path: z
      .string()
      .describe("Path to the PRD file (default: docs/reqs/main.md)"),
  },
  "write-adr": {
    title: z.string().describe("Title of the architecture decision"),
  },
  "write-rfc": {
    title: z.string().describe("Title of the RFC"),
  },
  "test-coverage-analysis": {
    target: z
      .string()
      .describe("File paths or directories to analyze (default: entire project)"),
  },
  "design-system-audit": {
    target: z
      .string()
      .describe("Directories to scan for compliance (default: src/)"),
  },
  retrospective: {
    cycle: z.string().describe("Sprint/cycle identifier to reflect on"),
  },
  "reliability-review": {
    target: z
      .string()
      .describe("Service or system to assess for operational readiness"),
  },
  "performance-audit": {
    target: z
      .string()
      .describe("URL, route, or component to analyze for performance"),
  },
  "next-priority": {
    context: z
      .string()
      .describe("Additional context about current priorities or blockers"),
  },
};

/**
 * Registers all Synthex commands as MCP Prompts.
 */
export async function registerAllPrompts(server: McpServer): Promise<void> {
  const [commandNames, agentMap] = await Promise.all([
    listCommandNames(),
    buildCommandAgentMap(),
  ]);

  for (const name of commandNames) {
    const markdown = await loadCommand(name);
    const meta = extractCommandMetadata(name, markdown);
    const agentNames = agentMap[name] ?? [];
    const params = COMMAND_PARAMS[name];

    const agentSuffix =
      agentNames.length > 0 ? ` (agents: ${agentNames.join(", ")})` : "";
    const description = `${meta.description}${agentSuffix}`;

    if (params) {
      server.prompt(
        `synthex-${name}`,
        description,
        params,
        async (paramValues) => ({
          messages: await assemblePromptMessages(
            name,
            paramValues as Record<string, string>,
          ),
        }),
      );
    } else {
      server.prompt(`synthex-${name}`, description, async () => ({
        messages: await assemblePromptMessages(name),
      }));
    }
  }
}

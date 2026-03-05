import { loadAgent, loadCommand } from "../lib/markdown-loader.js";
import { buildCommandAgentMap } from "../lib/command-metadata.js";

export interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

// Lazily cached command-agent map
let cachedMap: Record<string, string[]> | null = null;

async function getCommandAgentMap(): Promise<Record<string, string[]>> {
  if (!cachedMap) {
    cachedMap = await buildCommandAgentMap();
  }
  return cachedMap;
}

/**
 * Assembles the MCP prompt messages for a given command.
 *
 * The message sequence is:
 * 1. One user message per referenced agent definition (injected as context)
 * 2. One user message with the full command workflow
 * 3. One user message with any user-provided parameters
 */
export async function assemblePromptMessages(
  commandName: string,
  params?: Record<string, string>,
): Promise<PromptMessage[]> {
  const messages: PromptMessage[] = [];

  // Inject agent definitions as context
  const map = await getCommandAgentMap();
  const agentNames = map[commandName] ?? [];
  for (const agentName of agentNames) {
    const agentContent = await loadAgent(agentName);
    messages.push({
      role: "user",
      content: {
        type: "text",
        text: `<agent-definition name="${agentName}">\n${agentContent}\n</agent-definition>`,
      },
    });
  }

  // Inject the command workflow
  const commandContent = await loadCommand(commandName);
  messages.push({
    role: "user",
    content: {
      type: "text",
      text: `<command-workflow name="${commandName}">\n${commandContent}\n</command-workflow>`,
    },
  });

  // Inject user parameters if provided
  if (params && Object.keys(params).length > 0) {
    const paramLines = Object.entries(params)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join("\n");
    messages.push({
      role: "user",
      content: {
        type: "text",
        text: `Execute the workflow above with these parameters:\n${paramLines}`,
      },
    });
  }

  return messages;
}

import { listAgentNames, loadAgent } from "./markdown-loader.js";

/**
 * Agent metadata extracted from the first lines of an agent markdown file.
 */
export interface AgentMetadata {
  name: string;
  title: string;
  description: string;
}

/**
 * Extracts the title (first H1) and description (first paragraph after H1)
 * from an agent markdown file.
 */
export function extractAgentMetadata(
  agentName: string,
  markdown: string,
): AgentMetadata {
  const lines = markdown.split("\n");

  let title = agentName;
  let description = "";

  // Find the first H1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      // Find the first non-empty line after the H1 (skip blank lines and ---)
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine === "" || nextLine === "---") continue;
        if (nextLine.startsWith("#")) break;
        // Strip bold markers for cleaner descriptions
        description = nextLine.replace(/\*\*/g, "");
        break;
      }
      break;
    }
  }

  return { name: agentName, title, description };
}

/**
 * Extracts the agent's role from the "You are a **Role**" pattern.
 * Returns the bold text, or the full first sentence as fallback.
 */
export function extractAgentRole(markdown: string): string {
  const match = markdown.match(/You are a \*\*([^*]+)\*\*/);
  if (match) return match[1];

  // Fallback: use the first sentence of the description
  const meta = extractAgentMetadata("", markdown);
  const firstSentence = meta.description.split(/\.\s/)[0];
  return firstSentence || meta.title;
}

/**
 * Builds the agent catalog dynamically from the agent markdown files.
 * Each entry has name (from filename) and role (parsed from "You are a **Role**").
 */
export async function buildAgentCatalog(): Promise<
  Array<{ name: string; role: string }>
> {
  const names = await listAgentNames();
  const catalog: Array<{ name: string; role: string }> = [];

  for (const name of names) {
    const markdown = await loadAgent(name);
    const role = extractAgentRole(markdown);
    catalog.push({ name, role });
  }

  return catalog;
}

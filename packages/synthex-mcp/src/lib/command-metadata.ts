import { listAgentNames, listCommandNames, loadCommand } from "./markdown-loader.js";

/**
 * Command metadata extracted from command markdown files.
 */
export interface CommandMetadata {
  name: string;
  title: string;
  description: string;
  agents: string[];
}

/**
 * Extracts the title (first H1) and description (first paragraph) from a command markdown file.
 */
export function extractCommandMetadata(
  commandName: string,
  markdown: string,
): Omit<CommandMetadata, "agents"> {
  const lines = markdown.split("\n");

  let title = commandName;
  let description = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine === "" || nextLine === "---") continue;
        if (nextLine.startsWith("#")) break;
        description = nextLine.replace(/\*\*/g, "");
        break;
      }
      break;
    }
  }

  return { name: commandName, title, description };
}

/**
 * Converts a display name like "Tech Lead" or "SRE Agent" to a kebab-case
 * filename like "tech-lead" or "sre-agent".
 */
function displayNameToSlug(displayName: string): string {
  return displayName.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Extracts agent references from a command markdown file by matching
 * the "**{Agent Name} sub-agent**" pattern used consistently across all commands.
 * Returns deduplicated, sorted agent slugs that exist as actual agent files.
 */
export function extractReferencedAgents(
  markdown: string,
  knownAgentSlugs: string[],
): string[] {
  // Match: **Agent Name sub-agent** (with optional trailing text before **)
  // Uses [^*\n]+? to prevent matching across line boundaries.
  const pattern = /\*\*([^*\n]+?)\s+sub-agent\b[^*\n]*\*\*/gi;
  const found = new Set<string>();

  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    const slug = displayNameToSlug(match[1]);
    if (knownAgentSlugs.includes(slug)) {
      found.add(slug);
    }
  }

  return [...found].sort();
}

/**
 * Builds the command-to-agent mapping dynamically by parsing all command files
 * for "**{Agent Name} sub-agent**" references.
 */
export async function buildCommandAgentMap(): Promise<
  Record<string, string[]>
> {
  const [commandNames, agentSlugs] = await Promise.all([
    listCommandNames(),
    listAgentNames(),
  ]);

  const map: Record<string, string[]> = {};

  for (const name of commandNames) {
    const markdown = await loadCommand(name);
    map[name] = extractReferencedAgents(markdown, agentSlugs);
  }

  return map;
}

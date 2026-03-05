import { describe, it, expect } from "vitest";
import {
  listAgentNames,
  listCommandNames,
  loadAgent,
  loadCommand,
  loadConfigDefaults,
} from "../src/lib/markdown-loader.js";
import { mergeConfig, loadDefaults } from "../src/lib/config-merger.js";
import {
  extractAgentMetadata,
  extractAgentRole,
  buildAgentCatalog,
} from "../src/lib/agent-metadata.js";
import {
  extractCommandMetadata,
  extractReferencedAgents,
  buildCommandAgentMap,
} from "../src/lib/command-metadata.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

describe("markdown-loader", () => {
  it("lists all 15 agent names", async () => {
    const names = await listAgentNames();
    expect(names).toHaveLength(15);
    expect(names).toContain("tech-lead");
    expect(names).toContain("code-reviewer");
    expect(names).toContain("security-reviewer");
    expect(names).toContain("product-manager");
  });

  it("lists all 11 command names", async () => {
    const names = await listCommandNames();
    expect(names).toHaveLength(11);
    expect(names).toContain("review-code");
    expect(names).toContain("init");
    expect(names).toContain("write-implementation-plan");
  });

  it("loads an agent markdown file", async () => {
    const content = await loadAgent("tech-lead");
    expect(content).toContain("# Tech Lead");
    expect(content.length).toBeGreaterThan(100);
  });

  it("loads a command markdown file", async () => {
    const content = await loadCommand("review-code");
    expect(content).toContain("# Review Code");
    expect(content.length).toBeGreaterThan(100);
  });

  it("loads config defaults", async () => {
    const content = await loadConfigDefaults();
    expect(content).toContain("implementation_plan:");
    expect(content).toContain("code_review:");
  });

  it("throws on missing agent", async () => {
    await expect(loadAgent("nonexistent-agent")).rejects.toThrow();
  });
});

describe("config-merger", () => {
  it("loads defaults as parsed YAML", async () => {
    const defaults = await loadDefaults();
    expect(defaults).toHaveProperty("implementation_plan");
    expect(defaults).toHaveProperty("code_review");
    expect(defaults).toHaveProperty("quality");
    expect(defaults).toHaveProperty("documents");
  });

  it("returns defaults when project config does not exist", async () => {
    const merged = await mergeConfig("/nonexistent/path/config.yaml");
    const defaults = await loadDefaults();
    expect(merged).toEqual(defaults);
  });

  it("deep merges project overrides into defaults", async () => {
    const tmpDir = resolve(tmpdir(), `synthex-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const configPath = resolve(tmpDir, "config.yaml");

    await writeFile(
      configPath,
      `quality:\n  coverage_thresholds:\n    line: 90\n  test_runner: jest\n`,
    );

    try {
      const merged = await mergeConfig(configPath);
      const quality = merged.quality as Record<string, unknown>;
      const thresholds = quality.coverage_thresholds as Record<string, number>;

      // Overridden values
      expect(thresholds.line).toBe(90);
      expect(quality.test_runner).toBe("jest");
      // Preserved defaults
      expect(thresholds.branch).toBe(70);
      expect(thresholds.function).toBe(80);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});

describe("agent-metadata", () => {
  it("extracts title and description from agent markdown", () => {
    const markdown = `# Tech Lead

You are a **Staff-level Tech Lead and Full-Stack Generalist**. You are the primary coding execution agent.

---

## Core Mission
`;
    const meta = extractAgentMetadata("tech-lead", markdown);
    expect(meta.name).toBe("tech-lead");
    expect(meta.title).toBe("Tech Lead");
    expect(meta.description).toContain("Staff-level Tech Lead");
    // Bold markers should be stripped
    expect(meta.description).not.toContain("**");
  });

  it("extracts role from 'You are a **Role**' pattern", () => {
    const markdown =
      'You are a **Senior Code Reviewer** who provides independent review.';
    expect(extractAgentRole(markdown)).toBe("Senior Code Reviewer");
  });

  it("buildAgentCatalog returns 15 agents with roles", async () => {
    const catalog = await buildAgentCatalog();
    expect(catalog).toHaveLength(15);
    for (const agent of catalog) {
      expect(agent.name).toBeTruthy();
      expect(agent.role).toBeTruthy();
    }
  });

  it("catalog roles are derived from markdown, not hardcoded", async () => {
    const catalog = await buildAgentCatalog();
    const techLead = catalog.find((a) => a.name === "tech-lead");
    expect(techLead?.role).toBe("Staff-level Tech Lead and Full-Stack Generalist");

    const secReviewer = catalog.find((a) => a.name === "security-reviewer");
    expect(secReviewer?.role).toContain("Senior Application Security Engineer");
  });
});

describe("command-metadata", () => {
  it("extracts title and description from command markdown", () => {
    const markdown = `# Review Code

Comprehensive, multi-perspective code review combining craftsmanship review.

## Parameters
`;
    const meta = extractCommandMetadata("review-code", markdown);
    expect(meta.name).toBe("review-code");
    expect(meta.title).toBe("Review Code");
    expect(meta.description).toContain("multi-perspective");
  });

  it("extracts agent references from sub-agent pattern", async () => {
    const agentSlugs = await listAgentNames();

    const markdown = `
Launch the **Tech Lead sub-agent** to handle execution.
Invoke the **Security Reviewer sub-agent** for review.
**Code Reviewer sub-agent:**
**Performance Engineer sub-agent (optional, if enabled):**
`;
    const agents = extractReferencedAgents(markdown, agentSlugs);
    expect(agents).toContain("tech-lead");
    expect(agents).toContain("security-reviewer");
    expect(agents).toContain("code-reviewer");
    expect(agents).toContain("performance-engineer");
  });

  it("deduplicates agent references", async () => {
    const agentSlugs = await listAgentNames();

    const markdown = `
Launch the **Architect sub-agent** to review.
Invoke the **Architect sub-agent** again for follow-up.
**Architect sub-agent (self-review):**
`;
    const agents = extractReferencedAgents(markdown, agentSlugs);
    expect(agents).toEqual(["architect"]);
  });

  it("ignores references to non-existent agents", async () => {
    const agentSlugs = await listAgentNames();

    const markdown = `Launch the **Imaginary Agent sub-agent** for magic.`;
    const agents = extractReferencedAgents(markdown, agentSlugs);
    expect(agents).toEqual([]);
  });

  it("buildCommandAgentMap covers all 11 commands", async () => {
    const map = await buildCommandAgentMap();
    expect(Object.keys(map)).toHaveLength(11);
  });

  it("buildCommandAgentMap extracts correct agents for known commands", async () => {
    const map = await buildCommandAgentMap();

    // review-code references: code-reviewer, security-reviewer, performance-engineer, design-system-agent
    expect(map["review-code"]).toContain("code-reviewer");
    expect(map["review-code"]).toContain("security-reviewer");

    // write-rfc references: architect, product-manager, tech-lead, security-reviewer
    expect(map["write-rfc"]).toContain("architect");
    expect(map["write-rfc"]).toContain("product-manager");
    expect(map["write-rfc"]).toContain("tech-lead");
    expect(map["write-rfc"]).toContain("security-reviewer");

    // init has no agents
    expect(map["init"]).toEqual([]);
  });

  it("all extracted agents are real agent files", async () => {
    const map = await buildCommandAgentMap();
    const agentNames = await listAgentNames();
    for (const [, agents] of Object.entries(map)) {
      for (const agent of agents) {
        expect(agentNames).toContain(agent);
      }
    }
  });
});

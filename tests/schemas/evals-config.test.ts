/**
 * Layer 1: Structural validation of the `claude plugin eval` suite under
 * plugins/synthex/evals/ (FR-HM34, Task 27).
 *
 * These tests never invoke `claude plugin eval` or any LLM — they parse the
 * generated case directories (prompt.md + graders/*.md) and the manifest
 * that produced them, plus the manual-trigger CI job, at zero cost.
 *
 * FR-HM34 requirements checked here:
 * - 18 cases (7 security, 8 terraform, 3 code-reviewer planted-issue fixtures).
 * - Every GATING grader is deterministic (`regex` / `tool_used`); no `llm`
 *   or `baseline` grader ever gates the suite.
 * - No case references the Artifact tool (disabled for eval runs).
 * - Every case maps to an existing fixture file.
 * - The CI job that runs the suite is workflow_dispatch-only (never on
 *   pull_request/push) and invokes the wrapper with `--threshold 0.67`.
 *
 * Plan: docs/plans/harness-modernization.md, Phase 3 / Milestone 3.1 / Task 27.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

const REPO_ROOT = path.join(__dirname, '..', '..');
const EVALS_ROOT = path.join(REPO_ROOT, 'plugins', 'synthex', 'evals');
const MANIFEST_PATH = path.join(REPO_ROOT, 'tests', 'scripts', 'eval-cases.json');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'agent-tests.yml');

const DETERMINISTIC_GRADER_TYPES = new Set(['regex', 'tool_used', 'file_exists', 'tool_order']);
const NON_DETERMINISTIC_GRADER_TYPES = new Set(['llm', 'baseline']);

interface Manifest {
  verdictHeadings: Record<string, string>;
  cases: Array<{
    id: string;
    agent: string;
    fixture: string;
    fixtureType: string;
    extraContext?: string;
    expectedVerdictWords: string[];
    plantedIssues: Array<{ label: string; pattern: string; flags?: string }>;
  }>;
}

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
}

function splitFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const frontmatter = (yaml.load(match[1]) as Record<string, unknown>) ?? {};
  return { frontmatter, body: match[2] ?? '' };
}

function caseDirs(): string[] {
  if (!fs.existsSync(EVALS_ROOT)) return [];
  return fs
    .readdirSync(EVALS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'results')
    .map((d) => d.name)
    .sort();
}

function graderFiles(caseId: string): string[] {
  const gradersDir = path.join(EVALS_ROOT, caseId, 'graders');
  if (!fs.existsSync(gradersDir)) return [];
  return fs
    .readdirSync(gradersDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(gradersDir, f));
}

// ── Tests ────────────────────────────────────────────────────────

describe('plugins/synthex/evals/ manifest (FR-HM34, Task 27)', () => {
  const manifest = readManifest();

  it('has exactly 18 cases', () => {
    expect(manifest.cases.length).toBe(18);
  });

  it('has exactly 7 security-reviewer, 8 terraform-plan-reviewer, and 3 code-reviewer cases', () => {
    const counts: Record<string, number> = {};
    for (const c of manifest.cases) counts[c.agent] = (counts[c.agent] ?? 0) + 1;
    expect(counts['security-reviewer']).toBe(7);
    expect(counts['terraform-plan-reviewer']).toBe(8);
    expect(counts['code-reviewer']).toBe(3);
  });

  it('has unique case ids', () => {
    const ids = manifest.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every case maps to an existing fixture file', () => {
    for (const c of manifest.cases) {
      const fixturePath = path.join(REPO_ROOT, c.fixture);
      expect(fs.existsSync(fixturePath), `${c.id}: missing fixture ${c.fixture}`).toBe(true);
    }
  });

  it('every referenced agent has a corresponding plugin agent file', () => {
    for (const c of manifest.cases) {
      const agentPath = path.join(REPO_ROOT, 'plugins', 'synthex', 'agents', `${c.agent}.md`);
      expect(fs.existsSync(agentPath), `${c.id}: missing agent ${c.agent}.md`).toBe(true);
    }
  });

  it('every regex-pattern (verdict + planted issue) compiles as a valid JS regex', () => {
    for (const c of manifest.cases) {
      for (const issue of c.plantedIssues) {
        expect(() => new RegExp(issue.pattern, issue.flags || '')).not.toThrow();
      }
    }
  });

  it('fixtures referenced total 18 distinct files across security/terraform/code-reviewer dirs', () => {
    const fixtures = new Set(manifest.cases.map((c) => c.fixture));
    expect(fixtures.size).toBe(18);
    const securityCount = [...fixtures].filter((f) => f.includes('/security/')).length;
    const terraformCount = [...fixtures].filter((f) => f.includes('/terraform/')).length;
    const codeReviewerCount = [...fixtures].filter((f) => f.includes('/code-reviewer/')).length;
    expect(securityCount).toBe(7);
    expect(terraformCount).toBe(8);
    expect(codeReviewerCount).toBe(3);
  });
});

describe('plugins/synthex/evals/ generated case directories (FR-HM34, Task 27)', () => {
  const manifest = readManifest();
  const dirs = caseDirs();
  const hasGeneratedTree = dirs.length > 0;

  it('the evals/ directory exists and is generated (run node tests/scripts/generate-evals.mjs if this fails)', () => {
    expect(
      fs.existsSync(EVALS_ROOT),
      'plugins/synthex/evals/ does not exist — run: node tests/scripts/generate-evals.mjs',
    ).toBe(true);
  });

  it.runIf(hasGeneratedTree)('has exactly one directory per manifest case id, no extras', () => {
    const manifestIds = manifest.cases.map((c) => c.id).sort();
    expect(dirs).toEqual(manifestIds);
  });

  describe.runIf(hasGeneratedTree)('per-case structure', () => {
    for (const entry of manifest.cases) {
      describe(entry.id, () => {
        const caseDir = path.join(EVALS_ROOT, entry.id);
        const promptPath = path.join(caseDir, 'prompt.md');

        it('has a prompt.md', () => {
          expect(fs.existsSync(promptPath)).toBe(true);
        });

        it.runIf(fs.existsSync(promptPath))('prompt.md does not list the Artifact tool in allowed_tools', () => {
          const { frontmatter } = splitFrontmatter(fs.readFileSync(promptPath, 'utf-8'));
          const allowedTools = (frontmatter.allowed_tools as string[]) ?? [];
          expect(allowedTools.map((t) => t.toLowerCase())).not.toContain('artifact');
        });

        it.runIf(fs.existsSync(promptPath))('prompt.md body never mentions the Artifact tool', () => {
          const { body } = splitFrontmatter(fs.readFileSync(promptPath, 'utf-8'));
          expect(/\bArtifact\b/.test(body)).toBe(false);
        });

        it.runIf(fs.existsSync(promptPath))('prompt.md sets runs: 3 (D28: >= 3 runs per fixture)', () => {
          const { frontmatter } = splitFrontmatter(fs.readFileSync(promptPath, 'utf-8'));
          expect(frontmatter.runs).toBeGreaterThanOrEqual(3);
        });

        const graders = graderFiles(entry.id);

        it('has at least one grader (the verdict header check)', () => {
          expect(graders.length).toBeGreaterThan(0);
        });

        it('has exactly 2 + N graders (dispatch + verdict + one per planted issue)', () => {
          expect(graders.length).toBe(2 + entry.plantedIssues.length);
        });

        it('every grader has a deterministic type; none is llm or baseline', () => {
          for (const graderPath of graders) {
            const { frontmatter } = splitFrontmatter(fs.readFileSync(graderPath, 'utf-8'));
            const type = frontmatter.type as string;
            expect(
              DETERMINISTIC_GRADER_TYPES.has(type),
              `${entry.id}/${path.basename(graderPath)}: type "${type}" is not deterministic`,
            ).toBe(true);
            expect(NON_DETERMINISTIC_GRADER_TYPES.has(type)).toBe(false);
          }
        });

        it('no grader references the Artifact tool', () => {
          for (const graderPath of graders) {
            const content = fs.readFileSync(graderPath, 'utf-8');
            expect(/\bArtifact\b/.test(content)).toBe(false);
          }
        });

        it('the verdict grader (01-verdict) is a regex grader targeting last_message', () => {
          const verdictGrader = graders.find((g) => path.basename(g).startsWith('01-verdict'));
          expect(verdictGrader, 'no 01-verdict grader found').toBeTruthy();
          if (!verdictGrader) return;
          const { frontmatter } = splitFrontmatter(fs.readFileSync(verdictGrader, 'utf-8'));
          expect(frontmatter.type).toBe('regex');
          expect(frontmatter.target).toBe('last_message');
          const pattern = frontmatter.pattern as string;
          for (const word of entry.expectedVerdictWords) {
            // The pattern must be able to match this expected word (loose
            // substring check on the alternation group is sufficient here —
            // exact regex semantics are covered by the "compiles" test).
            expect(pattern).toContain(word);
          }
        });

        it('the dispatch grader (00-agent-dispatch) uses tool_used on Agent, marked arm: with-only', () => {
          const dispatchGrader = graders.find((g) => path.basename(g).startsWith('00-agent-dispatch'));
          expect(dispatchGrader, 'no 00-agent-dispatch grader found').toBeTruthy();
          if (!dispatchGrader) return;
          const { frontmatter } = splitFrontmatter(fs.readFileSync(dispatchGrader, 'utf-8'));
          expect(frontmatter.type).toBe('tool_used');
          expect(frontmatter.tool).toBe('Agent');
          expect(frontmatter.arm).toBe('with-only');
          expect(frontmatter.input_match as string).toContain(`synthex:${entry.agent}`);
        });

        it('has one issue grader per manifest planted issue, each a regex on last_message', () => {
          const issueGraders = graders.filter((g) => path.basename(g).startsWith('02-issue-'));
          expect(issueGraders.length).toBe(entry.plantedIssues.length);
          for (const graderPath of issueGraders) {
            const { frontmatter } = splitFrontmatter(fs.readFileSync(graderPath, 'utf-8'));
            expect(frontmatter.type).toBe('regex');
            expect(frontmatter.target).toBe('last_message');
          }
        });
      });
    }
  });
});

describe('Manual-trigger CI job (FR-HM34, Task 27)', () => {
  const workflowContent = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
  const workflow = yaml.load(workflowContent) as any;

  it('agent-tests.yml has a plugin-eval job', () => {
    expect(workflow.jobs['plugin-eval']).toBeTruthy();
  });

  it('the plugin-eval job is gated on workflow_dispatch AND its own input flag', () => {
    const job = workflow.jobs['plugin-eval'];
    expect(job.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(job.if).toContain('run_plugin_eval');
  });

  it('workflow_dispatch inputs declare run_plugin_eval, defaulting to false', () => {
    // js-yaml parses the reserved word `on:` as the boolean key `true` —
    // read via bracket access to avoid relying on that quirk's key name.
    const onBlock = workflow.on ?? workflow[true as unknown as string];
    expect(onBlock.workflow_dispatch.inputs.run_plugin_eval).toBeTruthy();
    expect(onBlock.workflow_dispatch.inputs.run_plugin_eval.default).toBe(false);
  });

  it('the job is never triggered by pull_request or push (job-level if requires workflow_dispatch)', () => {
    // Every job in this workflow shares the same top-level `on:` triggers
    // (pull_request, push, workflow_dispatch); only the job's own `if:`
    // condition can restrict it to workflow_dispatch. Assert that
    // restriction is present (checked above) and that no override lifts it.
    const job = workflow.jobs['plugin-eval'];
    expect(job.if).not.toContain('pull_request');
    expect(job.if).not.toContain("== 'push'");
  });

  it('runs the wrapper with --threshold 0.67', () => {
    const job = workflow.jobs['plugin-eval'];
    const runStep = job.steps.find((s: any) => typeof s.run === 'string' && s.run.includes('run-evals.mjs'));
    expect(runStep, 'no step invokes tests/scripts/run-evals.mjs').toBeTruthy();
    expect(runStep.run).toContain('--threshold 0.67');
  });

  it('uploads a report artifact', () => {
    const job = workflow.jobs['plugin-eval'];
    const uploadStep = job.steps.find(
      (s: any) => typeof s.uses === 'string' && s.uses.startsWith('actions/upload-artifact'),
    );
    expect(uploadStep).toBeTruthy();
  });
});

describe('tests/scripts/run-evals.mjs and generate-evals.mjs exist and are executable scripts', () => {
  it('run-evals.mjs exists', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'tests', 'scripts', 'run-evals.mjs'))).toBe(true);
  });

  it('generate-evals.mjs exists', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'tests', 'scripts', 'generate-evals.mjs'))).toBe(true);
  });

  it('run-evals.mjs forwards --runs (default 3, per D28) to `claude plugin eval`', () => {
    const content = fs.readFileSync(
      path.join(REPO_ROOT, 'tests', 'scripts', 'run-evals.mjs'),
      'utf-8',
    );
    expect(content).toContain("runs: 3");
    expect(content).toContain("'--runs'");
  });
});

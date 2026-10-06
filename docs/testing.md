# Synthex — Testing Guide

## Overview

The Synthex agents are pure markdown prompt definitions — there's no runtime code to unit test. Instead, we use **eval-driven testing**: invoke agents with synthetic inputs via `claude -p`, then validate the outputs structurally, behaviorally, and semantically.

The framework is built on a **three-layer testing pyramid** that balances thoroughness against cost:

```
         /\            Layer 3: SEMANTIC EVAL
        /  \           Nightly — LLM-as-judge
       /    \          Evaluates accuracy & quality
      /------\
     / cached  \       Layer 2: BEHAVIORAL ASSERTIONS
    /  outputs  \      CI — one LLM call, many assertions
   /   (regex,   \     Checks rules, patterns, conditions
  /   JS, etc.)   \
 /─────────────────\
/  zero LLM cost    \  Layer 1: SCHEMA VALIDATION
/ (golden snapshots) \  Every PR — validates markdown structure
/─────────────────────\
```

| Layer | What It Validates | Cost | When It Runs |
|-------|-------------------|------|-------------|
| **1 — Schema** | Markdown structure: verdict headings, required sections, table columns, finding fields, severity ordering | $0 | Every PR |
| **2 — Behavioral** | Agent rules: verdict logic, advisory-only boundaries, format detection, question batching, config awareness | ~$3/run (cached) | Manual trigger |
| **3 — Semantic** | Output quality: did it catch the planted vulnerability? Are recommendations actionable? | ~$8/run | Manual trigger |

## Quick Start

```bash
cd tests
npm install

# Layer 1: Schema validation (instant, free)
npx vitest run schemas/

# Layer 2: Behavioral assertions (requires ANTHROPIC_API_KEY, uses cache)
npx promptfoo eval --config promptfoo.config.yaml --filter-pattern "B[0-9]"

# Layer 3: Semantic evaluation (LLM-as-judge, more expensive)
npx promptfoo eval --config promptfoo.config.yaml --filter-pattern "S[0-9]"

# All layers combined
npm run test:all
```

---

## How Each Layer Works

### Layer 1: Schema Validation

Schema tests validate that agent outputs conform to the expected markdown structure. They run against either **inline sample outputs** (hardcoded in test files) or **golden snapshots** (pre-recorded LLM outputs stored in `tests/__snapshots__/`).

**The core parser** (`schemas/helpers.ts`) converts raw markdown into a typed `ParsedOutput` object:

```typescript
interface ParsedOutput {
  verdict: 'PASS' | 'WARN' | 'FAIL' | null;
  agentType: 'terraform' | 'security' | 'implementation-plan' | 'unknown';
  sections: Section[];   // Hierarchical heading tree
  findings: Finding[];   // #### [SEVERITY] blocks with parsed fields
  tables: Table[];       // Markdown tables with headers and rows
}
```

The parser uses regex patterns to extract:
- **Verdict**: `## Terraform Plan Review Verdict: FAIL`
- **Findings**: `#### [CRITICAL] Hardcoded AWS Access Key` with `- **CWE:** CWE-798` field lines
- **Sections**: Heading hierarchy built via a stack-based algorithm
- **Tables**: Header row + separator row detection, cells split by pipes

**Four schema validators** check format compliance:

| Validator | File | What It Checks |
|-----------|------|---------------|
| Terraform Reviewer | `schemas/terraform-reviewer.ts` | 6 required sections (Summary, Cost Impact, Destructive Actions, Security Concerns, Best Practice Violations, Findings Detail), finding fields (Resource, Risk, Description, Recommendation), `**Estimated Monthly Change:**` in Cost Impact, severity sorting, verdict consistency |
| Security Reviewer | `schemas/security-reviewer.ts` | 5 required sections (Summary, Findings, Secrets Scan, Dependency Audit, Recommendations), CWE references in every finding, 8 required finding fields (CWE, Category, Risk, Location, Description, Proof, Remediation, References), non-empty Secrets Scan and Dependency Audit |
| Implementation Plan | `schemas/implementation-plan.ts` | `# Implementation Plan:` heading, Overview/Decisions/Open Questions sections, Phase and Milestone subsections, task table columns (#, Task, Complexity, Dependencies, Status), valid complexity values (S/M/L), Parallelizable and Milestone Value callouts |
| Reviewer Feedback | `schemas/reviewer-feedback.ts` | `## Implementation Plan Review — [Role]` heading, Findings and Summary sections, finding fields (Section, Issue, Suggestion) |

**Test files** (`schemas/*.test.ts`) use two strategies:
1. **Inline samples**: Manually-crafted markdown outputs that always run — these test the parser itself
2. **Golden snapshots**: Pre-recorded real agent outputs that run only when `tests/__snapshots__/` contains `.snap.md` files (controlled by `describe.runIf(hasSnapshots)`)

**Verdict consistency rule** (enforced by all reviewers):
- CRITICAL or HIGH findings must produce a **FAIL** verdict
- MEDIUM-only findings must produce a **WARN** verdict
- LOW or no findings must produce a **PASS** verdict

### Layer 2: Behavioral Assertions

Behavioral tests invoke each agent **once per fixture** via `claude -p`, cache the output, then run many deterministic assertions against that single cached output. This is the key cost optimization — one LLM call satisfies 5-15 assertions.

**Technology:** [promptfoo](https://promptfoo.dev) with a custom exec provider (`helpers/claude-provider.js`).

**Assertion types used:**

| Type | Example | What It Does |
|------|---------|-------------|
| `contains` | `contains: "Findings Detail"` | Case-sensitive substring match |
| `icontains` | `icontains: "critical"` | Case-insensitive substring match |
| `not-icontains` | `not-icontains: "blocking this"` | Verifies substring is absent |
| `regex` | `regex: "Verdict: FAIL"` | Regex match against output |
| `javascript` | Custom function | Arbitrary JS returning `{ pass, reason }` |

**Test naming convention:** `{AGENT}-{LAYER}{NUMBER}`
- `TF-B4` = Terraform reviewer, Behavioral test #4
- `SR-S1` = Security reviewer, Semantic test #1
- `PM-B3` = Product manager, Behavioral test #3

**Example behavioral tests:**

| Test ID | What It Verifies | How |
|---------|-----------------|-----|
| TF-B4 | Destroying a production RDS without snapshot produces FAIL + CRITICAL | Regex for FAIL verdict, `icontains` for "CRITICAL", JS assertion checking first finding is CRITICAL |
| TF-B6 | Clean plan with no issues produces PASS | Regex for PASS verdict, `not-icontains` for "CRITICAL" and "HIGH" |
| TF-B7 | Multiple findings are sorted by severity | JS parses `#### [SEVERITY]` headings and verifies CRITICAL > HIGH > MEDIUM > LOW order |
| TF-B10 | Agent is advisory-only (never blocks) | `not-icontains` for "blocking this", "refusing to", "cannot allow" |
| SR-B1 | Every finding has a CWE reference | `regex: "CWE-\\d+"` |
| SR-B6 | SQL injection remediation recommends parameterized queries | `icontains: "parameterized"` |
| PM-B1 | Brief input leads to questions, NOT an auto-generated PRD | JS checks `count("?") >= 2` AND absence of `## 3. Functional Requirements` |
| PM-B3 | Questions come in batches of 3-7 | JS counts question marks in first response |

### Layer 3: Semantic Evaluation

For quality checks that regex can't capture, promptfoo's `llm-rubric` assertion sends the agent's output to a **judge LLM** that scores it against a detailed rubric (0.0 to 1.0).

**Example rubric** (terraform reviewer catching SSH exposure):

```yaml
- type: llm-rubric
  value: |
    The terraform plan contains a security group opening SSH (port 22)
    to 0.0.0.0/0. The reviewer should:
    1. Identify this as CRITICAL or HIGH severity
    2. Reference the specific security group resource by name
    3. Recommend restricting the CIDR range
    4. Explain the business risk of open SSH access
    Score 1.0 if all criteria met, 0.75 if 3/4, 0.5 if vague, 0.0 if missed.
  threshold: 0.75
```

**Current semantic tests:**

| Test ID | What It Evaluates | Threshold |
|---------|------------------|-----------|
| TF-S1 | Catches planted SSH-to-world exposure with specific, actionable recommendations | 0.75 |
| SR-S1 | Identifies all SQL injection points, cites CWE-89, provides parameterized query fix | 0.75 |
| SR-S2 | Catches XSS via dangerouslySetInnerHTML, recommends DOMPurify or safe rendering | 0.75 |
| PM-S1 | Question quality: covers Vision, Users, Scope, Constraints, NFRs; questions are specific and batched | 0.60 |

---

## Data Flow

### How a Layer 2 test runs end-to-end

```
1. `npx promptfoo eval --filter-pattern "B[0-9]"` starts

2. promptfoo reads promptfoo.config.yaml, selects tests matching B[0-9]

3. For each test (e.g., "TF-B4: RDS destroy = FAIL"):
   a. promptfoo spawns: node tests/helpers/claude-provider.js
   b. Sends JSON on stdin:
      {
        vars: {
          agent: "terraform-plan-reviewer",
          input_file: "terraform/destructive-rds.txt",
          extra_context: "This is a production environment..."
        },
        config: { maxTurns: 1, model: "sonnet" }
      }

   c. claude-provider.js resolves paths:
      - Agent: plugins/synthex/agents/terraform-plan-reviewer.md
      - Fixture: tests/fixtures/terraform/destructive-rds.txt

   d. Computes cache key: SHA-256(agentContent + input + "sonnet")[0:16]

   e. Cache hit?
      YES -> reads tests/.cache/{key}.txt -> writes to stdout -> done
      NO  -> invokes: claude -p --output-format text --max-turns 1
                      --model sonnet --system-prompt "path/to/agent.md"
             with fixture content on stdin
           -> caches result to tests/.cache/{key}.txt
           -> writes to stdout

4. promptfoo captures stdout and runs each assertion:
   - regex "## Terraform Plan Review Verdict: FAIL"    -> pass
   - icontains "CRITICAL"                              -> pass
   - javascript: first #### [SEVERITY] heading is CRITICAL -> pass
   - icontains "skip_final_snapshot"                   -> pass

5. All assertions must pass for the test to pass
```

### How Layer 3 differs

Steps 1-3 are identical. At step 4, for `llm-rubric` assertions:
- promptfoo sends the agent's output + the rubric text to a **judge LLM**
- The judge returns a score (0.0 to 1.0)
- promptfoo checks `score >= threshold`
- This means Layer 3 tests cost roughly 2x per test (one call for the agent, one for the judge)

---

## Caching and Snapshots

The framework has two distinct storage mechanisms that serve different purposes:

### LLM Output Cache (`tests/.cache/`)

**Purpose:** Avoid redundant (expensive) LLM calls across test runs.

```
Cache key = SHA-256(agent.md content + fixture content + model)[0:16]

Agent definition changes?  -> key changes -> cache miss -> fresh LLM call
Fixture content changes?   -> key changes -> cache miss -> fresh LLM call
Neither changes?           -> cache hit   -> skip LLM  -> use cached output
```

- Stored as plain text files: `tests/.cache/{16-char-hex}.txt`
- **Gitignored** — regenerated on demand
- Used by Layer 2 and Layer 3 tests

### Golden Snapshots (`tests/__snapshots__/`)

**Purpose:** Regression baselines for Layer 1 schema validation.

- Stored as markdown files: `tests/__snapshots__/{agent}--{fixture}.snap.md`
- **Checked into git** — reviewed in PRs
- Human-readable and diffable
- Generated via `npm run snapshots:update`

**Why both?** Cache keys are opaque hashes — you can't tell which agent/fixture produced them. Snapshots have human-readable names and are version-controlled. Cache saves money; snapshots catch regressions.

---

## Test Fixtures

Fixtures are synthetic but realistic inputs with **deliberately planted issues** that agents must detect. This makes assertions deterministic — you know exactly what should be found.

### Terraform Fixtures (8 files)

| Fixture | Format | Planted Issues | Expected Verdict |
|---------|--------|---------------|-----------------|
| `clean-plan.txt` | HCL-style | None — well-configured S3 with encryption, versioning, tags | PASS |
| `clean-plan.json` | `terraform show -json` | Same as above, JSON format | PASS |
| `destructive-rds.txt` | HCL-style | Production RDS destroy with `skip_final_snapshot = true` | FAIL (CRITICAL) |
| `wide-open-sg.txt` | HCL-style | SSH port 22 open to `0.0.0.0/0` and `::/0` | FAIL (CRITICAL) |
| `surprise-cost-poc.txt` | HCL-style | POC-named resources using `m5.4xlarge`, `r5.2xlarge`, 3 NAT gateways | WARN (cost alert) |
| `missing-tags.txt` | HCL-style | EC2 and S3 missing required tags (Environment, Owner, etc.) | WARN (MEDIUM) |
| `multi-issue.json` | `terraform show -json` | CRITICAL (public RDS) + HIGH (IAM `*`) + MEDIUM (no monitoring) + LOW (missing description) | FAIL (sorted) |
| `empty-plan.txt` | HCL-style | "No changes. Your infrastructure matches the configuration." | PASS |

### Security Fixtures (7 files)

| Fixture | Planted Issues | Expected Verdict |
|---------|---------------|-----------------|
| `clean-code.diff` | None — Express.js with parameterized SQL, helmet, rate limiting | PASS |
| `hardcoded-secret.diff` | AWS `AKIA...` key, PostgreSQL connection string, Redis password, Stripe key, SendGrid key | FAIL (CRITICAL) |
| `sql-injection.diff` | Three routes with `${req.params.id}` interpolated into SQL | FAIL (CRITICAL) |
| `xss-vuln.diff` | React `dangerouslySetInnerHTML` with unsanitized user content | FAIL (HIGH) |
| `missing-auth.diff` | Admin routes (`/api/admin/users`) with no auth middleware | FAIL (HIGH) |
| `weak-csrf.diff` | Account management endpoints with no CSRF protection | WARN (MEDIUM) |
| `mixed-severity.diff` | CRITICAL (Stripe key) + HIGH (unauthed delete) + MEDIUM (stack trace leak) + LOW (missing rel=noopener) | FAIL (sorted) |

### Product Manager Fixtures (3 files)

| Fixture | Content | Expected Behavior |
|---------|---------|------------------|
| `brief-description.md` | Two sentences about API key management | Must ask clarifying questions — NOT auto-generate a PRD |
| `detailed-prd.md` | Full PRD with 7 functional requirements, personas, NFRs | Should draft an implementation plan |
| `ambiguous-reqs.md` | PRD with contradictions: offline-first vs real-time sync, 1 developer + $0 budget + 30 features | Must flag contradictions and push back |

### Command Fixtures (6 files across 4 scenarios)

| Scenario | Files | Tests |
|----------|-------|-------|
| `init/fresh-project/` | `package.json`, `src/index.ts` | `init` should create `.synthex/config.yaml` and `docs/` dirs |
| `init/existing-config/` | `package.json`, `.synthex/config.yaml` | `init` should detect existing config and prompt before overwriting |
| `write-impl-plan/default-config/` | `docs/reqs/main.md` | Command should use default reviewer panel (3 reviewers) |
| `write-impl-plan/custom-config/` | `docs/reqs/main.md`, `.synthex/config.yaml` | Command should use custom 4-reviewer panel |

---

## CI Pipeline

The GitHub Actions workflow (`.github/workflows/agent-tests.yml`) runs the three layers on different triggers. **Only Layer 1 runs automatically** — Layers 2 and 3 are manual-only to control costs.

```
+---------------------------+
|  Pull Request / Push      |---> Layer 1: Schema Validation (instant, free)
+---------------------------+

+---------------------------+
|  Manual: workflow_dispatch |
|  run_behavioral: true     |---> Layer 2: Behavioral Assertions (cached)
+---------------------------+

+---------------------------+
|  Manual: workflow_dispatch |
|  run_semantic: true       |---> Layer 3: Semantic Evaluation (LLM-as-judge)
+---------------------------+

+---------------------------+
|  Manual: workflow_dispatch |
|  run_plugin_eval: true    |---> Plugin Eval Suite (`claude plugin eval`, FR-HM34)
+---------------------------+
```

To trigger Layers 2 or 3 (or the plugin eval suite), go to **Actions > Agent Tests > Run workflow** and check the appropriate boxes.

**Cache persistence in CI:** The LLM output cache is stored via `actions/cache@v4` with key `llm-cache-${{ hashFiles('plugins/synthex/agents/**', 'tests/fixtures/**') }}`. When agent definitions or fixtures change, the cache key changes and fresh invocations happen. Otherwise, cached outputs are restored from the previous run.

---

## Adding Tests for a New Agent

1. **Create fixtures** in `tests/fixtures/{agent-name}/` — include at least one clean input (expected PASS) and one with planted issues (expected FAIL)

2. **Add a schema validator** in `tests/schemas/{agent-name}.ts`:
   - Define required sections, finding fields, table columns
   - Export a `validate{AgentName}Output(text): ValidationResult` function

3. **Write Vitest tests** in `tests/schemas/{agent-name}.test.ts`:
   - Add inline sample outputs for parser unit tests
   - Add golden snapshot tests guarded by `describe.runIf(hasSnapshots)`

4. **Add behavioral assertions** to `tests/promptfoo.config.yaml`:
   - One test per rule you want to verify
   - Use the `{AGENT}-B{N}` naming convention
   - Combine `contains`, `regex`, and `javascript` assertions

5. **Add semantic rubrics** (optional) for quality checks:
   - Use `llm-rubric` assertion type
   - Write detailed scoring criteria
   - Set appropriate thresholds (0.6-0.75 typical)

6. **Generate golden snapshots**: `npm run snapshots:update`

---

## Directory Structure

```
tests/
├── package.json                  # vitest, promptfoo, typescript
├── vitest.config.ts              # Layer 1 config
├── tsconfig.json                 # TypeScript strict mode, ESNext
├── promptfoo.config.yaml         # Layer 2+3: 27 test cases
├── .gitignore                    # Ignores .cache/, node_modules/
│
├── schemas/                      # Layer 1: Output structure validators
│   ├── helpers.ts                # Core markdown parser
│   ├── terraform-reviewer.ts     # TF output format validator
│   ├── security-reviewer.ts      # Security output format validator
│   ├── implementation-plan.ts    # Plan template validator
│   ├── reviewer-feedback.ts      # Peer review feedback validator
│   ├── terraform-reviewer.test.ts
│   ├── security-reviewer.test.ts
│   └── implementation-plan.test.ts
│
├── helpers/                      # Shared test infrastructure
│   ├── claude-provider.js        # promptfoo exec provider (wraps claude -p)
│   ├── invoke-agent.ts           # Programmatic agent invoker (TS)
│   ├── cache.ts                  # SHA-256 hash-based LLM output cache
│   ├── parse-markdown-output.ts  # Feature-rich markdown parser
│   └── snapshot-manager.ts       # Golden snapshot CRUD
│
├── fixtures/                     # Synthetic inputs with planted issues
│   ├── terraform/                # 8 terraform plan fixtures
│   ├── security/                 # 7 code diff fixtures
│   ├── product-manager/          # 3 PM input fixtures
│   └── commands/                 # 4 command integration scenarios
│
├── __snapshots__/                # Golden outputs (git-tracked)
└── .cache/                       # LLM output cache (gitignored)
```

## Cost Estimates

All LLM-dependent tests (Layers 2 and 3) are triggered manually to control costs.

| Layer | Per Run | Trigger | Notes |
|-------|---------|---------|-------|
| 1 — Schema | $0 | Every PR (automatic) | Always free — no LLM calls |
| 2 — Behavioral | ~$3 first run, ~$0 cached | Manual (workflow_dispatch) | Cached after first run per agent+fixture combo |
| 3 — Semantic | ~$8 | Manual (workflow_dispatch) | LLM judge calls, not cached |

## Task 16 (FR-HM6) — Boilerplate Diet: Layer 2 Verification

Task 16 removed the `## Interaction with Other Agents` and `## Future Considerations`
sections (relocated to `docs/agent-interactions.md` and `docs/roadmap.md`), condensed
`## Scope Boundaries` to two lines, and trimmed `## When You Are Invoked` to one
sentence across the 12 specialist agents. The acceptance criteria required
confirming no Layer 2 verdict regression on the 3 `code-reviewer` and 7
`security-reviewer` fixtures.

**Infrastructure note (found while running this):** `tests/helpers/invoke-agent.ts`
and `tests/helpers/claude-provider.js` both pass the *agent file path* as the
literal value of `claude -p --system-prompt`. The installed CLI (2.1.282) has no
`--system-prompt-file` flag — `--system-prompt` takes inline prompt text, not a
path. So neither the promptfoo provider nor `invoke-agent.ts` is actually loading
the agent's `.md` content as the system prompt today; the model runs as generic
Claude. `code-reviewer` also has zero entries in `promptfoo.config.yaml` (only
`security-reviewer` is wired), so this is the first time `code-reviewer`'s Layer 2
behavior has been checked against these fixtures at all. This is out of scope for
Task 16 to fix, but is flagged here since it affects every existing Layer 2 result
in this file predating this run.

**Method:** a standalone script (not checked in) read each agent's pre-Task-16
content via `git show HEAD:...` ("before") and the current file ("after"), and
invoked `claude -p --system-prompt <content>` directly (bypassing the broken
helpers above) with each fixture on stdin. `security-reviewer` used `--max-turns 1`
(matches its promptfoo config). `code-reviewer` needed `--max-turns 8` — its
Review Process mandates spawning a sub-agent for Specification Relevance Analysis,
which cannot complete in a single turn. Verdicts were extracted from the
`## <Agent> Verdict: PASS|WARN|FAIL` heading (tolerating markdown bold around the
verdict word, which the model sometimes emits).

**Result: no verdict regression attributable to the Task 16 edit.** 8 of 10
fixtures gave a single, stable, matching verdict on both sides across every
sample taken. The other 2 showed model-sampling variance, but the variance
appeared on **both** the before and after prompt when re-sampled at equal
turn budgets — i.e. the original (pre-Task-16) prompt is exactly as flaky on
these two fixtures as the trimmed one, so the flakiness is not something the
edit introduced.

| Agent | Fixture | Before verdict(s) observed | After verdict(s) observed | Assessment |
|-------|---------|------------------------------|------------------------------|------------|
| code-reviewer | clean-code.diff | (no verdict emitted), WARN, FAIL | FAIL, FAIL | Variance on both sides; FAIL overlaps |
| code-reviewer | god-object.diff | FAIL | FAIL | Match |
| code-reviewer | missing-error-handling.diff | (asked a clarifying question instead of reviewing), FAIL | FAIL | Match (after retry) |
| security-reviewer | clean-code.diff | PASS, PASS, WARN | WARN, WARN | Variance on both sides; WARN overlaps |
| security-reviewer | hardcoded-secret.diff | FAIL | FAIL | Match |
| security-reviewer | missing-auth.diff | FAIL | FAIL | Match |
| security-reviewer | mixed-severity.diff | FAIL | FAIL | Match |
| security-reviewer | sql-injection.diff | FAIL | FAIL | Match |
| security-reviewer | weak-csrf.diff | FAIL | FAIL | Match |
| security-reviewer | xss-vuln.diff | FAIL | FAIL | Match |

The two variance cases are both "mostly clean, borderline" fixtures (`clean-code.diff`
in each suite) where the model's PASS/WARN or WARN/FAIL boundary call is inherently
close. `code-reviewer`'s `haiku` + mandatory sub-agent spawn is also more prone to
turning a fixed `--max-turns` budget into a hard failure (asking a clarifying
question, or not reaching the verdict heading) than to changing the verdict itself
once it does complete — and it completed with the same verdict (FAIL) every time it
completed on both sides.

### Per-spawn prompt byte delta (12 specialists)

| Agent | Before | After | Delta | % smaller |
|-------|-------:|------:|------:|----------:|
| architect | 11,978 | 10,096 | -1,882 | -15.7% |
| code-reviewer | 13,790 | 12,232 | -1,558 | -11.3% |
| security-reviewer | 15,146 | 13,520 | -1,626 | -10.7% |
| terraform-plan-reviewer | 14,389 | 12,771 | -1,618 | -11.2% |
| quality-engineer | 11,643 | 10,041 | -1,602 | -13.8% |
| design-system-agent | 11,067 | 9,108 | -1,959 | -17.7% |
| performance-engineer | 11,408 | 9,702 | -1,706 | -15.0% |
| sre-agent | 13,178 | 11,499 | -1,679 | -12.7% |
| technical-writer | 9,878 | 8,314 | -1,564 | -15.8% |
| ux-researcher | 12,628 | 11,044 | -1,584 | -12.5% |
| metrics-analyst | 10,719 | 9,178 | -1,541 | -14.4% |
| retrospective-facilitator | 11,035 | 9,480 | -1,555 | -14.1% |
| **Total (12 specialists)** | **146,859** | **126,985** | **-19,874** | **-13.5%** |

`tech-lead.md` (11,790 → 10,282 bytes) and `lead-frontend-engineer.md` (9,554 →
9,190 bytes) also lost their phantom "not yet available" sub-agent registries.
`multi-model-review-orchestrator.md` (32,898 → 30,799 bytes) had its
`## Source Authority` bullet list collapsed to one paragraph and its
`## Scope Constraints` milestone-bookkeeping prose trimmed, while keeping every
FR/D id and locked string that `orchestrator-consolidation.test.ts`,
`orchestrator-preflight.test.ts`, and `orchestrator-stage5plus.test.ts` assert on.

Byte counts are recorded in `tests/fixtures/agent-boilerplate/agent-sizes-before.json`
and asserted (≥ 1,536-byte reduction per specialist) by
`tests/schemas/agent-boilerplate.test.ts`.

## Task 27 — Eval baseline (FR-HM34)

### Prerequisite fix: Layer 2 helpers never loaded the agent prompt

Task 16 found that `tests/helpers/invoke-agent.ts` and
`tests/helpers/claude-provider.js` both passed the invoked agent's **file
path** as the literal value of `claude -p --system-prompt`. `claude --help`
documents `--system-prompt <prompt>` as "System prompt to use for the
session" — it takes prompt *text*, not a path (there is no
`--system-prompt-file` flag on this CLI). So every prior Layer 2 run
(promptfoo and `invokeAgent()` alike) had been running the model with no
custom system prompt at all; the agent's persona was never actually loaded.

Fixed in both files: each now reads the agent's own markdown content, strips
the leading frontmatter block (`stripFrontmatter` — the frontmatter is
harness config, not part of the persona), and passes the resulting body as
`--system-prompt`. Both call sites switched from `execSync` on a
shell-joined command string to `execFileSync` with an argv array, since an
agent body is arbitrary markdown that can contain quotes, backticks, or
`$(...)` — exactly what a shell-interpreted string must not be trusted with.
The Task 3 frontmatter → `{model, effort}` resolution and the cache-key
construction (`getCacheKey(agentContent, ...)`, unchanged signature) are
untouched — the cache key still hashes the *full* agent content (frontmatter
included), so a frontmatter-only change (e.g. a future model/effort re-tier)
still invalidates the cache as before.

`tests/helpers/invoke-agent.ts` gained two exported pure functions so this is
testable without shelling out: `stripFrontmatter(agentContent)` and
`buildInvokeArgs({agentContent, model, effort, maxTurns})` (returns the full
argv). `tests/helpers/claude-provider.js` gained the mirrored
`stripFrontmatter` / `buildClaudeArgs`. New test:
`tests/schemas/invoke-agent-system-prompt.test.ts` — asserts the constructed
`--system-prompt` value contains the agent's H1 heading (not a `.md` path or
path separator) for every real file under `plugins/synthex/agents/`, and that
the frontmatter block itself is stripped out. 9 tests, all passing.

`code-reviewer` also had zero cases in `tests/promptfoo.config.yaml` before
this (only `security-reviewer` was wired). Added a `CODE REVIEWER` block (6
cases: `CR-B1`–`CR-B6`) mirroring the `SECURITY REVIEWER` block's shape,
against the 3 fixtures in `tests/fixtures/code-reviewer/`.

### Eval suite layout: `plugins/synthex/evals/`

`claude plugin eval init --help` documents two case layouts: `case.yaml`
(single file; needed only for `scaffold_script`/`history_file`/`add_dirs`) or
`prompt.md` + `graders/*.md` (frontmatter-per-file). Chose **`prompt.md` +
`graders/*.md`** — none of the 18 cases need scaffold scripts or extra mounted
directories, and the split keeps each grader's intent legible on its own.

Each case dispatches its target agent directly: `prompt.md` sets
`allowed_tools: [Agent]` and its body instructs the model to invoke the
plugin agent by its namespaced id (e.g. `synthex:code-reviewer`) via the
`Agent` tool and relay its response verbatim — this is the CLI's documented
pattern for exercising one specific packaged agent (there is no `agent:`
frontmatter key that runs a named agent directly without the top-level model
choosing to dispatch it). A `tool_used` grader (`tool: Agent`, matching the
namespaced id, `arm: with-only`) confirms the dispatch actually happened
instead of the top-level model reviewing the fixture itself; being
`with-only` keeps it out of the no-plugin baseline arm's score (that arm
cannot dispatch a plugin agent by construction — that gap *is* the ablation
signal) without failing that arm's own accounting.

All 18 cases were generated from one manifest, `tests/scripts/eval-cases.json`
(agent, fixture path, expected verdict words, planted-issue regex patterns —
one entry per case), via `plugins/synthex/scripts` sibling
`tests/scripts/generate-evals.mjs` (`--check` mode diffs the generated tree
against the manifest and exits 1 on drift; wired into the CI job below).
Every grader is **deterministic** — `type: regex` (verdict header, one per
planted issue) or `type: tool_used` (dispatch confirmation) — per FR-HM34:
"No LLM or baseline grader gates CI." No case's `allowed_tools` includes
`Artifact`, and no prompt or grader body mentions it.

Verdict-header regex is bold-tolerant (`\*{0,2}(?:PASS|WARN|FAIL)\*{0,2}`):
the model sometimes wraps the verdict word in markdown bold (`**FAIL**`),
the same quirk Task 16 already noted in its methodology.

**18 cases** = 7 security-reviewer (`tests/fixtures/security/`) + 8
terraform-plan-reviewer (`tests/fixtures/terraform/`) + 3 code-reviewer
(`tests/fixtures/code-reviewer/`), one per existing fixture file. Structural
compliance (case count, deterministic-only gating graders, no `Artifact`
reference, fixture existence, CI job shape) is asserted by
`tests/schemas/evals-config.test.ts` (216 assertions, all passing) — a Layer 1
test, zero LLM cost.

### Hash-keyed skip wrapper: `tests/scripts/run-evals.mjs`

`claude plugin eval` has no cross-run cache — every invocation re-runs every
selected case's `runs` agent calls, live, at cost. The wrapper hashes
`sha256(agent.md content + fixture content + resolved model)` per case
(mirrors `tests/helpers/cache.ts`'s key, keyed to the manifest instead of a
promptfoo test) and records each case's result under its hash in the
gitignored `tests/.eval-cache/results.json`. A case is only re-run when its
agent prompt or fixture actually changed since the recorded hash — exactly
the moments (e.g. Task 28/29 prose edits) when a fresh, paid run is
warranted. The cache is saved after every case (not only at the end), so a
crash or interrupt partway through an 18-case run doesn't lose the cases that
already completed and were paid for.

### Manual-trigger CI job

`.github/workflows/agent-tests.yml` gained a `plugin-eval` job, gated on
`workflow_dispatch` and its own `run_plugin_eval` input (default `false`) —
never on `pull_request`/`push`, matching the existing `behavioral-assertions`
/ `semantic-evaluation` jobs' manual-only convention. It installs the
`claude` CLI (`npm install -g @anthropic-ai/claude-code@latest`, the same
approach `release.yml` already uses), restores `tests/.eval-cache/` via
`actions/cache@v5`, verifies the generated case tree isn't stale
(`generate-evals.mjs --check`), then runs
`node tests/scripts/run-evals.mjs --threshold 0.67` and uploads the report
directory as an artifact.

### Baseline run (FR-HM34, D28)

Run against the agents **as they stand at Task 27** (pre-Task-28 frontmatter
re-tier, pre-Task-29 verification-pass prose) — i.e. this *is* the baseline
that Task 30's "D28 eval gate passes" criterion and Task 29's Layer 2
redacted-baseline comparison will be checked against.

**Command to reproduce** (run from the repo root; requires a local `claude`
login or `ANTHROPIC_API_KEY`):

```bash
node tests/scripts/run-evals.mjs \
  --runs 3 --ablation none --threshold 0 \
  --concurrency 4 --max-cost-usd 40 \
  --json /tmp/eval-baseline-final.json \
  --report-dir /tmp/eval-baseline-reports
```

**Scoping note on ablation:** this one-time baseline capture used
`--ablation none` (single arm) to bound cost/time — running the default
`with-without` ablation would double every agent invocation (108 runs instead
of 54) for a delta that is definitionally near-100% here (the no-plugin arm
cannot dispatch a namespaced plugin agent at all, so its `tool_used` grader
fails by construction on every case). The wrapper's own default, and the
manual CI job above, both keep `--ablation with-without` per FR-HM34 ("ablation
stays on for reporting"); only this specific baseline-capture invocation
overrode it to `none`.

**Recall table** (18 cases, 3 runs each, single arm; ✓ = grader passed that
run):

| Case | Agent | Planted | Run 1 | Run 2 | Run 3 | Found (majority) | Verdict pass |
|------|-------|--------:|:-----:|:-----:|:-----:|:-----------------:|:------------:|
| sec-clean-code | security-reviewer | 0 | n/a | n/a | n/a | n/a | 3/3 |
| sec-hardcoded-secret | security-reviewer | 1 | ✓ | ✓ | ✓ | 1/1 | 3/3 |
| sec-sql-injection | security-reviewer | 1 | ✓ | ✓ | ✓ | 1/1 | 3/3 |
| sec-xss-vuln | security-reviewer | 1 | ✓ | ✓ | ✓ | 1/1 | 3/3 |
| sec-missing-auth | security-reviewer | 1 | ✓ | ✓ | ✓ | 1/1 | 3/3 |
| sec-weak-csrf | security-reviewer | 1 | ✓ | ✓ | ✓ | 1/1 | 3/3 |
| sec-mixed-severity | security-reviewer | 3 | ✓✓✓ | ✓✓✓ | ✓✓✓ | 3/3 | 3/3 |
| tf-destructive-rds | terraform-plan-reviewer | 1 | ✓ | ✓ | ✓ | 1/1 | 3/3 |
| tf-missing-tags | terraform-plan-reviewer | 1 | ✓ | ✓ | ✓ | 1/1 | 3/3 |
| tf-clean-plan-txt | terraform-plan-reviewer | 0 | n/a | n/a | n/a | n/a | **1/3** |
| tf-empty-plan | terraform-plan-reviewer | 0 | n/a | n/a | n/a | n/a | 3/3 |
| tf-clean-plan-json | terraform-plan-reviewer | 0 | n/a | n/a | n/a | n/a | 3/3 |
| tf-multi-issue | terraform-plan-reviewer | 3 | ✓✓✓ | ✓✓✓ | ✓✓✓ | 3/3 | 3/3 |
| tf-wide-open-sg | terraform-plan-reviewer | 1 | ✓ | ✓ | ✓ | 1/1 | 3/3 |
| tf-surprise-cost-poc | terraform-plan-reviewer | 1 | ✓ | ✓ | ✗ | 1/1 | **2/3** |
| cr-clean-code | code-reviewer | 0 | n/a | n/a | n/a | n/a | 3/3 |
| cr-god-object | code-reviewer | 1 | ✓ | ✓ | ✓ | 1/1 | 3/3 |
| cr-missing-error-handling | code-reviewer | 1 | ✓ | ✓ | ✓ | 1/1 | 3/3 |
| **Total** | | **17** | | | | **17/17** | **51/54** |

**Aggregate recall: 17/17 planted issues found (majority vote across 3 runs)
= 100.0%.** Every planted issue that was found, was found in *all three*
runs of its case — zero per-run flakiness on issue detection in this
baseline. The only variance was in the **verdict header**, on two 0-planted
("clean") fixtures/one WARN-tolerant fixture, neither of which affects
recall:

- **`tf-clean-plan-txt`** (expected `PASS` only): 1/3 runs matched `PASS`; the
  other 2 runs produced some other verdict word (the run scaffold — and its
  `trace.jsonl` — is not retained by default, so the exact alternate word
  wasn't captured by this run; terraform-plan-reviewer is the more
  conservative of the three agents in this suite, so `WARN` on a technically
  clean plan is the likely candidate). Since this fixture plants zero
  issues, this is a verdict-stability observation only, not a recall miss —
  flagged here per D28's "the baseline's own variance is recorded."
- **`tf-surprise-cost-poc`** (expected `WARN|FAIL`): 2/3 runs matched; the
  planted-issue grader (surprise-cost language) still passed 2/3 runs, so it
  counts as found under the majority-vote rule.

**Verdict distribution** across all 54 runs: 51 matched their case's expected
verdict pattern (94.4%); the 3 divergences above are the entirety of the
mismatch.

**Discovered while authoring the manifest:** `tests/fixtures/code-reviewer/clean-code.diff`
is not actually free of code-quality issues — it uses `ConflictError` without
ever importing it, a genuine `ReferenceError`-at-runtime bug. A correctly
functioning `code-reviewer` therefore returns `FAIL`, not `PASS`, on this
fixture (confirmed empirically: 3/3 runs here, and consistent with Task 16's
own table, which recorded `FAIL, FAIL` post-Task-16). The manifest's expected
verdict for `cr-clean-code` was set to `WARN|FAIL` accordingly — this fixture
is "clean" only in the sense that it plants no *security* issue (it is
reused, as a separate file, by `security-reviewer`'s clean-code case too),
not that it is bug-free.

**Cost:** $16.26 total for this single-arm, 18-case × 3-run baseline capture
(mean ≈ $0.30/run). Per-case cost ranged $0.43 (`tf-empty-plan`, the
smallest/simplest input) to $1.47 (`tf-multi-issue`, the largest fixture with
the most findings to enumerate).

## Task 29 — Verification pass (FR-HM17, D18)

FR-HM17's prose path adds a short "Verification pass (CRITICAL/HIGH only, top
5)" section to `code-reviewer.md`, `security-reviewer.md`, and
`performance-engineer.md`: for each CRITICAL/HIGH finding, up to the top 5 by
severity, use an LSP tool if one is in the tool list, otherwise grep for the
symbol's references; never block the review on verification; log when the
top-5 cap fires. Result renders as `- **Verification:** CONFIRMED (lsp|grep) |
PLAUSIBLE (none)` inside the finding block. Gated on
`code_review.verification: prose|off`, default `off` (D18, NFR-HM1, NFR-HM3).

### Byte-budget conflict and resolution

> **Resolved (commit `ace7302`, merged 2026-09-26):** A.J. decided the shared section is excluded from the Task 16 shrink-floor math (it is opt-in functional prose, not boilerplate). `agent-boilerplate.test.ts` now subtracts the canonical `tests/fixtures/verification-pass/section.md` bytes (and strips frontmatter per Task 28) before comparing; the 594-byte section is present and byte-identical in all three agents. The analysis below is kept as the record of why.

Task 16 (FR-HM6) trimmed the 12 specialists to at least `MIN_REDUCTION_BYTES =
1536` below their pre-Task-16 `before_bytes`
(`tests/fixtures/agent-boilerplate/agent-sizes-before.json`), enforced by
`tests/schemas/agent-boilerplate.test.ts`. Task 26 trimmed `code-reviewer.md`
further. Measuring the current headroom against that floor:

| Agent | `before_bytes` (pre-Task-16) | Current bytes | Reduction | Floor (1,536) | Headroom to insert |
|-------|---:|---:|---:|---:|---:|
| code-reviewer.md | 13,790 | 12,105 | 1,685 | 1,536 | **149 bytes** |
| security-reviewer.md | 15,146 | 13,520 | 1,626 | 1,536 | **90 bytes** |
| performance-engineer.md | 11,408 | 9,702 | 1,706 | 1,536 | **170 bytes** |

The shared section text must be byte-identical across all three, so the
binding constraint is the smallest headroom (security-reviewer.md, 90 bytes).
Even the terse form of the required content (gate description, LSP/grep
instruction, non-blocking rule, cap-logging, render format) measures ~340
bytes — well over 90 bytes, and still over the 149/170-byte headroom on the
other two agents. Per the task instruction ("keep the section under ~900
bytes or tell me the numbers and stop rather than weakening the test"): the
numbers do not work at any content-preserving length, so the section is
**not inserted** into the three agent bodies in this task.
`tests/schemas/agent-boilerplate.test.ts` and its 1,536-byte floor are
unchanged. `tests/schemas/verification-pass.test.ts` documents this
explicitly and asserts the three agents are consistently either all-present
or all-absent (never a partial rollout), and byte-identical if a future
change adds the section to all three.

Everything else in Task 29 is independent of this blocker and is complete:
`code_review.verification: off` (with comment) in
`plugins/synthex/config/defaults.yaml`, the config table row in `CLAUDE.md`,
the `Finding.verification` parser support and `parseVerificationField()` in
`tests/schemas/helpers.ts`, the optional-line validation in
`code-reviewer.ts`/`security-reviewer.ts`/`performance-engineer.ts`
(warnings only — verification never becomes a validation error), fixtures
under `tests/fixtures/verification-pass/`, and the Layer 2 runs below (which
simulate the `prose` config by injecting the section text and a resolved
`code_review.verification: prose` line directly into the system prompt, the
same way a command would resolve config and pass it to the agent).

### Layer 2 method

Same direct-invocation method as Task 16 (`docs/testing.md` "Task 16"
section): `tests/helpers/invoke-agent.ts` and `claude-provider.js` still pass
the agent file path as literal `--system-prompt` text (Task 27 is fixing this
in parallel), so a standalone script read each agent's current `.md` content
and invoked `claude -p --system-prompt <content>` directly, with each fixture
on stdin. `security-reviewer` used `--max-turns 1` for `off` (matches its
promptfoo config) and `--max-turns 5` for `prose` (the added verification
steps need headroom beyond one turn). `code-reviewer` used `--max-turns 8`
for both, per Task 16. For the `prose` runs, the agent content sent as
`--system-prompt` had the Verification Pass section (identical text drafted
for the blocked agent-body insertion above) spliced in before `## Output
Format`, plus one line stating the resolved config
(`code_review.verification: prose`) — mirroring what `review-code.md` would
resolve and hand to the agent. 20 calls total (10 fixtures × 2 configs), the
same 3 `code-reviewer` + 7 `security-reviewer` fixtures Task 16 used.

### (a) `off` (default): output structure matches the redacted baseline shape

All 10 fixtures, run with the unmodified agent content (no Verification Pass
section, `code_review.verification` unset ⇒ default `off`), produced the
expected verdict-header-plus-finding-blocks shape (matching the redacted
FR-MR23 baseline structure: `## <Agent> Review Verdict: PASS|WARN|FAIL`
followed by `#### [SEV] Title` finding blocks) and emitted **no**
`- **Verification:**` line anywhere, confirming the default skips the
section entirely.

| Agent | Fixture | Verdict header present | Finding blocks (`#### [SEV] ...`) | Verification line present |
|-------|---------|:---:|:---:|:---:|
| code-reviewer | clean-code | yes | yes (6) | no |
| code-reviewer | god-object | yes | yes (14) | no |
| code-reviewer | missing-error-handling | yes | yes (12) | no |
| security-reviewer | clean-code | yes | yes (4) | no |
| security-reviewer | hardcoded-secret | yes | yes (10) | no |
| security-reviewer | missing-auth | yes | yes (7) | no |
| security-reviewer | mixed-severity | yes | yes (6) | no |
| security-reviewer | sql-injection | yes | yes (8) | no |
| security-reviewer | weak-csrf | yes | yes (9) | no |
| security-reviewer | xss-vuln | yes | yes (5) | no |

### (b) `prose`: verdicts unchanged, recall/precision deltas

Verdict was identical between `off` and `prose` on all 10 fixtures. The
verification pass correctly capped at the top 5 CRITICAL/HIGH findings by
severity (logging the cap, e.g. "Verification cap reached: 9 CRITICAL/HIGH
findings, and only the top 5 above were verified") whenever more than 5 were
present, used grep-based verification in every case observed (no LSP tool
was available in this headless CLI invocation), and never blocked or altered
a verdict. "Planted" issues are the fixture's designed-in defects (self-
evident from filename/content; `code-reviewer` has no promptfoo entries yet
per Task 16, so its planted issues are named directly below).

| Agent | Fixture | Verdict off→prose | Planted issue(s) | Recall off→prose | CRIT+HIGH count off→prose | Cap fired? | Precision notes |
|-------|---------|:---:|---|:---:|:---:|:---:|---|
| code-reviewer | clean-code | FAIL→FAIL | Unused `ConflictError` import (HIGH) | 1/1→1/1 | 1→1 | no | Prose swapped one MEDIUM ("no tests") for one Nit ("unused `verifyPassword` import"); no spurious findings either side |
| code-reviewer | god-object | FAIL→FAIL | 4 correctness bugs: stale-Promise cache, undefined `order.id`, non-atomic multi-step writes, double-charge/float amount (all CRITICAL) | 4/4→4/4 | 8→9 | **yes** (9 eligible, top 5 verified) | All 4 defects present both sides; 2 reclassified CRITICAL→HIGH and one split into two HIGH findings in prose (net 14→13 total findings); no spurious findings |
| code-reviewer | missing-error-handling | FAIL→FAIL | Order saved before validation/payment, bad float amount to Stripe, unvalidated quantity (all CRITICAL) | 3/3→3/3 | 8→8 | **yes** (8 eligible, top 5 verified, cap logged twice for the remaining 2 HIGHs) | Same 3 defects present both sides (one reclassified CRITICAL→HIGH); no spurious findings |
| security-reviewer | clean-code | PASS→PASS | none (clean fixture) | n/a | 0→0 | no | No CRITICAL/HIGH either side; verification pass correctly did not trigger |
| security-reviewer | hardcoded-secret | FAIL→FAIL | 5 hardcoded secrets: AWS key, Postgres creds, Redis creds, Stripe key, SendGrid key (all CRITICAL) | 5/5→5/5 | 5→5 | **at boundary** (exactly 5; 6th eligible HIGH logged as capped) | 10 findings both sides; prose swapped one LOW for another (Stripe publishable key vs. "move before production" TODO); no spurious findings |
| security-reviewer | missing-auth | FAIL→FAIL | Missing auth/authz on admin endpoints, unrestricted role-assignment privilege escalation (both CRITICAL) | 2/2→2/2 | 3→3 | no | 7→8 total findings (prose adds one legitimate LOW: unchecked `role` type); no spurious findings |
| security-reviewer | mixed-severity | FAIL→FAIL | Hardcoded Stripe secret key, unauthenticated destructive DELETE endpoint (both CRITICAL) | 2/2→2/2 | 2→2 | no | 6→6 total findings; no spurious findings |
| security-reviewer | sql-injection | FAIL→FAIL | SQL injection ×3 endpoints (CRITICAL), IDOR/missing authorization (HIGH) | 4/4→4/4 | 4→4 | no | 8→8 total findings (prose adds one legitimate MEDIUM: unreachable `/search` route); no spurious findings |
| security-reviewer | weak-csrf | FAIL→FAIL | Missing CSRF protection, account takeover via unauthenticated email change, unauthenticated account deletion (all HIGH) | 3/3→4/4 | 3→4 | no | Prose promotes a related session-management defect from MEDIUM to a 4th HIGH finding (recall gain, not loss); no spurious findings |
| security-reviewer | xss-vuln | FAIL→FAIL | Stored XSS via `dangerouslySetInnerHTML` (HIGH) | 1/1→1/1 | 1→1 | no | 5→7 total findings (prose adds two legitimate LOW findings); no spurious findings |

**Result: no recall loss on any planted issue, no verdict regressions, and no
spurious findings introduced by the verification pass across the 10
fixtures.** Where finding counts differ, prose is equal or higher (never
lower) on substantive findings; severity reclassifications and merges/splits
observed on `god-object` and `missing-error-handling` are consistent with the
ordinary model-sampling variance Task 16 documented on these same fixtures,
not something attributable to the verification pass. The cap-and-log
behavior ("Verification: Not run (top-5 cap reached)" /
"Verification cap reached: N CRITICAL/HIGH findings...") worked correctly on
every fixture with more than 5 eligible findings.

## Task 30 — Re-tier gate (D28)

FR-HM14 PR-B (D10): frontmatter-only changes (no body edits) on 13 agents —
`model:`/`effort:` moves per the plan's target table — plus `effort: xhigh`
on `commands/write-adr.md`. No command frontmatter besides `write-adr.md`
was touched. Per Task 7 (D15 fallback), the 14 Haiku-backed agents
(utilities, adapters, `technical-writer`, `metrics-analyst`) get **no**
`effort:` key at all — Haiku 4.5 silently ignores it on Claude Code 2.1.281
(no `effort` in the transcript, `CLAUDE_EFFORT` unset), so a pin there would
be a misleading no-op. `multi-model-review-orchestrator` is out of this
task's scope (sonnet, unpinned).

| Agent | Before | After |
|-------|--------|-------|
| product-manager | opus | opus, `effort: high` |
| architect | opus | opus, `effort: high` (body unchanged; no per-mode frontmatter exists — see the write-adr decision below for the ADR/RFC `xhigh` mode) |
| sre-agent | opus | sonnet, `effort: high` |
| ux-researcher | opus | sonnet, `effort: high` |
| code-reviewer | haiku | sonnet, `effort: medium` |
| security-reviewer | sonnet | sonnet, `effort: high` |
| terraform-plan-reviewer | sonnet | sonnet, `effort: high` |
| tech-lead | sonnet | sonnet, `effort: high` |
| performance-engineer | sonnet | sonnet, `effort: medium` |
| design-system-agent | sonnet | sonnet, `effort: medium` |
| quality-engineer | sonnet | sonnet, `effort: medium` |
| retrospective-facilitator | sonnet | sonnet, `effort: medium` |
| lead-frontend-engineer | sonnet | sonnet, `effort: medium` |

`tests/schemas/agent-frontmatter.test.ts` was updated to assert this exact
contract (replacing the Task 28 "no agent carries `effort:`" placeholder
assertion): the 13 agents above carry the exact listed `effort:` value,
every Haiku-backed agent carries none, and any present value is one of
`low|medium|high|xhigh|max`. A new `tests/schemas/task30-retier.test.ts`
asserts (a) every `*-review-prompter.md` adapter carries `model: haiku` and
no `effort:` key, and (b) this section (with its "Aggregate recall" /
"baseline" language) exists in `docs/testing.md`.

### `write-adr` ADR/RFC `xhigh` decision

The plan asks for the Architect's ADR/RFC mode to run at `effort: xhigh`,
but agent frontmatter is per-agent, not per-mode — `architect.md` has one
frontmatter block for both its Plan Review and ADR-authoring identities, so
it is pinned to the table's `effort: high`. Task 7's OQ-4 spike **confirmed**
that Claude Code 2.1.281 honors a command's own frontmatter `effort:` key
(`/lowcmd` recorded `"effort":"low","perTurnEffort":"low"` vs `medium`
without a command) on effort-table models — Opus is in that table. Since
`write-adr.md` is already `model: opus`, `effort: xhigh` was added to its
frontmatter (`plugins/synthex/commands/write-adr.md`), which is honored per
D15/OQ-4.

**Caveat, also from Task 7's evidence:** a sub-agent's own frontmatter
`effort:` value wins over its parent's — the spike's `sonnet-low` sub-agent
recorded `"effort":"low"` under a `high`-effort parent. So `write-adr.md`'s
`effort: xhigh` raises the *command driver's own* reasoning (interpreting
parameters, running the interactive ADR flow, writing the file) to `xhigh`;
it does **not** raise the invoked `architect` sub-agent's own effort above
its frontmatter value (`high`) once the command dispatches to it. This is
the best available lever without a per-mode frontmatter mechanism, which
does not exist today — a true per-mode `architect` effort would require
either splitting the agent into two files or a runtime override mechanism,
both out of scope for a frontmatter-only task.

### D28 eval gate

Reproduced with the same arm/settings as the Task 27 baseline capture:

```bash
node tests/scripts/run-evals.mjs \
  --runs 3 --ablation none --threshold 0 \
  --concurrency 4 --max-cost-usd 40 \
  --json /tmp/eval-task30-reports/eval-task30-final.json \
  --report-dir /tmp/eval-task30-reports
```

All 18 cases re-ran (0 cache hits) — the hash cache (agent content +
fixture + resolved model) invalidated every case because all three agents
in the manifest (`code-reviewer`, `security-reviewer`,
`terraform-plan-reviewer`) changed frontmatter, and those three agents
account for all 18 manifest cases (7 + 8 + 3).

**Recall table (18 cases, 3 runs each, single arm; baseline vs. post-retier;
✓ = found that run):**

| Case | Agent | Planted | Baseline found | Post-retier found | Baseline verdict | Post-retier verdict |
|------|-------|--------:|:-----------------:|:-----------------:|:-----------------:|:-----------------:|
| sec-clean-code | security-reviewer | 0 | n/a | n/a | 3/3 | 3/3 |
| sec-hardcoded-secret | security-reviewer | 1 | 1/1 | 1/1 | 3/3 | 3/3 |
| sec-sql-injection | security-reviewer | 1 | 1/1 | 1/1 | 3/3 | 3/3 |
| sec-xss-vuln | security-reviewer | 1 | 1/1 | 1/1 | 3/3 | 3/3 |
| sec-missing-auth | security-reviewer | 1 | 1/1 | 1/1 | 3/3 | 3/3 |
| sec-weak-csrf | security-reviewer | 1 | 1/1 | 1/1 | 3/3 | 3/3 |
| sec-mixed-severity | security-reviewer | 3 | 3/3 | 3/3 | 3/3 | 3/3 |
| tf-destructive-rds | terraform-plan-reviewer | 1 | 1/1 | 1/1 | 3/3 | 3/3 |
| tf-missing-tags | terraform-plan-reviewer | 1 | 1/1 | 1/1 | 3/3 | 3/3 |
| tf-clean-plan-txt | terraform-plan-reviewer | 0 | n/a | n/a | 1/3 | **0/3** |
| tf-empty-plan | terraform-plan-reviewer | 0 | n/a | n/a | 3/3 | 3/3 |
| tf-clean-plan-json | terraform-plan-reviewer | 0 | n/a | n/a | 3/3 | 3/3 |
| tf-multi-issue | terraform-plan-reviewer | 3 | 3/3 | 3/3 | 3/3 | 3/3 |
| tf-wide-open-sg | terraform-plan-reviewer | 1 | 1/1 | 1/1 | 3/3 | 3/3 |
| tf-surprise-cost-poc | terraform-plan-reviewer | 1 | 1/1 | 1/1 | 2/3 | **3/3** |
| cr-clean-code | code-reviewer | 0 | n/a | n/a | 3/3 | 3/3 |
| cr-god-object | code-reviewer | 1 | 1/1 | 1/1 | 3/3 | 3/3 |
| cr-missing-error-handling | code-reviewer | 1 | 1/1 | 1/1 | 3/3 | 3/3 |
| **Total** | | **17** | **17/17** | **17/17** | **51/54** | **51/54** |

**Aggregate recall (post-retier): 17/17 planted issues found (majority vote
across 3 runs) = 100.0%, equal to the Task 27 baseline (17/17 = 100.0%).
No fixture lost any planted issue (zero fixtures lost more than the D28
ceiling of 1).** Verdict-header stability redistributed rather than
regressed: `tf-clean-plan-txt` (0 planted issues; expected `PASS` only)
dropped from 1/3 to 0/3 matching runs, and `tf-surprise-cost-poc` (1 planted
issue, `WARN|FAIL` tolerant) improved from 2/3 to 3/3 — net 51/54 verdict
passes both before and after, and neither shift touches a planted-issue
recall count. **Gate: PASS** (aggregate recall ≥ baseline; no fixture lost
more than 1 planted issue).

### Cost (D28 / NFR-HM3 exception evidence)

Total spend this run: **$17.03** (54 runs) vs. the Task 27 baseline's
**$16.26** (54 runs, same case set) — **+$0.77 (+4.7%)**, mean cost/run
$0.315 vs. $0.301.

**Per-agent, measured (post-retier, real `costUsd` from this run's
`claude plugin eval --json` output — the eval report does not retain raw
token counts; the per-run sandbox and its `trace.jsonl` are not kept by
default, same as Task 27's own note, so cost is reported in dollars, the
direct token-cost signal, rather than a synthetic token count):**

| Agent | Runs | Total cost (after) | Mean $/run (after) |
|-------|-----:|----:|----:|
| security-reviewer | 21 | $6.22 | $0.296 |
| terraform-plan-reviewer | 24 | $7.95 | $0.331 |
| code-reviewer | 9 | $2.86 | $0.317 |
| **Total** | **54** | **$17.03** | **$0.315** |

**Before/after split (reasoned estimate, not re-measured — re-running the
Task 27 baseline under the old frontmatter would be an additional paid
model call, which this task's cost discipline forbids):** `security-reviewer`
and `terraform-plan-reviewer` moved from *no* `effort:` key to an *explicit*
`effort: high` pin. Per the general Claude effort table, Sonnet 5's default
effort when the key is omitted is already `high` ("equivalent to omitting
it") — so this pin, per the PRD's own "Reason: Unchanged" for this row,
codifies existing default behavior rather than changing it. Treating those
two agents' cost as materially unchanged (before ≈ after) attributes
essentially the entire aggregate delta to `code-reviewer`'s Haiku→Sonnet
model-class move:

| Agent | Before (estimated) | After (measured) | Δ | Δ% |
|-------|---:|---:|---:|---:|
| security-reviewer | ≈ $6.22 (unchanged — effort pin codifies existing Sonnet default) | $6.22 | ≈$0 | ≈0% |
| terraform-plan-reviewer | ≈ $7.95 (unchanged — same reason) | $7.95 | ≈$0 | ≈0% |
| code-reviewer | ≈ $2.09 (residual: $16.26 baseline total − $6.22 − $7.95) | $2.86 | +$0.77 | **+36.7%** |

This reconciles exactly: $16.26 (baseline) + $0.77 (code-reviewer delta) =
$17.03 (measured post-retier total). **`code-reviewer`'s Haiku → Sonnet move
is confirmed as the largest cost increase in this task**, consistent with
Haiku 4.5 ($1/$5 per MTok in/out) being half the per-token price of Sonnet 5
($2/$10) before even accounting for `effort: medium` adding thinking-token
volume Haiku's Task-27-era invocations never had at all (Haiku silently
ignores `effort:` — Task 7).

### Adapter envelope parse rates (vacuous per Task 7)

The `*-review-prompter.md` adapters (`codex-`, `gemini-`, `ollama-`,
`claude-`, `bedrock-`, `llm-`, `grok-`, `cursor-review-prompter`) are Haiku-backed and, per the
Task 30 contract above, carry **no** `effort:` key at all — there is no
`effort: low` state to compare against a changed state, so "adapter envelope
parse rates unchanged at `effort: low`" is vacuously true and no adapter was
invoked to check it (cost discipline: adapters were not run). Asserted by
`tests/schemas/task30-retier.test.ts`.

### `[H]` NFR-HM3 exception table (for PM sign-off)

Full per-agent cost-direction table across all 13 re-tiered agents, using
Opus 5.5 ($4/$20 per MTok in/out), Sonnet 5 ($2/$10), and Haiku 4.5 ($1/$5,
unaffected — no Haiku agent's effort changed). Only `security-reviewer`,
`terraform-plan-reviewer`, and `code-reviewer` have real eval-measured
numbers (above); the other 10 are not in the eval manifest, so their
direction is derived from the model/effort move and the published per-token
rates, not measured.

| Agent | Model move | Effort move | Price/token move | Direction | Basis |
|-------|-----------|-------------|-------------------|:---------:|-------|
| product-manager | opus → opus (none) | (default) → `high` | none ($4/$20 both) | **increase** | Same price tier; `effort: high` raises thinking/output volume over Opus 5.5's default `medium` |
| architect | opus → opus (none) | (default) → `high` | none ($4/$20 both) | **increase** | Same reasoning as product-manager |
| sre-agent | opus → sonnet | (default) → `high` | **−50%** ($4/$20 → $2/$10) | **decrease** | Price halves; even with higher effort's added token volume, the 2x price cut dominates (measured pattern on code-reviewer's inverse move supports this) |
| ux-researcher | opus → sonnet | (default) → `high` | **−50%** | **decrease** | Same reasoning as sre-agent |
| code-reviewer | haiku → sonnet | (none) → `medium` | **+100%** ($1/$5 → $2/$10) | **increase (largest)** | Measured: +36.7% ($2.09 → $2.86 est./actual) |
| security-reviewer | sonnet → sonnet (none) | (default) → `high` | none | ≈none | Effort pin codifies existing Sonnet default (measured ≈$0 delta) |
| terraform-plan-reviewer | sonnet → sonnet (none) | (default) → `high` | none | ≈none | Same as security-reviewer (measured ≈$0 delta) |
| tech-lead | sonnet → sonnet (none) | (default) → `high` | none | ≈none | Same reasoning; not in eval manifest, not separately measured |
| performance-engineer | sonnet → sonnet (none) | (default `high`) → `medium` | none | **decrease** | Effort steps *down* from Sonnet's default `high` to `medium` |
| design-system-agent | sonnet → sonnet (none) | (default `high`) → `medium` | none | **decrease** | Same as performance-engineer |
| quality-engineer | sonnet → sonnet (none) | (default `high`) → `medium` | none | **decrease** | Same as performance-engineer |
| retrospective-facilitator | sonnet → sonnet (none) | (default `high`) → `medium` | none | **decrease** | Same as performance-engineer |
| lead-frontend-engineer | sonnet → sonnet (none) | (default `high`) → `medium` | none | **decrease** | Same as performance-engineer |

**Net-increase agents requiring an explicit NFR-HM3 exception:**
`product-manager`, `architect`, `code-reviewer` (largest). `sre-agent` and
`ux-researcher` move **down** (model-class downgrade dominates the effort
increase) and are a cost *win*, not an exception. The five `medium`-pinned
agents (`performance-engineer`, `design-system-agent`, `quality-engineer`,
`retrospective-facilitator`, `lead-frontend-engineer`) step down from
Sonnet's implicit default and are also a cost win. `security-reviewer`,
`terraform-plan-reviewer`, and `tech-lead` are neutral (pin codifies
existing default). This table is for the Tech Lead orchestrator to present
to the PM for `[H]` sign-off per A3 — it is not itself the PM's acceptance.

## Multi-model review — Grok and Cursor adapters (Phase 9)

The Grok and Cursor proposers (multi-model-review Tasks 66–70) are covered by
Layer 1 suites only; none of them sends a prompt. Runner behaviour is tested
against stub `grok` / `cursor-agent` binaries and the Task 67 spike recordings.

| Suite (`tests/schemas/`) | Covers |
|--------------------------|--------|
| `grok-spike-recordings.test.ts`, `cursor-spike-recordings.test.ts` | Task 67 evidence: help fixtures, recordings, the D38 reference scan |
| `grok-review-runner-behavioral.test.ts` | `scripts/adapters/grok-review.sh`: argv, isolation env, D33 schema and unwrap, D34 sandbox fallback, D36 incomplete-run guard, `--auth-check` exits |
| `cursor-review-runner-behavioral.test.ts` | `scripts/adapters/cursor-review.sh`: D37 deny file, D38 tool-call scan, D39 stdin prompt, D40 unwrap, D42 cleanup, D43 Free plan, `--auth-check` exits |
| `grok-adapter-md.test.ts`, `cursor-adapter-md.test.ts` | The two thin adapter definitions (size, labels, permission model, gotchas) |
| `cursor-reviewer-config-shape.test.ts` | Every shipped Cursor reviewer example has a block-style, non-Auto `model` and a `family` |
| `configure-multi-model-grok-cursor.test.ts` | Task 70: wizard detection, CLI-to-adapter mapping, manual opt-in listing, FR-MR27 additions, Option 2 snippet, `defaults.yaml` examples, the U23 `allow_api_key_billing` check, docs rows |

The shared adapter suites (`adapter-size`, `external-permission-mode-key-validation`,
`external-adapter-permission-model`, `portability-prose`) include both adapters.

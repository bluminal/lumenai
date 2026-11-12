# Contributing to LumenAI

We welcome contributions to LumenAI and the Synthex plugin. Whether you're fixing a bug, adding a new agent, improving documentation, or proposing a new command, we appreciate your effort.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a feature branch: `git checkout -b my-feature`
4. Make your changes
5. Run the tests: `cd tests && npx vitest run schemas/`
6. Commit and push to your fork
7. Open a pull request

## Development Setup

The project requires Node.js 22+ for running tests. The agents and commands themselves are pure markdown with zero runtime dependencies.

```bash
# Install test dependencies
cd tests && npm install

# Run schema validation tests (Layer 1 — instant, free)
npx vitest run schemas/

# Run tests in watch mode during development
npx vitest watch schemas/
```

## What You Can Contribute

### New Agents

1. Create a new `.md` file in `plugins/synthex/agents/`
2. Follow the structure of existing agents — define identity, responsibilities, workflow, output format, and behavioral rules
3. Add the agent name to the `agents` array in `plugins/synthex/.claude-plugin/plugin.json`
4. Regenerate the shared Agent Skills entrypoints: `node plugins/synthex/scripts/generate-codex-skills.mjs`
5. Create a schema validator in `tests/schemas/{agent-name}.ts`
6. Create a test suite in `tests/schemas/{agent-name}.test.ts` with inline sample outputs
7. Ensure all tests pass

### New Commands

1. Create a new `.md` file in `plugins/synthex/commands/`
2. Define parameters, workflow steps, and which agents to invoke
3. Add the command filename to the `commands` array in `plugins/synthex/.claude-plugin/plugin.json`
4. Regenerate the shared Agent Skills entrypoints: `node plugins/synthex/scripts/generate-codex-skills.mjs`

The generated `plugins/synthex/portable-skills/*/SKILL.md` files are thin Agent Skills metadata wrappers. Do not edit them directly; command and agent Markdown files remain the shared behavioral source of truth for Claude Code, Codex, Grok, Gemini CLI, and OpenCode.

### Improving Existing Agents

Agent definitions are in `plugins/synthex/agents/`. Each agent is a single markdown file. When modifying an agent:

- Run the existing tests to ensure nothing breaks
- If you change the output format, update the corresponding schema validator
- Update golden snapshots if needed: `npm run snapshots:update`

### Test Fixtures

Test fixtures live in `tests/fixtures/`. Each fixture is a synthetic input with intentionally planted issues for the agent to find. Good fixtures:

- Have clear, discoverable issues (not subtle edge cases)
- Cover both happy paths and failure modes
- Include comments explaining what the agent should find

## Adding an External Source

An **external source** is anywhere other than the repository that Synthex reads or writes its documents and task state: Notion, Jira, Linear, Confluence, and so on. No external source ships today. These rules apply to any pull request that adds one.

Synthex owns its schema. The user owns their workspace. A source integration is the mapping between the two, and the user supplies that mapping.

### Rules

1. **The Synthex schema does not change with the source.** A PRD has the same sections, and a plan has the same phases, milestones, task columns, statuses and acceptance-criteria types, wherever it is stored. A source must not add, remove, rename or relocate any of them.
2. **A project that does not use the source sees nothing.** With the source off, there are no new lines in document templates, no new linter checks, no new tools or sections in shared agents, no new steps in `init` or other shared commands, and no new required config. Prove it with a test that compares the disabled path against the pre-change output.
3. **No business concepts.** Epics, initiatives, sprints, squads and workstreams belong to the user's organization, not to Synthex and not to the tool. Synthex's vocabulary is: document, plan, phase, milestone, task, status, complexity, dependency, acceptance criterion. Anything else appears only as a value the user typed into their own configuration.
4. **The user declares the conventions. Synthex does not assume them.** Every question in the convention map below is answered by the user during setup. If an answer is missing, Synthex asks or keeps that element in the repository. It never picks a location, a title or a structure on the user's behalf.
5. **Never reshape what the user already has.** Do not change a database schema, restructure a page, or rewrite content Synthex did not author, unless the user confirms that specific change. The default answer is no.
6. **The shared layer names no source.** The contract, error codes, config keys and command text that every source shares must not contain a source's name. Adding a second source must not require editing a command.
7. **One feature per pull request.** Changes to templates, linters or agents that would be useful without the source are separate pull requests, reviewed on their own merits.

### Convention map

Setup for a source must let the user answer each of these. The answers are stored in the project's Synthex config under that source's own block.

| Schema element | What the user decides |
|----------------|-----------------------|
| Requirements document | Where it lives, and whether it is one document holding the standard markdown |
| Implementation plan | Where it is created relative to the requirements (child, sibling, a fixed location, or kept in the repository), and whether it is one document holding the standard markdown |
| Phase and milestone | Headings inside the plan document, or one of the tool's own groupings |
| Task | A row in the plan's table, a sub-page, or an item in a tracker |
| Task status | Text in the plan, or a field in the tool, and which of the user's values mean `pending`, `in_progress`, `done` and `blocked` |
| Complexity and dependencies | Plan columns, fields in the tool, or plan only |
| Acceptance criteria | Plan text, the task item's body, or a field |
| Decisions and open questions | Sections of the plan document, or somewhere else |
| Scope | How Synthex tells its own items from everyone else's in a shared space, as a filter the user defines |

Use structured answers for anything Synthex relies on mechanically: locations, the scope filter and the status mapping. Accept free-text guidance from the user for everything else, and pass it to the agents that read and write the source.

### What a source pull request contains

- **Adapter agents** named `<source>-*.md` that translate between the Synthex schema and the tool. Shared agents and commands do not call the tool directly.
- **A setup command** named `configure-<source>` that walks the convention map, shows the user the result, and writes it to config. It is re-runnable and is not part of `init`.
- **Config** under the source's own block, off by default.
- **Access through a connection the user already has**, such as an MCP server or an authenticated CLI. Synthex never stores a token.
- **A data-transmission warning** shown before the source is enabled, naming what leaves the repository.
- **Content read from the source treated as data**, never as instructions.
- **Tests** for the adapter's output shape, for rule 2, and for a refusal when the scope filter is missing.
- **A statement of what was run against a real workspace.** Say so plainly if nothing was.

## Conventions

- **Filenames:** `kebab-case.md` for agents and commands
- **Agent output:** Advisory agents must produce PASS/WARN/FAIL verdicts with severity-ranked findings
- **Tests:** Every testable agent needs a schema validator and test suite with inline samples
- **Commits:** Short, descriptive messages. Focus on "why" not "what"

## Testing Requirements

All pull requests must pass the Layer 1 schema validation tests. The CI pipeline runs these automatically.

- **206 tests must pass** (or more, if you're adding new ones)
- New agents require a schema validator and test suite
- Existing tests must not regress

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold this standard.

## Questions?

Open an issue. We're happy to help.

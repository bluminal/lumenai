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
4. Create a schema validator in `tests/schemas/{agent-name}.ts`
5. Create a test suite in `tests/schemas/{agent-name}.test.ts` with inline sample outputs
6. Ensure all tests pass

### New Commands

1. Create a new `.md` file in `plugins/synthex/commands/`
2. Define parameters, workflow steps, and which agents to invoke
3. Add the command filename to the `commands` array in `plugins/synthex/.claude-plugin/plugin.json`

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

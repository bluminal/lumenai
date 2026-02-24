# Test Coverage Analysis

Analyze the project's test suite for coverage gaps, test quality, and strategy alignment — then optionally write missing tests for the highest-priority gaps.

## Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `scope` | File path, directory, or module to analyze | entire project | No |
| `write_tests` | Whether to write tests for identified gaps | `false` | No |
| `config_path` | Path to synthex project config | `.synthex/config.yaml` | No |

## Core Responsibilities

You invoke the **Quality Engineer sub-agent** to perform a comprehensive test analysis and optionally produce test code for critical gaps.

---

## Workflow

### 1. Load Configuration

Check for a project configuration file at `@{config_path}`. Load the quality configuration.

**Default values:**

| Setting | Default |
|---------|---------|
| `quality.coverage_thresholds.line` | `80` |
| `quality.coverage_thresholds.branch` | `70` |
| `quality.coverage_thresholds.function` | `80` |
| `quality.test_runner` | `vitest` |
| `quality.priority_modules` | `[]` (auto-detect high-risk modules) |

### 2. Gather Test Infrastructure Context

Before invoking the Quality Engineer, gather context:

- Identify the test runner and framework (from `package.json`, `vitest.config.*`, `jest.config.*`, `pytest.ini`, etc.)
- Read existing test files to understand patterns, conventions, and mocking approaches
- If a coverage report exists (e.g., `coverage/`), read it for quantitative data
- Identify the project's testing pyramid (unit vs integration vs E2E ratio)

### 3. Run Coverage Report (if possible)

Attempt to generate a fresh coverage report:

```bash
# Detect test runner and run with coverage
npx vitest run --coverage --reporter=json  # or equivalent for detected runner
```

If the coverage command fails, proceed with static analysis only and note the limitation.

### 4. Launch Quality Engineer

Invoke the **Quality Engineer sub-agent** in Coverage Analysis mode. Provide:

- The coverage report (if generated)
- The scope to analyze (specific files/directories or entire project)
- The project's configured coverage thresholds
- Any priority modules from config
- Existing test file patterns and conventions

The Quality Engineer produces a structured coverage analysis:

```markdown
## Test Coverage Analysis

### Summary
[Current coverage state, highest-risk gaps, overall quality assessment]

### Coverage Report
| Module / Component | Line % | Branch % | Risk Level | Priority |
|-------------------|--------|----------|------------|----------|
| [module] | [%] | [%] | [HIGH/MED/LOW] | [P1/P2/P3] |

### Gap Analysis

#### P1 Gap: [Title]
- **Location:** [File/module path]
- **What's untested:** [Specific behaviors, branches, or error paths]
- **Risk:** [What could go wrong in production if this regresses]
- **Recommended tests:** [Specific test cases to write]

[Repeat for P2, P3 gaps]

### Test Quality Assessment
[Assessment beyond coverage numbers: behavior vs implementation testing,
independence, DRY setup, descriptive names, edge cases, error paths]

### Test Strategy Recommendations
[Pyramid ratio, infrastructure improvements, framework suggestions]
```

### 5. Write Tests (if requested)

If `write_tests` is `true` (or the user requests it after seeing the analysis):

1. Re-invoke the Quality Engineer in **Test Writing mode** for the top P1 gaps
2. The Quality Engineer reads existing test files to match patterns exactly
3. Tests are written following the project's conventions (assertion library, mocking approach, file organization)
4. Run the new tests to verify they pass:

```bash
npx vitest run [new-test-files]  # or equivalent
```

5. If any tests fail, the Quality Engineer iterates to fix them before reporting completion

### 6. Report Results

Present the coverage analysis to the user. If tests were written, include:

```
Test Coverage Analysis Complete

Coverage: [before] → [after] (if tests were written)
Gaps identified: [count by priority]
Tests written: [count] (if applicable)

Top remaining gaps:
1. [P1 gap description]
2. [P2 gap description]
3. [P3 gap description]
```

---

## Configuration

```yaml
# .synthex/config.yaml (quality section)
quality:
  # Coverage thresholds — new code should not drop below these
  coverage_thresholds:
    line: 80
    branch: 70
    function: 80

  # Test runner to use for coverage reports
  test_runner: vitest

  # High-priority modules that should always have thorough coverage
  # Leave empty to auto-detect based on risk (auth, payments, data mutations)
  priority_modules: []
```

---

## Critical Requirements

- Coverage numbers alone do not tell the full story — the Quality Engineer MUST assess test quality (behavior testing, independence, DRY setup) alongside coverage percentages
- P1 gaps are modules where a regression would have high business impact (auth, payments, data mutations, API contracts)
- When writing tests, the Quality Engineer MUST match existing test patterns exactly — no introducing new frameworks, assertion styles, or file organization without discussion
- Tests must pass before the command completes — failing tests are not acceptable output
- The test pyramid assessment is mandatory — projects with many E2E tests and few unit tests need to know this

# Getting Started

This guide walks you through your first `react-crap` run in under 5 minutes.

## Prerequisites

- Node.js 18 or later
- A React / TypeScript project with tests
- A test runner that can generate LCOV coverage (Vitest, Jest, or Istanbul)

## 1. Install

You don't need to install anything permanently. Use `npx`:

```bash
npx @omermohideen/react-crap --version
```

Or install as a dev dependency:

```bash
npm install --save-dev @omermohideen/react-crap
```

## 2. Generate Coverage

Make sure your test runner outputs LCOV. Examples:

**Vitest:**
```bash
npm i -D @vitest/coverage-v8
npx vitest run --coverage
```

**Jest:**
```bash
# jest.config.js
module.exports = {
  coverageReporters: ['lcov', 'text']
};
```

**NYC / Istanbul:**
```bash
npx nyc --reporter=lcov npm test
```

After running, you should have a `coverage/lcov.info` file.

## 3. Run react-crap

```bash
# Basic run
npx react-crap --lcov coverage/lcov.info --path src

# If you installed locally
npx react-crap --lcov coverage/lcov.info
```

You'll see a table like:

```
┌───┬───────┬────┬───────────────────┬──────────┬───────────────┐
│   │  CRAP │ CC │ Coverage          │ Function │ Location      │
╞═══╪═══════╪════╪═══════════════════╪══════════╪═══════════════╡
│ ✗ │ 156.0 │ 12 │ ░░░░░░░░░░   0.0% │ crappy   │ src/lib.ts:24 │
│ ▲ │   6.7 │  4 │ ████░░░░░░  44.4% │ moderate │ src/lib.ts:12 │
│ ✓ │   1.0 │  1 │ ██████████ 100.0% │ trivial  │ src/lib.ts:8  │
└───┴───────┴────┴───────────────────┴──────────┴───────────────┘
```

- **✗** = Above threshold (default 30)
- **▲** = Above half threshold (15–30)
- **✓** = Below half threshold (<15)
- **CC** = Cyclomatic Complexity
- **Coverage** = Percentage of lines hit by tests

## 4. Add a Config File

Create `.react-crap.json` in your project root to avoid repeating flags:

```json
{
  "threshold": 30,
  "exclude": ["**/*.test.ts", "**/*.test.tsx"],
  "onlyFailures": false,
  "missing": "pessimistic"
}
```

Now you can just run:

```bash
npx react-crap --lcov coverage/lcov.info
```

## 5. Gate Your CI

Add a CI step that fails if any function exceeds the threshold:

```yaml
- run: npx vitest run --coverage
- run: npx react-crap --lcov coverage/lcov.info --fail-above --threshold 30
```

See [CI Integration](./ci-integration.md) for full examples.

## Next Steps

- [Configuration Reference](./configuration.md) — all flags and options
- [CI Integration](./ci-integration.md) — GitHub Actions, GitLab, etc.
- [Troubleshooting](./troubleshooting.md) — common issues

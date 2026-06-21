# react-crap

[![npm](https://img.shields.io/npm/v/@omermohideen/react-crap?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/@omermohideen/react-crap)
[![license](https://img.shields.io/badge/license-MIT-2563eb?style=for-the-badge)](LICENSE)

Compute the **CRAP** (Change Risk Anti-Patterns) metric for React TypeScript projects.

CRAP combines cyclomatic complexity and test coverage into a single number that is high when code is both hard to understand and poorly tested — i.e. where bugs love to hide. The metric was introduced by Savoia & Evans in 2007 and was originally implemented for Java (Crap4j) and .NET (NDepend). `react-crap` brings it to the TypeScript / React ecosystem.

```
CRAP(m) = comp(m)² × (1 − cov(m)/100)³ + comp(m)
```

A few properties worth internalizing before you use the output:

- A trivial function (CC=1, 100% covered) scores exactly 1.0. That's the lower bound.
- At 100% coverage the quadratic term collapses and **CRAP equals CC**. When you see matching values in those two columns, that function is fully covered — tests are capping the damage, but the complexity itself remains. It's a good sign, not a bug.
- Above CC ≈ 30 no amount of coverage keeps you under the default threshold of 30. That's not a bug in the formula — it's the formula saying "this function is too big to certify as clean, regardless of tests."

## Install

**Via `npx`** (no install):

```bash
npx @omermohideen/react-crap --lcov coverage/lcov.info --path src
```

**Via `npm`** (global):

```bash
npm install -g @omermohideen/react-crap
```

**Via `npm`** (local dev dependency):

```bash
npm install --save-dev @omermohideen/react-crap
```

## Quick start

```bash
# 1. Generate an LCOV coverage report.
npx vitest run --coverage

# 2. Score every function.
npx react-crap --lcov coverage/lcov.info --path src

# 3. Gate CI on the threshold.
npx react-crap --lcov coverage/lcov.info --fail-above

# 4. Whole-workspace analysis (monorepos).
npx react-crap --lcov coverage/lcov.info --path . --workspace --top 20

# 5. Quick aggregate summary (no table).
npx react-crap --lcov coverage/lcov.info --summary

# 6. Watch mode during local development.
npx react-crap --lcov coverage/lcov.info --path src --watch --verbose

# 7. Analyze only uncommitted changed files.
npx react-crap --lcov coverage/lcov.info --path src --changed

# 8. Generate an HTML report.
npx react-crap --lcov coverage/lcov.info --path src --format html --output crap-report.html

# 9. Generate a stable JSON baseline (sorted by file/name for readable diffs).
npx react-crap --lcov coverage/lcov.info --format json --sort file --output baseline.json
```

Example output:

```
┌───┬───────┬────┬───────────────────┬──────────┬───────────────┐
│   │  CRAP │ CC │ Coverage          │ Function │ Location      │
╞═══╪═══════╪════╪═══════════════════╪══════════╪═══════════════╡
│ ✗ │ 156.0 │ 12 │ ░░░░░░░░░░   0.0% │ crappy   │ src/lib.ts:24 │
│ ▲ │   6.7 │  4 │ ████░░░░░░  44.4% │ moderate │ src/lib.ts:12 │
│ ✓ │   1.0 │  1 │ ██████████ 100.0% │ trivial  │ src/lib.ts:8  │
└───┴───────┴────┴───────────────────┴──────────┴───────────────┘
✗ 1/3 function(s) exceed CRAP threshold 30.
```

## Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `--lcov <FILE>` | `coverage/lcov.info` | LCOV file from your test runner (Vitest, Jest, etc.). |
| `--path <DIR>` | `src` | Root to walk for `.ts` / `.tsx` files (respects `.gitignore`). |
| `--threshold <N>` | `30` | Score above which a function is flagged. |
| `--min <SCORE>` | — | Hide entries **below** this CRAP score. |
| `--max <SCORE>` | — | Hide entries **above** this CRAP score. |
| `--top <N>` | — | Show only the **N worst** offenders. |
| `--only-failures` | — | Only show functions **exceeding** the threshold. |
| `--missing {pessimistic,optimistic,skip}` | `pessimistic` | How to score a function with no coverage data. |
| `--exclude <GLOB>` | — | Skip files matching this pattern (repeatable). `**` crosses directories. |
| `--allow <GLOB>` | — | Suppress matching functions (repeatable). An entry containing `/` or `**` is a path glob and matches the file the function is in (e.g. `src/generated/**`); otherwise it matches the function name and `*` is a wildcard (e.g. `use*`). |
| `--format {human,json,github,markdown,html,pr-comment,sarif}` | `human` | Output format. `json` emits a versioned envelope (see [JSON output schema](#json-output-schema) below). `github` emits `::warning` annotations. `markdown` emits a GFM table (exhaustive). `html` emits a self-contained styled HTML page. `pr-comment` is the opinionated PR-bot variant: hides unchanged rows, caps each section, collapses non-critical info into `<details>` blocks. `sarif` emits SARIF 2.1.0 JSON for upload to GitHub Code Scanning, VS Code, and other static-analysis tooling (see [SARIF output](#sarif-output) below). |
| `--summary` | off | Print only aggregate stats (total, crappy count, worst offender) — no per-function table. In `--workspace` mode this becomes the per-package summary plus the aggregate line. |
| `--workspace` | off | Analyze all workspace packages (discovered via `package.json` workspaces or `pnpm-workspace.yaml`). Ignores `--path`. Adds a *Per-package summary* table to human and markdown output, and a `package` field to JSON entries. |
| `--verbose` | off | Print step-by-step progress to stderr (file discovery, analysis progress, merge/scoring steps). |
| `--watch` | off | Re-run automatically when source files or LCOV change. Uses 1-second polling. Press Ctrl+C to stop. |
| `--changed` | off | Only analyze uncommitted `.ts`/`.tsx` files (modified, staged, and untracked). Useful for pre-commit checks and local iteration. CLI-only; not supported in config. |
| `--fail-above` | off | Exit 1 if any function exceeds `--threshold`. |
| `--baseline <FILE>` | — | JSON from a previous `--format json` run. Enables delta mode (shows Δ column). Functions that moved between files (same name, body unchanged) are detected and reported as `Moved` rather than as separate New + Removed entries; renderers show `← <previous_file>` next to the new location. |
| `--fail-regression` | off | Exit 1 if any function's score increased since `--baseline`. `Moved` (pure relocation, no score change) is not a regression. |
| `--epsilon <VALUE>` | `0.01` | Tolerance for the regression detector. Score deltas with absolute value at or below this count as `Unchanged`. Set to `0.0` to flag every increase, or higher to tolerate noisy coverage. Must be non-negative. |
| `--sort <fields>` | `crap` | Comma-separated display sort fields. `crap` (default) shows highest-risk first. `file` (or `name`) sorts by filename. `path` sorts by full file path. `function` sorts by function name. `line` sorts by line number. `cc`/`cyclomatic` sorts by complexity descending. `coverage` sorts by coverage descending. Combine fields like `file,function` or `function,path`. `--top` always selects the worst offenders first regardless of sort order. |
| `--jobs <N>` | host CPUs | Cap parallel source-file analysis at `N` threads. Useful in memory-constrained CI/Docker environments. Must be a positive integer. |
| `--output <FILE>` | — | Write output to FILE instead of stdout (useful for saving JSON baselines). |
| `--no-color` | — | Disable colored output. |
| `--duplicates [mode]` | — | Report duplicate functions instead of CRAP scores. No coverage needed. Default matches reformatted copy-paste; `normalized` also matches Type-2 near-duplicates (renamed/retyped). |
| `--smells [kinds]` | — | Report AI-slop smells instead of CRAP scores. No coverage needed. Noisy `any`/`!` excluded by default; pass `all` or a comma list of kinds. See [Code-review checks](#code-review-checks-no-coverage). |
| `--dead-code` | — | Report unused imports instead of CRAP scores. No coverage needed. |
| `--checks` | — | Run **all** coverage-free checks (duplicates + smells + dead code) in one report. Pair with `--changed` for pre-commit hooks. |

### Filtering order

Flags are applied in this order:

1. `--min` — filter out low CRAP scores
2. `--max` — filter out high CRAP scores
3. `--only-failures` — keep only functions above threshold
4. `--top` — slice to N worst remaining

## Configuration file

Any flag can be set persistently in `.react-crap.json` at the project root (or any parent directory — the tool walks up until it finds one). CLI flags always take precedence.

```json
{
  "threshold": 30,
  "top": 10,
  "min": 10,
  "max": 5000,
  "onlyFailures": false,
  "missing": "pessimistic",
  "exclude": ["**/*.test.ts", "**/*.test.tsx"],
  "allow": ["src/generated/**"],
  "failAbove": true,
  "workspace": false,
  "verbose": false,
  "sort": "crap"
}
```

All keys are optional. Unknown keys are rejected to catch typos.

## Inline annotations

You can control individual functions directly in your source code with leading comments:

```typescript
// react-crap-ignore
export function legacyHelper() {
  // This function will be excluded from analysis entirely.
}

// @crap-threshold 50
export function parser(input: string) {
  // This function is allowed a higher threshold (50 instead of the global default).
}
```

- `// react-crap-ignore` — excludes the next function from analysis
- `// @crap-threshold N` — overrides the global threshold for the next function

## Context-aware function naming

Anonymous arrow functions and function expressions are resolved from their surrounding context, so you never see generic `<anonymous>` spam:

| Pattern | Displayed name |
|---------|----------------|
| `return () => {}` | `handleAuthErrors return` |
| `useEffect(() => {})` | `useEffect callback` |
| `dedupePromise(() => {})` | `dedupePromise callback` |
| `<Sheet>{() => ...}</Sheet>` | `Sheet child` |
| `(async () => {})()` | `useEffect callback IIFE` |
| `const dropSpec = () => () => {}` | `dropSpec nested` |

If a name cannot be resolved, the tool walks up the AST to the nearest named parent function to provide useful context.

## Caching

Complexity analysis results are cached in `.react-crap-cache.json` (created next to `.react-crap.json`). Only files whose content has changed are re-analyzed. This makes repeated runs near-instant on large codebases. The cache is automatically invalidated when the file hash changes.

## JSON output schema

`--format json` produces a versioned envelope with a `$schema` URL pointing at the published JSON Schema. Consumers can validate output offline or generate types directly from the schema.

| Variant | Schema |
|---------|--------|
| Absolute (no `--baseline`) | [`schemas/report-v1.json`](https://raw.githubusercontent.com/OmerMohideen/react-crap/master/schemas/report-v1.json) |
| Delta (with `--baseline`) | [`schemas/delta-v2.json`](https://raw.githubusercontent.com/OmerMohideen/react-crap/master/schemas/delta-v2.json) |

```json
// react-crap --format json
{
  "$schema": "https://raw.githubusercontent.com/OmerMohideen/react-crap/master/schemas/report-v1.json",
  "version": "0.1.0",
  "entries": [
    {
      "file": "src/lib.ts",
      "function": "doThing",
      "line": 12,
      "cyclomatic": 4,
      "coverage": 75.0,
      "crap": 5.6,
      "package": "my-pkg"
    }
  ]
}

// react-crap --format json --baseline baseline.json
{
  "$schema": "https://raw.githubusercontent.com/OmerMohideen/react-crap/master/schemas/delta-v2.json",
  "version": "0.1.0",
  "entries": [],
  "removed": []
}
```

`--baseline` only reads files in this envelope shape; bare-array baselines from older runs must be regenerated.

## SARIF output

`--format sarif` emits a [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) JSON document — the format consumed by GitHub Code Scanning, VS Code, and most static-analysis tooling.

- Each crappy function (entry above `--threshold`) becomes one `result` with `level: "warning"` and a physical location pointing at the function's start line.
- Functions below the threshold are not included.
- An empty result set still produces a valid SARIF document with the full `runs[0].tool.driver` envelope.
- `--baseline` is rejected with `--format sarif`; SARIF describes findings, not deltas. Use `--format json` for delta output.

## Design

The tool has six orthogonal modules. Each is testable in isolation; the join between them has its own integration test.

```
  vitest --coverage                  typescript
  (LCOV file)                      (TS AST)
        │                              │
        ▼                              ▼
  ┌───────────┐                 ┌────────────┐
  │ coverage  │                 │ complexity │
  │  module   │                 │   module   │
  └─────┬─────┘                 └──────┬─────┘
        │                              │
        └──────────┬───────────────────┘
                   ▼
             ┌──────────┐
             │  merge   │  ← path normalization lives here
             └─────┬────┘
                   ▼
             ┌──────────┐     ┌───────┐
             │  score   │ ──▶ │ delta │  ← baseline comparison (optional)
             └─────┬────┘     └───────┘
                   ▼
             ┌──────────┐
             │  report  │  ← human / JSON / GitHub / Markdown
             └──────────┘
```

### The path-matching problem

This is where silent failures happen. Complexity analysis produces absolute paths (whatever was passed to the walker). LCOV files contain whatever the coverage tool decided to write:

1. Absolute paths — `/home/alice/project/src/foo.ts`
2. Project-relative paths — `src/foo.ts`
3. Workspace-relative paths in a monorepo — `packages/core/src/foo.ts`
4. Paths with `./` or `../` components

A naïve `Map<string, _>` lookup silently returns `None` for 100% of files when the two don't agree, and every function reports as 0% covered. `react-crap` handles this with a two-level index:

- Absolute coverage paths → direct canonical-path hash lookup.
- Relative coverage paths → suffix match on path components (not bytes — `/foo/bar.ts` must not match `oofoo/bar.ts`).

Relative paths are **never** canonicalized against the process's CWD, which would otherwise silently bind them to whatever file happened to exist under the tool's working directory.

### The `--missing` policy

Some functions have complexity data but no coverage data — the coverage tool didn't instrument them, or they were excluded via `test` files, or the coverage run was scoped to a subset of the workspace. Three policies:

- **pessimistic** (default): treat as 0% covered. Surfaces unmapped code as a red flag. Correct for CI gates.
- **optimistic**: treat as 100% covered. Useful during local development when you're iterating on a specific module.
- **skip**: drop the row entirely.

## Code-review checks (no coverage)

Beyond the CRAP score, three coverage-free checks hunt the patterns that AI-generated React tends to leave behind. None need an LCOV file.

```bash
# Duplicate functions (copy-paste). --duplicates normalized also finds
# Type-2 near-duplicates (renamed vars/types, different literals).
npx react-crap --duplicates
npx react-crap --duplicates normalized

# AI-slop smells. Noisy any/! are hidden by default.
npx react-crap --smells                       # curated default set
npx react-crap --smells all                   # everything, incl. any/!
npx react-crap --smells effect-missing-deps,index-as-key

# Unused imports.
npx react-crap --dead-code

# Everything above in one report.
npx react-crap --checks
```

Smell kinds: `effect-missing-deps`, `effect-missing-cleanup`, `effect-derived-state`, `unstable-prop`, `index-as-key`, `passthrough-wrapper`, `test-no-assert`, `as-any`, `non-null-assertion`, `type-any`, `ts-suppress`, `console`, `todo`, `placeholder`. In the human report kinds are colored by severity (red = likely bug, yellow = quality, dim = housekeeping).

All three are **report-only** — they print findings and exit 0, so they never block. Add `--format json` for machine output.

### Pre-commit hook (husky + lint-staged)

`--checks --changed` scopes to your uncommitted `.ts`/`.tsx` files and prints all findings without blocking the commit — ideal for surfacing issues at commit time.

`.husky/pre-commit`:

```sh
npx react-crap --checks --changed --no-color || true
```

`--changed` self-scopes via git, so it does **not** depend on lint-staged passing file paths. To run it inside lint-staged alongside other linters (its file arguments are ignored):

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "biome check --write",
      "react-crap --checks --changed --no-color"
    ]
  }
}
```

Drop the `|| true` (or lint-staged's non-zero tolerance) if you ever add a `--fail-on-*` gate and want the commit blocked.

### In CI (any platform)

The output is platform-neutral. Run `--checks` in any CI and pick the renderer that fits:

- **`--checks`** (human, default) — readable table in the job log. Works in GitLab CI, Jenkins, CircleCI, Buildkite, a terminal, anywhere.
- **`--checks --format json`** — machine-readable; pipe into your own annotator, dashboard, or quality gate. This is the portable interchange format.
- **`--checks --format github`** — *optional* GitHub Actions sugar: emits `::warning file=…,line=…` lines that GitHub renders inline on the PR diff. Only useful on GitHub Actions; everywhere else use human or json.

```yaml
# GitHub Actions example (github renderer for inline PR annotations)
on: pull_request
jobs:
  react-crap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx react-crap --checks --format github
```

```yaml
# GitLab CI example (human output in the job log; json artifact for tooling)
react-crap:
  script:
    - npx react-crap --checks
    - npx react-crap --checks --format json > react-crap.json
  artifacts:
    paths: [react-crap.json]
```

Notes:
- `--format json`/`github` are supported by `--checks`, `--smells`, `--duplicates`, and `--dead-code`.
- **Do not** add `--changed` in CI — it reads the working tree (uncommitted edits), which is empty on a fresh checkout. CI scans the whole `--path`.
- Report-only, so the job stays green. Add a `--fail-on-*` gate (not yet implemented) to block merges.

## Integrating with CI

### Absolute threshold gate

```yaml
- run: npx vitest run --coverage
- run: npx react-crap --lcov coverage/lcov.info --fail-above --threshold 30
```

### Regression gate (recommended for teams)

Save a baseline on `master`, then fail on any PR that makes a score go up. This works regardless of the absolute threshold and catches regressions as they are introduced, not weeks later.

```yaml
# On master branch — upload baseline as a CI artifact
- run: npx vitest run --coverage
- run: npx react-crap --lcov coverage/lcov.info --format json --sort file --output baseline.json
- uses: actions/upload-artifact@v4
  with:
    name: crap-baseline
    path: baseline.json

# On pull requests — download baseline and compare
- uses: actions/download-artifact@v4
  with:
    name: crap-baseline
    path: baseline
- run: npx vitest run --coverage
- run: npx react-crap --lcov coverage/lcov.info --baseline baseline/baseline.json --fail-regression
```

### GitHub Code Scanning (SARIF)

Upload `--format sarif` output to surface crappy functions in the repository's **Security → Code scanning** tab. The job needs `security-events: write`.

```yaml
self_score:
  permissions:
    security-events: write
  steps:
    - run: npx vitest run --coverage
    - run: npx react-crap --lcov coverage/lcov.info --format sarif --output crap.sarif
    - uses: github/codeql-action/upload-sarif@v3
      with:
        sarif_file: crap.sarif
        category: react-crap
```

### PR comment bot

`--format pr-comment` produces a sticky comment that surfaces regressions and new functions in the primary table and tucks improvements / removed functions / above-threshold hot-spots into collapsed `<details>` blocks. A hidden marker (`<!-- react-crap-report -->`) lets the script update an existing comment instead of posting duplicates. The job needs `pull-requests: write`.

```yaml
self_score:
  permissions:
    pull-requests: write
  steps:
    # ...generate coverage and download baseline as above...

    - name: Generate PR comment
      if: github.event_name == 'pull_request'
      run: |
        npx react-crap \
          --lcov coverage/lcov.info \
          --baseline baseline.json \
          --format pr-comment \
          --output crap-comment.md

    - name: Post or update PR comment
      if: github.event_name == 'pull_request'
      uses: actions/github-script@v7
      with:
        script: |
          const fs = require('fs');
          const body = fs.readFileSync('crap-comment.md', 'utf8');
          const marker = '<!-- react-crap-report -->';
          const { data: comments } = await github.rest.issues.listComments({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.issue.number,
          });
          const existing = comments.find(c => c.body.startsWith(marker));
          const args = {
            owner: context.repo.owner,
            repo: context.repo.repo,
            body,
          };
          if (existing) {
            await github.rest.issues.updateComment({ ...args, comment_id: existing.id });
          } else {
            await github.rest.issues.createComment({ ...args, issue_number: context.issue.number });
          }
```

## What this tool is not

- It is not a replacement for engineering judgment.
- It does not understand your business domain.
- It does not prove that your tests are good.

Coverage can execute a line without asserting the right behavior. A function can be fully covered and still poorly tested.

So the CRAP score should not be treated as absolute truth. It is a signal — a useful one.

The best use of the tool is to ask better questions:

- Why is this function so complex?
- Is this complexity essential or accidental?
- Do the tests cover the important branches?
- Can we split this into smaller pieces?
- Should this logic be modeled more explicitly?

Good tools do not replace thinking. They make thinking easier to focus.

## Prior art and references

- [Savoia, A. & Evans, B. (2007). *The CRAP Metric.*](https://www.artima.com/weblogs/viewpost.jsp?thread=210575)
- [Crap4j](http://www.crap4j.org/) — the original Java implementation.
- [cargo-crap](https://github.com/minikin/cargo-crap) — Rust implementation of the CRAP metric for Cargo projects by [minikin](https://minikin.me/blog/cargo-crap).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the commit convention, development setup, and release process.

## License

MIT

# AGENTS.md

## Project Overview

`@omermohideen/react-crap` computes the CRAP (Change Risk Anti-Patterns) metric for React TypeScript projects. It parses LCOV coverage reports and walks the TypeScript AST to calculate cyclomatic complexity per function, then scores each function using the CRAP formula.

## Build & Test

```bash
npm install
npm run build      # tsc compiles to dist/
npm test           # vitest run
npm run lint       # tsc --noEmit && biome check src bin test
npm run format     # biome format --write src bin test
```

**Pre-commit hook**: Husky runs `biome check --staged --write` on staged files. Commit blocked if lint fails. Setup via `npm run prepare` (runs `husky` install).

## Architecture

### Core Pipeline

```
  LCOV file                          TS AST
      │                                 │
      ▼                                 ▼
┌───────────┐                  ┌────────────┐
│ coverage  │                  │ complexity │
│  parser   │                  │   walker   │
└─────┬─────┘                  └──────┬─────┘
      │                              │
      │                       ┌──────┴──────┐
      │                       │    cache    │  ← .react-crap-cache.json
      │                       └─────────────┘
      └──────────┬───────────────────┘
                 ▼
           ┌──────────┐
           │  merge   │  ← path normalization (two-level index)
           └─────┬────┘
                 ▼
           ┌──────────┐     ┌───────┐
           │  score   │ ──▶ │ delta │  ← optional baseline comparison
           └─────┬────┘     └───────┘
                 ▼
           ┌──────────┐
           │  report  │  ← human / json / github / markdown / html / pr-comment / sarif
           └──────────┘
```

### File Responsibilities

- **bin/react-crap.ts**: CLI entry using Commander. Parses flags, converts strings to numbers, passes to `run()`.
- **src/index.ts**: Orchestration. Loads config, merges CLI options, coordinates all modules, applies filters, selects formatter, writes output. Contains `runOnce()` and `watchMode()` for `--watch` support.
- **src/config.ts**: Loads `.react-crap.json` by walking up directories from `--path`. Validates keys against an allow-list with Levenshtein-based typo suggestions. CLI flags override config values.
- **src/cache.ts**: File-content hash cache in `.react-crap-cache.json`. Skips unchanged files during complexity analysis. Cache keys are normalized to forward slashes.
- **src/coverage.ts**: Parses LCOV format into a map of `file -> line ranges -> hit counts`. Computes per-function coverage percentages.
- **src/complexity.ts**: Uses the project's own `typescript` package (or falls back to bundled) to parse `.ts` / `.tsx` into AST. Walks nodes to find functions, counts branches (if, switch, for, while, catch, ternary, &&, ||, ??), computes body hash for delta detection. Resolves anonymous function names from context (variable declarations, JSX children, call expression arguments, return statements, parenthesized expressions, nested arrow functions).
- **src/merge.ts**: Joins coverage and complexity by file path. Uses a **two-level index** to handle mismatched path formats (see Key Decisions). Carries `threshold` field from complexity entries.
- **src/score.ts**: Computes CRAP formula: `CRAP = CC² × (1 - coverage/100)³ + CC`. Filters entries by `--min`, `--max`, `--only-failures`, `--top`. Per-function thresholds override global threshold in status computation.
- **src/delta.ts**: Compares current run against a JSON baseline. Detects `New`, `Removed`, `Increased`, `Decreased`, `Unchanged`, `Moved` (same function body, different file). Uses `epsilon` tolerance for unchanged detection.
- **src/report/*.ts**: Output formatters:
  - `human.ts`: Colored table via cli-table3. Shows per-package summary in workspace mode. Respects per-function thresholds for status icons.
  - `json.ts`: Versioned JSON envelope with `$schema` URL.
  - `github.ts`: `::warning` annotations for GitHub Actions.
  - `markdown.ts`: GFM table.
  - `html.ts`: Self-contained styled HTML report with status colors.
  - `pr-comment.ts`: Collapsible PR comment with regressions table and `<details>` blocks.
  - `sarif.ts`: SARIF 2.1.0 for GitHub Code Scanning / VS Code.
- **src/walker.ts**: File system traversal. Respects `.gitignore`. Finds `.ts` / `.tsx` files.

## Key Decisions

### Path Matching (Two-Level Index)

Complexity analysis produces absolute paths. LCOV files may contain absolute, relative, or workspace-relative paths. A naive string-map lookup would silently fail for 100% of files when formats mismatch.

Solution:
1. **Canonical path hash**: Direct lookup for exact absolute path matches.
2. **Suffix match on path components**: For relative paths, match by trailing path segments (not raw bytes) to avoid false positives like `/foo/bar.ts` matching `oofoo/bar.ts`.

Relative coverage paths are **never** resolved against the process CWD. This prevents silently binding them to whatever file happens to exist under the tool's working directory.

### TypeScript AST Resolution

Uses the project's own `typescript` package (resolved from `node_modules` near `--path`) for AST parsing. This ensures compatibility with the project's TS version and language features. Falls back to bundled `typescript` if not found.

### Config System

Config file: `.react-crap.json`. Walks up directories from `--path` until found. Supports all flags except `--lcov`, `--baseline`, `--output`, `--jobs`, `--no-color`, `--help`, `--changed`.

Allowed keys: `threshold`, `failAbove`, `missing`, `exclude`, `allow`, `epsilon`, `min`, `max`, `top`, `onlyFailures`, `workspace`, `verbose`, `watch`.

Unknown keys are rejected with a validation error that includes a typo suggestion (e.g. `"treshold"` → `Did you mean "threshold"?`). This uses Levenshtein distance with a tolerance of ≤2 character differences.

### Filtering Precedence

Filters applied in this exact order in `src/score.ts`:

1. `--min`: Remove entries with CRAP < value
2. `--max`: Remove entries with CRAP > value
3. `--only-failures`: Keep only entries above threshold
4. `--top`: Slice to N worst remaining (after sorting by CRAP desc)

### Auto-Cap

If running in a TTY (interactive terminal), with no `--output`, no `--summary`, no `--top`, no `--min`, no `--max`, no `--only-failures`, and results exceed 50 rows, the tool auto-caps to 50 rows with a message: "Showing top 50 of N functions. Use --top or --min to adjust."

### Missing Coverage Policy

Functions with complexity data but no coverage data (not instrumented, excluded, or scoped run):

- **pessimistic** (default): Treat as 0% covered. Good for CI gates.
- **optimistic**: Treat as 100% covered. Good for local iteration.
- **skip**: Drop the row entirely.

## Output Formats

| Format | Use Case |
|--------|----------|
| `human` | Default colored table for terminal review |
| `json` | Baseline generation, programmatic consumption, CI artifacts |
| `github` | GitHub Actions annotations in PR checks tab |
| `markdown` | GFM table for PR descriptions or documentation |
| `html` | Self-contained styled HTML report with status colors |
| `pr-comment` | Sticky PR comment with collapsible sections |
| `sarif` | GitHub Code Scanning, VS Code, static analysis tooling |

**Important**: `--baseline` is rejected with `--format sarif`. SARIF describes findings, not deltas. Use `--format json` for delta output.

## Testing

Tests are in `test/*.test.ts` using Vitest.

- `score.test.ts`: CRAP formula, scoring, filtering logic (min/max/onlyFailures/top)
- `merge.test.ts`: Path matching, two-level index, edge cases
- `coverage.test.ts`: LCOV parsing
- `complexity.test.ts`: AST walking, branch counting, ignore comment handling
- `delta.test.ts`: Baseline comparison, moved function detection, epsilon tolerance
- `config.test.ts`: Config loading, validation, typo suggestions
- `integration.test.ts`: End-to-end run on `test/fixtures/sample/`

### Fixture Structure

```
test/fixtures/sample/
  src/lib.ts              # Sample functions: trivial, moderate, crappy, arrowFunc
  coverage/lcov.info      # LCOV report for lib.ts
  .react-crap.json        # Optional: config for testing config loading
```

## CI Integration Patterns

### Absolute Threshold Gate

```yaml
- run: npx vitest run --coverage
- run: npx react-crap --lcov coverage/lcov.info --fail-above --threshold 30
```

### Regression Gate

```yaml
# On master: save baseline artifact
- run: npx react-crap --lcov coverage/lcov.info --format json --output baseline.json
- uses: actions/upload-artifact@v4
  with:
    name: crap-baseline
    path: baseline.json

# On PR: compare
- uses: actions/download-artifact@v4
  with:
    name: crap-baseline
    path: baseline
- run: npx react-crap --lcov coverage/lcov.info --baseline baseline/baseline.json --fail-regression
```

### SARIF Upload

```yaml
permissions:
  security-events: write
steps:
  - run: npx react-crap --lcov coverage/lcov.info --format sarif --output crap.sarif
  - uses: github/codeql-action/upload-sarif@v3
    with:
      sarif_file: crap.sarif
      category: react-crap
```

## Workspace / Monorepo Support

Set `--workspace` to analyze all packages. Discovers workspaces via:
1. `pnpm-workspace.yaml` (reads `packages:` list)
2. `package.json` `workspaces` array or `workspaces.packages`

In workspace mode:
- Human/markdown output adds a **Per-package summary** table
- JSON output adds a `package` field to each entry
- `--path` is ignored

## Edge Cases & Gotchas

- **Config file precedence**: CLI `--path` is used to find `.react-crap.json` (walks up from it). If you run from a different directory, the config might not be found.
- **`--allow` globs**: Entries with `/` or `**` are treated as **path globs** (match file path). Entries without are **function name globs** with `*` as wildcard. This is different from `--exclude` which only operates on file paths.
- **`--baseline` JSON shape**: Must be the versioned envelope from `--format json` (with `$schema`, `version`, `entries` array). Bare arrays from older versions are rejected.
- **Moved functions**: Detected by matching `function name + body hash`. If the same function body moves to a different file, it's `Moved` instead of `New` + `Removed`.
- **No functions found**: Throws helpful error mentioning `--path` and `--exclude`.
- **No coverage**: Throws helpful error with LCOV path and suggestions (e.g. `npx vitest run --coverage`).
- **Threshold default**: 30. Follows original CRAP guidance.
- **Ignore comments**: Precede a function with `// react-crap-ignore` to exclude it from analysis.
- **Per-function thresholds**: Precede a function with `// @crap-threshold 50` to override the global threshold.
- **Verbose mode**: `--verbose` prints step-by-step progress to stderr, useful for debugging large projects.
- **Watch mode**: `--watch` polls watched files every 1s and re-runs analysis on changes.
- **Caching**: Complexity results cached in `.react-crap-cache.json`. Only changed files are re-analyzed. Cache is stored next to the resolved config file. Delete cache if the naming algorithm changes and you need fresh function names.
- **Function naming**: Anonymous functions are resolved from parent context. If the resolver cannot determine a name (e.g. deeply nested callbacks in unusual patterns), it walks up the AST to the nearest named parent to provide `ParentName return` / `ParentName callback` / `ParentName nested` context.

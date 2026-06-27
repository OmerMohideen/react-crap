# Configuration Reference

You can configure `react-crap` via CLI flags, a `.react-crap.json` file, or inline source comments. CLI flags always win.

## Config File

`.react-crap.json` is discovered by walking up directories from `--path`. It must be valid JSON.

```json
{
  "threshold": 30,
  "top": 20,
  "onlyFailures": true,
  "missing": "pessimistic",
  "exclude": ["**/*.test.ts", "**/*.test.tsx", "src/generated/**"],
  "allow": ["use*"],
  "failAbove": true,
  "failOnFindings": false,
  "workspace": false,
  "verbose": false,
  "sort": "crap",
  "rules": { "loose-equality": false }
}
```

### Allowed Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `threshold` | `number` | `30` | CRAP score above which a function is flagged |
| `failAbove` | `boolean` | `false` | Exit with code 1 if any function exceeds threshold |
| `failOnFindings` | `boolean` | `false` | Exit with code 1 if any coverage-free check (`--checks`/`--smells`/`--duplicates`/`--dead-code`/`--audit-deps`) reports a finding |
| `missing` | `"pessimistic" \| "optimistic" \| "skip"` | `"pessimistic"` | How to treat functions with no coverage data |
| `exclude` | `string[]` | `[]` | File path globs to skip |
| `allow` | `string[]` | `[]` | Functions or file globs to suppress from output |
| `min` | `number` | — | Hide entries below this CRAP score |
| `max` | `number` | — | Hide entries above this CRAP score |
| `top` | `number` | — | Show only the N worst offenders |
| `onlyFailures` | `boolean` | `false` | Only show functions exceeding threshold |
| `epsilon` | `number` | `0.01` | Tolerance for delta/baseline comparisons |
| `workspace` | `boolean` | `false` | Analyze all workspace packages |
| `verbose` | `boolean` | `false` | Print step-by-step progress |
| `watch` | `boolean` | `false` | Re-run automatically on file changes |
| `sort` | `string` | `"crap"` | Comma-separated display sort fields. `crap` (default), `file`/`name`, `path`, `function`, `line`, `cc`/`cyclomatic`, `coverage`. Combine like `file,function`. `--top` always selects the worst offenders first regardless of sort order. |
| `rules` | `object` | — | Per-smell-kind overrides for `--smells`/`--checks`. See [Customizing Smell Rules](#customizing-smell-rules). |

### Customizing Smell Rules

The `rules` key turns individual smell kinds on or off for `--smells` and `--checks`. A kind mapped to `false` is disabled; `true` force-enables a kind that's off by default (`non-null-assertion`, `type-any`). Unknown kind names are rejected with the valid list.

```json
{
  "rules": {
    "loose-equality": false,
    "var-keyword": false,
    "type-any": true
  }
}
```

The full kind list and their categories are in [Code-Review Checks](./code-review-checks.md).

### Keys NOT Allowed in Config

These are intentionally CLI-only because they are environment-specific or transient:

- `--lcov` — LCOV file path
- `--baseline` — Baseline JSON path
- `--output` — Output file path
- `--jobs` — Parallelism cap
- `--no-color` — Disable colors
- `--format` — Output format (use CLI for ad-hoc reports)
- `--changed` — Transient per-run filter based on working tree state
- `--smells` / `--duplicates` / `--dead-code` / `--checks` / `--audit-deps` — per-run modes (use `rules` to tune which smells fire)

### Validation

Unknown keys are rejected with a validation error that includes a typo suggestion:

```
Unknown key "treshold" in /project/.react-crap.json. Did you mean "threshold"?
```

This uses Levenshtein distance with a tolerance of ≤2 character differences.

## CLI Flags

All flags override their config file equivalents.

```bash
npx react-crap \
  --lcov coverage/lcov.info \
  --path src \
  --threshold 30 \
  --min 10 \
  --max 5000 \
  --top 20 \
  --only-failures \
  --missing pessimistic \
  --exclude "**/*.test.ts" \
  --exclude "**/*.test.tsx" \
  --allow "src/generated/**" \
  --allow "use*" \
  --format human \
  --summary \
  --fail-above \
  --baseline baseline.json \
  --fail-regression \
  --epsilon 0.01 \
  --jobs 4 \
  --workspace \
  --verbose \
  --watch \
  --changed \
  --sort crap \
  --no-color \
  --output report.txt
```

### Coverage-Free Check Flags

These run without an LCOV file and are documented in [Code-Review Checks](./code-review-checks.md):

- `--smells [kinds]` — AI-slop / best-practice / a11y / security smells
- `--duplicates [normalized]` — copy-paste and near-duplicate functions
- `--dead-code` — unused imports
- `--checks` — all of the above in one report
- `--audit-deps` — known-vulnerable dependencies (wraps `npm audit`)
- `--fail-on-findings` — exit 1 if any of the above reports a finding

`--changed` scopes every mode down to the changed *lines* (not just changed files); brand-new files are reported in full.

### Filtering Precedence

When multiple filters are provided, they are applied in this exact order:

1. `--min` — Remove entries with CRAP < value
2. `--max` — Remove entries with CRAP > value
3. `--only-failures` — Keep only entries above threshold
4. `--top` — Slice to N worst remaining

## Inline Annotations

You can control individual functions directly in your source code with leading comments:

### Ignore a Function

```typescript
// react-crap-ignore
export function legacyHelper() {
  // This function will be excluded from analysis entirely.
}
```

### Set a Per-Function Threshold

```typescript
// @crap-threshold 50
export function parser(input: string) {
  // This function is allowed a higher threshold (50 instead of the global default).
}
```

The per-function threshold affects:
- Status icon (✗ vs ▲ vs ✓)
- `--only-failures` filtering
- `--fail-above` exit code
- CI gating

## Missing Coverage Policy

Functions with complexity data but no coverage data (not instrumented, excluded, or scoped run):

| Policy | Behavior | Best For |
|--------|----------|----------|
| **pessimistic** (default) | Treat as 0% covered | CI gates — surfaces unmapped code |
| **optimistic** | Treat as 100% covered | Local iteration on specific modules |
| **skip** | Drop the row entirely | When you only care about instrumented code |

## Allow List Semantics

`--allow` entries work differently depending on their content:

- **Contains `/` or `**`**: Treated as a **file path glob**. Matches the file the function is in.
  - Example: `"src/generated/**"` suppresses all functions in generated files.
- **No slashes**: Treated as a **function name glob**. `*` is a wildcard.
  - Example: `"use*"` suppresses all functions starting with `use` (e.g., React hooks).

This is different from `--exclude`, which only operates on file paths.

## Workspace / Monorepo Mode

Set `workspace: true` to analyze all packages:

```json
{
  "workspace": true,
  "exclude": ["**/*.test.ts"]
}
```

Workspaces are discovered via:
1. `pnpm-workspace.yaml` (reads `packages:` list)
2. `package.json` `workspaces` array or `workspaces.packages`

In workspace mode:
- `--path` is ignored
- Human/markdown output adds a **Per-package summary** table
- JSON output adds a `package` field to each entry

## Watch Mode

Enable with `--watch` or `"watch": true` in config. Polls watched files every 1 second and re-runs analysis on changes. Press `Ctrl+C` to stop.

Watched files include:
- All `.ts` / `.tsx` source files
- The LCOV file
- `.react-crap.json` (if it exists)

## Auto-Cap Behavior

If running in a TTY (interactive terminal), with no `--output`, no `--summary`, no `--top`, no `--min`, no `--max`, no `--only-failures`, and results exceed 50 rows, the tool auto-caps to 50 rows with a message:

```
Showing top 50 of 247 functions. Use --top or --min to adjust.
```

This prevents flooding your terminal. Use `--top` or `--output` to see everything.

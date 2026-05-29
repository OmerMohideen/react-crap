# Troubleshooting

Common issues and how to fix them.

## "No .ts/.tsx files found"

**Cause**: `--path` points to the wrong directory, or `--exclude` filters out everything.

**Fix**:
```bash
# Check what path you're using
npx react-crap --path ./src --lcov coverage/lcov.info

# Check your exclude patterns in .react-crap.json
```

## "Cannot read LCOV file"

**Cause**: The LCOV file doesn't exist at the specified path.

**Fix**:
```bash
# Run your test suite with coverage first
npx vitest run --coverage

# Or specify the correct path
npx react-crap --lcov ./path/to/lcov.info
```

Make sure your test runner is configured to output LCOV:

**Vitest:**
```bash
npm i -D @vitest/coverage-v8
# vitest.config.ts
export default {
  test: {
    coverage: {
      reporter: ['lcov', 'text'],
    },
  },
};
```

## All Functions Show 0% Coverage

**Cause**: Path mismatch between LCOV file paths and filesystem paths.

This is the most common silent failure. It happens when:
- LCOV contains relative paths (`src/foo.ts`) but complexity analysis uses absolute paths
- Different path separators (Windows `\` vs Unix `/`)
- LCOV paths are workspace-relative in a monorepo

**Fix**: `react-crap` has a two-level path index that handles most mismatches automatically. If it still fails:

1. Check what paths are in your LCOV:
   ```bash
   grep "^SF:" coverage/lcov.info | head -5
   ```

2. Check what paths the tool sees:
   ```bash
   npx react-crap --lcov coverage/lcov.info --verbose
   ```

3. If paths are fundamentally different (e.g., LCOV has `/absolute/path` but source is `packages/core/src`), try running from the project root and adjusting `--path`.

## "No functions found"

**Cause**: The source files contain no recognizable functions, or everything is excluded.

**Fix**:
- Remove `--exclude` temporarily to see if files are being skipped
- Check if your code uses unusual patterns (e.g., everything is inside a single IIFE)
- Use `--verbose` to see which files are being analyzed

## High CRAP Scores on Generated Code

**Cause**: Generated files (e.g., GraphQL types, OpenAPI clients) often have high complexity but no tests.

**Fix**: Exclude generated files:

```json
{
  "exclude": ["src/generated/**", "**/*.generated.ts"]
}
```

Or suppress them from output:
```bash
--allow "src/generated/**"
```

## Threshold is Too Strict / Too Lenient

**Fix**: Adjust the threshold. The default is 30, which follows original CRAP guidance.

```json
{
  "threshold": 50
}
```

Or use per-function overrides for known complex but well-tested functions:

```typescript
// @crap-threshold 100
export function complexButTestedParser(input: string) {
  // ...
}
```

## Watch Mode Doesn't Detect Changes

**Cause**: File system polling might miss very rapid changes, or the file is not in the watched set.

**Fix**:
- Ensure the file is under `--path`
- Check that it's not excluded by `.gitignore` or `--exclude`
- Watch mode polls every 1 second; very rapid save cycles might be missed

## Cache Not Updating After Tool Changes

**Cause**: The cache is keyed by file content hash, not by tool version.

**Fix**: Delete the cache to force re-analysis:
```bash
rm .react-crap-cache.json
```

You should do this after:
- Updating `react-crap` to a new version
- Modifying the complexity algorithm
- Changing how anonymous functions are named

## "Unknown key in .react-crap.json"

**Cause**: A typo or unsupported key in your config file.

**Fix**: Check the error message — it usually suggests the correct key. Allowed keys are:

```
threshold, failAbove, missing, exclude, allow, epsilon, min, max, top, onlyFailures, workspace, verbose, watch
```

## SARIF Upload Fails

**Cause**: Missing `security-events: write` permission.

**Fix**:
```yaml
permissions:
  security-events: write
```

Also, `--baseline` is incompatible with `--format sarif`. Use `--format json` for delta output.

## PR Comment Not Posting

**Cause**: Missing `pull-requests: write` permission, or the baseline artifact doesn't exist.

**Fix**:
```yaml
permissions:
  pull-requests: write
```

Ensure the baseline artifact is generated on `master` and downloaded in the PR workflow.

## Colors in CI Logs

**Cause**: CI environments are not TTYs, so colors are disabled by default.

**Fix**: This is usually desired. If you need colors for some reason, most CI platforms set `FORCE_COLOR=1` or you can use a tool that adds color.

## Out of Memory in Large Projects

**Cause**: Analyzing hundreds of files in parallel can exhaust memory.

**Fix**: Cap parallelism:
```bash
npx react-crap --lcov coverage/lcov.info --jobs 2
```

## Functions Named `<unknown>`

**Cause**: The tool couldn't resolve an anonymous function's name from its AST parent.

**Fix**: This is usually fine — the function is still analyzed. The name resolver handles most common patterns (variable declarations, callbacks, JSX handlers, returns, etc.). If you see many `<unknown>` entries in a specific pattern, it might be a bug — please open an issue.

As a workaround, you can assign the function to a variable:

```typescript
// Before: <unknown>
export default () => {};

// After: <default export>
export default () => {};
```

Or for inline callbacks, the tool already tries to name them after the enclosing call expression.

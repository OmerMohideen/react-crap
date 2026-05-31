# Design: `--changed` Flag for Git-Based File Filtering

Date: 2026-05-31

## Overview

Add a `--changed` CLI flag that limits analysis to only uncommitted `.ts`/`.tsx` files in the working tree (working tree vs. HEAD). This is useful for local pre-commit checks and for CI workflows that only want to analyze code that is being changed.

## Decision: CLI-Only Flag

The `changed` option is **not** supported in `.react-crap.json`. It is a transient, per-run filter that depends on the developer's current working tree state and is not appropriate for persistent configuration.

## New Module: `src/git.ts`

### Responsibilities
- Detect if `--path` is inside a git repository.
- Run `git diff --name-only HEAD` relative to the project root.
- Resolve returned paths to absolute paths.
- Filter to `.ts` and `.tsx` files only.

### Function Signature

```ts
export function getChangedFiles(projectPath: string): string[];
```

### Behavior

1. Run `git -C <projectPath> diff --name-only HEAD` via `child_process.execSync`.
2. Split on newlines, trim empty lines.
3. Resolve each path relative to `projectPath` to an absolute path.
4. Filter to paths ending in `.ts` or `.tsx`.
5. Return the array of absolute paths.

### Error Handling

| Condition | Error Message |
|---|---|
| `git` command not found | `Git is required for --changed.` |
| Not inside a git repository | `No git repository found at <path>.` |
| No `.ts`/`.tsx` files changed | `No uncommitted .ts/.tsx changes found.` |

## Pipeline Integration (`src/index.ts`)

### CLI Flag

```ts
.option("--changed", "Only analyze uncommitted .ts/.tsx files");
```

### `RunOptions` Update

```ts
export interface RunOptions {
  // ... existing fields ...
  changed?: boolean;
}
```

### `runOnce()` Logic

After collecting `allFiles` (line ~176 in current `src/index.ts`):

```ts
if (options.changed) {
  const changedFiles = new Set(getChangedFiles(resolve(options.path)));
  const beforeCount = allFiles.length;
  allFiles = allFiles.filter((f) => changedFiles.has(f.path));
  if (allFiles.length === 0) {
    throw new Error("No uncommitted .ts/.tsx changes found.");
  }
  log(`Filtered to ${allFiles.length} changed file(s) (from ${beforeCount})`);
}
```

This naturally limits:
- **Complexity analysis** to changed files only.
- **LCOV merge** to changed files (merge is driven by the complexity entries).
- **Report output** to changed files only.

## Edge Cases

| Scenario | Behavior |
|---|---|
| `--changed` + `--workspace` | Git diff runs from `--path` (workspace root). All package source files are collected, then filtered to the changed set. |
| `--changed` + `--watch` | Each re-run re-checks `git diff`, so newly modified files are picked up on the next poll. |
| Renamed files | `git diff --name-only HEAD` reports the new path after rename — correct behavior, the old path is not in the diff and will not be analyzed. |
| Untracked `.ts`/`.tsx` files | `git diff --name-only HEAD` does **not** include untracked files by default. To include them, the command must also run `git ls-files --others --exclude-standard` and merge the lists. |

**Decision on untracked files:** Include them. The implementation should also collect untracked `.ts`/`.tsx` files via `git ls-files --others --exclude-standard -- '*.ts' '*.tsx'` and merge them with the diff output. This is the expected behavior for a pre-commit check — developers want to see CRAP scores for new files they have created.

## Testing

### Unit Tests (`test/git.test.ts`)
- Mock `child_process.execSync` to return staged, unstaged, and untracked file lists.
- Verify `.ts`/`.tsx` filtering.
- Verify absolute path resolution.
- Verify untracked files are included.
- Verify error messages for missing git / not a repo / no changes.

### Integration Test (`test/integration.test.ts`)
- Add a test case that creates a temp git repo, stages a `.ts` file, runs with `--changed`, and asserts only the changed file appears in output.

### Config Test (`test/config.test.ts`)
- No changes required (flag is CLI-only).

## Files to Modify

1. `bin/react-crap.ts` — add `.option("--changed", ...)`
2. `src/index.ts` — add `changed?: boolean` to `RunOptions`, integrate filter in `runOnce()`
3. `src/git.ts` — new module (see above)
4. `test/git.test.ts` — new test file
5. `test/integration.test.ts` — add `--changed` integration test

## No-Go Decisions

- **Not adding to `.react-crap.json`**: This is a per-run, transient filter. It does not belong in persistent configuration.
- **Not supporting `--since <ref>`**: Out of scope for this feature. Can be added later if needed.
- **Not auto-detecting**: Explicit `--changed` flag only. No magic behavior based on git state.

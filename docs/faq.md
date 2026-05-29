# FAQ

## What is CRAP?

**CRAP** = **C**hange **R**isk **A**nti-**P**atterns

It's a metric that combines cyclomatic complexity and test coverage to identify code that is both hard to understand and poorly tested — the exact place where bugs love to hide.

Formula: `CRAP = CC² × (1 - coverage/100)³ + CC`

- At 100% coverage, CRAP equals cyclomatic complexity.
- At 0% coverage, CRAP equals `CC² + CC`.

## Why "react-crap"?

It brings the CRAP metric (originally from Java/C#) to the TypeScript / React ecosystem. The name is memorable and accurately describes what it finds. 😄

## What does the threshold mean?

The default threshold is **30**. A function with CRAP > 30 is flagged as risky.

This is not arbitrary — it's the original recommendation from the CRAP paper. However, you can adjust it to fit your codebase:

```json
{ "threshold": 50 }
```

## Why do fully covered functions still have high CRAP?

At 100% coverage, `CRAP = CC`. If a function has `CC = 25` and is fully covered, its CRAP is 25 — below the default threshold of 30. But if a function has `CC = 35`, even 100% coverage gives CRAP = 35, which exceeds the threshold.

This is **by design**. The formula says: "this function is too complex to certify as clean, regardless of tests." Consider splitting it.

## What's the difference between `--exclude` and `--allow`?

| Flag | What it filters | Example |
|------|-----------------|---------|
| `--exclude` | **Files** — skips them from analysis entirely | `"**/*.test.ts"` |
| `--allow` | **Output** — suppresses matching functions from the report | `"use*"` or `"src/generated/**"` |

`--exclude` prevents files from being parsed. `--allow` hides functions from output but they are still analyzed.

## Can I use this without React?

Yes! Despite the name, it works with any TypeScript project. It analyzes `.ts` and `.tsx` files and recognizes all standard function types.

## Does it work with JavaScript?

It only analyzes `.ts` and `.tsx` files. If you have `.js` files, they will be skipped. You can rename them to `.ts` (TypeScript is a superset of JavaScript) if you want them analyzed.

## How does caching work?

Complexity analysis results are cached in `.react-crap-cache.json`. The cache key is a SHA-256 hash of the file content. Only files whose content has changed are re-analyzed.

To clear the cache:
```bash
rm .react-crap-cache.json
```

## Can I ignore specific functions?

Yes, with a leading comment:

```typescript
// react-crap-ignore
export function legacyHelper() {
  // This function is excluded from analysis
}
```

## Can I set different thresholds for different functions?

Yes:

```typescript
// @crap-threshold 50
export function parser(input: string) {
  // This function can have CRAP up to 50
}
```

## What coverage format do I need?

LCOV (`.info` or `.lcov`). Most test runners can generate it:

- **Vitest**: `@vitest/coverage-v8` or `@vitest/coverage-istanbul`
- **Jest**: Built-in with `--coverage`
- **Mocha + NYC**: `nyc --reporter=lcov`

## Why is `--baseline` rejected with `--format sarif`?

SARIF describes static findings, not deltas between runs. Use `--format json` for baseline comparisons.

## Does it support monorepos?

Yes! Use `--workspace`:

```bash
npx react-crap --lcov coverage/lcov.info --workspace --top 20
```

It discovers workspaces via `pnpm-workspace.yaml` or `package.json` workspaces.

## Is the tool itself fast?

On warm runs (cache hit), it's near-instant. On cold runs, it's limited by:
1. TypeScript AST parsing (one `createSourceFile` per `.ts`/`.tsx`)
2. LCOV parsing (linear in file size)

For a typical project of ~100 files, it takes 1-3 seconds.

## Can I run it in watch mode?

Yes:

```bash
npx react-crap --lcov coverage/lcov.info --watch --verbose
```

It polls every 1 second. Press `Ctrl+C` to stop.

## Does it modify my code?

No. It is read-only. It only reads source files, LCOV, and config; it writes to `.react-crap-cache.json` and optionally to `--output`.

## What Node.js versions are supported?

Node.js 18 and later.

## Can I use it with Deno or Bun?

It's built for Node.js. It may work with Deno/Bun's Node compatibility layers, but it's not officially supported.

## Where can I get help?

- Read the [Troubleshooting guide](./troubleshooting.md)
- Check the [Configuration Reference](./configuration.md)
- Open an issue on GitHub

## See also

- [cargo-crap](https://github.com/minikin/cargo-crap) — A Rust implementation of the CRAP metric for Cargo projects by [minikin](https://minikin.me/blog/cargo-crap).

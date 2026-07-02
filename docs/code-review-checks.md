# Code-Review Checks (no coverage)

Beyond the CRAP score, `react-crap` ships a set of **coverage-free** checks — they need no LCOV file and analyze your source (and dependencies) directly. They hunt the patterns AI-generated React tends to leave behind, plus accessibility, security, and best-practice issues.

| Mode | What it finds | Needs |
|------|----------------|-------|
| `--smells [kinds]` | effect bugs, perf, a11y, security, best-practice smells | source |
| `--duplicates [normalized]` | copy-paste (and Type-2 near-duplicate) functions | source |
| `--dead-code` | unused imports | source |
| `--checks` | all three source checks in one report | source |
| `--audit-deps` | known-vulnerable dependencies | a lockfile (npm/pnpm/yarn) |
| `--arch` | circular imports, bloated barrel files | source |
| `--audit-supply-chain` | dep install scripts, typosquat-shaped names | `package.json` + `node_modules` |

All are **report-only by default** (exit 0). Add `--fail-on-findings` to turn any of them into a CI gate that exits 1 when something is found.

```bash
npx react-crap --smells          # curated default set
npx react-crap --smells all      # everything, incl. noisy any/!
npx react-crap --duplicates
npx react-crap --duplicates normalized
npx react-crap --dead-code
npx react-crap --checks          # duplicates + smells + dead code
npx react-crap --audit-deps      # npm audit, formatted
```

## Zero-config

A bare `npx react-crap` with no `--lcov` and no coverage file on disk runs the coverage-free audit (`--checks`) automatically, so you always get signal without setup. Generate coverage and it switches to the CRAP score.

## Smell kinds by category

Kinds are colored by severity in the human report: **red** = likely bug, **yellow** = quality, **dim** = housekeeping.

### State & effects
- `effect-missing-deps` — `useEffect` with no dependency array (runs every render)
- `effect-missing-cleanup` — subscribes / sets a timer but returns no cleanup
- `effect-derived-state` — effect only calls `setState` (derive during render instead)

### Performance
- `unstable-prop` — inline object/array/function prop (new reference every render)
- `component-in-render` — a component defined inside another component (remounts every render)
- `index-as-key` — list `key` is the array index (unstable across reorders)

### Security (source patterns)
- `dangerous-html` — `dangerouslySetInnerHTML` (XSS risk)
- `eval-usage` — `eval()` / `new Function()`
- `href-javascript` — `href="javascript:…"`
- `target-blank` — `target="_blank"` without `rel="noopener"` (reverse tabnabbing)

### Accessibility
- `img-no-alt` — `<img>` with no `alt`
- `button-no-type` — `<button>` with no `type` (defaults to `submit`)
- `anchor-no-href` — `<a>` with no `href`
- `positive-tabindex` — `tabIndex` > 0 (disrupts natural tab order)
- `redundant-role` — `role` that restates the element's implicit ARIA role
- `no-autofocus` — `autoFocus` prop (steals focus on mount)
- `label-no-control` — `<label>` with no `htmlFor` and no nested control

### Best practice
- `loose-equality` — `==` / `!=` instead of `===` / `!==`
- `var-keyword` — `var` declarations
- `passthrough-wrapper` — component that only spreads props into one element
- `test-no-assert` — `it()` / `test()` with no `expect()` / `assert()`

### Type escapes / housekeeping
- `as-any` — cast to `any` / `unknown`
- `non-null-assertion` — `!` (noisy, **off by default**)
- `type-any` — bare `any` type (noisy, **off by default**)
- `ts-suppress` — `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`
- `console` — leftover `console.*`
- `todo` — `TODO` / `FIXME` / `HACK`
- `placeholder` — stub/unfinished-code comments

Element-level a11y/security rules only fire on intrinsic (lowercase) elements — custom components own their own behavior — and are spread-aware, so `<img {...props} />` is not flagged.

## Selecting and customizing kinds

Pick kinds for a single run on the CLI:

```bash
npx react-crap --smells effect-missing-deps,index-as-key
```

Or set persistent overrides in `.react-crap.json` with the `rules` map. Each kind maps to:

- `false` — disable the kind
- `true` — force-enable (even an off-by-default noisy kind)
- `"error"` / `"warn"` / `"note"` — force-enable **and** override its display severity (red / yellow / dim, and how it weighs the health score)

```json
{
  "rules": {
    "loose-equality": "error",
    "var-keyword": false,
    "type-any": "warn"
  }
}
```

`rules` applies to both `--smells` and `--checks`. Unknown kind names are rejected with the valid list.

## Diff-only (pre-commit)

`--changed` scopes any check to the changed *lines* of your uncommitted `.ts`/`.tsx` files (brand-new files are reported in full). Ideal for a pre-commit hook:

`.husky/pre-commit`:
```sh
npx react-crap --checks --changed --no-color || true
```

Drop the `|| true` and add `--fail-on-findings` if you want the commit blocked when a check fires.

## Dependency audit

`--audit-deps` runs your package manager's audit and prints a severity-sorted table with fix availability and advisory links. It runs from the nearest `package.json` and detects the lockfile: `package-lock.json` → `npm audit`, `pnpm-lock.yaml` → `pnpm audit`, `yarn.lock` → `yarn audit` (classic). All emit different JSON; react-crap parses each into the same report.

```bash
npx react-crap --audit-deps
npx react-crap --audit-deps --fail-on-findings   # exit 1 on any vuln
```

It is kept out of `--checks` and zero-config because it hits the network and is slower than the source checks.

## Supply-chain heuristics

`--audit-supply-chain` is a no-network, heuristic complement to `--audit-deps` (which finds known CVEs). It scans your **direct** dependencies for:

- **Install scripts** — deps whose installed manifest defines `preinstall`/`install`/`postinstall`. These run arbitrary code on `npm install`; review them. (Bug-severity.)
- **Typosquat-shaped names** — a dep name that is exactly one edit away from a popular package (e.g. `reactt` vs `react`) but isn't that package. Heuristic, so note-severity — verify it's intentional, not a confirmed attack.

```bash
npx react-crap --audit-supply-chain
npx react-crap --audit-supply-chain --fail-on-findings
```

Conservative by design (direct deps only, strict one-edit distance, small curated popular list) to keep false positives low. Not part of `--checks`.

## Architecture

`--arch` analyzes the whole import graph (so it ignores `--changed`) and reports:

- **Circular imports** — import cycles between your first-party modules (`a → b → a`). Each cycle is printed as a path.
- **Bloated barrels** — an `index.*` file that is nothing but re-exports and re-exports ≥ 15 modules. Big barrels cause over-importing and bundle bloat.

```bash
npx react-crap --arch
npx react-crap --arch --fail-on-findings   # exit 1 on any cycle or barrel
```

Cross-layer import rules (e.g. "ui must not import from server") are not implemented — they need a per-project layer spec; the conventionless checks above ship today.

## Health score

Every check report ends with a health score (0–100): `100 − (8·high + 3·warn + 1·note)`, clamped. Two flags expose it directly:

```bash
npx react-crap --score              # print only the score line (human)
npx react-crap --score --format json # { "score": 82, "counts": {...} }
npx react-crap --min-score 80        # exit 1 if the score is below 80 (CI gate)
```

Both run the combined `--checks`. `--min-score` is a score gate, complementary to `--fail-on-findings` (which fails on *any* finding).

## Watch mode

`--watch` works with the checks too — `--checks --watch` re-runs the coverage-free report whenever a source file changes. Press Ctrl+C to stop.

## Output formats

`--format json` and `--format github` work with every check mode:

- `json` — machine-readable; pipe into your own dashboard or gate. Each mode's JSON carries a `$schema` URL (`smells-v1`, `duplicates-v1`, `dead-code-v1`, `checks-v1`, `audit-v1`) for offline validation or type generation.
- `github` — `::warning file=…,line=…` annotations that render inline on the PR diff (GitHub Actions)

See [CI Integration](./ci-integration.md) for workflow examples.

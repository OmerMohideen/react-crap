# Code-Review Checks (no coverage)

Beyond the CRAP score, `react-crap` ships a set of **coverage-free** checks — they need no LCOV file and analyze your source (and dependencies) directly. They hunt the patterns AI-generated React tends to leave behind, plus accessibility, security, and best-practice issues.

| Mode | What it finds | Needs |
|------|----------------|-------|
| `--smells [kinds]` | effect bugs, perf, a11y, security, best-practice smells | source |
| `--duplicates [normalized]` | copy-paste (and Type-2 near-duplicate) functions | source |
| `--dead-code` | unused imports | source |
| `--checks` | all three source checks in one report | source |
| `--audit-deps` | known-vulnerable dependencies | a lockfile (npm/pnpm/yarn) |

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

## Output formats

`--format json` and `--format github` work with every check mode:

- `json` — machine-readable; pipe into your own dashboard or gate. Each mode's JSON carries a `$schema` URL (`smells-v1`, `duplicates-v1`, `dead-code-v1`, `checks-v1`, `audit-v1`) for offline validation or type generation.
- `github` — `::warning file=…,line=…` annotations that render inline on the PR diff (GitHub Actions)

See [CI Integration](./ci-integration.md) for workflow examples.

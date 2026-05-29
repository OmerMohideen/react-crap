# Contributing to @omermohideen/react-crap

Thank you for your interest in contributing! This project follows a fully automated release strategy powered by [Conventional Commits](https://www.conventionalcommits.org/) and [semantic-release](https://semantic-release.gitbook.io/semantic-release/).

## Quick Start

1. Fork and clone the repo
2. Run `npm install` (husky hooks will set up automatically)
3. Create a branch: `git checkout -b feat/my-feature` or `fix/some-bug`
4. Make your changes
5. Commit using the conventional format (see below)
6. Push and open a Pull Request

## Commit Message Convention

**All commits must follow the Conventional Commits specification.** This is enforced by a Husky commit-msg hook and the CI pipeline.

### Format

```
<type>(<scope>): <short summary in imperative mood>

<body> (optional — explain motivation and contrast with previous behavior)

<footer> (optional — reference issues, breaking changes, etc.)
```

### Types

| Type | Description | Triggers Release? |
|------|-------------|-----------------|
| `feat` | A new feature | **Yes** — Minor |
| `fix` | A bug fix | **Yes** — Patch |
| `docs` | Documentation only | No |
| `style` | Formatting, semicolons, etc. | No |
| `refactor` | Code change that neither fixes a bug nor adds a feature | No |
| `perf` | Performance improvement | **Yes** — Patch |
| `test` | Adding or correcting tests | No |
| `chore` | Build process or auxiliary tool changes | No |
| `ci` | CI configuration changes | No |

### Scopes

Scopes are optional but recommended. Common scopes for this project:

- `cli` — CLI argument parsing, flags, help text
- `config` — `.react-crap.json` loading and validation
- `coverage` — LCOV parsing
- `complexity` — AST walking, branch counting, naming
- `merge` — Path matching and coverage merging
- `score` — CRAP formula, filtering
- `delta` — Baseline comparison
- `report` — Output formatters (human, json, html, etc.)
- `cache` — `.react-crap-cache.json`
- `deps` — Dependency updates

### Examples

```bash
# Good
feat(report): add SARIF output format

fix(merge): handle windows paths with backslashes correctly

perf(complexity): cache AST parsing results per file

docs(readme): add cargo-crap to prior art section

# Bad (will be rejected)
added sarif output
update readme
fix stuff
```

### Breaking Changes

Breaking changes trigger a **major** release. You must explicitly mark them:

**Option A — Footer:**
```
feat(cli)!: change --threshold default from 30 to 50

BREAKING CHANGE: the default threshold is now 50 to match updated CRAP guidance
```

**Option B — `!` shorthand:**
```
feat(cli)!: change --threshold default from 30 to 50
```

## Pull Request Workflow

1. Open a PR against `master`
2. The PR title does **not** need to follow conventional commits (it won't be in the release)
3. But **all commits inside the PR must** follow the convention
4. CI will validate commit messages automatically
5. Squash-merge is fine — the merge commit is not analyzed, only the individual commits on `master` matter

## Development Scripts

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint (TypeScript + Biome)
npm run lint

# Auto-format
npm run format

# Build
npm run build

# Run the CLI locally
npm run dev -- --lcov coverage/lcov.info --path src
```

## Questions?

- Check [docs/faq.md](./docs/faq.md)
- Open a discussion or issue on GitHub

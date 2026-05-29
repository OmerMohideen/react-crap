# CI Integration

This guide shows how to integrate `react-crap` into various CI/CD platforms.

## GitHub Actions

### Basic Threshold Gate

Fail the build if any function exceeds a CRAP score of 30:

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx vitest run --coverage
      - run: npx react-crap --lcov coverage/lcov.info --fail-above --threshold 30
```

### Regression Gate (Recommended)

Save a baseline on `master`, then compare PRs against it:

**On `master` branch:**
```yaml
- run: npx vitest run --coverage
- run: npx react-crap --lcov coverage/lcov.info --format json --output baseline.json
- uses: actions/upload-artifact@v4
  with:
    name: crap-baseline
    path: baseline.json
```

**On pull requests:**
```yaml
- uses: actions/download-artifact@v4
  with:
    name: crap-baseline
    path: baseline
- run: npx vitest run --coverage
- run: npx react-crap --lcov coverage/lcov.info --baseline baseline/baseline.json --fail-regression
```

### SARIF Upload to GitHub Code Scanning

Surface crappy functions in the **Security → Code scanning** tab:

```yaml
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

### Sticky PR Comment Bot

Post a collapsible comment that updates on every push:

```yaml
permissions:
  pull-requests: write
steps:
  - run: npx vitest run --coverage
  - run: |
      npx react-crap \
        --lcov coverage/lcov.info \
        --baseline baseline.json \
        --format pr-comment \
        --output crap-comment.md
  - uses: actions/github-script@v7
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
        const args = { owner: context.repo.owner, repo: context.repo.repo, body };
        if (existing) {
          await github.rest.issues.updateComment({ ...args, comment_id: existing.id });
        } else {
          await github.rest.issues.createComment({ ...args, issue_number: context.issue.number });
        }
```

## GitLab CI

```yaml
stages: [test, quality]

unit_tests:
  stage: test
  image: node:20
  script:
    - npm ci
    - npx vitest run --coverage
  artifacts:
    paths:
      - coverage/lcov.info
    expire_in: 1 week

crap_score:
  stage: quality
  image: node:20
  needs: [unit_tests]
  script:
    - npm ci
    - npx react-crap --lcov coverage/lcov.info --fail-above --threshold 30
```

## CircleCI

```yaml
version: 2.1
jobs:
  build:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - run: npm ci
      - run: npx vitest run --coverage
      - run: npx react-crap --lcov coverage/lcov.info --fail-above
workflows:
  master:
    jobs: [build]
```

## Azure Pipelines

```yaml
trigger:
  - master

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
    displayName: 'Install Node.js'

  - script: npm ci
    displayName: 'Install dependencies'

  - script: npx vitest run --coverage
    displayName: 'Run tests with coverage'

  - script: npx react-crap --lcov coverage/lcov.info --fail-above --threshold 30
    displayName: 'Check CRAP scores'
```

## Jenkins

```groovy
pipeline {
    agent any
    stages {
        stage('Test') {
            steps {
                sh 'npm ci'
                sh 'npx vitest run --coverage'
            }
        }
        stage('CRAP Gate') {
            steps {
                sh 'npx react-crap --lcov coverage/lcov.info --fail-above --threshold 30'
            }
        }
    }
    post {
        always {
            archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
    }
}
```

## Bitbucket Pipelines

```yaml
image: node:20

pipelines:
  default:
    - step:
        name: Test and CRAP check
        script:
          - npm ci
          - npx vitest run --coverage
          - npx react-crap --lcov coverage/lcov.info --fail-above --threshold 30
```

## Tips for CI

### Use `--jobs` in Resource-Constrained Environments

```bash
npx react-crap --lcov coverage/lcov.info --jobs 2
```

This caps parallel file analysis. Useful in Docker or shared CI runners with limited memory.

### Generate Baselines on Schedule

If artifact passing between branches is complex, generate baselines nightly:

```yaml
- cron: '0 2 * * *'  # 2 AM daily
```

Then upload to S3, artifact storage, or commit to a `baselines/` branch.

### Combine with `--summary` for Quick Checks

```bash
npx react-crap --lcov coverage/lcov.info --summary --fail-above
```

This prints only aggregate stats (no per-function table), keeping CI logs short.

### Workspace / Monorepo CI

```bash
npx react-crap --lcov coverage/lcov.info --workspace --top 20 --fail-above
```

This analyzes all workspace packages and fails if any of the top 20 worst functions exceed the threshold.

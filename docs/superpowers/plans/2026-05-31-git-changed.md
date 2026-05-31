# `--changed` Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--changed` CLI flag that limits analysis to only uncommitted `.ts`/`.tsx` files (modified, staged, and untracked).

**Architecture:** A new `src/git.ts` module wraps `git diff --name-only HEAD` and `git ls-files --others --exclude-standard` to collect changed file paths. The CLI gains a `--changed` flag, and `src/index.ts` filters the `allFiles` list to the changed set before complexity analysis. This is CLI-only; no config key is added.

**Tech Stack:** TypeScript, Node.js `child_process`, Vitest, `execSync` mocking.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/git.ts` | Create | Detect git repo, run `git diff` + `git ls-files`, resolve and filter paths |
| `test/git.test.ts` | Create | Unit tests for `getChangedFiles` with mocked `execSync` |
| `bin/react-crap.ts` | Modify | Add `--changed` CLI option and pass it to `run()` |
| `src/index.ts` | Modify | Add `changed?: boolean` to `RunOptions`, filter `allFiles` when active |
| `test/integration.test.ts` | Modify | Add end-to-end test with `--changed` on a temp git repo |

---

### Task 1: Write failing unit tests for `src/git.ts`

**Files:**
- Create: `test/git.test.ts`

**Context:** The project uses Vitest. Mock `child_process` with `vi.mock`.

```ts
import { describe, expect, it, vi } from "vitest";
import { getChangedFiles } from "../src/git";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";

function mockExec(outputs: Record<string, string | Buffer>) {
  (execSync as ReturnType<typeof vi.fn>).mockImplementation(
    (cmd: string) => {
      if (outputs[cmd] !== undefined) return outputs[cmd];
      const err = new Error("Command failed") as any;
      err.status = 1;
      err.stderr = Buffer.from("unknown command");
      throw err;
    }
  );
}

describe("getChangedFiles", () => {
  it("returns only .ts and .tsx files from diff and untracked", () => {
    mockExec({
      "git -C /project diff --name-only HEAD":
        "src/lib.ts\nREADME.md\nsrc/app.tsx\n",
      "git -C /project ls-files --others --exclude-standard -- '*.ts' '*.tsx'":
        "src/new.ts\n",
    });

    const result = getChangedFiles("/project");
    expect(result).toEqual([
      "/project/src/lib.ts",
      "/project/src/app.tsx",
      "/project/src/new.ts",
    ]);
  });

  it("throws when git is not installed", () => {
    const err = new Error("spawn git ENOENT") as any;
    err.code = "ENOENT";
    err.stderr = Buffer.from("");
    (execSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw err;
    });

    expect(() => getChangedFiles("/project")).toThrow("Git is required for --changed.");
  });

  it("throws when not inside a git repository", () => {
    const err = new Error("fatal: not a git repository") as any;
    err.status = 128;
    err.stderr = Buffer.from("fatal: not a git repository");
    (execSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw err;
    });

    expect(() => getChangedFiles("/project")).toThrow(
      "No git repository found at /project.",
    );
  });

  it("throws when no .ts/.tsx files changed", () => {
    mockExec({
      "git -C /project diff --name-only HEAD": "README.md\n",
      "git -C /project ls-files --others --exclude-standard -- '*.ts' '*.tsx'": "",
    });

    expect(() => getChangedFiles("/project")).toThrow(
      "No uncommitted .ts/.tsx changes found.",
    );
  });
});
```

---

### Task 2: Run tests to verify they fail

Run:
```bash
npx vitest run test/git.test.ts
```

Expected output:
- FAIL: `Error: Cannot find module '../src/git'` (or similar import error)

---

### Task 3: Implement `src/git.ts`

**Files:**
- Create: `src/git.ts`

```ts
import { execSync } from "node:child_process";
import { resolve } from "node:path";

export function getChangedFiles(projectPath: string): string[] {
  const diffCmd = `git -C ${projectPath} diff --name-only HEAD`;
  const untrackedCmd = `git -C ${projectPath} ls-files --others --exclude-standard -- '*.ts' '*.tsx'`;

  let diffOutput = "";
  let untrackedOutput = "";

  try {
    diffOutput = execSync(diffCmd, { encoding: "utf-8", stdio: "pipe" });
  } catch (e: any) {
    if (e.code === "ENOENT") {
      throw new Error("Git is required for --changed.");
    }
    if (e.status === 128 || (e.stderr && e.stderr.toString().includes("not a git repository"))) {
      throw new Error(`No git repository found at ${projectPath}.`);
    }
    throw e;
  }

  try {
    untrackedOutput = execSync(untrackedCmd, { encoding: "utf-8", stdio: "pipe" });
  } catch {
    // If ls-files fails, just proceed with diff output
  }

  const allNames = new Set<string>();
  for (const line of diffOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) allNames.add(trimmed);
  }
  for (const line of untrackedOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) allNames.add(trimmed);
  }

  const result: string[] = [];
  for (const name of allNames) {
    if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      result.push(resolve(projectPath, name));
    }
  }

  if (result.length === 0) {
    throw new Error("No uncommitted .ts/.tsx changes found.");
  }

  return result;
}
```

---

### Task 4: Run tests to verify they pass

Run:
```bash
npx vitest run test/git.test.ts
```

Expected: all 4 tests PASS.

---

### Task 5: Commit

```bash
git add src/git.ts test/git.test.ts
git commit -m "feat: add getChangedFiles for --changed flag"
```

---

### Task 6: Add `--changed` CLI flag

**Files:**
- Modify: `bin/react-crap.ts`

Add one line after the `--watch` option (line 57):

```ts
	.option("--changed", "Only analyze uncommitted .ts/.tsx files")
```

Pass it through in the `run()` call (after `watch`):

```ts
	watch: options.watch ?? false,
	changed: options.changed ?? false,
```

Full diff for `bin/react-crap.ts`:

```diff
--- a/bin/react-crap.ts
+++ b/bin/react-crap.ts
@@ -55,6 +55,7 @@ program
 	.option("--workspace", "Analyze all workspace packages")
 	.option("--verbose", "Print detailed progress information")
 	.option("--watch", "Re-run automatically when files change")
+	.option("--changed", "Only analyze uncommitted .ts/.tsx files")
 	.option("--no-color", "Disable colored output")
 	.option("--output <file>", "Write output to file instead of stdout");
 
@@ -86,6 +87,7 @@ run({
 	workspace: options.workspace ?? false,
 	verbose: options.verbose ?? false,
 	watch: options.watch ?? false,
+	changed: options.changed ?? false,
 	output: options.output,
 	noColor,
 }).catch((err) => {
```

---

### Task 7: Wire up `changed` in `src/index.ts`

**Files:**
- Modify: `src/index.ts`

**Step 7a:** Add import and `changed` to `RunOptions`.

Insert import at line 20 (after `walkFiles`):
```ts
import { getChangedFiles } from "./git.js";
```

Add `changed?: boolean;` to `RunOptions` (after `watch?`):
```ts
	watch?: boolean;
	changed?: boolean;
```

**Step 7b:** Pass `changed` through in the merged `options` object inside `runOnce()`. After `watch:` line, add:
```ts
	changed: rawOptions.changed ?? false,
```

**Step 7c:** Add the filter logic after collecting `allFiles` (after line 188, before the `allFiles.length === 0` check):

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

Full diff context for `src/index.ts` (lines around 175-195):

```diff
--- a/src/index.ts
+++ b/src/index.ts
@@ -18,6 +18,7 @@ import { filter, score } from "./score.js";
 import { checkForUpdate, getLocalVersion } from "./version-check.js";
 import { walkFiles } from "./walker.js";
+import { getChangedFiles } from "./git.js";
 
 export interface RunOptions {
 	lcov?: string;
@@ -43,6 +44,7 @@ export interface RunOptions {
 	verbose?: boolean;
 	watch?: boolean;
 	noColor?: boolean;
+	changed?: boolean;
 }
 
 export async function run(rawOptions: RunOptions): Promise<void> {
@@ -142,6 +144,7 @@ async function runOnce(
 		verbose: rawOptions.verbose || config.verbose || false,
 		watch: rawOptions.watch || config.watch || false,
 		noColor: rawOptions.noColor || false,
+		changed: rawOptions.changed ?? false,
 	};
 
 	const log = (message: string) => {
@@ -188,6 +191,17 @@ async function runOnce(
 		}
 	}
 
+	if (options.changed) {
+		const changedFiles = new Set(getChangedFiles(resolve(options.path)));
+		const beforeCount = allFiles.length;
+		allFiles = allFiles.filter((f) => changedFiles.has(f.path));
+		if (allFiles.length === 0) {
+			throw new Error("No uncommitted .ts/.tsx changes found.");
+		}
+		log(`Filtered to ${allFiles.length} changed file(s) (from ${beforeCount})`);
+	}
+
 	if (allFiles.length === 0) {
 		throw new Error(
 			`No .ts/.tsx files found in ${resolve(options.path)}. Check --path and --exclude flags.`,
```

---

### Task 8: Run integration tests to verify nothing is broken

Run:
```bash
npx vitest run test/integration.test.ts
```

Expected: existing integration test still passes.

---

### Task 9: Add integration test for `--changed`

**Files:**
- Modify: `test/integration.test.ts`

Add a new test case. This requires creating a temporary git repository with a `.ts` file and an LCOV report, then running with `changed: true`.

```ts
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index";

describe("integration", () => {
  it("runs end-to-end on fixture", async () => {
    const fixturePath = resolve("test/fixtures/sample");
    const lcovPath = resolve(fixturePath, "coverage/lcov.info");

    await expect(
      run({
        lcov: lcovPath,
        path: resolve(fixturePath, "src"),
        threshold: 30,
        missing: "pessimistic",
        exclude: [],
        allow: [],
        format: "json",
        summary: false,
        failAbove: false,
        failRegression: false,
        epsilon: 0.01,
      }),
    ).resolves.toBeUndefined();
  });

  it("limits to changed files with --changed", async () => {
    const tmpDir = resolve("test/fixtures/tmp-changed");
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });

    const srcDir = resolve(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });

    // Write a .ts file
    writeFileSync(
      resolve(srcDir, "changed.ts"),
      "export function add(a: number, b: number) { return a + b; }\n",
      "utf-8",
    );

    // Write a minimal LCOV report covering changed.ts line 1
    const lcovContent = `SF:src/changed.ts\nFN:1,add\nFNDA:1,add\nDA:1,1\nLF:1\nLH:1\nend_of_record\n`;
    writeFileSync(resolve(tmpDir, "lcov.info"), lcovContent, "utf-8");

    // Initialize git repo and stage the file so it counts as changed
    const { execSync } = await import("node:child_process");
    execSync("git init", { cwd: tmpDir });
    execSync("git add .", { cwd: tmpDir });

    let output = "";
    const originalLog = console.log;
    console.log = (msg: string) => {
      output += msg;
    };

    await run({
      lcov: resolve(tmpDir, "lcov.info"),
      path: srcDir,
      threshold: 30,
      missing: "pessimistic",
      exclude: [],
      allow: [],
      format: "json",
      summary: false,
      failAbove: false,
      failRegression: false,
      epsilon: 0.01,
      changed: true,
    });

    console.log = originalLog;

    const parsed = JSON.parse(output);
    expect(parsed.entries.length).toBe(1);
    expect(parsed.entries[0].function).toBe("add");
    expect(parsed.entries[0].file).toContain("changed.ts");

    rmSync(tmpDir, { recursive: true });
  });
});
```

---

### Task 10: Run integration tests to verify new test passes

Run:
```bash
npx vitest run test/integration.test.ts
```

Expected: both integration tests PASS.

---

### Task 11: Run full test suite

Run:
```bash
npm test
```

Expected: all tests PASS.

Run lint:
```bash
npm run lint
```

Expected: no errors.

---

### Task 12: Commit

```bash
git add bin/react-crap.ts src/index.ts test/integration.test.ts
git commit -m "feat: add --changed flag to analyze only uncommitted files"
```

---

## Self-Review

**Spec coverage check:**
- `src/git.ts` module with `getChangedFiles` → Task 3
- Error handling (git not found, not a repo, no changes) → Task 1 tests + Task 3 implementation
- CLI `--changed` flag → Task 6
- `RunOptions` updated → Task 7
- Pipeline filter in `runOnce()` → Task 7
- Untracked files included → Task 1 test + Task 3 `ls-files` command
- Integration test → Task 9

**Placeholder scan:**
- No "TBD", "TODO", or "implement later" found.
- All code blocks contain complete, runnable code.
- All commands include expected output.

**Type consistency:**
- `RunOptions.changed` is `boolean` everywhere.
- `getChangedFiles` signature matches spec (`projectPath: string` → `string[]`).
- No naming mismatches found.

**No gaps found. Plan is complete.**

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-31-git-changed.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

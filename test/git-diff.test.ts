import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getChangedLineRanges } from "../src/git-diff";

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}));

import { execSync } from "node:child_process";

function mockExec(outputs: Record<string, string | Buffer>) {
	(execSync as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
		if (outputs[cmd] !== undefined) return outputs[cmd];
		const err = new Error("Command failed") as any;
		err.status = 1;
		err.stderr = Buffer.from("unknown command");
		throw err;
	});
}

describe("getChangedLineRanges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("extracts changed lines from a single addition hunk", () => {
		mockExec({
			"git rev-parse --show-toplevel": "/project\n",
			"git diff --no-relative --unified=0 HEAD":
				"diff --git a/src/lib.ts b/src/lib.ts\n" +
				"index abc..def 100644\n" +
				"--- a/src/lib.ts\n" +
				"+++ b/src/lib.ts\n" +
				"@@ -10,2 +10,3 @@\n" +
				" unchanged\n" +
				"+added\n",
		});

		const result = getChangedLineRanges("/project");
		const lines = result.get(resolve("/project", "src/lib.ts"));
		expect(lines).toEqual(new Set([10, 11, 12]));
	});

	it("merges multiple hunks in one file", () => {
		mockExec({
			"git rev-parse --show-toplevel": "/project\n",
			"git diff --no-relative --unified=0 HEAD":
				"diff --git a/src/lib.ts b/src/lib.ts\n" +
				"index abc..def 100644\n" +
				"--- a/src/lib.ts\n" +
				"+++ b/src/lib.ts\n" +
				"@@ -5,1 +5,2 @@\n" +
				"+added1\n" +
				"@@ -20,1 +20,1 @@\n" +
				"-old\n" +
				"+new\n",
		});

		const result = getChangedLineRanges("/project");
		const lines = result.get(resolve("/project", "src/lib.ts"));
		expect(lines).toEqual(new Set([5, 6, 20]));
	});

	it("handles pure deletion hunk with sentinel", () => {
		mockExec({
			"git rev-parse --show-toplevel": "/project\n",
			"git diff --no-relative --unified=0 HEAD":
				"diff --git a/src/lib.ts b/src/lib.ts\n" +
				"index abc..def 100644\n" +
				"--- a/src/lib.ts\n" +
				"+++ b/src/lib.ts\n" +
				"@@ -5,3 +4,0 @@\n" +
				"-removed1\n" +
				"-removed2\n" +
				"-removed3\n",
		});

		const result = getChangedLineRanges("/project");
		const lines = result.get(resolve("/project", "src/lib.ts"));
		expect(lines).toEqual(new Set([4]));
	});

	it("handles multiple files", () => {
		mockExec({
			"git rev-parse --show-toplevel": "/project\n",
			"git diff --no-relative --unified=0 HEAD":
				"diff --git a/src/a.ts b/src/a.ts\n" +
				"@@ -1,1 +1,2 @@\n" +
				"+added\n" +
				"diff --git a/src/b.ts b/src/b.ts\n" +
				"@@ -3,1 +3,1 @@\n" +
				"-old\n" +
				"+new\n",
		});

		const result = getChangedLineRanges("/project");
		expect(result.get(resolve("/project", "src/a.ts"))).toEqual(
			new Set([1, 2]),
		);
		expect(result.get(resolve("/project", "src/b.ts"))).toEqual(new Set([3]));
	});

	it("throws when no .ts/.tsx files have changed lines", () => {
		mockExec({
			"git rev-parse --show-toplevel": "/project\n",
			"git diff --no-relative --unified=0 HEAD":
				"diff --git a/README.md b/README.md\n" +
				"@@ -1,1 +1,2 @@\n" +
				"+added\n",
		});

		expect(() => getChangedLineRanges("/project")).toThrow(
			"No uncommitted .ts/.tsx changes found.",
		);
	});

	it("throws when git is not installed", () => {
		const err = new Error("spawn git ENOENT") as any;
		err.code = "ENOENT";
		err.stderr = Buffer.from("");
		(execSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
			throw err;
		});

		expect(() => getChangedLineRanges("/project")).toThrow(
			"Git is required for --changed.",
		);
	});
});

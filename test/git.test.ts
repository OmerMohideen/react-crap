import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getChangedFiles } from "../src/git";

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}));

import { execSync } from "node:child_process";

function mockExec(outputs: Record<string, string | Buffer>) {
	(execSync as ReturnType<typeof vi.fn>).mockImplementation(
		(cmd: string, _opts?: unknown) => {
			if (outputs[cmd] !== undefined) return outputs[cmd];
			const err = new Error("Command failed") as any;
			err.status = 1;
			err.stderr = Buffer.from("unknown command");
			throw err;
		},
	);
}

describe("getChangedFiles", () => {
	it("returns only .ts and .tsx files from diff and untracked", () => {
		mockExec({
			"git diff --name-only HEAD": "src/lib.ts\nREADME.md\nsrc/app.tsx\n",
			"git ls-files --others --exclude-standard -- '*.ts' '*.tsx'":
				"src/new.ts\n",
		});

		const result = getChangedFiles("/project");
		expect(result).toEqual([
			resolve("/project", "src/lib.ts").replace(/\\/g, "/"),
			resolve("/project", "src/app.tsx").replace(/\\/g, "/"),
			resolve("/project", "src/new.ts").replace(/\\/g, "/"),
		]);
	});

	it("throws when git is not installed", () => {
		const err = new Error("spawn git ENOENT") as any;
		err.code = "ENOENT";
		err.stderr = Buffer.from("");
		(execSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
			throw err;
		});

		expect(() => getChangedFiles("/project")).toThrow(
			"Git is required for --changed.",
		);
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
			"git diff --name-only HEAD": "README.md\n",
			"git ls-files --others --exclude-standard -- '*.ts' '*.tsx'": "",
		});

		expect(() => getChangedFiles("/project")).toThrow(
			"No uncommitted .ts/.tsx changes found.",
		);
	});
});

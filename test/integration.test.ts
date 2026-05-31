import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run } from "../src/index";

describe("integration", () => {
	it("runs end-to-end on fixture", async () => {
		const fixturePath = resolve("test/fixtures/sample");
		const lcovPath = resolve(fixturePath, "coverage/lcov.info");

		// Just verify it doesn't throw and produces output
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
		const tmpDir = mkdtempSync(resolve(tmpdir(), "react-crap-changed-"));
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
		execSync("git init", { cwd: tmpDir });
		execSync('git config user.email "test@test.com"', { cwd: tmpDir });
		execSync('git config user.name "Test"', { cwd: tmpDir });
		execSync("git add .", { cwd: tmpDir });
		execSync('git commit -m "initial"', { cwd: tmpDir });

		// Modify the file so it counts as changed
		writeFileSync(
			resolve(srcDir, "changed.ts"),
			"export function add(a: number, b: number) { return a + b; }\n// modified\n",
			"utf-8",
		);

		let output = "";
		const logSpy = vi
			.spyOn(console, "log")
			.mockImplementation((...args: any[]) => {
				output += args.join(" ");
			});

		try {
			await run({
				lcov: resolve(tmpDir, "lcov.info"),
				path: tmpDir,
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

			const parsed = JSON.parse(output);
			expect(parsed.entries.length).toBe(1);
			expect(parsed.entries[0].function).toBe("add");
			expect(parsed.entries[0].file).toContain("changed.ts");
		} finally {
			logSpy.mockRestore();
			if (existsSync(tmpDir)) {
				rmSync(tmpDir, { recursive: true });
			}
		}
	});
});

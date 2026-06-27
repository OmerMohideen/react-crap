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

	it("limits to changed functions with --changed", async () => {
		const tmpDir = mkdtempSync(resolve(tmpdir(), "react-crap-changed-"));
		mkdirSync(tmpDir, { recursive: true });

		const srcDir = resolve(tmpDir, "src");
		mkdirSync(srcDir, { recursive: true });

		// Write a file with TWO functions
		writeFileSync(
			resolve(srcDir, "changed.ts"),
			"export function add(a: number, b: number) { return a + b; }\n" +
				"export function subtract(a: number, b: number) { return a - b; }\n",
			"utf-8",
		);

		// Write a minimal LCOV report covering both functions
		const lcovContent =
			`SF:src/changed.ts\n` +
			`FN:1,add\n` +
			`FN:2,subtract\n` +
			`FNDA:1,add\n` +
			`FNDA:1,subtract\n` +
			`DA:1,1\n` +
			`DA:2,1\n` +
			`LF:2\n` +
			`LH:2\n` +
			`end_of_record\n`;
		writeFileSync(resolve(tmpDir, "lcov.info"), lcovContent, "utf-8");

		// Initialize git repo and commit
		execSync("git init", { cwd: tmpDir });
		execSync('git config user.email "test@test.com"', { cwd: tmpDir });
		execSync('git config user.name "Test"', { cwd: tmpDir });
		execSync("git add .", { cwd: tmpDir });
		execSync('git commit -m "initial"', { cwd: tmpDir });

		// Modify ONLY the `add` function (line 1)
		writeFileSync(
			resolve(srcDir, "changed.ts"),
			"export function add(a: number, b: number) { return a + b + 1; }\n" +
				"export function subtract(a: number, b: number) { return a - b; }\n",
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
			// subtract should NOT appear because it wasn't changed
			const subtractEntry = parsed.entries.find(
				(e: any) => e.function === "subtract",
			);
			expect(subtractEntry).toBeUndefined();
		} finally {
			logSpy.mockRestore();
			if (existsSync(tmpDir)) {
				rmSync(tmpDir, { recursive: true });
			}
		}
	});

	const checksBase = {
		threshold: 30,
		missing: "pessimistic" as const,
		exclude: [],
		allow: [],
		summary: false,
		failAbove: false,
		failRegression: false,
		epsilon: 0.01,
	};

	async function captureRun(opts: any): Promise<string> {
		let out = "";
		const spy = vi
			.spyOn(console, "log")
			.mockImplementation((...args: any[]) => {
				out += args.join(" ");
			});
		try {
			await run(opts);
		} finally {
			spy.mockRestore();
		}
		return out;
	}

	it("--smells json output carries a $schema URL", async () => {
		const out = await captureRun({
			...checksBase,
			path: resolve("test/fixtures/smells"),
			format: "json",
			smells: true,
		});
		const parsed = JSON.parse(out);
		expect(parsed.$schema).toContain("smells-v1.json");
		expect(Array.isArray(parsed.smells)).toBe(true);
	});

	it("--checks json output carries a $schema URL and all three sections", async () => {
		const out = await captureRun({
			...checksBase,
			path: resolve("test/fixtures/smells"),
			format: "json",
			checks: true,
		});
		const parsed = JSON.parse(out);
		expect(parsed.$schema).toContain("checks-v1.json");
		expect(parsed).toHaveProperty("duplicates");
		expect(parsed).toHaveProperty("smells");
		expect(parsed).toHaveProperty("deadImports");
	});

	it("--fail-on-findings exits 1 when smells are present", async () => {
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as any);
		try {
			await captureRun({
				...checksBase,
				path: resolve("test/fixtures/smells"),
				format: "json",
				smells: true,
				failOnFindings: true,
			});
			expect(exitSpy).toHaveBeenCalledWith(1);
		} finally {
			exitSpy.mockRestore();
		}
	});

	it("--score prints a numeric health score in JSON", async () => {
		const out = await captureRun({
			...checksBase,
			path: resolve("test/fixtures/smells"),
			format: "json",
			score: true,
		});
		const parsed = JSON.parse(out);
		expect(typeof parsed.score).toBe("number");
		expect(parsed.score).toBeGreaterThanOrEqual(0);
		expect(parsed.score).toBeLessThanOrEqual(100);
	});

	it("--min-score exits 1 when the score is below the threshold", async () => {
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as any);
		try {
			await captureRun({
				...checksBase,
				path: resolve("test/fixtures/smells"),
				format: "json",
				minScore: 100, // fixtures have smells, so score < 100
			});
			expect(exitSpy).toHaveBeenCalledWith(1);
		} finally {
			exitSpy.mockRestore();
		}
	});

	it("includes React-aware fields in JSON and human output", async () => {
		const fixturePath = resolve("test/fixtures/sample");
		const lcovPath = resolve(fixturePath, "coverage/lcov.info");
		const srcPath = resolve(fixturePath, "src");

		// JSON format
		let jsonOutput = "";
		const jsonSpy = vi
			.spyOn(console, "log")
			.mockImplementation((...args: any[]) => {
				jsonOutput += args.join(" ");
			});

		try {
			await run({
				lcov: lcovPath,
				path: srcPath,
				threshold: 30,
				missing: "pessimistic",
				exclude: [],
				allow: [],
				format: "json",
				summary: false,
				failAbove: false,
				failRegression: false,
				epsilon: 0.01,
			});
		} finally {
			jsonSpy.mockRestore();
		}

		const parsed = JSON.parse(jsonOutput);
		expect(parsed.entries.length).toBeGreaterThan(0);

		for (const entry of parsed.entries) {
			expect(entry).toHaveProperty("isComponent");
			expect(entry).toHaveProperty("hooks");
			expect(entry).toHaveProperty("renderBranches");
		}

		const components = parsed.entries.filter((e: any) => e.isComponent);
		expect(components.length).toBeGreaterThan(0);

		const broken = parsed.entries.find((e: any) => e.function === "BrokenHook");
		expect(broken).toBeDefined();
		expect(broken.hookViolations.length).toBeGreaterThan(0);

		// Human format
		let humanOutput = "";
		const humanSpy = vi
			.spyOn(console, "log")
			.mockImplementation((...args: any[]) => {
				humanOutput += args.join(" ");
			});

		try {
			await run({
				lcov: lcovPath,
				path: srcPath,
				threshold: 30,
				missing: "pessimistic",
				exclude: [],
				allow: [],
				format: "human",
				summary: false,
				failAbove: false,
				failRegression: false,
				epsilon: 0.01,
				noColor: true,
			});
		} finally {
			humanSpy.mockRestore();
		}

		expect(humanOutput).toContain("Comp");
		expect(humanOutput).toContain("!");
	});
});

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeComplexity } from "../src/complexity";

const fixture = resolve("test/fixtures/sample/src/lib.ts");

describe("analyzeComplexity", () => {
	it("counts cyclomatic complexity", async () => {
		const result = await analyzeComplexity([fixture]);
		expect(result.length).toBeGreaterThan(0);

		const trivial = result.find((r) => r.function === "trivial");
		expect(trivial).toBeDefined();
		expect(trivial?.cyclomatic).toBe(1);
		expect(trivial?.endLine).toBeGreaterThan(trivial?.line);
		expect(trivial?.bodyHash).toBeTruthy();

		const moderate = result.find((r) => r.function === "moderate");
		expect(moderate).toBeDefined();
		expect(moderate?.cyclomatic).toBe(3); // 2 ifs + 1 base

		const crappy = result.find((r) => r.function === "crappy");
		expect(crappy).toBeDefined();
		expect(crappy?.cyclomatic).toBeGreaterThan(5);

		const arrow = result.find((r) => r.function === "arrowFunc");
		expect(arrow).toBeDefined();
		expect(arrow?.cyclomatic).toBe(2); // ternary + base

		const ignored = result.find((r) => r.function === "ignoredFunc");
		expect(ignored).toBeUndefined();
	});
});

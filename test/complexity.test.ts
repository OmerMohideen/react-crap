import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeComplexity } from "../src/complexity";

const fixture = resolve("test/fixtures/sample/src/lib.tsx");

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

	it("detects hooks and violations", async () => {
		const result = await analyzeComplexity([fixture]);
		const broken = result.find((r) => r.function === "BrokenHook");
		expect(broken).toBeDefined();
		expect(broken?.hooks).toContain("useState");
		expect(broken?.hooks).toContain("useEffect");
		expect(broken?.hookViolations.length).toBeGreaterThan(0);
		expect(broken?.hookViolations.some((v) => v.includes("useEffect"))).toBe(
			true,
		);

		const valid = result.find((r) => r.function === "ValidComponent");
		expect(valid?.hooks).toEqual([]);
		expect(valid?.hookViolations).toEqual([]);
	});

	it("tags components correctly", async () => {
		const result = await analyzeComplexity([fixture]);
		const valid = result.find((r) => r.function === "ValidComponent");
		expect(valid?.isComponent).toBe(true);
		const broken = result.find((r) => r.function === "BrokenHook");
		expect(broken?.isComponent).toBe(true);
		const trivial = result.find((r) => r.function === "trivial");
		expect(trivial?.isComponent).toBe(false);
	});

	it("counts render branches", async () => {
		const result = await analyzeComplexity([fixture]);
		const valid = result.find((r) => r.function === "ValidComponent");
		expect(valid?.renderBranches).toBe(1); // items.length > 0 && <ul>...</ul>
	});
});

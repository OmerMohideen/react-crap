import { describe, expect, it } from "vitest";
import { computeCrap, filter, score, sortEntries } from "../src/score";

describe("computeCrap", () => {
	it("returns low score for simple, covered code", () => {
		expect(computeCrap(1, 100, "pessimistic")).toBe(1);
	});

	it("returns high score for complex, uncovered code", () => {
		const result = computeCrap(12, 0, "pessimistic");
		expect(result).toBeGreaterThan(100);
	});

	it("handles missing coverage pessimistically", () => {
		expect(computeCrap(5, null, "pessimistic")).toBe(
			computeCrap(5, 0, "pessimistic"),
		);
	});

	it("handles missing coverage optimistically", () => {
		expect(computeCrap(5, null, "optimistic")).toBe(
			computeCrap(5, 100, "pessimistic"),
		);
	});

	it("skips when policy is skip", () => {
		expect(computeCrap(5, null, "skip")).toBeNull();
	});
});

describe("score", () => {
	it("sorts by CRAP descending", () => {
		const entries = [
			{ file: "a.ts", function: "a", line: 1, cyclomatic: 1, coverage: 100 },
			{ file: "a.ts", function: "b", line: 2, cyclomatic: 12, coverage: 0 },
		];
		const result = score(entries, { missing: "pessimistic", threshold: 30 });
		expect(result[0].function).toBe("b");
		expect(result[1].function).toBe("a");
	});
});

describe("sortEntries", () => {
	it("sorts by path then function ascending", () => {
		const entries = [
			{
				file: "b.ts",
				function: "b",
				line: 1,
				cyclomatic: 12,
				coverage: 0,
				crap: 100,
			},
			{
				file: "a.ts",
				function: "b",
				line: 2,
				cyclomatic: 1,
				coverage: 100,
				crap: 1,
			},
			{
				file: "a.ts",
				function: "a",
				line: 3,
				cyclomatic: 5,
				coverage: 50,
				crap: 20,
			},
		];
		const result = sortEntries(entries, "path,function");
		expect(result[0].function).toBe("a");
		expect(result[0].file).toBe("a.ts");
		expect(result[1].function).toBe("b");
		expect(result[1].file).toBe("a.ts");
		expect(result[2].function).toBe("b");
		expect(result[2].file).toBe("b.ts");
	});

	it("preserves CRAP order when sort is crap", () => {
		const entries = [
			{
				file: "a.ts",
				function: "a",
				line: 1,
				cyclomatic: 1,
				coverage: 100,
				crap: 1,
			},
			{
				file: "a.ts",
				function: "b",
				line: 2,
				cyclomatic: 12,
				coverage: 0,
				crap: 100,
			},
		];
		const result = sortEntries(entries, "crap");
		expect(result[0].crap).toBe(1);
		expect(result[1].crap).toBe(100);
	});

	it("sorts by file basename, ignoring directory", () => {
		const entries = [
			{
				file: "src/z/foo.ts",
				function: "a",
				line: 1,
				cyclomatic: 1,
				coverage: 100,
				crap: 1,
			},
			{
				file: "src/a/bar.ts",
				function: "b",
				line: 2,
				cyclomatic: 12,
				coverage: 0,
				crap: 100,
			},
		];
		const result = sortEntries(entries, "file");
		expect(result[0].file).toBe("src/a/bar.ts");
		expect(result[1].file).toBe("src/z/foo.ts");
	});

	it("sorts by function name", () => {
		const entries = [
			{
				file: "a.ts",
				function: "z",
				line: 1,
				cyclomatic: 1,
				coverage: 100,
				crap: 1,
			},
			{
				file: "a.ts",
				function: "a",
				line: 2,
				cyclomatic: 12,
				coverage: 0,
				crap: 100,
			},
		];
		const result = sortEntries(entries, "function");
		expect(result[0].function).toBe("a");
		expect(result[1].function).toBe("z");
	});

	it("sorts by comma-separated fields", () => {
		const entries = [
			{
				file: "b.ts",
				function: "a",
				line: 1,
				cyclomatic: 1,
				coverage: 100,
				crap: 1,
			},
			{
				file: "a.ts",
				function: "b",
				line: 2,
				cyclomatic: 12,
				coverage: 0,
				crap: 100,
			},
		];
		const result = sortEntries(entries, "function,file");
		expect(result[0].function).toBe("a");
		expect(result[1].function).toBe("b");
	});

	it("sorts by hooks count", () => {
		const entries = [
			{
				file: "a.ts",
				function: "a",
				line: 1,
				cyclomatic: 1,
				coverage: 100,
				crap: 1,
				hooks: ["useState"],
				hookViolations: [],
				isComponent: false,
				renderBranches: 0,
			},
			{
				file: "a.ts",
				function: "b",
				line: 1,
				cyclomatic: 1,
				coverage: 100,
				crap: 1,
				hooks: ["useState", "useEffect"],
				hookViolations: [],
				isComponent: false,
				renderBranches: 0,
			},
		];
		const result = sortEntries(entries, "hooks");
		expect(result[0].function).toBe("b");
	});
});

describe("filter", () => {
	it("filters by min and top", () => {
		const entries = [
			{
				file: "a.ts",
				function: "a",
				line: 1,
				cyclomatic: 1,
				coverage: 100,
				crap: 1,
			},
			{
				file: "a.ts",
				function: "b",
				line: 2,
				cyclomatic: 12,
				coverage: 0,
				crap: 100,
			},
			{
				file: "a.ts",
				function: "c",
				line: 3,
				cyclomatic: 5,
				coverage: 50,
				crap: 20,
			},
		];
		const result = filter(entries, { min: 10, top: 2 });
		expect(result).toHaveLength(2);
		expect(result[0].crap).toBe(100);
		expect(result[1].crap).toBe(20);
	});

	it("filters by max", () => {
		const entries = [
			{
				file: "a.ts",
				function: "b",
				line: 2,
				cyclomatic: 12,
				coverage: 0,
				crap: 100,
			},
			{
				file: "a.ts",
				function: "c",
				line: 3,
				cyclomatic: 5,
				coverage: 50,
				crap: 20,
			},
			{
				file: "a.ts",
				function: "a",
				line: 1,
				cyclomatic: 1,
				coverage: 100,
				crap: 1,
			},
		];
		const result = filter(entries, { max: 50 });
		expect(result).toHaveLength(2);
		expect(result[0].crap).toBe(20);
		expect(result[1].crap).toBe(1);
	});

	it("filters by onlyFailures", () => {
		const entries = [
			{
				file: "a.ts",
				function: "b",
				line: 2,
				cyclomatic: 12,
				coverage: 0,
				crap: 100,
			},
			{
				file: "a.ts",
				function: "c",
				line: 3,
				cyclomatic: 5,
				coverage: 50,
				crap: 20,
			},
			{
				file: "a.ts",
				function: "a",
				line: 1,
				cyclomatic: 1,
				coverage: 100,
				crap: 1,
			},
		];
		const result = filter(entries, { onlyFailures: true, threshold: 30 });
		expect(result).toHaveLength(1);
		expect(result[0].crap).toBe(100);
	});

	it("combines min, max, and top", () => {
		const entries = [
			{
				file: "a.ts",
				function: "b",
				line: 2,
				cyclomatic: 12,
				coverage: 0,
				crap: 100,
			},
			{
				file: "a.ts",
				function: "d",
				line: 4,
				cyclomatic: 6,
				coverage: 25,
				crap: 50,
			},
			{
				file: "a.ts",
				function: "c",
				line: 3,
				cyclomatic: 5,
				coverage: 50,
				crap: 20,
			},
			{
				file: "a.ts",
				function: "a",
				line: 1,
				cyclomatic: 1,
				coverage: 100,
				crap: 1,
			},
		];
		const result = filter(entries, { min: 10, max: 75, top: 2 });
		expect(result).toHaveLength(2);
		expect(result[0].crap).toBe(50);
		expect(result[1].crap).toBe(20);
	});

	it("uses componentThreshold for components", () => {
		const entries = [
			{
				file: "a.tsx",
				function: "Btn",
				line: 1,
				cyclomatic: 5,
				coverage: 0,
				crap: 30,
				isComponent: true,
				hooks: [],
				hookViolations: [],
				renderBranches: 0,
			},
			{
				file: "a.ts",
				function: "fmt",
				line: 1,
				cyclomatic: 5,
				coverage: 0,
				crap: 30,
				isComponent: false,
				hooks: [],
				hookViolations: [],
				renderBranches: 0,
			},
		];
		const result = filter(entries, {
			onlyFailures: true,
			threshold: 20,
			componentThreshold: 40,
		});
		expect(result.map((e) => e.function)).toEqual(["fmt"]);
	});
});

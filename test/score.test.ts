import { describe, expect, it } from "vitest";
import { computeCrap, filter, score } from "../src/score";

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
});

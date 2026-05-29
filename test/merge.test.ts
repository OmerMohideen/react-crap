import { describe, expect, it } from "vitest";
import { merge } from "../src/merge";

describe("merge", () => {
	it("joins coverage with complexity by file", () => {
		const complexity = [
			{
				file: "/project/src/lib.ts",
				function: "trivial",
				line: 1,
				cyclomatic: 1,
			},
			{
				file: "/project/src/lib.ts",
				function: "moderate",
				line: 5,
				cyclomatic: 3,
			},
		];
		const coverage = [
			{
				file: "src/lib.ts",
				functions: [
					{ function: "trivial", line: 1, hit: 1, found: 1 },
					{ function: "moderate", line: 5, hit: 1, found: 1 },
				],
			},
		];

		const result = merge(complexity, coverage, "/project");
		expect(result).toHaveLength(2);
		expect(result[0].coverage).toBe(100);
		expect(result[1].coverage).toBe(100);
	});

	it("handles missing coverage data", () => {
		const complexity = [
			{
				file: "/project/src/lib.ts",
				function: "untested",
				line: 10,
				cyclomatic: 5,
			},
		];
		const coverage: any[] = [];

		const result = merge(complexity, coverage, "/project");
		expect(result).toHaveLength(1);
		expect(result[0].coverage).toBeNull();
	});
});

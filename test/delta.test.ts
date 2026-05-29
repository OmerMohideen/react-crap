import { describe, expect, it } from "vitest";
import { computeDelta } from "../src/delta";

describe("computeDelta", () => {
	it("detects increased scores", () => {
		const baseline = [
			{
				file: "a.ts",
				function: "foo",
				line: 1,
				cyclomatic: 5,
				coverage: 80,
				crap: 10,
			},
		];
		const current = [
			{
				file: "a.ts",
				function: "foo",
				line: 1,
				cyclomatic: 5,
				coverage: 40,
				crap: 30,
			},
		];
		const result = computeDelta(current, baseline, 0.01);
		expect(result.entries[0].status).toBe("Increased");
		expect(result.entries[0].delta).toBe(20);
	});

	it("detects new functions", () => {
		const baseline: any[] = [];
		const current = [
			{
				file: "a.ts",
				function: "foo",
				line: 1,
				cyclomatic: 5,
				coverage: 80,
				crap: 10,
			},
		];
		const result = computeDelta(current, baseline, 0.01);
		expect(result.entries[0].status).toBe("New");
	});

	it("detects removed functions", () => {
		const baseline = [
			{
				file: "a.ts",
				function: "foo",
				line: 1,
				cyclomatic: 5,
				coverage: 80,
				crap: 10,
			},
		];
		const current: any[] = [];
		const result = computeDelta(current, baseline, 0.01);
		expect(result.removed).toHaveLength(1);
	});

	it("respects epsilon tolerance", () => {
		const baseline = [
			{
				file: "a.ts",
				function: "foo",
				line: 1,
				cyclomatic: 5,
				coverage: 80,
				crap: 10,
			},
		];
		const current = [
			{
				file: "a.ts",
				function: "foo",
				line: 1,
				cyclomatic: 5,
				coverage: 80,
				crap: 10.005,
			},
		];
		const result = computeDelta(current, baseline, 0.01);
		expect(result.entries[0].status).toBe("Unchanged");
	});
});

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ComplexityEntry } from "../src/complexity";
import { analyzeComplexity } from "../src/complexity";
import { findDuplicates } from "../src/duplicates";

function entry(part: Partial<ComplexityEntry>): ComplexityEntry {
	return {
		file: "a.ts",
		function: "fn",
		line: 1,
		endLine: 10,
		cyclomatic: 2,
		bodyHash: "h",
		structuralHash: "s",
		hooks: [],
		hookViolations: [],
		isComponent: false,
		renderBranches: 0,
		smells: [],
		...part,
	};
}

describe("findDuplicates", () => {
	it("groups functions with identical structural hashes", () => {
		const groups = findDuplicates([
			entry({ file: "a.ts", function: "foo", structuralHash: "x" }),
			entry({ file: "b.ts", function: "bar", structuralHash: "x" }),
			entry({ file: "c.ts", function: "baz", structuralHash: "y" }),
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].members).toHaveLength(2);
		expect(groups[0].hash).toBe("x");
	});

	it("ignores trivial functions below minLines", () => {
		const groups = findDuplicates([
			entry({ function: "foo", line: 1, endLine: 2, structuralHash: "x" }),
			entry({ function: "bar", line: 5, endLine: 6, structuralHash: "x" }),
		]);
		expect(groups).toHaveLength(0);
	});

	it("ignores straight-line functions below minCyclomatic", () => {
		const groups = findDuplicates([
			entry({ function: "foo", cyclomatic: 1, structuralHash: "x" }),
			entry({ function: "bar", cyclomatic: 1, structuralHash: "x" }),
		]);
		expect(groups).toHaveLength(0);
	});

	it("sorts most-copied groups first", () => {
		const groups = findDuplicates([
			entry({ structuralHash: "pair", function: "p1" }),
			entry({ structuralHash: "pair", function: "p2" }),
			entry({ structuralHash: "trio", function: "t1" }),
			entry({ structuralHash: "trio", function: "t2" }),
			entry({ structuralHash: "trio", function: "t3" }),
		]);
		expect(groups[0].hash).toBe("trio");
		expect(groups[0].members).toHaveLength(3);
	});
});

describe("structural detection (formatting-insensitive)", () => {
	const fixture = resolve("test/fixtures/duplicates/clones.tsx");

	it("matches reformatted copy-paste, ignores whitespace/comments", async () => {
		const result = await analyzeComplexity([fixture]);
		const a = result.find((r) => r.function === "UserCard");
		const b = result.find((r) => r.function === "UserCardCopy");
		expect(a?.structuralHash).toBeTruthy();
		expect(a?.structuralHash).toBe(b?.structuralHash); // same code, reformatted
		expect(a?.bodyHash).not.toBe(b?.bodyHash); // raw text differs
	});

	it("does NOT match functions differing only by a literal", async () => {
		const result = await analyzeComplexity([fixture]);
		const a = result.find((r) => r.function === "UserCard");
		const panel = result.find((r) => r.function === "PanelCard");
		expect(a?.structuralHash).not.toBe(panel?.structuralHash);
	});
});

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeArchitecture } from "../src/arch";

const f = (p: string) => resolve("test/fixtures/arch", p);

describe("analyzeArchitecture", () => {
	it("detects a circular import between two files", async () => {
		const result = await analyzeArchitecture([
			f("a.ts"),
			f("b.ts"),
			f("clean.ts"),
		]);
		expect(result.cycles).toHaveLength(1);
		const names = result.cycles[0].map((p) => p.split("/").pop());
		expect(new Set(names)).toEqual(new Set(["a.ts", "b.ts"]));
	});

	it("flags a re-export-only index file as a bloated barrel", async () => {
		const result = await analyzeArchitecture([f("pkg/index.ts")]);
		expect(result.barrels).toHaveLength(1);
		expect(result.barrels[0].reexports).toBe(15);
		expect(result.barrels[0].file).toContain("pkg/index.ts");
	});

	it("reports nothing for an acyclic non-barrel set", async () => {
		const result = await analyzeArchitecture([f("clean.ts")]);
		expect(result.cycles).toEqual([]);
		expect(result.barrels).toEqual([]);
	});
});

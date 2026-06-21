import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findDeadImports, formatDeadCodeGithub } from "../src/deadcode";

const fixture = resolve("test/fixtures/deadcode/unused.ts");

describe("findDeadImports", () => {
	it("reports imports that are never referenced", async () => {
		const dead = await findDeadImports([fixture]);
		const names = dead.map((d) => d.name).sort();
		expect(names).toEqual(["join", "writeFileSync"]);
	});

	it("does not flag used imports", async () => {
		const dead = await findDeadImports([fixture]);
		const names = new Set(dead.map((d) => d.name));
		expect(names.has("readFileSync")).toBe(false);
		expect(names.has("resolve")).toBe(false);
	});

	it("emits GitHub annotations with relative paths", async () => {
		const dead = await findDeadImports([fixture]);
		const gh = formatDeadCodeGithub(dead);
		expect(gh).toMatch(
			/^::warning file=test\/fixtures\/deadcode\/unused\.ts,/m,
		);
		expect(gh).toContain("title=react-crap/dead-code");
		expect(gh).not.toContain("\\"); // forward slashes only
	});
});

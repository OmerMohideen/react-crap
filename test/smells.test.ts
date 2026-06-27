import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ComplexityEntry, SmellKind } from "../src/complexity";
import { analyzeComplexity } from "../src/complexity";
import { collectSmells, countByKind } from "../src/smells";

const fixture = resolve("test/fixtures/smells/slop.tsx");

async function kindsFor(fn: string): Promise<Set<SmellKind>> {
	const result = await analyzeComplexity([fixture]);
	const e = result.find((r: ComplexityEntry) => r.function === fn);
	return new Set((e?.smells ?? []).map((s) => s.kind));
}

describe("detectSmells", () => {
	it("flags useEffect with no dependency array", async () => {
		expect(await kindsFor("NoDeps")).toContain("effect-missing-deps");
	});

	it("flags effect that subscribes without cleanup", async () => {
		expect(await kindsFor("NoCleanup")).toContain("effect-missing-cleanup");
	});

	it("flags effect that only calls setState", async () => {
		expect(await kindsFor("DerivedState")).toContain("effect-derived-state");
	});

	it("flags unstable inline props, type escapes, console, todo, index key", async () => {
		// Some smells live in inline callbacks (separate entries), so check the
		// whole file rather than one function.
		const result = await analyzeComplexity([fixture]);
		const all = new Set(result.flatMap((r) => r.smells.map((s) => s.kind)));
		expect(all).toContain("unstable-prop"); // style={{}} and onClick={() =>}
		expect(all).toContain("as-any");
		expect(all).toContain("non-null-assertion"); // item!
		expect(all).toContain("console");
		expect(all).toContain("todo");
		expect(all).toContain("index-as-key"); // key={i}
	});

	it("collectSmells filters by kind", async () => {
		const result = await analyzeComplexity([fixture]);
		const onlyConsole = collectSmells(result, ["console"]);
		const kinds = new Set(
			onlyConsole.flatMap((r) => r.smells.map((s) => s.kind)),
		);
		expect(kinds).toEqual(new Set(["console"]));
		expect(countByKind(onlyConsole).console).toBeGreaterThan(0);
	});

	it("clean functions report no smells", async () => {
		const result = await analyzeComplexity([fixture]);
		const doThing = result.find((r) => r.function === "doThing");
		expect(doThing?.smells).toEqual([]);
	});
});

describe("passthrough + test-no-assert", () => {
	it("flags a component that only spreads props", async () => {
		const f = resolve("test/fixtures/smells/extra.tsx");
		const result = await analyzeComplexity([f]);
		const w = result.find((r) => r.function === "Wrapper");
		expect(new Set((w?.smells ?? []).map((s) => s.kind))).toContain(
			"passthrough-wrapper",
		);
	});

	it("flags perf/best-practice/security kinds, but not a top-level component", async () => {
		const f = resolve("test/fixtures/smells/perf-sec.tsx");
		const result = await analyzeComplexity([f]);
		const all = new Set(result.flatMap((r) => r.smells.map((s) => s.kind)));
		expect(all).toContain("component-in-render");
		expect(all).toContain("var-keyword");
		expect(all).toContain("loose-equality");
		expect(all).toContain("eval-usage");
		expect(all).toContain("dangerous-html");

		// The nested Child is flagged on its parent; the standalone Sibling isn't.
		const flaggedNames = result
			.filter((r) => r.smells.some((s) => s.kind === "component-in-render"))
			.map((r) => r.function);
		expect(flaggedNames).toContain("Parent");
		expect(flaggedNames).not.toContain("Sibling");
	});

	it("flags an it() with no expect, but not one with expect", async () => {
		const f = resolve("test/fixtures/smells/faketests.test.tsx");
		const result = await analyzeComplexity([f]);
		const noAssert = result.filter((r) =>
			r.smells.some((s) => s.kind === "test-no-assert"),
		);
		expect(noAssert).toHaveLength(1);
	});

	it("test-no-assert does not fire in non-test files", async () => {
		const result = await analyzeComplexity([fixture]);
		const any = result.some((r) =>
			r.smells.some((s) => s.kind === "test-no-assert"),
		);
		expect(any).toBe(false);
	});
});

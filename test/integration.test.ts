import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index";

describe("integration", () => {
	it("runs end-to-end on fixture", async () => {
		const fixturePath = resolve("test/fixtures/sample");
		const lcovPath = resolve(fixturePath, "coverage/lcov.info");

		// Just verify it doesn't throw and produces output
		await expect(
			run({
				lcov: lcovPath,
				path: resolve(fixturePath, "src"),
				threshold: 30,
				missing: "pessimistic",
				exclude: [],
				allow: [],
				format: "json",
				summary: false,
				failAbove: false,
				failRegression: false,
				epsilon: 0.01,
			}),
		).resolves.toBeUndefined();
	});
});

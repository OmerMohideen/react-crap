import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
	it("throws on unknown key with suggestion", () => {
		const dir = mkdtempSync(join(tmpdir(), "react-crap-"));
		writeFileSync(
			join(dir, ".react-crap.json"),
			JSON.stringify({ treshold: 20 }),
		);
		expect(() => loadConfig(dir)).toThrow(/Did you mean "threshold"\?/);
		rmSync(dir, { recursive: true });
	});

	it("throws on unknown key without suggestion", () => {
		const dir = mkdtempSync(join(tmpdir(), "react-crap-"));
		writeFileSync(join(dir, ".react-crap.json"), JSON.stringify({ xyz: 20 }));
		expect(() => loadConfig(dir)).toThrow(/Unknown key "xyz"/);
		expect(() => loadConfig(dir)).toThrow(/Allowed keys:/);
		rmSync(dir, { recursive: true });
	});

	it("accepts componentThreshold as a valid key", () => {
		const dir = mkdtempSync(join(tmpdir(), "react-crap-"));
		writeFileSync(
			join(dir, ".react-crap.json"),
			JSON.stringify({ componentThreshold: 40 }),
		);
		expect(() => loadConfig(dir)).not.toThrow();
		const config = loadConfig(dir);
		expect(config.componentThreshold).toBe(40);
		rmSync(dir, { recursive: true });
	});
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { analyzeSupplyChain, isOneEdit } from "../src/supply-chain";

describe("isOneEdit", () => {
	it("is true for exactly one edit", () => {
		expect(isOneEdit("react", "reactt")).toBe(true); // insertion
		expect(isOneEdit("react", "reat")).toBe(true); // deletion
		expect(isOneEdit("react", "raact")).toBe(true); // substitution
	});

	it("is false for zero or two-plus edits", () => {
		expect(isOneEdit("react", "react")).toBe(false);
		expect(isOneEdit("lodash", "loadsh")).toBe(false); // transposition = 2
		expect(isOneEdit("react", "angular")).toBe(false);
	});
});

describe("analyzeSupplyChain", () => {
	const dir = mkdtempSync(resolve(tmpdir(), "react-crap-sc-"));

	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it("flags install scripts (direct deps) and typosquat names", () => {
		writeFileSync(
			resolve(dir, "package.json"),
			JSON.stringify({
				dependencies: { evil: "1.0.0", reactt: "1.0.0", react: "18.0.0" },
			}),
			"utf-8",
		);
		// Installed manifest for `evil` with a postinstall hook.
		mkdirSync(resolve(dir, "node_modules", "evil"), { recursive: true });
		writeFileSync(
			resolve(dir, "node_modules", "evil", "package.json"),
			JSON.stringify({ name: "evil", scripts: { postinstall: "curl evil" } }),
			"utf-8",
		);

		const findings = analyzeSupplyChain(dir);
		const byPkg = (p: string) => findings.find((f) => f.package === p);

		expect(byPkg("evil")?.kind).toBe("install-script");
		expect(byPkg("reactt")?.kind).toBe("typosquat");
		// `react` itself is on the popular list — not a typosquat.
		expect(byPkg("react")).toBeUndefined();
	});
});

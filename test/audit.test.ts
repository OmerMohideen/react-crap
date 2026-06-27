import { describe, expect, it } from "vitest";
import { parseAuditJson } from "../src/audit";

// Sample shaped like `npm audit --json` v2 output (npm 7+).
const SAMPLE = JSON.stringify({
	vulnerabilities: {
		lodash: {
			name: "lodash",
			severity: "high",
			range: "<4.17.21",
			fixAvailable: true,
			via: [
				{
					title: "Prototype Pollution in lodash",
					url: "https://github.com/advisories/GHSA-xxxx",
					severity: "high",
				},
			],
		},
		minimist: {
			name: "minimist",
			severity: "low",
			range: "<1.2.6",
			// Transitive: via is a bare package name, no advisory object.
			via: ["lodash"],
			fixAvailable: { name: "minimist", version: "1.2.6" },
		},
	},
});

describe("parseAuditJson", () => {
	it("extracts vulnerabilities, sorted worst-first", () => {
		const vulns = parseAuditJson(SAMPLE);
		expect(vulns.map((v) => v.name)).toEqual(["lodash", "minimist"]);
		expect(vulns[0].title).toBe("Prototype Pollution in lodash");
		expect(vulns[0].url).toBe("https://github.com/advisories/GHSA-xxxx");
		expect(vulns[0].fixAvailable).toBe(true);
	});

	it("handles transitive entries with no advisory object", () => {
		const minimist = parseAuditJson(SAMPLE).find((v) => v.name === "minimist");
		expect(minimist?.title).toBe("vulnerable via lodash");
		expect(minimist?.fixAvailable).toBe(true); // object form counts as fixable
	});

	it("returns [] for malformed or empty input", () => {
		expect(parseAuditJson("not json")).toEqual([]);
		expect(parseAuditJson("{}")).toEqual([]);
		expect(parseAuditJson(JSON.stringify({ vulnerabilities: {} }))).toEqual([]);
	});
});

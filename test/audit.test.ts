import { describe, expect, it } from "vitest";
import { parseAuditJson, parsePnpmAudit, parseYarnAudit } from "../src/audit";

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

describe("parsePnpmAudit", () => {
	const SAMPLE = JSON.stringify({
		advisories: {
			"1065": {
				module_name: "lodash",
				severity: "high",
				title: "Prototype Pollution",
				url: "https://github.com/advisories/GHSA-x",
				vulnerable_versions: "<4.17.21",
				patched_versions: ">=4.17.21",
			},
		},
		metadata: {},
	});

	it("maps the advisories map to vulns", () => {
		const v = parsePnpmAudit(SAMPLE);
		expect(v).toHaveLength(1);
		expect(v[0].name).toBe("lodash");
		expect(v[0].severity).toBe("high");
		expect(v[0].fixAvailable).toBe(true);
		expect(v[0].range).toBe("<4.17.21");
	});

	it("returns [] for malformed input", () => {
		expect(parsePnpmAudit("nope")).toEqual([]);
		expect(parsePnpmAudit("{}")).toEqual([]);
	});
});

describe("parseYarnAudit", () => {
	const line = (advisory: any) =>
		JSON.stringify({ type: "auditAdvisory", data: { advisory } });
	const NDJSON = [
		JSON.stringify({ type: "auditSummary", data: {} }),
		line({
			module_name: "minimist",
			severity: "low",
			title: "Prototype Pollution",
			vulnerable_versions: "<1.2.6",
			patched_versions: ">=1.2.6",
		}),
		// duplicate advisory (different dependency path) — should dedupe
		line({
			module_name: "minimist",
			severity: "low",
			title: "Prototype Pollution",
			vulnerable_versions: "<1.2.6",
			patched_versions: ">=1.2.6",
		}),
	].join("\n");

	it("extracts auditAdvisory lines and dedupes", () => {
		const v = parseYarnAudit(NDJSON);
		expect(v).toHaveLength(1);
		expect(v[0].name).toBe("minimist");
		expect(v[0].fixAvailable).toBe(true);
	});

	it("ignores non-advisory lines and junk", () => {
		expect(parseYarnAudit("not json\n{}\n")).toEqual([]);
	});
});

import type { ScoredEntry } from "../score.js";

export function formatSarif(
	entries: ScoredEntry[],
	threshold: number,
	toolVersion: string,
): string {
	const crapResults = entries
		.filter((e) => e.crap > (e.threshold ?? threshold))
		.map((e) => ({
			ruleId: "CRAP",
			level: "warning",
			message: {
				text: `Function ${e.function} has CRAP score ${e.crap.toFixed(1)} (threshold: ${e.threshold ?? threshold})`,
			},
			locations: [
				{
					physicalLocation: {
						artifactLocation: { uri: e.file },
						region: { startLine: e.line },
					},
				},
			],
		}));

	const hookViolationResults = entries
		.filter((e) => e.hookViolations?.length > 0)
		.map((e) => ({
			ruleId: "React-Hook-Violation",
			level: "error",
			message: {
				text: `Function ${e.function} has hook violations: ${e.hookViolations.join(", ")}`,
			},
			locations: [
				{
					physicalLocation: {
						artifactLocation: { uri: e.file },
						region: { startLine: e.line },
					},
				},
			],
		}));

	const results = [...crapResults, ...hookViolationResults];

	return JSON.stringify(
		{
			$schema:
				"https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
			version: "2.1.0",
			runs: [
				{
					tool: {
						driver: {
							name: "react-crap",
							version: toolVersion,
							informationUri: "https://github.com/OmerMohideen/react-crap",
							rules: [
								{
									id: "CRAP",
									name: "HighCRAPScore",
									shortDescription: { text: "Function has high CRAP score" },
									fullDescription: {
										text: "CRAP (Change Risk Anti-Patterns) score combines cyclomatic complexity and coverage.",
									},
									defaultConfiguration: { level: "warning" },
								},
								{
									id: "React-Hook-Violation",
									name: "ReactHookViolation",
									shortDescription: { text: "React Hook called conditionally" },
									fullDescription: {
										text: "React Hooks must be called in the exact same order in every component render.",
									},
									defaultConfiguration: { level: "error" },
								},
							],
						},
					},
					results,
				},
			],
		},
		null,
		2,
	);
}

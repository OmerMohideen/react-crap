import type { ScoredEntry } from "../score";

export function formatSarif(
	entries: ScoredEntry[],
	threshold: number,
	toolVersion: string,
): string {
	const results = entries
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

import type { DeltaResult } from "../delta";
import type { ScoredEntry } from "../score";

export function formatJson(entries: ScoredEntry[], version: string): string {
	return JSON.stringify(
		{
			$schema:
				"https://raw.githubusercontent.com/OmerMohideen/react-crap/master/schemas/report-v1.json",
			version,
			entries,
		},
		null,
		2,
	);
}

export function formatDeltaJson(result: DeltaResult, version: string): string {
	return JSON.stringify(
		{
			$schema:
				"https://raw.githubusercontent.com/OmerMohideen/react-crap/master/schemas/delta-v2.json",
			version,
			entries: result.entries,
			removed: result.removed,
		},
		null,
		2,
	);
}

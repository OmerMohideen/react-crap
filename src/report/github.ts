import type { ScoredEntry } from "../score.js";

export function formatGithub(
	entries: ScoredEntry[],
	threshold: number,
): string {
	const lines: string[] = [];
	for (const e of entries) {
		const t = e.threshold ?? threshold;
		if (e.hookViolations?.length > 0) {
			lines.push(
				`::error file=${e.file},line=${e.line}::${e.function} has hook violations: ${e.hookViolations.join(", ")}`,
			);
		} else if (e.crap > t) {
			lines.push(
				`::warning file=${e.file},line=${e.line}::${e.function} has CRAP score ${e.crap.toFixed(1)} (threshold: ${t})`,
			);
		}
	}
	return lines.join("\n");
}

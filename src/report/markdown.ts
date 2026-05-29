import type { ScoredEntry } from "../score";

export function formatMarkdown(
	entries: ScoredEntry[],
	threshold: number,
): string {
	const lines: string[] = [];
	lines.push("| Status | CRAP | CC | Coverage | Function | Location |");
	lines.push("|--------|------|----|----------|----------|----------|");

	for (const e of entries) {
		const t = e.threshold ?? threshold;
		const status = e.crap > t ? "✗" : e.crap > t / 2 ? "▲" : "✓";
		const cov = e.coverage === null ? "N/A" : `${e.coverage.toFixed(1)}%`;
		lines.push(
			`| ${status} | ${e.crap.toFixed(1)} | ${e.cyclomatic} | ${cov} | \`${e.function}\` | ${e.file}:${e.line} |`,
		);
	}

	return lines.join("\n");
}

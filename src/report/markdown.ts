import type { ScoredEntry } from "../score.js";

export function formatMarkdown(
	entries: ScoredEntry[],
	threshold: number,
): string {
	const lines: string[] = [];
	lines.push(
		"| Status | CRAP | CC | Coverage | Type | Hooks | RB | Function | Location |",
	);
	lines.push(
		"|--------|------|----|----------|------|-------|----|----------|----------|",
	);

	for (const e of entries) {
		const t = e.threshold ?? threshold;
		const status =
			e.hookViolations?.length > 0
				? "!"
				: e.crap > t
					? "✗"
					: e.crap > t / 2
						? "▲"
						: "✓";
		const cov = e.coverage === null ? "N/A" : `${e.coverage.toFixed(1)}%`;
		const type = e.isComponent ? "Comp" : "Util";
		const hooks = e.hooks?.length ? e.hooks.join(",") : "-";
		const rb = e.renderBranches ? String(e.renderBranches) : "-";
		lines.push(
			`| ${status} | ${e.crap.toFixed(1)} | ${e.cyclomatic} | ${cov} | ${type} | ${hooks} | ${rb} | \`${e.function}\` | ${e.file}:${e.line} |`,
		);
	}

	const violations = entries.filter((e) => e.hookViolations?.length > 0);
	if (violations.length > 0) {
		lines.push("");
		lines.push("**⚠️ Hook Violations**");
		lines.push("");
		for (const e of violations) {
			lines.push(
				`- \`${e.function}\` at ${e.file}:${e.line}: ${e.hookViolations.join(", ")}`,
			);
		}
	}

	return lines.join("\n");
}

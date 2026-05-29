import type { DeltaResult } from "../delta";

export function formatPrComment(
	result: DeltaResult,
	threshold: number,
): string {
	const marker = "<!-- react-crap-report -->";
	const lines: string[] = [marker];

	lines.push("## CRAP Report\n");

	// Primary table: regressions and new
	const regressions = result.entries.filter(
		(e) => e.status === "Increased" || e.status === "New",
	);
	if (regressions.length > 0) {
		lines.push("### ⚠️ Regressions & New Functions\n");
		lines.push("| Status | CRAP | Δ | CC | Coverage | Function | Location |");
		lines.push("|--------|------|---|----|----------|----------|----------|");
		for (const e of regressions) {
			const cov = e.coverage === null ? "N/A" : `${e.coverage.toFixed(1)}%`;
			const deltaStr =
				e.delta > 0 ? `+${e.delta.toFixed(1)}` : e.delta.toFixed(1);
			lines.push(
				`| ${e.status} | ${e.crap.toFixed(1)} | ${deltaStr} | ${e.cyclomatic} | ${cov} | \`${e.function}\` | ${e.file}:${e.line} |`,
			);
		}
		lines.push("");
	}

	// Moved functions
	const moved = result.entries.filter((e) => e.status === "Moved");
	if (moved.length > 0) {
		lines.push("<details>");
		lines.push("<summary>Moved Functions</summary>\n");
		for (const e of moved) {
			lines.push(
				`- \`${e.function}\` moved from ${e.previous_file} to ${e.file}:${e.line}`,
			);
		}
		lines.push("</details>\n");
	}

	// Removed functions
	if (result.removed.length > 0) {
		lines.push("<details>");
		lines.push("<summary>Removed Functions</summary>\n");
		for (const r of result.removed) {
			lines.push(
				`- \`${r.function}\` from ${r.file} (baseline CRAP: ${r.baseline_crap.toFixed(1)})`,
			);
		}
		lines.push("</details>\n");
	}

	// Improvements
	const improved = result.entries.filter((e) => e.status === "Decreased");
	if (improved.length > 0) {
		lines.push("<details>");
		lines.push("<summary>Improvements</summary>\n");
		lines.push("| CRAP | Δ | Function | Location |");
		lines.push("|------|---|----------|----------|");
		for (const e of improved) {
			lines.push(
				`| ${e.crap.toFixed(1)} | ${e.delta.toFixed(1)} | \`${e.function}\` | ${e.file}:${e.line} |`,
			);
		}
		lines.push("</details>\n");
	}

	// Threshold violations
	const violations = result.entries.filter((e) => e.crap > threshold);
	if (violations.length > 0) {
		lines.push(
			`**${violations.length} function(s) exceed CRAP threshold ${threshold}.**`,
		);
	} else {
		lines.push(`**All functions are below CRAP threshold ${threshold}.**`);
	}

	return lines.join("\n");
}

export interface ScoredEntry {
	file: string;
	function: string;
	line: number;
	cyclomatic: number;
	coverage: number | null;
	crap: number;
	threshold?: number;
}

export function computeCrap(
	cyclomatic: number,
	coverage: number | null,
	missing: "pessimistic" | "optimistic" | "skip",
): number | null {
	if (coverage === null) {
		if (missing === "skip") return null;
		coverage = missing === "optimistic" ? 100 : 0;
	}

	const comp = cyclomatic;
	const cov = coverage;
	return comp * comp * (1 - cov / 100) ** 3 + comp;
}

export function score(
	entries: {
		file: string;
		function: string;
		line: number;
		cyclomatic: number;
		coverage: number | null;
		threshold?: number;
	}[],
	options: {
		missing: "pessimistic" | "optimistic" | "skip";
		threshold: number;
	},
): ScoredEntry[] {
	const scored: ScoredEntry[] = [];

	for (const e of entries) {
		const crap = computeCrap(e.cyclomatic, e.coverage, options.missing);
		if (crap === null) continue;
		scored.push({
			file: e.file,
			function: e.function,
			line: e.line,
			cyclomatic: e.cyclomatic,
			coverage: e.coverage,
			crap,
			threshold: e.threshold,
		});
	}

	// Sort by CRAP descending
	scored.sort((a, b) => b.crap - a.crap);
	return scored;
}

export function filter(
	entries: ScoredEntry[],
	options: {
		min?: number;
		max?: number;
		top?: number;
		onlyFailures?: boolean;
		threshold?: number;
	},
): ScoredEntry[] {
	let result = entries;

	if (options.min !== undefined) {
		result = result.filter((e) => e.crap >= options.min!);
	}

	if (options.max !== undefined) {
		result = result.filter((e) => e.crap <= options.max!);
	}

	if (options.onlyFailures) {
		result = result.filter((e) => e.crap > (options.threshold ?? 30));
	}

	if (options.top !== undefined) {
		result = result.slice(0, options.top);
	}

	return result;
}

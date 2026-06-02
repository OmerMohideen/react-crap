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

	// Always sort by CRAP descending so filters like --top work consistently
	scored.sort((a, b) => b.crap - a.crap);
	return scored;
}

function basename(path: string): string {
	const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return idx >= 0 ? path.slice(idx + 1) : path;
}

type SortField =
	| "crap"
	| "cc"
	| "cyclomatic"
	| "coverage"
	| "path"
	| "file"
	| "name"
	| "function"
	| "line";

function compareField(
	a: ScoredEntry,
	b: ScoredEntry,
	field: SortField,
): number {
	switch (field) {
		case "crap":
			return b.crap - a.crap; // descending
		case "cc":
		case "cyclomatic":
			return b.cyclomatic - a.cyclomatic; // descending
		case "coverage": {
			const covA = a.coverage ?? -1;
			const covB = b.coverage ?? -1;
			return covB - covA; // descending
		}
		case "path":
			return a.file.localeCompare(b.file);
		case "file":
		case "name": {
			const baseA = basename(a.file);
			const baseB = basename(b.file);
			return baseA.localeCompare(baseB);
		}
		case "function":
			return a.function.localeCompare(b.function);
		case "line":
			return a.line - b.line;
		default:
			return 0;
	}
}

function parseSort(sort: string): SortField[] {
	const parts = sort.split(",").map((s) => s.trim().toLowerCase() as SortField);
	// default to "crap" if empty or invalid
	if (parts.length === 0 || parts.every((p) => !p)) {
		return ["crap"];
	}
	return parts;
}

export function sortEntries(
	entries: ScoredEntry[],
	sort: string = "crap",
): ScoredEntry[] {
	const fields = parseSort(sort);
	if (fields.length === 1 && (fields[0] === "crap" || !fields[0])) {
		return entries;
	}
	return [...entries].sort((a, b) => {
		for (const field of fields) {
			const cmp = compareField(a, b, field);
			if (cmp !== 0) return cmp;
		}
		return 0;
	});
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

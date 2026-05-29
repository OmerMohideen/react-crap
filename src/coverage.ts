export interface CoverageEntry {
	file: string;
	function: string;
	line: number;
	hit: number;
	found: number;
}

export interface CoverageData {
	file: string;
	functions: CoverageEntry[];
	lines: Map<number, number>;
}

export function parseLcov(content: string): CoverageData[] {
	const records: CoverageData[] = [];
	const lines = content.split(/\r?\n/);

	let current: CoverageData | null = null;
	const fnMap = new Map<number, string>();

	for (const line of lines) {
		if (line.startsWith("TN:")) continue;
		if (line.startsWith("SF:")) {
			current = {
				file: line.slice(3),
				functions: [],
				lines: new Map(),
			};
			fnMap.clear();
		} else if (line.startsWith("FN:") && current) {
			const [, rest] = line.split(":", 2);
			const [lineNumStr, name] = rest.split(",", 2);
			fnMap.set(parseInt(lineNumStr, 10), name);
		} else if (line.startsWith("FNDA:") && current) {
			const [, rest] = line.split(":", 2);
			const [hitStr, name] = rest.split(",", 2);
			const lineNum = findLineByName(fnMap, name);
			const existing = current.functions.find((f) => f.function === name);
			if (existing) {
				existing.hit += parseInt(hitStr, 10);
			} else {
				current.functions.push({
					file: current.file,
					function: name,
					line: lineNum ?? 0,
					hit: parseInt(hitStr, 10),
					found: 1,
				});
			}
		} else if (line.startsWith("DA:") && current) {
			const [, rest] = line.split(":", 2);
			const [lineNumStr, hitStr] = rest.split(",", 2);
			current.lines.set(parseInt(lineNumStr, 10), parseInt(hitStr, 10));
		} else if (line === "end_of_record" && current) {
			records.push(current);
			current = null;
		}
	}

	return records;
}

function findLineByName(
	fnMap: Map<number, string>,
	name: string,
): number | undefined {
	for (const [line, fnName] of fnMap.entries()) {
		if (fnName === name) return line;
	}
	return undefined;
}

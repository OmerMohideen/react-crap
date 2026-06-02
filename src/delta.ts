import { readFileSync } from "node:fs";

export interface BaselineEntry {
	file: string;
	function: string;
	line: number;
	cyclomatic: number;
	coverage: number | null;
	crap: number;
	bodyHash?: string;
	hooks: string[];
	hookViolations: string[];
	isComponent: boolean;
	renderBranches: number;
}

export interface DeltaEntry extends BaselineEntry {
	baseline_crap: number;
	delta: number;
	status: "New" | "Increased" | "Decreased" | "Unchanged" | "Moved";
	previous_file?: string;
}

export interface DeltaResult {
	entries: DeltaEntry[];
	removed: { file: string; function: string; baseline_crap: number }[];
}

export function loadBaseline(path: string): BaselineEntry[] {
	const raw = readFileSync(path, "utf-8");
	const parsed = JSON.parse(raw);
	return parsed.entries ?? parsed; // Support both envelope and bare array
}

export function computeDelta(
	current: BaselineEntry[],
	baseline: BaselineEntry[],
	epsilon: number,
): DeltaResult {
	const baselineMap = new Map<string, BaselineEntry>();
	for (const b of baseline) {
		baselineMap.set(key(b), b);
	}

	const currentMap = new Map<string, BaselineEntry>();
	for (const c of current) {
		currentMap.set(key(c), c);
	}

	const entries: DeltaEntry[] = [];
	const removed: { file: string; function: string; baseline_crap: number }[] =
		[];

	// Check current against baseline
	for (const c of current) {
		const k = key(c);
		const b = baselineMap.get(k);

		if (b) {
			const delta = c.crap - b.crap;
			let status: DeltaEntry["status"] = "Unchanged";
			if (Math.abs(delta) > epsilon) {
				status = delta > 0 ? "Increased" : "Decreased";
			}
			entries.push({ ...c, baseline_crap: b.crap, delta, status });
		} else {
			// Check if moved (same body hash or same function + cyclomatic)
			const moved = baseline.find((bb) => {
				if (bb.file === c.file) return false;
				if (c.bodyHash && bb.bodyHash) {
					return c.bodyHash === bb.bodyHash;
				}
				return bb.function === c.function && bb.cyclomatic === c.cyclomatic;
			});
			if (moved) {
				entries.push({
					...c,
					baseline_crap: moved.crap,
					delta: c.crap - moved.crap,
					status: "Moved",
					previous_file: moved.file,
				});
			} else {
				entries.push({
					...c,
					baseline_crap: 0,
					delta: c.crap,
					status: "New",
				});
			}
		}
	}

	// Check removed
	for (const b of baseline) {
		const k = key(b);
		if (!currentMap.has(k)) {
			// Not moved already handled above
			const stillExists = entries.some((e) => {
				if (e.status !== "Moved") return false;
				if (e.bodyHash && b.bodyHash) return e.bodyHash === b.bodyHash;
				return e.function === b.function && e.cyclomatic === b.cyclomatic;
			});
			if (!stillExists) {
				removed.push({
					file: b.file,
					function: b.function,
					baseline_crap: b.crap,
				});
			}
		}
	}

	// Sort: Increased/New first, then by delta desc
	entries.sort((a, b) => {
		const order: Record<string, number> = {
			Increased: 0,
			New: 1,
			Moved: 2,
			Unchanged: 3,
			Decreased: 4,
		};
		if (order[a.status] !== order[b.status])
			return order[a.status] - order[b.status];
		return b.delta - a.delta;
	});

	return { entries, removed };
}

function key(e: BaselineEntry): string {
	return `${e.file}::${e.function}::${e.line}`;
}

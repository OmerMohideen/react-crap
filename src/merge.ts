import { isAbsolute, normalize } from "node:path";
import type { ComplexityEntry } from "./complexity.js";

export interface MergedEntry {
	file: string;
	function: string;
	line: number;
	cyclomatic: number;
	coverage: number | null;
	threshold?: number;
	hooks: string[];
	hookViolations: string[];
	isComponent: boolean;
	renderBranches: number;
}

export function merge(
	complexity: ComplexityEntry[],
	coverage: {
		file: string;
		functions: { function: string; line: number; hit: number; found: number }[];
		lines: Map<number, number>;
	}[],
	_sourceRoot: string,
): MergedEntry[] {
	const results: MergedEntry[] = [];

	const absoluteMap = new Map<string, (typeof coverage)[0]>();
	const suffixMap = new Map<string, (typeof coverage)[0]>();

	for (const cov of coverage) {
		const normalized = normalizePath(cov.file);
		if (isAbsolute(normalized)) {
			absoluteMap.set(normalized, cov);
		} else {
			const parts = normalized.split(/[\\/]/);
			suffixMap.set(parts.join("/"), cov);
		}
	}

	for (const comp of complexity) {
		const compPath = normalizePath(comp.file);
		const covData = findCoverage(compPath, absoluteMap, suffixMap);

		let covPct: number | null = null;
		if (covData) {
			// Try line-level coverage first for accuracy
			covPct = computeLineCoverage(comp, covData);

			// Fall back to function-level binary coverage if no DA lines in range
			if (covPct === null) {
				const fn = covData.functions.find(
					(f: any) => f.function === comp.function || f.line === comp.line,
				);
				if (fn) {
					covPct = fn.hit > 0 ? 100 : 0;
				}
			}
		}

		results.push({
			file: comp.file,
			function: comp.function,
			line: comp.line,
			cyclomatic: comp.cyclomatic,
			coverage: covPct,
			threshold: comp.threshold,
			hooks: comp.hooks,
			hookViolations: comp.hookViolations,
			isComponent: comp.isComponent,
			renderBranches: comp.renderBranches,
		});
	}

	return results;
}

function computeLineCoverage(
	comp: ComplexityEntry,
	covData: { lines: Map<number, number> },
): number | null {
	if (comp.endLine <= comp.line) return null;

	let totalLines = 0;
	let hitLines = 0;

	for (let line = comp.line; line <= comp.endLine; line++) {
		if (covData.lines.has(line)) {
			totalLines++;
			if (covData.lines.get(line)! > 0) {
				hitLines++;
			}
		}
	}

	if (totalLines === 0) return null;
	return (hitLines / totalLines) * 100;
}

function normalizePath(p: string): string {
	return normalize(p)
		.replace(/\\/g, "/")
		.replace(/^\.\/+/g, "")
		.replace(/\/\.\.?\/+/g, "/");
}

function findCoverage(
	compPath: string,
	absoluteMap: Map<string, any>,
	suffixMap: Map<string, any>,
): any | undefined {
	if (absoluteMap.has(compPath)) return absoluteMap.get(compPath);

	const compParts = compPath.split("/");
	for (const [suffix, cov] of suffixMap.entries()) {
		const suffixParts = suffix.split("/");
		if (compParts.length >= suffixParts.length) {
			const end = compParts.slice(-suffixParts.length);
			if (end.every((part, i) => part === suffixParts[i])) {
				return cov;
			}
		}
	}

	return undefined;
}

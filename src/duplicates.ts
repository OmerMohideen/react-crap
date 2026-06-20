import { relative } from "node:path";
import Table from "cli-table3";
import pc from "picocolors";
import type { ComplexityEntry } from "./complexity.js";

export interface DuplicateMember {
	file: string;
	function: string;
	line: number;
	endLine: number;
}

export interface DuplicateGroup {
	hash: string;
	lines: number; // line span of one member (all members share the same body)
	cyclomatic: number;
	members: DuplicateMember[];
}

// Clone detection: groups by structuralHash (AST fingerprint that keeps
// identifier names + literal values but ignores formatting/whitespace/comments).
// Catches reformatted copy-paste; does NOT flag functions that merely share a
// shape but differ in the identifier/literal that matters.
// ponytail: same-code-modulo-formatting only — won't catch renamed locals,
// reordered statements, or extracted helpers (Type-2/3). Add a normalized or
// tree-edit-distance pass behind a flag if near-duplicates are needed.
export function findDuplicates(
	complexity: ComplexityEntry[],
	opts: { minLines?: number; minCyclomatic?: number } = {},
): DuplicateGroup[] {
	const minLines = opts.minLines ?? 3;
	const minCyclomatic = opts.minCyclomatic ?? 2;

	const byHash = new Map<string, ComplexityEntry[]>();
	for (const e of complexity) {
		// Skip trivial functions — short or straight-line bodies collide
		// structurally all the time and aren't worth reporting.
		if (e.endLine - e.line + 1 < minLines) continue;
		if (e.cyclomatic < minCyclomatic) continue;
		const list = byHash.get(e.structuralHash) ?? [];
		list.push(e);
		byHash.set(e.structuralHash, list);
	}

	const groups: DuplicateGroup[] = [];
	for (const [hash, entries] of byHash) {
		if (entries.length < 2) continue;
		const first = entries[0];
		groups.push({
			hash,
			lines: first.endLine - first.line + 1,
			cyclomatic: first.cyclomatic,
			members: entries.map((e) => ({
				file: e.file,
				function: e.function,
				line: e.line,
				endLine: e.endLine,
			})),
		});
	}

	// Worst first: most copies, then largest body.
	groups.sort(
		(a, b) => b.members.length - a.members.length || b.lines - a.lines,
	);
	return groups;
}

export function formatDuplicatesHuman(
	groups: DuplicateGroup[],
	opts: { rootPath?: string; noColor?: boolean } = {},
): string {
	const c = opts.noColor
		? { yellow: (s: string) => s, gray: (s: string) => s }
		: pc;
	const loc = (file: string, line: number) =>
		opts.rootPath
			? `${relative(opts.rootPath, file).replace(/\\/g, "/")}:${line}`
			: `${file}:${line}`;

	if (groups.length === 0) {
		return c.gray("No duplicate functions found.");
	}

	const table = new Table({
		head: ["#", "Copies", "Lines", "CC", "Function", "Location"],
		style: { head: [], border: [] },
		colAligns: ["right", "right", "right", "right", "left", "left"],
		wordWrap: true,
	});

	groups.forEach((g, i) => {
		g.members.forEach((m, j) => {
			// Show group-level columns only on the first row of each group.
			table.push([
				j === 0 ? String(i + 1) : "",
				j === 0 ? String(g.members.length) : "",
				j === 0 ? String(g.lines) : "",
				j === 0 ? String(g.cyclomatic) : "",
				m.function,
				loc(m.file, m.line),
			]);
		});
	});

	const copies = groups.reduce((n, g) => n + g.members.length, 0);
	return [
		c.yellow(
			`Found ${groups.length} duplicate group(s) covering ${copies} function(s):`,
		),
		table.toString() as string,
	].join("\n");
}

export function formatDuplicatesJson(
	groups: DuplicateGroup[],
	version: string,
): string {
	return JSON.stringify({ version, duplicates: groups }, null, 2);
}

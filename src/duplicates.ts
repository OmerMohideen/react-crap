import { relative } from "node:path";
import Table from "cli-table3";
import pc from "picocolors";
import type { ComplexityEntry } from "./complexity.js";
import { schemaUrl } from "./report/schema.js";

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
	opts: {
		minLines?: number;
		minCyclomatic?: number;
		normalized?: boolean;
	} = {},
): DuplicateGroup[] {
	const minLines = opts.minLines ?? 3;
	// Normalized (Type-2) matching is noisier — require a bit more substance.
	const minCyclomatic = opts.minCyclomatic ?? (opts.normalized ? 3 : 2);

	const byHash = new Map<string, ComplexityEntry[]>();
	for (const e of complexity) {
		// Skip trivial functions — short or straight-line bodies collide
		// structurally all the time and aren't worth reporting.
		if (e.endLine - e.line + 1 < minLines) continue;
		if (e.cyclomatic < minCyclomatic) continue;
		const key = opts.normalized ? e.normalizedHash : e.structuralHash;
		const list = byHash.get(key) ?? [];
		list.push(e);
		byHash.set(key, list);
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
	const id = (s: string) => s;
	const c = opts.noColor ? { yellow: id, gray: id, red: id } : pc;
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
		// More copies = louder. 2 = yellow, 3+ = red.
		const copies =
			g.members.length >= 3
				? c.red(String(g.members.length))
				: c.yellow(String(g.members.length));
		g.members.forEach((m, j) => {
			// Show group-level columns only on the first row of each group.
			table.push([
				j === 0 ? String(i + 1) : "",
				j === 0 ? copies : "",
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

// GitHub Actions annotations: one ::warning per duplicate member.
export function formatDuplicatesGithub(groups: DuplicateGroup[]): string {
	const lines: string[] = [];
	for (const g of groups) {
		for (const m of g.members) {
			const others = g.members
				.filter((o) => o !== m)
				.map(
					(o) =>
						`${relative(process.cwd(), o.file).replace(/\\/g, "/")}:${o.line}`,
				)
				.join(", ");
			const file = relative(process.cwd(), m.file).replace(/\\/g, "/");
			lines.push(
				`::warning file=${file},line=${m.line},title=react-crap/duplicate::Duplicate function (${g.members.length} copies). Also at: ${others}`,
			);
		}
	}
	return lines.join("\n");
}

export function formatDuplicatesJson(
	groups: DuplicateGroup[],
	version: string,
): string {
	return JSON.stringify(
		{ $schema: schemaUrl("duplicates-v1.json"), version, duplicates: groups },
		null,
		2,
	);
}

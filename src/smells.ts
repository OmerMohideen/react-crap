import { relative } from "node:path";
import Table from "cli-table3";
import pc from "picocolors";
import type { ComplexityEntry, Smell, SmellKind } from "./complexity.js";

export interface SmellRow {
	file: string;
	function: string;
	line: number;
	smells: Smell[];
}

// `!` and bare `any` are everywhere in normal TS — high volume, low AI-signal.
// Excluded from the default view; opt in with `--smells all` or by name.
export const NOISY_KINDS: SmellKind[] = ["non-null-assertion", "type-any"];

// Resolve the requested filter into a kind set (or undefined = all kinds).
// "all" => everything; empty/undefined => everything except NOISY_KINDS.
export function resolveKinds(filter?: string): SmellKind[] | undefined {
	if (!filter) return allKindsExcept(NOISY_KINDS);
	const parts = filter
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (parts.length === 1 && parts[0].toLowerCase() === "all") return undefined;
	return parts as SmellKind[];
}

function allKindsExcept(exclude: SmellKind[]): SmellKind[] {
	const all: SmellKind[] = [
		"effect-missing-deps",
		"effect-missing-cleanup",
		"effect-derived-state",
		"unstable-prop",
		"type-any",
		"non-null-assertion",
		"as-any",
		"ts-suppress",
		"console",
		"todo",
		"placeholder",
		"index-as-key",
	];
	const ex = new Set(exclude);
	return all.filter((k) => !ex.has(k));
}

export function collectSmells(
	complexity: ComplexityEntry[],
	only?: SmellKind[],
): SmellRow[] {
	const onlySet = only && only.length > 0 ? new Set(only) : undefined;
	const rows: SmellRow[] = [];
	for (const e of complexity) {
		const smells = onlySet
			? (e.smells ?? []).filter((s) => onlySet.has(s.kind))
			: (e.smells ?? []);
		if (smells.length === 0) continue;
		rows.push({ file: e.file, function: e.function, line: e.line, smells });
	}
	rows.sort((a, b) => b.smells.length - a.smells.length);
	return rows;
}

export function countByKind(rows: SmellRow[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const r of rows) {
		for (const s of r.smells) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
	}
	return counts;
}

export function formatSmellsHuman(
	rows: SmellRow[],
	opts: { rootPath?: string; noColor?: boolean } = {},
): string {
	const c = opts.noColor
		? { yellow: (s: string) => s, gray: (s: string) => s }
		: pc;
	const loc = (file: string, line: number) =>
		opts.rootPath
			? `${relative(opts.rootPath, file).replace(/\\/g, "/")}:${line}`
			: `${file}:${line}`;

	if (rows.length === 0) {
		return c.gray("No AI-slop smells found.");
	}

	const table = new Table({
		head: ["Function", "Kind", "n", "Lines"],
		style: { head: [], border: [] },
		colAligns: ["left", "left", "right", "left"],
		wordWrap: true,
	});

	// One row per (function, kind): count + the lines where it occurs.
	for (const r of rows) {
		const byKind = new Map<string, number[]>();
		for (const s of r.smells) {
			const list = byKind.get(s.kind) ?? [];
			list.push(s.line);
			byKind.set(s.kind, list);
		}
		const kinds = [...byKind.entries()].sort(
			(a, b) => b[1].length - a[1].length,
		);
		kinds.forEach(([kind, lines], j) => {
			const shown = lines.slice(0, 6).join(", ");
			const more = lines.length > 6 ? ` +${lines.length - 6}` : "";
			table.push([
				j === 0 ? `${r.function}\n${c.gray(loc(r.file, r.line))}` : "",
				kind,
				String(lines.length),
				shown + more,
			]);
		});
	}

	const counts = countByKind(rows);
	const total = Object.values(counts).reduce((a, b) => a + b, 0);
	const summary = Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.map(([k, n]) => `${k}: ${n}`)
		.join("  ");

	return [
		c.yellow(`Found ${total} smell(s) in ${rows.length} function(s):`),
		table.toString() as string,
		c.gray(summary),
	].join("\n");
}

export function formatSmellsJson(rows: SmellRow[], version: string): string {
	return JSON.stringify(
		{ version, counts: countByKind(rows), smells: rows },
		null,
		2,
	);
}

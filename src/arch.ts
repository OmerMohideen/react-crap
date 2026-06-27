import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Table from "cli-table3";
import pc from "picocolors";
import { scriptKind } from "./complexity.js";
import { scoreFooter } from "./report/health.js";
import { schemaUrl } from "./report/schema.js";

export interface ArchResult {
	cycles: string[][]; // each: list of files forming an import cycle
	barrels: { file: string; reexports: number }[];
}

// An index file that is purely re-exports and re-exports at least this many
// modules is a "barrel" big enough to cause over-importing / bundle bloat.
// ponytail: fixed threshold; expose as config if projects disagree.
const BARREL_THRESHOLD = 15;

const norm = (p: string) => p.replace(/\\/g, "/");

// Resolve a relative import specifier to a file in our analyzed set. External
// (bare) specifiers return undefined — we only graph first-party code.
function resolveLocal(
	importer: string,
	spec: string,
	fileSet: Set<string>,
): string | undefined {
	if (!spec.startsWith(".")) return undefined;
	const base = norm(resolve(dirname(importer), spec));
	const candidates = [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		`${base}.js`,
		`${base}.jsx`,
		`${base}/index.ts`,
		`${base}/index.tsx`,
		`${base}/index.js`,
		`${base}/index.jsx`,
	];
	return candidates.find((c) => fileSet.has(c));
}

// Canonical key for a cycle: rotate so the lexicographically-smallest node is
// first, so the same cycle found from different entry points dedupes.
function cycleKey(cycle: string[]): string {
	let min = 0;
	for (let i = 1; i < cycle.length; i++) if (cycle[i] < cycle[min]) min = i;
	return [...cycle.slice(min), ...cycle.slice(0, min)].join(">");
}

// ponytail: recursive DFS — fine for typical projects; a pathological
// deeply-nested graph could hit the call-stack limit. Make iterative if that
// ever bites.
function findCycles(graph: Map<string, string[]>): string[][] {
	const done = new Set<string>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const found = new Map<string, string[]>();

	function dfs(node: string) {
		stack.push(node);
		onStack.add(node);
		for (const next of graph.get(node) ?? []) {
			if (onStack.has(next)) {
				const cycle = stack.slice(stack.indexOf(next));
				found.set(cycleKey(cycle), cycle);
			} else if (!done.has(next)) {
				dfs(next);
			}
		}
		stack.pop();
		onStack.delete(node);
		done.add(node);
	}

	for (const n of graph.keys()) if (!done.has(n)) dfs(n);
	return [...found.values()];
}

export async function analyzeArchitecture(
	files: string[],
	tsPath?: string,
): Promise<ArchResult> {
	const tsMod = tsPath ? require(tsPath) : require("typescript");
	const fileSet = new Set(files.map(norm));
	const graph = new Map<string, string[]>();
	const barrels: { file: string; reexports: number }[] = [];

	for (const file of files) {
		const key = norm(file);
		const content = await readFile(file, "utf-8");
		const sf = tsMod.createSourceFile(
			file,
			content,
			tsMod.ScriptTarget.ES2022,
			true,
			scriptKind(file, tsMod),
		);

		const edges: string[] = [];
		let reexports = 0;
		let nonReexportStmts = 0;

		for (const stmt of sf.statements) {
			const isImport = tsMod.isImportDeclaration(stmt);
			const isExportFrom =
				tsMod.isExportDeclaration(stmt) && stmt.moduleSpecifier;
			if (isImport || isExportFrom) {
				const spec = (stmt.moduleSpecifier as any)?.text;
				const target = spec && resolveLocal(file, spec, fileSet);
				if (target && target !== key) edges.push(target);
				if (isExportFrom) reexports++;
			} else {
				nonReexportStmts++;
			}
		}

		graph.set(key, edges);

		// Barrel: an index file that is (almost) nothing but re-exports.
		if (
			/\/index\.[jt]sx?$/.test(key) &&
			reexports >= BARREL_THRESHOLD &&
			nonReexportStmts === 0
		) {
			barrels.push({ file: key, reexports });
		}
	}

	const cycles = findCycles(graph).sort((a, b) => a.length - b.length);
	barrels.sort((a, b) => b.reexports - a.reexports);
	return { cycles, barrels };
}

const id = (s: string) => s;
const palette = (noColor?: boolean) =>
	noColor ? { red: id, yellow: id, gray: id, dim: id, cyan: id, bold: id } : pc;

function rel(file: string, rootPath?: string): string {
	if (!rootPath) return file;
	const r = norm(rootPath);
	return file.startsWith(`${r}/`) ? file.slice(r.length + 1) : file;
}

export function formatArchHuman(
	result: ArchResult,
	opts: { rootPath?: string; noColor?: boolean } = {},
): string {
	const c = palette(opts.noColor);
	const lines: string[] = [c.bold(c.cyan("══ react-crap · architecture ══"))];

	if (result.cycles.length === 0 && result.barrels.length === 0) {
		lines.push(c.gray("No circular imports or bloated barrels found."));
	} else {
		if (result.cycles.length > 0) {
			lines.push(c.red(`Circular imports (${result.cycles.length}):`));
			for (const cycle of result.cycles) {
				const path = [...cycle, cycle[0]]
					.map((f) => rel(f, opts.rootPath))
					.join(" → ");
				lines.push(`  ${path}`);
			}
		}
		if (result.barrels.length > 0) {
			lines.push(c.yellow(`\nBloated barrels (${result.barrels.length}):`));
			const table = new Table({
				head: ["Re-exports", "Barrel file"],
				style: { head: [], border: [] },
				colAligns: ["right", "left"],
			});
			for (const b of result.barrels)
				table.push([String(b.reexports), rel(b.file, opts.rootPath)]);
			lines.push(table.toString() as string);
		}
	}

	lines.push(
		scoreFooter(
			{ high: result.cycles.length, warn: 0, note: result.barrels.length },
			opts.noColor,
		),
	);
	return lines.join("\n");
}

export function formatArchGithub(result: ArchResult): string {
	const out: string[] = [];
	for (const cycle of result.cycles) {
		const file = norm(cycle[0]).replace(`${norm(process.cwd())}/`, "");
		const path = [...cycle, cycle[0]].map(norm).join(" -> ");
		out.push(
			`::warning file=${file},title=react-crap/circular-import::Circular import: ${path}`,
		);
	}
	for (const b of result.barrels) {
		const file = b.file.replace(`${norm(process.cwd())}/`, "");
		out.push(
			`::warning file=${file},title=react-crap/barrel-bloat::Barrel re-exports ${b.reexports} modules`,
		);
	}
	return out.join("\n");
}

export function formatArchJson(result: ArchResult, version: string): string {
	return JSON.stringify(
		{
			$schema: schemaUrl("arch-v1.json"),
			version,
			cycles: result.cycles,
			barrels: result.barrels,
		},
		null,
		2,
	);
}

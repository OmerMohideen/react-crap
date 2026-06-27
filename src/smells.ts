import { relative } from "node:path";
import Table from "cli-table3";
import pc from "picocolors";
import {
	ALL_SMELL_KINDS,
	type ComplexityEntry,
	type Smell,
	type SmellKind,
} from "./complexity.js";
import { banner, type SeverityCounts, scoreFooter } from "./report/health.js";
import { schemaUrl } from "./report/schema.js";

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
	const ex = new Set(exclude);
	return ALL_SMELL_KINDS.filter((k) => !ex.has(k));
}

// Apply user rule overrides from config on top of the CLI-selected kind set.
// `rules` maps a kind to true (force-on, even if noisy/deselected) or false
// (disable). Returns the concrete kind list to scan.
export function effectiveKinds(
	filter?: string,
	rules?: Record<string, RuleValue>,
): SmellKind[] {
	const base = resolveKinds(filter) ?? ALL_SMELL_KINDS;
	if (!rules) return [...base];
	const set = new Set<SmellKind>(base);
	for (const [kind, on] of Object.entries(rules)) {
		if (on) set.add(kind as SmellKind);
		else set.delete(kind as SmellKind);
	}
	// Preserve the canonical order for stable output.
	return ALL_SMELL_KINDS.filter((k) => set.has(k));
}

export function collectSmells(
	complexity: ComplexityEntry[],
	only?: SmellKind[],
): SmellRow[] {
	// undefined => all kinds; an explicit list (even empty) is used as-is, so
	// disabling every kind via config yields no findings rather than all.
	const onlySet = only ? new Set(only) : undefined;
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

// Severity buckets drive the Kind colour. red = likely bug, yellow = perf/
// quality, dim = housekeeping.
const BUG_KINDS = new Set<SmellKind>([
	"effect-missing-deps",
	"effect-missing-cleanup",
	"index-as-key",
	"test-no-assert",
	"component-in-render",
	"dangerous-html",
	"eval-usage",
	"target-blank",
	"href-javascript",
]);
const HOUSEKEEPING_KINDS = new Set<SmellKind>([
	"console",
	"todo",
	"placeholder",
]);

// A config rule value: enable/disable, or enable with a severity override.
export type RuleValue = boolean | "error" | "warn" | "note";

// Display severity of a kind: a config "error"/"warn"/"note" override wins,
// otherwise the static bucket (BUG → high, housekeeping → note, else warn).
export function resolveSeverity(
	kind: SmellKind,
	rules?: Record<string, RuleValue>,
): "high" | "warn" | "note" {
	const ov = rules?.[kind];
	if (ov === "error") return "high";
	if (ov === "warn") return "warn";
	if (ov === "note") return "note";
	if (BUG_KINDS.has(kind)) return "high";
	if (HOUSEKEEPING_KINDS.has(kind)) return "note";
	return "warn";
}

// Collapse smell kinds into the three display severities for the score footer.
export function smellSeverityCounts(
	rows: SmellRow[],
	rules?: Record<string, RuleValue>,
): SeverityCounts {
	const c: SeverityCounts = { high: 0, warn: 0, note: 0 };
	for (const r of rows) {
		for (const s of r.smells) c[resolveSeverity(s.kind, rules)]++;
	}
	return c;
}

export function formatSmellsHuman(
	rows: SmellRow[],
	opts: {
		rootPath?: string;
		noColor?: boolean;
		compact?: boolean;
		rules?: Record<string, RuleValue>;
	} = {},
): string {
	const id = (s: string) => s;
	const c = opts.noColor ? { yellow: id, gray: id, red: id, dim: id } : pc;
	const paintKind = (kind: string) => {
		const sev = resolveSeverity(kind as SmellKind, opts.rules);
		if (sev === "high") return c.red(kind);
		if (sev === "note") return c.dim(kind);
		return c.yellow(kind);
	};
	const loc = (file: string, line: number) =>
		opts.rootPath
			? `${relative(opts.rootPath, file).replace(/\\/g, "/")}:${line}`
			: `${file}:${line}`;

	if (rows.length === 0) {
		if (opts.compact) return c.gray("No AI-slop smells found.");
		return [
			banner("smells", opts.noColor),
			c.gray("No AI-slop smells found."),
			scoreFooter({ high: 0, warn: 0, note: 0 }, opts.noColor),
		].join("\n");
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
				paintKind(kind),
				String(lines.length),
				shown + more,
			]);
		});
	}

	const counts = countByKind(rows);
	const total = Object.values(counts).reduce((a, b) => a + b, 0);
	const summary = Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.map(([k, n]) => `${paintKind(k)}: ${n}`)
		.join("  ");

	const lines = [
		c.yellow(`Found ${total} smell(s) in ${rows.length} function(s):`),
		table.toString() as string,
		c.gray(summary),
	];
	if (opts.compact) return lines.join("\n");
	return [
		banner("smells", opts.noColor),
		...lines,
		scoreFooter(smellSeverityCounts(rows, opts.rules), opts.noColor),
	].join("\n");
}

// GitHub Actions annotations: one ::warning per smell, attached to file:line.
// Paths are made relative to cwd so they line up with the PR diff.
export function formatSmellsGithub(rows: SmellRow[]): string {
	const lines: string[] = [];
	for (const r of rows) {
		for (const s of r.smells) {
			const file = relative(process.cwd(), r.file).replace(/\\/g, "/");
			lines.push(
				`::warning file=${file},line=${s.line},title=react-crap/${s.kind}::${s.detail}`,
			);
		}
	}
	return lines.join("\n");
}

export function formatSmellsJson(rows: SmellRow[], version: string): string {
	return JSON.stringify(
		{
			$schema: schemaUrl("smells-v1.json"),
			version,
			counts: countByKind(rows),
			smells: rows,
		},
		null,
		2,
	);
}

import { relative } from "node:path";
import Table from "cli-table3";
import pc from "picocolors";
import type { DeltaEntry } from "../delta.js";
import type { ScoredEntry } from "../score.js";

export interface HumanOptions {
	threshold: number;
	summary?: boolean;
	baseline?: boolean;
	workspace?: boolean;
	noColor?: boolean;
	rootPath?: string;
}

export function formatHuman(
	entries: ScoredEntry[],
	options: HumanOptions,
): string {
	if (entries.length === 0) {
		return "No functions analyzed.";
	}

	const lines: string[] = [];
	const c = options.noColor
		? {
				red: (s: string) => s,
				green: (s: string) => s,
				yellow: (s: string) => s,
				gray: (s: string) => s,
			}
		: pc;

	if (options.summary) {
		const crappy = entries.filter(
			(e) => e.crap > (e.threshold ?? options.threshold),
		);
		const worst = entries[0];
		lines.push(`Total: ${entries.length}`);
		lines.push(`Above threshold (${options.threshold}): ${crappy.length}`);
		if (worst) {
			lines.push(
				`Worst: ${worst.function} at ${worst.file}:${worst.line} (CRAP ${worst.crap.toFixed(1)})`,
			);
		}
		return lines.join("\n");
	}

	// Per-package summary in workspace mode
	if (options.workspace) {
		const pkgMap = new Map<string, ScoredEntry[]>();
		for (const e of entries) {
			const pkg = (e as any).package || "default";
			const list = pkgMap.get(pkg) ?? [];
			list.push(e);
			pkgMap.set(pkg, list);
		}

		if (pkgMap.size > 1) {
			const pkgTable = new Table({
				head: ["Package", "Functions", "Above Threshold", "Worst CRAP"],
				style: { head: [], border: [] },
				colAligns: ["left", "right", "right", "right"],
			});

			for (const [pkg, list] of pkgMap) {
				const above = list.filter(
					(e) => e.crap > (e.threshold ?? options.threshold),
				).length;
				const worst = list.sort((a, b) => b.crap - a.crap)[0];
				pkgTable.push([
					pkg,
					String(list.length),
					String(above),
					worst ? worst.crap.toFixed(1) : "-",
				]);
			}

			lines.push("Per-package summary:");
			lines.push(pkgTable.toString() as string);
			lines.push("");
		}
	}

	// Responsive column layout based on terminal width
	const termWidth =
		typeof process !== "undefined" && process.stdout && process.stdout.columns
			? process.stdout.columns
			: 120;

	// Determine which columns to show
	const showType = termWidth >= 75;
	const showRB = termWidth >= 85;
	const showHooks = termWidth >= 100;
	const hooksWrapWidth = showHooks
		? Math.max(12, Math.min(28, termWidth - 90))
		: 12;

	const head = options.baseline
		? [
				"",
				"CRAP",
				"Δ",
				"CC",
				"Coverage",
				...(showType ? ["Type"] : []),
				...(showHooks ? ["Hooks"] : []),
				...(showRB ? ["RB"] : []),
				"Function",
				"Location",
			]
		: [
				"",
				"CRAP",
				"CC",
				"Coverage",
				...(showType ? ["Type"] : []),
				...(showHooks ? ["Hooks"] : []),
				...(showRB ? ["RB"] : []),
				"Function",
				"Location",
			];

	const colAligns = options.baseline
		? [
				"center",
				"right",
				"right",
				"right",
				"left",
				...(showType ? ["left"] : []),
				...(showHooks ? ["left"] : []),
				...(showRB ? ["right"] : []),
				"left",
				"left",
			]
		: [
				"center",
				"right",
				"right",
				"left",
				...(showType ? ["left"] : []),
				...(showHooks ? ["left"] : []),
				...(showRB ? ["right"] : []),
				"left",
				"left",
			];

	const table = new Table({
		head,
		style: { head: [], border: [] },
		colAligns: colAligns as Table.HorizontalAlignment[],
	});

	function fmtLoc(file: string, line: number): string {
		if (options.rootPath) {
			const rel = relative(options.rootPath, file).replace(/\\/g, "/");
			return `${rel}:${line}`;
		}
		return `${file}:${line}`;
	}

	for (const e of entries) {
		const status = getStatus(e, options.threshold, options.noColor);
		const covBar = coverageBar(e.coverage ?? 0);
		const covText =
			e.coverage === null ? "   N/A" : `${e.coverage.toFixed(1)}%`;
		const type = e.isComponent ? "Comp" : "Util";
		const hooks = formatHooks(e.hooks, hooksWrapWidth);
		const rb = e.renderBranches ? String(e.renderBranches) : "-";

		if (options.baseline && "delta" in e) {
			const d = e as unknown as DeltaEntry;
			const deltaStr =
				d.delta > 0 ? `+${d.delta.toFixed(1)}` : d.delta.toFixed(1);
			const deltaColor = d.delta > 0 ? c.red : d.delta < 0 ? c.green : c.gray;
			const location = d.previous_file
				? `${fmtLoc(e.file, e.line)} ← ${d.previous_file}`
				: fmtLoc(e.file, e.line);
			table.push([
				status,
				e.crap.toFixed(1),
				deltaColor(deltaStr),
				String(e.cyclomatic),
				`${covBar} ${covText}`,
				...(showType ? [type] : []),
				...(showHooks ? [hooks] : []),
				...(showRB ? [rb] : []),
				e.function,
				location,
			]);
		} else {
			table.push([
				status,
				e.crap.toFixed(1),
				String(e.cyclomatic),
				`${covBar} ${covText}`,
				...(showType ? [type] : []),
				...(showHooks ? [hooks] : []),
				...(showRB ? [rb] : []),
				e.function,
				fmtLoc(e.file, e.line),
			]);
		}
	}

	lines.push(table.toString() as string);

	const crappy = entries.filter(
		(e) => e.crap > (e.threshold ?? options.threshold),
	);
	if (crappy.length > 0) {
		lines.push(
			c.red(
				`✗ ${crappy.length}/${entries.length} function(s) exceed CRAP threshold ${options.threshold}.`,
			),
		);
	} else {
		lines.push(
			c.green(
				`✓ All ${entries.length} functions are below CRAP threshold ${options.threshold}.`,
			),
		);
	}

	return lines.join("\n");
}

function formatHooks(hooks: string[], wrapWidth: number): string {
	if (!hooks.length) return "-";
	const full = hooks.join(",");
	if (full.length <= wrapWidth) return full;

	// Word-wrap at comma boundaries so the column stays narrow but shows everything
	const lines: string[] = [];
	let current = "";
	for (const h of hooks) {
		const candidate = current ? `${current},${h}` : h;
		if (candidate.length <= wrapWidth) {
			current = candidate;
		} else {
			if (current) lines.push(current);
			current = h;
		}
	}
	if (current) lines.push(current);
	return lines.join("\n");
}

function getStatus(
	e: ScoredEntry,
	threshold: number,
	noColor?: boolean,
): string {
	if (e.hookViolations?.length > 0) return noColor ? "!" : pc.red("!");
	const t = e.threshold ?? threshold;
	if (e.crap > t) return noColor ? "✗" : pc.red("✗");
	if (e.crap > t / 2) return noColor ? "▲" : pc.yellow("▲");
	return noColor ? "✓" : pc.green("✓");
}

function coverageBar(pct: number): string {
	const filled = Math.round(pct / 10);
	const empty = 10 - filled;
	return "█".repeat(filled) + "░".repeat(empty);
}

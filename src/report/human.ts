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

	// ── TUI-like responsive column widths ──
	const termWidth =
		typeof process !== "undefined" && process.stdout && process.stdout.columns
			? process.stdout.columns
			: 120;

	const isBaseline = options.baseline;
	const numCols = isBaseline ? 10 : 9;
	const borderChars = numCols + 1; // vertical │ dividers

	// Effective content width = colWidth - 2 (cli-table3 padding)
	const PAD = 2;

	// Column configs: min/max total widths, shrink priority (higher = shrink first)
	const colConfig: {
		key: string;
		min: number;
		max: number;
		priority: number;
	}[] = [
		{ key: "status", min: 3, max: 3, priority: 5 }, // never shrink, fits ✓✗▲!
		{ key: "crap", min: 5, max: 6, priority: 4 },
		{ key: "delta", min: 5, max: 6, priority: 4 },
		{ key: "cc", min: 3, max: 4, priority: 4 },
		{ key: "coverage", min: 6, max: 12, priority: 3 }, // compact; bar hidden on narrow
		{ key: "type", min: 6, max: 6, priority: 3 }, // never shrink, fits Comp/Util
		{ key: "hooks", min: 12, max: 28, priority: 2 }, // fits "useImperativeHandle"
		{ key: "rb", min: 3, max: 4, priority: 5 },
		{ key: "function", min: 8, max: 22, priority: 1 },
		{ key: "location", min: 8, max: 28, priority: 1 },
	];

	const desired: Record<string, number> = {};
	for (const cfg of colConfig) {
		if (cfg.key === "delta" && !isBaseline) continue;
		desired[cfg.key] = cfg.max;
	}

	let totalDesired = borderChars;
	for (const k of Object.keys(desired)) totalDesired += desired[k];

	const widths: Record<string, number> = { ...desired };
	if (totalDesired > termWidth) {
		const overflow = totalDesired - termWidth;
		let remainingShrink = overflow;

		for (let prio = 5; prio >= 1 && remainingShrink > 0; prio--) {
			const colsAtPrio = colConfig.filter(
				(c) => c.priority === prio && widths[c.key] !== undefined,
			);
			if (colsAtPrio.length === 0) continue;

			const shrinkable = colsAtPrio.reduce(
				(sum, c) => sum + (widths[c.key] - c.min),
				0,
			);
			const take = Math.min(remainingShrink, shrinkable);
			if (take <= 0) continue;

			const ratio = take / shrinkable;
			for (const c of colsAtPrio) {
				const canShrink = widths[c.key] - c.min;
				const amount = Math.floor(canShrink * ratio);
				widths[c.key] -= amount;
				remainingShrink -= amount;
			}

			if (remainingShrink > 0) {
				for (const c of colsSortedByShrinkable(colsAtPrio, widths)) {
					if (remainingShrink <= 0) break;
					const canShrink = widths[c.key] - c.min;
					if (canShrink > 0) {
						const amount = Math.min(canShrink, remainingShrink);
						widths[c.key] -= amount;
						remainingShrink -= amount;
					}
				}
			}
		}
	}

	const colOrder = isBaseline
		? [
				"status",
				"crap",
				"delta",
				"cc",
				"coverage",
				"type",
				"hooks",
				"rb",
				"function",
				"location",
			]
		: [
				"status",
				"crap",
				"cc",
				"coverage",
				"type",
				"hooks",
				"rb",
				"function",
				"location",
			];

	const colWidths = colOrder
		.filter((k) => widths[k] !== undefined)
		.map((k) => widths[k]);

	const head = colOrder
		.filter((k) => widths[k] !== undefined)
		.map((k) => {
			switch (k) {
				case "status":
					return "";
				case "crap":
					return "CRAP";
				case "delta":
					return "Δ";
				case "cc":
					return "CC";
				case "coverage":
					return "Cov";
				case "type":
					return "Type";
				case "hooks":
					return "Hooks";
				case "rb":
					return "RB";
				case "function":
					return "Function";
				case "location":
					return "Location";
				default:
					return "";
			}
		});

	const colAligns = colOrder
		.filter((k) => widths[k] !== undefined)
		.map((k) => {
			if (
				k === "status" ||
				k === "rb" ||
				k === "cc" ||
				k === "crap" ||
				k === "delta"
			)
				return "center";
			return "left";
		}) as Table.HorizontalAlignment[];

	const table = new Table({
		head,
		colWidths,
		colAligns,
		style: { head: [], border: [] },
		wordWrap: true,
	});

	function fmtLoc(file: string, line: number): string {
		if (options.rootPath) {
			const rel = relative(options.rootPath, file).replace(/\\/g, "/");
			return `${rel}:${line}`;
		}
		return `${file}:${line}`;
	}

	function truncate(s: string, len: number): string {
		if (s.length <= len) return s;
		return `${s.slice(0, Math.max(0, len - 1))}…`;
	}

	const covW = widths.coverage ?? 12;
	const showCovBar = covW >= 14;
	const covNumCompact = covW < 10;
	const funcW = Math.max(1, (widths.function ?? 22) - PAD);
	const locW = Math.max(1, (widths.location ?? 28) - PAD);

	for (const e of entries) {
		const status = getStatus(e, options.threshold, options.noColor);
		const covBar = coverageBar(e.coverage ?? 0);
		let covText: string;
		if (e.coverage === null) {
			covText = "N/A";
		} else if (covNumCompact) {
			covText = `${Math.round(e.coverage)}%`;
		} else {
			covText = `${e.coverage.toFixed(1)}%`;
		}
		const covCell = showCovBar ? `${covBar} ${covText}` : covText;
		const type = e.isComponent ? "Comp" : "Util";
		const hooks = formatHooks(e.hooks);
		const rb = e.renderBranches ? String(e.renderBranches) : "-";

		const row: Record<string, string> = {
			status,
			crap: e.crap.toFixed(1),
			cc: String(e.cyclomatic),
			coverage: covCell,
			type,
			hooks,
			rb,
			function: truncate(e.function, funcW),
			location: truncate(fmtLoc(e.file, e.line), locW),
		};

		if (isBaseline && "delta" in e) {
			const d = e as unknown as DeltaEntry;
			const deltaStr =
				d.delta > 0 ? `+${d.delta.toFixed(1)}` : d.delta.toFixed(1);
			const deltaColor = d.delta > 0 ? c.red : d.delta < 0 ? c.green : c.gray;
			row.delta = deltaColor(deltaStr);
			if (d.previous_file) {
				row.location = truncate(
					`${fmtLoc(e.file, e.line)} ← ${d.previous_file}`,
					locW,
				);
			}
		}

		table.push(
			colOrder.filter((k) => widths[k] !== undefined).map((k) => row[k]),
		);
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

function colsSortedByShrinkable(
	cols: { key: string; min: number }[],
	widths: Record<string, number>,
): { key: string; min: number }[] {
	return [...cols].sort((a, b) => {
		const aShrink = widths[a.key] - a.min;
		const bShrink = widths[b.key] - b.min;
		return bShrink - aShrink;
	});
}

function formatHooks(hooks: string[]): string {
	if (!hooks.length) return "-";
	return hooks.join(", ");
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

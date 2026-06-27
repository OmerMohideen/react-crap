import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Table from "cli-table3";
import pc from "picocolors";
import { findPackageRoot } from "./audit.js";
import { scoreFooter } from "./report/health.js";
import { schemaUrl } from "./report/schema.js";

export interface SupplyChainFinding {
	package: string;
	kind: "install-script" | "typosquat";
	detail: string;
}

// Popular packages used as the typosquat reference set. A direct dependency
// whose name is one edit away from one of these (but not itself on the list)
// is suspicious. Small + curated to keep false positives down.
const POPULAR = [
	"react",
	"react-dom",
	"lodash",
	"express",
	"axios",
	"chalk",
	"commander",
	"next",
	"vue",
	"webpack",
	"typescript",
	"eslint",
	"prettier",
	"jest",
	"vitest",
	"dotenv",
	"moment",
	"uuid",
	"classnames",
	"redux",
	"zod",
	"picocolors",
	"rimraf",
	"glob",
	"yargs",
	"debug",
];
const POPULAR_SET = new Set(POPULAR);

// True when a and b differ by exactly one edit (insert/delete/substitute).
// Cheaper and stricter than full Levenshtein — we only care about distance 1.
export function isOneEdit(a: string, b: string): boolean {
	if (a === b) return false;
	const la = a.length;
	const lb = b.length;
	if (Math.abs(la - lb) > 1) return false;

	if (la === lb) {
		let diffs = 0;
		for (let i = 0; i < la; i++) if (a[i] !== b[i]) diffs++;
		return diffs === 1;
	}
	// Lengths differ by 1: check b is a with one char inserted.
	const [short, long] = la < lb ? [a, b] : [b, a];
	let i = 0;
	let j = 0;
	let skipped = false;
	while (i < short.length && j < long.length) {
		if (short[i] === long[j]) {
			i++;
			j++;
		} else {
			if (skipped) return false;
			skipped = true;
			j++; // skip one char in the longer string
		}
	}
	return true;
}

export function analyzeSupplyChain(projectPath: string): SupplyChainFinding[] {
	const root = findPackageRoot(projectPath);
	const pkgPath = resolve(root, "package.json");
	if (!existsSync(pkgPath)) {
		throw new Error(
			`No package.json found at ${root}. --audit-supply-chain needs a project root.`,
		);
	}

	let pkg: any;
	try {
		pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	} catch (e) {
		throw new Error(`Failed to parse ${pkgPath}: ${e}`);
	}

	const deps = Object.keys({
		...(pkg.dependencies ?? {}),
		...(pkg.devDependencies ?? {}),
		...(pkg.optionalDependencies ?? {}),
	});

	const findings: SupplyChainFinding[] = [];

	for (const name of deps) {
		// Typosquat: name is one edit from a popular package but not itself one.
		if (!POPULAR_SET.has(name)) {
			const near = POPULAR.find((p) => isOneEdit(name, p));
			if (near) {
				findings.push({
					package: name,
					kind: "typosquat",
					detail: `name is one character from popular package "${near}" — verify it's intentional`,
				});
			}
		}

		// Install scripts: read the installed package's lifecycle scripts.
		const depPkgPath = resolve(root, "node_modules", name, "package.json");
		if (!existsSync(depPkgPath)) continue; // not installed — can't inspect
		try {
			const depPkg = JSON.parse(readFileSync(depPkgPath, "utf-8"));
			const scripts = depPkg.scripts ?? {};
			const hooks = ["preinstall", "install", "postinstall"].filter(
				(h) => typeof scripts[h] === "string" && scripts[h].trim(),
			);
			if (hooks.length > 0) {
				findings.push({
					package: name,
					kind: "install-script",
					detail: `runs ${hooks.join("/")} on install — review the script`,
				});
			}
		} catch {
			// unreadable dep manifest — skip
		}
	}

	// Install scripts first (higher risk), then typosquats; alpha within.
	const order = { "install-script": 0, typosquat: 1 } as const;
	findings.sort(
		(a, b) =>
			order[a.kind] - order[b.kind] || a.package.localeCompare(b.package),
	);
	return findings;
}

const id = (s: string) => s;
const palette = (noColor?: boolean) =>
	noColor ? { red: id, yellow: id, gray: id, dim: id, cyan: id, bold: id } : pc;

export function formatSupplyChainHuman(
	findings: SupplyChainFinding[],
	opts: { noColor?: boolean } = {},
): string {
	const c = palette(opts.noColor);
	const lines: string[] = [c.bold(c.cyan("══ react-crap · supply-chain ══"))];

	if (findings.length === 0) {
		lines.push(c.gray("No risky install scripts or typosquat-shaped names."));
	} else {
		const table = new Table({
			head: ["Risk", "Package", "Detail"],
			style: { head: [], border: [] },
			wordWrap: true,
		});
		for (const f of findings) {
			const risk = f.kind === "install-script" ? c.red(f.kind) : c.dim(f.kind);
			table.push([risk, f.package, f.detail]);
		}
		lines.push(table.toString() as string);
	}

	const high = findings.filter((f) => f.kind === "install-script").length;
	const note = findings.filter((f) => f.kind === "typosquat").length;
	lines.push(scoreFooter({ high, warn: 0, note }, opts.noColor));
	return lines.join("\n");
}

export function formatSupplyChainGithub(
	findings: SupplyChainFinding[],
): string {
	return findings
		.map(
			(f) => `::warning title=react-crap/${f.kind}::${f.package}: ${f.detail}`,
		)
		.join("\n");
}

export function formatSupplyChainJson(
	findings: SupplyChainFinding[],
	version: string,
): string {
	return JSON.stringify(
		{
			$schema: schemaUrl("supply-chain-v1.json"),
			version,
			findings,
		},
		null,
		2,
	);
}

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Table from "cli-table3";
import pc from "picocolors";
import { banner, type SeverityCounts, scoreFooter } from "./report/health.js";

export interface Vuln {
	name: string;
	severity: string; // critical | high | moderate | low | info
	title: string;
	url?: string;
	range?: string;
	fixAvailable: boolean;
}

// Worst first.
const SEVERITY_ORDER = ["critical", "high", "moderate", "low", "info"];

// Parse the `npm audit --json` v2 schema (npm 7+). Kept pure and separate from
// the shell-out so it's testable without running npm.
export function parseAuditJson(json: string): Vuln[] {
	let data: any;
	try {
		data = JSON.parse(json);
	} catch {
		return [];
	}
	const vulns = data?.vulnerabilities;
	if (!vulns || typeof vulns !== "object") return [];

	const out: Vuln[] = [];
	for (const key of Object.keys(vulns)) {
		const v = vulns[key];
		if (!v || typeof v !== "object") continue;
		const via = Array.isArray(v.via) ? v.via : [];
		// `via` mixes advisory objects and bare package-name strings (transitive).
		const advisory = via.find((x: any) => x && typeof x === "object");
		const title =
			advisory?.title ??
			(typeof via[0] === "string"
				? `vulnerable via ${via[0]}`
				: "vulnerable dependency");
		out.push({
			name: v.name ?? key,
			severity: String(v.severity ?? "unknown"),
			title,
			url: advisory?.url,
			range: v.range,
			// fixAvailable is `true`, `false`, or an object describing the bump.
			fixAvailable:
				v.fixAvailable === true ||
				(!!v.fixAvailable && typeof v.fixAvailable === "object"),
		});
	}
	out.sort(
		(a, b) =>
			SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
	);
	return out;
}

// Nearest ancestor of `start` that has a package.json — npm audit must run
// where the lockfile lives, not in the source subdir (--path defaults to src).
function findPackageRoot(start: string): string {
	let dir = resolve(start);
	while (true) {
		if (existsSync(resolve(dir, "package.json"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return resolve(start);
		dir = parent;
	}
}

// ponytail: npm audit only — covers known-CVE deps via the registry advisory
// DB, no new dependency. pnpm/yarn audit emit different JSON; add per-manager
// parsers behind lockfile detection if those ecosystems need it. Supply-chain
// heuristics (install scripts, typosquat-shaped names) are a separate upgrade.
export function runAudit(projectPath: string): Vuln[] {
	const root = findPackageRoot(projectPath);
	if (!existsSync(resolve(root, "package-lock.json"))) {
		throw new Error(
			`No package-lock.json found at ${root}. \`npm audit\` needs a lockfile — run \`npm install\` first. ` +
				`(--audit-deps currently supports npm projects only.)`,
		);
	}

	// npm audit exits non-zero when vulnerabilities exist; the JSON still lands
	// on stdout, so read it from the thrown error too.
	let out = "";
	try {
		out = execSync("npm audit --json", {
			cwd: root,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch (e: any) {
		out = e?.stdout?.toString?.() ?? "";
	}
	if (!out.trim()) {
		throw new Error(
			"`npm audit --json` produced no output. Ensure npm is installed and the project has a valid lockfile.",
		);
	}
	return parseAuditJson(out);
}

const paintSeverity = (c: any, sev: string): string => {
	if (sev === "critical" || sev === "high") return c.red(sev);
	if (sev === "moderate") return c.yellow(sev);
	return c.dim(sev);
};

export function formatAuditHuman(
	vulns: Vuln[],
	opts: { noColor?: boolean } = {},
): string {
	const id = (s: string) => s;
	const c = opts.noColor ? { yellow: id, gray: id, red: id, dim: id } : pc;

	if (vulns.length === 0)
		return [
			banner("audit-deps", opts.noColor),
			c.gray("No known-vulnerable dependencies."),
			scoreFooter({ high: 0, warn: 0, note: 0 }, opts.noColor),
		].join("\n");

	const table = new Table({
		head: ["Severity", "Package", "Fix", "Advisory"],
		style: { head: [], border: [] },
		wordWrap: true,
	});
	for (const v of vulns) {
		table.push([
			paintSeverity(c, v.severity),
			v.range ? `${v.name}@${v.range}` : v.name,
			v.fixAvailable ? "yes" : c.dim("no"),
			v.url ? `${v.title}\n${c.gray(v.url)}` : v.title,
		]);
	}

	const counts: Record<string, number> = {};
	for (const v of vulns) counts[v.severity] = (counts[v.severity] ?? 0) + 1;
	const summary = SEVERITY_ORDER.filter((s) => counts[s])
		.map((s) => `${paintSeverity(c, s)}: ${counts[s]}`)
		.join("  ");

	return [
		banner("audit-deps", opts.noColor),
		c.yellow(`Found ${vulns.length} vulnerable dependency(ies):`),
		table.toString() as string,
		c.gray(summary),
		scoreFooter(auditSeverityCounts(vulns), opts.noColor),
	].join("\n");
}

// critical/high → high, moderate → warn, low/info → note.
function auditSeverityCounts(vulns: Vuln[]): SeverityCounts {
	const c: SeverityCounts = { high: 0, warn: 0, note: 0 };
	for (const v of vulns) {
		if (v.severity === "critical" || v.severity === "high") c.high++;
		else if (v.severity === "moderate") c.warn++;
		else c.note++;
	}
	return c;
}

// No file/line to attach, so these annotations surface in the job log only.
export function formatAuditGithub(vulns: Vuln[]): string {
	return vulns
		.map(
			(v) =>
				`::warning title=react-crap/vuln-dep::${v.name} (${v.severity}): ${v.title}`,
		)
		.join("\n");
}

export function formatAuditJson(vulns: Vuln[], version: string): string {
	return JSON.stringify({ version, vulnerabilities: vulns }, null, 2);
}

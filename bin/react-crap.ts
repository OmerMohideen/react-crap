#!/usr/bin/env node
import { Command } from "commander";
import { run } from "../src/index.js";
import { getLocalVersion } from "../src/version-check.js";

function collect(value: string, previous: string[]): string[] {
	return previous.concat([value]);
}

const program = new Command();

program
	.name("react-crap")
	.description(
		"Change Risk Anti-Patterns (CRAP) metric for React TypeScript projects",
	)
	.version(getLocalVersion());

program
	.option("--lcov <file>", "LCOV coverage report file")
	.option("--path <dir>", "Root directory to analyze", "src")
	.option("--threshold <n>", "CRAP score threshold", "30")
	.option(
		"--component-threshold <n>",
		"CRAP threshold for JSX-returning functions",
	)
	.option("--min <score>", "Hide entries below this CRAP score")
	.option("--max <score>", "Hide entries above this CRAP score")
	.option("--top <n>", "Show only the N worst offenders")
	.option("--only-failures", "Only show functions exceeding the CRAP threshold")
	.option(
		"--missing <policy>",
		"Missing coverage policy: pessimistic, optimistic, skip",
		"pessimistic",
	)
	.option(
		"--exclude <glob>",
		"Skip files matching pattern (repeatable)",
		collect,
		[],
	)
	.option(
		"--allow <glob>",
		"Suppress matching functions (repeatable)",
		collect,
		[],
	)
	.option(
		"--format <fmt>",
		"Output format: human, json, github, markdown, pr-comment, sarif",
		"human",
	)
	.option("--summary", "Print only aggregate stats")
	.option("--fail-above", "Exit 1 if any function exceeds threshold")
	.option("--baseline <file>", "JSON baseline for delta comparison")
	.option("--fail-regression", "Exit 1 if any score increased since baseline")
	.option("--epsilon <value>", "Regression detector tolerance", "0.01")
	.option("--jobs <n>", "Cap parallel analysis threads")
	.option("--workspace", "Analyze all workspace packages")
	.option("--verbose", "Print detailed progress information")
	.option("--watch", "Re-run automatically when files change")
	.option("--changed", "Only analyze uncommitted .ts/.tsx files")
	.option(
		"--duplicates [mode]",
		"Report duplicate functions instead of CRAP scores. Pass 'normalized' for Type-2 near-duplicates (renamed/retyped)",
	)
	.option(
		"--smells [kinds]",
		"Report AI-slop smells (effect bugs, unstable props, console, TODO, index keys). Noisy any/! excluded by default; pass 'all' or a comma list of kinds",
	)
	.option("--dead-code", "Report unused imports instead of CRAP scores")
	.option(
		"--checks",
		"Run all coverage-free checks (duplicates + smells + dead code) in one report. Pair with --changed for pre-commit hooks",
	)
	.option(
		"--sort <fields>",
		"Sort display by comma-separated fields: crap, file, name, path, function, line, cc, cyclomatic, coverage, hooks, renderBranches, type",
		"crap",
	)
	.option("--no-color", "Disable colored output")
	.option("--output <file>", "Write output to file instead of stdout");

program.parse();

const options = program.opts();

const noColor = options.noColor || !!process.env.NO_COLOR;

run({
	lcov: options.lcov,
	path: options.path,
	threshold: parseFloat(options.threshold),
	componentThreshold: options.componentThreshold
		? parseFloat(options.componentThreshold)
		: undefined,
	min: options.min ? parseFloat(options.min) : undefined,
	max: options.max ? parseFloat(options.max) : undefined,
	top: options.top ? parseInt(options.top, 10) : undefined,
	onlyFailures: options.onlyFailures ?? false,
	missing: options.missing,
	exclude: options.exclude,
	allow: options.allow,
	format: options.format,
	summary: options.summary ?? false,
	failAbove: options.failAbove ?? false,
	baseline: options.baseline,
	failRegression: options.failRegression ?? false,
	epsilon: parseFloat(options.epsilon),
	jobs: options.jobs ? parseInt(options.jobs, 10) : undefined,
	workspace: options.workspace ?? false,
	verbose: options.verbose ?? false,
	watch: options.watch ?? false,
	changed: options.changed ?? false,
	duplicates: options.duplicates !== undefined && options.duplicates !== false,
	duplicateMode:
		typeof options.duplicates === "string" ? options.duplicates : undefined,
	smells: options.smells !== undefined && options.smells !== false,
	smellKinds: typeof options.smells === "string" ? options.smells : undefined,
	deadCode: options.deadCode ?? false,
	checks: options.checks ?? false,
	sort: options.sort,
	output: options.output,
	noColor,
}).catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});

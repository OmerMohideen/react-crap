import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import picomatch from "picomatch";
import { hashFile, loadCache, saveCache } from "./cache.js";
import { analyzeComplexity } from "./complexity.js";
import { loadConfig } from "./config.js";
import { parseLcov } from "./coverage.js";
import {
	findDeadImports,
	formatDeadCodeGithub,
	formatDeadCodeHuman,
	formatDeadCodeJson,
} from "./deadcode.js";
import { computeDelta, loadBaseline } from "./delta.js";
import {
	findDuplicates,
	formatDuplicatesGithub,
	formatDuplicatesHuman,
	formatDuplicatesJson,
} from "./duplicates.js";
import { getChangedFiles } from "./git.js";
import { isLineChanged, safeChangedRanges } from "./git-diff.js";
import { merge } from "./merge.js";
import { formatGithub } from "./report/github.js";
import { formatHtml } from "./report/html.js";
import { formatHuman } from "./report/human.js";
import { formatDeltaJson, formatJson } from "./report/json.js";
import { formatMarkdown } from "./report/markdown.js";
import { formatPrComment } from "./report/pr-comment.js";
import { formatSarif } from "./report/sarif.js";
import { filter, score, sortEntries } from "./score.js";
import {
	collectSmells,
	formatSmellsGithub,
	formatSmellsHuman,
	formatSmellsJson,
	resolveKinds,
} from "./smells.js";
import { checkForUpdate, getLocalVersion } from "./version-check.js";
import { walkFiles } from "./walker.js";

export interface RunOptions {
	lcov?: string;
	path: string;
	threshold: number;
	componentThreshold?: number;
	min?: number;
	max?: number;
	top?: number;
	onlyFailures?: boolean;
	missing: string;
	exclude: string[];
	allow: string[];
	format: string;
	summary: boolean;
	failAbove: boolean;
	baseline?: string;
	failRegression: boolean;
	epsilon: number;
	jobs?: number;
	output?: string;
	workspace?: boolean;
	verbose?: boolean;
	watch?: boolean;
	changed?: boolean;
	noColor?: boolean;
	sort?: string;
	duplicates?: boolean;
	duplicateMode?: string;
	smells?: boolean;
	smellKinds?: string;
	deadCode?: boolean;
	checks?: boolean;
	failOnFindings?: boolean;
}

export async function run(rawOptions: RunOptions): Promise<void> {
	const updatePromise = checkForUpdate();
	if (rawOptions.watch) {
		await watchMode(rawOptions, updatePromise);
		return;
	}
	const { exitCode } = await runOnce(rawOptions, updatePromise);
	if (exitCode !== 0) {
		process.exit(exitCode);
	}
}

async function watchMode(
	rawOptions: RunOptions,
	updatePromise: Promise<string | undefined>,
): Promise<void> {
	const { statSync } = await import("node:fs");

	const collectMtimes = (paths: Set<string>) => {
		const mtimes = new Map<string, number>();
		for (const p of paths) {
			try {
				mtimes.set(p, statSync(p).mtimeMs);
			} catch {
				// file may have been deleted
			}
		}
		return mtimes;
	};

	const hasChanges = (
		current: Map<string, number>,
		previous: Map<string, number>,
	) => {
		if (current.size !== previous.size) return true;
		for (const [path, mtime] of current) {
			if (previous.get(path) !== mtime) return true;
		}
		return false;
	};

	// First run
	let result = await runOnce(rawOptions, updatePromise);
	let watchedPaths = result.watchedPaths;
	let lastMtimes = collectMtimes(watchedPaths);

	let previousLineCount = 0;

	// Set up interval polling
	const _interval = setInterval(async () => {
		const current = collectMtimes(watchedPaths);
		if (hasChanges(current, lastMtimes)) {
			if (previousLineCount > 0) {
				// Move cursor up and clear exactly the previous output lines
				process.stdout.write(`\x1b[${previousLineCount}A\x1b[J\x1b[0J`);
				console.error("[watch] Files changed, re-running...\n");
			}

			// Capture line count by overriding console.log temporarily
			const originalLog = console.log;
			let lineCount = 0;
			console.log = (...args: any[]) => {
				const out = args.join(" ");
				lineCount += out.split("\n").length;
				originalLog.apply(console, args);
			};

			result = await runOnce(rawOptions, Promise.resolve(undefined));
			watchedPaths = result.watchedPaths;
			lastMtimes = collectMtimes(watchedPaths);

			console.log = originalLog;
			previousLineCount = lineCount;
		}
	}, 1000);

	// Keep process alive
	return new Promise(() => {
		// never resolves — user hits Ctrl+C
	});
}

async function runOnce(
	rawOptions: RunOptions,
	updatePromise: Promise<string | undefined>,
): Promise<{ watchedPaths: Set<string>; exitCode: number }> {
	const watchedPaths = new Set<string>();
	const config = loadConfig(rawOptions.path);

	// Merge CLI options with config (CLI takes precedence)
	const options: RunOptions = {
		lcov: rawOptions.lcov ?? "coverage/lcov.info",
		path: rawOptions.path,
		threshold: rawOptions.threshold ?? config.threshold ?? 30,
		componentThreshold:
			rawOptions.componentThreshold ?? config.componentThreshold,
		min: rawOptions.min ?? config.min,
		max: rawOptions.max ?? config.max,
		top: rawOptions.top ?? config.top,
		onlyFailures: rawOptions.onlyFailures || config.onlyFailures || false,
		missing: (rawOptions.missing || config.missing || "pessimistic") as any,
		exclude:
			rawOptions.exclude.length > 0
				? rawOptions.exclude
				: (config.exclude ?? []),
		allow:
			rawOptions.allow.length > 0 ? rawOptions.allow : (config.allow ?? []),
		format: rawOptions.format,
		summary: rawOptions.summary,
		failAbove: rawOptions.failAbove || config.failAbove || false,
		baseline: rawOptions.baseline,
		failRegression: rawOptions.failRegression,
		epsilon: rawOptions.epsilon ?? config.epsilon ?? 0.01,
		jobs: rawOptions.jobs ?? 0,
		output: rawOptions.output,
		workspace: rawOptions.workspace || config.workspace || false,
		verbose: rawOptions.verbose || config.verbose || false,
		watch: rawOptions.watch || config.watch || false,
		changed: rawOptions.changed ?? false,
		noColor: rawOptions.noColor || false,
		sort: rawOptions.sort ?? config.sort ?? "crap",
		duplicates: rawOptions.duplicates ?? false,
		duplicateMode: rawOptions.duplicateMode,
		smells: rawOptions.smells ?? false,
		smellKinds: rawOptions.smellKinds,
		deadCode: rawOptions.deadCode ?? false,
		checks: rawOptions.checks ?? false,
		failOnFindings: rawOptions.failOnFindings || config.failOnFindings || false,
	};

	const log = (message: string) => {
		if (options.verbose) console.error(`[react-crap] ${message}`);
	};

	// Zero-config audit: no mode chosen, no --lcov passed, and no coverage file
	// on disk → run the coverage-free checks so a bare `npx react-crap` always
	// does something useful instead of erroring. An explicit --lcov still falls
	// through to the coverage read (which reports a clear error if it's missing).
	const anyCheckMode =
		options.duplicates || options.smells || options.deadCode || options.checks;
	if (
		!anyCheckMode &&
		rawOptions.lcov === undefined &&
		!existsSync(resolve(options.lcov as string))
	) {
		options.checks = true;
		console.error(
			`No LCOV coverage file at ${resolve(options.lcov as string)}. ` +
				`Running coverage-free audit (duplicates + smells + dead code).\n` +
				`For the CRAP score, generate coverage first (e.g. \`npx vitest run --coverage\`) then re-run.\n`,
		);
	}

	if (!["pessimistic", "optimistic", "skip"].includes(options.missing)) {
		throw new Error(`Invalid --missing policy: ${options.missing}`);
	}

	// Determine paths to analyze
	const configPath = resolve(options.path, ".react-crap.json");
	if (existsSync(configPath)) watchedPaths.add(configPath);
	log(`Config loaded from ${configPath}`);
	const pathsToAnalyze = options.workspace
		? discoverWorkspaces(options.path)
		: [options.path];

	if (pathsToAnalyze.length === 0) {
		throw new Error(
			"No workspace packages found. Check --workspace and ensure package.json workspaces or pnpm-workspace.yaml is present.",
		);
	}

	// Collect all source files with their package attribution
	let allFiles: { path: string; package: string }[] = [];
	for (const p of pathsToAnalyze) {
		const sourcePath = resolve(p);
		const files = walkFiles({
			path: sourcePath,
			exclude: options.exclude,
			extensions: [".ts", ".tsx"],
		});
		for (const f of files) {
			allFiles.push({ path: f, package: relativePackagePath(options.path, p) });
			watchedPaths.add(f);
		}
	}

	// Changed-line ranges power line-level (diff-only) scoping for every mode.
	// Computed once here, after the file-level filter, and reused below.
	let changedRanges: Map<string, Set<number>> | undefined;
	if (options.changed) {
		const changedFiles = new Set(getChangedFiles(resolve(options.path)));
		const beforeCount = allFiles.length;
		allFiles = allFiles.filter((f) => changedFiles.has(f.path));
		if (allFiles.length === 0) {
			throw new Error(
				"No uncommitted .ts/.tsx changes found in the analyzed path. " +
					"Changed files may be outside --path or excluded by --exclude.",
			);
		}
		changedRanges = safeChangedRanges(resolve(options.path));
		log(`Filtered to ${allFiles.length} changed file(s) (from ${beforeCount})`);
	}

	if (allFiles.length === 0) {
		throw new Error(
			`No .ts/.tsx files found in ${resolve(options.path)}. Check --path and --exclude flags.`,
		);
	}
	log(`Found ${allFiles.length} source file(s)`);

	// Dead-code (unused imports) needs only the file list — short-circuit here,
	// before coverage and complexity analysis.
	if (options.deadCode) {
		const tsPath = resolveTsPath(resolve(options.path));
		let dead = await findDeadImports(
			allFiles.map((f) => f.path),
			tsPath,
		);
		if (changedRanges) {
			const ranges = changedRanges;
			dead = dead.filter((d) => isLineChanged(d.file, d.line, d.line, ranges));
		}
		log(`Found ${dead.length} unused import(s)`);
		const version = getLocalVersion();
		const output =
			options.format === "json"
				? formatDeadCodeJson(dead, version)
				: options.format === "github"
					? formatDeadCodeGithub(dead)
					: formatDeadCodeHuman(dead, {
							rootPath: resolve(options.path),
							noColor: options.noColor,
						});
		if (options.output) {
			writeFileSync(resolve(options.output), `${output}\n`, "utf-8");
		} else {
			console.log(output);
		}
		const updateMessage = await updatePromise;
		if (updateMessage) console.error(`\n${updateMessage}\n`);
		return {
			watchedPaths,
			exitCode: options.failOnFindings && dead.length > 0 ? 1 : 0,
		};
	}

	// Parse coverage (skipped in --duplicates/--smells modes, which need none)
	let coverageData: ReturnType<typeof parseLcov> = [];
	if (!options.duplicates && !options.smells && !options.checks) {
		const lcovPath = resolve(options.lcov as string);
		watchedPaths.add(lcovPath);
		let lcovContent: string;
		try {
			lcovContent = readFileSync(lcovPath, "utf-8");
		} catch (_e) {
			throw new Error(
				`Cannot read LCOV file at ${lcovPath}. ` +
					`Run your test suite with coverage first (e.g. \`npx vitest run --coverage\`). ` +
					`You can also specify a different path with --lcov.`,
			);
		}
		log(`Parsed LCOV: ${lcovPath}`);
		coverageData = parseLcov(lcovContent);
		log(`Coverage data for ${coverageData.length} file(s)`);
	}

	// Analyze complexity with caching
	const tsPath = resolveTsPath(resolve(options.path));
	const cache = loadCache(resolve(options.path));
	const filesToAnalyze: string[] = [];
	const cachedEntries: import("./complexity.js").ComplexityEntry[] = [];

	for (const f of allFiles) {
		const content = readFileSync(f.path, "utf-8");
		const h = hashFile(content);
		const cacheKey = f.path.replace(/\\/g, "/");
		const cached = cache.files[cacheKey];
		if (cached && cached.hash === h) {
			cachedEntries.push(...cached.functions);
		} else {
			filesToAnalyze.push(f.path);
			cache.files[cacheKey] = { hash: h, functions: [] };
		}
	}

	log(
		`Analyzing complexity for ${filesToAnalyze.length} file(s) (${cachedEntries.length} cached)...`,
	);
	const freshEntries =
		filesToAnalyze.length > 0
			? await analyzeComplexity(
					filesToAnalyze,
					tsPath,
					options.jobs,
					options.verbose
						? (current, total, file) => log(`  ${current}/${total} ${file}`)
						: undefined,
				)
			: [];

	// Update cache with fresh results
	for (const entry of freshEntries) {
		const cacheKey = entry.file.replace(/\\/g, "/");
		const h =
			cache.files[cacheKey]?.hash ??
			hashFile(readFileSync(entry.file, "utf-8"));
		if (!cache.files[cacheKey])
			cache.files[cacheKey] = { hash: h, functions: [] };
		cache.files[cacheKey].functions.push(entry);
	}
	saveCache(resolve(options.path), cache);

	let complexity = [...cachedEntries, ...freshEntries];
	log(`Found ${complexity.length} function(s)`);

	// Diff-only scoping: keep only functions overlapping a changed line. Covers
	// every downstream consumer (duplicates, smells, checks, and the CRAP path).
	if (changedRanges) {
		const ranges = changedRanges;
		const beforeCount = complexity.length;
		complexity = complexity.filter((e) =>
			isLineChanged(e.file, e.line, e.endLine, ranges),
		);
		log(
			`Filtered to ${complexity.length} changed function(s) (from ${beforeCount})`,
		);
	}

	// Duplicate detection: group functions by body hash, report clones. Runs
	// independently of coverage/scoring, so short-circuit here.
	if (options.duplicates) {
		if (options.duplicateMode && options.duplicateMode !== "normalized") {
			throw new Error(
				`Unknown --duplicates mode "${options.duplicateMode}". ` +
					`Use --duplicates (exact) or --duplicates normalized. ` +
					`Did you mean to pass a flag like --format with a leading "--"?`,
			);
		}
		const normalized = options.duplicateMode === "normalized";
		const groups = findDuplicates(complexity, { normalized });
		log(`Found ${groups.length} duplicate group(s)`);
		const version = getLocalVersion();
		const output =
			options.format === "json"
				? formatDuplicatesJson(groups, version)
				: options.format === "github"
					? formatDuplicatesGithub(groups)
					: formatDuplicatesHuman(groups, {
							rootPath: resolve(options.path),
							noColor: options.noColor,
						});
		if (options.output) {
			writeFileSync(resolve(options.output), `${output}\n`, "utf-8");
		} else {
			console.log(output);
		}
		const updateMessage = await updatePromise;
		if (updateMessage) console.error(`\n${updateMessage}\n`);
		// --fail-above gates CRAP scores; --fail-on-findings gates the checks.
		return {
			watchedPaths,
			exitCode: options.failOnFindings && groups.length > 0 ? 1 : 0,
		};
	}

	// AI-slop smell detection. Also coverage-independent — short-circuit here.
	if (options.smells) {
		const rows = collectSmells(complexity, resolveKinds(options.smellKinds));
		log(`Found smells in ${rows.length} function(s)`);
		const version = getLocalVersion();
		const output =
			options.format === "json"
				? formatSmellsJson(rows, version)
				: options.format === "github"
					? formatSmellsGithub(rows)
					: formatSmellsHuman(rows, {
							rootPath: resolve(options.path),
							noColor: options.noColor,
						});
		if (options.output) {
			writeFileSync(resolve(options.output), `${output}\n`, "utf-8");
		} else {
			console.log(output);
		}
		const updateMessage = await updatePromise;
		if (updateMessage) console.error(`\n${updateMessage}\n`);
		return {
			watchedPaths,
			exitCode: options.failOnFindings && rows.length > 0 ? 1 : 0,
		};
	}

	// Combined report: all coverage-independent AST checks in one pass. Built
	// for pre-commit hooks (pair with --changed to scope to staged files).
	if (options.checks) {
		const version = getLocalVersion();
		const dups = findDuplicates(complexity);
		const smellRows = collectSmells(
			complexity,
			resolveKinds(options.smellKinds),
		);
		let dead = await findDeadImports(
			allFiles.map((f) => f.path),
			resolveTsPath(resolve(options.path)),
		);
		if (changedRanges) {
			const ranges = changedRanges;
			dead = dead.filter((d) => isLineChanged(d.file, d.line, d.line, ranges));
		}
		log(
			`checks: ${dups.length} dup group(s), ${smellRows.length} smelly fn(s), ${dead.length} dead import(s)`,
		);

		let output: string;
		if (options.format === "json") {
			output = JSON.stringify(
				{
					version,
					duplicates: dups,
					smells: smellRows,
					deadImports: dead,
				},
				null,
				2,
			);
		} else if (options.format === "github") {
			output = [
				formatDuplicatesGithub(dups),
				formatSmellsGithub(smellRows),
				formatDeadCodeGithub(dead),
			]
				.filter(Boolean)
				.join("\n");
		} else {
			const rootPath = resolve(options.path);
			const nc = options.noColor;
			output = [
				"━━ Duplicates ━━",
				formatDuplicatesHuman(dups, { rootPath, noColor: nc }),
				"\n━━ Smells ━━",
				formatSmellsHuman(smellRows, { rootPath, noColor: nc }),
				"\n━━ Dead code ━━",
				formatDeadCodeHuman(dead, { rootPath, noColor: nc }),
			].join("\n");
		}

		if (options.output) {
			writeFileSync(resolve(options.output), `${output}\n`, "utf-8");
		} else {
			console.log(output);
		}
		const updateMessage = await updatePromise;
		if (updateMessage) console.error(`\n${updateMessage}\n`);
		const findings = dups.length + smellRows.length + dead.length;
		return {
			watchedPaths,
			exitCode: options.failOnFindings && findings > 0 ? 1 : 0,
		};
	}

	// Attach package info to complexity entries
	const fileToPackage = new Map(allFiles.map((f) => [f.path, f.package]));
	for (const c of complexity) {
		(c as any).package = fileToPackage.get(c.file) ?? "default";
	}

	// complexity was already scoped to changed lines above (shared by all modes).
	// For the CRAP path an empty result is a usage error worth surfacing.
	if (options.changed && complexity.length === 0) {
		throw new Error(
			"No changed functions found in the analyzed path. " +
				"Changed lines may be outside any function body.",
		);
	}

	// Merge
	log("Merging coverage and complexity data...");
	const merged = merge(complexity, coverageData, resolve(options.path));
	log(`Merged ${merged.length} function(s)`);

	// Score
	const scored = score(merged, {
		missing: options.missing as any,
		threshold: options.threshold,
	});
	log(`Scored ${scored.length} function(s)`);

	// Filter
	const filtered = filter(scored, {
		min: options.min,
		max: options.max,
		top: options.top,
		onlyFailures: options.onlyFailures,
		threshold: options.threshold,
		componentThreshold: options.componentThreshold,
	});
	log(`After filters: ${filtered.length} function(s)`);

	// Apply user-facing sort order after filtering so --top always picks the worst
	const sorted = sortEntries(filtered, options.sort);

	// Apply allow list
	const isAllowed = picomatch(options.allow);
	const visible = sorted.filter((e) => {
		if (options.allow.length === 0) return true;
		if (isAllowed(e.function)) return false;
		if (isAllowed(e.file)) return false;
		return true;
	});

	// Auto-cap TTY output to avoid flooding the terminal
	let autoCapped = false;
	const AUTO_TOP = 50;
	if (
		process.stdout.isTTY &&
		!options.output &&
		!options.summary &&
		options.top === undefined &&
		options.min === undefined &&
		options.max === undefined &&
		options.onlyFailures === false &&
		visible.length > AUTO_TOP
	) {
		visible.splice(AUTO_TOP);
		autoCapped = true;
	}

	// Delta mode
	let output = "";
	let exitCode = 0;
	const version = getLocalVersion();
	const updateMessage = await updatePromise;

	if (options.baseline) {
		const baseline = loadBaseline(resolve(options.baseline));
		const delta = computeDelta(visible, baseline, options.epsilon);

		switch (options.format) {
			case "json":
				output = formatDeltaJson(delta, version);
				break;
			case "pr-comment":
				output = formatPrComment(delta, options.threshold);
				break;
			default:
				output = formatHuman(delta.entries as any, {
					threshold: options.threshold,
					summary: options.summary,
					baseline: true,
					workspace: options.workspace,
					noColor: options.noColor,
				});
				if (delta.removed.length > 0) {
					output +=
						"\n\nRemoved:\n" +
						delta.removed
							.map((r) => `  - ${r.function} (${r.file})`)
							.join("\n");
				}
				break;
		}

		if (options.failRegression) {
			const regressions = delta.entries.filter((e) => e.status === "Increased");
			if (regressions.length > 0) {
				exitCode = 1;
			}
		}
	} else {
		switch (options.format) {
			case "json":
				output = formatJson(visible, version);
				break;
			case "github":
				output = formatGithub(visible, options.threshold);
				break;
			case "markdown":
				output = formatMarkdown(visible, options.threshold);
				break;
			case "html":
				output = formatHtml(visible, options.threshold);
				break;
			case "pr-comment":
				throw new Error("--format pr-comment requires --baseline");
			case "sarif":
				output = formatSarif(visible, options.threshold, version);
				break;
			default:
				output = formatHuman(visible, {
					threshold: options.threshold,
					summary: options.summary,
					workspace: options.workspace,
					noColor: options.noColor,
					rootPath: resolve(options.path),
				});
				break;
		}

		if (options.failAbove) {
			const violations = visible.filter(
				(e) => e.crap > (e.threshold ?? options.threshold),
			);
			if (violations.length > 0) {
				exitCode = 1;
			}
		}
	}

	if (autoCapped) {
		output =
			`Showing top ${AUTO_TOP} of ${scored.length} functions. Use --top or --min to adjust.\n\n` +
			output;
	}

	if (options.output) {
		writeFileSync(resolve(options.output), `${output}\n`, "utf-8");
	} else {
		console.log(output);
	}

	if (updateMessage) {
		console.error(`\n${updateMessage}\n`);
	}

	return { watchedPaths, exitCode };
}

function relativePackagePath(root: string, pkg: string): string {
	const rel =
		resolve(root) === resolve(pkg)
			? "."
			: resolve(pkg).replace(`${resolve(root)}/`, "");
	return rel.replace(/\\/g, "/");
}

function resolveTsPath(projectPath: string): string | undefined {
	try {
		const req = createRequire(resolve(projectPath, "package.json"));
		return req.resolve("typescript");
	} catch {
		return undefined;
	}
}

function discoverWorkspaces(root: string): string[] {
	const rootPath = resolve(root);

	// Try pnpm-workspace.yaml
	const pnpmPath = resolve(rootPath, "pnpm-workspace.yaml");
	if (existsSync(pnpmPath)) {
		try {
			const content = readFileSync(pnpmPath, "utf-8");
			const packages: string[] = [];
			for (const line of content.split(/\r?\n/)) {
				if (line.startsWith("  - ") || line.startsWith("- ")) {
					const pattern = line
						.replace(/^\s*-\s*['"]?/, "")
						.replace(/['"]?$/, "");
					packages.push(resolve(rootPath, pattern.replace(/\*\*$/, "")));
				}
			}
			return packages;
		} catch {
			// fall through
		}
	}

	// Try package.json workspaces
	const pkgPath = resolve(rootPath, "package.json");
	if (existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
			if (Array.isArray(pkg.workspaces)) {
				return pkg.workspaces.map((p: string) => resolve(rootPath, p));
			}
			if (pkg.workspaces?.packages && Array.isArray(pkg.workspaces.packages)) {
				return pkg.workspaces.packages.map((p: string) => resolve(rootPath, p));
			}
		} catch {
			// fall through
		}
	}

	return [rootPath];
}

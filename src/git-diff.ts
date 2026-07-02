import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { classifyGitError } from "./git.js";

export function getChangedLineRanges(
	projectPath: string,
): Map<string, Set<number>> {
	let gitRoot: string;
	try {
		gitRoot = execSync("git rev-parse --show-toplevel", {
			encoding: "utf-8",
			stdio: "pipe",
			cwd: projectPath,
		}).trim();
	} catch (e) {
		throw classifyGitError(e, projectPath);
	}

	const diffCmd = "git diff --no-relative --unified=0 HEAD";

	let diffOutput: string;
	try {
		diffOutput = execSync(diffCmd, {
			encoding: "utf-8",
			stdio: "pipe",
			cwd: projectPath,
		});
	} catch (e) {
		throw classifyGitError(e, projectPath);
	}

	const result = new Map<string, Set<number>>();
	let currentFile: string | null = null;

	for (const rawLine of diffOutput.split(/\r?\n/)) {
		const line = rawLine.trimEnd();

		const diffGitMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
		if (diffGitMatch) {
			currentFile = resolve(gitRoot, diffGitMatch[2]);
			continue;
		}

		const hunkMatch = line.match(
			/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/,
		);
		if (hunkMatch && currentFile) {
			const start = parseInt(hunkMatch[1], 10);
			const count = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;

			if (!result.has(currentFile)) {
				result.set(currentFile, new Set<number>());
			}
			const lines = result.get(currentFile)!;

			if (count === 0) {
				lines.add(start);
			} else {
				for (let l = start; l < start + count; l++) {
					lines.add(l);
				}
			}
		}
	}

	const filtered = new Map<string, Set<number>>();
	for (const [file, lines] of result) {
		if (file.endsWith(".ts") || file.endsWith(".tsx")) {
			filtered.set(file, lines);
		}
	}

	if (filtered.size === 0) {
		throw new Error("No uncommitted .ts/.tsx changes found.");
	}

	return filtered;
}

// Normalize map keys to forward slashes. TS sourceFile.fileName is always
// forward-slashed; getChangedLineRanges keys are resolve()'d (backslash on
// Windows), so callers compare against this normalized view.
export function normalizeRanges(
	ranges: Map<string, Set<number>>,
): Map<string, Set<number>> {
	const m = new Map<string, Set<number>>();
	for (const [f, l] of ranges) m.set(f.replace(/\\/g, "/"), l);
	return m;
}

// Like getChangedLineRanges but never throws on "no tracked-line changes" —
// returns an empty map instead. An empty map means every entry in an
// already-changed file is treated as new (e.g. brand-new untracked files,
// which git diff HEAD doesn't report as hunks). Git availability is validated
// by getChangedFiles before this runs, so a throw here can only be the
// "no changes" case.
export function safeChangedRanges(
	projectPath: string,
): Map<string, Set<number>> {
	try {
		return normalizeRanges(getChangedLineRanges(projectPath));
	} catch {
		return new Map();
	}
}

// Does [line, endLine] of `file` overlap a changed line? An absent file means
// it changed but produced no diff hunks (new/untracked) — whole file is new.
export function isLineChanged(
	file: string,
	line: number,
	endLine: number,
	ranges: Map<string, Set<number>>,
): boolean {
	const fileLines = ranges.get(file.replace(/\\/g, "/"));
	if (!fileLines) return true;
	for (let l = line; l <= endLine; l++) {
		if (fileLines.has(l)) return true;
	}
	return false;
}

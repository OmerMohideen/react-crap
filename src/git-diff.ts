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

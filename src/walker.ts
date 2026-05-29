import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ignore from "ignore";
import picomatch from "picomatch";

export interface WalkOptions {
	path: string;
	exclude: string[];
	extensions: string[];
}

interface IgnoreEntry {
	dir: string;
	ig: ReturnType<typeof ignore>;
}

export function walkFiles(options: WalkOptions): string[] {
	const files: string[] = [];
	const isExcluded = picomatch(options.exclude, { dot: true });

	// Stack of .gitignore instances, one per directory that has one
	const ignoreStack: IgnoreEntry[] = [];

	function loadGitignore(dir: string): void {
		const gitignorePath = join(dir, ".gitignore");
		if (existsSync(gitignorePath)) {
			try {
				const content = readFileSync(gitignorePath, "utf-8");
				const ig = ignore();
				ig.add(content);
				ignoreStack.push({ dir, ig });
			} catch {
				// Ignore failed .gitignore reads
			}
		}
	}

	function popGitignore(dir: string): void {
		const last = ignoreStack[ignoreStack.length - 1];
		if (last && last.dir === dir) {
			ignoreStack.pop();
		}
	}

	function isIgnored(relPath: string): boolean {
		for (const entry of ignoreStack) {
			const relFromDir = relative(entry.dir, join(options.path, relPath));
			if (entry.ig.ignores(relFromDir)) {
				return true;
			}
		}
		return false;
	}

	loadGitignore(options.path);

	function recurse(dir: string): void {
		loadGitignore(dir);

		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			const relPath = relative(options.path, fullPath);

			if (isExcluded(relPath) || isExcluded(entry.name)) {
				continue;
			}

			if (isIgnored(relPath)) {
				continue;
			}

			if (entry.isDirectory()) {
				if (entry.name === "node_modules") continue;
				recurse(fullPath);
			} else if (entry.isFile()) {
				const ext = entry.name.slice(entry.name.lastIndexOf("."));
				if (options.extensions.includes(ext)) {
					files.push(fullPath);
				}
			}
		}

		popGitignore(dir);
	}

	recurse(options.path);
	return files;
}

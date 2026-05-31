import { execSync } from "node:child_process";
import { resolve } from "node:path";

function classifyGitError(e: unknown, projectPath: string): Error {
	const err = e as { code?: string; status?: number; stderr?: Buffer };
	if (err.code === "ENOENT") {
		return new Error("Git is required for --changed.");
	}
	if (err.stderr?.toString().includes("unknown revision 'HEAD'")) {
		return new Error(`Git repository at ${projectPath} has no commits.`);
	}
	if (
		err.status === 128 ||
		err.stderr?.toString().includes("not a git repository")
	) {
		return new Error(`No git repository found at ${projectPath}.`);
	}
	return e instanceof Error ? e : new Error(String(e));
}

export function getChangedFiles(projectPath: string): string[] {
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

	const diffCmd = "git diff --no-relative --name-only HEAD";
	const untrackedCmd = "git ls-files --others --exclude-standard --full-name";

	let diffOutput = "";
	let untrackedOutput = "";

	try {
		diffOutput = execSync(diffCmd, {
			encoding: "utf-8",
			stdio: "pipe",
			cwd: projectPath,
		});
	} catch (e) {
		throw classifyGitError(e, projectPath);
	}

	try {
		untrackedOutput = execSync(untrackedCmd, {
			encoding: "utf-8",
			stdio: "pipe",
			cwd: projectPath,
		});
	} catch {
		// If ls-files fails, just proceed with diff output
	}

	const allNames = new Set<string>();
	for (const line of diffOutput.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed) allNames.add(trimmed);
	}
	for (const line of untrackedOutput.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed) allNames.add(trimmed);
	}

	const result: string[] = [];
	for (const name of allNames) {
		if (name.endsWith(".ts") || name.endsWith(".tsx")) {
			result.push(resolve(gitRoot, name));
		}
	}

	if (result.length === 0) {
		throw new Error("No uncommitted .ts/.tsx changes found.");
	}

	return result;
}

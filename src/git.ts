import { execSync } from "node:child_process";
import { resolve } from "node:path";

export function getChangedFiles(projectPath: string): string[] {
	const diffCmd = "git diff --name-only HEAD";
	const untrackedCmd =
		"git ls-files --others --exclude-standard -- '*.ts' '*.tsx'";

	let diffOutput = "";
	let untrackedOutput = "";

	try {
		diffOutput = execSync(diffCmd, {
			encoding: "utf-8",
			stdio: "pipe",
			cwd: projectPath,
		});
	} catch (e: any) {
		if (e.code === "ENOENT") {
			throw new Error("Git is required for --changed.");
		}
		if (
			e.status === 128 ||
			(e.stderr && e.stderr.toString().includes("not a git repository"))
		) {
			throw new Error(`No git repository found at ${projectPath}.`);
		}
		throw e;
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
			result.push(resolve(projectPath, name).replace(/\\/g, "/"));
		}
	}

	if (result.length === 0) {
		throw new Error("No uncommitted .ts/.tsx changes found.");
	}

	return result;
}

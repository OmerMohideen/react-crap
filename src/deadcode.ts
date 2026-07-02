import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import Table from "cli-table3";
import pc from "picocolors";
import { scriptKind } from "./complexity.js";
import { schemaUrl } from "./report/schema.js";

export interface DeadImport {
	file: string;
	name: string;
	line: number;
}

// Syntactic unused-import detection: an imported binding whose name never
// appears anywhere else in the same file. No type-checker, so this is the
// highest-confidence slice of dead code (AI's classic "imported but unused").
// ponytail: imports only — unused locals/params/exports are out of scope
// (higher false-positive risk without a real type-checker / cross-file graph).
export async function findDeadImports(
	files: string[],
	tsPath?: string,
): Promise<DeadImport[]> {
	const tsMod = tsPath ? require(tsPath) : require("typescript");
	const dead: DeadImport[] = [];

	for (const file of files) {
		const content = await readFile(file, "utf-8");
		const sourceFile = tsMod.createSourceFile(
			file,
			content,
			tsMod.ScriptTarget.ES2022,
			true,
			scriptKind(file, tsMod),
		);

		// Collect import binding identifier nodes (default / named / namespace).
		const bindings: { node: any; name: string }[] = [];
		for (const stmt of sourceFile.statements) {
			if (!tsMod.isImportDeclaration(stmt) || !stmt.importClause) continue;
			const clause = stmt.importClause;
			if (clause.name)
				bindings.push({ node: clause.name, name: clause.name.text });
			const nb = clause.namedBindings;
			if (nb && tsMod.isNamespaceImport(nb))
				bindings.push({ node: nb.name, name: nb.name.text });
			if (nb && tsMod.isNamedImports(nb)) {
				for (const el of nb.elements)
					bindings.push({ node: el.name, name: el.name.text });
			}
		}
		if (bindings.length === 0) continue;

		const bindingNodes = new Set(bindings.map((b) => b.node));
		const used = new Map<string, number>();
		(function walk(node: any) {
			if (tsMod.isIdentifier(node) && !bindingNodes.has(node)) {
				used.set(node.text, (used.get(node.text) ?? 0) + 1);
			}
			tsMod.forEachChild(node, walk);
		})(sourceFile);

		for (const b of bindings) {
			if ((used.get(b.name) ?? 0) === 0) {
				const line =
					sourceFile.getLineAndCharacterOfPosition(b.node.getStart(sourceFile))
						.line + 1;
				dead.push({ file: sourceFile.fileName, name: b.name, line });
			}
		}
	}

	return dead;
}

export function formatDeadCodeHuman(
	dead: DeadImport[],
	opts: { rootPath?: string; noColor?: boolean } = {},
): string {
	const c = opts.noColor
		? { yellow: (s: string) => s, gray: (s: string) => s }
		: pc;
	const loc = (file: string, line: number) =>
		opts.rootPath
			? `${relative(opts.rootPath, file).replace(/\\/g, "/")}:${line}`
			: `${file}:${line}`;

	if (dead.length === 0) return c.gray("No unused imports found.");

	const table = new Table({
		head: ["Unused import", "Location"],
		style: { head: [], border: [] },
		wordWrap: true,
	});
	for (const d of dead) table.push([c.yellow(d.name), loc(d.file, d.line)]);

	return [
		c.yellow(`Found ${dead.length} unused import(s):`),
		table.toString() as string,
	].join("\n");
}

// GitHub Actions annotations: one ::warning per unused import.
export function formatDeadCodeGithub(dead: DeadImport[]): string {
	return dead
		.map((d) => {
			const file = relative(process.cwd(), d.file).replace(/\\/g, "/");
			return `::warning file=${file},line=${d.line},title=react-crap/dead-code::Unused import '${d.name}'`;
		})
		.join("\n");
}

export function formatDeadCodeJson(
	dead: DeadImport[],
	version: string,
): string {
	return JSON.stringify(
		{ $schema: schemaUrl("dead-code-v1.json"), version, deadImports: dead },
		null,
		2,
	);
}

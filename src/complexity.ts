import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export type SmellKind =
	| "effect-missing-deps"
	| "effect-missing-cleanup"
	| "effect-derived-state"
	| "unstable-prop"
	| "type-any"
	| "non-null-assertion"
	| "as-any"
	| "ts-suppress"
	| "console"
	| "todo"
	| "placeholder"
	| "index-as-key"
	| "passthrough-wrapper"
	| "test-no-assert"
	| "component-in-render"
	| "dangerous-html"
	| "eval-usage"
	| "loose-equality"
	| "var-keyword";

export interface Smell {
	kind: SmellKind;
	detail: string;
	line: number;
}

// Parse .ts as TS (not TSX) so generic arrows `const f = <T>(x) =>` aren't
// misread as JSX. Only .tsx/.jsx get the JSX grammar.
export function scriptKind(file: string, tsMod: any): any {
	if (file.endsWith(".tsx")) return tsMod.ScriptKind.TSX;
	if (file.endsWith(".jsx")) return tsMod.ScriptKind.JSX;
	if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs"))
		return tsMod.ScriptKind.JS;
	return tsMod.ScriptKind.TS;
}

export interface ComplexityEntry {
	file: string;
	function: string;
	line: number;
	endLine: number;
	cyclomatic: number;
	bodyHash: string;
	structuralHash: string;
	normalizedHash: string;
	threshold?: number;
	hooks: string[];
	hookViolations: string[];
	isComponent: boolean;
	renderBranches: number;
	smells: Smell[];
}

export async function analyzeComplexity(
	files: string[],
	tsPath?: string,
	jobs?: number,
	onProgress?: (current: number, total: number, file: string) => void,
): Promise<ComplexityEntry[]> {
	const tsMod = tsPath ? require(tsPath) : require("typescript");
	const concurrency = jobs && jobs > 0 ? jobs : files.length;

	const tasks = files.map(
		(file, index) => () =>
			analyzeFile(file, tsMod, onProgress, index + 1, files.length),
	);
	const batches: (() => Promise<ComplexityEntry[]>)[][] = [];

	for (let i = 0; i < tasks.length; i += concurrency) {
		batches.push(tasks.slice(i, i + concurrency));
	}

	const results: ComplexityEntry[] = [];
	for (const batch of batches) {
		const batchResults = await Promise.all(batch.map((t) => t()));
		for (const r of batchResults) results.push(...r);
	}

	return results;
}

async function analyzeFile(
	file: string,
	tsMod: any,
	onProgress?: (current: number, total: number, file: string) => void,
	current?: number,
	total?: number,
): Promise<ComplexityEntry[]> {
	const content = await readFile(file, "utf-8");
	const sourceFile = tsMod.createSourceFile(
		file,
		content,
		tsMod.ScriptTarget.ES2022,
		true, // setParentNodes
		scriptKind(file, tsMod),
	);

	if (onProgress && current && total) {
		onProgress(current, total, file);
	}

	const results: ComplexityEntry[] = [];

	function visit(node: any) {
		if (
			tsMod.isFunctionDeclaration(node) ||
			tsMod.isFunctionExpression(node) ||
			tsMod.isArrowFunction(node) ||
			tsMod.isMethodDeclaration(node) ||
			tsMod.isGetAccessor(node) ||
			tsMod.isSetAccessor(node)
		) {
			if (isIgnored(node, sourceFile, tsMod)) {
				return;
			}

			const name = getFunctionName(node);
			const start = node.getStart(sourceFile);
			const end = node.getEnd();
			const line = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
			const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
			const cc = 1 + countBranches(node);
			const bodyText = sourceFile.text.substring(start, end);
			const bodyHash = createHash("sha256")
				.update(bodyText)
				.digest("hex")
				.slice(0, 16);
			const structuralHash = createHash("sha256")
				.update(structuralFingerprint(node, tsMod))
				.digest("hex")
				.slice(0, 16);
			const normalizedHash = createHash("sha256")
				.update(structuralFingerprint(node, tsMod, true))
				.digest("hex")
				.slice(0, 16);
			const threshold = getThreshold(node, sourceFile, tsMod);
			const hooks: string[] = [];
			const hookViolations: string[] = [];
			collectHooks(node, sourceFile, tsMod, hooks, hookViolations, true);
			const isComponent = detectComponent(node, sourceFile, tsMod);
			const renderBranches = countRenderBranches(node, sourceFile, tsMod);
			const smells = detectSmells(node, sourceFile, tsMod, bodyText);

			results.push({
				file: sourceFile.fileName,
				function: name,
				line,
				endLine,
				cyclomatic: cc,
				bodyHash,
				structuralHash,
				normalizedHash,
				threshold,
				hooks,
				hookViolations,
				isComponent,
				renderBranches,
				smells,
			});
		}

		tsMod.forEachChild(node, visit);
	}

	function isIgnored(node: any, sourceFile: any, tsMod: any): boolean {
		const ranges = tsMod.getLeadingCommentRanges(
			sourceFile.text,
			node.getFullStart(),
		);
		if (!ranges) return false;
		for (const range of ranges) {
			const text = sourceFile.text.substring(range.pos, range.end);
			if (text.includes("react-crap-ignore")) return true;
		}
		return false;
	}

	function getThreshold(
		node: any,
		sourceFile: any,
		tsMod: any,
	): number | undefined {
		const ranges = tsMod.getLeadingCommentRanges(
			sourceFile.text,
			node.getFullStart(),
		);
		if (!ranges) return undefined;
		for (const range of ranges) {
			const text = sourceFile.text.substring(range.pos, range.end);
			const match = text.match(/@crap-threshold\s+(\d+(?:\.\d+)?)/);
			if (match) return parseFloat(match[1]);
		}
		return undefined;
	}

	function getFunctionName(node: any): string {
		if (tsMod.isFunctionDeclaration(node) && node.name) {
			return node.name.text;
		}
		if (
			tsMod.isMethodDeclaration(node) ||
			tsMod.isGetAccessor(node) ||
			tsMod.isSetAccessor(node)
		) {
			if (tsMod.isIdentifier(node.name)) return node.name.text;
			if (tsMod.isStringLiteral(node.name)) return node.name.text;
			if (tsMod.isComputedPropertyName(node.name)) return "<computed>";
		}
		if (tsMod.isArrowFunction(node) || tsMod.isFunctionExpression(node)) {
			const name = resolveAnonymousName(node);
			if (name) return name;
		}
		return "<unknown>";
	}

	function resolveAnonymousName(node: any): string | undefined {
		const parent = node.parent;
		if (!parent) return undefined;

		// Direct variable declaration: const foo = () => {}
		if (
			tsMod.isVariableDeclaration(parent) &&
			tsMod.isIdentifier(parent.name)
		) {
			return parent.name.text;
		}

		// Object property: { handler: () => {} }
		if (tsMod.isPropertyAssignment(parent) && tsMod.isIdentifier(parent.name)) {
			return parent.name.text;
		}

		// Shorthand property: { handler }
		if (tsMod.isShorthandPropertyAssignment(parent)) {
			return parent.name.text;
		}

		// Class property: handler = () => {}
		if (
			tsMod.isPropertyDeclaration(parent) &&
			tsMod.isIdentifier(parent.name)
		) {
			return parent.name.text;
		}

		// Call expression argument: foo(() => {}) or obj.method(() => {})
		if (tsMod.isCallExpression(parent) || tsMod.isNewExpression(parent)) {
			const callName = getCallExpressionName(parent);
			if (callName) return `${callName} callback`;
			return "<callback>";
		}

		// JSX: <Component onClick={() => {}} /> or <Sheet>{() => ...}</Sheet>
		if (
			typeof tsMod.isJsxExpression === "function" &&
			tsMod.isJsxExpression(parent)
		) {
			const jsxParent = parent.parent;
			if (
				tsMod.isJsxAttribute(jsxParent) &&
				tsMod.isIdentifier(jsxParent.name)
			) {
				return `${jsxParent.name.text} handler`;
			}
			// JSX element child: <Sheet>{() => ...}</Sheet>
			const jsxName = getJsxElementName(jsxParent);
			if (jsxName) return `${jsxName} child`;
		}

		// Array element: [() => {}]
		if (tsMod.isArrayLiteralExpression(parent)) {
			return "<array callback>";
		}

		// Return statement: return () => {}
		if (tsMod.isReturnStatement(parent)) {
			const enclosing = getEnclosingFunctionName(node);
			if (enclosing) return `${enclosing} return`;
			return "<returned fn>";
		}

		// Nested inside another expression, try to extract something useful
		if (
			tsMod.isBinaryExpression(parent) ||
			tsMod.isConditionalExpression(parent)
		) {
			const enclosing = getEnclosingFunctionName(node);
			if (enclosing) return `${enclosing} expression`;
		}

		// Parenthesized expression: (() => {}) or (async () => {})
		if (tsMod.isParenthesizedExpression(parent)) {
			const enclosing = getEnclosingFunctionName(node);
			if (enclosing) return `${enclosing} IIFE`;
			return "<IIFE>";
		}

		// Nested inside another function: const f = () => () => {}
		if (tsMod.isArrowFunction(parent) || tsMod.isFunctionExpression(parent)) {
			const enclosing = getEnclosingFunctionName(node);
			if (enclosing) return `${enclosing} nested`;
			return "<nested fn>";
		}

		// Export default: export default () => {}
		if (tsMod.isExportAssignment(parent)) {
			return "<default export>";
		}

		return undefined;
	}

	function getCallExpressionName(callNode: any): string | undefined {
		const expr = callNode.expression;
		if (tsMod.isIdentifier(expr)) return expr.text;
		if (tsMod.isPropertyAccessExpression(expr)) {
			const right = expr.name;
			if (tsMod.isIdentifier(right)) return right.text;
		}
		return undefined;
	}

	function getJsxElementName(jsxNode: any): string | undefined {
		// JsxElement -> JsxOpeningElement -> tagName
		if (tsMod.isJsxElement(jsxNode) && jsxNode.openingElement) {
			const tagName = jsxNode.openingElement.tagName;
			if (tagName && tsMod.isIdentifier(tagName)) {
				return tagName.text;
			}
			if (tagName && tsMod.isJsxMemberExpression(tagName)) {
				const right = tagName.name;
				if (tsMod.isIdentifier(right)) return right.text;
			}
		}
		// JsxSelfClosingElement: <Component />
		if (tsMod.isJsxSelfClosingElement?.(jsxNode)) {
			const tagName = jsxNode.tagName;
			if (tagName && tsMod.isIdentifier(tagName)) return tagName.text;
			if (tagName && tsMod.isJsxMemberExpression(tagName)) {
				const right = tagName.name;
				if (tsMod.isIdentifier(right)) return right.text;
			}
		}
		// JsxFragment: <></>
		if (
			typeof tsMod.isJsxFragment === "function" &&
			tsMod.isJsxFragment(jsxNode)
		) {
			return "Fragment";
		}
		return undefined;
	}

	function getEnclosingFunctionName(node: any): string | undefined {
		let current = node.parent;
		while (current) {
			if (tsMod.isFunctionDeclaration(current) && current.name) {
				return current.name.text;
			}
			if (tsMod.isMethodDeclaration(current)) {
				if (tsMod.isIdentifier(current.name)) return current.name.text;
			}
			if (
				tsMod.isArrowFunction(current) ||
				tsMod.isFunctionExpression(current)
			) {
				// Try to resolve this anonymous function's name from its parent
				const resolved = resolveAnonymousName(current);
				if (resolved) return resolved;
			}
			current = current.parent;
		}
		return undefined;
	}

	// AI-slop smell detection. Scans a function's OWN body (does not recurse
	// into nested functions — each gets its own entry), with special handling
	// for useEffect callbacks. ponytail: heuristic, not a type-checker — favours
	// few false positives over completeness.
	function detectSmells(
		fnNode: any,
		sourceFile: any,
		tsMod: any,
		bodyText: string,
	): Smell[] {
		const smells: Smell[] = [];
		const lineOf = (n: any) =>
			sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line + 1;

		const isFn = (n: any) =>
			tsMod.isArrowFunction(n) ||
			tsMod.isFunctionExpression(n) ||
			tsMod.isFunctionDeclaration(n) ||
			tsMod.isMethodDeclaration(n);

		const calleeName = (expr: any): string | undefined => {
			if (tsMod.isIdentifier(expr)) return expr.text;
			if (
				tsMod.isPropertyAccessExpression(expr) &&
				tsMod.isIdentifier(expr.name)
			)
				return expr.name.text;
			return undefined;
		};

		// Leftmost identifier of a call/member chain: it.only -> "it",
		// expect(x).toBe -> "expect".
		const baseCalleeName = (expr: any): string | undefined => {
			let e = expr;
			while (e) {
				if (tsMod.isIdentifier(e)) return e.text;
				if (tsMod.isPropertyAccessExpression(e)) e = e.expression;
				else if (tsMod.isCallExpression(e)) e = e.expression;
				else if (tsMod.isParenthesizedExpression(e)) e = e.expression;
				else return undefined;
			}
			return undefined;
		};

		// If this function is the callback of a .map()/.forEach(), its 2nd param
		// is the loop index — flag `key={index}` uses below.
		let indexParam: string | undefined;
		const parent = fnNode.parent;
		if (
			parent &&
			tsMod.isCallExpression(parent) &&
			/^(map|forEach|flatMap)$/.test(calleeName(parent.expression) ?? "") &&
			fnNode.parameters?.length >= 2 &&
			tsMod.isIdentifier(fnNode.parameters[1].name)
		) {
			indexParam = fnNode.parameters[1].name.text;
		}

		// Passthrough wrapper: a component whose whole body is `return <X {...p} />`
		// — AI over-abstraction that adds a layer doing nothing.
		(function checkPassthrough() {
			const body = fnNode.body;
			if (!body) return;
			let ret: any;
			if (tsMod.isBlock(body)) {
				if (
					body.statements.length === 1 &&
					tsMod.isReturnStatement(body.statements[0])
				) {
					ret = body.statements[0].expression;
				}
			} else {
				ret = body; // concise arrow
			}
			while (ret && tsMod.isParenthesizedExpression(ret)) ret = ret.expression;
			if (!ret) return;
			let attrs: any;
			if (tsMod.isJsxSelfClosingElement(ret))
				attrs = ret.attributes?.properties;
			else if (tsMod.isJsxElement(ret))
				attrs = ret.openingElement?.attributes?.properties;
			if (!attrs) return;
			if (attrs.some((a: any) => tsMod.isJsxSpreadAttribute(a))) {
				smells.push({
					kind: "passthrough-wrapper",
					detail:
						"component only spreads props into one element (no value added)",
					line: lineOf(fnNode),
				});
			}
		})();

		// Assertion-less test: an it()/test() callback with no expect()/assert().
		if (
			/\.(test|spec)\.[jt]sx?$/.test(sourceFile.fileName) &&
			parent &&
			tsMod.isCallExpression(parent) &&
			/^(it|test)$/.test(baseCalleeName(parent.expression) ?? "")
		) {
			let asserts = false;
			(function scan(n: any) {
				if (asserts) return;
				if (tsMod.isCallExpression(n)) {
					const nm = calleeName(n.expression) ?? "";
					const root = baseCalleeName(n.expression) ?? "";
					if (root === "expect" || /^assert/i.test(nm) || /^assert/i.test(root))
						asserts = true;
				}
				tsMod.forEachChild(n, scan);
			})(fnNode);
			if (!asserts) {
				smells.push({
					kind: "test-no-assert",
					detail: "test has no expect()/assert() — asserts nothing",
					line: lineOf(fnNode),
				});
			}
		}

		function analyzeEffect(call: any) {
			const cb = call.arguments?.[0];
			const hasDeps = call.arguments?.length >= 2;
			const line = lineOf(call);
			if (!hasDeps) {
				smells.push({
					kind: "effect-missing-deps",
					detail: "useEffect with no dependency array (runs every render)",
					line,
				});
			}
			if (!cb || !(tsMod.isArrowFunction(cb) || tsMod.isFunctionExpression(cb)))
				return;

			let returnsFn = false;
			let subscribes = false;
			const SUB =
				/^(addEventListener|setInterval|setTimeout|subscribe|addListener|on)$/;
			(function scan(n: any) {
				if (
					tsMod.isReturnStatement(n) &&
					n.expression &&
					(tsMod.isArrowFunction(n.expression) ||
						tsMod.isFunctionExpression(n.expression))
				) {
					returnsFn = true;
				}
				if (
					tsMod.isCallExpression(n) &&
					SUB.test(calleeName(n.expression) ?? "")
				)
					subscribes = true;
				tsMod.forEachChild(n, scan);
			})(cb);

			if (subscribes && !returnsFn) {
				smells.push({
					kind: "effect-missing-cleanup",
					detail:
						"effect subscribes/sets a timer but returns no cleanup function",
					line,
				});
			}

			// "You might not need an effect": body does nothing but call setters.
			const body = cb.body;
			if (body && tsMod.isBlock(body) && body.statements.length > 0) {
				const allSetters = body.statements.every(
					(s: any) =>
						tsMod.isExpressionStatement(s) &&
						tsMod.isCallExpression(s.expression) &&
						/^set[A-Z]/.test(calleeName(s.expression.expression) ?? ""),
				);
				if (allSetters) {
					smells.push({
						kind: "effect-derived-state",
						detail: "effect only calls setState — derive during render instead",
						line,
					});
				}
			}
		}

		const UNSTABLE_PROP = new Set([
			"ObjectLiteralExpression",
			"ArrayLiteralExpression",
		]);
		function checkJsxAttr(attr: any) {
			const attrName = tsMod.isIdentifier(attr.name) ? attr.name.text : "";

			if (attrName === "dangerouslySetInnerHTML") {
				smells.push({
					kind: "dangerous-html",
					detail: "dangerouslySetInnerHTML (XSS risk — sanitize the HTML)",
					line: lineOf(attr),
				});
				return;
			}

			const init = attr.initializer;
			if (!init || !tsMod.isJsxExpression(init) || !init.expression) return;
			const expr = init.expression;

			if (attrName === "key" && indexParam) {
				if (tsMod.isIdentifier(expr) && expr.text === indexParam) {
					smells.push({
						kind: "index-as-key",
						detail: "list key is the array index (unstable across reorders)",
						line: lineOf(attr),
					});
				}
				return;
			}

			const kind = tsMod.SyntaxKind[expr.kind];
			if (
				tsMod.isArrowFunction(expr) ||
				tsMod.isFunctionExpression(expr) ||
				UNSTABLE_PROP.has(kind)
			) {
				smells.push({
					kind: "unstable-prop",
					detail: `inline ${
						tsMod.isArrowFunction(expr) || tsMod.isFunctionExpression(expr)
							? "function"
							: kind.replace("Expression", "").toLowerCase()
					} prop "${attrName}" (new reference every render)`,
					line: lineOf(attr),
				});
			}
		}

		// PascalCase name of a function node (from its own name or its variable
		// declaration) — i.e. it looks like a React component, not a handler.
		const pascalName = (n: any): string | undefined => {
			if (
				tsMod.isFunctionDeclaration(n) &&
				n.name &&
				/^[A-Z]/.test(n.name.text)
			)
				return n.name.text;
			const p = n.parent;
			if (
				p &&
				tsMod.isVariableDeclaration(p) &&
				tsMod.isIdentifier(p.name) &&
				/^[A-Z]/.test(p.name.text)
			)
				return p.name.text;
			return undefined;
		};
		const outerIsComponent = detectComponent(fnNode, sourceFile, tsMod);

		// Walk own body; do not descend into nested functions (separate entries).
		(function walk(node: any) {
			if (node !== fnNode && isFn(node)) {
				// A component defined inside another component is remounted (state
				// lost, subtree torn down) on every render of the parent.
				const nm = pascalName(node);
				if (
					nm &&
					outerIsComponent &&
					detectComponent(node, sourceFile, tsMod)
				) {
					smells.push({
						kind: "component-in-render",
						detail: `component "${nm}" defined inside another component (remounts every render)`,
						line: lineOf(node),
					});
				}
				return;
			}

			if (tsMod.isCallExpression(node)) {
				const name = calleeName(node.expression);
				if (name === "useEffect" || name === "useLayoutEffect")
					analyzeEffect(node);
				if (name === "eval") {
					smells.push({
						kind: "eval-usage",
						detail: "eval() — code injection / XSS risk",
						line: lineOf(node),
					});
				}
				if (
					tsMod.isPropertyAccessExpression(node.expression) &&
					tsMod.isIdentifier(node.expression.expression) &&
					node.expression.expression.text === "console"
				) {
					smells.push({
						kind: "console",
						detail: `console.${name} left in code`,
						line: lineOf(node),
					});
				}
			}
			if (
				tsMod.isNewExpression(node) &&
				tsMod.isIdentifier(node.expression) &&
				node.expression.text === "Function"
			) {
				smells.push({
					kind: "eval-usage",
					detail: "new Function() — dynamic code execution risk",
					line: lineOf(node),
				});
			}
			if (tsMod.isBinaryExpression(node)) {
				const op = node.operatorToken.kind;
				if (op === tsMod.SyntaxKind.EqualsEqualsToken) {
					smells.push({
						kind: "loose-equality",
						detail: "loose equality `==` (use `===`)",
						line: lineOf(node),
					});
				} else if (op === tsMod.SyntaxKind.ExclamationEqualsToken) {
					smells.push({
						kind: "loose-equality",
						detail: "loose inequality `!=` (use `!==`)",
						line: lineOf(node),
					});
				}
			}
			if (
				tsMod.isVariableDeclarationList(node) &&
				(node.flags & tsMod.NodeFlags.Let) === 0 &&
				(node.flags & tsMod.NodeFlags.Const) === 0
			) {
				smells.push({
					kind: "var-keyword",
					detail: "`var` declaration (use `const`/`let`)",
					line: lineOf(node),
				});
			}
			if (tsMod.isJsxAttribute(node)) checkJsxAttr(node);
			if (node.kind === tsMod.SyntaxKind.AnyKeyword) {
				smells.push({
					kind: "type-any",
					detail: "any type",
					line: lineOf(node),
				});
			}
			if (tsMod.isNonNullExpression(node)) {
				smells.push({
					kind: "non-null-assertion",
					detail: "non-null assertion (!)",
					line: lineOf(node),
				});
			}
			if (
				(tsMod.isAsExpression(node) ||
					(tsMod.isSatisfiesExpression?.(node) ?? false)) &&
				node.type &&
				(node.type.kind === tsMod.SyntaxKind.AnyKeyword ||
					node.type.kind === tsMod.SyntaxKind.UnknownKeyword)
			) {
				smells.push({
					kind: "as-any",
					detail: "cast to any/unknown",
					line: lineOf(node),
				});
			}

			tsMod.forEachChild(node, walk);
		})(fnNode);

		// Comment-based markers (not in the AST). Scan the body text once.
		const startLine = lineOf(fnNode);
		const pushComment = (kind: SmellKind, detail: string, re: RegExp) => {
			if (re.test(bodyText)) {
				const idx = bodyText.search(re);
				const before = bodyText.slice(0, idx);
				const line = startLine + (before.match(/\n/g)?.length ?? 0);
				smells.push({ kind, detail, line });
			}
		};
		pushComment(
			"ts-suppress",
			"@ts-ignore / @ts-expect-error / @ts-nocheck",
			/@ts-(ignore|expect-error|nocheck)/,
		);
		pushComment("todo", "TODO/FIXME/HACK comment", /\b(TODO|FIXME|XXX|HACK)\b/);
		pushComment(
			"placeholder",
			"placeholder comment (stubbed/unfinished code)",
			/\/\/\s*\.\.\.|rest of (the )?(implementation|code)|your code here|implementation (goes )?here|implement (this|me)\b/i,
		);

		return smells;
	}

	// Clone fingerprint: walk the AST emitting node kinds, keeping identifier
	// names and literal VALUES intact while dropping whitespace, indentation,
	// comments, and line-wrapping. Two functions match only if they are the same
	// code modulo formatting — so reformatted/prettier'd copy-paste matches, but
	// functions that differ by the identifier or literal that matters (e.g.
	// `=== BucketHashes.Helmet` vs `.Arms`) do NOT. Keeping names is what stops
	// the Type-2 false positives that pure normalization produces.
	// normalize=false (default): keep identifier names + literal values — matches
	//   reformatted copy-paste only (Type-1 modulo formatting).
	// normalize=true: collapse every identifier/literal to a placeholder — matches
	//   renamed/retyped near-duplicates too (Type-2). Noisier; opt-in.
	function structuralFingerprint(
		root: any,
		tsMod: any,
		normalize = false,
	): string {
		const out: string[] = [];
		// Ignore the function's own name so identically-bodied copies under
		// different names still match (the body is what makes it a clone).
		const rootName = root.name;
		function walk(node: any) {
			if (node === rootName) return;
			// Redundant parens are formatting noise — prettier wraps multiline JSX
			// returns in them. Recurse through without emitting a node kind.
			if (tsMod.isParenthesizedExpression(node)) {
				tsMod.forEachChild(node, walk);
				return;
			}
			if (
				tsMod.isIdentifier(node) ||
				(tsMod.isPrivateIdentifier?.(node) ?? false)
			) {
				out.push(normalize ? "I" : `I:${node.text}`);
			} else if (
				tsMod.isStringLiteral(node) ||
				tsMod.isNumericLiteral(node) ||
				(tsMod.isNoSubstitutionTemplateLiteral?.(node) ?? false) ||
				(tsMod.isRegularExpressionLiteral?.(node) ?? false) ||
				node.kind === tsMod.SyntaxKind.BigIntLiteral
			) {
				out.push(normalize ? "L" : `L:${node.text}`);
			} else if (tsMod.isJsxText?.(node) ?? false) {
				// JSX text: keep meaningful content, ignore surrounding whitespace.
				const t = String(node.text ?? "").trim();
				if (t) out.push(normalize ? "T" : `T:${t}`);
			} else {
				out.push(`#${node.kind}`);
			}
			tsMod.forEachChild(node, walk);
		}
		walk(root);
		return out.join(",");
	}

	function countBranches(node: any): number {
		let count = 0;
		tsMod.forEachChild(node, function visitChild(child: any) {
			if (
				tsMod.isIfStatement(child) ||
				tsMod.isSwitchStatement(child) ||
				tsMod.isConditionalExpression(child) ||
				tsMod.isForStatement(child) ||
				tsMod.isForInStatement(child) ||
				tsMod.isForOfStatement(child) ||
				tsMod.isWhileStatement(child) ||
				tsMod.isDoStatement(child) ||
				tsMod.isCatchClause(child) ||
				tsMod.isConditionalTypeNode(child)
			) {
				count++;
			} else if (
				tsMod.isBinaryExpression(child) &&
				(child.operatorToken.kind ===
					tsMod.SyntaxKind.AmpersandAmpersandToken ||
					child.operatorToken.kind === tsMod.SyntaxKind.BarBarToken ||
					child.operatorToken.kind === tsMod.SyntaxKind.QuestionQuestionToken)
			) {
				count++;
			}
			tsMod.forEachChild(child, visitChild);
		});
		return count;
	}

	function getHookName(expr: any, tsMod: any): string | undefined {
		if (tsMod.isIdentifier(expr) && /^use[A-Z]/.test(expr.text)) {
			return expr.text;
		}
		if (
			tsMod.isPropertyAccessExpression(expr) &&
			tsMod.isIdentifier(expr.name) &&
			/^use[A-Z]/.test(expr.name.text)
		) {
			return expr.name.text;
		}
		return undefined;
	}

	function collectHooks(
		node: any,
		sourceFile: any,
		tsMod: any,
		hooks: string[],
		violations: string[],
		topLevel: boolean,
	) {
		tsMod.forEachChild(node, function visitChild(child: any) {
			if (tsMod.isCallExpression(child)) {
				const name = getHookName(child.expression, tsMod);
				if (name) {
					hooks.push(name);
					if (!topLevel) {
						const line =
							sourceFile.getLineAndCharacterOfPosition(
								child.getStart(sourceFile),
							).line + 1;
						violations.push(`conditional-hook: ${name} at line ${line}`);
					}
				}
			}
			const nextTopLevel =
				topLevel &&
				!tsMod.isIfStatement(child) &&
				!tsMod.isSwitchStatement(child) &&
				!tsMod.isConditionalExpression(child) &&
				!tsMod.isForStatement(child) &&
				!tsMod.isForInStatement(child) &&
				!tsMod.isForOfStatement(child) &&
				!tsMod.isWhileStatement(child) &&
				!tsMod.isDoStatement(child) &&
				!tsMod.isCatchClause(child) &&
				!(
					tsMod.isBinaryExpression(child) &&
					(child.operatorToken.kind ===
						tsMod.SyntaxKind.AmpersandAmpersandToken ||
						child.operatorToken.kind === tsMod.SyntaxKind.BarBarToken ||
						child.operatorToken.kind === tsMod.SyntaxKind.QuestionQuestionToken)
				);
			collectHooks(child, sourceFile, tsMod, hooks, violations, nextTopLevel);
		});
	}

	function detectComponent(node: any, _sourceFile: any, tsMod: any): boolean {
		const body = node.body;
		if (!body) return false;

		function isJsxExpression(expr: any, _tsMod: any): boolean {
			if (!expr) return false;
			return (
				_tsMod.isJsxElement(expr) ||
				_tsMod.isJsxSelfClosingElement(expr) ||
				_tsMod.isJsxFragment(expr) ||
				(_tsMod.isJsxExpression(expr) &&
					expr.expression &&
					isJsxExpression(expr.expression, _tsMod))
			);
		}

		function isJsxVariable(name: string, scopeNode: any, _tsMod: any): boolean {
			let yes = false;
			_tsMod.forEachChild(scopeNode, function scan(child: any) {
				if (yes) return;
				if (
					_tsMod.isVariableDeclaration(child) &&
					_tsMod.isIdentifier(child.name) &&
					child.name.text === name &&
					child.initializer &&
					isJsxExpression(child.initializer, _tsMod)
				) {
					yes = true;
					return;
				}
				_tsMod.forEachChild(child, scan);
			});
			return yes;
		}

		function hasJsx(n: any): boolean {
			if (
				tsMod.isJsxElement(n) ||
				tsMod.isJsxSelfClosingElement(n) ||
				tsMod.isJsxFragment(n)
			) {
				return true;
			}
			if (tsMod.isReturnStatement(n)) {
				if (n.expression) {
					if (isJsxExpression(n.expression, tsMod)) return true;
					if (tsMod.isIdentifier(n.expression)) {
						return isJsxVariable(n.expression.text, body, tsMod);
					}
				}
			}
			let found = false;
			tsMod.forEachChild(n, (child: any) => {
				if (!found) found = hasJsx(child);
			});
			return found;
		}

		return hasJsx(body);
	}

	function countRenderBranches(
		node: any,
		_sourceFile: any,
		tsMod: any,
	): number {
		let count = 0;

		function containsJsx(n: any): boolean {
			if (!n) return false;
			if (
				tsMod.isJsxElement(n) ||
				tsMod.isJsxSelfClosingElement(n) ||
				tsMod.isJsxFragment(n)
			)
				return true;
			let found = false;
			tsMod.forEachChild(n, (child: any) => {
				if (!found) found = containsJsx(child);
			});
			return found;
		}

		function visitChild(child: any) {
			if (tsMod.isIfStatement(child) || tsMod.isConditionalExpression(child)) {
				if (
					containsJsx(child.thenStatement ?? child.whenTrue) ||
					containsJsx(child.elseStatement ?? child.whenFalse)
				) {
					count++;
				}
			} else if (
				tsMod.isBinaryExpression(child) &&
				(child.operatorToken.kind ===
					tsMod.SyntaxKind.AmpersandAmpersandToken ||
					child.operatorToken.kind === tsMod.SyntaxKind.BarBarToken ||
					child.operatorToken.kind === tsMod.SyntaxKind.QuestionQuestionToken)
			) {
				if (containsJsx(child.right)) {
					count++;
				}
			}
			tsMod.forEachChild(child, visitChild);
		}

		tsMod.forEachChild(node, visitChild);
		return count;
	}

	tsMod.forEachChild(sourceFile, visit);
	return results;
}

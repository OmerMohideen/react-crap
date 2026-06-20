import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface ComplexityEntry {
	file: string;
	function: string;
	line: number;
	endLine: number;
	cyclomatic: number;
	bodyHash: string;
	structuralHash: string;
	threshold?: number;
	hooks: string[];
	hookViolations: string[];
	isComponent: boolean;
	renderBranches: number;
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
		tsMod.ScriptKind.TSX,
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
			const threshold = getThreshold(node, sourceFile, tsMod);
			const hooks: string[] = [];
			const hookViolations: string[] = [];
			collectHooks(node, sourceFile, tsMod, hooks, hookViolations, true);
			const isComponent = detectComponent(node, sourceFile, tsMod);
			const renderBranches = countRenderBranches(node, sourceFile, tsMod);

			results.push({
				file: sourceFile.fileName,
				function: name,
				line,
				endLine,
				cyclomatic: cc,
				bodyHash,
				structuralHash,
				threshold,
				hooks,
				hookViolations,
				isComponent,
				renderBranches,
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

	// Clone fingerprint: walk the AST emitting node kinds, keeping identifier
	// names and literal VALUES intact while dropping whitespace, indentation,
	// comments, and line-wrapping. Two functions match only if they are the same
	// code modulo formatting — so reformatted/prettier'd copy-paste matches, but
	// functions that differ by the identifier or literal that matters (e.g.
	// `=== BucketHashes.Helmet` vs `.Arms`) do NOT. Keeping names is what stops
	// the Type-2 false positives that pure normalization produces.
	function structuralFingerprint(root: any, tsMod: any): string {
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
				out.push(`I:${node.text}`);
			} else if (
				tsMod.isStringLiteral(node) ||
				tsMod.isNumericLiteral(node) ||
				(tsMod.isNoSubstitutionTemplateLiteral?.(node) ?? false) ||
				(tsMod.isRegularExpressionLiteral?.(node) ?? false) ||
				node.kind === tsMod.SyntaxKind.BigIntLiteral
			) {
				out.push(`L:${node.text}`);
			} else if (tsMod.isJsxText?.(node) ?? false) {
				// JSX text: keep meaningful content, ignore surrounding whitespace.
				const t = String(node.text ?? "").trim();
				if (t) out.push(`T:${t}`);
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

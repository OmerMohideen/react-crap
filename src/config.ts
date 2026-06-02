import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ALLOWED_KEYS = new Set([
	"threshold",
	"componentThreshold",
	"failAbove",
	"missing",
	"exclude",
	"allow",
	"epsilon",
	"min",
	"max",
	"top",
	"onlyFailures",
	"workspace",
	"verbose",
	"watch",
	"sort",
]);

export interface Config {
	threshold?: number;
	componentThreshold?: number;
	failAbove?: boolean;
	missing?: "pessimistic" | "optimistic" | "skip";
	exclude?: string[];
	allow?: string[];
	epsilon?: number;
	min?: number;
	max?: number;
	top?: number;
	onlyFailures?: boolean;
	workspace?: boolean;
	verbose?: boolean;
	watch?: boolean;
	sort?: string;
}

export function loadConfig(startDir: string): Config {
	let dir = resolve(startDir);
	const root = resolve("/");

	while (true) {
		const configPath = resolve(dir, ".react-crap.json");
		if (existsSync(configPath)) {
			try {
				const raw = readFileSync(configPath, "utf-8");
				const parsed = JSON.parse(raw) as Config;
				validateConfig(parsed, configPath);
				return parsed;
			} catch (e) {
				if (e instanceof ConfigValidationError) throw e;
				throw new Error(`Failed to parse ${configPath}: ${e}`);
			}
		}

		if (dir === root) break;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	return {};
}

class ConfigValidationError extends Error {}

function validateConfig(config: Config, path: string): void {
	for (const key of Object.keys(config)) {
		if (!ALLOWED_KEYS.has(key)) {
			const suggestion = suggestKey(key);
			throw new ConfigValidationError(
				`Unknown key "${key}" in ${path}.${suggestion ? ` Did you mean "${suggestion}"?` : ""} Allowed keys: ${Array.from(ALLOWED_KEYS).sort().join(", ")}`,
			);
		}
	}
}

function suggestKey(invalid: string): string | undefined {
	const lower = invalid.toLowerCase();
	for (const key of ALLOWED_KEYS) {
		if (
			key.toLowerCase().includes(lower) ||
			lower.includes(key.toLowerCase())
		) {
			return key;
		}
	}
	// Simple typo detection: allow one missing/extra character
	for (const key of ALLOWED_KEYS) {
		if (levenshtein(lower, key.toLowerCase()) <= 2) {
			return key;
		}
	}
	return undefined;
}

function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	if (m === 0) return n;
	if (n === 0) return m;
	const dp: number[][] = Array.from({ length: m + 1 }, () =>
		Array(n + 1).fill(0),
	);
	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			dp[i][j] = Math.min(
				dp[i - 1][j] + 1, // deletion
				dp[i][j - 1] + 1, // insertion
				dp[i - 1][j - 1] + cost, // substitution
			);
		}
	}
	return dp[m][n];
}

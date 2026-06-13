import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComplexityEntry } from "./complexity.js";

export interface CacheEntry {
	hash: string;
	functions: ComplexityEntry[];
}

export interface Cache {
	version: string;
	files: Record<string, CacheEntry>;
}

const CACHE_FILE = ".react-crap-cache.json";
const CACHE_VERSION = "2";

export function loadCache(projectPath: string): Cache {
	const path = resolve(projectPath, CACHE_FILE);
	if (existsSync(path)) {
		try {
			const raw = readFileSync(path, "utf-8");
			const parsed = JSON.parse(raw) as Cache;
			if (parsed.version === CACHE_VERSION) return parsed;
		} catch {
			// invalid cache, ignore
		}
	}
	return { version: CACHE_VERSION, files: {} };
}

export function saveCache(projectPath: string, cache: Cache): void {
	const path = resolve(projectPath, CACHE_FILE);
	writeFileSync(path, `${JSON.stringify(cache, null, "\t")}\n`, "utf-8");
}

export function hashFile(content: string): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { join } from "node:path";

// readFileSync used, writeFileSync unused, resolve used, join unused.
export function loadAt(p: string): string {
	return readFileSync(resolve(p), "utf-8");
}

import { createRequire } from "node:module";
import { join } from "node:path";

export function getLocalVersion(): string {
	const req = createRequire(join(__dirname, "index.js"));
	// Support both dist/src/ (built) and src/ (vitest source)
	try {
		const pkg = req("../../package.json");
		return pkg.version as string;
	} catch {
		const pkg = req("../package.json");
		return pkg.version as string;
	}
}

const REGISTRY_URL =
	"https://registry.npmjs.org/@omermohideen%2freact-crap/latest";
const REQUEST_TIMEOUT_MS = 2000;

export async function checkForUpdate(): Promise<string | undefined> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(REGISTRY_URL, {
				signal: controller.signal,
			});
			if (!response.ok) return undefined;

			const data = (await response.json()) as { version?: string };
			const latest = data.version;
			if (!latest) return undefined;

			const current = getLocalVersion();
			if (latest !== current) {
				return `A new version of react-crap is available: ${current} → ${latest}\nRun: npm install -g @omermohideen/react-crap`;
			}
		} finally {
			clearTimeout(timer);
		}
	} catch {
		// silently ignore any error (network, timeout, parse, etc.)
	}
	return undefined;
}

import { describe, expect, it, vi } from "vitest";
import { checkForUpdate, getLocalVersion } from "../src/version-check.js";

describe("getLocalVersion", () => {
	it("returns the version from package.json", () => {
		const version = getLocalVersion();
		expect(version).toMatch(/^\d+\.\d+\.\d+/);
	});
});

describe("checkForUpdate", () => {
	it("returns undefined when the registry returns the same version", async () => {
		const current = getLocalVersion();
		global.fetch = vi.fn(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ version: current }),
			} as Response),
		);

		const result = await checkForUpdate();
		expect(result).toBeUndefined();
	});

	it("returns a message when a newer version exists", async () => {
		const current = getLocalVersion();
		const nextMajor = String(Number(current.split(".")[0]) + 1);
		const latest = `${nextMajor}.0.0`;

		global.fetch = vi.fn(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ version: latest }),
			} as Response),
		);

		const result = await checkForUpdate();
		expect(result).toContain(
			`A new version of react-crap is available: ${current} → ${latest}`,
		);
		expect(result).toContain("npm install -g @omermohideen/react-crap");
	});

	it("returns undefined when the registry request fails", async () => {
		global.fetch = vi.fn(() =>
			Promise.resolve({
				ok: false,
				status: 500,
			} as Response),
		);

		const result = await checkForUpdate();
		expect(result).toBeUndefined();
	});

	it("returns undefined when fetch throws", async () => {
		global.fetch = vi.fn(() => Promise.reject(new Error("network error")));

		const result = await checkForUpdate();
		expect(result).toBeUndefined();
	});
});

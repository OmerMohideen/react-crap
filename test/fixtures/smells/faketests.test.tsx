// Excluded from vitest via test.exclude — analyzed by react-crap only.
// AI tell: a test that renders/calls but asserts nothing.
declare const it: (name: string, fn: () => void) => void;
declare const expect: (v: unknown) => { toBe: (x: unknown) => void };

it("does something but asserts nothing", () => {
	const result = 1 + 1;
	console.log(result);
});

it("actually asserts", () => {
	expect(1 + 1).toBe(2);
});

import { describe, expect, it } from "vitest";
import { parseLcov } from "../src/coverage";

const lcov = `TN:
SF:src/lib.ts
FN:1,trivial
FN:5,moderate
FNDA:1,trivial
FNDA:2,moderate
FNF:2
FNH:2
DA:2,1
DA:6,2
DA:7,1
LH:2
LF:3
end_of_record
`;

describe("parseLcov", () => {
	it("parses basic LCOV", () => {
		const result = parseLcov(lcov);
		expect(result).toHaveLength(1);
		expect(result[0].file).toBe("src/lib.ts");
		expect(result[0].functions).toHaveLength(2);
		expect(result[0].functions[0].function).toBe("trivial");
		expect(result[0].functions[0].hit).toBe(1);
		expect(result[0].functions[1].hit).toBe(2);
	});
});

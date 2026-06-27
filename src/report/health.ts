import pc from "picocolors";

// Three display severities the reports collapse everything into:
//   high = likely bug / critical, warn = quality, note = housekeeping.
export interface SeverityCounts {
	high: number;
	warn: number;
	note: number;
}

// Weighted deduction from 100, clamped. Not a precise metric — a "fix the worst
// first" nudge. ponytail: flat weights; tune if it proves misleading.
export function healthScore(c: SeverityCounts): number {
	return Math.max(0, 100 - (8 * c.high + 3 * c.warn + c.note));
}

const id = (s: string) => s;
const palette = (noColor?: boolean) =>
	noColor
		? {
				red: id,
				yellow: id,
				dim: id,
				green: id,
				cyan: id,
				bold: id,
			}
		: pc;

// Colored title bar, e.g. "══ react-crap · smells ══".
export function banner(label: string, noColor?: boolean): string {
	const k = palette(noColor);
	return k.bold(k.cyan(`══ react-crap · ${label} ══`));
}

// One-line summary footer: counts per severity + a graded score.
export function scoreFooter(c: SeverityCounts, noColor?: boolean): string {
	const k = palette(noColor);
	const total = c.high + c.warn + c.note;
	if (total === 0) return k.green("✓ no issues · score 100/100");

	const score = healthScore(c);
	const parts: string[] = [];
	if (c.high) parts.push(k.red(`${c.high} high`));
	if (c.warn) parts.push(k.yellow(`${c.warn} warning${c.warn > 1 ? "s" : ""}`));
	if (c.note) parts.push(k.dim(`${c.note} note${c.note > 1 ? "s" : ""}`));

	const grade = score >= 90 ? k.green : score >= 70 ? k.yellow : k.red;
	return `${k.red("✗")} ${total} issue${total > 1 ? "s" : ""} · ${parts.join(" · ")} · score ${grade(`${score}/100`)}`;
}

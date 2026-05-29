export function trivial(): boolean {
	return true;
}

export function moderate(x: number): string {
	if (x > 0) {
		return "positive";
	}
	if (x < 0) {
		return "negative";
	}
	return "zero";
}

export function crappy(kind: string, retry: number, source?: string): string {
	if (kind === "payment_failed") {
		if (retry > 3) {
			return "manual_review";
		}
		if (source === "partner") {
			return "partner_retry";
		}
		return "retry";
	}
	if (kind === "payment_succeeded") {
		return "complete";
	}
	if (kind === "refund_requested" && source !== "internal") {
		return "review_refund";
	}
	return "unknown";
}

export const arrowFunc = (a: number, b: number): number => {
	return a > b ? a : b;
};

// react-crap-ignore
export function ignoredFunc(x: number): string {
	if (x > 0) return "a";
	if (x < 0) return "b";
	return "c";
}

// Two near-duplicates: same structure, different identifiers + literals.
// Exact/structural detection misses these; normalized (Type-2) catches them.
export function sumPrices(items: { price: number }[]): number {
	let total = 0;
	for (const item of items) {
		if (item.price > 0) {
			total += item.price;
		}
	}
	return total;
}

export function tallyScores(rows: { score: number }[]): number {
	let acc = 0;
	for (const row of rows) {
		if (row.score > 5) {
			acc += row.score;
		}
	}
	return acc;
}

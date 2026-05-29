import type { ScoredEntry } from "../score";

export function formatHtml(entries: ScoredEntry[], threshold: number): string {
	const rows = entries
		.map((e) => {
			const t = e.threshold ?? threshold;
			const status = e.crap > t ? "fail" : e.crap > t / 2 ? "warn" : "pass";
			const cov = e.coverage === null ? "N/A" : `${e.coverage.toFixed(1)}%`;
			return `<tr class="${status}">
		<td class="status">${status === "fail" ? "✗" : status === "warn" ? "▲" : "✓"}</td>
		<td class="crap">${e.crap.toFixed(1)}</td>
		<td class="cc">${e.cyclomatic}</td>
		<td class="coverage">${cov}</td>
		<td class="function"><code>${escapeHtml(e.function)}</code></td>
		<td class="location">${escapeHtml(e.file)}:${e.line}</td>
	</tr>`;
		})
		.join("\n");

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>react-crap Report</title>
<style>
	body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 2rem; background: #f6f8fa; }
	h1 { font-size: 1.5rem; margin-bottom: 1rem; }
	table { border-collapse: collapse; width: 100%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
	th, td { padding: 0.6rem 0.8rem; text-align: left; border-bottom: 1px solid #e1e4e8; }
	th { background: #f1f3f5; font-weight: 600; }
	tr:hover { background: #f6f8fa; }
	.status { text-align: center; font-weight: bold; }
	.crap, .cc, .coverage { text-align: right; font-variant-numeric: tabular-nums; }
	tr.fail .status { color: #d73a49; }
	tr.warn .status { color: #e36209; }
	tr.pass .status { color: #28a745; }
	.function code { background: #f1f3f5; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.9em; }
	.location { font-size: 0.85em; color: #586069; }
	.summary { margin: 1rem 0; padding: 1rem; background: #fff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
</style>
</head>
<body>
<h1>CRAP Report</h1>
<div class="summary">
	<p>Threshold: ${threshold}</p>
	<p>Total functions: ${entries.length}</p>
	<p>Above threshold: ${entries.filter((e) => e.crap > (e.threshold ?? threshold)).length}</p>
</div>
<table>
<thead>
<tr>
<th>Status</th>
<th>CRAP</th>
<th>CC</th>
<th>Coverage</th>
<th>Function</th>
<th>Location</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>s
</body>
</html>`;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

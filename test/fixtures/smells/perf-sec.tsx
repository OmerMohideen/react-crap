// Fixture for perf / best-practice / security smell kinds.

export function Parent() {
	// Component defined inside another component → remounts every render.
	function Child() {
		return <span>child</span>;
	}
	var legacy = 1; // var-keyword
	const same = legacy == 2; // loose-equality
	const run = eval("1 + 1"); // eval-usage
	return (
		<div dangerouslySetInnerHTML={{ __html: "<b>x</b>" }}>
			{same}
			{run}
			<Child />
		</div>
	);
}

// Top-level helper component — must NOT be flagged as component-in-render.
function Sibling() {
	return <p>ok</p>;
}

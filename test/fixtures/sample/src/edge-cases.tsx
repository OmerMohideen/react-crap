export function ParenthesizedReturn() {
	return (
		<div>
			<span>hello</span>
		</div>
	);
}

export function ConditionalRender({ show }: { show: boolean }) {
	if (show) {
		return <div>showing</div>;
	}
	return null;
}

export function VariableReturn({ items }: { items: string[] }) {
	const list = (
		<ul>
			{items.map((i) => (
				<li key={i}>{i}</li>
			))}
		</ul>
	);
	return list;
}

export function useMyHook() {
	const [x, _setX] = React.useState(0);
	return x;
}

export function WrappedComponent({ name }: { name: string }) {
	return React.createElement("div", null, name);
}

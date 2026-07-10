import { useEffect, useState } from "react";

// Effect with no dependency array — runs every render.
export function NoDeps({ id }: { id: number }) {
	const [, setData] = useState(0);
	useEffect(() => {
		setData(id);
	});
	return <div>{id}</div>;
}

// Subscribes but returns no cleanup.
export function NoCleanup() {
	useEffect(() => {
		window.addEventListener("resize", () => {});
	}, []);
	return <div />;
}

// Effect only calls setState — should be derived during render.
export function DerivedState({ value }: { value: number }) {
	const [doubled, setDoubled] = useState(0);
	useEffect(() => {
		setDoubled(value * 2);
	}, [value]);
	return <span>{doubled}</span>;
}

// Unstable inline props + type escapes + console + TODO + index-as-key.
export function Sloppy({ items }: { items: string[] }) {
	const data = items as any; // TODO: type this properly
	console.log("rendering", data);
	return (
		<ul style={{ color: "red" }} onClick={() => doThing()}>
			{items.map((item, i) => (
				<li key={i}>{item!}</li>
			))}
		</ul>
	);
}

// MUI/tailwind style-system props — object/array literals here are the
// library's intended API and must NOT be flagged as unstable-prop.
export function Styled({ active }: { active: boolean }) {
	return (
		<section
			sx={{ p: 2, color: "primary.main" }}
			css={{ display: "flex" }}
			className={["flex", active && "font-bold"]}
			classNames={{ base: "rounded", label: "text-sm" }}
		>
			styled
		</section>
	);
}

function doThing() {}

import { useEffect } from "react";

// Adds href + children on top of the spread → NOT a passthrough wrapper.
export function ValueWrapper(props: { children: React.ReactNode }) {
	return (
		<a href="/x" {...props}>
			{props.children}
		</a>
	);
}

// Concise arrow returns subscribe()'s result (the unsubscribe) → has cleanup.
export function useSub(bus: { subscribe: (f: () => void) => () => void }) {
	useEffect(() => bus.subscribe(() => {}), [bus]);
}

// localStorage.setItem is a property-access call, not a state setter → the
// effect is not "derived state".
export function Persist({ value }: { value: string }) {
	useEffect(() => {
		localStorage.setItem("k", value);
	}, [value]);
}

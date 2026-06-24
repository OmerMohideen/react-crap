// Passthrough wrapper: adds a layer that only forwards props.
export function Wrapper(props: { id: string }) {
	return <Inner {...props} />;
}

function Inner(_props: { id: string }) {
	return <div />;
}

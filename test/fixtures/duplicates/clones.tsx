// Same code, different formatting / line-wrapping / comments. Should MATCH:
// detection ignores whitespace and comments.
export function UserCard({ name, active }: { name: string; active: boolean }) {
	if (active) {
		return <div className="card">{name}</div>;
	}
	return <span>offline</span>;
}

export function UserCardCopy({
	name,
	active,
}: {
	name: string;
	active: boolean;
}) {
	// reformatted copy-paste
	if (active) {
		return <div className="card">{name}</div>;
	}
	return <span>offline</span>;
}

// Same shape but a different literal ("panel" vs "card"). Should NOT match —
// this is the Type-2 false positive we must avoid.
export function PanelCard({ name, active }: { name: string; active: boolean }) {
	if (active) {
		return <div className="panel">{name}</div>;
	}
	return <span>offline</span>;
}

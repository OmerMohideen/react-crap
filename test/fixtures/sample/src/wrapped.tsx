import * as React from "react";

export default React.memo(function ItemDetails({ item }: { item: string }) {
	return <div>{item}</div>;
});

export const MemoComponent = React.memo(({ name }: { name: string }) => {
	return <span>{name}</span>;
});

export const WrappedWithLogic = ({ show }: { show: boolean }) => {
	if (!show) {
		return null;
	}
	return <div>{show && <span>visible</span>}</div>;
};

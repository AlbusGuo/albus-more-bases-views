/** Shared pointer mapping for collectible and Hearthstone cards. */
export function getCardPointerStyle(
	x: number, y: number,
	rect: { left: number; top: number; width: number; height: number },
	prefix: string, tilt: number,
): Record<string, string> {
	const px = Math.min(1, Math.max(0, (x - rect.left) / Math.max(1, rect.width)));
	const py = Math.min(1, Math.max(0, (y - rect.top) / Math.max(1, rect.height)));
	const dx = px - 0.5, dy = py - 0.5;
	return {
		[`${prefix}-pointer-x`]: `${Math.round(px * 1000) / 10}%`,
		[`${prefix}-pointer-y`]: `${Math.round(py * 1000) / 10}%`,
		[`${prefix}-background-x`]: `${37 + px * 26}%`,
		[`${prefix}-background-y`]: `${33 + py * 34}%`,
		[`${prefix}-distance`]: String(Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2)),
		[`${prefix}-rotate-x`]: `${dy * tilt * 2}deg`,
		[`${prefix}-rotate-y`]: `${-dx * tilt * 2}deg`,
		[`${prefix}-opacity`]: '1',
		[`${prefix}-from-top`]: String(py),
		[`${prefix}-from-left`]: String(px),
	};
}

export function getRestingCardPointerStyle(prefix: string): Record<string, string> {
	return {
		[`${prefix}-pointer-x`]: '50%', [`${prefix}-pointer-y`]: '50%',
		[`${prefix}-background-x`]: '50%', [`${prefix}-background-y`]: '50%',
		[`${prefix}-distance`]: '0', [`${prefix}-rotate-x`]: '0deg',
		[`${prefix}-rotate-y`]: '0deg', [`${prefix}-opacity`]: '0',
		[`${prefix}-from-top`]: '0.5', [`${prefix}-from-left`]: '0.5',
	};
}

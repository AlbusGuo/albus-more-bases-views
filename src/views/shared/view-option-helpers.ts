export function propertyOption(
	key: string,
	displayName: string,
	placeholder: string,
) {
	return { type: 'property' as const, key, displayName, placeholder };
}

export function readClampedNumber(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
): number {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(maximum, Math.max(minimum, number));
}

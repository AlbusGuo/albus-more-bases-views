import { ListValue, NullValue, type Value } from 'obsidian';

export type MapCoordinates = [latitude: number, longitude: number];

export function parseCoordinates(value: Value | null): MapCoordinates | null {
	if (!value || value instanceof NullValue) return null;
	if (value instanceof ListValue && value.length() >= 2) {
		return validateCoordinates(
			Number.parseFloat(value.get(0).toString()),
			Number.parseFloat(value.get(1).toString()),
		);
	}
	return parseCoordinateText(value.toString());
}

export function parseCoordinateText(text: string): MapCoordinates | null {
	const normalized = text.trim()
		.replace(/^geo:/i, '')
		.replace(/^\[/, '')
		.replace(/\]$/, '')
		.replace('\uFF0C', ',');
	if (!normalized) return null;
	const parts = normalized.includes(',')
		? normalized.split(',')
		: normalized.split(/\s+/);
	if (parts.length < 2) return null;
	return validateCoordinates(
		Number.parseFloat(parts[0]?.trim() ?? ''),
		Number.parseFloat(parts[1]?.trim() ?? ''),
	);
}

export function validateCoordinates(
	latitude: number,
	longitude: number,
): MapCoordinates | null {
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	if (latitude < -90 || latitude > 90) return null;
	if (longitude < -180 || longitude > 180) return null;
	return [latitude, longitude];
}

export function formatCoordinates(
	coordinates: MapCoordinates,
	precision = 5,
): string {
	return `${coordinates[0].toFixed(precision)}, ${coordinates[1].toFixed(precision)}`;
}

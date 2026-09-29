import {
	NullValue,
	type BasesEntry,
	type BasesPropertyId,
	type Value,
} from 'obsidian';

export function isEmptyValue(value: Value | null): boolean {
	return value === null || value instanceof NullValue || value.toString().trim() === '';
}

export function formatDisplayDate(value: string): string {
	return value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/u)?.[1] ?? value;
}

export function getPropertyText(
	entry: BasesEntry,
	property: BasesPropertyId | null,
): string {
	if (!property) return '';
	const value = entry.getValue(property);
	if (!value || value instanceof NullValue) return '';
	const text = value.toString().trim();
	return text.toLowerCase() === 'null' ? '' : text;
}

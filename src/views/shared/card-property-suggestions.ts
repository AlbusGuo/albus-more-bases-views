import type { BasesEntry } from 'obsidian';
import { unwrapBasesValue, valueText } from './property-editing';
import type { CardPropertyEditorDefinition } from './card-property-editor-types';

export function collectCardPropertySuggestions<Options>(
	definition: CardPropertyEditorDefinition<Options>,
	options: Options,
	entries: Iterable<BasesEntry>,
): ReadonlyMap<string, readonly string[]> {
	const uniqueEntries = new Map<string, BasesEntry>();
	for (const entry of entries) uniqueEntries.set(entry.file.path, entry);
	const result = new Map<string, readonly string[]>();
	for (const field of definition.fields) {
		if (field.id === 'title') {
			result.set(field.id, []);
			continue;
		}
		const values = new Set<string>();
		const property = field.property(options);
		for (const entry of uniqueEntries.values()) {
			if (field.filenameFallback && !property) {
				values.add(entry.file.basename);
				continue;
			}
			if (!property) continue;
			collectValues(unwrapBasesValue(entry.getValue(property)), values);
		}
		result.set(field.id, [...values].sort((left, right) =>
			left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' }),
		));
	}
	return result;
}

function collectValues(value: unknown, values: Set<string>): void {
	if (Array.isArray(value)) {
		for (const item of value) collectValues(item, values);
		return;
	}
	const text = valueText(value);
	if (text && text.toLowerCase() !== 'null') values.add(text);
}

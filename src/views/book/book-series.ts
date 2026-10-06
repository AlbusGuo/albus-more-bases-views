import { NullValue, type BasesEntry, type BasesPropertyId } from 'obsidian';
import type { ViewportGridGroup } from '../../ui/viewport-grid';

export interface BookSeriesCollection {
	key: string;
	label: string;
	entries: readonly BasesEntry[];
}

export interface BookSeriesTransitionSource {
	element: HTMLElement;
	visibleItemCount: number;
	getItemRects: () => readonly DOMRect[];
	setExpanded: (expanded: boolean) => void;
}

export interface BookSeriesResult {
	groups: readonly ViewportGridGroup<BasesEntry>[];
	collectionsByLead: ReadonlyMap<string, BookSeriesCollection>;
}

export function collectBookSeries(
	groups: readonly ViewportGridGroup<BasesEntry>[],
	property: BasesPropertyId | null,
	enabled: boolean,
): BookSeriesResult {
	if (!enabled || !property) {
		return { groups, collectionsByLead: new Map() };
	}

	const collectionsByLead = new Map<string, BookSeriesCollection>();
	const collections = new Map<string, BasesEntry[]>();
	for (const group of groups) {
		for (const entry of group.items) {
			const series = readSeries(entry, property);
			if (!series) continue;
			const entries = collections.get(series.key) ?? [];
			entries.push(entry);
			collections.set(series.key, entries);
		}
	}

	const hidden = new Set<string>();
	for (const [key, entries] of collections) {
		if (entries.length < 2) continue;
		const lead = entries[0];
		if (!lead) continue;
		const label = readSeries(lead, property)?.label ?? key;
		collectionsByLead.set(lead.file.path, { key, label, entries });
		for (const entry of entries.slice(1)) hidden.add(entry.file.path);
	}
	const nextGroups = hidden.size === 0
		? groups
		: groups
			.map((group) => ({
				...group,
				items: group.items.filter((entry) => !hidden.has(entry.file.path)),
			}))
			.filter((group) => group.items.length > 0);

	return { groups: nextGroups, collectionsByLead };
}

function readSeries(
	entry: BasesEntry,
	property: BasesPropertyId,
): { key: string; label: string } | null {
	const value = entry.getValue(property);
	if (!value || value instanceof NullValue) return null;
	const label = value.toString().trim();
	if (!label || label.toLocaleLowerCase() === 'null') return null;
	return { key: label.toLocaleLowerCase(), label };
}

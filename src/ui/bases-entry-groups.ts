import type { BasesEntry, BasesEntryGroup, Value } from 'obsidian';
import type { ViewportGridGroup } from './viewport-grid';

const EMPTY_GROUP_LABEL = '无值';

export function createBasesViewportGroups(
	groups: readonly BasesEntryGroup[],
): ViewportGridGroup<BasesEntry>[] {
	const showHeaders = groups.some((group) => group.key !== undefined);
	return groups.map((group, index) => ({
		key: createGroupKey(group.key, index),
		label: getGroupLabel(group),
		showHeader: showHeaders,
		items: group.entries,
	}));
}

function getGroupLabel(group: BasesEntryGroup): string {
	if (!group.hasKey()) return EMPTY_GROUP_LABEL;
	const label = group.key?.toString().trim() ?? '';
	return label || EMPTY_GROUP_LABEL;
}

function createGroupKey(key: Value | undefined, index: number): string {
	if (key === undefined) return 'ungrouped';
	const valueType = (key.constructor as { type?: string }).type ?? 'value';
	return `${index}:${valueType}:${key.toString()}`;
}

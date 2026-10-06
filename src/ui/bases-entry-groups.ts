import type { App, BasesEntry, BasesEntryGroup, Value } from 'obsidian';
import type { ViewportGridGroup } from './viewport-grid';

const EMPTY_GROUP_LABEL = '无值';

interface BasesViewportGroupOptions {
	app: App;
	propertyLabel: string;
	isCollapsed: (group: BasesEntryGroup) => boolean;
	onToggleCollapsed: (group: BasesEntryGroup) => void;
}

export function createBasesViewportGroups(
	groups: readonly BasesEntryGroup[],
	options?: BasesViewportGroupOptions,
): ViewportGridGroup<BasesEntry>[] {
	return groups.map((group) => {
		const key = group.key;
		return {
			key: getBasesGroupId(group) ?? 'ungrouped',
			label: getGroupLabel(group),
			showHeader: key !== undefined,
			propertyLabel: options?.propertyLabel ?? '',
			renderLabel: options && key
				? (element: HTMLElement) => renderGroupValue(element, key, options.app)
				: undefined,
			collapsed: options?.isCollapsed(group) ?? false,
			onToggleCollapsed: options
				? () => options.onToggleCollapsed(group)
				: undefined,
			items: group.entries,
		};
	});
}

export function getBasesGroupId(group: BasesEntryGroup): string | null {
	const key = group.key;
	return key === undefined ? null : `${String(key.constructor)}:${key.toString()}`;
}

function getGroupLabel(group: BasesEntryGroup): string {
	if (!group.hasKey()) return EMPTY_GROUP_LABEL;
	const label = group.key?.toString().trim() ?? '';
	return label || EMPTY_GROUP_LABEL;
}

function renderGroupValue(element: HTMLElement, value: Value, app: App): void {
	element.empty();
	try {
		value.renderTo(element, app.renderContext);
	} catch {
		element.setText(value.toString().trim() || EMPTY_GROUP_LABEL);
	}
}

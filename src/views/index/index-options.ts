import type {
	BasesAllOptions,
	BasesPropertyId,
	BasesViewConfig,
} from 'obsidian';
import {
	createMarkdownOpenModeOption,
	readMarkdownOpenMode,
	type MarkdownOpenMode,
} from '../../services/markdown-navigation';

export interface IndexViewOptions {
	titleProperty: BasesPropertyId | null;
	categoryProperty: BasesPropertyId | null;
	timeProperty: BasesPropertyId | null;
	categoryOrder: string[];
	markdownOpenMode: MarkdownOpenMode;
}

export function getIndexViewOptions(): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		{
			type: 'group',
			displayName: '内容',
			items: [
				propertyOption('titleProperty', '标题属性', '留空时使用文件名'),
				propertyOption('categoryProperty', '分类属性', '选择主分类属性', true),
				propertyOption('timeProperty', '时间属性', '选择条目显示的时间属性'),
			],
		},
	];
}

export function readIndexViewOptions(config: BasesViewConfig): IndexViewOptions {
	const categoryOrder = config.get('categoryOrder');
	return {
		titleProperty: config.getAsPropertyId('titleProperty'),
		categoryProperty: config.getAsPropertyId('categoryProperty'),
		timeProperty: config.getAsPropertyId('timeProperty'),
		categoryOrder: Array.isArray(categoryOrder)
			? categoryOrder.filter((value): value is string => typeof value === 'string')
			: [],
		markdownOpenMode: readMarkdownOpenMode(config),
	};
}

function propertyOption(
	key: string,
	displayName: string,
	placeholder: string,
	noteOnly = false,
) {
	return {
		type: 'property' as const,
		key,
		displayName,
		placeholder,
		filter: noteOnly
			? (property: BasesPropertyId) => property.startsWith('note.')
			: undefined,
	};
}

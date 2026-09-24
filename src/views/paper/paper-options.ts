import type {
	BasesAllOptions,
	BasesPropertyId,
	BasesViewConfig,
} from 'obsidian';
import type { AttachmentOpenMode } from '../../services/entry-actions';
import {
	createMarkdownOpenModeOption,
	readMarkdownOpenMode,
	type MarkdownOpenMode,
} from '../../services/markdown-navigation';
import {
	createCardMinWidthOption,
	readCardMinWidth,
} from '../shared/card-sizing';

export interface PaperViewOptions {
	cardMinWidth: number;
	titleProperty: BasesPropertyId | null;
	authorProperty: BasesPropertyId | null;
	pageCountProperty: BasesPropertyId | null;
	fileLinkProperty: BasesPropertyId | null;
	statusProperty: BasesPropertyId | null;
	openWith: AttachmentOpenMode;
	markdownOpenMode: MarkdownOpenMode;
}

export function getPaperViewOptions(
	config: BasesViewConfig,
): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		createCardMinWidthOption('论文最小宽度'),
		{
			type: 'group',
			displayName: '内容',
			items: [
				propertyOption('titleProperty', '标题属性', '选择标题属性'),
				propertyOption('authorProperty', '作者属性', '选择作者属性'),
				propertyOption('pageCountProperty', '论文页数属性', '选择论文页数属性'),
				propertyOption('fileLinkProperty', '附件链接属性', '选择附件链接属性'),
				{
					...propertyOption('statusProperty', '阅读状态属性', '选择可编辑属性'),
					filter: (property: BasesPropertyId) => property.startsWith('note.'),
				},
				{
					type: 'dropdown',
					key: 'openWith',
					displayName: '附件打开方式',
					default: 'obsidian',
					options: {
						obsidian: '在 Obsidian 中打开',
						system: '使用系统默认应用',
					},
					shouldHide: () =>
						config.getAsPropertyId('fileLinkProperty') === null,
				},
			],
		},
	];
}

export function readPaperViewOptions(config: BasesViewConfig): PaperViewOptions {
	return {
		cardMinWidth: readCardMinWidth(config.get('cardMinWidth')),
		titleProperty: config.getAsPropertyId('titleProperty'),
		authorProperty: config.getAsPropertyId('authorProperty'),
		pageCountProperty: config.getAsPropertyId('pageCountProperty'),
		fileLinkProperty: config.getAsPropertyId('fileLinkProperty'),
		statusProperty: config.getAsPropertyId('statusProperty'),
		openWith: config.get('openWith') === 'system' ? 'system' : 'obsidian',
		markdownOpenMode: readMarkdownOpenMode(config),
	};
}

function propertyOption(key: string, displayName: string, placeholder: string) {
	return { type: 'property' as const, key, displayName, placeholder };
}

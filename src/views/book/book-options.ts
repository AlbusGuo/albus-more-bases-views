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
import type { AttachmentOpenMode } from '../../services/entry-actions';
import {
	createCardMinWidthOption,
	readCardMinWidth,
} from '../shared/card-sizing';

export interface BookViewOptions {
	cardMinWidth: number;
	coverProperty: BasesPropertyId | null;
	fileLinkProperty: BasesPropertyId | null;
	statusProperty: BasesPropertyId | null;
	openWith: AttachmentOpenMode;
	markdownOpenMode: MarkdownOpenMode;
}

export function getBookViewOptions(
	config: BasesViewConfig,
): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		createCardMinWidthOption('封面最小宽度'),
		{
			type: 'group',
			displayName: '内容',
			items: [
				{
					type: 'property',
					key: 'coverProperty',
					displayName: '封面属性',
					placeholder: '选择封面属性',
				},
				{
					type: 'property',
					key: 'fileLinkProperty',
					displayName: '附件链接属性',
					placeholder: '选择附件链接属性',
				},
				{
					type: 'property',
					key: 'statusProperty',
					displayName: '阅读状态属性',
					placeholder: '选择可编辑属性',
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

export function readBookViewOptions(config: BasesViewConfig): BookViewOptions {
	return {
		cardMinWidth: readCardMinWidth(config.get('cardMinWidth')),
		coverProperty: config.getAsPropertyId('coverProperty'),
		fileLinkProperty: config.getAsPropertyId('fileLinkProperty'),
		statusProperty: config.getAsPropertyId('statusProperty'),
		openWith: config.get('openWith') === 'system' ? 'system' : 'obsidian',
		markdownOpenMode: readMarkdownOpenMode(config),
	};
}

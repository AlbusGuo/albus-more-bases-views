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
import {
	createCardMinWidthOption,
	readCardMinWidth,
} from '../shared/card-sizing';

export interface GameViewOptions {
	cardMinWidth: number;
	titleProperty: BasesPropertyId | null;
	posterProperty: BasesPropertyId | null;
	genreProperty: BasesPropertyId | null;
	releaseDateProperty: BasesPropertyId | null;
	ratingProperty: BasesPropertyId | null;
	markdownOpenMode: MarkdownOpenMode;
}

export function getGameViewOptions(): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		createCardMinWidthOption('游戏最小宽度'),
		{
			type: 'group',
			displayName: '内容',
			items: [
				propertyOption('titleProperty', '标题属性', '留空时使用文件名'),
				propertyOption('posterProperty', '封面属性', '选择游戏封面属性'),
				propertyOption('genreProperty', '类型属性', '选择游戏类型属性'),
				propertyOption('releaseDateProperty', '发行日期属性', '选择发行日期属性'),
				{
					...propertyOption('ratingProperty', '评分属性', '选择可写入的评分属性'),
					filter: (property: BasesPropertyId) => property.startsWith('note.'),
				},
			],
		},
	];
}

export function readGameViewOptions(config: BasesViewConfig): GameViewOptions {
	return {
		cardMinWidth: readCardMinWidth(config.get('cardMinWidth')),
		titleProperty: config.getAsPropertyId('titleProperty'),
		posterProperty: config.getAsPropertyId('posterProperty'),
		genreProperty: config.getAsPropertyId('genreProperty'),
		releaseDateProperty: config.getAsPropertyId('releaseDateProperty'),
		ratingProperty: config.getAsPropertyId('ratingProperty'),
		markdownOpenMode: readMarkdownOpenMode(config),
	};
}

function propertyOption(key: string, displayName: string, placeholder: string) {
	return { type: 'property' as const, key, displayName, placeholder };
}

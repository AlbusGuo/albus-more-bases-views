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
import { createCardMaterialOption, readCardMaterialSelection, type CardMaterialSelection } from '../shared/card-material-surface';
import { propertyOption, readClampedNumber } from '../shared/view-option-helpers';
export type { CardMaterialSelection } from '../shared/card-material-surface';

export interface CardViewOptions {
	cardMinWidth: number;
	aspectRatio: number;
	frontProperty: BasesPropertyId | null;
	material: CardMaterialSelection;
	goldFrame: boolean;
	clickToExpand: boolean;
	markdownOpenMode: MarkdownOpenMode;
}

export function getCardViewOptions(): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		createCardMinWidthOption('卡牌最小宽度'),
		{
			type: 'slider',
			key: 'aspectRatio',
			displayName: '卡牌宽高比',
			default: 0.718,
			min: 0.5,
			max: 1.2,
			step: 0.01,
			instant: true,
		},
		createCardMaterialOption(),
		{
			type: 'toggle',
			key: 'clickToExpand',
			displayName: '单击放大卡牌',
			default: true,
		},
		{
			type: 'toggle',
			key: 'goldFrame',
			displayName: '金色边框',
			default: false,
		},
		{
			type: 'group',
			displayName: '内容',
			items: [
				propertyOption('frontProperty', '正面属性', '选择卡牌正面图片属性'),
			],
		},
	];
}

export function readCardViewOptions(config: BasesViewConfig): CardViewOptions {
	return {
		cardMinWidth: readCardMinWidth(config.get('cardMinWidth')),
		aspectRatio: readClampedNumber(config.get('aspectRatio'), 0.718, 0.5, 1.2),
		frontProperty: config.getAsPropertyId('frontProperty'),
		material: readCardMaterialSelection(config),
		goldFrame: config.get('goldFrame') === true,
		clickToExpand: config.get('clickToExpand') !== false,
		markdownOpenMode: readMarkdownOpenMode(config),
	};
}

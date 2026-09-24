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
import { MAX_CARD_WIDTH, MIN_CARD_WIDTH } from '../shared/card-sizing';

const DEFAULT_TIER_CARD_WIDTH = 70;

export interface TierViewOptions {
	cardMinWidth: number;
	titleProperty: BasesPropertyId | null;
	coverProperty: BasesPropertyId | null;
	ratingProperty: BasesPropertyId | null;
	markdownOpenMode: MarkdownOpenMode;
}

export function getTierViewOptions(): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		{
			type: 'slider',
			key: 'cardMinWidth',
			displayName: '卡片宽度',
			default: DEFAULT_TIER_CARD_WIDTH,
			min: MIN_CARD_WIDTH,
			max: MAX_CARD_WIDTH,
			step: 1,
			instant: true,
		},
		{
			type: 'group',
			displayName: '内容',
			items: [
				propertyOption('titleProperty', '标题属性', '留空时使用文件名'),
				propertyOption('coverProperty', '封面属性', '选择卡片封面属性'),
				{
					...propertyOption('ratingProperty', '评分属性', '选择可写入的评分属性'),
					filter: (property: BasesPropertyId) => property.startsWith('note.'),
				},
			],
		},
	];
}

export function readTierViewOptions(config: BasesViewConfig): TierViewOptions {
	return {
		cardMinWidth: readTierCardWidth(config.get('cardMinWidth')),
		titleProperty: config.getAsPropertyId('titleProperty'),
		coverProperty: config.getAsPropertyId('coverProperty'),
		ratingProperty: config.getAsPropertyId('ratingProperty'),
		markdownOpenMode: readMarkdownOpenMode(config),
	};
}

function readTierCardWidth(value: unknown): number {
	const width = Number(value);
	if (!Number.isFinite(width)) return DEFAULT_TIER_CARD_WIDTH;
	return Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, width));
}

function propertyOption(key: string, displayName: string, placeholder: string) {
	return { type: 'property' as const, key, displayName, placeholder };
}

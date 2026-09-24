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

export interface CelebrityViewOptions {
	cardMinWidth: number;
	frameWidth: number;
	matWidth: number;
	frameMaterial: CelebrityFrameMaterial;
	photoProperty: BasesPropertyId | null;
	markdownOpenMode: MarkdownOpenMode;
}

export type CelebrityFrameMaterial = 'walnut' | 'oak' | 'mahogany';

const DEFAULT_FRAME_WIDTH = 16;
const MIN_FRAME_WIDTH = 8;
const MAX_FRAME_WIDTH = 24;
const DEFAULT_MAT_WIDTH = 12;
const MIN_MAT_WIDTH = 0;
const MAX_MAT_WIDTH = 24;

export function getCelebrityViewOptions(): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		createCardMinWidthOption('相框最小宽度'),
		{
			type: 'dropdown',
			key: 'frameMaterial',
			displayName: '木材纹理',
			default: 'walnut',
			options: {
				walnut: '胡桃木',
				oak: '橡木',
				mahogany: '桃花心木',
			},
		},
		{
			type: 'slider',
			key: 'frameWidth',
			displayName: '边框宽度',
			default: DEFAULT_FRAME_WIDTH,
			min: MIN_FRAME_WIDTH,
			max: MAX_FRAME_WIDTH,
			step: 1,
			instant: true,
		},
		{
			type: 'slider',
			key: 'matWidth',
			displayName: '卡纸宽度',
			default: DEFAULT_MAT_WIDTH,
			min: MIN_MAT_WIDTH,
			max: MAX_MAT_WIDTH,
			step: 1,
			instant: true,
		},
		{
			type: 'group',
			displayName: '内容',
			items: [
				{
					type: 'property',
					key: 'photoProperty',
					displayName: '照片属性',
					placeholder: '选择照片属性',
				},
			],
		},
	];
}

export function readCelebrityViewOptions(
	config: BasesViewConfig,
): CelebrityViewOptions {
	return {
		cardMinWidth: readCardMinWidth(config.get('cardMinWidth')),
		frameWidth: readNumber(
			config.get('frameWidth'), DEFAULT_FRAME_WIDTH, MIN_FRAME_WIDTH, MAX_FRAME_WIDTH,
		),
		matWidth: readNumber(
			config.get('matWidth'), DEFAULT_MAT_WIDTH, MIN_MAT_WIDTH, MAX_MAT_WIDTH,
		),
		frameMaterial: readFrameMaterial(config.get('frameMaterial')),
		photoProperty: config.getAsPropertyId('photoProperty'),
		markdownOpenMode: readMarkdownOpenMode(config),
	};
}

function readFrameMaterial(value: unknown): CelebrityFrameMaterial {
	return value === 'oak' || value === 'mahogany' ? value : 'walnut';
}

function readNumber(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
): number {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(maximum, Math.max(minimum, number));
}

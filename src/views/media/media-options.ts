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

export interface MediaViewOptions {
	cardMinWidth: number;
	posterAspectRatio: number;
	titleProperty: BasesPropertyId | null;
	posterProperty: BasesPropertyId | null;
	episodesProperty: BasesPropertyId | null;
	durationProperty: BasesPropertyId | null;
	releaseDateProperty: BasesPropertyId | null;
	genreProperty: BasesPropertyId | null;
	watchDateProperty: BasesPropertyId | null;
	ratingProperty: BasesPropertyId | null;
	markdownOpenMode: MarkdownOpenMode;
}

const DEFAULT_POSTER_ASPECT_RATIO = 2 / 3;
const MIN_POSTER_ASPECT_RATIO = 0.25;
const MAX_POSTER_ASPECT_RATIO = 2.5;

export function getMediaViewOptions(): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		createCardMinWidthOption('海报最小宽度'),
		{
			type: 'slider',
			key: 'posterAspectRatio',
			displayName: '图像宽高比',
			default: DEFAULT_POSTER_ASPECT_RATIO,
			min: MIN_POSTER_ASPECT_RATIO,
			max: MAX_POSTER_ASPECT_RATIO,
			step: 0.01,
			instant: true,
		},
		{
			type: 'group',
			displayName: '内容',
			items: [
				propertyOption('titleProperty', '标题属性', '留空时使用文件名'),
				propertyOption('posterProperty', '封面属性', '选择海报图片属性'),
				propertyOption('episodesProperty', '剧集数属性', '选择剧集数属性'),
				propertyOption('durationProperty', '播放时长属性', '选择播放时长属性'),
				propertyOption('releaseDateProperty', '首播或上映日期', '选择日期属性'),
				propertyOption('genreProperty', '类型属性', '选择类型属性'),
				propertyOption('watchDateProperty', '最后观看日期属性', '选择日期属性'),
				{
					...propertyOption('ratingProperty', '评分属性', '选择可写入的评分属性'),
					filter: (property: BasesPropertyId) => property.startsWith('note.'),
				},
			],
		},
	];
}

export function readMediaViewOptions(
	config: BasesViewConfig,
): MediaViewOptions {
	return {
		cardMinWidth: readCardMinWidth(config.get('cardMinWidth')),
		posterAspectRatio: readPosterAspectRatio(config.get('posterAspectRatio')),
		titleProperty: config.getAsPropertyId('titleProperty'),
		posterProperty: config.getAsPropertyId('posterProperty'),
		episodesProperty: config.getAsPropertyId('episodesProperty'),
		durationProperty: config.getAsPropertyId('durationProperty'),
		releaseDateProperty: config.getAsPropertyId('releaseDateProperty'),
		genreProperty: config.getAsPropertyId('genreProperty'),
		watchDateProperty: config.getAsPropertyId('watchDateProperty'),
		ratingProperty: config.getAsPropertyId('ratingProperty'),
		markdownOpenMode: readMarkdownOpenMode(config),
	};
}

export function getPosterHeightFactor(value: number): number {
	return 1 / value;
}

function readPosterAspectRatio(value: unknown): number {
	const number = Number(value);
	if (!Number.isFinite(number)) return DEFAULT_POSTER_ASPECT_RATIO;
	return Math.min(MAX_POSTER_ASPECT_RATIO, Math.max(MIN_POSTER_ASPECT_RATIO, number));
}

function propertyOption(key: string, displayName: string, placeholder: string) {
	return { type: 'property' as const, key, displayName, placeholder };
}

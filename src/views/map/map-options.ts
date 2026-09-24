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

export interface MapViewOptions {
	mapHeight: number;
	defaultZoom: number;
	minZoom: number;
	maxZoom: number;
	coordinatesProperty: BasesPropertyId | null;
	titleProperty: BasesPropertyId | null;
	markerIconProperty: BasesPropertyId | null;
	markerColorProperty: BasesPropertyId | null;
	imageProperty: BasesPropertyId | null;
	mapTiles: string[];
	mapTilesDark: string[];
	markdownOpenMode: MarkdownOpenMode;
}

export const DEFAULT_MAP_CENTER: readonly [number, number] = [35, 105];
export const DEFAULT_MAP_ZOOM = 4;
export const DEFAULT_MAP_HEIGHT = 500;

export function getMapViewOptions(): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		{
			type: 'slider',
			key: 'mapHeight',
			displayName: '嵌入高度',
			default: DEFAULT_MAP_HEIGHT,
			min: 200,
			max: 800,
			step: 20,
			instant: true,
		},
		{
			type: 'group',
			displayName: '地图',
			items: [
				{
					type: 'formula',
					key: 'centerLatitude',
					displayName: '中心纬度',
					placeholder: String(DEFAULT_MAP_CENTER[0]),
				},
				{
					type: 'formula',
					key: 'centerLongitude',
					displayName: '中心经度',
					placeholder: String(DEFAULT_MAP_CENTER[1]),
				},
				sliderOption('defaultZoom', '默认缩放', DEFAULT_MAP_ZOOM, 0, 18),
				sliderOption('minZoom', '最小缩放', 0, 0, 24),
				sliderOption('maxZoom', '最大缩放', 18, 0, 24),
			],
		},
		{
			type: 'group',
			displayName: '标记',
			items: [
				propertyOption('coordinatesProperty', '坐标属性', '选择坐标属性'),
				propertyOption('titleProperty', '标题属性', '留空时使用文件名'),
				propertyOption('markerColorProperty', '标记颜色属性', '选择颜色属性'),
				propertyOption('markerIconProperty', '标记图标属性', '选择 Lucide 图标属性'),
				propertyOption('imageProperty', '标记封面属性', '选择弹出卡片封面属性'),
			],
		},
		{
			type: 'group',
			displayName: '背景',
			items: [
				{ type: 'multitext', key: 'mapTiles', displayName: '浅色地图瓦片' },
				{ type: 'multitext', key: 'mapTilesDark', displayName: '深色地图瓦片' },
			],
		},
	];
}

export function readMapViewOptions(config: BasesViewConfig): MapViewOptions {
	const minZoom = readNumber(config.get('minZoom'), 0, 0, 24);
	const maxZoom = readNumber(config.get('maxZoom'), 18, minZoom, 24);
	return {
		mapHeight: readNumber(config.get('mapHeight'), DEFAULT_MAP_HEIGHT, 200, 800),
		defaultZoom: readNumber(config.get('defaultZoom'), DEFAULT_MAP_ZOOM, minZoom, maxZoom),
		minZoom,
		maxZoom,
		coordinatesProperty: config.getAsPropertyId('coordinatesProperty'),
		titleProperty: config.getAsPropertyId('titleProperty'),
		markerIconProperty: config.getAsPropertyId('markerIconProperty'),
		markerColorProperty: config.getAsPropertyId('markerColorProperty'),
		imageProperty: config.getAsPropertyId('imageProperty'),
		mapTiles: readTextList(config.get('mapTiles')),
		mapTilesDark: readTextList(config.get('mapTilesDark')),
		markdownOpenMode: readMarkdownOpenMode(config),
	};
}

function sliderOption(
	key: string,
	displayName: string,
	defaultValue: number,
	min: number,
	max: number,
) {
	return {
		type: 'slider' as const, key, displayName, default: defaultValue,
		min, max, step: 0.1, instant: true,
	};
}

function propertyOption(key: string, displayName: string, placeholder: string) {
	return {
		type: 'property' as const,
		key,
		displayName,
		placeholder,
		filter: (property: BasesPropertyId) => !property.startsWith('file.'),
	};
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(max, Math.max(min, number));
}

function readTextList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is string =>
			typeof item === 'string' && item.trim().length > 0,
		).map((item) => item.trim());
	}
	return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

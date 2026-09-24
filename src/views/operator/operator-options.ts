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
export interface OperatorViewOptions {
	cardMinWidth: number;

	artworkProperty: BasesPropertyId | null;
	artworkPositionProperty: BasesPropertyId | null;
	hiddenArtworkProperty: BasesPropertyId | null;
	hiddenArtworkPositionProperty: BasesPropertyId | null;
	defaultArtworkProperty: BasesPropertyId | null;
	nameProperty: BasesPropertyId | null;
	codeProperty: BasesPropertyId | null;
	professionProperty: BasesPropertyId | null;
	rarityProperty: BasesPropertyId | null;
	factionProperty: BasesPropertyId | null;
	markdownOpenMode: MarkdownOpenMode;
}

export function getOperatorViewOptions(): BasesAllOptions[] {
	return [
		createMarkdownOpenModeOption(),
		createCardMinWidthOption('干员最小宽度'),
		{
			type: 'group',
			displayName: '内容',
			items: [
				propertyOption('artworkProperty', '普通立绘属性', '支持单个双链或双链列表'),
				propertyOption(
					'artworkPositionProperty',
					'普通立绘定位坐标属性',
					'格式: [横%, 纵%, 倍率]; 左上为 0,0, 向右, 向下为正, 反方向为负',
				),
				propertyOption(
					'hiddenArtworkProperty',
					'隐藏立绘属性',
					'开启隐藏模式后使用; 支持单个双链或双链列表',
				),
				propertyOption(
					'hiddenArtworkPositionProperty',
					'隐藏立绘定位坐标属性',
					'与隐藏立绘按顺序对应; 坐标允许负数',
				),
				propertyOption(
					'defaultArtworkProperty',
					'默认立绘属性',
					'数字序号; 1 表示第一张立绘',
				),
				propertyOption('nameProperty', '姓名属性', '留空时使用文件名'),
				propertyOption('codeProperty', '代号属性', '选择英文名或代号属性'),
				propertyOption('professionProperty', '职业属性', '例如: 先锋, 近卫, 重装'),
				propertyOption('rarityProperty', '星级属性', '仅支持数字 1-7'),
				propertyOption('factionProperty', '阵营属性', '例如: 罗德岛, 龙门, 莱茵生命'),
			],
		},
	];
}

export function readOperatorViewOptions(config: BasesViewConfig): OperatorViewOptions {
	return {
		cardMinWidth: readCardMinWidth(config.get('cardMinWidth')),
		artworkProperty: config.getAsPropertyId('artworkProperty'),
		artworkPositionProperty: config.getAsPropertyId('artworkPositionProperty'),
		hiddenArtworkProperty: config.getAsPropertyId('hiddenArtworkProperty'),
		hiddenArtworkPositionProperty: config.getAsPropertyId(
			'hiddenArtworkPositionProperty',
		),
		defaultArtworkProperty: config.getAsPropertyId('defaultArtworkProperty'),
		nameProperty: config.getAsPropertyId('nameProperty'),
		codeProperty: config.getAsPropertyId('codeProperty'),
		professionProperty: config.getAsPropertyId('professionProperty'),
		rarityProperty: config.getAsPropertyId('rarityProperty'),
		factionProperty: config.getAsPropertyId('factionProperty'),
		markdownOpenMode: readMarkdownOpenMode(config),
	};
}

function propertyOption(key: string, displayName: string, placeholder: string) {
	return { type: 'property' as const, key, displayName, placeholder };
}

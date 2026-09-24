import type { BasesAllOptions, BasesPropertyId, BasesViewConfig } from 'obsidian';
import { createMarkdownOpenModeOption, readMarkdownOpenMode, type MarkdownOpenMode } from '../../services/markdown-navigation';
import { createCardMinWidthOption, readCardMinWidth } from '../shared/card-sizing';
import { createCardMaterialOption, readCardMaterialSelection, type CardMaterialSelection } from '../shared/card-material-surface';

export const MINION_FIELDS = [
	['title', '名称', '未映射时使用文件名'],
	['cardNumber', '卡牌编号', '用于 Bases 排序'],
	['description', '描述', '支持换行及 **加粗**, *斜体*'],
	['flavor', '趣闻', '支持换行及 **加粗**, *斜体*'],
	['expansion', '拓展包', '趣闻面板显示的拓展包名'],
	['derivedParent', '衍生父对象', '卡牌笔记双链'],
	['cardType', '类型', '传统对战: 随从, 英雄, 技能, 法术, 武器, 地标; 酒馆战棋: 随从, 英雄, 技能, 法术'],
	['finish', '外观', '普通, 金卡, 钻石卡, 异画'],
	['artwork', '原画', 'Vault 图片双链或双链列表; 钻石卡使用透明角色图'],
	['artworkPosition', '插画定位', '文本: [横%,纵%,倍率], 默认 [50,0,1.48]'],
	['classes', '职业', '中立或职业名称, 双职业列表按左, 右排列'],
	['rarity', '稀有度', '无, 仅龙边, 普通, 稀有, 史诗, 传说'],
	['cost', '消耗', '传统对战: 法力水晶-5, 生命值-5, 残骸-5 或护甲值-5; 酒馆战棋: 铸币-5, 时光标记-5 或无'],
	['stats', '属性值', '随从: 攻击力/生命值; 武器: 攻击力/耐久度; 地标: 耐久度'],
	['tribes', '种族/派系/类型', '随卡牌类型显示'],
	['banner', '旗帜/符文', '旗帜选项或单个文本值, 例如 符文-红/蓝/绿'],
] as const;
export type MinionField = typeof MINION_FIELDS[number][0];

export interface HearthstoneOptions {
	cardMinWidth: number;
	markdownOpenMode: MarkdownOpenMode;
	properties: Record<MinionField, BasesPropertyId | null>;
	material: CardMaterialSelection;
	collapseRelatedCards: boolean;
}

export function getHearthstoneViewOptions(): BasesAllOptions[] {
	const content: BasesAllOptions = {
		type: 'group', displayName: '内容',
		items: MINION_FIELDS.map(([key, name, placeholder]) => ({
			type: 'property', key: `${key}Property`, displayName: `${name}属性`, placeholder,
		})),
	};
	return [createMarkdownOpenModeOption(), createCardMinWidthOption('卡牌最小宽度'),
		createCardMaterialOption(),
		{
			type: 'toggle', key: 'collapseRelatedCards', displayName: '收纳相关卡牌', default: true,
		},
		content,
	];
}

export function readHearthstoneOptions(config: BasesViewConfig): HearthstoneOptions {
	return {
		cardMinWidth: readCardMinWidth(config.get('cardMinWidth')),
		markdownOpenMode: readMarkdownOpenMode(config),
		properties: Object.fromEntries(MINION_FIELDS.map(([key]) => [key, config.getAsPropertyId(`${key}Property`)])) as HearthstoneOptions['properties'],
		material: readCardMaterialSelection(config),
		collapseRelatedCards: config.get('collapseRelatedCards') !== false,
	};
}

import { parseArtworkPosition, type ArtworkPosition } from '../shared/artwork-position';
export type { ArtworkPosition } from '../shared/artwork-position';

export const HEARTHSTONE_CLASSES = [
	'中立', '战士', '术士', '萨满祭司', '潜行者', '牧师',
	'圣骑士', '法师', '猎人', '德鲁伊', '恶魔猎手', '死亡骑士',
] as const;

export type HearthstoneClass = typeof HEARTHSTONE_CLASSES[number];
export const MINION_CARD_SCOPES = ['传统对战', '酒馆战棋'] as const;
export type MinionCardScope = typeof MINION_CARD_SCOPES[number];
export const MINION_CARD_KINDS = ['随从', '英雄', '技能', '法术', '武器', '地标'] as const;
export type MinionCardKind = typeof MINION_CARD_KINDS[number];
export const MINION_TIER_VALUES = ['1', '2', '3', '4', '5', '6', '7'] as const;
export const MINION_CARD_TYPES = [
	'传统对战-随从', '传统对战-英雄', '传统对战-法术', '传统对战-武器', '传统对战-地标',
	'传统对战-技能', '酒馆战棋-随从', '酒馆战棋-英雄', '酒馆战棋-技能', '酒馆战棋-法术',
] as const;
export type MinionCardType = typeof MINION_CARD_TYPES[number];
export const MINION_FINISHES = ['普通', '金卡', '钻石卡', '异画'] as const;
export type MinionFinish = typeof MINION_FINISHES[number];
export const MINION_RARITIES = ['无', '仅龙边', '普通', '稀有', '史诗', '传说'] as const;
export type MinionRarity = typeof MINION_RARITIES[number];
export const TRADITIONAL_COST_TYPES = ['法力水晶', '生命值', '残骸', '护甲值'] as const;
export const BATTLEGROUND_COST_TYPES = ['无', '铸币', '时光标记'] as const;
export const COST_TYPES = [...TRADITIONAL_COST_TYPES, ...BATTLEGROUND_COST_TYPES] as const;
export type CostType = typeof COST_TYPES[number];
export const RUNE_TYPES = ['红', '蓝', '绿'] as const;
export type RuneType = typeof RUNE_TYPES[number];
export const MINION_BANNERS = ['无', '预备', '锻造', '可交易', '暗金教', '污手党', '玉莲帮', '人族', '异虫', '星灵', '符文'] as const;

export interface MinionData {
	title: string;
	description: string;
	flavor: string;
	expansion: string;
	cardType: MinionCardType;
	finish: MinionFinish;
	classes: HearthstoneClass[];
	rarity: MinionRarity;
	cost: string;
	costType: CostType;
	tier: number;
	attack: string;
	health: string;
	heroStat: string;
	tribes: string[];
	runes: RuneType[];
	banner: string;
	skill: SkillData;
}

interface SkillData {
	name: string;
	description: string;
	artwork: string;
	artworkPosition: ArtworkPosition;
	cost: string;
}

export function isHeroCard(data: Pick<MinionData, 'cardType'>): boolean {
	return data.cardType.endsWith('-英雄');
}

export function isSkillCard(data: Pick<MinionData, 'cardType'>): boolean {
	return data.cardType.endsWith('-技能');
}

export function cardKind(data: Pick<MinionData, 'cardType'>): MinionCardKind {
	return splitMinionCardType(data.cardType)[1];
}

export function valueText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
	return '';
}

export function valueList(value: unknown): string[] {
	return [...new Set(valueSequence(value))];
}

export function valueSequence(value: unknown): string[] {
	return Array.isArray(value) ? value.flatMap(valueSequence)
		: valueText(value).split(/[,，、/\n]+/u).map((item) => item.trim()).filter(Boolean);
}

const CLASS_ALIASES: Record<string, HearthstoneClass> = {
	neutral: '中立', warrior: '战士', warlock: '术士', shaman: '萨满祭司',
	rogue: '潜行者', priest: '牧师', paladin: '圣骑士', mage: '法师',
	hunter: '猎人', druid: '德鲁伊', demonhunter: '恶魔猎手', deathknight: '死亡骑士',
	萨满: '萨满祭司', 盗贼: '潜行者', 骑士: '圣骑士', 德鲁依: '德鲁伊',
};

export function readClasses(value: unknown): HearthstoneClass[] {
	const result = valueList(value).map((name) => {
		if ((HEARTHSTONE_CLASSES as readonly string[]).includes(name)) return name as HearthstoneClass;
		return CLASS_ALIASES[name.toLowerCase().replace(/[\s_-]/g, '')];
	}).filter((name): name is HearthstoneClass => name !== undefined);
	return [...new Set(result)].slice(0, 2);
}

function readRunes(value: unknown): RuneType[] {
	const aliases: Record<string, RuneType> = {
		red: '红', blood: '红', 血: '红', 鲜血: '红',
		blue: '蓝', frost: '蓝', 冰: '蓝', 冰霜: '蓝',
		green: '绿', unholy: '绿', 邪: '绿', 邪恶: '绿',
	};
	return valueSequence(value).map((name) => {
		if ((RUNE_TYPES as readonly string[]).includes(name)) return name as RuneType;
		return aliases[name.toLowerCase().replace(/[\s_-]/g, '')];
	}).filter((name): name is RuneType => name !== undefined).slice(0, 3);
}

function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
	const text = valueText(value);
	return choices.includes(text as T) ? text as T : fallback;
}

export interface MinionCost { type: CostType; value: string }

export function readMinionCost(value: unknown, cardType: MinionCardType): MinionCost {
	if (cardType === '酒馆战棋-英雄') return { type: '无', value: '' };
	const text = valueText(value);
	const skill = cardType.endsWith('-技能');
	const battlegroundCost = cardType.startsWith('酒馆战棋-') && !cardType.endsWith('-英雄');
	if (battlegroundCost && text.startsWith('酒馆等级-')) return { type: '铸币', value: '' };
	if (text === '无') return battlegroundCost && !skill
		? { type: '无', value: '' }
		: { type: battlegroundCost ? '铸币' : '法力水晶', value: '' };
	const aliases: Readonly<Record<string, CostType>> = {
		水晶: '法力水晶', 尸体: '残骸', corpse: '残骸', corpses: '残骸',
		护甲: '护甲值', armor: '护甲值', armour: '护甲值',
	};
	const candidates = [...COST_TYPES, ...Object.keys(aliases)];
	const prefix = candidates.find((candidate) => text.startsWith(candidate + '-'));
	const parsedType = prefix ? aliases[prefix] ?? prefix as CostType : null;
	const parsedValue = prefix ? text.slice(prefix.length + 1).trim() : text;
	const allowed: readonly CostType[] = skill
		? battlegroundCost ? ['铸币'] : ['法力水晶']
		: battlegroundCost ? BATTLEGROUND_COST_TYPES : TRADITIONAL_COST_TYPES;
	const fallbackType: CostType = battlegroundCost
		? '铸币'
		: '法力水晶';
	const type = parsedType && allowed.includes(parsedType)
		? parsedType
		: fallbackType;
	return { type, value: type === '无' ? '' : parsedValue };
}

function readMinionTier(value: unknown): number {
	const tier = valueText(value).match(/^酒馆战棋-(?:随从|法术)-([1-7])$/u)?.[1];
	return boundedNumber(tier, 1, 1, 7, true);
}

export function formatMinionCost(type: CostType, value: string): string {
	if (type === '无') return '无';
	const text = value.trim();
	return `${type}-${text}`;
}

export function readMinionStats(value: unknown): { attack: string; health: string } {
	const [attack = '', health = ''] = valueText(value).split('/', 2);
	return { attack: attack.trim(), health: health.trim() };
}

export function formatMinionStats(attack: string, health: string): string {
	return attack.trim() || health.trim() ? `${attack.trim()}/${health.trim()}` : '';
}

export interface MinionBannerData { banner: string; runes: RuneType[] }

export function readMinionBanner(value: unknown): MinionBannerData {
	const text = valueText(value);
	const fallback: [RuneType, RuneType, RuneType] = ['红', '红', '红'];
	if (text === '符文' || text.startsWith('符文-')) {
		const values = readRunes(text.slice('符文'.length).replace(/^-/, ''));
		return { banner: '符文', runes: [values[0] ?? fallback[0], values[1] ?? values[0] ?? fallback[1], values[2] ?? values[1] ?? values[0] ?? fallback[2]] };
	}
	return { banner: choice(value, MINION_BANNERS, '无'), runes: [] };
}

export function formatMinionBanner(banner: string, runes: readonly RuneType[]): string {
	if (banner !== '符文') return banner;
	return `符文-${[runes[0] ?? '红', runes[1] ?? runes[0] ?? '红', runes[2] ?? runes[1] ?? runes[0] ?? '红'].join('/')}`;
}

export function formatMinionCardType(scope: MinionCardScope, kind: MinionCardKind, tier = 1): string {
	return scope === '酒馆战棋' && (kind === '随从' || kind === '法术')
		? `${scope}-${kind}-${boundedNumber(tier, 1, 1, 7, true)}`
		: `${scope}-${kind}`;
}

export function splitMinionCardType(value: MinionCardType): [MinionCardScope, MinionCardKind] {
	const kind = MINION_CARD_KINDS.find((candidate) => value.includes(`-${candidate}`)) ?? '随从';
	return [value.startsWith('酒馆战棋-') ? '酒馆战棋' : '传统对战', kind];
}

export function readMinionCardType(value: unknown): MinionCardType {
	const text = valueText(value), normalized = text.toLowerCase();
	if (/^酒馆战棋-随从-[1-7]$/u.test(text)) return '酒馆战棋-随从';
	if (/^酒馆战棋-法术-[1-7]$/u.test(text)) return '酒馆战棋-法术';
	const aliases: Record<string, MinionCardType> = {
		traditional: '传统对战-随从', standard: '传统对战-随从', 传统: '传统对战-随从',
		传统模式: '传统对战-随从', 传统对战: '传统对战-随从', '传统模式-随从': '传统对战-随从',
		battlegrounds: '酒馆战棋-随从', battleground: '酒馆战棋-随从', 战棋: '酒馆战棋-随从',
		酒馆战棋: '酒馆战棋-随从',
		hero: '传统对战-英雄', 英雄: '传统对战-英雄', '传统模式-英雄': '传统对战-英雄',
		'传统对战-英雄': '传统对战-英雄', '酒馆战棋-英雄': '酒馆战棋-英雄',
		skill: '传统对战-技能', power: '传统对战-技能', 技能: '传统对战-技能',
		'传统对战-技能': '传统对战-技能', '酒馆战棋-技能': '酒馆战棋-技能',
		spell: '传统对战-法术', 法术: '传统对战-法术', '传统对战-法术': '传统对战-法术', '酒馆战棋-法术': '酒馆战棋-法术',
		weapon: '传统对战-武器', 武器: '传统对战-武器', '传统对战-武器': '传统对战-武器',
		location: '传统对战-地标', 地标: '传统对战-地标', '传统对战-地标': '传统对战-地标',
	};
	return aliases[normalized] ?? choice(text, MINION_CARD_TYPES, '传统对战-随从');
}

export function readMinionData(input: Record<string, unknown>, fallbackTitle?: string): MinionData {
	const parsedClasses = readClasses(input.classes);
	const cardType = readMinionCardType(input.cardType);
	const rawFinish = valueText(input.finish).toLowerCase();
	const finishAliases: Record<string, MinionFinish> = {
		normal: '普通', golden: '金卡', gold: '金卡', diamond: '钻石卡', 金色: '金卡', 钻石: '钻石卡',
		pegasus: '异画', 天马年异画: '异画',
	};
	const parsedFinish = finishAliases[rawFinish] ?? choice(input.finish, MINION_FINISHES, '普通');
	const rawRarity = valueText(input.rarity).toLowerCase();
	const rarityAliases: Record<string, MinionRarity> = {
		none: '无', basic: '无', common: '普通', rare: '稀有', epic: '史诗', legendary: '传说',
		dragon: '仅龙边', dragonborder: '仅龙边', 基础: '无', 龙边: '仅龙边',
	};
	const parsedRarity = rarityAliases[rawRarity] ?? choice(input.rarity, MINION_RARITIES, '普通');
	const cost = readMinionCost(input.cost, cardType);
	const stats = readMinionStats(input.stats);
	const battleground = cardType.startsWith('酒馆战棋-');
	const hero = cardType.endsWith('-英雄');
	const kind = splitMinionCardType(cardType)[1];
	const skillCard = kind === '技能';
	const banner = battleground || skillCard ? { banner: '无', runes: [] } : readMinionBanner(input.banner);
	const canUseDiamond = kind === '随从' && !battleground;
	let finish: MinionFinish = parsedFinish === '钻石卡' && !canUseDiamond ? '普通' : parsedFinish;
	if (battleground && finish !== '普通' && (finish !== '金卡' || kind === '法术')) finish = '普通';
	if (skillCard) finish = '普通';
	const title = valueText(input.title) || fallbackTitle || '';
	const description = valueText(input.description);
	const skill: SkillData = skillCard ? {
		name: title,
		description,
		artwork: valueText(Array.isArray(input.artwork) ? input.artwork[0] : input.artwork),
		artworkPosition: readArtworkPosition(input.artworkPosition),
		cost: cost.value,
	} : { name: '', description: '', artwork: '', artworkPosition: { x: 50, y: 0, scale: 1 }, cost: '' };
	return {
		title,
		description,
		flavor: skillCard ? '' : valueText(input.flavor),
		expansion: valueText(input.expansion),
		cardType,
		finish,
		classes: battleground || skillCard ? ['中立'] : parsedClasses.length ? parsedClasses : ['中立'],
		rarity: skillCard ? '无' : battleground
			? kind === '随从' && (parsedRarity === '无' || parsedRarity === '仅龙边') ? parsedRarity : '无'
			: parsedRarity,
		cost: cost.value, costType: cost.type,
		tier: readMinionTier(input.cardType),
		attack: hero || skillCard || kind === '法术' ? '' : stats.attack,
		health: hero || skillCard || kind === '法术' ? '' : (kind === '地标' ? stats.attack : stats.health),
		heroStat: hero ? valueText(input.stats) : '',
		tribes: hero || skillCard || battleground ? [] : valueList(input.tribes).slice(0, kind === '武器' || kind === '地标' ? 1 : 2), runes: banner.runes,
		banner: banner.banner,
		skill,
	};
}

export function boundedNumber(value: unknown, fallback: number, min: number, max: number, integer = false): number {
	if (valueText(value) === '') return fallback;
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(max, Math.max(min, integer ? Math.round(number) : number));
}

export function readArtworkPosition(value: unknown, index = 0): ArtworkPosition {
	return parseArtworkPosition(value, index);
}

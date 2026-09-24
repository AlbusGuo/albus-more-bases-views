import type { HearthstoneAsset } from './hearthstone-assets-v813';
import { cardKind, HEARTHSTONE_CLASSES, isHeroCard, type MinionData, type MinionFinish, type MinionRarity, type RuneType } from './hearthstone-model';

export interface HearthstoneAssets {
	HEARTHSTONE_ASSETS: Readonly<Record<string, HearthstoneAsset>>;
	HEARTHSTONE_BLEND_MODES: Readonly<Record<string, string>>;
}
export type TemplateBlendMode = 'normal' | 'multiply' | 'soft-light';
export interface TemplateClip { x: number; y: number; width: number; height: number }
export interface TemplateLayer {
	key: string;
	asset: HearthstoneAsset;
	blendMode: TemplateBlendMode;
	opacity: number;
	clip?: TemplateClip;
}
export interface MinionTemplate {
	underlay: TemplateLayer[];
	overlay: TemplateLayer[];
	artMask: HearthstoneAsset;
	backgroundMask: HearthstoneAsset;
	diamond: boolean;
}
type TemplateStyle = 'standard' | 'diamond' | 'pegasus';
const mergedAssets: Record<string, HearthstoneAsset> = {};
const mergedBlendModes: Record<string, string> = {};
const assets: HearthstoneAssets = {
	HEARTHSTONE_ASSETS: mergedAssets,
	HEARTHSTONE_BLEND_MODES: mergedBlendModes,
};
let cardAssetsPromise: Promise<void> | null = null;
let heroAssetsPromise: Promise<void> | null = null;
let finalAssetsPromise: Promise<void> | null = null;

export async function loadHearthstoneAssetsFor(data: MinionData): Promise<HearthstoneAssets> {
	const required = [loadCardAssets()];
	const kind = cardKind(data), battleground = data.cardType.startsWith('酒馆战棋-');
	if (kind === '英雄' || kind === '技能') required.push(loadHeroAssets());
	if (kind === '法术' || kind === '武器' || kind === '地标' ||
		(battleground && (kind === '英雄' || kind === '技能'))) {
		required.push(loadFinalAssets());
	}
	await Promise.all(required);
	return assets;
}

export async function loadHearthstoneAssets(): Promise<HearthstoneAssets> {
	await Promise.all([loadCardAssets(), loadHeroAssets(), loadFinalAssets()]);
	return assets;
}

function loadCardAssets(): Promise<void> {
	cardAssetsPromise ??= import('./hearthstone-assets-v813').then(module => {
		Object.assign(mergedAssets, module.HEARTHSTONE_ASSETS);
		Object.assign(mergedBlendModes, module.HEARTHSTONE_BLEND_MODES);
	}).catch((error: unknown) => { cardAssetsPromise = null; throw error; });
	return cardAssetsPromise;
}

function loadHeroAssets(): Promise<void> {
	heroAssetsPromise ??= import('./hearthstone-hero-assets').then(module => {
		Object.assign(mergedAssets, module.HEARTHSTONE_HERO_ASSETS);
		Object.assign(mergedBlendModes, module.HEARTHSTONE_HERO_BLEND_MODES);
	}).catch((error: unknown) => { heroAssetsPromise = null; throw error; });
	return heroAssetsPromise;
}

function loadFinalAssets(): Promise<void> {
	finalAssetsPromise ??= import('./hearthstone-final-assets').then(module => {
		Object.assign(mergedAssets, module.HEARTHSTONE_FINAL_ASSETS);
		Object.assign(mergedBlendModes, module.HEARTHSTONE_FINAL_BLEND_MODES);
	}).catch((error: unknown) => { finalAssetsPromise = null; throw error; });
	return finalAssetsPromise;
}

/** PSD addresses remain isolated here; the rest of the view uses semantic card fields. */
export function createMinionTemplate(data: MinionData, pack: HearthstoneAssets): MinionTemplate {
	if (isHeroCard(data)) return createHeroTemplate(data, pack);
	if (cardKind(data) !== '随从') return createFinalTypeTemplate(data, pack);
	const underlay: TemplateLayer[] = [];
	const overlay: TemplateLayer[] = [];
	let target = underlay;
	const add = (key: string, overrideBlend?: TemplateBlendMode, opacity = 1, clip?: TemplateClip): void => {
		const asset = pack.HEARTHSTONE_ASSETS[key];
		if (!asset) throw new Error(`卡牌素材缺失: ${key}`);
		const blend = pack.HEARTHSTONE_BLEND_MODES[key];
		const blendMode: TemplateBlendMode = overrideBlend ?? (blend === 'multiply' || blend === 'soft-light' ? blend : 'normal');
		target.push({ key, asset, blendMode, opacity, ...(clip ? { clip } : {}) });
	};
	const style = finishStyle(data.finish);
	if (style === 'standard') {
		addStandardCard(data, add);
		addClassicWatermark(data, style, add);
		if (!data.runes.length) addBanner(data, style, add);
		addRunes(data.runes, style, add);
		addCosts(data, style, add);
	} else if (style === 'diamond') {
		addDiamondCard(data, add); target = overlay; add('diamond.9');
		addClassicWatermark(data, style, add);
		addStats(data, style, add);
		if (!data.runes.length) addBanner(data, style, add);
		addRunes(data.runes, style, add);
		addCosts(data, style, add);
	} else if (style === 'pegasus') {
		addPegasusCard(data, add);
		if (!data.runes.length || isFactionBanner(data.banner)) addBanner(data, style, add);
		addRunes(data.runes, style, add);
		addCosts(data, style, add);
	}
	const artMask = pack.HEARTHSTONE_ASSETS[`mask.${style === 'standard' ? 'standard' : style}-art`]
		?? pack.HEARTHSTONE_ASSETS['mask.diamond-foreground'];
	const backgroundMask = pack.HEARTHSTONE_ASSETS['mask.diamond-background'];
	if (!artMask || !backgroundMask) throw new Error('随从插画蒙版缺失.');
	return { underlay, overlay, artMask, backgroundMask, diamond: style === 'diamond' };
}

function createFinalTypeTemplate(data: MinionData, pack: HearthstoneAssets): MinionTemplate {
	const kind = cardKind(data);
	if (kind !== '法术' && kind !== '武器' && kind !== '地标') throw new Error(`不支持的卡牌类型: ${kind}`);
	const type = kind === '法术' ? 'spell' : kind === '武器' ? 'weapon' : 'location';
	const underlay: TemplateLayer[] = [];
	const overlay: TemplateLayer[] = [];
	const alternate = data.finish === '异画';
	const add = (key: string): void => {
		const asset = pack.HEARTHSTONE_ASSETS[key];
		if (!asset) throw new Error(`${kind}素材缺失: ${key}`);
		const blend = pack.HEARTHSTONE_BLEND_MODES[key];
		const layer = { key, asset, blendMode: blend === 'multiply' || blend === 'soft-light' ? blend : 'normal', opacity: 1 } as const;
		const structuralLocationLayer = /^location\.(?:art-shadow|(?:normal|gold)\.(?:base|class-base|class\.|dual\.))/u.test(key);
		if (type === 'location' && !alternate && !structuralLocationLayer) overlay.push(layer);
		else underlay.push(layer);
	};
	if (alternate) addPegasusFinalCard(data, type, add);
	else addStandardFinalCard(data, type, add);
	const artMask = pack.HEARTHSTONE_ASSETS[alternate ? 'mask.pegasus-art' : `mask.${type}-art`];
	const backgroundMask = pack.HEARTHSTONE_ASSETS['mask.diamond-background'];
	if (!artMask || !backgroundMask) throw new Error(`${kind}插画蒙版缺失.`);
	return { underlay, overlay, artMask, backgroundMask, diamond: false };
}

type FinalCardType = 'spell' | 'weapon' | 'location';

function addStandardFinalCard(data: MinionData, type: FinalCardType, add: (key: string) => void): void {
	const battleground = data.cardType === '酒馆战棋-法术';
	const style = data.finish === '金卡' ? 'gold' : 'normal';
	const prefix = `${type}.${style}`;
	const dual = !battleground && data.classes.length === 2;
	add(`${type}.art-shadow`);
	if (style === 'gold') {
		add(`${prefix}.base`);
		if (type === 'location') add('location.gold.class-base');
	}
	if (battleground) add('spell.normal.tavern');
	else if (dual) {
		add(`${prefix}.dual.left.${classIndex(data.classes[0])}`);
		add(`${prefix}.dual.right.${classIndex(data.classes[1])}`);
		if (style === 'gold' && type !== 'location') add(`${prefix}.dual.seam`);
	} else add(`${prefix}.class.${classIndex(data.classes[0])}`);
	if (type === 'location') add(`${prefix}.art-frame`);
	if (data.description && !(type === 'location' && style === 'gold')) add(`${prefix}.description`);
	if (data.tribes.length) add(type === 'weapon' && style === 'gold'
		? 'weapon.normal.type'
		: type === 'spell' && style === 'normal' && data.tribes.length === 2
			? 'spell.normal.dual-faction' : `${prefix}.${type === 'spell' ? 'faction' : 'type'}`);
	if (!battleground) addFinalRarity(data, prefix, add);
	if (!battleground && isInterstellarBanner(data.banner)) add(`${prefix}.ribbon`);
	if (style === 'gold') {
		const parts = type === 'spell' ? 5 : type === 'weapon' ? 11 : 2;
		for (let index = 0; index < parts; index += 1) add(`${prefix}.part.${index}`);
	}
	if (type === 'weapon') {
		add(`${prefix}.attack`);
		add(`${prefix}.durability`);
	} else if (type === 'location') add('location.durability');
	add(`${prefix}.title`);
	if (!battleground) {
		if (!data.runes.length) addBanner(data, 'standard', add);
		addRunes(data.runes, 'standard', add);
	}
	addCosts(data, 'standard', add);
}

function addFinalRarity(data: MinionData, prefix: string, add: (key: string) => void): void {
	if (data.rarity === '仅龙边') { add(`${prefix}.rarity.dragon`); return; }
	const key: Readonly<Partial<Record<MinionRarity, string>>> = { 普通: 'common', 稀有: 'rare', 史诗: 'epic', 传说: 'legendary' };
	const gem = key[data.rarity];
	if (!gem) return;
	if (data.rarity === '传说') add(`${prefix}.rarity.dragon`);
	add(`${prefix}.rarity.frame`); add(`${prefix}.rarity.${gem}`);
}

function addPegasusFinalCard(data: MinionData, type: FinalCardType, add: (key: string) => void): void {
	add(`pegasus.${type}.shadow`);
	if (data.description) { add('pegasus.5.2.0'); add('pegasus.5.2.1'); }
	add(`pegasus.${type}.frame`);
	if (type === 'weapon') {
		add('pegasus.weapon.attack');
		add('pegasus.weapon.durability');
	} else if (type === 'location') add('pegasus.location.durability');
	add(`pegasus.6.${classIndex(data.classes[0])}`);
	if (data.classes.length === 2) { add(`pegasus.7.0.${classIndex(data.classes[1])}`); add('pegasus.7.1'); }
	addSpecialRarity(data, 'pegasus.9', add);
	if (!data.runes.length || isFactionBanner(data.banner)) addBanner(data, 'pegasus', add);
	addRunes(data.runes, 'pegasus', add); addCosts(data, 'pegasus', add);
}

function createHeroTemplate(data: MinionData, pack: HearthstoneAssets): MinionTemplate {
	const underlay: TemplateLayer[] = [];
	const overlay: TemplateLayer[] = [];
	const add = (key: string, clip?: TemplateClip): void => {
		const asset = pack.HEARTHSTONE_ASSETS[key];
		if (!asset) throw new Error(`英雄素材缺失: ${key}`);
		const blend = pack.HEARTHSTONE_BLEND_MODES[key];
		const blendMode: TemplateBlendMode = blend === 'multiply' || blend === 'soft-light' ? blend : 'normal';
		underlay.push({ key, asset, blendMode, opacity: 1, ...(clip ? { clip } : {}) });
	};
	const style = finishStyle(data.finish);
	if (style === 'pegasus') addPegasusHero(data, add);
	else addStandardHero(data, add);
	if (!data.cardType.startsWith('酒馆战棋-')) {
		if (!data.runes.length || isFactionBanner(data.banner)) addBanner(data, style, key => add(key));
		addRunes(data.runes, style, key => add(key));
		addCosts(data, style, key => add(key));
	}
	const artMask = pack.HEARTHSTONE_ASSETS[style === 'pegasus' ? 'mask.pegasus-art' : 'mask.hero-art'];
	const backgroundMask = pack.HEARTHSTONE_ASSETS['mask.diamond-background'];
	if (!artMask || !backgroundMask) throw new Error('英雄插画蒙版缺失.');
	return { underlay, overlay, artMask, backgroundMask, diamond: false };
}

function addStandardHero(data: MinionData, add: (key: string, clip?: TemplateClip) => void): void {
	const golden = data.finish === '金卡';
	const battleground = data.cardType === '酒馆战棋-英雄';
	const dual = !battleground && data.classes.length === 2;
	const firstClass = classIndex(data.classes[0]);
	const secondClass = classIndex(data.classes[1]);
	add('hero.art-shadow');
	if (golden) {
		add('hero.golden.base');
		if (dual) {
			add(`hero.golden.dual.left.${firstClass}`);
			add(`hero.golden.dual.right.${secondClass}`);
			add('hero.golden.dual.seam');
		} else add(`hero.golden.class.${battleground ? 0 : firstClass}`);
		if (battleground) add('hero.normal.battleground');
		if (!battleground) addHeroRarity(data, 'hero.golden', add);
		if (!battleground && isInterstellarBanner(data.banner)) add('hero.golden.multi-class-ribbon');
		for (let index = 0; index < 4; index += 1) add(`hero.golden.part.${index}`);
	} else {
		if (dual) {
			add(`hero.normal.class.${firstClass}`, { x: 80, y: 66, width: 186, height: 575 });
			add(`hero.normal.class.${secondClass}`, { x: 266, y: 66, width: 194, height: 575 });
		} else add(`hero.normal.class.${battleground ? 0 : firstClass}`);
		add('hero.normal.description');
		if (battleground) add('hero.normal.battleground');
		else addHeroRarity(data, 'hero.normal', add);
		if (!battleground && isInterstellarBanner(data.banner)) add('hero.normal.multi-class-ribbon');
		add('hero.normal.title');
	}
	add('hero.stat.armor');
}

function addHeroRarity(data: MinionData, prefix: 'hero.normal' | 'hero.golden',
	add: (key: string) => void): void {
	if (data.rarity === '仅龙边') { add(`${prefix}.rarity.dragon`); return; }
	const gems: Readonly<Partial<Record<MinionRarity, string>>> = {
		普通: 'common', 稀有: 'rare', 史诗: 'epic', 传说: 'legendary',
	};
	const gem = gems[data.rarity];
	if (!gem) return;
	if (data.rarity === '传说') add(`${prefix}.rarity.dragon`);
	add(`${prefix}.rarity.frame`);
	add(`${prefix}.rarity.${gem}`);
}

function addPegasusHero(data: MinionData, add: (key: string) => void): void {
	const dual = data.classes.length === 2;
	add('pegasus.hero.shadow');
	if (data.description) {
		add('pegasus.hero.description-shadow');
		add('pegasus.hero.separator');
	}
	add('pegasus.hero.frame');
	add('pegasus.hero.armor');
	add(`pegasus.6.${classIndex(data.classes[0])}`);
	if (dual) {
		add(`pegasus.7.0.${classIndex(data.classes[1])}`);
		add('pegasus.7.1');
	}
	addSpecialRarity(data, 'pegasus.9', add);
}

function finishStyle(finish: MinionFinish): TemplateStyle {
	if (finish === '钻石卡') return 'diamond';
	if (finish === '异画') return 'pegasus';
	return 'standard';
}

function addStandardCard(data: MinionData, add: (key: string) => void): void {
	const golden = data.finish === '金卡';
	const prefix = `standard.${golden ? 'golden' : 'normal'}`;
	const dual = data.classes.length === 2;
	const mainClass = data.classes.length > 2 ? 0 : classIndex(data.classes[0]);
	add('standard.art-shadow');
	if (golden) add(`${prefix}.base`);
	if (dual) {
		add(`${prefix}.dual-class.1.${classIndex(data.classes[0])}`);
		add(`${prefix}.dual-class.0.${classIndex(data.classes[1])}`);
		if (golden) add(`${prefix}.dual-class.2`);
	} else add(`${prefix}.class.${mainClass}`);
	add(`${prefix}.description`);
	if (data.tribes.length === 1) add(`${prefix}.single-tribe.0`);
	else if (data.tribes.length === 2) {
		add(`${prefix}.dual-tribe.0`);
		if (!golden) add(`${prefix}.dual-tribe.3`);
	}
	if (golden) for (let index = 0; index < 5; index++) add(`${prefix}.parts.${index}`);
	addStandardRarity(data, prefix, golden, add);
	if (isInterstellarBanner(data.banner)) add(`${prefix}.multi-class-ribbon`);
	addStats(data, 'standard', add);
	add(`${prefix}.title`);
}

function addStandardRarity(data: MinionData, prefix: string, golden: boolean, add: (key: string) => void): void {
	if (data.rarity === '仅龙边') { add(`${prefix}.rarity.0`); return; }
	const gem = ['传说', '史诗', '稀有', '普通'].indexOf(data.rarity);
	if (gem < 0) return;
	if (data.rarity === '传说') add(`${prefix}.rarity.0`);
	if (golden) {
		add(`${prefix}.rarity.1`);
		add(`${prefix}.rarity.${gem + 2}`);
	} else {
		add(`${prefix}.rarity.${gem + 1}`);
		add(`${prefix}.rarity.5`);
	}
}

function addDiamondCard(data: MinionData, add: (key: string) => void): void {
	const dual = data.classes.length === 2;
	const mainClass = data.classes.length > 2 ? 0 : classIndex(data.classes[0]);
	add('diamond.1'); add('diamond.2'); add(`diamond.3.${mainClass}`);
	if (dual) { add(`diamond.4.0.${classIndex(data.classes[1])}`); add('diamond.4.1'); }
	if (data.tribes.length === 1) add('diamond.5.0');
	else if (data.tribes.length === 2) add('diamond.6.0');
	addDiamondRarity(data, add);
}

function addPegasusCard(data: MinionData, add: (key: string) => void): void {
	const dual = data.classes.length === 2;
	const mainClass = data.classes.length > 2 ? 0 : classIndex(data.classes[0]);
	add('pegasus.5.0');
	if (data.description) { add('pegasus.5.2.0'); add('pegasus.5.2.1'); }
	add('pegasus.5.3'); addStats(data, 'pegasus', add);
	add(`pegasus.6.${mainClass}`);
	if (dual) { add(`pegasus.7.0.${classIndex(data.classes[1])}`); add('pegasus.7.1'); }
	addSpecialRarity(data, 'pegasus.9', add);
}

function addSpecialRarity(data: MinionData, prefix: string, add: (key: string) => void): void {
	const gem = ['传说', '史诗', '稀有', '普通'].indexOf(data.rarity);
	if (gem < 0) return;
	add(`${prefix}.${gem}`);
}

function addDiamondRarity(data: MinionData, add: (key: string) => void): void {
	if (data.rarity === '仅龙边') { add('diamond.7.0'); return; }
	const gem = ['传说', '史诗', '稀有', '普通'].indexOf(data.rarity);
	if (gem < 0) return;
	if (data.rarity === '传说') add('diamond.7.0');
	add('diamond.7.1');
	add(`diamond.7.${gem + 2}`);
}

function addClassicWatermark(data: MinionData, style: TemplateStyle,
	add: (key: string, blend?: TemplateBlendMode, opacity?: number) => void): void {
	if (data.cardType === '酒馆战棋-随从' || (style !== 'standard' && style !== 'diamond')) return;
	const key = `watermark.${style}.${data.tribes.length ? 'typed' : 'plain'}.classic`;
	add(key, 'normal', data.finish === '金卡' ? 0.2 : 0.16);
}

function addStats(data: MinionData, style: TemplateStyle, add: (key: string) => void): void {
	if (style === 'standard') {
		const prefix = `standard.${data.finish === '金卡' ? 'golden' : 'normal'}.stats`;
		add(`${prefix}.0`);
		add(`${prefix}.1`);
		return;
	}
	const prefix: Record<Exclude<TemplateStyle, 'standard'>, string> = {
		diamond: 'diamond.12', pegasus: 'pegasus.5.4',
	};
	add(`${prefix[style]}.0`);
	add(`${prefix[style]}.1`);
}

function addBanner(data: MinionData, style: TemplateStyle, add: (key: string) => void): void {
	const action = ['预备', '锻造', '可交易'].indexOf(data.banner);
	const actionRoots: Record<TemplateStyle, string> = {
		standard: 'standard.banner.action', diamond: 'diamond.13.0.0.0',
		pegasus: 'pegasus.11.0.0.0',
	};
	if (action >= 0) { add(`${actionRoots[style]}.${action}`); return; }
	const factionIndex = ['污手党', '暗金教', '玉莲帮', '人族', '异虫', '星灵'].indexOf(data.banner);
	if (factionIndex < 0) return;
	if (style === 'standard') {
		add(`standard.banner.faction-frame.${factionIndex < 3 ? 1 : 0}`);
		add(`standard.banner.faction-icon.${factionIndex + 1}`);
	} else if (style === 'diamond') {
		add(`diamond.13.0.0.1.0.${factionIndex < 3 ? 1 : 0}`);
		add(`diamond.13.0.0.1.1.${factionIndex + 1}`);
	} else if (style === 'pegasus') {
		const index = [3, 4, 5, 0, 2, 1][factionIndex];
		add(`pegasus.10.${index}`);
	}
}

function isFactionBanner(value: string): boolean { return ['污手党', '暗金教', '玉莲帮', '人族', '异虫', '星灵'].includes(value); }
function isInterstellarBanner(value: string): boolean { return ['人族', '异虫', '星灵'].includes(value); }

function addRunes(runes: readonly RuneType[], style: TemplateStyle, add: (key: string) => void): void {
	if (!runes.length) return;
	const roots: Record<TemplateStyle, { base: string; three: string }> = {
		standard: { base: 'standard.runes.base', three: 'standard.runes.three' },
		diamond: { base: 'diamond.13.0.1.0', three: 'diamond.13.0.1.1' },
		pegasus: { base: 'pegasus.11.0.1.0', three: 'pegasus.11.0.1.1' },
	};
	const root = roots[style]; add(root.base);
	runes.slice(0, 3).forEach((rune, index) => add(`${root.three}.${2 - index}.${runeIndex(rune)}`));
}

function addCosts(data: MinionData, style: TemplateStyle, add: (key: string) => void): void {
	if (data.cardType === '酒馆战棋-随从' || data.cardType === '酒馆战棋-法术') {
		if (data.costType !== '无') add(`standard.cost.secondary.${data.costType === '时光标记' ? 1 : 2}`);
		add('standard.tier.base'); add(`standard.tier.${data.tier}`);
		return;
	}
	if (data.costType === '无') return;
	if (data.costType === '残骸') {
		add(style === 'standard'
			? 'standard.cost.primary.remains'
			: `${specialCostRoot(style)}.remains`);
		return;
	}
	if (data.costType === '护甲值') {
		add(style === 'standard'
			? 'standard.cost.primary.armor'
			: `${specialCostRoot(style)}.armor`);
		return;
	}
	if (style === 'standard') add(`standard.cost.primary.${data.costType === '生命值' ? 2 : 4}`);
	else add(`${specialCostRoot(style)}.${data.costType === '生命值' ? 0 : 2}`);
}

function specialCostRoot(style: Exclude<TemplateStyle, 'standard'>): string {
	return { diamond: 'diamond.13.3', pegasus: 'pegasus.11.3' }[style];
}

function classIndex(name = '中立'): number {
	return Math.max(0, HEARTHSTONE_CLASSES.indexOf(name as typeof HEARTHSTONE_CLASSES[number]));
}
function runeIndex(rune: RuneType): number { return { 蓝: 0, 绿: 1, 红: 2 }[rune]; }

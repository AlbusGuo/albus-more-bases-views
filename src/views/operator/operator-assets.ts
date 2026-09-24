import { OPERATOR_EMBEDDED_ASSETS } from './operator-embedded-assets';
import { resolveBundledImage } from '../../ui/bundled-image';

interface OperatorMappedAsset {
	file: string;
	aliases: readonly string[];
	glow?: string;
}

const PROFESSION_BRANCH_FILES: readonly OperatorMappedAsset[] = [
	// 先锋
	{ file: 'branch_尖兵.webp', aliases: ['尖兵'], glow: '#ff9f43' },
	{ file: 'branch_冲锋手.webp', aliases: ['冲锋手'], glow: '#ff9f43' },
	{ file: 'branch_战术家.webp', aliases: ['战术家'], glow: '#ff9f43' },
	{ file: 'branch_执旗手.webp', aliases: ['执旗手'], glow: '#ff9f43' },
	{ file: 'branch_情报官.webp', aliases: ['情报官'], glow: '#ff9f43' },
	{ file: 'branch_策士.webp', aliases: ['策士'], glow: '#ff9f43' },
	// 近卫
	{ file: 'branch_强攻手.webp', aliases: ['强攻手'], glow: '#f05a5a' },
	{ file: 'branch_斗士.webp', aliases: ['斗士'], glow: '#f05a5a' },
	{ file: 'branch_术战者.webp', aliases: ['术战者'], glow: '#f05a5a' },
	{ file: 'branch_教官.webp', aliases: ['教官'], glow: '#f05a5a' },
	{ file: 'branch_领主.webp', aliases: ['领主'], glow: '#f05a5a' },
	{ file: 'branch_剑豪.webp', aliases: ['剑豪'], glow: '#f05a5a' },
	{ file: 'branch_武者.webp', aliases: ['武者'], glow: '#f05a5a' },
	{ file: 'branch_无畏者.webp', aliases: ['无畏者'], glow: '#f05a5a' },
	{ file: 'branch_收割者.webp', aliases: ['收割者'], glow: '#f05a5a' },
	{ file: 'branch_解放者.webp', aliases: ['解放者'], glow: '#f05a5a' },
	{ file: 'branch_重剑手.webp', aliases: ['重剑手'], glow: '#f05a5a' },
	{ file: 'branch_撼地者.webp', aliases: ['撼地者'], glow: '#f05a5a' },
	{ file: 'branch_本源近卫.webp', aliases: ['本源近卫'], glow: '#f05a5a' },
	{ file: 'branch_佣兵.webp', aliases: ['佣兵'], glow: '#f05a5a' },
	// 重装
	{ file: 'branch_铁卫.webp', aliases: ['铁卫'], glow: '#4da6ff' },
	{ file: 'branch_守护者.webp', aliases: ['守护者'], glow: '#4da6ff' },
	{ file: 'branch_不屈者.webp', aliases: ['不屈者'], glow: '#4da6ff' },
	{ file: 'branch_驭法铁卫.webp', aliases: ['驭法铁卫'], glow: '#4da6ff' },
	{ file: 'branch_决战者.webp', aliases: ['决战者'], glow: '#4da6ff' },
	{ file: 'branch_要塞.webp', aliases: ['要塞'], glow: '#4da6ff' },
	{ file: 'branch_哨戒铁卫.webp', aliases: ['哨戒铁卫'], glow: '#4da6ff' },
	{ file: 'branch_本源铁卫.webp', aliases: ['本源铁卫'], glow: '#4da6ff' },
	// 狙击
	{ file: 'branch_速射手.webp', aliases: ['速射手'], glow: '#ffd54a' },
	{ file: 'branch_重射手.webp', aliases: ['重射手'], glow: '#ffd54a' },
	{ file: 'branch_炮手.webp', aliases: ['炮手'], glow: '#ffd54a' },
	{ file: 'branch_神射手.webp', aliases: ['神射手'], glow: '#ffd54a' },
	{ file: 'branch_散射手.webp', aliases: ['散射手'], glow: '#ffd54a' },
	{ file: 'branch_攻城手.webp', aliases: ['攻城手'], glow: '#ffd54a' },
	{ file: 'branch_投掷手.webp', aliases: ['投掷手'], glow: '#ffd54a' },
	{ file: 'branch_猎手.webp', aliases: ['猎手'], glow: '#ffd54a' },
	{ file: 'branch_回环射手.webp', aliases: ['回环射手'], glow: '#ffd54a' },
	{ file: 'branch_裂空炮手.webp', aliases: ['裂空炮手'], glow: '#ffd54a' },
	// 术师
	{ file: 'branch_中坚术师.webp', aliases: ['中坚术师'], glow: '#a66cff' },
	{ file: 'branch_扩散术师.webp', aliases: ['扩散术师'], glow: '#a66cff' },
	{ file: 'branch_驭械术师.webp', aliases: ['驭械术师'], glow: '#a66cff' },
	{ file: 'branch_阵法术师.webp', aliases: ['阵法术师'], glow: '#a66cff' },
	{ file: 'branch_秘术师.webp', aliases: ['秘术师'], glow: '#a66cff' },
	{ file: 'branch_链术师.webp', aliases: ['链术师'], glow: '#a66cff' },
	{ file: 'branch_轰击术师.webp', aliases: ['轰击术师'], glow: '#a66cff' },
	{ file: 'branch_本源术师.webp', aliases: ['本源术师'], glow: '#a66cff' },
	{ file: 'branch_塑灵术师.webp', aliases: ['塑灵术师'], glow: '#a66cff' },
	// 医疗
	{ file: 'branch_医师.webp', aliases: ['医师'], glow: '#56d394' },
	{ file: 'branch_群愈师.webp', aliases: ['群愈师'], glow: '#56d394' },
	{ file: 'branch_疗养师.webp', aliases: ['疗养师'], glow: '#56d394' },
	{ file: 'branch_行医.webp', aliases: ['行医'], glow: '#56d394' },
	{ file: 'branch_咒愈师.webp', aliases: ['咒愈师'], glow: '#56d394' },
	{ file: 'branch_链愈师.webp', aliases: ['链愈师'], glow: '#56d394' },
	{ file: 'branch_守望者.webp', aliases: ['守望者'], glow: '#56d394' },
	// 辅助
	{ file: 'branch_凝滞师.webp', aliases: ['凝滞师'], glow: '#43d7d7' },
	{ file: 'branch_削弱者.webp', aliases: ['削弱者'], glow: '#43d7d7' },
	{ file: 'branch_吟游者.webp', aliases: ['吟游者'], glow: '#43d7d7' },
	{ file: 'branch_护佑者.webp', aliases: ['护佑者'], glow: '#43d7d7' },
	{ file: 'branch_召唤师.webp', aliases: ['召唤师'], glow: '#43d7d7' },
	{ file: 'branch_工匠.webp', aliases: ['工匠'], glow: '#43d7d7' },
	{ file: 'branch_巫役.webp', aliases: ['巫役'], glow: '#43d7d7' },
	{ file: 'branch_游击手.webp', aliases: ['游击手'], glow: '#43d7d7' },
	// 特种
	{ file: 'branch_处决者.webp', aliases: ['处决者'], glow: '#ff5fb7' },
	{ file: 'branch_推击手.webp', aliases: ['推击手'], glow: '#ff5fb7' },
	{ file: 'branch_伏击客.webp', aliases: ['伏击客'], glow: '#ff5fb7' },
	{ file: 'branch_钩索师.webp', aliases: ['钩索师'], glow: '#ff5fb7' },
	{ file: 'branch_怪杰.webp', aliases: ['怪杰'], glow: '#ff5fb7' },
	{ file: 'branch_行商.webp', aliases: ['行商'], glow: '#ff5fb7' },
	{ file: 'branch_陷阱师.webp', aliases: ['陷阱师'], glow: '#ff5fb7' },
	{ file: 'branch_傀儡师.webp', aliases: ['傀儡师'], glow: '#ff5fb7' },
	{ file: 'branch_炼金师.webp', aliases: ['炼金师'], glow: '#ff5fb7' },
	{ file: 'branch_巡空者.webp', aliases: ['巡空者'], glow: '#ff5fb7' },
];

const PROFESSION_FILES: readonly OperatorMappedAsset[] = [
	...PROFESSION_BRANCH_FILES,
	{ file: 'class_vanguard.webp', aliases: ['先锋'], glow: '#ff9f43' },
	{ file: 'class_guard.webp', aliases: ['近卫'], glow: '#f05a5a' },
	{ file: 'class_defender.webp', aliases: ['重装'], glow: '#4da6ff' },
	{ file: 'class_sniper.webp', aliases: ['狙击'], glow: '#ffd54a' },
	{ file: 'class_caster.webp', aliases: ['术师'], glow: '#a66cff' },
	{ file: 'class_medic.webp', aliases: ['医疗'], glow: '#56d394' },
	{ file: 'class_supporter.webp', aliases: ['辅助'], glow: '#43d7d7' },
	{ file: 'class_specialist.webp', aliases: ['特种'], glow: '#ff5fb7' },
	{ file: 'class_programmer.webp', aliases: ['程序员'], glow: '#4de1ff' },
	{ file: 'class_mathematician.webp', aliases: ['数学工作者'], glow: '#b78cff' },
];

export const OPERATOR_MAIN_PROFESSION_VALUES = [
	'先锋', '近卫', '重装', '狙击', '术师', '医疗', '辅助', '特种', '程序员', '数学工作者',
] as const;

export const OPERATOR_PROFESSION_BRANCH_VALUES: Readonly<Record<string, readonly string[]>> = {
	先锋: ['尖兵', '冲锋手', '战术家', '执旗手', '情报官', '策士'],
	近卫: ['强攻手', '斗士', '术战者', '教官', '领主', '剑豪', '武者', '无畏者', '收割者', '解放者', '重剑手', '撼地者', '本源近卫', '佣兵'],
	重装: ['铁卫', '守护者', '不屈者', '驭法铁卫', '决战者', '要塞', '哨戒铁卫', '本源铁卫'],
	狙击: ['速射手', '重射手', '炮手', '神射手', '散射手', '攻城手', '投掷手', '猎手', '回环射手', '裂空炮手'],
	术师: ['中坚术师', '扩散术师', '驭械术师', '阵法术师', '秘术师', '链术师', '轰击术师', '本源术师', '塑灵术师'],
	医疗: ['医师', '群愈师', '疗养师', '行医', '咒愈师', '链愈师', '守望者'],
	辅助: ['凝滞师', '削弱者', '吟游者', '护佑者', '召唤师', '工匠', '巫役', '游击手'],
	特种: ['处决者', '推击手', '伏击客', '钩索师', '怪杰', '行商', '陷阱师', '傀儡师', '炼金师', '巡空者'],
	程序员: [],
	数学工作者: [],
};

export function getOperatorMainProfession(value: string): string {
	const normalized = normalizeMappingValue(value);
	for (const main of OPERATOR_MAIN_PROFESSION_VALUES) {
		if (normalizeMappingValue(main) === normalized) return main;
		const branch = OPERATOR_PROFESSION_BRANCH_VALUES[main]?.find(
			(candidate) => normalizeMappingValue(candidate) === normalized,
		);
		if (branch) return main;
	}
	return value;
}

const FACTION_FILES: readonly OperatorMappedAsset[] = [
	{ file: 'logo_elite.webp', aliases: ['罗德岛精英干员'] },
	{ file: 'logo_lgd.webp', aliases: ['龙门近卫局'] },
	{ file: 'logo_reserve1.webp', aliases: ['行动预备组a1'] },
	{ file: 'logo_reserve4.webp', aliases: ['行动预备组a4'] },
	{ file: 'logo_reserve6.webp', aliases: ['行动预备组a6'] },
	{ file: 'logo_action4.webp', aliases: ['行动组a4'] },
	{ file: 'logo_blacksteel.webp', aliases: ['黑钢国际'] },
	{ file: 'logo_penguin.webp', aliases: ['企鹅物流'] },
	{ file: 'logo_rhine.webp', aliases: ['莱茵生命'] },
	{ file: 'logo_abyssal.webp', aliases: ['深海猎人'] },
	{ file: 'logo_karlan.webp', aliases: ['喀兰贸易'] },
	{ file: 'logo_glasgow.webp', aliases: ['格拉斯哥帮'] },
	{ file: 'logo_pinus.webp', aliases: ['红松骑士团'] },
	{ file: 'logo_student.webp', aliases: ['乌萨斯学生自治团'] },
	{ file: 'logo_laios.webp', aliases: ['莱欧斯小队'] },
	{ file: 'logo_ave_mujica.webp', aliases: ['ave mujica'] },
	{ file: 'logo_followers.webp', aliases: ['使徒'] },
	{ file: 'logo_chiave.webp', aliases: ['贾维团伙'] },
	{ file: 'logo_lee.webp', aliases: ['鲤氏侦探事务所'] },
	{ file: 'logo_rainbow.webp', aliases: ['彩虹小队'] },
	{ file: 'logo_sweep.webp', aliases: ['sweep'] },
	{ file: 'logo_reunion.webp', aliases: ['整合运动'] },
	{ file: 'logo_babel.webp', aliases: ['巴别塔'] },
	{ file: 'logo_sui.webp', aliases: ['岁'] },
	{ file: 'logo_dublinn.webp', aliases: ['深池'] },
	{ file: 'logo_tara.webp', aliases: ['塔拉'] },
	{ file: 'logo_lungmen.webp', aliases: ['龙门'] },
	{ file: 'logo_math_analysis.webp', aliases: ['分析'] },
	{ file: 'logo_math_algebra.webp', aliases: ['代数'] },
	{ file: 'logo_math_geometry.webp', aliases: ['几何'] },
	{ file: 'logo_obsidian.webp', aliases: ['obsidian'] },
	{ file: 'logo_rhodes.webp', aliases: ['罗德岛'] },
	{ file: 'logo_egir.webp', aliases: ['阿戈尔'] },
	{ file: 'logo_bolivar.webp', aliases: ['玻利瓦尔'] },
	{ file: 'logo_columbia.webp', aliases: ['哥伦比亚'] },
	{ file: 'logo_higashi.webp', aliases: ['东'] },
	{ file: 'logo_iberia.webp', aliases: ['伊比利亚'] },
	{ file: 'logo_kazimierz.webp', aliases: ['卡西米尔'] },
	{ file: 'logo_kjerag.webp', aliases: ['谢拉格'] },
	{ file: 'logo_laterano.webp', aliases: ['拉特兰'] },
	{ file: 'logo_leithanien.webp', aliases: ['莱塔尼亚'] },
	{ file: 'logo_minos.webp', aliases: ['米诺斯'] },
	{ file: 'logo_rim.webp', aliases: ['雷姆必拓'] },
	{ file: 'logo_sami.webp', aliases: ['萨米'] },
	{ file: 'logo_sargon.webp', aliases: ['萨尔贡'] },
	{ file: 'logo_siracusa.webp', aliases: ['叙拉古'] },
	{ file: 'logo_ursus.webp', aliases: ['乌萨斯'] },
	{ file: 'logo_victoria.webp', aliases: ['维多利亚'] },
	{ file: 'logo_siesta.webp', aliases: ['汐斯塔'] },
	{ file: 'logo_yan.webp', aliases: ['炎'] },
];

export const OPERATOR_MAIN_FACTION_VALUES = [
	'罗德岛', '龙门', '阿戈尔', '玻利瓦尔', '哥伦比亚', '东', '伊比利亚',
	'卡西米尔', '谢拉格', '拉特兰', '莱塔尼亚', '米诺斯', '雷姆必拓',
	'萨米', '萨尔贡', '叙拉古', '乌萨斯', '维多利亚', '汐斯塔', '炎',
	'莱欧斯小队', 'ave mujica', '使徒', '贾维团伙', '彩虹小队',
	'整合运动', '巴别塔', '分析', '代数', '几何', 'obsidian',
] as const;

export const OPERATOR_FACTION_BRANCH_VALUES: Readonly<Record<string, readonly string[]>> = {
	罗德岛: ['罗德岛精英干员', '行动预备组a1', '行动预备组a4', '行动预备组a6', '行动组a4', 'sweep'],
	龙门: ['龙门近卫局', '企鹅物流', '鲤氏侦探事务所'],
	哥伦比亚: ['黑钢国际', '莱茵生命'],
	阿戈尔: ['深海猎人'],
	谢拉格: ['喀兰贸易'],
	维多利亚: ['格拉斯哥帮', '深池', '塔拉'],
	卡西米尔: ['红松骑士团'],
	乌萨斯: ['乌萨斯学生自治团'],
	炎: ['岁'],
};

export function getOperatorMainFaction(value: string): string {
	const normalized = normalizeMappingValue(value);
	for (const main of OPERATOR_MAIN_FACTION_VALUES) {
		if (normalizeMappingValue(main) === normalized) return main;
		const branch = OPERATOR_FACTION_BRANCH_VALUES[main]?.find(
			(candidate) => normalizeMappingValue(candidate) === normalized,
		);
		if (branch) return main;
	}
	return value;
}

const EMBEDDED_ASSET_URLS = new Map<string, string>();

const RARITY_GLOWS = [
	'', '#a8b0ba', '#73d673', '#55c9ff',
	'#b26cff', '#ffd45c', '#ff9a3d', '#ff4938',
] as const;

export interface OperatorRarityAssets {
	background: string;
	banner: string;
	glow: string;
	header: string;
	professionShadow: string;
	stars: string;
}

export class OperatorAssetService {

	destroy(): void {
		for (const source of EMBEDDED_ASSET_URLS.values()) {
			if (source.startsWith('blob:')) URL.revokeObjectURL(source);
		}
		EMBEDDED_ASSET_URLS.clear();
	}

	getDefenseSource(hiddenMode: boolean): string {
		return getEmbeddedAsset(
			'controls/' + (hiddenMode ? 'eye-off.webp' : 'eye-on.webp'),
		);
	}

	getDefenseBackSource(): string {
		return getEmbeddedAsset('controls/back.webp');
	}

	getDefenseCheckSource(): string {
		return getEmbeddedAsset('controls/check.webp');
	}

	getEliteTwoSource(active: boolean): string {
		return getEmbeddedAsset(
			'controls/' + (active ? 'elite-2-blue.webp' : 'elite-2.webp'),
		);
	}

	getPotentialSource(active: boolean): string {
		return getEmbeddedAsset(
			'controls/' + (active ? 'potential-5-blue.webp' : 'potential-5.webp'),
		);
	}

	getProfessionSource(profession: string): string | null {
		const file = findMappedEntry(PROFESSION_FILES, profession)?.file;
		return file ? getEmbeddedAsset('classes/' + file) : null;
	}

	isProfessionBranch(profession: string): boolean {
		return findMappedEntry(PROFESSION_BRANCH_FILES, profession) !== null;
	}

	getProfessionGlow(profession: string): string {
		return findMappedEntry(PROFESSION_FILES, profession)?.glow ?? '#b9c2cf';
	}

	getFactionSource(faction: string): string {
		const file = findMappedEntry(FACTION_FILES, faction)?.file ?? 'none.webp';
		return getEmbeddedAsset('factions/' + file);
	}

	getFactionGlow(faction: string): string {
		const file = findMappedEntry(FACTION_FILES, faction)?.file ?? 'none.webp';
		return createStableGlow(file);
	}

	getRarityGlow(rarity: number): string {
		const safeRarity = Math.min(7, Math.max(1, rarity));
		return RARITY_GLOWS[safeRarity] ?? RARITY_GLOWS[1];
	}

	getRarityAssets(rarity: number): OperatorRarityAssets {
		const safeRarity = Math.min(7, Math.max(1, rarity));
		const backgroundRarity = safeRarity >= 7
			? 7
			: safeRarity >= 6
				? 6
				: safeRarity >= 5
					? 5
					: safeRarity >= 4
						? 4
						: 1;
		return {
			background: getEmbeddedAsset('rarity/bg-' + backgroundRarity + '.webp'),
			banner: getEmbeddedAsset('rarity/banner-' + backgroundRarity + '.webp'),
			glow: getEmbeddedAsset('rarity/glow-' + safeRarity + '.webp'),
			header: getEmbeddedAsset('rarity/header-' + safeRarity + '.webp'),
			professionShadow: getEmbeddedAsset('rarity/profession-shadow.webp'),
			stars: getEmbeddedAsset('rarity/stars-' + safeRarity + '.webp'),
		};
	}
}

function getEmbeddedAsset(relativePath: string): string {
	const cached = EMBEDDED_ASSET_URLS.get(relativePath);
	if (cached) return cached;
	const embedded = OPERATOR_EMBEDDED_ASSETS[relativePath];
	if (!embedded) throw new Error('缺少干员拓展包资源: ' + relativePath);
	const source = createEmbeddedAssetUrl(resolveBundledImage(embedded));
	EMBEDDED_ASSET_URLS.set(relativePath, source);
	return source;
}

function createEmbeddedAssetUrl(source: string): string {
	const marker = ';base64,';
	const markerIndex = source.indexOf(marker);
	if (!source.startsWith('data:') || markerIndex < 0) return source;
	try {
		const binary = atob(source.slice(markerIndex + marker.length));
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		const mimeType = source.slice(5, markerIndex) || 'image/png';
		return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
	} catch {
		return source;
	}
}

function findMappedEntry(
	mappings: readonly OperatorMappedAsset[],
	value: string,
): OperatorMappedAsset | null {
	const normalized = normalizeMappingValue(value);
	if (!normalized) return null;
	let contained: OperatorMappedAsset | null = null;
	let containedAliasLength = -1;
	for (const mapping of mappings) {
		for (const alias of mapping.aliases) {
			const normalizedAlias = normalizeMappingValue(alias);
			if (normalized === normalizedAlias) return mapping;
			if (
				normalized.includes(normalizedAlias)
				&& normalizedAlias.length > containedAliasLength
			) {
				contained = mapping;
				containedAliasLength = normalizedAlias.length;
			}
		}
	}
	return contained;
}

function createStableGlow(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
	}
	return 'hsl(' + String((hash >>> 0) % 360) + ' 82% 64%)';
}

function normalizeMappingValue(value: string): string {
	return value.trim().toLowerCase()
		.replace(/[\u2014\u2013_]/gu, '-')
		.replace(/\s+/gu, ' ');
}

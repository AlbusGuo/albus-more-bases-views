export const CARD_MATERIAL_OPTIONS = {
	'none': '无',
	'basic': '原色卡面',
	'regular-holo': '棱镜光栅',
	'cosmos-holo': '星河闪箔',
	'amazing-rare': '幻彩晶箔',
	'radiant-holo': '交叉蚀刻',
	'trainer-gallery-holo': '虹彩光膜',
	'v-max': '极光波纹',
	'rainbow-alt': '彩虹闪砂',
	'rainbow-holo': '棱彩闪箔',
	'secret-rare': '几何金箔',
	'shiny-vmax': '银彩闪箔',
} as const;

export type CardMaterial = keyof typeof CARD_MATERIAL_OPTIONS;

export const CARD_MATERIAL_VALUES = Object.keys(
	CARD_MATERIAL_OPTIONS,
).filter((value) => value !== 'none') as CardMaterial[];

export interface CardMaterialProfile {
	rarity: string;
	subtypes: string;
	supertype: string;
	trainerGallery: boolean;
}

export const DEFAULT_CARD_MATERIAL: CardMaterial = 'regular-holo';

const BASE_PROFILE: CardMaterialProfile = {
	rarity: '',
	subtypes: 'basic',
	supertype: 'pokémon',
	trainerGallery: false,
};

const MATERIAL_PROFILES: Record<CardMaterial, Partial<CardMaterialProfile>> = {
	'none': {},
	'basic': {},
	'regular-holo': { rarity: 'rare holo' },
	'cosmos-holo': { rarity: 'rare holo cosmos' },
	'amazing-rare': { rarity: 'amazing rare' },
	'radiant-holo': { rarity: 'radiant rare' },
	'rainbow-holo': { rarity: 'rare rainbow' },
	'rainbow-alt': { rarity: 'rare rainbow alt' },
	'secret-rare': { rarity: 'rare secret' },
	'shiny-vmax': { rarity: 'rare shiny vmax', subtypes: 'vmax' },
	'trainer-gallery-holo': {
		rarity: 'trainer gallery rare holo',
		trainerGallery: true,
	},
	'v-max': { rarity: 'rare holo vmax', subtypes: 'vmax' },
};

const MATERIAL_ALIASES = new Map<string, CardMaterial>();

const FULL_CARD_MATERIALS = new Set<CardMaterial>([
	'regular-holo',
	'cosmos-holo',
	'amazing-rare',
	'radiant-holo',
	'trainer-gallery-holo',
	'v-max',
	'rainbow-alt',
	'rainbow-holo',
	'secret-rare',
]);

for (const [value, label] of Object.entries(CARD_MATERIAL_OPTIONS)) {
	MATERIAL_ALIASES.set(normalizeMaterialName(value), value as CardMaterial);
	MATERIAL_ALIASES.set(normalizeMaterialName(label), value as CardMaterial);
}

for (const [alias, value] of Object.entries<CardMaterial>({
	'rare-holo': 'regular-holo',
	'rare-holo-cosmos': 'cosmos-holo',
	'radiant-rare': 'radiant-holo',
	'rare-rainbow': 'rainbow-holo',
	'rare-rainbow-alt': 'rainbow-alt',
	'rare-secret': 'secret-rare',
	'rare-shiny': 'shiny-vmax',
	'rare-shiny-v': 'shiny-vmax',
	'rare-shiny-vmax': 'shiny-vmax',
	pikachu: 'secret-rare',
	'swsh-pikachu': 'secret-rare',
	'shiny-rare': 'shiny-vmax',
	'shiny-v': 'shiny-vmax',
	'rare-holo-vmax': 'v-max',
	vmax: 'v-max',
})) MATERIAL_ALIASES.set(alias, value);

export function readCardMaterial(
	value: string,
	fallback: CardMaterial = DEFAULT_CARD_MATERIAL,
): CardMaterial {
	return MATERIAL_ALIASES.get(normalizeMaterialName(value)) ?? fallback;
}

export function getCardMaterialProfile(material: CardMaterial): CardMaterialProfile {
	return { ...BASE_PROFILE, ...MATERIAL_PROFILES[material] };
}

export function isFullCardMaterial(material: CardMaterial): boolean {
	return FULL_CARD_MATERIALS.has(material);
}

export function getCardMaterialStrength(material: CardMaterial): number {
	return material === 'shiny-vmax' ? 0.65 : 1;
}

function normalizeMaterialName(value: string): string {
	return value.trim().toLocaleLowerCase('zh-CN').replace(/[\s_]+/gu, '-');
}

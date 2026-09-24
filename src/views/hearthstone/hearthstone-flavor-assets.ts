import frame from '../../../assets/hearthstone/958d52282634f8a9.webp';
import legendaryFrame from '../../../assets/hearthstone/2eec55a90b78aa0c.webp';
import epicFrame from '../../../assets/hearthstone/1800201ca0255af1.webp';
import rareFrame from '../../../assets/hearthstone/0a8c34e4f5982c24.webp';
import commonFrame from '../../../assets/hearthstone/b8ce6f148305fd89.webp';
import type { MinionRarity } from './hearthstone-model';

export const HEARTHSTONE_FLAVOR_FRAME = frame;

const RARITY_FRAMES: Readonly<Partial<Record<MinionRarity, string>>> = {
	普通: commonFrame,
	稀有: rareFrame,
	史诗: epicFrame,
	传说: legendaryFrame,
};

export function getHearthstoneFlavorFrame(
	rarity: MinionRarity,
): string {
	return RARITY_FRAMES[rarity] ?? HEARTHSTONE_FLAVOR_FRAME;
}

export function hasHearthstoneFlavorRarity(
	rarity: MinionRarity,
): boolean {
	return rarity in RARITY_FRAMES;
}

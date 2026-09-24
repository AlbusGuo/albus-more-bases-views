import cosmosBottom from '../../../assets/card/materials/cosmos-bottom.webp';
import cosmosMiddle from '../../../assets/card/materials/cosmos-middle-trans.webp';
import cosmosTop from '../../../assets/card/materials/cosmos-top-trans.webp';
import geometric from '../../../assets/card/materials/geometric.webp';
import glitter from '../../../assets/card/materials/glitter.webp';
import grain from '../../../assets/card/materials/grain.webp';
import illusionMask from '../../../assets/card/materials/illusion-mask.webp';
import illusion from '../../../assets/card/materials/illusion.webp';
import trainerBackground from '../../../assets/card/materials/trainerbg.webp';
import vmaxBackground from '../../../assets/card/materials/vmaxbg.jpg';
import { resolveBundledImage } from '../../ui/bundled-image';

const MATERIAL_ASSETS = {
	'--grain': grain,
	'--glitter': glitter,
	'--mbv-card-asset-cosmos-bottom': cosmosBottom,
	'--mbv-card-asset-cosmos-middle': cosmosMiddle,
	'--mbv-card-asset-cosmos-top': cosmosTop,
	'--mbv-card-asset-geometric': geometric,
	'--mbv-card-asset-illusion-mask': illusionMask,
	'--mbv-card-asset-illusion': illusion,
	'--mbv-card-asset-trainer-background': trainerBackground,
	'--mbv-card-asset-vmax-background': vmaxBackground,
} as const;

export function applyCardMaterialAssets(
	cardEl: HTMLElement,
	packId: 'card' | 'hearthstone',
): void {
	for (const [property, source] of Object.entries(MATERIAL_ASSETS)) {
		const selectedSource = packId === 'card'
			? source
			: source.replace('mbvpack://card/', `mbvpack://${packId}/`);
		cardEl.style.setProperty(
			property,
			`url(${JSON.stringify(resolveBundledImage(selectedSource))})`,
		);
	}
}

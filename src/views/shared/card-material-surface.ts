import { CARD_MATERIAL_OPTIONS, CARD_MATERIAL_VALUES, DEFAULT_CARD_MATERIAL, getCardMaterialProfile, getCardMaterialStrength, isFullCardMaterial, readCardMaterial, type CardMaterial } from './card-materials';
import type { BasesAllOptions, BasesViewConfig } from 'obsidian';

export type CardMaterialSelection = CardMaterial | 'random';
export function createCardMaterialOption(): BasesAllOptions {
	const { none, ...materials } = CARD_MATERIAL_OPTIONS;
	return { type: 'dropdown', key: 'material', displayName: '材质', default: DEFAULT_CARD_MATERIAL,
		options: { none, random: '随机', ...materials } };
}
export function readCardMaterialSelection(config: BasesViewConfig): CardMaterialSelection {
	const current = config.get('material'), legacy = config.get('defaultMaterial');
	const value = typeof current === 'string' && current ? current : typeof legacy === 'string' ? legacy : '';
	return value === 'random' ? value : readCardMaterial(value);
}
export class CardMaterialBag {
	private readonly assigned = new Map<string, CardMaterial>();
	private bag: CardMaterial[] = [];
	clear(): void { this.assigned.clear(); this.bag = []; }
	resolve(path: string, material: CardMaterialSelection): CardMaterial {
		if (material !== 'random') return material;
		const existing = this.assigned.get(path); if (existing) return existing;
		if (!this.bag.length) {
			this.bag = [...CARD_MATERIAL_VALUES];
			for (let i = this.bag.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				const first = this.bag[i], second = this.bag[j];
				if (first && second) { this.bag[i] = second; this.bag[j] = first; }
			}
		}
		const result = this.bag.pop() ?? DEFAULT_CARD_MATERIAL;
		this.assigned.set(path, result); return result;
	}
}
export function applyCardMaterial(element: HTMLElement, selection: string, path: string, full = false): void {
	const material = readCardMaterial(selection);
	if (material === 'none') {
		element.classList.remove('mbv-material-card', 'is-full-material');
		for (const key of ['material', 'rarity', 'subtypes', 'supertype', 'trainerGallery']) {
			delete element.dataset[key];
		}
		for (const property of [
			'--mbv-collectible-effect', '--mbv-collectible-tilt',
			'--mbv-collectible-glow', '--card-glow', '--seedx', '--seedy',
			'--cosmosbg',
		]) element.style.removeProperty(property);
		return;
	}
	const profile = getCardMaterialProfile(material);
	element.classList.add('mbv-material-card');
	element.classList.toggle('is-full-material', full || isFullCardMaterial(material));
	Object.assign(element.dataset, { material, rarity: profile.rarity, subtypes: profile.subtypes,
		supertype: profile.supertype, trainerGallery: String(profile.trainerGallery) });
	let first = 2166136261, second = 2246822519;
	for (let i = 0; i < path.length; i++) {
		first = Math.imul(first ^ path.charCodeAt(i), 16777619);
		second = Math.imul(second ^ path.charCodeAt(i), 3266489917);
	}
	const x = (first >>> 0) / 0xffffffff, y = (second >>> 0) / 0xffffffff;
	const glow = `hsl(${Math.floor(x * 360)} 82% 70%)`;
	for (const [key, value] of Object.entries({ '--mbv-collectible-effect': String(getCardMaterialStrength(material)),
		'--mbv-collectible-tilt': '20', '--mbv-collectible-glow': glow, '--card-glow': glow,
		'--seedx': String(x), '--seedy': String(y), '--cosmosbg': `${Math.floor(x * 734)}px ${Math.floor(y * 1280)}px` })) element.style.setProperty(key, value);
}

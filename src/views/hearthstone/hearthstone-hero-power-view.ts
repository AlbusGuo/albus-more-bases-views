import { artworkTransform } from '../shared/artwork-position';
import type { HearthstoneAsset } from './hearthstone-assets-v813';
import { HEARTHSTONE_CARD_HEIGHT, HEARTHSTONE_CARD_WIDTH } from './hearthstone-layout';
import type { MinionData } from './hearthstone-model';
import type { HearthstoneAssets } from './hearthstone-template';
import { HearthstoneHeroPowerTextRenderer } from './hearthstone-hero-power-text';
import { resolveBundledImage } from '../../ui/bundled-image';
import { createHearthstoneHitPath } from './hearthstone-hit-surface';

const HERO_POWER_HIT_PATHS = new Map<string, Promise<string>>();

export class HearthstoneHeroPowerView {
	readonly element: HTMLElement;
	readonly artworkSurface: HTMLElement;
	private readonly artworkWindowEl: HTMLElement;
	private readonly artworkLayoutEl: HTMLElement;
	private readonly artworkEl: HTMLImageElement;
	private readonly layerEls: Record<'shadow' | 'frame' | 'accent' | 'title' | 'cost', HTMLImageElement>;
	private readonly text: HearthstoneHeroPowerTextRenderer;
	private data: MinionData | null = null;
	private artworkSource = '';
	private hitPathKey = '';
	private hitPathVersion = 0;
	private hitPathLoading: Promise<void> = Promise.resolve();

	constructor(
		parent: HTMLElement,
		private readonly onHitPath?: (path: string | null) => void,
	) {
		this.element = parent.createDiv('mbv-hs-hero-power');
		const plane = this.element.createDiv('mbv-hs-hero-power-plane');
		this.artworkWindowEl = plane.createDiv('mbv-hs-hero-power-artwork-window');
		this.artworkLayoutEl = this.artworkWindowEl.createDiv('mbv-hs-hero-power-artwork-layout');
		this.artworkEl = this.artworkLayoutEl.createEl('img', {
			cls: 'mbv-hs-hero-power-artwork', attr: { alt: '', decoding: 'async' },
		});
		this.artworkSurface = this.artworkWindowEl.createDiv('mbv-hs-hero-power-artwork-hit-area');
		this.layerEls = {
			shadow: plane.createEl('img', { cls: 'mbv-hs-hero-power-layer is-shadow', attr: { alt: '', decoding: 'async' } }),
			frame: plane.createEl('img', { cls: 'mbv-hs-hero-power-layer is-frame', attr: { alt: '', decoding: 'async' } }),
			accent: plane.createEl('img', { cls: 'mbv-hs-hero-power-layer is-accent', attr: { alt: '', decoding: 'async' } }),
			title: plane.createEl('img', { cls: 'mbv-hs-hero-power-layer is-title', attr: { alt: '', decoding: 'async' } }),
			cost: plane.createEl('img', { cls: 'mbv-hs-hero-power-layer is-cost', attr: { alt: '', decoding: 'async' } }),
		};
		this.text = new HearthstoneHeroPowerTextRenderer(parent.ownerDocument);
		plane.append(this.text.element);
	}

	update(data: MinionData, artworkSource: string): void {
		this.data = data;
		this.artworkSource = artworkSource;
		this.element.dataset.mode = data.cardType.startsWith('酒馆战棋-') ? 'battleground' : 'traditional';
		this.text.update(data);
		this.setPosition(data.skill.artworkPosition);
	}

	setPosition(position: MinionData['skill']['artworkPosition']): void {
		const transform = artworkTransform(position);
		this.artworkLayoutEl.setCssProps({
			'--mbv-hs-power-art-left': `${transform.left}%`,
			'--mbv-hs-power-art-top': `${transform.top}%`,
			'--mbv-hs-power-art-size': `${position.scale * 100}%`,
		});
	}

	ensureSources(assets: HearthstoneAssets): void {
		if (!this.data) return;
		const pack = assets.HEARTHSTONE_ASSETS;
		const battleground = this.data.cardType.startsWith('酒馆战棋-');
		const layerAssets = {
			shadow: pack[battleground ? 'trinket.art-shadow' : 'power.art-shadow'],
			frame: pack[battleground ? 'trinket.frame.friend' : 'power.frame'],
			accent: battleground ? pack['trinket.art-frame'] : undefined,
			title: battleground ? pack['trinket.title'] : undefined,
			cost: pack[battleground ? 'trinket.cost.coin' : 'power.cost.mana'],
		};
		for (const name of Object.keys(layerAssets) as Array<keyof typeof layerAssets>) {
			this.setLayer(this.layerEls[name], layerAssets[name]);
		}
		const mask = pack[battleground ? 'mask.trinket-art' : 'mask.power-art'];
		if (mask) setAssetGeometry(this.artworkWindowEl, mask);
		if (this.artworkSource && this.artworkEl.getAttribute('src') !== this.artworkSource) {
			this.artworkEl.hidden = false;
			this.artworkEl.src = this.artworkSource;
		} else if (!this.artworkSource) {
			this.artworkEl.removeAttribute('src');
			this.artworkEl.hidden = true;
		} else this.artworkEl.hidden = false;
		this.text.resume();
		this.updateHitPath(
			battleground ? 'battleground' : 'traditional',
			[...Object.values(layerAssets), mask].filter(
				(asset): asset is HearthstoneAsset => Boolean(asset),
			),
		);
	}

	releaseSources(): void {
		this.hitPathVersion += 1;
		this.hitPathKey = '';
		this.artworkEl.removeAttribute('src'); this.artworkEl.hidden = true;
		for (const image of Object.values(this.layerEls)) { image.removeAttribute('src'); image.hidden = true; }
		this.text.suspend();
	}

	prepareHtmlExport(): void { this.text.prepareHtmlExport(); }
	async readyHitPath(): Promise<void> { await this.hitPathLoading; }

	private updateHitPath(key: string, assets: readonly HearthstoneAsset[]): void {
		if (!this.onHitPath || this.hitPathKey === key) return;
		this.hitPathKey = key;
		const version = ++this.hitPathVersion;
		this.onHitPath(null);
		this.hitPathLoading = getHeroPowerHitPath(
			this.element.ownerDocument,
			key,
			assets,
		).then((path) => {
			if (version !== this.hitPathVersion || this.hitPathKey !== key) return;
			this.onHitPath?.(path || null);
		});
	}

	private setLayer(element: HTMLImageElement, asset: HearthstoneAsset | undefined): void {
		if (!asset) {
			element.removeAttribute('src'); element.hidden = true;
			for (const property of ['--mbv-hs-x', '--mbv-hs-y', '--mbv-hs-width', '--mbv-hs-height']) {
				element.style.removeProperty(property);
			}
			return;
		}
		element.hidden = false;
		const source = resolveBundledImage(asset[0]);
		if (element.getAttribute('src') !== source) element.src = source;
		setAssetGeometry(element, asset);
	}
}

function getHeroPowerHitPath(
	document: Document,
	key: string,
	assets: readonly HearthstoneAsset[],
): Promise<string> {
	const cached = HERO_POWER_HIT_PATHS.get(key);
	if (cached) return cached;
	const loading = renderHeroPowerHitPath(document, assets).catch(() => '');
	HERO_POWER_HIT_PATHS.set(key, loading);
	return loading;
}

async function renderHeroPowerHitPath(
	document: Document,
	assets: readonly HearthstoneAsset[],
): Promise<string> {
	const images = assets.map((asset) => {
		const image = document.createElement('img');
		image.alt = '';
		image.decoding = 'async';
		image.src = resolveBundledImage(asset[0]);
		return { asset, image };
	});
	await Promise.all(images.map(async ({ image }) => {
		try { await image.decode(); } catch { /* Missing layers are ignored. */ }
	}));
	const canvas = document.createElement('canvas');
	canvas.width = HEARTHSTONE_CARD_WIDTH;
	canvas.height = HEARTHSTONE_CARD_HEIGHT;
	const context = canvas.getContext('2d');
	if (!context) return '';
	for (const { asset, image } of images) {
		if (!image.naturalWidth) continue;
		context.drawImage(image, asset[1], asset[2], asset[3], asset[4]);
	}
	const alpha = context.getImageData(
		0,
		0,
		HEARTHSTONE_CARD_WIDTH,
		HEARTHSTONE_CARD_HEIGHT,
	).data;
	const path = createHearthstoneHitPath(alpha);
	for (const { image } of images) image.removeAttribute('src');
	canvas.width = canvas.height = 1;
	return path;
}

function setAssetGeometry(element: HTMLElement, asset: HearthstoneAsset): void {
	element.setCssProps({
		'--mbv-hs-x': `${asset[1] / HEARTHSTONE_CARD_WIDTH * 100}%`,
		'--mbv-hs-y': `${asset[2] / HEARTHSTONE_CARD_HEIGHT * 100}%`,
		'--mbv-hs-width': `${asset[3] / HEARTHSTONE_CARD_WIDTH * 100}%`,
		'--mbv-hs-height': `${asset[4] / HEARTHSTONE_CARD_HEIGHT * 100}%`,
	});
}

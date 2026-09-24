import type { HearthstoneAsset } from './hearthstone-assets-v813';
import type { ArtworkPosition, MinionData } from './hearthstone-model';
import { artworkTransform } from '../shared/artwork-position';
import type { ImageResourceCache } from '../../services/image-resource';
import type { FrameWorkQueue } from '../../ui/frame-work-queue';
import { HEARTHSTONE_CARD_HEIGHT, HEARTHSTONE_CARD_WIDTH } from './hearthstone-layout';
import { createMinionTemplate, type HearthstoneAssets, type TemplateLayer } from './hearthstone-template';
import { MinionTextRenderer } from './hearthstone-text';
import { resolveBundledImage } from '../../ui/bundled-image';
import { createHearthstoneHitPath } from './hearthstone-hit-surface';

export interface MinionArtwork { source: string; position: ArtworkPosition }
interface HearthstoneSurfaceMask {
	image: string;
	geometry: BackGeometry | null;
	hitPath: string;
}
interface BackGeometry {
	top: string;
	left: string;
	width: string;
	height: string;
}
export class HearthstoneSurfaceMaskCache {
	private readonly values = new Map<string, HearthstoneSurfaceMask>();
	private readonly images = new Map<string, HTMLImageElement>();
	private characterCount = 0;
	get(signature: string): HearthstoneSurfaceMask | undefined {
		const cached = this.values.get(signature);
		if (!cached) return undefined;
		this.values.delete(signature);
		this.values.set(signature, cached);
		return cached;
	}
	set(signature: string, mask: HearthstoneSurfaceMask): void {
		const previous = this.values.get(signature);
		if (previous) this.characterCount -= previous.image.length + previous.hitPath.length;
		this.values.delete(signature);
		this.values.set(signature, mask);
		this.characterCount += mask.image.length + mask.hitPath.length;
		while (this.values.size > 96 || this.characterCount > 4 * 1024 * 1024) {
			const oldest = this.values.keys().next().value;
			if (!oldest) break;
			const value = this.values.get(oldest);
			this.characterCount -= (value?.image.length ?? 0) + (value?.hitPath.length ?? 0);
			this.values.delete(oldest);
		}
	}
	getImage(document: Document, source: string): HTMLImageElement {
		let image = this.images.get(source);
		if (!image) {
			image = document.createElement('img'); image.alt = ''; image.decoding = 'async'; image.src = source;
			this.images.set(source, image);
		}
		return image;
	}
	clear(): void {
		this.values.clear(); this.characterCount = 0;
		for (const image of this.images.values()) image.removeAttribute('src');
		this.images.clear();
	}
}
export class MinionScene {
	readonly element: HTMLElement;
	private readonly background: ArtworkWindow;
	private readonly foreground: ArtworkWindow;
	private readonly underlay: AssetLayers;
	private readonly overlay: AssetLayers;
	private readonly text: MinionTextRenderer;
	private readonly materialLayer: HTMLElement | null;
	private readonly maskOwner: HTMLElement;
	private readonly surfaceEffectsEnabled: boolean;
	private active = false;
	private version = 0;
	private maskSignature = '';
	private cancelMask: (() => void) | null = null;
	private last: { data: MinionData; artwork: MinionArtwork; assets: HearthstoneAssets } | null = null;
	constructor(document: Document, cache: ImageResourceCache, private readonly queue: FrameWorkQueue,
		maskOwner?: HTMLElement, private readonly surfaceMasks = new HearthstoneSurfaceMaskCache(),
		private readonly onHitPath?: (path: string | null) => void) {
		this.element = document.createElement('div'); this.element.className = 'mbv-hs-scene';
		this.maskOwner = maskOwner ?? this.element;
		this.surfaceEffectsEnabled = Boolean(maskOwner);
		const layerImages = this.surfaceEffectsEnabled ? surfaceMasks : null;
		this.background = new ArtworkWindow(this.element, cache, false); this.underlay = new AssetLayers(this.element, layerImages);
		this.foreground = new ArtworkWindow(this.element, cache, true); this.overlay = new AssetLayers(this.element, layerImages);
		this.text = new MinionTextRenderer(document); this.element.append(this.text.element);
		this.materialLayer = this.surfaceEffectsEnabled ? document.createElement('div') : null;
		if (this.materialLayer) {
			this.materialLayer.className = 'mbv-hs-material-layers'; this.element.append(this.materialLayer);
			for (const name of ['shine', 'glare']) {
				const layer = document.createElement('div'); layer.className = `mbv-hs-material-${name} mbv-material-${name}`; this.materialLayer.append(layer);
			}
		}
	}
	setWidth(pixels: number): void { this.text.setWidth(pixels); }
	setPointerStyle(values: Readonly<Record<string, string>>): void {
		if (!this.materialLayer) return;
		for (const [name, value] of Object.entries(values)) {
			if (name.endsWith('-rotate-x') || name.endsWith('-rotate-y')) continue;
			this.materialLayer.style.setProperty(name, value);
		}
	}
	resume(): void { this.active = true; this.text.resume(); if (this.last) this.update(this.last.data, this.last.artwork, this.last.assets); }
	suspend(): void {
		if (!this.active) return;
		this.active = false; this.version++; this.cancelMask?.(); this.cancelMask = null; this.maskSignature = '';
		this.text.suspend(); this.background.clear(); this.foreground.clear(); this.underlay.suspend(); this.overlay.suspend();
		this.maskOwner.style.removeProperty('--mbv-hs-surface-mask');
		for (const property of [
			'--mbv-hs-back-image-top',
			'--mbv-hs-back-image-left',
			'--mbv-hs-back-image-width',
			'--mbv-hs-back-image-height',
		]) this.maskOwner.style.removeProperty(property);
		this.maskOwner.classList.remove('has-hs-surface-mask');
		this.element.classList.remove('has-surface-mask');
		this.onHitPath?.(null);
	}
	update(data: MinionData, artwork: MinionArtwork, assets: HearthstoneAssets): void {
		this.last = { data, artwork, assets }; if (!this.active) return;
		const template = createMinionTemplate(data, assets); this.element.dataset.finish = data.finish;
		this.underlay.update(template.underlay); this.overlay.update(template.overlay);
		this.background.update(template.diamond ? '' : artwork.source, template.diamond ? template.backgroundMask : template.artMask,
			template.diamond ? parseEmptyPosition() : artwork.position, false);
		this.foreground.element.hidden = !template.diamond;
		if (template.diamond) this.foreground.update(artwork.source, template.artMask, artwork.position, true); else this.foreground.clear();
		this.text.update(data);
		this.element.dataset.descriptionOverflow = this.text.element.dataset.descriptionOverflow; this.element.dataset.titleOverflow = this.text.element.dataset.titleOverflow;
		const signature = JSON.stringify([template.underlay.map(l => [l.key, l.clip]), template.overlay.map(l => [l.key, l.clip]), template.diamond,
			template.diamond ? [artwork.source, artwork.position] : null]);
		if (this.surfaceEffectsEnabled && signature !== this.maskSignature) {
			this.maskSignature = signature; const version = ++this.version; this.cancelMask?.();
			this.onHitPath?.(null);
			void this.readyImages().then(() => {
				if (!this.active || version !== this.version) return;
				this.cancelMask = this.queue.add(() => { if (this.active && version === this.version) this.paintMask(signature); });
			});
		}
	}
	updatePosition(artwork: MinionArtwork): void {
		if (!this.last) return; this.last.artwork = artwork;
		const diamond = this.last.data.finish === '钻石卡';
		this.background.setPosition(diamond ? parseEmptyPosition() : artwork.position);
		if (diamond) this.foreground.setPosition(artwork.position);
	}
	invalidateText(): void { this.text.invalidate(); }
	async prepareHtmlExport(): Promise<void> {
		await this.readyImages(); this.cancelMask?.(); this.paintMask(this.maskSignature); this.text.prepareHtmlExport();
	}
	private async readyImages(): Promise<void> { await Promise.all([this.background.ready(), this.foreground.ready(), this.underlay.ready(), this.overlay.ready()]); }
	private paintMask(signature: string): void {
		const cached = this.surfaceMasks.get(signature);
		if (cached) { this.applySurfaceMask(cached); return; }
		const canvas = this.element.ownerDocument.createElement('canvas'); canvas.width = HEARTHSTONE_CARD_WIDTH; canvas.height = HEARTHSTONE_CARD_HEIGHT;
		const ctx = canvas.getContext('2d'); if (!ctx) return;
		this.background.paintSurface(ctx); this.underlay.paint(ctx); this.foreground.paintSurface(ctx); this.overlay.paint(ctx);
		ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, HEARTHSTONE_CARD_WIDTH, HEARTHSTONE_CARD_HEIGHT);
		const alpha = ctx.getImageData(
			0,
			0,
			HEARTHSTONE_CARD_WIDTH,
			HEARTHSTONE_CARD_HEIGHT,
		).data;
		const mask = {
			image: canvas.toDataURL(),
			geometry: backGeometry(alpha),
			hitPath: createHearthstoneHitPath(alpha),
		};
		this.surfaceMasks.set(signature, mask);
		this.applySurfaceMask(mask);
		canvas.width = canvas.height = 1;
	}
	private applySurfaceMask(mask: HearthstoneSurfaceMask): void {
		if (mask.geometry) this.maskOwner.setCssProps({
			'--mbv-hs-back-image-top': mask.geometry.top,
			'--mbv-hs-back-image-left': mask.geometry.left,
			'--mbv-hs-back-image-width': mask.geometry.width,
			'--mbv-hs-back-image-height': mask.geometry.height,
		});
		this.maskOwner.style.setProperty('--mbv-hs-surface-mask', `url(${JSON.stringify(mask.image)})`);
		this.maskOwner.classList.add('has-hs-surface-mask');
		this.element.classList.add('has-surface-mask');
		this.onHitPath?.(mask.hitPath);
	}
}

function backGeometry(alpha: Uint8ClampedArray): BackGeometry | null {
	const bounds = alphaBounds(alpha);
	if (!bounds) return null;
	const source = { width: 512, height: 666, left: 52, top: 39, contentWidth: 402, contentHeight: 598 };
	const scale = Math.min(bounds.width / source.contentWidth, bounds.height / source.contentHeight);
	const centerX = bounds.left + bounds.width / 2;
	const centerY = bounds.top + bounds.height / 2;
	const imageWidth = source.width * scale;
	const imageHeight = source.height * scale;
	const imageLeft = centerX - (source.left + source.contentWidth / 2) * scale;
	const imageTop = centerY - (source.top + source.contentHeight / 2) * scale;
	return {
		top: `${imageTop / HEARTHSTONE_CARD_HEIGHT * 100}%`,
		left: `${imageLeft / HEARTHSTONE_CARD_WIDTH * 100}%`,
		width: `${imageWidth / HEARTHSTONE_CARD_WIDTH * 100}%`,
		height: `${imageHeight / HEARTHSTONE_CARD_HEIGHT * 100}%`,
	};
}
function alphaBounds(pixels: Uint8ClampedArray): {
	left: number; top: number; width: number; height: number;
} | null {
	const width = HEARTHSTONE_CARD_WIDTH;
	const height = HEARTHSTONE_CARD_HEIGHT;
	const hasAlpha = (x: number, y: number): boolean => (pixels[(y * width + x) * 4 + 3] ?? 0) > 8;
	let top = 0;
	while (top < height && !rowHasAlpha(top)) top += 1;
	if (top === height) return null;
	let bottom = height - 1;
	while (bottom > top && !rowHasAlpha(bottom)) bottom -= 1;
	let left = 0;
	while (left < width && !columnHasAlpha(left, top, bottom)) left += 1;
	let right = width - 1;
	while (right > left && !columnHasAlpha(right, top, bottom)) right -= 1;
	return { left, top, width: right - left + 1, height: bottom - top + 1 };

	function rowHasAlpha(y: number): boolean {
		for (let x = 0; x < width; x += 1) if (hasAlpha(x, y)) return true;
		return false;
	}
	function columnHasAlpha(x: number, firstY: number, lastY: number): boolean {
		for (let y = firstY; y <= lastY; y += 1) if (hasAlpha(x, y)) return true;
		return false;
	}
}
function parseEmptyPosition(): ArtworkPosition { return { x: 50, y: 0, scale: 1 }; }
function geometry(element: HTMLElement, x: number, y: number, width: number, height: number,
	pw = HEARTHSTONE_CARD_WIDTH, ph = HEARTHSTONE_CARD_HEIGHT): void {
	for (const [key, value] of Object.entries({ x: x / pw * 100, y: y / ph * 100, width: width / pw * 100, height: height / ph * 100 })) element.style.setProperty('--mbv-hs-' + key, value + '%');
}
async function decoded(image: HTMLImageElement): Promise<void> { if (!image.getAttribute('src')) return; try { await image.decode(); } catch { /* Placeholder remains visible. */ } }
class ArtworkWindow {
	readonly element: HTMLElement;
	private readonly layout: HTMLElement;
	private readonly image: HTMLImageElement;
	private readonly maskImage: HTMLImageElement;
	private source = '';
	private version = 0;
	private loading: Promise<void> = Promise.resolve();
	private mask: HearthstoneAsset | null = null;
	private fullPlane = false;
	private position: ArtworkPosition = parseEmptyPosition();
	constructor(parent: HTMLElement, private readonly cache: ImageResourceCache, foreground: boolean) {
		this.element = parent.ownerDocument.createElement('div'); this.element.className = `mbv-hs-art-window${foreground ? ' is-foreground' : ''}`;
		this.layout = parent.ownerDocument.createElement('div'); this.layout.className = 'mbv-hs-art-layout';
		this.image = parent.ownerDocument.createElement('img'); this.image.className = 'mbv-hs-art-image'; this.image.alt = ''; this.image.decoding = 'async';
		this.maskImage = parent.ownerDocument.createElement('img'); this.layout.append(this.image); this.element.append(this.layout); parent.append(this.element);
	}
	update(source: string, mask: HearthstoneAsset, position: ArtworkPosition, fullPlane: boolean): void {
		this.mask = mask; this.fullPlane = fullPlane; geometry(this.element, mask[1], mask[2], mask[3], mask[4]);
		const maskSource = resolveBundledImage(mask[0]);
		if (this.maskImage.getAttribute('src') !== maskSource) this.maskImage.src = maskSource;
		this.element.style.setProperty('--mbv-hs-mask', `url(${JSON.stringify(maskSource)})`); this.setPosition(position);
		if (this.source === source) return; this.source = source; const version = ++this.version;
		this.image.removeAttribute('src'); this.element.classList.add('is-empty');
		this.loading = this.cache.get(source).then(async value => {
			if (version !== this.version) return;
			if (value) { this.image.src = value; await decoded(this.image); }
			if (version === this.version) this.element.classList.toggle('is-empty', !this.image.naturalWidth);
		});
	}
	setPosition(position: ArtworkPosition): void {
		this.position = position; const mask = this.mask; if (!mask) return;
		const transform = artworkTransform(position), w = this.fullPlane ? HEARTHSTONE_CARD_WIDTH : mask[3], h = this.fullPlane ? HEARTHSTONE_CARD_HEIGHT : mask[4];
		geometry(this.layout, (this.fullPlane ? -mask[1] : 0) + transform.left / 100 * w,
			(this.fullPlane ? -mask[2] : 0) + transform.top / 100 * h, w * position.scale, h * position.scale, mask[3], mask[4]);
	}
	async ready(): Promise<void> { await this.loading; await decoded(this.maskImage); }
	clear(): void { this.version++; this.source = ''; this.image.removeAttribute('src'); this.element.classList.add('is-empty'); }
	paintSurface(context: CanvasRenderingContext2D): void {
		if (this.element.hidden || !this.mask || !this.maskImage.naturalWidth) return;
		if (this.fullPlane && this.image.naturalWidth) {
			const canvas = this.element.ownerDocument.createElement('canvas');
			canvas.width = HEARTHSTONE_CARD_WIDTH; canvas.height = HEARTHSTONE_CARD_HEIGHT;
			const layer = canvas.getContext('2d'); if (!layer) return;
			const transform = artworkTransform(this.position), boxWidth = HEARTHSTONE_CARD_WIDTH * this.position.scale;
			const boxHeight = HEARTHSTONE_CARD_HEIGHT * this.position.scale;
			const ratio = this.image.naturalWidth / this.image.naturalHeight;
			const drawWidth = Math.min(boxWidth, boxHeight * ratio), drawHeight = Math.min(boxHeight, boxWidth / ratio);
			const left = transform.left / 100 * HEARTHSTONE_CARD_WIDTH + (boxWidth - drawWidth) / 2;
			const top = transform.top / 100 * HEARTHSTONE_CARD_HEIGHT + (boxHeight - drawHeight) / 2;
			layer.drawImage(this.image, left, top, drawWidth, drawHeight);
			layer.globalCompositeOperation = 'destination-in';
			layer.drawImage(this.maskImage, this.mask[1], this.mask[2], this.mask[3], this.mask[4]);
			context.drawImage(canvas, 0, 0); canvas.width = canvas.height = 1; return;
		}
		context.drawImage(this.maskImage, this.mask[1], this.mask[2], this.mask[3], this.mask[4]);
	}
}
interface CompositeLayerEntry { layer: TemplateLayer; source: string; image: HTMLImageElement | null }
interface CompositeLayerNode { kind: 'composite'; element: HTMLDivElement; entries: CompositeLayerEntry[] }
interface IndividualLayerNode { kind: 'individual'; layer: TemplateLayer; image: HTMLImageElement }
type AssetLayerNode = CompositeLayerNode | IndividualLayerNode;

class AssetLayers {
	private readonly element: HTMLElement;
	private nodes: AssetLayerNode[] = [];
	private signature = '';
	private loading: Promise<void> = Promise.resolve();
	constructor(parent: HTMLElement, private readonly imageCache: HearthstoneSurfaceMaskCache | null) {
		this.element = parent.ownerDocument.createElement('div');
		this.element.className = 'mbv-hs-layers'; parent.append(this.element);
	}
	update(layers: readonly TemplateLayer[]): void {
		const signature = JSON.stringify(layers.map(layer => [
			layer.key, layer.asset, layer.blendMode, layer.opacity, layer.clip,
		]));
		if (signature === this.signature) return;
		this.signature = signature;
		this.element.replaceChildren(); this.nodes = [];
		let normalRun: CompositeLayerEntry[] = [];
		const flushNormalRun = (): void => {
			if (!normalRun.length) return;
			const element = this.element.ownerDocument.createElement('div');
			element.className = 'mbv-hs-layer-composite'; configureLayerBackgrounds(element, normalRun);
			this.element.append(element); this.nodes.push({ kind: 'composite', element, entries: normalRun }); normalRun = [];
		};
		for (const layer of layers) {
			const source = resolveBundledImage(layer.asset[0]);
			if (layer.blendMode === 'normal' && layer.opacity === 1 && !layer.clip) {
				normalRun.push({ layer, source, image: this.imageCache?.getImage(this.element.ownerDocument, source) ?? null });
			}
			else {
				const image = this.createImage(source);
				flushNormalRun(); this.configureLayerImage(image, layer);
				this.element.append(image); this.nodes.push({ kind: 'individual', layer, image });
			}
		}
		flushNormalRun();
		this.loading = Promise.all(this.images().map(decoded)).then(() => undefined);
	}
	suspend(): void {
		this.signature = '';
		for (const node of this.nodes) {
			if (node.kind === 'individual') node.image.removeAttribute('src');
		}
		this.nodes = []; this.element.replaceChildren(); this.loading = Promise.resolve();
	}
	async ready(): Promise<void> { await this.loading; }
	paint(context: CanvasRenderingContext2D): void {
		for (const node of this.nodes) {
			if (node.kind === 'composite') {
				for (const entry of node.entries) drawTemplateLayer(context, entry.layer, entry.image);
			} else drawTemplateLayer(context, node.layer, node.image, false);
		}
	}
	private images(): HTMLImageElement[] {
		return this.nodes.flatMap(node => node.kind === 'composite'
			? node.entries.flatMap(entry => entry.image ? [entry.image] : []) : [node.image]);
	}
	private createImage(source: string): HTMLImageElement {
		const image = this.element.ownerDocument.createElement('img'); image.alt = ''; image.decoding = 'async'; image.draggable = false;
		image.src = source; return image;
	}
	private configureLayerImage(image: HTMLImageElement, layer: TemplateLayer): void {
		image.className = 'mbv-hs-layer';
		const overlap = dualClassOverlap(layer);
		geometry(image, layer.asset[1] - overlap, layer.asset[2], layer.asset[3] + overlap, layer.asset[4]);
		if (layer.clip) {
			const [, x, y, width, height] = layer.asset;
			const top = (layer.clip.y - y) / height * 100;
			const right = (x + width - layer.clip.x - layer.clip.width) / width * 100;
			const bottom = (y + height - layer.clip.y - layer.clip.height) / height * 100;
			const left = (layer.clip.x - x) / width * 100;
			image.style.clipPath = `inset(${top}% ${right}% ${bottom}% ${left}%)`;
		}
		image.style.setProperty('--mbv-hs-layer-opacity', String(layer.opacity));
		image.classList.toggle('is-multiply', layer.blendMode === 'multiply');
		image.classList.toggle('is-soft-light', layer.blendMode === 'soft-light');
	}
}

function configureLayerBackgrounds(element: HTMLDivElement, entries: readonly CompositeLayerEntry[]): void {
	const ordered = [...entries].reverse();
	element.style.backgroundImage = ordered.map(entry => `url(${JSON.stringify(entry.source)})`).join(',');
	element.style.backgroundPosition = ordered.map(({ layer }) => {
		const overlap = dualClassOverlap(layer), [, x, y, width, height] = layer.asset;
		return `${backgroundPosition(x - overlap, width + overlap, HEARTHSTONE_CARD_WIDTH)}% ` +
			`${backgroundPosition(y, height, HEARTHSTONE_CARD_HEIGHT)}%`;
	}).join(',');
	element.style.backgroundSize = ordered.map(({ layer }) => {
		const overlap = dualClassOverlap(layer), [, , , width, height] = layer.asset;
		return `${(width + overlap) / HEARTHSTONE_CARD_WIDTH * 100}% ${height / HEARTHSTONE_CARD_HEIGHT * 100}%`;
	}).join(',');
}

function backgroundPosition(offset: number, size: number, container: number): number {
	const remaining = container - size;
	return remaining === 0 ? 0 : offset / remaining * 100;
}

function dualClassOverlap(layer: TemplateLayer): number {
	return /^standard\.(?:normal|golden)\.dual-class\.0\./u.test(layer.key) ? 2 : 0;
}

function drawTemplateLayer(
	context: CanvasRenderingContext2D,
	layer: TemplateLayer,
	image: HTMLImageElement | null,
	includeDualClassOverlap = false,
): void {
	if (!image?.naturalWidth) return;
	const overlap = includeDualClassOverlap ? dualClassOverlap(layer) : 0;
	context.save(); context.globalAlpha = layer.opacity;
	if (layer.clip) {
		context.beginPath(); context.rect(layer.clip.x, layer.clip.y, layer.clip.width, layer.clip.height); context.clip();
	}
	context.drawImage(image, layer.asset[1] - overlap, layer.asset[2], layer.asset[3] + overlap, layer.asset[4]);
	context.restore();
}

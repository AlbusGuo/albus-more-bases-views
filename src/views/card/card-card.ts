import {
	NullValue,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type Value,
} from 'obsidian';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	resolveImageSource,
	resolveRenderedImageSource,
} from '../../ui/image-source';
import {
	getCardDetailsSignature,
	updateCardDetails,
} from './card-properties';
import { applyCardMaterial } from '../shared/card-material-surface';
import type { CardViewOptions } from './card-options';

export interface CollectibleCardContext {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: CardViewOptions;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
}

export interface CollectibleCardController {
	element: HTMLElement;
	interactionElement: HTMLElement;
	placementElement: HTMLElement;
	update: (context: CollectibleCardContext) => void;
	openMarkdown: (event: MouseEvent | KeyboardEvent) => Promise<void>;
	applyPointerStyle: (values: Readonly<Record<string, string>>) => void;
}

interface CardElements {
	sceneEl: HTMLElement;
	rotatorEl: HTMLButtonElement;
	artworkEl: HTMLElement;
	frontImageEl: HTMLImageElement;
}

interface CardState {
	context: CollectibleCardContext;
	contentSignature: string;
	frontSignature: string;
	detailsSignature: string;
}

export function createCollectibleCard(
	initialContext: CollectibleCardContext,
): CollectibleCardController {
	const state: CardState = {
		context: initialContext,
		contentSignature: '',
		frontSignature: '',
		detailsSignature: '',
	};
	const cardEl = createEl('article', { cls: 'mbv-collectible-card' });
	const elements = buildCard(cardEl);
	bindImageState(cardEl, elements);

	const update = (context: CollectibleCardContext): void => {
		state.context = context;
		updatePresentation(cardEl, state);
		updateFrontImage(cardEl, elements.frontImageEl, context, state);
		const detailsSignature = getCardDetailsSignature(context);
		if (detailsSignature !== state.detailsSignature) {
			state.detailsSignature = detailsSignature;
			updateCardDetails(cardEl, context);
		}
	};

	update(initialContext);
	return {
		element: cardEl,
		interactionElement: elements.rotatorEl,
		placementElement: elements.sceneEl,
		update,
		openMarkdown: async (event) => openCardEntry(state.context, event),
		applyPointerStyle: (values) => applyPointerStyle(elements, values),
	};
}

function buildCard(cardEl: HTMLElement): CardElements {
	const sceneEl = cardEl.createDiv('mbv-collectible-scene');
	const translaterEl = sceneEl.createDiv('mbv-collectible-translater');
	const rotatorEl = translaterEl.createEl('button', {
		cls: 'mbv-collectible-rotator',
		attr: { type: 'button' },
	});
	const frontEl = rotatorEl.createDiv('mbv-collectible-front');
	const artworkEl = frontEl.createDiv('mbv-collectible-artwork');
	const frontImageEl = artworkEl.createEl('img', {
		cls: 'mbv-collectible-front-image is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	artworkEl.createDiv('mbv-collectible-shine mbv-material-shine');
	artworkEl.createDiv('mbv-collectible-glare mbv-material-glare');
	return {
		sceneEl,
		rotatorEl,
		artworkEl,
		frontImageEl,
	};
}

function applyPointerStyle(
	elements: CardElements,
	values: Readonly<Record<string, string>>,
): void {
	for (const [name, value] of Object.entries(values)) {
		const target = name.endsWith('-rotate-x') || name.endsWith('-rotate-y')
			? elements.rotatorEl
			: elements.artworkEl;
		target.style.setProperty(name, value);
	}
}

function updatePresentation(
	cardEl: HTMLElement,
	state: CardState,
): void {
	const { context } = state;
	const signature = [context.options.material, context.options.aspectRatio, context.options.goldFrame].join('\u0000');
 if (signature === state.contentSignature) return;
 state.contentSignature = signature;
 applyCardMaterial(cardEl, context.options.material, context.entry.file.path);
 cardEl.classList.toggle('has-gold-frame', context.options.goldFrame);
 cardEl.style.setProperty('--mbv-collectible-aspect', String(context.options.aspectRatio));
}

function updateFrontImage(
	cardEl: HTMLElement,
	imageEl: HTMLImageElement,
	context: CollectibleCardContext,
	state: CardState,
): void {
	const property = context.options.frontProperty;
	const value = property ? context.entry.getValue(property) : null;
	const signature = `${property ?? ''}\u0000${value?.toString() ?? ''}`;
	if (state.frontSignature === signature) return;
	state.frontSignature = signature;
	imageEl.removeAttribute('src');
	imageEl.addClass('is-hidden');
	cardEl.removeClass('has-front');
	if (!value || isEmptyValue(value)) return;
	const source = resolveImageSource(context.app, value, context.entry.file) ??
		resolveRenderedImageSource(context.app, value, cardEl.ownerDocument);
	if (!source) return;
	imageEl.src = source;
	if (imageEl.complete && imageEl.naturalWidth) {
		markImageLoaded(cardEl, imageEl);
		updateCardGlow(cardEl, imageEl);
	}
}

function bindImageState(cardEl: HTMLElement, elements: CardElements): void {
	const imageEl = elements.frontImageEl;
	imageEl.addEventListener('load', () => {
		if (!imageEl.naturalWidth) return;
		markImageLoaded(cardEl, imageEl);
		updateCardGlow(cardEl, imageEl);
	});
	imageEl.addEventListener('error', () => {
		imageEl.addClass('is-hidden');
		cardEl.removeClass('has-front');
	});
}

function markImageLoaded(
	cardEl: HTMLElement,
	imageEl: HTMLImageElement,
): void {
	imageEl.removeClass('is-hidden');
	cardEl.addClass('has-front');
}

async function openCardEntry(
	context: CollectibleCardContext,
	event: MouseEvent | KeyboardEvent,
): Promise<void> {
	await context.navigation.open(
		context.entry.file,
		context.entry.file.path,
		context.options.markdownOpenMode,
		event,
		context.ownerEl,
	);
}

function updateCardGlow(cardEl: HTMLElement, imageEl: HTMLImageElement): void {
	try {
		const canvas = cardEl.ownerDocument.createElement('canvas');
		canvas.width = 24;
		canvas.height = 24;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) return;
		context.drawImage(imageEl, 0, 0, canvas.width, canvas.height);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		const bins = Array.from({ length: 24 }, () => ({ hue: 0, weight: 0 }));
		for (let offset = 0; offset < pixels.length; offset += 4) {
			if ((pixels[offset + 3] ?? 0) < 128) continue;
			const color = rgbToHsl(
				pixels[offset] ?? 0,
				pixels[offset + 1] ?? 0,
				pixels[offset + 2] ?? 0,
			);
			if (color.saturation < 0.12 || color.lightness < 0.1 || color.lightness > 0.92) {
				continue;
			}
			const weight = color.saturation *
				(1 - Math.abs(color.lightness - 0.55)) ** 2;
			const bin = bins[Math.floor(color.hue / 15) % bins.length];
			if (!bin) continue;
			bin.hue += color.hue * weight;
			bin.weight += weight;
		}
		const dominant = bins.reduce((best, current) =>
			current.weight > best.weight ? current : best,
		);
		if (dominant.weight <= 0) return;
		const color = `hsl(${Math.round(dominant.hue / dominant.weight)} 82% 70%)`;
		cardEl.setCssProps({
			'--mbv-collectible-glow': color,
			'--card-glow': color,
		});
	} catch {
		// 远程图片不允许读取像素时保留基于文件路径生成的稳定颜色.
	}
}

function rgbToHsl(
	redByte: number,
	greenByte: number,
	blueByte: number,
): { hue: number; saturation: number; lightness: number } {
	const red = redByte / 255;
	const green = greenByte / 255;
	const blue = blueByte / 255;
	const maximum = Math.max(red, green, blue);
	const minimum = Math.min(red, green, blue);
	const delta = maximum - minimum;
	const lightness = (maximum + minimum) / 2;
	const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
	let hue = 0;
	if (delta > 0) {
		if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
		else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
		else hue = 60 * ((red - green) / delta + 4);
	}
	return { hue: (hue + 360) % 360, saturation, lightness };
}

function isEmptyValue(value: Value): boolean {
	return value instanceof NullValue || value.toString().trim() === '';
}

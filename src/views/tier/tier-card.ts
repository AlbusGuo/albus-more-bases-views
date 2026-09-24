import {
	Keymap,
	NullValue,
	setIcon,
	TFile,
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
import type { TierInfo } from './tier-model';
import type { TierViewOptions } from './tier-options';

export interface TierCardContext {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	info: TierInfo;
	options: TierViewOptions;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
	onActivate: (() => void) | null;
	onDragStart: () => void;
	onDragEnd: () => void;
}

export interface TierCardController {
	element: HTMLElement;
	update: (context: TierCardContext) => void;
	loadMedia: () => void;
	hasPendingMedia: () => boolean;
}

interface TierCardState {
	context: TierCardContext;
	contentSignature: string;
	coverSignature: string;
	loadedCoverSignature: string;
	infoClass: string;
	infoColor: string;
	draggable: boolean;
}

interface TierCardElements {
	coverEl: HTMLElement;
	imageEl: HTMLImageElement;
	placeholderEl: HTMLElement;
	nameEl: HTMLElement;
	scoreEl: HTMLElement;
	propertiesEl: HTMLElement;
}

export function createTierCard(initialContext: TierCardContext): TierCardController {
	const state: TierCardState = {
		context: initialContext,
		contentSignature: '',
		coverSignature: '',
		loadedCoverSignature: '',
		infoClass: '',
		infoColor: '',
		draggable: false,
	};
	const cardEl = createEl('article', {
		cls: 'mbv-tier-card',
		attr: { tabindex: '0' },
	});
	const elements = buildCard(cardEl);
	bindInteractions(cardEl, state);
	bindImageState(elements);

	const update = (context: TierCardContext): void => {
		state.context = context;
		const draggable = context.options.ratingProperty !== null;
		if (state.draggable !== draggable) {
			state.draggable = draggable;
			cardEl.draggable = draggable;
		}
		if (cardEl.dataset.path !== context.entry.file.path) {
			cardEl.dataset.path = context.entry.file.path;
		}
		if (state.infoClass !== context.info.className) {
			if (state.infoClass) cardEl.removeClass(state.infoClass);
			state.infoClass = context.info.className;
			cardEl.addClass(state.infoClass);
		}
		if (state.infoColor !== context.info.color) {
			state.infoColor = context.info.color;
			cardEl.style.setProperty('--mbv-tier-color', state.infoColor);
		}
		updateContent(elements, state);
		prepareCover(elements, state);
	};
	update(initialContext);
	return {
		element: cardEl,
		update,
		loadMedia: () => loadCover(elements, state),
		hasPendingMedia: () => state.loadedCoverSignature !== state.coverSignature,
	};
}

function buildCard(cardEl: HTMLElement): TierCardElements {
	const coverEl = cardEl.createDiv('mbv-tier-cover');
	const placeholderEl = coverEl.createDiv('mbv-tier-cover-placeholder');
	setIcon(placeholderEl, 'image');
	const imageEl = coverEl.createEl('img', {
		cls: 'mbv-tier-cover-image is-loading',
		attr: { alt: '', loading: 'eager', decoding: 'async', draggable: 'false' },
	});
	const nameEl = cardEl.createDiv('mbv-tier-name');
	const ratingEl = cardEl.createDiv('mbv-tier-rating');
	const starEl = ratingEl.createSpan('mbv-tier-star');
	setIcon(starEl, 'star');
	const scoreEl = ratingEl.createSpan();
	const propertiesEl = cardEl.createDiv('mbv-tier-properties');
	return { coverEl, imageEl, placeholderEl, nameEl, scoreEl, propertiesEl };
}

function updateContent(
	elements: TierCardElements,
	state: { context: TierCardContext; contentSignature: string },
): void {
	const context = state.context;
	const title = getTitle(context);
	const values = context.visibleProperties.map((property) => getValueText(context.entry.getValue(property)));
	const signature = [title, context.info.score.toFixed(1), ...values].join('\u0000');
	if (signature === state.contentSignature) return;
	state.contentSignature = signature;
	elements.nameEl.setText(title);
	elements.scoreEl.setText(context.info.score.toFixed(1));
	elements.propertiesEl.empty();
	for (const text of values) {
		if (!text) continue;
		elements.propertiesEl.createDiv({ cls: 'mbv-tier-property', text });
	}
	elements.propertiesEl.classList.toggle('is-hidden', elements.propertiesEl.childElementCount === 0);
}

function prepareCover(
	elements: TierCardElements,
	state: TierCardState,
): void {
	const { context } = state;
	const value = context.options.coverProperty
		? context.entry.getValue(context.options.coverProperty)
		: null;
	const signature = `${context.options.coverProperty ?? ''}\u0000${getValueText(value)}`;
	if (signature === state.coverSignature) return;
	state.coverSignature = signature;
	state.loadedCoverSignature = '';
	elements.imageEl.removeAttribute('src');
	elements.imageEl.addClass('is-loading');
	elements.coverEl.removeClass('has-cover');
}

function loadCover(
	elements: TierCardElements,
	state: TierCardState,
): void {
	if (state.loadedCoverSignature === state.coverSignature) return;
	state.loadedCoverSignature = state.coverSignature;
	const { context } = state;
	if (!context.options.coverProperty) return;
	const value = context.entry.getValue(context.options.coverProperty);
	const source = value && !(value instanceof NullValue)
		? resolveImageSource(context.app, value, context.entry.file) ??
			resolveRenderedImageSource(context.app, value, elements.imageEl.ownerDocument)
		: null;
	const fallback = source ?? resolveFirstEmbed(context);
	if (fallback) elements.imageEl.src = fallback;
}

function resolveFirstEmbed(context: TierCardContext): string | null {
	const embed = context.app.metadataCache.getFileCache(context.entry.file)?.embeds?.[0];
	if (!embed?.link) return null;
	const file = context.app.metadataCache.getFirstLinkpathDest(embed.link, context.entry.file.path);
	if (!(file instanceof TFile) || !isImageExtension(file.extension)) return null;
	return context.app.vault.getResourcePath(file);
}

function bindImageState(elements: TierCardElements): void {
	elements.imageEl.addEventListener('load', () => {
		const source = elements.imageEl.currentSrc || elements.imageEl.src;
		void revealDecodedImage(elements, source);
	});
	elements.imageEl.addEventListener('error', () => {
		elements.imageEl.addClass('is-loading');
		elements.coverEl.removeClass('has-cover');
	});
}

async function revealDecodedImage(
	elements: TierCardElements,
	source: string,
): Promise<void> {
	try {
		await elements.imageEl.decode();
	} catch {
		// The load event already confirmed that the resource is available.
	}
	if (
		!elements.imageEl.naturalWidth ||
		(elements.imageEl.currentSrc || elements.imageEl.src) !== source
	) {
		return;
	}
	elements.coverEl.addClass('has-cover');
	elements.imageEl.removeClass('is-loading');
}

function bindInteractions(
	cardEl: HTMLElement,
	state: { context: TierCardContext },
): void {
	cardEl.addEventListener('click', (event) => {
		if (!state.context.onActivate || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		state.context.onActivate();
	});
	cardEl.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		if (state.context.onActivate) state.context.onActivate();
		else void openEntry(state.context, event);
	});
	cardEl.addEventListener('contextmenu', (event) => {
		event.preventDefault();
		void openEntry(state.context);
	});
	cardEl.addEventListener('dragstart', (event) => {
		if (!state.context.options.ratingProperty) {
			event.preventDefault();
			return;
		}
		event.dataTransfer?.setData('text/plain', state.context.entry.file.path);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		cardEl.addClass('is-dragging');
		state.context.onDragStart();
	});
	cardEl.addEventListener('dragend', () => {
		cardEl.removeClass('is-dragging');
		state.context.onDragEnd();
	});
}

async function openEntry(
	context: TierCardContext,
	event?: MouseEvent | KeyboardEvent,
): Promise<void> {
	const handled = await context.navigation.open(
		context.entry.file,
		context.entry.file.path,
		context.options.markdownOpenMode,
		event,
		context.ownerEl,
	);
	if (handled) return;
	await context.app.workspace.openLinkText(
		context.entry.file.path,
		context.entry.file.path,
		event && 'button' in event && event.button === 1
			? 'tab'
			: event ? Keymap.isModEvent(event) : false,
	);
}

function getTitle(context: TierCardContext): string {
	const value = context.options.titleProperty
		? getValueText(context.entry.getValue(context.options.titleProperty))
		: '';
	return value || context.entry.file.basename;
}

function getValueText(value: Value | null): string {
	if (!value || value instanceof NullValue) return '';
	const text = value.toString().trim();
	return text.toLowerCase() === 'null' ? '' : text;
}

function isImageExtension(extension: string): boolean {
	return /^(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(extension);
}

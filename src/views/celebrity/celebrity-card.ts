import {
	Keymap,
	NullValue,
	setIcon,
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
import type { CelebrityViewOptions } from './celebrity-options';
import {
	getCelebrityDetailsSignature,
	updateCelebrityDetails,
} from './celebrity-properties';

export interface CelebrityCardContext {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: CelebrityViewOptions;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
}

export interface CelebrityCardController {
	element: HTMLElement;
	update: (context: CelebrityCardContext) => void;
}

interface CelebrityCardElements {
	linkEl: HTMLAnchorElement;
	imageEl: HTMLImageElement;
	placeholderEl: HTMLElement;
}

export function createCelebrityCard(
	initialContext: CelebrityCardContext,
): CelebrityCardController {
	const state = {
		context: initialContext,
		photoSignature: '',
		detailsSignature: '',
	};
	const cardEl = createEl('article', { cls: 'mbv-celebrity-card' });
	const elements = buildPortrait(cardEl, state);
	bindImageState(elements);

	const update = (context: CelebrityCardContext): void => {
		state.context = context;
		elements.linkEl.dataset.href = context.entry.file.path;
		elements.linkEl.setAttribute('href', context.entry.file.path);
		updatePhoto(elements, state);
		const detailsSignature = getCelebrityDetailsSignature(context);
		if (detailsSignature !== state.detailsSignature) {
			state.detailsSignature = detailsSignature;
			updateCelebrityDetails(cardEl, context);
		}
	};
	update(initialContext);
	return { element: cardEl, update };
}

function buildPortrait(
	cardEl: HTMLElement,
	state: { context: CelebrityCardContext },
): CelebrityCardElements {
	const linkEl = cardEl.createEl('a', { cls: 'mbv-celebrity-frame' });
	bindEntryOpen(linkEl, state);
	linkEl.createDiv('mbv-celebrity-frame-rail is-top');
	linkEl.createDiv('mbv-celebrity-frame-rail is-right');
	linkEl.createDiv('mbv-celebrity-frame-rail is-bottom');
	linkEl.createDiv('mbv-celebrity-frame-rail is-left');
	linkEl.createSpan('mbv-celebrity-frame-seam is-top-left');
	linkEl.createSpan('mbv-celebrity-frame-seam is-top-right');
	linkEl.createSpan('mbv-celebrity-frame-seam is-bottom-left');
	linkEl.createSpan('mbv-celebrity-frame-seam is-bottom-right');
	const recessEl = linkEl.createDiv('mbv-celebrity-frame-recess');
	const bevelEl = recessEl.createDiv('mbv-celebrity-frame-bevel');
	const matEl = bevelEl.createDiv('mbv-celebrity-mat');
	const portraitEl = matEl.createDiv('mbv-celebrity-portrait');
	const placeholderEl = portraitEl.createDiv('mbv-celebrity-placeholder');
	setIcon(placeholderEl, 'user-round');
	const imageEl = portraitEl.createEl('img', {
		cls: 'mbv-celebrity-image is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	portraitEl.createDiv('mbv-celebrity-glass');
	return { linkEl, imageEl, placeholderEl };
}

function updatePhoto(
	elements: CelebrityCardElements,
	state: { context: CelebrityCardContext; photoSignature: string },
): void {
	const { context } = state;
	const value = context.options.photoProperty
		? context.entry.getValue(context.options.photoProperty)
		: null;
	const signature = `${context.options.photoProperty ?? ''}\u0000${value?.toString() ?? ''}`;
	if (signature === state.photoSignature) return;
	state.photoSignature = signature;
	elements.imageEl.removeAttribute('src');
	elements.imageEl.addClass('is-hidden');
	elements.placeholderEl.removeClass('is-hidden');
	if (!value || isEmptyValue(value)) return;
	const source = resolveImageSource(context.app, value, context.entry.file) ??
		resolveRenderedImageSource(context.app, value, elements.linkEl.ownerDocument);
	if (!source) return;
	elements.imageEl.src = source;
	if (elements.imageEl.complete && elements.imageEl.naturalWidth) {
		showImage(elements);
	}
}

function bindImageState(elements: CelebrityCardElements): void {
	elements.imageEl.addEventListener('load', () => {
		if (elements.imageEl.naturalWidth) showImage(elements);
	});
	elements.imageEl.addEventListener('error', () => {
		elements.imageEl.addClass('is-hidden');
		elements.placeholderEl.removeClass('is-hidden');
	});
}

function showImage(elements: CelebrityCardElements): void {
	elements.imageEl.removeClass('is-hidden');
	elements.placeholderEl.addClass('is-hidden');
}

function bindEntryOpen(
	linkEl: HTMLAnchorElement,
	state: { context: CelebrityCardContext },
): void {
	const open = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		void openEntry(state.context, event);
	};
	linkEl.addEventListener('click', (event) => {
		if (event.button === 0) open(event);
	});
	linkEl.addEventListener('auxclick', (event) => {
		if (event.button === 1) open(event);
	});
}

async function openEntry(
	context: CelebrityCardContext,
	event: MouseEvent,
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
		event.button === 1 ? 'tab' : Keymap.isModEvent(event),
	);
}

function isEmptyValue(value: Value): boolean {
	return value instanceof NullValue || value.toString().trim() === '';
}

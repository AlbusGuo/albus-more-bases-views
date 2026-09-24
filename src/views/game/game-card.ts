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
import type { GameViewOptions } from './game-options';
import { renderGameCaseLogo } from './game-logo';
import {
	getGameDetailsSignature,
	updateGameDetails,
} from './game-properties';
import {
	bindGameRatingSlider,
	updateGameRating,
	type GameRatingElements,
} from './game-rating';

export interface GameCardContext {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: GameViewOptions;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
}

export interface GameCardController {
	element: HTMLElement;
	update: (context: GameCardContext) => void;
}

interface GameCardElements extends GameRatingElements {
	shellEl: HTMLAnchorElement;
	caseImageEl: HTMLImageElement;
	discImageEl: HTMLImageElement;
	placeholderEl: HTMLElement;
	titleEl: HTMLElement;
	metaEl: HTMLElement;
	yearEl: HTMLElement;
	genreEl: HTMLElement;
}

export function createGameCard(
	initialContext: GameCardContext,
): GameCardController {
	const state = {
		context: initialContext,
		contentSignature: '',
		posterSignature: '',
		detailsSignature: '',
		rating: 0,
	};
	const cardEl = createEl('article', { cls: 'mbv-game-card' });
	const elements = buildGameShell(cardEl, state);
	bindImageState(elements);
	bindGameRatingSlider(elements, state);

	const update = (context: GameCardContext): void => {
		state.context = context;
		elements.shellEl.dataset.href = context.entry.file.path;
		elements.shellEl.setAttribute('href', context.entry.file.path);
		updateContent(elements, state);
		updatePoster(elements, state);
		const signature = getGameDetailsSignature(context);
		if (signature !== state.detailsSignature) {
			state.detailsSignature = signature;
			updateGameDetails(cardEl, context);
		}
	};
	update(initialContext);
	return { element: cardEl, update };
}

function buildGameShell(
	cardEl: HTMLElement,
	state: { context: GameCardContext },
): GameCardElements {
	const shellEl = cardEl.createEl('a', {
		cls: 'mbv-game-shell',
		attr: { href: '', role: 'link' },
	});
	bindEntryOpen(shellEl, state);

	const discEl = shellEl.createDiv('mbv-game-disc');
	const discSpinnerEl = discEl.createDiv('mbv-game-disc-spinner');
	const discImageEl = discSpinnerEl.createEl('img', {
		cls: 'mbv-game-disc-image is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	discSpinnerEl.createDiv('mbv-game-disc-overlay');
	discSpinnerEl.createDiv('mbv-game-disc-hole');

	const caseEl = shellEl.createDiv('mbv-game-case');
	const caseImageEl = caseEl.createEl('img', {
		cls: 'mbv-game-case-image is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	const placeholderEl = caseEl.createDiv('mbv-game-placeholder');
	setIcon(placeholderEl, 'gamepad-2');
	const headerEl = caseEl.createDiv('mbv-game-case-header');
	renderGameCaseLogo(headerEl);
	caseEl.createDiv('mbv-game-case-glare');

	const terminalWrapperEl = shellEl.createDiv('mbv-game-terminal-wrapper');
	const terminalEl = terminalWrapperEl.createDiv('mbv-game-terminal');
	const titleEl = terminalEl.createDiv('mbv-game-terminal-title');
	const metaEl = terminalEl.createDiv('mbv-game-terminal-meta');
	const yearEl = metaEl.createSpan('mbv-game-terminal-year');
	const genreEl = metaEl.createSpan('mbv-game-terminal-genre');
	const areaEl = terminalEl.createDiv('mbv-game-terminal-rating');
	const scoreEl = areaEl.createDiv('mbv-game-terminal-score');
	const starEl = scoreEl.createSpan('mbv-game-terminal-star');
	setIcon(starEl, 'star');
	const valueEl = scoreEl.createSpan();
	const trackEl = areaEl.createDiv({
		cls: 'mbv-game-rating-track',
		attr: {
			role: 'slider',
			tabindex: '0',
			'aria-label': '游戏评分',
			'aria-valuemin': '0',
			'aria-valuemax': '10',
			'aria-valuenow': '0',
		},
	});
	const fillEl = trackEl.createDiv('mbv-game-rating-fill');
	const thumbEl = trackEl.createDiv('mbv-game-rating-thumb');

	return {
		shellEl, caseImageEl, discImageEl, placeholderEl, titleEl, metaEl,
		yearEl, genreEl, areaEl, valueEl, trackEl, fillEl, thumbEl,
	};
}

function updateContent(
	elements: GameCardElements,
	state: { context: GameCardContext; contentSignature: string; rating: number },
): void {
	const { context } = state;
	const title = getPropertyText(context, context.options.titleProperty) ||
		context.entry.file.basename;
	const release = getPropertyText(context, context.options.releaseDateProperty);
	const year = release.match(/\d{4}/)?.[0] ?? release.split('-')[0] ?? '';
	const genre = getPropertyText(context, context.options.genreProperty);
	const rating = getPropertyText(context, context.options.ratingProperty);
	const signature = [title, year, genre, rating, context.options.ratingProperty ?? '']
		.join('\u0000');
	if (signature === state.contentSignature) return;
	state.contentSignature = signature;
	elements.titleEl.setText(title);
	elements.yearEl.setText(year ? `[ ${year} ]` : '');
	elements.yearEl.classList.toggle('is-hidden', !year);
	elements.genreEl.setText(splitGenre(genre));
	elements.genreEl.classList.toggle('is-hidden', !genre);
	elements.metaEl.classList.toggle('is-hidden', !year && !genre);
	updateGameRating(elements, state, rating);
}

function updatePoster(
	elements: GameCardElements,
	state: { context: GameCardContext; posterSignature: string },
): void {
	const { context } = state;
	const value = context.options.posterProperty
		? context.entry.getValue(context.options.posterProperty)
		: null;
	const signature = `${context.options.posterProperty ?? ''}\u0000${value?.toString() ?? ''}`;
	if (signature === state.posterSignature) return;
	state.posterSignature = signature;
	for (const image of [elements.caseImageEl, elements.discImageEl]) {
		image.removeAttribute('src');
		image.addClass('is-hidden');
	}
	elements.placeholderEl.removeClass('is-hidden');
	if (!value || isEmptyValue(value)) return;
	const source = resolveImageSource(context.app, value, context.entry.file) ??
		resolveRenderedImageSource(context.app, value, elements.shellEl.ownerDocument);
	if (!source) return;
	elements.caseImageEl.src = source;
	elements.discImageEl.src = source;
	for (const image of [elements.caseImageEl, elements.discImageEl]) {
		if (image.complete && image.naturalWidth) image.removeClass('is-hidden');
	}
	if (elements.caseImageEl.complete && elements.caseImageEl.naturalWidth) {
		elements.placeholderEl.addClass('is-hidden');
	}
}

function bindImageState(elements: GameCardElements): void {
	elements.caseImageEl.addEventListener('load', () => {
		if (!elements.caseImageEl.naturalWidth) return;
		elements.caseImageEl.removeClass('is-hidden');
		elements.placeholderEl.addClass('is-hidden');
	});
	elements.caseImageEl.addEventListener('error', () => {
		elements.caseImageEl.addClass('is-hidden');
		elements.placeholderEl.removeClass('is-hidden');
	});
	elements.discImageEl.addEventListener('load', () => {
		if (elements.discImageEl.naturalWidth) elements.discImageEl.removeClass('is-hidden');
	});
	elements.discImageEl.addEventListener('error', () => {
		elements.discImageEl.addClass('is-hidden');
	});
}

function bindEntryOpen(
	shellEl: HTMLAnchorElement,
	state: { context: GameCardContext },
): void {
	const open = (event: MouseEvent | KeyboardEvent): void => {
		event.preventDefault();
		void openGameEntry(state.context, event);
	};
	shellEl.addEventListener('click', (event) => {
		if (event.button === 0) open(event);
	});
	shellEl.addEventListener('auxclick', (event) => {
		if (event.button === 1) open(event);
	});
	shellEl.addEventListener('keydown', (event) => {
		if (event.target === shellEl && (event.key === 'Enter' || event.key === ' ')) {
			open(event);
		}
	});
}

async function openGameEntry(
	context: GameCardContext,
	event: MouseEvent | KeyboardEvent,
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
		'button' in event && event.button === 1 ? 'tab' : Keymap.isModEvent(event),
	);
}

function getPropertyText(
	context: GameCardContext,
	property: BasesPropertyId | null,
): string {
	if (!property) return '';
	const value = context.entry.getValue(property);
	if (!value || value instanceof NullValue) return '';
	const text = value.toString().trim();
	return text.toLowerCase() === 'null' ? '' : text;
}

function splitGenre(value: string): string {
	return value.split(/[,\uFF0C\u3001\s]+/u).map((item) => item.trim()).filter(Boolean).join(' | ');
}

function isEmptyValue(value: Value): boolean {
	return value instanceof NullValue || value.toString().trim() === '';
}

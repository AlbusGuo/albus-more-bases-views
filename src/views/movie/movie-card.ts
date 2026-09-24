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
import { resolveImageSource } from '../../ui/image-source';
import type { MediaViewOptions } from '../media/media-options';
import {
	bindMediaRatingSlider,
	updateMediaRating,
	type MediaRatingElements,
} from '../media/media-rating';
import {
	getMovieDetailsSignature,
	updateMovieDetails,
} from './movie-properties';

export interface MovieCardContext {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: MediaViewOptions;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
}

export interface MovieCardController {
	element: HTMLElement;
	update: (context: MovieCardContext) => void;
	destroy: () => void;
}

interface MovieCardElements extends MediaRatingElements {
	shellEl: HTMLElement;
	posterImageEl: HTMLImageElement;
	placeholderEl: HTMLElement;
	titleEl: HTMLElement;
	metaEl: HTMLElement;
	genresEl: HTMLElement;
	watchDateEl: HTMLElement;
	ratingButtonEl: HTMLButtonElement;
}

interface RatingEditorController {
	close: () => void;
	destroy: () => void;
}

export function createMovieCard(
	initialContext: MovieCardContext,
): MovieCardController {
	const state = {
		context: initialContext,
		contentSignature: '',
		posterSignature: '',
		detailsSignature: '',
		rating: 0,
	};
	const cardEl = createEl('article', { cls: 'mbv-movie-card' });
	const elements = buildMovieCover(cardEl, state);
	bindPosterState(elements);
	bindMediaRatingSlider(elements, state);
	const ratingEditor = bindRatingEditor(elements);

	const update = (context: MovieCardContext): void => {
		state.context = context;
		updateContent(elements, state);
		if (!context.options.ratingProperty) ratingEditor.close();
		updatePoster(elements, state);
		const signature = getMovieDetailsSignature(context);
		if (signature !== state.detailsSignature) {
			state.detailsSignature = signature;
			updateMovieDetails(cardEl, context);
		}
	};

	update(initialContext);
	return {
		element: cardEl,
		update,
		destroy: ratingEditor.destroy,
	};
}

function buildMovieCover(
	cardEl: HTMLElement,
	state: { context: MovieCardContext },
): MovieCardElements {
	const shellEl = cardEl.createDiv({
		cls: 'mbv-movie-shell',
		attr: { role: 'link', tabindex: '0' },
	});
	bindEntryOpen(shellEl, state);
	const posterImageEl = shellEl.createEl('img', {
		cls: 'mbv-movie-image is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	const placeholderEl = shellEl.createDiv('mbv-movie-placeholder');
	setIcon(placeholderEl, 'film');

	const ratingBadgeEl = shellEl.createDiv('mbv-movie-rating-badge');
	const ratingButtonEl = ratingBadgeEl.createEl('button', {
		cls: 'mbv-movie-rating-button',
		attr: { type: 'button', 'aria-expanded': 'false', 'aria-label': '修改评分' },
	});
	const badgeStarEl = ratingButtonEl.createSpan('mbv-movie-star');
	setIcon(badgeStarEl, 'star');
	const ratingBadgeValueEl = ratingButtonEl.createSpan();
	const ratingAreaEl = ratingBadgeEl.createDiv('mbv-movie-rating-editor');
	const ratingScoreEl = ratingAreaEl.createDiv('mbv-movie-rating-score');
	const editorStarEl = ratingScoreEl.createSpan('mbv-movie-star');
	setIcon(editorStarEl, 'star');
	const ratingValueEl = ratingScoreEl.createSpan();
	const sliderEl = ratingAreaEl.createDiv('mbv-media-slider');
	const sliderTrackEl = sliderEl.createDiv('mbv-media-slider-track');
	const sliderFillEl = sliderTrackEl.createDiv('mbv-media-slider-fill');
	const sliderThumbEl = sliderTrackEl.createDiv('mbv-media-slider-thumb');

	const overlayEl = shellEl.createDiv('mbv-movie-overlay');
	const titleEl = overlayEl.createDiv('mbv-movie-title');
	const detailsWrapEl = overlayEl.createDiv('mbv-movie-details-wrap');
	const detailsEl = detailsWrapEl.createDiv('mbv-movie-details');
	const metaEl = detailsEl.createDiv('mbv-movie-meta');
	const genresEl = detailsEl.createDiv('mbv-movie-genres');
	const watchDateEl = detailsEl.createDiv('mbv-movie-watch-date');

	return {
		shellEl,
		posterImageEl,
		placeholderEl,
		titleEl,
		metaEl,
		genresEl,
		watchDateEl,
		ratingBadgeEl,
		ratingButtonEl,
		ratingBadgeValueEl,
		ratingAreaEl,
		ratingValueEl,
		sliderEl,
		sliderFillEl,
		sliderThumbEl,
	};
}

function updateContent(
	elements: MovieCardElements,
	state: { context: MovieCardContext; contentSignature: string; rating: number },
): void {
	const { context } = state;
	const title = getPropertyText(context, context.options.titleProperty) ||
		context.entry.file.basename;
	const release = formatDisplayDate(
		getPropertyText(context, context.options.releaseDateProperty),
	);
	const episodes = getPropertyText(context, context.options.episodesProperty);
	const duration = getPropertyText(context, context.options.durationProperty);
	const length = episodes || duration;
	const genre = getPropertyText(context, context.options.genreProperty);
	const watchDate = formatDisplayDate(
		getPropertyText(context, context.options.watchDateProperty),
	);
	const ratingText = getPropertyText(context, context.options.ratingProperty);
	const signature = [title, release, length, genre, watchDate, ratingText,
		context.options.ratingProperty ?? ''].join('\u0000');
	if (signature === state.contentSignature) return;
	state.contentSignature = signature;
	elements.titleEl.setText(title);
	updateMetadata(elements.metaEl, release, length);
	updateGenres(elements.genresEl, genre);
	elements.watchDateEl.setText(watchDate ? `最后观看于 ${watchDate}` : '');
	elements.watchDateEl.classList.toggle('is-hidden', !watchDate);
	updateMediaRating(elements, state, ratingText);
}

function updateMetadata(metaEl: HTMLElement, release: string, length: string): void {
	metaEl.empty();
	metaEl.classList.toggle('is-hidden', !release && !length);
	if (release) metaEl.createSpan({ text: release });
	if (release && length) metaEl.createSpan({ cls: 'mbv-movie-dot', text: '•' });
	if (length) metaEl.createSpan({ text: length });
}

function updateGenres(genresEl: HTMLElement, genre: string): void {
	genresEl.empty();
	genresEl.classList.toggle('is-hidden', !genre);
	for (const text of genre.split(/[,\uFF0C\u3001\s]+/u).map((item) => item.trim()).filter(Boolean)) {
		genresEl.createSpan({ cls: 'mbv-movie-genre', text });
	}
}

function updatePoster(
	elements: MovieCardElements,
	state: { context: MovieCardContext; posterSignature: string },
): void {
	const { context } = state;
	const value = context.options.posterProperty
		? context.entry.getValue(context.options.posterProperty)
		: null;
	const signature = `${context.options.posterProperty ?? ''}\u0000${value?.toString() ?? ''}`;
	if (signature === state.posterSignature) return;
	state.posterSignature = signature;
	elements.posterImageEl.removeAttribute('src');
	elements.posterImageEl.addClass('is-hidden');
	elements.placeholderEl.removeClass('is-hidden');
	if (!value || isEmptyValue(value)) return;
	const source = resolveImageSource(context.app, value, context.entry.file) ??
		resolveRenderedPosterSource(elements, context, value);
	if (!source) return;
	elements.posterImageEl.src = source;
	if (elements.posterImageEl.complete && elements.posterImageEl.naturalWidth) {
		elements.posterImageEl.removeClass('is-hidden');
		elements.placeholderEl.addClass('is-hidden');
	}
}

function resolveRenderedPosterSource(
	elements: MovieCardElements,
	context: MovieCardContext,
	value: Value,
): string | null {
	const container = elements.shellEl.ownerDocument.createElement('div');
	value.renderTo(container, context.app.renderContext);
	const image = container.querySelector('img');
	const source = image?.currentSrc || image?.getAttribute('src') || image?.src;
	container.remove();
	return source || null;
}

function bindPosterState(elements: MovieCardElements): void {
	elements.posterImageEl.addEventListener('load', () => {
		if (!elements.posterImageEl.naturalWidth) return;
		elements.posterImageEl.removeClass('is-hidden');
		elements.placeholderEl.addClass('is-hidden');
	});
	elements.posterImageEl.addEventListener('error', () => {
		elements.posterImageEl.addClass('is-hidden');
		elements.placeholderEl.removeClass('is-hidden');
	});
}

function bindRatingEditor(elements: MovieCardElements): RatingEditorController {
	const ownerDocument = elements.ratingBadgeEl.ownerDocument;
	let listening = false;
	const close = (): void => {
		closeRatingEditor(elements);
		if (!listening) return;
		ownerDocument.removeEventListener('pointerdown', closeOnOutsidePointer);
		listening = false;
	};
	const closeOnOutsidePointer = (event: PointerEvent): void => {
		if (!event.composedPath().includes(elements.ratingBadgeEl)) {
			close();
		}
	};
	elements.ratingButtonEl.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		const open = !elements.ratingBadgeEl.hasClass('is-editing');
		if (!open) {
			close();
			return;
		}
		elements.ratingBadgeEl.addClass('is-editing');
		elements.ratingButtonEl.setAttribute('aria-expanded', 'true');
		ownerDocument.addEventListener('pointerdown', closeOnOutsidePointer);
		listening = true;
	});
	elements.ratingAreaEl.addEventListener('click', (event) => event.stopPropagation());
	elements.ratingBadgeEl.addEventListener('keydown', (event) => event.stopPropagation());
	return { close, destroy: close };
}

function closeRatingEditor(elements: MovieCardElements): void {
	elements.ratingBadgeEl.removeClass('is-editing');
	elements.ratingButtonEl.setAttribute('aria-expanded', 'false');
}

function bindEntryOpen(
	shellEl: HTMLElement,
	state: { context: MovieCardContext },
): void {
	shellEl.addEventListener('click', (event) => {
		if (event.button !== 0) return;
		void openMovieEntry(state.context, event);
	});
	shellEl.addEventListener('auxclick', (event) => {
		if (event.button !== 1) return;
		event.preventDefault();
		void openMovieEntry(state.context, event);
	});
	shellEl.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		void openMovieEntry(state.context, event);
	});
}

async function openMovieEntry(
	context: MovieCardContext,
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
	context: MovieCardContext,
	property: BasesPropertyId | null,
): string {
	if (!property) return '';
	const value = context.entry.getValue(property);
	if (!value || value instanceof NullValue) return '';
	const text = value.toString().trim();
	return text.toLowerCase() === 'null' ? '' : text;
}

function formatDisplayDate(value: string): string {
	return value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/)?.[1] ?? value;
}

function isEmptyValue(value: Value): boolean {
	return value instanceof NullValue || value.toString().trim() === '';
}

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
import type { MediaViewOptions } from './media-options';
import {
	getMediaDetailsSignature,
	updateMediaDetails,
} from './media-properties';
import {
	bindMediaRatingSlider,
	updateMediaRating,
	type MediaRatingElements,
} from './media-rating';

export interface MediaCardContext {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: MediaViewOptions;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
}

export interface MediaCardController {
	element: HTMLElement;
	update: (context: MediaCardContext) => void;
}

interface MediaCardElements extends MediaRatingElements {
	shellEl: HTMLElement;
	backdropImageEl: HTMLImageElement;
	posterImageEl: HTMLImageElement;
	placeholderEl: HTMLElement;
	titleEl: HTMLElement;
	genreEl: HTMLElement;
	metaEl: HTMLElement;
	watchDateEl: HTMLElement;
	ratingBadgeEl: HTMLElement;
	ratingBadgeValueEl: HTMLElement;
	ratingAreaEl: HTMLElement;
	ratingValueEl: HTMLElement;
	sliderEl: HTMLElement;
	sliderFillEl: HTMLElement;
	sliderThumbEl: HTMLElement;
}

export function createMediaCard(
	initialContext: MediaCardContext,
): MediaCardController {
	const state = {
		context: initialContext,
		contentSignature: '',
		posterSignature: '',
		detailsSignature: '',
		rating: 0,
	};
	const cardEl = createEl('article', { cls: 'mbv-media-card' });
	const elements = buildMediaCover(cardEl, state);
	bindPosterState(elements);
	bindMediaRatingSlider(elements, state);

	const update = (context: MediaCardContext): void => {
		state.context = context;
		elements.shellEl.dataset.href = context.entry.file.path;
		updateContent(elements, state);
		updatePoster(elements, state);
		const signature = getMediaDetailsSignature(context);
		if (signature !== state.detailsSignature) {
			state.detailsSignature = signature;
			updateMediaDetails(cardEl, context);
		}
	};

	update(initialContext);
	return { element: cardEl, update };
}

function buildMediaCover(
	cardEl: HTMLElement,
	state: { context: MediaCardContext },
): MediaCardElements {
	const shellEl = cardEl.createDiv({
		cls: 'mbv-media-shell',
		attr: { role: 'link', tabindex: '0' },
	});
	bindEntryOpen(shellEl, state);

	const backdropEl = shellEl.createDiv('mbv-media-backdrop');
	const backdropImageEl = backdropEl.createEl('img', {
		cls: 'mbv-media-backdrop-image',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	backdropEl.createDiv('mbv-media-backdrop-overlay');

	const ratingBadgeEl = shellEl.createDiv('mbv-media-rating-badge');
	const badgeStarEl = ratingBadgeEl.createSpan('mbv-media-star');
	setIcon(badgeStarEl, 'star');
	const ratingBadgeValueEl = ratingBadgeEl.createSpan();

	const infoEl = shellEl.createDiv('mbv-media-info');
	const infoWrapEl = infoEl.createDiv('mbv-media-info-wrap');
	const titleEl = infoWrapEl.createDiv('mbv-media-title');
	const genreEl = infoWrapEl.createDiv('mbv-media-genre');
	const metaEl = infoWrapEl.createDiv('mbv-media-meta');
	const watchDateEl = infoWrapEl.createDiv('mbv-media-watch-date');

	const ratingAreaEl = infoEl.createDiv('mbv-media-rating-area');
	const ratingScoreEl = ratingAreaEl.createDiv('mbv-media-rating-score');
	const scoreStarEl = ratingScoreEl.createSpan('mbv-media-star');
	setIcon(scoreStarEl, 'star');
	const ratingValueEl = ratingScoreEl.createSpan();
	const sliderEl = ratingAreaEl.createDiv('mbv-media-slider');
	const sliderTrackEl = sliderEl.createDiv('mbv-media-slider-track');
	const sliderFillEl = sliderTrackEl.createDiv('mbv-media-slider-fill');
	const sliderThumbEl = sliderTrackEl.createDiv('mbv-media-slider-thumb');
	ratingAreaEl.addEventListener('click', (event) => event.stopPropagation());

	const posterEl = shellEl.createDiv('mbv-media-poster');
	const posterImageEl = posterEl.createEl('img', {
		cls: 'mbv-media-poster-image is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	const placeholderEl = posterEl.createDiv('mbv-media-placeholder');
	setIcon(placeholderEl, 'clapperboard');

	return {
		shellEl,
		backdropImageEl,
		posterImageEl,
		placeholderEl,
		titleEl,
		genreEl,
		metaEl,
		watchDateEl,
		ratingBadgeEl,
		ratingBadgeValueEl,
		ratingAreaEl,
		ratingValueEl,
		sliderEl,
		sliderFillEl,
		sliderThumbEl,
	};
}

function updateContent(
	elements: MediaCardElements,
	state: { context: MediaCardContext; contentSignature: string; rating: number },
): void {
	const { context } = state;
	const title = getPropertyText(context, context.options.titleProperty) ||
		context.entry.file.basename;
	const release = formatDisplayDate(
		getPropertyText(context, context.options.releaseDateProperty),
	);
	const genre = getPropertyText(context, context.options.genreProperty);
	const episodes = getPropertyText(context, context.options.episodesProperty);
	const duration = getPropertyText(context, context.options.durationProperty);
	const length = episodes || duration;
	const watchDate = formatDisplayDate(
		getPropertyText(context, context.options.watchDateProperty),
	);
	const ratingText = getPropertyText(context, context.options.ratingProperty);
	const signature = [title, release, genre, length, watchDate, ratingText,
		context.options.ratingProperty ?? ''].join('\u0000');
	if (signature === state.contentSignature) return;
	state.contentSignature = signature;
	elements.titleEl.setText(title);
	elements.genreEl.setText(formatGenres(genre));
	elements.genreEl.classList.toggle('is-hidden', !genre);
	updateMetadata(elements.metaEl, release, length);
	elements.watchDateEl.setText(watchDate ? `最后观看于 ${watchDate}` : '');
	elements.watchDateEl.classList.toggle('is-hidden', !watchDate);
	updateMediaRating(elements, state, ratingText);
}

function updateMetadata(metaEl: HTMLElement, release: string, length: string): void {
	metaEl.empty();
	metaEl.classList.toggle('is-hidden', !release && !length);
	if (release) metaEl.createSpan({ cls: 'mbv-media-release', text: release });
	if (release && length) metaEl.createSpan({ cls: 'mbv-media-dot', text: '•' });
	if (length) metaEl.createSpan({ cls: 'mbv-media-length', text: length });
}

function updatePoster(
	elements: MediaCardElements,
	state: { context: MediaCardContext; posterSignature: string },
): void {
	const { context } = state;
	const value = context.options.posterProperty
		? context.entry.getValue(context.options.posterProperty)
		: null;
	const signature = `${context.options.posterProperty ?? ''}\u0000${value?.toString() ?? ''}`;
	if (signature === state.posterSignature) return;
	state.posterSignature = signature;
	elements.posterImageEl.removeAttribute('src');
	elements.backdropImageEl.removeAttribute('src');
	elements.posterImageEl.addClass('is-hidden');
	elements.placeholderEl.removeClass('is-hidden');
	if (!value || isEmptyValue(value)) return;
	const source = resolveImageSource(context.app, value, context.entry.file);
	if (!source) return;
	elements.posterImageEl.src = source;
	elements.backdropImageEl.src = source;
	if (elements.posterImageEl.complete && elements.posterImageEl.naturalWidth) {
		elements.posterImageEl.removeClass('is-hidden');
		elements.placeholderEl.addClass('is-hidden');
	}
}

function bindPosterState(elements: MediaCardElements): void {
	elements.posterImageEl.addEventListener('load', () => {
		if (!elements.posterImageEl.naturalWidth) return;
		elements.posterImageEl.removeClass('is-hidden');
		elements.placeholderEl.addClass('is-hidden');
	});
	elements.posterImageEl.addEventListener('error', () => {
		elements.posterImageEl.addClass('is-hidden');
		elements.placeholderEl.removeClass('is-hidden');
		elements.backdropImageEl.removeAttribute('src');
	});
}

function bindEntryOpen(
	shellEl: HTMLElement,
	state: { context: MediaCardContext },
): void {
	shellEl.addEventListener('click', (event) => {
		if (event.button !== 0) return;
		void openMediaEntry(state.context, event);
	});
	shellEl.addEventListener('auxclick', (event) => {
		if (event.button !== 1) return;
		event.preventDefault();
		void openMediaEntry(state.context, event);
	});
	shellEl.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		void openMediaEntry(state.context, event);
	});
}

async function openMediaEntry(
	context: MediaCardContext,
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
	context: MediaCardContext,
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

function formatGenres(value: string): string {
	return value.split(/[,\uFF0C\u3001\s]+/u).map((genre) => genre.trim()).filter(Boolean).join(' / ');
}

function isEmptyValue(value: Value): boolean {
	return value instanceof NullValue || value.toString().trim() === '';
}

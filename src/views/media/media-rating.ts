import {
	Notice,
	parsePropertyId,
} from 'obsidian';
import type { MediaCardContext } from './media-card';

export interface MediaRatingElements {
	ratingBadgeEl: HTMLElement;
	ratingBadgeValueEl: HTMLElement;
	ratingAreaEl: HTMLElement;
	ratingValueEl: HTMLElement;
	sliderEl: HTMLElement;
	sliderFillEl: HTMLElement;
	sliderThumbEl: HTMLElement;
}

export interface MediaRatingState {
	context: MediaCardContext;
	rating: number;
}

export function updateMediaRating(
	elements: MediaRatingElements,
	state: MediaRatingState,
	ratingText: string,
): void {
	const enabled = state.context.options.ratingProperty !== null;
	elements.ratingBadgeEl.classList.toggle('is-hidden', !enabled);
	elements.ratingAreaEl.classList.toggle('is-hidden', !enabled);
	if (!enabled) return;
	const parsed = Number.parseFloat(ratingText);
	const valid = Number.isFinite(parsed);
	state.rating = valid ? Math.min(10, Math.max(0, parsed)) : 0;
	const display = valid ? state.rating.toFixed(1) : 'N/A';
	elements.ratingBadgeValueEl.setText(display);
	elements.ratingValueEl.setText(display);
	updateSliderPosition(elements, state.rating);
}

export function bindMediaRatingSlider(
	elements: MediaRatingElements,
	state: MediaRatingState,
): void {
	let activePointer: number | null = null;
	let originalRating = 0;
	const updateFromPointer = (event: PointerEvent): void => {
		const rect = elements.sliderEl.getBoundingClientRect();
		if (rect.width <= 0) return;
		const offset = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
		state.rating = Math.round(offset / rect.width * 100) / 10;
		const display = state.rating.toFixed(1);
		elements.ratingValueEl.setText(display);
		elements.ratingBadgeValueEl.setText(display);
		updateSliderPosition(elements, state.rating);
	};
	elements.sliderEl.addEventListener('pointerdown', (event) => {
		event.preventDefault();
		event.stopPropagation();
		activePointer = event.pointerId;
		originalRating = state.rating;
		elements.sliderEl.setPointerCapture(event.pointerId);
		elements.sliderThumbEl.addClass('is-active');
		updateFromPointer(event);
	});
	elements.sliderEl.addEventListener('pointermove', (event) => {
		if (activePointer === event.pointerId) updateFromPointer(event);
	});
	elements.sliderEl.addEventListener('pointerup', (event) => {
		if (activePointer !== event.pointerId) return;
		activePointer = null;
		elements.sliderThumbEl.removeClass('is-active');
		void saveRating(state.context, state.rating).then((saved) => {
			if (saved) return;
			state.rating = originalRating;
			const display = originalRating.toFixed(1);
			elements.ratingValueEl.setText(display);
			elements.ratingBadgeValueEl.setText(display);
			updateSliderPosition(elements, originalRating);
		});
	});
	elements.sliderEl.addEventListener('pointercancel', (event) => {
		if (activePointer !== event.pointerId) return;
		activePointer = null;
		state.rating = originalRating;
		elements.sliderThumbEl.removeClass('is-active');
		updateSliderPosition(elements, originalRating);
	});
}

function updateSliderPosition(
	elements: MediaRatingElements,
	rating: number,
): void {
	const percentage = `${rating * 10}%`;
	elements.sliderFillEl.setCssProps({ '--mbv-media-rating-width': percentage });
	elements.sliderThumbEl.setCssProps({ '--mbv-media-rating-left': percentage });
}

async function saveRating(
	context: MediaCardContext,
	rating: number,
): Promise<boolean> {
	const property = context.options.ratingProperty;
	if (!property) return false;
	const parsed = parsePropertyId(property);
	if (parsed.type !== 'note') return false;
	try {
		await context.app.fileManager.processFrontMatter(context.entry.file, (frontmatter) => {
			const writable = frontmatter as Record<string, unknown>;
			writable[parsed.name] = rating;
		});
		return true;
	} catch {
		new Notice('更新评分失败.');
		return false;
	}
}

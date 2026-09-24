import { Notice, parsePropertyId } from 'obsidian';
import type { GameCardContext } from './game-card';

export interface GameRatingElements {
	areaEl: HTMLElement;
	valueEl: HTMLElement;
	trackEl: HTMLElement;
	fillEl: HTMLElement;
	thumbEl: HTMLElement;
}

export interface GameRatingState {
	context: GameCardContext;
	rating: number;
}

export function updateGameRating(
	elements: GameRatingElements,
	state: GameRatingState,
	text: string,
): void {
	const enabled = state.context.options.ratingProperty !== null;
	elements.areaEl.classList.toggle('is-hidden', !enabled);
	if (!enabled) return;
	const parsed = Number.parseFloat(text);
	const valid = Number.isFinite(parsed);
	state.rating = valid ? Math.min(10, Math.max(0, parsed)) : 0;
	elements.valueEl.setText(valid ? state.rating.toFixed(1) : 'N/A');
	elements.trackEl.setAttribute('aria-valuetext', valid ? state.rating.toFixed(1) : '未评分');
	updatePosition(elements, state.rating);
}

export function bindGameRatingSlider(
	elements: GameRatingElements,
	state: GameRatingState,
): void {
	let activePointer: number | null = null;
	let originalRating = 0;
	let keyboardOriginalRating = 0;
	let keyboardDirty = false;
	const updateFromPointer = (event: PointerEvent): void => {
		const rect = elements.trackEl.getBoundingClientRect();
		if (rect.width <= 0) return;
		const offset = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
		state.rating = Math.round(offset / rect.width * 100) / 10;
		elements.valueEl.setText(state.rating.toFixed(1));
		elements.trackEl.setAttribute('aria-valuetext', state.rating.toFixed(1));
		updatePosition(elements, state.rating);
	};
	elements.areaEl.addEventListener('click', (event) => event.stopPropagation());
	elements.areaEl.addEventListener('auxclick', (event) => event.stopPropagation());
	elements.trackEl.addEventListener('pointerdown', (event) => {
		event.preventDefault();
		event.stopPropagation();
		activePointer = event.pointerId;
		originalRating = state.rating;
		elements.trackEl.setPointerCapture(event.pointerId);
		elements.thumbEl.addClass('is-active');
		updateFromPointer(event);
	});
	elements.trackEl.addEventListener('pointermove', (event) => {
		if (activePointer === event.pointerId) updateFromPointer(event);
	});
	elements.trackEl.addEventListener('pointerup', (event) => {
		if (activePointer !== event.pointerId) return;
		activePointer = null;
		elements.thumbEl.removeClass('is-active');
		void saveRating(state.context, state.rating).then((saved) => {
			if (saved) return;
			state.rating = originalRating;
			elements.valueEl.setText(originalRating.toFixed(1));
			updatePosition(elements, originalRating);
		});
	});
	elements.trackEl.addEventListener('pointercancel', (event) => {
		if (activePointer !== event.pointerId) return;
		activePointer = null;
		state.rating = originalRating;
		elements.thumbEl.removeClass('is-active');
		elements.valueEl.setText(originalRating.toFixed(1));
		updatePosition(elements, originalRating);
	});
	elements.trackEl.addEventListener('keydown', (event) => {
		let nextRating: number | null = null;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
			nextRating = state.rating - 0.1;
		} else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
			nextRating = state.rating + 0.1;
		} else if (event.key === 'Home') {
			nextRating = 0;
		} else if (event.key === 'End') {
			nextRating = 10;
		}
		if (nextRating === null) return;
		event.preventDefault();
		event.stopPropagation();
		if (!keyboardDirty) keyboardOriginalRating = state.rating;
		keyboardDirty = true;
		state.rating = Math.round(Math.min(10, Math.max(0, nextRating)) * 10) / 10;
		elements.valueEl.setText(state.rating.toFixed(1));
		elements.trackEl.setAttribute('aria-valuetext', state.rating.toFixed(1));
		updatePosition(elements, state.rating);
	});
	elements.trackEl.addEventListener('keyup', (event) => {
		if (!keyboardDirty || !isRatingKey(event.key)) return;
		event.stopPropagation();
		keyboardDirty = false;
		void saveRating(state.context, state.rating).then((saved) => {
			if (saved) return;
			state.rating = keyboardOriginalRating;
			elements.valueEl.setText(keyboardOriginalRating.toFixed(1));
			elements.trackEl.setAttribute('aria-valuetext', keyboardOriginalRating.toFixed(1));
			updatePosition(elements, keyboardOriginalRating);
		});
	});
}

function updatePosition(elements: GameRatingElements, rating: number): void {
	const percentage = `${rating * 10}%`;
	elements.trackEl.setAttribute('aria-valuenow', rating.toFixed(1));
	elements.fillEl.setCssProps({ '--mbv-game-rating-width': percentage });
	elements.thumbEl.setCssProps({ '--mbv-game-rating-left': percentage });
}

function isRatingKey(key: string): boolean {
	return key === 'ArrowLeft' || key === 'ArrowDown' || key === 'ArrowRight' ||
		key === 'ArrowUp' || key === 'Home' || key === 'End';
}

async function saveRating(
	context: GameCardContext,
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

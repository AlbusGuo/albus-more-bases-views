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
import type { CourseViewOptions } from './course-options';
import {
	getCourseDetailsSignature,
	updateCourseDetails,
} from './course-properties';

export interface CourseCardContext {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: CourseViewOptions;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
}

export interface CourseCardController {
	element: HTMLElement;
	update: (context: CourseCardContext) => void;
}

interface ScorePresentation {
	text: string;
	isText: boolean;
	isGray: boolean;
	hue: number;
}

const TEXT_SCORES: Readonly<Record<string, number>> = {
	优秀: 95,
	良好: 85,
	合格: 75,
	不合格: 60,
};

export function createCourseCard(
	initialContext: CourseCardContext,
): CourseCardController {
	const state = {
		context: initialContext,
		scoreSignature: '',
		avatarSignature: '',
		detailsSignature: '',
	};
	const cardEl = createEl('article', { cls: 'mbv-course-card' });
	const bannerEl = cardEl.createEl('a', { cls: 'mbv-course-banner' });
	const scoreFillEl = bannerEl.createDiv('mbv-course-score-fill');
	const scoreWatermarkEl = bannerEl.createDiv('mbv-course-score-watermark');
	const bannerLabelEl = bannerEl.createSpan('mbv-visually-hidden');

	const avatarEl = cardEl.createEl('a', { cls: 'mbv-course-avatar' });
	const avatarPlaceholderEl = avatarEl.createDiv('mbv-course-avatar-placeholder');
	setIcon(avatarPlaceholderEl, 'user');
	const avatarLabelEl = avatarEl.createSpan('mbv-visually-hidden');
	bindEntryLink(bannerEl, state);
	bindEntryLink(avatarEl, state);

	const update = (context: CourseCardContext): void => {
		state.context = context;
		const accessibleTitle = getVisibleTitle(context) || context.entry.file.basename;
		for (const linkEl of [bannerEl, avatarEl]) {
			linkEl.dataset.href = context.entry.file.path;
			linkEl.setAttribute('href', context.entry.file.path);
		}
		bannerLabelEl.setText(`打开 "${accessibleTitle}"`);
		avatarLabelEl.setText(`打开 "${accessibleTitle}"`);
		updateScore(state, scoreFillEl, scoreWatermarkEl);
		updateAvatar(state, avatarEl, avatarPlaceholderEl);

		const detailsSignature = getCourseDetailsSignature(context);
		if (detailsSignature !== state.detailsSignature) {
			state.detailsSignature = detailsSignature;
			updateCourseDetails(cardEl, context);
		}
	};

	update(initialContext);
	return { element: cardEl, update };
}

function updateScore(
	state: { context: CourseCardContext; scoreSignature: string },
	fillEl: HTMLElement,
	watermarkEl: HTMLElement,
): void {
	const { context } = state;
	const rawScore = context.options.scoreProperty
		? context.entry.getValue(context.options.scoreProperty)?.toString().trim() ?? ''
		: '';
	const signature = `${rawScore}\u0000${context.options.maxScore}`;
	if (signature === state.scoreSignature) return;
	state.scoreSignature = signature;
	const presentation = getScorePresentation(rawScore, context.options.maxScore);
	fillEl.classList.toggle('is-hidden', presentation === null);
	watermarkEl.classList.toggle('is-hidden', presentation === null);
	if (!presentation) return;
	fillEl.classList.toggle('is-gray', presentation.isGray);
	fillEl.setCssProps({ '--mbv-course-score-hue': String(presentation.hue) });
	watermarkEl.setText(presentation.text);
	watermarkEl.dataset.isText = String(presentation.isText);
}

function getScorePresentation(
	value: string,
	maxScore: number,
): ScorePresentation | null {
	if (!value) return null;
	if (value === '无') {
		return { text: value, isText: true, isGray: true, hue: 0 };
	}
	const textScore = TEXT_SCORES[value];
	if (textScore !== undefined) {
		return {
			text: value,
			isText: true,
			isGray: false,
			hue: getScoreHue(textScore),
		};
	}
	const numericScore = Number.parseFloat(value);
	if (!Number.isFinite(numericScore)) return null;
	const percentage = maxScore > 0
		? Math.min(100, Math.max(0, numericScore / maxScore * 100))
		: numericScore > 0 ? 100 : 0;
	return {
		text: String(numericScore),
		isText: false,
		isGray: false,
		hue: getScoreHue(percentage),
	};
}

function getScoreHue(percentage: number): number {
	return percentage < 60 ? 0 : (percentage - 60) / 40 * 120;
}

function updateAvatar(
	state: { context: CourseCardContext; avatarSignature: string },
	avatarEl: HTMLElement,
	placeholderEl: HTMLElement,
): void {
	const { context } = state;
	const avatarValue = context.options.coverProperty
		? context.entry.getValue(context.options.coverProperty)
		: null;
	const signature = `${context.options.coverProperty ?? ''}\u0000${avatarValue?.toString() ?? ''}`;
	if (signature === state.avatarSignature) return;
	state.avatarSignature = signature;
	avatarEl.querySelector('.mbv-course-avatar-image')?.remove();
	avatarEl.removeClass('has-avatar');
	placeholderEl.removeClass('is-hidden');
	if (!avatarValue || isEmptyValue(avatarValue)) return;
	const source = resolveImageSource(context.app, avatarValue, context.entry.file);
	if (!source) return;
	const image = avatarEl.createEl('img', {
		cls: 'mbv-course-avatar-image is-loading',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	image.addEventListener('load', () => {
		if (!image.isConnected || !image.naturalWidth) return;
		image.removeClass('is-loading');
		avatarEl.addClass('has-avatar');
		placeholderEl.addClass('is-hidden');
	}, { once: true });
	image.addEventListener('error', () => image.remove(), { once: true });
	placeholderEl.removeClass('is-hidden');
	image.src = source;
	if (image.complete && image.naturalWidth) {
		image.removeClass('is-loading');
		avatarEl.addClass('has-avatar');
		placeholderEl.addClass('is-hidden');
	}
}

function bindEntryLink(
	linkEl: HTMLAnchorElement,
	state: { context: CourseCardContext },
): void {
	linkEl.addEventListener('click', (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		void openCourseEntry(state.context, event);
	});
	linkEl.addEventListener('auxclick', (event) => {
		if (event.button !== 1) return;
		event.preventDefault();
		event.stopPropagation();
		void openCourseEntry(state.context, event);
	});
}

async function openCourseEntry(
	context: CourseCardContext,
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

function getVisibleTitle(context: CourseCardContext): string {
	const titleProperty = context.visibleProperties[0];
	return titleProperty
		? context.entry.getValue(titleProperty)?.toString().trim() ?? ''
		: '';
}

function isEmptyValue(value: Value): boolean {
	return value instanceof NullValue || value.toString().trim() === '';
}

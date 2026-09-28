import {
	Keymap,
	NullValue,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type Value,
} from 'obsidian';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import { renderBookCover } from './book-cover';
import type { BookViewOptions } from './book-options';
import {
	getDetailsSignature,
	getVisibleTitle,
	updateBookDetails,
} from './book-properties';
import { createReadingActions } from '../shared/reading-actions';

const BOOK_READING_ACTIONS = {
	actionClass: 'mbv-book-action',
	attachmentClass: 'mbv-book-open-action',
	statusClass: 'mbv-book-status-action',
} as const;

export interface BookCardContext {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: BookViewOptions;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
}

export interface BookCardController {
	element: HTMLElement;
	update: (context: BookCardContext) => void;
}

export function createBookCard(
	initialContext: BookCardContext,
): BookCardController {
	const state = {
		context: initialContext,
		coverSignature: '',
		detailsSignature: '',
	};
	const cardEl = createEl('article', { cls: 'mbv-book-card' });
	const shellEl = cardEl.createDiv('mbv-book-shell');
	shellEl.createDiv('mbv-book-shadow');
	const boxEl = shellEl.createDiv('mbv-book-box');
	const frontEl = boxEl.createDiv('mbv-book-front');
	const coverLinkEl = frontEl.createEl('a', {
		cls: 'mbv-book-cover-link',
		attr: { href: '#' },
	});
	const coverEl = coverLinkEl.createDiv('mbv-book-cover');
	coverEl.createDiv('mbv-book-cover-placeholder');
	const coverLinkLabelEl = coverLinkEl.createSpan('mbv-visually-hidden');

	const spineEl = boxEl.createDiv('mbv-book-spine');
	const spineImageEl = spineEl.createEl('img', {
		cls: 'mbv-book-spine-image is-hidden',
		attr: { alt: '' },
	});
	spineEl.createDiv('mbv-book-spine-overlay');
	const spineTitleEl = spineEl.createSpan('mbv-book-spine-title');

	const actionsEl = boxEl.createDiv('mbv-book-actions');
	const readingActions = createReadingActions(
		actionsEl,
		initialContext,
		BOOK_READING_ACTIONS,
	);
	const actionSampleImageEl = readingActions.attachmentButton.createEl('img', {
		cls: 'mbv-book-action-sample-image is-hidden',
		attr: { alt: '', decoding: 'async' },
	});
	bindCoverLink(coverLinkEl, state);

	const update = (context: BookCardContext): void => {
		state.context = context;
		const title = getVisibleTitle(context);
		const accessibleTitle = title || context.entry.file.basename;
		coverLinkEl.dataset.href = context.entry.file.path;
		coverLinkEl.setAttribute('href', context.entry.file.path);
		coverLinkLabelEl.setText(`打开 "${accessibleTitle}"`);
		spineTitleEl.setText(title);
		updateCover(state, coverEl, spineImageEl, actionSampleImageEl);
		const detailsSignature = getDetailsSignature(context);
		if (detailsSignature !== state.detailsSignature) {
			state.detailsSignature = detailsSignature;
			updateBookDetails(cardEl, context);
		}
		readingActions.update(context);
	};

	update(initialContext);
	return { element: cardEl, update };
}

function updateCover(
	state: { context: BookCardContext; coverSignature: string },
	coverEl: HTMLElement,
	spineImageEl: HTMLImageElement,
	actionSampleImageEl: HTMLImageElement,
): void {
	const { context } = state;
	const coverValue = context.options.coverProperty
		? context.entry.getValue(context.options.coverProperty)
		: null;
	const signature = `${context.options.coverProperty ?? ''}\u0000${coverValue?.toString() ?? ''}`;
	if (signature === state.coverSignature) return;
	state.coverSignature = signature;
	coverEl.querySelectorAll('.mbv-book-cover-image, .mbv-book-cover-native-value')
		.forEach((element) => element.remove());
	coverEl.removeClass('has-cover');
	spineImageEl.removeAttribute('src');
	spineImageEl.addClass('is-hidden');
	actionSampleImageEl.removeAttribute('src');
	actionSampleImageEl.addClass('is-hidden');
	if (!coverEl.querySelector('.mbv-book-cover-placeholder')) {
		coverEl.prepend(createDiv('mbv-book-cover-placeholder'));
	}
	if (!coverValue || isEmptyValue(coverValue)) return;
	renderBookCover(
		context.app,
		coverValue,
		context.entry.file,
		coverEl,
		spineImageEl,
		actionSampleImageEl,
	);
}

function bindCoverLink(
	linkEl: HTMLAnchorElement,
	state: { context: BookCardContext },
): void {
	linkEl.addEventListener('click', (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		void openBookEntry(state.context, event);
	});
	linkEl.addEventListener('auxclick', (event) => {
		if (event.button !== 1) return;
		event.preventDefault();
		event.stopPropagation();
		void openBookEntry(state.context, event);
	});
}

async function openBookEntry(
	context: BookCardContext,
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

function isEmptyValue(value: Value | null): boolean {
	return value === null || value instanceof NullValue || value.toString().trim() === '';
}

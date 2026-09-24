import {
	Keymap,
	Notice,
	NullValue,
	setIcon,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type Value,
} from 'obsidian';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	getStatus,
	openAttachment,
	updateStatus,
} from '../../services/entry-actions';
import { renderBookCover } from './book-cover';
import type { BookViewOptions } from './book-options';
import {
	getDetailsSignature,
	getVisibleTitle,
	updateBookDetails,
} from './book-properties';

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

	const attachmentButton = createAttachmentButton(frontEl, state);
	const statusCheckbox = createStatusCheckbox(frontEl, state);
	bindCoverLink(coverLinkEl, state);

	const update = (context: BookCardContext): void => {
		state.context = context;
		const title = getVisibleTitle(context);
		const accessibleTitle = title || context.entry.file.basename;
		coverLinkEl.dataset.href = context.entry.file.path;
		coverLinkEl.setAttribute('href', context.entry.file.path);
		coverLinkLabelEl.setText(`打开 "${accessibleTitle}"`);
		spineTitleEl.setText(title);
		updateCover(state, coverEl, spineImageEl);
		const detailsSignature = getDetailsSignature(context);
		if (detailsSignature !== state.detailsSignature) {
			state.detailsSignature = detailsSignature;
			updateBookDetails(cardEl, context);
		}
		updateAttachmentButton(attachmentButton, context);
		updateStatusCheckbox(statusCheckbox, context);
	};

	update(initialContext);
	return { element: cardEl, update };
}

function createAttachmentButton(
	frontEl: HTMLElement,
	state: { context: BookCardContext },
): HTMLButtonElement {
	const button = frontEl.createEl('button', {
		cls: 'mbv-book-action mbv-book-open-action',
		attr: { type: 'button' },
	});
	setIcon(button, 'link');
	button.createSpan({ cls: 'mbv-visually-hidden', text: '打开附件或链接' });
	button.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		button.blur();
		const { app, entry, options } = state.context;
		if (!options.fileLinkProperty) return;
		void openAttachment(
			app,
			entry,
			options.fileLinkProperty,
			options.openWith,
		);
	});
	return button;
}

function createStatusCheckbox(
	frontEl: HTMLElement,
	state: { context: BookCardContext },
): HTMLInputElement {
	const wrapperEl = frontEl.createEl('label', {
		cls: 'mbv-book-action mbv-book-status-action',
	});
	const checkbox = wrapperEl.createEl('input', {
		attr: { type: 'checkbox' },
	});
	wrapperEl.createSpan({ cls: 'mbv-visually-hidden', text: '阅读状态' });
	checkbox.addEventListener('click', (event) => event.stopPropagation());
	checkbox.addEventListener('change', () => {
		const { app, entry, options } = state.context;
		if (!options.statusProperty) return;
		const nextStatus = checkbox.checked;
		checkbox.disabled = true;
		void updateStatus(app, entry, options.statusProperty, nextStatus)
			.catch(() => {
				checkbox.checked = !nextStatus;
				new Notice('更新阅读状态失败.');
			})
			.finally(() => {
				checkbox.disabled = false;
				updateStatusLabel(checkbox);
			});
	});
	return checkbox;
}

function updateAttachmentButton(
	button: HTMLButtonElement,
	context: BookCardContext,
): void {
	button.classList.toggle('is-hidden', !context.options.fileLinkProperty);
}

function updateStatusCheckbox(
	checkbox: HTMLInputElement,
	context: BookCardContext,
): void {
	const property = context.options.statusProperty;
	const wrapperEl = checkbox.parentElement;
	if (!wrapperEl) return;
	wrapperEl.classList.toggle('is-hidden', !property);
	if (!property) return;
	checkbox.checked = getStatus(context.entry.getValue(property));
	updateStatusLabel(checkbox);
}

function updateStatusLabel(checkbox: HTMLInputElement): void {
	const label = checkbox.parentElement?.querySelector<HTMLElement>(
		'.mbv-visually-hidden',
	);
	label?.setText(`阅读状态: ${checkbox.checked ? '已读' : '未读'}`);
}

function updateCover(
	state: { context: BookCardContext; coverSignature: string },
	coverEl: HTMLElement,
	spineImageEl: HTMLImageElement,
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

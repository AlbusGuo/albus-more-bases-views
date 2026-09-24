import {
	Keymap,
	Notice,
	NullValue,
	setIcon,
	type App,
	type BasesEntry,
	type BasesPropertyId,
} from 'obsidian';
import {
	getStatus,
	openAttachment,
	updateStatus,
} from '../../services/entry-actions';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import type { PaperViewOptions } from './paper-options';
import {
	getPaperDetailsSignature,
	updatePaperDetails,
} from './paper-properties';

export interface PaperCardContext {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: PaperViewOptions;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
}

export interface PaperCardController {
	element: HTMLElement;
	update: (context: PaperCardContext) => void;
}

export function createPaperCard(
	initialContext: PaperCardContext,
): PaperCardController {
	const state = {
		context: initialContext,
		detailsSignature: '',
	};
	const cardEl = createEl('article', { cls: 'mbv-paper-card' });
	const coverLinkEl = cardEl.createEl('a', {
		cls: 'mbv-paper-cover-shell',
	});
	const coverEl = coverLinkEl.createDiv('mbv-paper-cover');
	const contentEl = coverEl.createDiv('mbv-paper-cover-content');
	const coverTitleEl = contentEl.createDiv('mbv-paper-cover-title');
	const coverAuthorsEl = contentEl.createDiv('mbv-paper-cover-authors');
	const coverTagEl = coverEl.createDiv('mbv-paper-cover-tag');
	const linkLabelEl = coverLinkEl.createSpan('mbv-visually-hidden');
	const attachmentButton = createAttachmentButton(cardEl, state);
	const statusCheckbox = createStatusCheckbox(cardEl, state);
	bindCoverLink(coverLinkEl, state);

	const update = (context: PaperCardContext): void => {
		state.context = context;
		const coverTitle = getPropertyText(context, context.options.titleProperty);
		const accessibleTitle = coverTitle || context.entry.file.basename;
		coverLinkEl.dataset.href = context.entry.file.path;
		coverLinkEl.setAttribute('href', context.entry.file.path);
		linkLabelEl.setText(`打开 "${accessibleTitle}"`);
		coverTitleEl.setText(accessibleTitle);

		const authors = getPropertyText(context, context.options.authorProperty);
		coverAuthorsEl.setText(authors);
		coverAuthorsEl.classList.toggle('is-hidden', authors.length === 0);

		const pages = getPropertyText(context, context.options.pageCountProperty);
		coverTagEl.setText(pages);
		coverTagEl.classList.toggle('is-hidden', pages.length === 0);

		const detailsSignature = getPaperDetailsSignature(context);
		if (detailsSignature !== state.detailsSignature) {
			state.detailsSignature = detailsSignature;
			updatePaperDetails(cardEl, context);
		}
		updateAttachmentButton(attachmentButton, context);
		updateStatusCheckbox(statusCheckbox, context);
	};

	update(initialContext);
	return { element: cardEl, update };
}

function createAttachmentButton(
	cardEl: HTMLElement,
	state: { context: PaperCardContext },
): HTMLButtonElement {
	const button = cardEl.createEl('button', {
		cls: 'mbv-paper-action mbv-paper-open-action',
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
		).catch(() => new Notice('打开附件失败.'));
	});
	return button;
}

function createStatusCheckbox(
	cardEl: HTMLElement,
	state: { context: PaperCardContext },
): HTMLInputElement {
	const wrapperEl = cardEl.createEl('label', {
		cls: 'mbv-paper-action mbv-paper-status-action',
	});
	const checkbox = wrapperEl.createEl('input', {
		cls: 'mbv-paper-status-checkbox',
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
	context: PaperCardContext,
): void {
	button.classList.toggle('is-hidden', !context.options.fileLinkProperty);
}

function updateStatusCheckbox(
	checkbox: HTMLInputElement,
	context: PaperCardContext,
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

function bindCoverLink(
	linkEl: HTMLAnchorElement,
	state: { context: PaperCardContext },
): void {
	linkEl.addEventListener('click', (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		void openPaperEntry(state.context, event);
	});
	linkEl.addEventListener('auxclick', (event) => {
		if (event.button !== 1) return;
		event.preventDefault();
		event.stopPropagation();
		void openPaperEntry(state.context, event);
	});
}

async function openPaperEntry(
	context: PaperCardContext,
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

function getPropertyText(
	context: PaperCardContext,
	property: BasesPropertyId | null,
): string {
	if (!property) return '';
	const value = context.entry.getValue(property);
	if (!value || value instanceof NullValue) return '';
	const text = value.toString().trim();
	return text.toLowerCase() === 'null' ? '' : text;
}

import {
	Keymap,
	type App,
	type BasesEntry,
	type BasesPropertyId,
} from 'obsidian';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import type { PaperViewOptions } from './paper-options';
import {
	getPaperDetailsSignature,
	updatePaperDetails,
} from './paper-properties';
import { createReadingActions } from '../shared/reading-actions';
import { getPropertyText } from '../shared/card-value-utils';

const PAPER_READING_ACTIONS = {
	actionClass: 'mbv-paper-action',
	attachmentClass: 'mbv-paper-open-action',
	statusClass: 'mbv-paper-status-action',
} as const;

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
	const actionsEl = cardEl.createDiv('mbv-paper-actions');
	const readingActions = createReadingActions(
		actionsEl,
		initialContext,
		PAPER_READING_ACTIONS,
	);
	bindCoverLink(coverLinkEl, state);

	const update = (context: PaperCardContext): void => {
		state.context = context;
		const coverTitle = getPropertyText(context.entry, context.options.titleProperty);
		const accessibleTitle = coverTitle || context.entry.file.basename;
		coverLinkEl.dataset.href = context.entry.file.path;
		coverLinkEl.setAttribute('href', context.entry.file.path);
		linkLabelEl.setText(`打开 "${accessibleTitle}"`);
		coverTitleEl.setText(accessibleTitle);

		const authors = getPropertyText(context.entry, context.options.authorProperty);
		coverAuthorsEl.setText(authors);
		coverAuthorsEl.classList.toggle('is-hidden', authors.length === 0);

		const pages = getPropertyText(context.entry, context.options.pageCountProperty);
		coverTagEl.setText(pages);
		coverTagEl.classList.toggle('is-hidden', pages.length === 0);

		const detailsSignature = getPaperDetailsSignature(context);
		if (detailsSignature !== state.detailsSignature) {
			state.detailsSignature = detailsSignature;
			updatePaperDetails(cardEl, context);
		}
		readingActions.update(context);
	};

	update(initialContext);
	return { element: cardEl, update };
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

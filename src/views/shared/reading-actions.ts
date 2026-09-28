import {
	Menu,
	Notice,
	setIcon,
	type App,
	type BasesEntry,
	type BasesPropertyId,
} from 'obsidian';
import {
	getReadingStatus,
	hasAttachment,
	openAttachment,
	READING_STATUS_VALUES,
	updateReadingStatus,
	type AttachmentOpenMode,
	type ReadingStatus,
} from '../../services/entry-actions';

interface ReadingActionsContext {
	app: App;
	entry: BasesEntry;
	options: {
		fileLinkProperty: BasesPropertyId | null;
		statusProperty: BasesPropertyId | null;
		openWith: AttachmentOpenMode;
	};
}

interface ReadingActionsAppearance {
	actionClass: string;
	attachmentClass: string;
	statusClass: string;
}

interface ReadingActionsController<T extends ReadingActionsContext> {
	attachmentButton: HTMLButtonElement;
	update: (context: T) => void;
}

export function createReadingActions<T extends ReadingActionsContext>(
	parentEl: HTMLElement,
	initialContext: T,
	appearance: ReadingActionsAppearance,
): ReadingActionsController<T> {
	let context = initialContext;
	let currentStatus: ReadingStatus = '未读';
	let statusSaving = false;
	let attachmentOpening = false;

	const attachmentButton = parentEl.createEl('button', {
		cls: `${appearance.actionClass} ${appearance.attachmentClass}`,
		attr: { type: 'button' },
	});
	const attachmentIconEl = attachmentButton.createSpan('mbv-reading-action-icon');
	setIcon(attachmentIconEl, 'paperclip');
	attachmentButton.createSpan({
		cls: 'mbv-reading-action-label',
		text: '打开附件',
	});

	const statusButton = parentEl.createEl('button', {
		cls: `${appearance.actionClass} ${appearance.statusClass}`,
		attr: { type: 'button', 'aria-haspopup': 'menu' },
	});
	const statusLabelEl = statusButton.createSpan('mbv-reading-action-label');

	attachmentButton.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (attachmentOpening) return;
		const property = context.options.fileLinkProperty;
		if (!property || !hasAttachment(context.entry, property)) return;
		attachmentOpening = true;
		attachmentButton.disabled = true;
		void openAttachment(
			context.app,
			context.entry,
			property,
			context.options.openWith,
		).catch(() => new Notice('打开附件失败.')).finally(() => {
			attachmentOpening = false;
			attachmentButton.disabled = false;
			attachmentButton.blur();
		});
	});

	statusButton.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (statusSaving) return;
		const property = context.options.statusProperty;
		if (!property) return;
		const menu = new Menu();
		for (const status of READING_STATUS_VALUES) {
			menu.addItem((item) => item
				.setTitle(status)
				.setIcon(STATUS_MENU_ICONS[status])
				.setChecked(currentStatus === status)
				.onClick(() => { void saveReadingStatus(status, property); }));
		}
		if (event.detail === 0) {
			const rect = statusButton.getBoundingClientRect();
			menu.showAtPosition(
				{ x: rect.left, y: rect.bottom },
				statusButton.ownerDocument,
			);
		} else {
			menu.showAtMouseEvent(event);
		}
	});

	const saveReadingStatus = async (
		nextStatus: ReadingStatus,
		property: BasesPropertyId,
	): Promise<void> => {
		const previousStatus = currentStatus;
		statusSaving = true;
		statusButton.disabled = true;
		renderStatus(nextStatus);
		try {
			await updateReadingStatus(
				context.app,
				context.entry,
				property,
				nextStatus,
			);
		} catch {
			renderStatus(previousStatus);
			new Notice('更新阅读状态失败.');
		} finally {
			statusSaving = false;
			statusButton.disabled = false;
			statusButton.blur();
		}
	};

	const renderStatus = (status: ReadingStatus): void => {
		currentStatus = status;
		statusButton.dataset.state = statusState(status);
		statusButton.setAttribute(
			'aria-label',
			`阅读状态: ${status}`,
		);
		statusLabelEl.setText(status === '阅读中' ? '阅读\n中' : status);
	};

	const update = (nextContext: T): void => {
		context = nextContext;
		const attachmentAvailable = hasAttachment(
			context.entry,
			context.options.fileLinkProperty,
		);
		attachmentButton.classList.toggle('is-hidden', !attachmentAvailable);
		attachmentButton.setAttribute(
			'aria-label',
			`打开附件: ${context.entry.file.basename}`,
		);
		const statusProperty = context.options.statusProperty;
		statusButton.classList.toggle('is-hidden', !statusProperty);
		if (statusProperty && !statusSaving) {
			renderStatus(getReadingStatus(context.entry.getValue(statusProperty)));
		}
	};

	update(initialContext);
	return { attachmentButton, update };
}

const STATUS_MENU_ICONS: Record<ReadingStatus, string> = {
	已阅: 'check-circle-2',
	阅读中: 'book-open',
	未读: 'circle',
};

function statusState(status: ReadingStatus): 'read' | 'reading' | 'unread' {
	if (status === '已阅') return 'read';
	if (status === '阅读中') return 'reading';
	return 'unread';
}

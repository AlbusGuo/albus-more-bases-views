import {
	Menu,
	Notice,
	type App,
	type BasesEntry,
	type BasesPropertyId,
} from 'obsidian';
import { updateTextStatus } from '../../services/entry-actions';
import type { ProjectViewOptions } from './project-options';
import {
	getDevelopmentBadgeUrl,
	getPublicBadgeUrl,
} from './project-badges';
import {
	getProjectDevelopmentStatus,
	getProjectPublicStatus,
	PROJECT_DEVELOPMENT_STATUSES,
	PROJECT_PUBLIC_STATUSES,
	type ProjectDevelopmentStatus,
	type ProjectPublicStatus,
} from './project-status';

interface ProjectStatusContext {
	app: App;
	entry: BasesEntry;
	options: ProjectViewOptions;
}

export function createDevelopmentSelector(
	parentEl: HTMLElement,
	state: { context: ProjectStatusContext },
): HTMLButtonElement {
	const button = createStatusButton(
		parentEl,
		'mbv-project-development-toggle',
		'mbv-project-development-badge',
	);
	bindProjectStatusMenu(button, state, {
		statuses: PROJECT_DEVELOPMENT_STATUSES,
		icons: {
			阶段完成: 'circle-check',
			开发中: 'code-2',
		},
		property: (context) => context.options.developmentStatusProperty,
		read: getProjectDevelopmentStatus,
		apply: applyDevelopmentState,
		errorMessage: '更新开发状态失败.',
	});
	return button;
}

export function createPublicSelector(
	parentEl: HTMLElement,
	state: { context: ProjectStatusContext },
): HTMLButtonElement {
	const button = createStatusButton(
		parentEl,
		'mbv-project-public-toggle',
		'mbv-project-public-badge',
	);
	bindProjectStatusMenu(button, state, {
		statuses: PROJECT_PUBLIC_STATUSES,
		icons: {
			私有: 'lock',
			公开: 'globe-2',
			上架: 'package-check',
			付费: 'badge-dollar-sign',
		},
		property: (context) => context.options.statusProperty,
		read: getProjectPublicStatus,
		apply: applyPublicState,
		errorMessage: '更新公开状态失败.',
	});
	return button;
}

export function updatePublicSelector(
	button: HTMLButtonElement,
	rowEl: HTMLElement,
	context: ProjectStatusContext,
): void {
	const property = context.options.statusProperty;
	rowEl.classList.toggle('is-hidden', !property);
	if (!property) {
		button.disabled = false;
		button.removeAttribute('data-status');
		return;
	}
	if (button.dataset.saving === 'true') return;
	applyPublicState(button, getProjectPublicStatus(context.entry.getValue(property)));
}

export function updateDevelopmentSelector(
	button: HTMLButtonElement,
	rowEl: HTMLElement,
	context: ProjectStatusContext,
): void {
	const property = context.options.developmentStatusProperty;
	rowEl.classList.toggle('is-hidden', !property);
	if (!property) {
		button.disabled = false;
		button.removeAttribute('data-status');
		return;
	}
	if (button.dataset.saving === 'true') return;
	applyDevelopmentState(
		button,
		getProjectDevelopmentStatus(context.entry.getValue(property)),
	);
}

function createStatusButton(
	parentEl: HTMLElement,
	buttonClass: string,
	badgeClass: string,
): HTMLButtonElement {
	const button = parentEl.createEl('button', {
		cls: `mbv-project-status-toggle ${buttonClass}`,
		attr: { type: 'button', 'aria-haspopup': 'menu' },
	});
	button.createEl('img', {
		cls: `mbv-project-status-badge ${badgeClass}`,
		attr: { alt: '', decoding: 'async' },
	});
	return button;
}

interface ProjectStatusMenuConfig<Status extends string> {
	statuses: readonly Status[];
	icons: Record<Status, string>;
	property: (context: ProjectStatusContext) => BasesPropertyId | null;
	read: (value: unknown) => Status;
	apply: (button: HTMLButtonElement, status: Status) => void;
	errorMessage: string;
}

function bindProjectStatusMenu<Status extends string>(
	button: HTMLButtonElement,
	state: { context: ProjectStatusContext },
	config: ProjectStatusMenuConfig<Status>,
): void {
	button.addEventListener('keydown', (event) => event.stopPropagation());
	button.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (button.dataset.saving === 'true') return;
		const property = config.property(state.context);
		if (!property) return;
		const renderedStatus = button.dataset.status;
		const current = config.statuses.find(
			(status) => status === renderedStatus,
		) ?? config.read(state.context.entry.getValue(property));
		const menu = new Menu();
		for (const status of config.statuses) {
			menu.addItem((item) => item
				.setTitle(status)
				.setIcon(config.icons[status])
				.setChecked(current === status)
				.onClick(() => {
					void saveProjectStatus(button, state, config, property, current, status);
				}));
		}
		if (event.detail === 0) {
			const rect = button.getBoundingClientRect();
			menu.showAtPosition(
				{ x: rect.left, y: rect.bottom },
				button.ownerDocument,
			);
		} else {
			menu.showAtMouseEvent(event);
		}
	});
}

async function saveProjectStatus<Status extends string>(
	button: HTMLButtonElement,
	state: { context: ProjectStatusContext },
	config: ProjectStatusMenuConfig<Status>,
	property: BasesPropertyId,
	previous: Status,
	next: Status,
): Promise<void> {
	button.dataset.saving = 'true';
	button.disabled = true;
	config.apply(button, next);
	try {
		await updateTextStatus(
			state.context.app,
			state.context.entry,
			property,
			next,
		);
	} catch {
		config.apply(button, previous);
		new Notice(config.errorMessage);
	} finally {
		delete button.dataset.saving;
		button.disabled = false;
		button.blur();
	}
}

function applyPublicState(
	button: HTMLButtonElement,
	status: ProjectPublicStatus,
): void {
	button.dataset.status = status;
	button.setAttribute('aria-label', `公开状态: ${status}`);
	const badge = button.querySelector<HTMLImageElement>(
		'.mbv-project-public-badge',
	);
	if (badge) badge.src = getPublicBadgeUrl(status);
}

function applyDevelopmentState(
	button: HTMLButtonElement,
	status: ProjectDevelopmentStatus,
): void {
	button.dataset.status = status;
	button.setAttribute('aria-label', `开发状态: ${status}`);
	const badge = button.querySelector<HTMLImageElement>(
		'.mbv-project-development-badge',
	);
	if (badge) badge.src = getDevelopmentBadgeUrl(status);
}

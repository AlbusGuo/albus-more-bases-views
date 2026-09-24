import {
	Keymap,
	Notice,
	NullValue,
	setIcon,
	type App,
	type BasesEntry,
	type BasesPropertyId,
} from 'obsidian';
import { getStatus, updateStatus } from '../../services/entry-actions';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	getBadgeUrl,
	getDevelopmentBadgeUrl,
	getGithubUrl,
	getPublicBadgeUrl,
	normalizeRepositoryPath,
} from './project-badges';
import {
	PROJECT_METRICS,
	type ProjectMetricKey,
	type ProjectViewOptions,
} from './project-options';
import {
	getProjectDetailsSignature,
	updateProjectDetails,
} from './project-properties';
import { ProjectTaskPanel } from './project-task-panel';

export interface ProjectCardContext {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: ProjectViewOptions;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
}

export interface ProjectCardController {
	element: HTMLElement;
	update: (context: ProjectCardContext) => void;
	prepareHtmlExport: () => Promise<void>;
	destroy: () => void;
}

export function createProjectCard(
	initialContext: ProjectCardContext,
): ProjectCardController {
	const state = {
		context: initialContext,
		detailsSignature: '',
		terminalSignature: '',
	};
	const cardEl = createEl('article', { cls: 'mbv-project-card' });
	const terminalEl = cardEl.createDiv({
		cls: 'mbv-project-terminal',
		attr: { role: 'link', tabindex: '0' },
	});
	const barEl = terminalEl.createDiv('mbv-project-terminal-bar');
	const dotsEl = barEl.createSpan('mbv-project-terminal-dots');
	for (const color of ['red', 'yellow', 'green']) {
		dotsEl.createSpan(`mbv-project-terminal-dot is-${color}`);
	}
	const titleEl = barEl.createSpan('mbv-project-terminal-title');
	const githubEl = barEl.createEl('a', {
		cls: 'clickable-icon mbv-project-github-link',
		attr: { target: '_blank', rel: 'noopener' },
	});
	setIcon(githubEl, 'github');
	githubEl.createSpan({ cls: 'mbv-visually-hidden', text: '打开 GitHub 项目' });
	githubEl.addEventListener('click', (event) => event.stopPropagation());

	const tableEl = terminalEl.createDiv('mbv-project-terminal-table');
	const developmentRowEl = tableEl.createDiv(
		'mbv-project-terminal-row mbv-project-development-row is-hidden',
	);
	developmentRowEl.createSpan({
		cls: 'mbv-project-terminal-label',
		text: 'Status',
	});
	const developmentValueEl = developmentRowEl.createSpan(
		'mbv-project-terminal-value',
	);
	const developmentButton = createDevelopmentToggle(
		developmentValueEl,
		state,
	);
	const publicRowEl = tableEl.createDiv(
		'mbv-project-terminal-row mbv-project-public-row is-hidden',
	);
	publicRowEl.createSpan({
		cls: 'mbv-project-terminal-label',
		text: 'Public',
	});
	const publicValueEl = publicRowEl.createSpan('mbv-project-terminal-value');
	const publicButton = createPublicToggle(publicValueEl, state);
	const rows = new Map<ProjectMetricKey, ProjectMetricElements>();
	for (const metric of PROJECT_METRICS) {
		const rowEl = tableEl.createDiv('mbv-project-terminal-row');
		rowEl.createSpan({ cls: 'mbv-project-terminal-label', text: metric.label });
		const valueEl = rowEl.createSpan('mbv-project-terminal-value');
		rows.set(metric.key, { rowEl, valueEl });
	}
	rows.get('author')?.rowEl.after(developmentRowEl);
	developmentRowEl.after(publicRowEl);
	bindTerminalOpen(terminalEl, state);

	const taskPanel = new ProjectTaskPanel(initialContext.app, initialContext.entry.file);
	cardEl.appendChild(taskPanel.element);

	const update = (context: ProjectCardContext): void => {
		state.context = context;
		const title = getPropertyText(context, context.options.titleProperty) ||
			context.entry.file.basename;
		terminalEl.dataset.href = context.entry.file.path;

		const repositoryPath = normalizeRepositoryPath(
			getPropertyText(context, context.options.repoPathProperty),
		);
		const isPublic = Boolean(repositoryPath) &&
			Boolean(context.options.statusProperty) &&
			getStatus(
				context.options.statusProperty
					? context.entry.getValue(context.options.statusProperty)
					: null,
			);
		const authors = formatAuthors(
			getPropertyText(context, context.options.authorProperty),
		);
		const terminalSignature = [
			title,
			repositoryPath,
			String(isPublic),
			authors,
			...PROJECT_METRICS.map((metric) =>
				String(context.options.visibleMetrics.has(metric.key)),
			),
		].join('\u0000');
		if (terminalSignature !== state.terminalSignature) {
			state.terminalSignature = terminalSignature;
			titleEl.setText(title);
			terminalEl.classList.toggle('is-private', !isPublic);
			githubEl.classList.toggle('is-hidden', !isPublic);
			if (isPublic) githubEl.setAttribute('href', getGithubUrl(repositoryPath));
			else githubEl.removeAttribute('href');

			for (const metric of PROJECT_METRICS) {
				const elements = rows.get(metric.key);
				if (!elements) continue;
				const visible = context.options.visibleMetrics.has(metric.key) &&
					(metric.key === 'author' || isPublic);
				elements.rowEl.classList.toggle('is-hidden', !visible);
				if (!visible) continue;
				if (metric.key === 'author') {
					elements.valueEl.removeClass('is-redacted');
					elements.valueEl.setText(authors || '-');
					continue;
				}
				updateBadge(elements.valueEl, repositoryPath, metric.key, isPublic);
			}
		}
		updateDevelopmentToggle(
			developmentButton,
			developmentRowEl,
			context,
		);
		updatePublicToggle(publicButton, publicRowEl, context);

		const signature = getProjectDetailsSignature(context);
		if (signature !== state.detailsSignature) {
			state.detailsSignature = signature;
			updateProjectDetails(cardEl, context);
		}
		void taskPanel.update(context.entry.file);
	};

	update(initialContext);
	return {
		element: cardEl,
		update,
		prepareHtmlExport: () => taskPanel.prepareHtmlExport(),
		destroy: () => taskPanel.destroy(),
	};
}

function createDevelopmentToggle(
	parentEl: HTMLElement,
	state: { context: ProjectCardContext },
): HTMLButtonElement {
	const button = parentEl.createEl('button', {
		cls: 'mbv-project-status-toggle mbv-project-development-toggle',
		attr: {
			type: 'button',
			'aria-pressed': 'false',
		},
	});
	button.createEl('img', {
		cls: 'mbv-project-status-badge mbv-project-development-badge',
		attr: { alt: '', decoding: 'async' },
	});
	button.addEventListener('keydown', (event) => event.stopPropagation());
	button.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		const { app, entry, options } = state.context;
		const property = options.developmentStatusProperty;
		if (!property || button.disabled) return;
		const previous = button.dataset.complete === 'true';
		const next = !previous;
		applyDevelopmentState(button, next);
		button.disabled = true;
		void updateStatus(app, entry, property, next)
			.catch(() => {
				applyDevelopmentState(button, previous);
				new Notice('更新开发状态失败.');
			})
			.finally(() => { button.disabled = false; });
	});
	return button;
}

function createPublicToggle(
	parentEl: HTMLElement,
	state: { context: ProjectCardContext },
): HTMLButtonElement {
	const button = parentEl.createEl('button', {
		cls: 'mbv-project-status-toggle mbv-project-public-toggle',
		attr: { type: 'button', 'aria-pressed': 'false' },
	});
	button.createEl('img', {
		cls: 'mbv-project-status-badge mbv-project-public-badge',
		attr: { alt: '', decoding: 'async' },
	});
	button.addEventListener('keydown', (event) => event.stopPropagation());
	button.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		const { app, entry, options } = state.context;
		const property = options.statusProperty;
		if (!property || button.disabled) return;
		const previous = button.dataset.enabled === 'true';
		const next = !previous;
		applyPublicState(button, next);
		button.disabled = true;
		void updateStatus(app, entry, property, next)
			.catch(() => {
				applyPublicState(button, previous);
				new Notice('更新公开状态失败.');
			})
			.finally(() => { button.disabled = false; });
	});
	return button;
}

function updatePublicToggle(
	button: HTMLButtonElement,
	rowEl: HTMLElement,
	context: ProjectCardContext,
): void {
	const property = context.options.statusProperty;
	rowEl.classList.toggle('is-hidden', !property);
	if (!property) {
		button.disabled = false;
		button.removeAttribute('data-enabled');
		return;
	}
	if (button.disabled) return;
	applyPublicState(button, getStatus(context.entry.getValue(property)));
}

function applyPublicState(button: HTMLButtonElement, isPublic: boolean): void {
	button.dataset.enabled = String(isPublic);
	button.setAttribute('aria-pressed', String(isPublic));
	button.setAttribute(
		'aria-label',
		isPublic ? '公开状态: 公开, 点击改为私有' : '公开状态: 私有, 点击改为公开',
	);
	const badge = button.querySelector<HTMLImageElement>(
		'.mbv-project-public-badge',
	);
	if (badge) badge.src = getPublicBadgeUrl(isPublic);
}

function updateDevelopmentToggle(
	button: HTMLButtonElement,
	rowEl: HTMLElement,
	context: ProjectCardContext,
): void {
	const property = context.options.developmentStatusProperty;
	rowEl.classList.toggle('is-hidden', !property);
	if (!property) {
		button.disabled = false;
		button.removeAttribute('data-complete');
		return;
	}
	if (button.disabled) return;
	applyDevelopmentState(
		button,
		getStatus(context.entry.getValue(property)),
	);
}

function applyDevelopmentState(
	button: HTMLButtonElement,
	complete: boolean,
): void {
	button.dataset.complete = String(complete);
	button.setAttribute('aria-pressed', String(complete));
	button.setAttribute(
		'aria-label',
		complete ? '开发状态: 阶段完成, 点击改为开发中' : '开发状态: 开发中, 点击标记阶段完成',
	);
	const badge = button.querySelector<HTMLImageElement>(
		'.mbv-project-development-badge',
	);
	if (badge) badge.src = getDevelopmentBadgeUrl(complete);
}

interface ProjectMetricElements {
	rowEl: HTMLElement;
	valueEl: HTMLElement;
}

function updateBadge(
	valueEl: HTMLElement,
	repositoryPath: string,
	type: Exclude<ProjectMetricKey, 'author'>,
	isPublic: boolean,
): void {
	valueEl.empty();
	valueEl.classList.toggle('is-redacted', !isPublic);
	if (!isPublic) {
		valueEl.setText('███████');
		return;
	}
	valueEl.createEl('img', {
		attr: {
			src: getBadgeUrl(repositoryPath, type),
			alt: '',
			loading: 'lazy',
			decoding: 'async',
			fetchpriority: 'low',
		},
	});
}

function bindTerminalOpen(
	terminalEl: HTMLElement,
	state: { context: ProjectCardContext },
): void {
	terminalEl.addEventListener('click', (event) => {
		if (event.button !== 0) return;
		void openProjectEntry(state.context, event);
	});
	terminalEl.addEventListener('auxclick', (event) => {
		if (event.button !== 1) return;
		event.preventDefault();
		void openProjectEntry(state.context, event);
	});
	terminalEl.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		void openProjectEntry(state.context, event);
	});
}

async function openProjectEntry(
	context: ProjectCardContext,
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
		'button' in event && event.button === 1
			? 'tab'
			: Keymap.isModEvent(event),
	);
}

function getPropertyText(
	context: ProjectCardContext,
	property: BasesPropertyId | null,
): string {
	if (!property) return '';
	const value = context.entry.getValue(property);
	if (!value || value instanceof NullValue) return '';
	const text = value.toString().trim();
	return text.toLowerCase() === 'null' ? '' : text;
}

function formatAuthors(value: string): string {
	return value
		.split(/[,\uFF0C\u3001\s]+/u)
		.map((author) => author.trim())
		.filter(Boolean)
		.map((author) => author.startsWith('@') ? author : `@${author}`)
		.join(' ');
}

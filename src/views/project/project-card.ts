import {
	Keymap,
	setIcon,
	type App,
	type BasesEntry,
	type BasesPropertyId,
} from 'obsidian';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	getBadgeUrl,
	getGithubUrl,
	normalizeRepositoryPath,
} from './project-badges';
import {
	PROJECT_METRICS,
	type ProjectMetricKey,
	type ProjectViewOptions,
} from './project-options';
import { getPropertyText } from '../shared/card-value-utils';
import {
	getProjectDetailsSignature,
	updateProjectDetails,
} from './project-properties';
import { ProjectTaskPanel } from './project-task-panel';
import {
	getProjectPublicStatus,
	shouldLoadProjectBadges,
} from './project-status';
import {
	createDevelopmentSelector,
	createPublicSelector,
	updateDevelopmentSelector,
	updatePublicSelector,
} from './project-status-actions';

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
	const developmentButton = createDevelopmentSelector(
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
	const publicButton = createPublicSelector(publicValueEl, state);
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
		const title = getPropertyText(context.entry, context.options.titleProperty) ||
			context.entry.file.basename;
		terminalEl.dataset.href = context.entry.file.path;

		const repositoryPath = normalizeRepositoryPath(
			getPropertyText(context.entry, context.options.repoPathProperty),
		);
		const publicStatus = getProjectPublicStatus(
			context.options.statusProperty
				? context.entry.getValue(context.options.statusProperty)
				: null,
		);
		const isPublic = Boolean(repositoryPath) &&
			Boolean(context.options.statusProperty) &&
			shouldLoadProjectBadges(publicStatus);
		const authors = formatAuthors(
			getPropertyText(context.entry, context.options.authorProperty),
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
		updateDevelopmentSelector(
			developmentButton,
			developmentRowEl,
			context,
		);
		updatePublicSelector(publicButton, publicRowEl, context);

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

function formatAuthors(value: string): string {
	return value
		.split(/[,\uFF0C\u3001\s]+/u)
		.map((author) => author.trim())
		.filter(Boolean)
		.map((author) => author.startsWith('@') ? author : `@${author}`)
		.join(' ');
}

import {
	Component,
	Notice,
	setIcon,
	type App,
	type TFile,
} from 'obsidian';
import {
	addProjectTask,
	deleteProjectTask,
	readProjectTasks,
	renameProjectTask,
	toggleProjectTask,
	type ProjectTask,
} from './project-tasks';
import {
	bindAutoResize,
	renderProjectTaskAdd,
} from './project-task-add';
import { renderProjectTaskList } from './project-task-list';

export class ProjectTaskPanel {
	readonly element: HTMLElement;

	private file: TFile;
	private tasks: ProjectTask[] = [];
	private renderedMarkdown = new Component();
	private completedMarkdown = new Component();
	private loadVersion = 0;
	private lastMtime = -1;
	private disposed = false;
	private completedExpanded = false;
	private readonly initialLoad: Promise<void>;

	constructor(private readonly app: App, file: TFile) {
		this.file = file;
		this.element = createDiv('mbv-project-tasks');
		this.renderedMarkdown.load();
		this.completedMarkdown.load();
		this.initialLoad = this.update(file, true);
	}

	async prepareHtmlExport(): Promise<void> {
		await this.initialLoad;
	}

	async update(file: TFile, force = false): Promise<void> {
		if (this.disposed) return;
		const fileChanged = file.path !== this.file.path;
		this.file = file;
		if (!force && !fileChanged && file.stat.mtime === this.lastMtime) return;
		this.lastMtime = file.stat.mtime;
		const version = ++this.loadVersion;
		try {
			const tasks = await readProjectTasks(this.app, file);
			if (this.disposed || version !== this.loadVersion) return;
			this.tasks = tasks;
			this.render();
		} catch {
			if (this.disposed || version !== this.loadVersion) return;
			this.tasks = [];
			this.render();
		}
	}

	destroy(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.loadVersion += 1;
		this.renderedMarkdown.unload();
		this.completedMarkdown.unload();
		this.element.remove();
	}

	private render(): void {
		this.renderedMarkdown.unload();
		this.renderedMarkdown = new Component();
		this.renderedMarkdown.load();
		this.completedMarkdown.unload();
		this.completedMarkdown = new Component();
		this.completedMarkdown.load();
		this.element.empty();

		const completed = this.tasks.filter((task) => task.status !== ' ').length;
		const headerEl = this.element.createDiv('mbv-project-task-header');
		headerEl.createSpan({ cls: 'mbv-project-task-heading', text: '任务' });
		headerEl.createSpan({
			cls: 'mbv-project-task-progress-label',
			text: `${completed}/${this.tasks.length}`,
		});
		const trackEl = this.element.createDiv('mbv-project-task-progress');
		const progressEl = trackEl.createDiv('mbv-project-task-progress-value');
		progressEl.classList.toggle(
			'is-complete',
			this.tasks.length > 0 && completed === this.tasks.length,
		);
		progressEl.style.setProperty(
			'--mbv-project-task-progress',
			`${this.tasks.length === 0 ? 0 : (completed / this.tasks.length) * 100}%`,
		);

		const roots = this.getRootTasks();
		const activeRoots = roots.filter((task) => task.status === ' ');
		const completedRoots = roots.filter((task) => task.status !== ' ');
		const listEl = this.element.createDiv('mbv-project-task-list');
		if (this.tasks.length === 0) {
			listEl.createDiv({ cls: 'mbv-project-task-empty', text: '暂无任务' });
		} else {
			this.renderTaskTree(listEl, activeRoots, this.renderedMarkdown);
			if (completedRoots.length > 0) {
				const completedEl = listEl.createDiv({
					cls: 'mbv-project-task-completed',
				});
				const toggleEl = completedEl.createEl('button', {
					cls: 'clickable-icon mbv-project-task-completed-toggle',
					attr: {
						type: 'button',
						'aria-expanded': String(this.completedExpanded),
					},
				});
				const iconEl = toggleEl.createSpan('mbv-project-task-completed-icon');
				setIcon(iconEl, this.completedExpanded ? 'chevron-down' : 'chevron-right');
				toggleEl.createSpan({ text: `已完成 (${completedRoots.length})` });
				const completedListEl = completedEl.createDiv(
					'mbv-project-task-completed-list',
				);
				toggleEl.addEventListener('click', () => {
					this.completedExpanded = !this.completedExpanded;
					toggleEl.setAttribute(
						'aria-expanded',
						String(this.completedExpanded),
					);
					setIcon(
						iconEl,
						this.completedExpanded ? 'chevron-down' : 'chevron-right',
					);
					this.completedMarkdown.unload();
					this.completedMarkdown = new Component();
					this.completedMarkdown.load();
					completedListEl.empty();
					if (this.completedExpanded) {
						this.renderTaskTree(
							completedListEl,
							completedRoots,
							this.completedMarkdown,
						);
					}
				});
				if (this.completedExpanded) {
					this.renderTaskTree(
						completedListEl,
						completedRoots,
						this.completedMarkdown,
					);
				}
			}
		}
		renderProjectTaskAdd(this.element, {
			submit: (text) => this.addTask(text),
			cancel: () => this.render(),
		});
	}

	private getRootTasks(): ProjectTask[] {
		const lines = new Set(this.tasks.map((task) => task.line));
		return this.tasks.filter(
			(task) => task.parentLine === null || !lines.has(task.parentLine),
		);
	}

	private renderTaskTree(
		parentEl: HTMLElement,
		tasks: ProjectTask[],
		component: Component,
	): void {
		renderProjectTaskList(
			this.app,
			this.file,
			parentEl,
			tasks,
			this.tasks,
			component,
			{
				toggle: (task, checkbox) => {
				checkbox.disabled = true;
				void this.runMutation(
					() => toggleProjectTask(this.app, this.file, task),
					() => {
						task.status = task.status === ' ' ? 'x' : ' ';
					},
				);
				},
				reveal: (task) => void this.revealTask(task),
				edit: (task, contentEl) => this.editTask(task, contentEl),
				delete: (task) => {
					void this.runMutation(
						() => deleteProjectTask(this.app, this.file, task),
						() => this.removeTaskLocally(task),
					);
				},
			},
		);
	}

	private async addTask(text: string): Promise<void> {
		try {
			const line = await addProjectTask(this.app, this.file, text);
			this.tasks.push({ line, parentLine: null, status: ' ', text });
			this.lastMtime = this.file.stat.mtime;
			this.render();
		} catch {
			new Notice('添加任务失败.');
			void this.update(this.file, true);
		}
	}


	private editTask(task: ProjectTask, contentEl: HTMLElement): void {
		if (contentEl.querySelector('textarea')) return;
		contentEl.empty();
		const editor = contentEl.createEl('textarea', {
			cls: 'mbv-project-task-editor',
			attr: { rows: '1' },
		});
		editor.value = task.text;
		bindAutoResize(editor);
		editor.focus();
		editor.select();
		let cancelled = false;
		const save = (): void => {
			if (cancelled) return;
			const text = editor.value.trim();
			if (!text || text === task.text) {
				this.render();
				return;
			}
			void this.runMutation(
				() => renameProjectTask(this.app, this.file, task, text),
				() => {
					task.text = text;
				},
			);
		};
		editor.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				cancelled = true;
				this.render();
				return;
			}
			if (event.key !== 'Enter' || event.shiftKey) return;
			event.preventDefault();
			editor.blur();
		});
		editor.addEventListener('blur', save, { once: true });
	}

	private removeTaskLocally(task: ProjectTask): void {
		this.tasks = this.tasks
			.filter((candidate) => candidate.line !== task.line)
			.map((candidate) => ({
				...candidate,
				line: candidate.line > task.line ? candidate.line - 1 : candidate.line,
				parentLine:
					candidate.parentLine === task.line
						? null
						: candidate.parentLine !== null && candidate.parentLine > task.line
							? candidate.parentLine - 1
							: candidate.parentLine,
			}));
	}

	private async revealTask(task: ProjectTask): Promise<void> {
		await this.app.workspace.openLinkText(this.file.path, this.file.path, false, {
			eState: { line: task.line },
		});
	}

	private async runMutation(
		operation: () => Promise<void>,
		apply: () => void,
	): Promise<void> {
		try {
			await operation();
			apply();
			this.lastMtime = this.file.stat.mtime;
			this.render();
		} catch {
			new Notice('更新任务失败.');
			void this.update(this.file, true);
		}
	}
}

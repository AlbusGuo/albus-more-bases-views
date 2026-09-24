import {
	Keymap,
	MarkdownRenderer,
	setIcon,
	type App,
	type Component,
	type TFile,
} from 'obsidian';
import type { ProjectTask } from './project-tasks';

export interface ProjectTaskListActions {
	toggle: (task: ProjectTask, checkbox: HTMLInputElement) => void;
	reveal: (task: ProjectTask) => void;
	edit: (task: ProjectTask, contentEl: HTMLElement) => void;
	delete: (task: ProjectTask) => void;
}

export function renderProjectTaskList(
	app: App,
	file: TFile,
	parentEl: HTMLElement,
	roots: ProjectTask[],
	allTasks: ProjectTask[],
	component: Component,
	actions: ProjectTaskListActions,
): void {
	const childrenByParent = new Map<number, ProjectTask[]>();
	for (const task of allTasks) {
		if (task.parentLine === null) continue;
		const children = childrenByParent.get(task.parentLine) ?? [];
		children.push(task);
		childrenByParent.set(task.parentLine, children);
	}

	const renderLevel = (containerEl: HTMLElement, tasks: ProjectTask[]): void => {
		if (tasks.length === 0) return;
		const listEl = containerEl.createEl('ul');
		for (const task of tasks) {
			const itemEl = listEl.createEl('li', {
				cls: `mbv-project-task-item${task.status === ' ' ? '' : ' is-completed'}`,
			});
			const rowEl = itemEl.createDiv('mbv-project-task-row');
			const checkbox = rowEl.createEl('input', { attr: { type: 'checkbox' } });
			checkbox.checked = task.status !== ' ';
			checkbox.addEventListener('change', () => actions.toggle(task, checkbox));

			const contentEl = rowEl.createDiv('mbv-project-task-content');
			void MarkdownRenderer.render(app, task.text, contentEl, file.path, component);
			contentEl.addEventListener('click', (event) => {
				if ((event.target as HTMLElement).closest('a')) return;
				if (Keymap.isModEvent(event)) actions.reveal(task);
				else actions.edit(task, contentEl);
			});

			const deleteButton = rowEl.createEl('button', {
				cls: 'clickable-icon mbv-project-task-delete',
				attr: { type: 'button' },
			});
			setIcon(deleteButton, 'trash-2');
			deleteButton.createSpan({ cls: 'mbv-visually-hidden', text: '删除任务' });
			deleteButton.addEventListener('click', (event) => {
				event.stopPropagation();
				actions.delete(task);
			});
			renderLevel(itemEl, childrenByParent.get(task.line) ?? []);
		}
	};

	renderLevel(parentEl, roots);
}

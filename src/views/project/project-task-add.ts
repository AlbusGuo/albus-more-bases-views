export interface ProjectTaskAddActions {
	submit: (text: string) => Promise<void>;
	cancel: () => void;
}

export function renderProjectTaskAdd(
	parentEl: HTMLElement,
	actions: ProjectTaskAddActions,
): void {
	const hostEl = parentEl.createDiv('mbv-project-task-add-host');
	const triggerEl = hostEl.createEl('button', {
		cls: 'mbv-project-task-add-trigger',
		attr: { type: 'button' },
		text: '添加任务',
	});
	triggerEl.addEventListener('click', () => showEditor(hostEl, actions));
}

function showEditor(
	hostEl: HTMLElement,
	actions: ProjectTaskAddActions,
): void {
	hostEl.empty();
	const textarea = hostEl.createEl('textarea', {
		cls: 'mbv-project-task-add',
		attr: { rows: '1' },
	});
	bindAutoResize(textarea);
	textarea.focus();
	textarea.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			actions.cancel();
			return;
		}
		if (event.key !== 'Enter' || event.shiftKey) return;
		event.preventDefault();
		const text = textarea.value.trim();
		if (!text) return;
		textarea.disabled = true;
		void actions.submit(text);
	});
	textarea.addEventListener('blur', () => {
		if (!textarea.value.trim() && !textarea.disabled) actions.cancel();
	});
}

export function bindAutoResize(textarea: HTMLTextAreaElement): void {
	const resize = (): void => {
		textarea.setCssProps({ '--mbv-project-task-input-height': 'auto' });
		textarea.setCssProps({
			'--mbv-project-task-input-height': `${textarea.scrollHeight}px`,
		});
	};
	textarea.addEventListener('input', resize);
	resize();
}

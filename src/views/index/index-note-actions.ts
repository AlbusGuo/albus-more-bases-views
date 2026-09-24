import {
	AbstractInputSuggest,
	Modal,
	Notice,
	prepareSimpleSearch,
	setIcon,
	type App,
	type BasesPropertyId,
	type TFile,
} from 'obsidian';

export class IndexNoteActions {
	constructor(private readonly app: App) {}

	editTags(
		file: TFile,
		property: BasesPropertyId | null,
		values: readonly string[],
		suggestions: readonly string[],
	): void {
		if (!property?.startsWith('note.')) {
			new Notice('请先在视图设置中选择分类属性.');
			return;
		}
		const propertyName = property.slice(5).trim();
		if (!propertyName) {
			new Notice('分类属性无效.');
			return;
		}
		new IndexTagEditorModal(
			this.app,
			file,
			propertyName,
			values,
			suggestions,
		).open();
	}

	delete(file: TFile): void {
		new IndexDeleteModal(this.app, file).open();
	}
}

class IndexTagEditorModal extends Modal {
	private fieldsEl: HTMLElement | null = null;
	private saveButtonEl: HTMLButtonElement | null = null;
	private readonly suggesters = new Map<HTMLInputElement, IndexTagFieldSuggest>();
	private saving = false;

	constructor(
		app: App,
		private readonly file: TFile,
		private readonly propertyName: string,
		private readonly values: readonly string[],
		private readonly suggestions: readonly string[],
	) {
		super(app);
		this.shouldRestoreSelection = false;
	}

	onOpen(): void {
		this.modalEl.addClass('mbv-index-tag-modal');
		this.setTitle('编辑标签');
		this.contentEl.empty();
		const editorEl = this.contentEl.createDiv('mbv-index-tag-editor');
		this.fieldsEl = editorEl.createDiv('mbv-index-tag-fields');
		for (const value of this.values) this.addField(value);
		const addButtonEl = editorEl.createEl('button', {
			cls: 'clickable-icon mbv-index-tag-add',
			attr: { type: 'button', 'aria-label': '添加标签' },
		});
		setIcon(addButtonEl, 'plus');
		addButtonEl.addEventListener('click', () => this.addField('', true));
		const buttonsEl = this.contentEl.createDiv('mbv-index-modal-buttons');
		buttonsEl.createEl('button', { text: '取消' }).addEventListener('click', () => {
			this.close();
		});
		this.saveButtonEl = buttonsEl.createEl('button', {
			text: '保存',
			cls: 'mod-cta',
		});
		this.saveButtonEl.addEventListener('click', () => void this.save());
	}

	onClose(): void {
		for (const suggester of this.suggesters.values()) suggester.close();
		this.suggesters.clear();
		this.fieldsEl = null;
		this.saveButtonEl = null;
		this.contentEl.empty();
	}

	private addField(value: string, focus = false): void {
		if (!this.fieldsEl) return;
		const rowEl = this.fieldsEl.createDiv('mbv-index-tag-field');
		const inputEl = rowEl.createEl('input', {
			type: 'text',
			cls: 'mbv-index-tag-field-input',
			value,
			attr: {
				placeholder: '输入标签...',
				spellcheck: 'false',
				'aria-label': '标签',
			},
		});
		const suggester = new IndexTagFieldSuggest(
			this.app,
			inputEl,
			this.suggestions,
			() => this.getTags(inputEl),
		);
		this.suggesters.set(inputEl, suggester);
		const deleteButtonEl = rowEl.createEl('button', {
			cls: 'clickable-icon mbv-index-tag-field-delete',
			attr: { type: 'button', 'aria-label': '删除标签' },
		});
		setIcon(deleteButtonEl, 'x');
		deleteButtonEl.addEventListener('click', () => {
			suggester.close();
			this.suggesters.delete(inputEl);
			rowEl.remove();
		});
		inputEl.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter') return;
			event.preventDefault();
			inputEl.blur();
		});
		if (focus) inputEl.ownerDocument.defaultView?.requestAnimationFrame(() => {
			inputEl.focus();
		});
	}

	private getTags(excludedInput?: HTMLInputElement): string[] {
		return Array.from(this.suggesters.keys())
			.filter((input) => input !== excludedInput)
			.map((input) => normalizeTag(input.value))
			.filter(Boolean);
	}

	private async save(): Promise<void> {
		if (this.saving) return;
		const tags = Array.from(new Set(Array.from(this.suggesters.keys())
			.map((input) => normalizeTag(input.value))
			.filter(Boolean)));
		const currentFile = this.app.vault.getFileByPath(this.file.path);
		if (!currentFile) {
			new Notice('笔记不存在或已被移动.');
			return;
		}
		this.saving = true;
		if (this.saveButtonEl) this.saveButtonEl.disabled = true;
		for (const input of this.suggesters.keys()) input.disabled = true;
		try {
			await this.app.fileManager.processFrontMatter(currentFile, (frontmatter) => {
				const properties = frontmatter as Record<string, unknown>;
				if (tags.length === 0) delete properties[this.propertyName];
				else properties[this.propertyName] = tags;
			});
			this.close();
		} catch (error) {
			new Notice(`标签保存失败: ${getErrorMessage(error)}`);
			this.saving = false;
			if (this.saveButtonEl) this.saveButtonEl.disabled = false;
			for (const input of this.suggesters.keys()) input.disabled = false;
		}
	}
}

class IndexTagFieldSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly items: readonly string[],
		private readonly getSelected: () => readonly string[],
	) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const normalized = normalizeTag(query);
		const selected = new Set(this.getSelected());
		const search = normalized ? prepareSimpleSearch(normalized) : null;
		return this.items.filter((item) =>
			!selected.has(normalizeTag(item)) && (!search || search(item) !== null),
		).slice(0, this.limit);
	}

	renderSuggestion(value: string, element: HTMLElement): void {
		element.setText(value);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.close();
	}
}

class IndexDeleteModal extends Modal {
	private deleting = false;

	constructor(app: App, private readonly file: TFile) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('mbv-index-delete-modal');
		this.setTitle('删除笔记');
		this.contentEl.empty();
		this.contentEl.createDiv({
			cls: 'mbv-index-delete-message',
			text: `确定要删除 "${this.file.basename}" 吗?`,
		});
		const buttonsEl = this.contentEl.createDiv('mbv-index-modal-buttons');
		buttonsEl.createEl('button', { text: '取消' }).addEventListener('click', () => {
			this.close();
		});
		const deleteButtonEl = buttonsEl.createEl('button', {
			text: '删除',
			cls: 'mod-warning',
		});
		deleteButtonEl.addEventListener('click', () => {
			if (this.deleting) return;
			this.deleting = true;
			deleteButtonEl.disabled = true;
			void this.deleteFile();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async deleteFile(): Promise<void> {
		const currentFile = this.app.vault.getFileByPath(this.file.path);
		if (!currentFile) {
			new Notice('笔记不存在或已被移动.');
			this.close();
			return;
		}
		try {
			await this.app.fileManager.trashFile(currentFile);
			this.close();
		} catch (error) {
			new Notice(`删除失败: ${getErrorMessage(error)}`);
			this.deleting = false;
			this.contentEl.querySelector<HTMLButtonElement>('.mod-warning')?.removeAttribute(
				'disabled',
			);
		}
	}
}

function normalizeTag(value: string): string {
	return value.trim().replace(/^#+/u, '').replace(/^\/+|\/+$/gu, '');
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : '未知错误';
}

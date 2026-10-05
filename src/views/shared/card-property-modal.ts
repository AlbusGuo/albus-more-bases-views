import {
	Setting,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type Value,
} from 'obsidian';
import { listVaultImages } from '../../ui/vault-image-suggest';
import { AutoSavePropertyModal } from './auto-save-property-modal';
import {
	getEditablePropertyType,
	readFrontmatter,
	renameNoteFile,
	sameValue,
	savePropertyChanges,
	unwrapBasesValue,
	writablePropertyName,
} from './property-editing';
import type {
	CardPropertyEditorDefinition,
	CardPropertyEditorField,
	CardPropertyFieldKind,
	CardPropertyPreviewFactory,
} from './card-property-editor-types';
import { CardPropertyPreview } from './card-property-preview';
import { prepareEditorModal } from './editor-modal-layout';
import {
	CardPropertySuggestions,
	renderCardPropertyList,
} from './card-property-controls';
import {
	createDraftValue,
	fieldDescription,
	formatInputValue,
	readReadingStatus,
	resolveCardPropertyKind,
	supportsValueSuggestions,
	toBasesValue,
	type CardPropertyDraftValue,
} from './card-property-values';

interface CardPropertyModalContext<Options> {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: Options;
}

export class CardPropertyModal<Options>
	extends AutoSavePropertyModal<string> {
	private readonly original = new Map<string, unknown>();
	private readonly draft = new Map<string, CardPropertyDraftValue>();
	private readonly resolvedKinds = new Map<string, CardPropertyFieldKind>();
	private readonly suggestions: CardPropertySuggestions;
	private formEl!: HTMLElement;
	private preview: CardPropertyPreview | null = null;

	constructor(
		private readonly context: CardPropertyModalContext<Options>,
		private readonly definition: CardPropertyEditorDefinition<Options>,
		private readonly previewFactory: CardPropertyPreviewFactory,
		private readonly suggestionValues: ReadonlyMap<string, readonly string[]>,
		private readonly onClosed?: () => void,
	) {
		super(context.app, '保存卡片属性失败.');
		this.suggestions = new CardPropertySuggestions(context.app);
	}

	onOpen(): void {
		prepareEditorModal(this.titleEl);
		this.modalEl.addClass('mbv-card-property-modal');
		this.contentEl.addClass('mbv-card-property-editor');
		const previewEl = this.contentEl.createDiv('mbv-card-property-preview');
		this.formEl = this.contentEl.createDiv({
			cls: 'mbv-card-property-form',
			attr: { 'data-mbv-card-scroll': '' },
		});
		this.load();
		this.preview = new CardPropertyPreview(
			previewEl,
			this.context.ownerEl,
			this.previewFactory,
			this.previewEntry(),
		);
		this.render();
	}

	onClose(): void {
		this.preview?.destroy();
		this.preview = null;
		this.suggestions.reset();
		void this.flushSave(this.formEl).finally(() => {
			this.original.clear();
			this.dirty.clear();
		});
		this.contentEl.empty();
		this.onClosed?.();
	}

	protected async saveDirty(): Promise<void> {
		const fieldIds = [...this.dirty];
		if (!fieldIds.length) return;
		for (const fieldId of fieldIds) this.dirty.delete(fieldId);
		const changes = new Map<string, { before: unknown; after: unknown }>();
		try {
			for (const fieldId of fieldIds) {
				const field = this.field(fieldId);
				if (!field) continue;
				const propertyId = field.property(this.context.options);
				if (field.filenameFallback && !propertyId) {
					const value = String(this.draft.get(field.id) ?? '');
					this.draft.set(
						field.id,
						await renameNoteFile(this.app, this.context.entry.file, value),
					);
					continue;
				}
				const property = writablePropertyName(propertyId);
				if (!property) continue;
				const after = this.serialize(field);
				const before = this.original.get(property);
				if (sameValue(before, after)) continue;
				const previous = changes.get(property);
				if (previous && !sameValue(previous.after, after)) {
					throw new Error(`${property} 映射到多个字段, 修改内容存在冲突.`);
				}
				changes.set(property, { before, after });
			}
			if (changes.size) {
				await savePropertyChanges(
					this.app,
					this.context.entry.file,
					changes,
				);
			}
			for (const [property, change] of changes) {
				this.original.set(property, structuredClone(change.after));
			}
			this.updatePreview();
		} catch (error) {
			for (const fieldId of fieldIds) this.dirty.add(fieldId);
			throw error;
		}
	}

	private load(): void {
		const frontmatter = readFrontmatter(
			this.app,
			this.context.entry.file,
		);
		for (const field of this.definition.fields) {
			const propertyId = field.property(this.context.options);
			const property = writablePropertyName(propertyId);
			let raw: unknown;
			if (field.filenameFallback && !propertyId) {
				raw = this.context.entry.file.basename;
			} else if (property) {
				raw = frontmatter?.[property];
				if (!this.original.has(property)) {
					this.original.set(property, structuredClone(raw));
				}
			} else {
				raw = propertyId
					? unwrapBasesValue(this.context.entry.getValue(propertyId))
					: undefined;
			}
			const kind = resolveCardPropertyKind(
				field,
				raw,
				getEditablePropertyType(this.app, propertyId, raw),
			);
			this.resolvedKinds.set(field.id, kind);
			this.draft.set(
				field.id,
				kind === 'select' && field.normalize
					? field.normalize(raw)
					: createDraftValue(kind, raw),
			);
		}
	}

	private render(focus?: { field: string; index: number }): void {
		const scrollTop = this.formEl.scrollTop;
		this.suggestions.reset();
		this.formEl.empty();
		const imageFiles = this.definition.fields.some((field) => field.kind === 'image')
			? listVaultImages(this.app)
			: [];
		const pdfFiles = this.definition.fields.some((field) => field.kind === 'pdf')
			? this.app.vault.getFiles()
				.filter((file) => file.extension.toLowerCase() === 'pdf')
				.sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'))
			: [];
		for (const field of this.definition.fields) {
			const kind = this.kind(field);
			const writable = this.isWritable(field);
			const description = writable
				? field.description ?? fieldDescription(field, kind)
				: `${field.description ?? fieldDescription(field, kind)}, 未映射或不可写`;
			const setting = new Setting(this.formEl)
				.setName(field.name)
				.setDesc(description)
				.setClass(`mbv-card-editor-field-${field.id}`);
			if (kind === 'list') {
				renderCardPropertyList(
					setting,
					this.suggestions,
					{
						fieldId: field.id,
						name: field.name,
						placeholder: field.kind === 'image' || field.kind === 'pdf'
							? '双链'
							: field.placeholder ?? '',
						values: this.listValue(field),
						writable,
						imageFiles: field.kind === 'image' ? imageFiles : undefined,
						pdfFiles: field.kind === 'pdf' ? pdfFiles : undefined,
						suggestionValues: this.suggestionValues.get(field.id) ?? [],
						onChange: (index, value, immediate) => {
							const next = [...this.listValue(field, false)];
							next[index] = value;
							this.change(field, next, immediate);
						},
						onRemove: (index) => {
							const next = this.listValue(field, false)
								.filter((_, valueIndex) => valueIndex !== index);
							this.change(field, next, true);
							this.render({ field: field.id, index: Math.max(0, index - 1) });
						},
						onAdd: () => {
							const next = [...this.listValue(field, false), ''];
							this.change(field, next);
							this.render({ field: field.id, index: next.length - 1 });
						},
					},
				);
			} else if (kind === 'boolean') {
				setting.addToggle((toggle) => toggle
					.setValue(Boolean(this.draft.get(field.id)))
					.onChange((value) => this.change(field, value, true)));
			} else if (kind === 'reading-status') {
				setting.addDropdown((dropdown) => dropdown
					.addOption('已阅', '已阅')
					.addOption('阅读中', '阅读中')
					.addOption('未读', '未读')
					.setValue(readReadingStatus(this.draft.get(field.id)))
					.onChange((value) => this.change(field, value, true)));
			} else if (kind === 'select') {
				setting.addDropdown((dropdown) => {
					for (const option of field.options ?? []) {
						dropdown.addOption(option, option);
					}
					dropdown
						.setValue(String(this.draft.get(field.id) ?? ''))
						.onChange((value) => this.change(field, value, true));
				});
			} else {
				setting.addText((input) => {
					if (kind === 'number') {
						input.inputEl.type = 'number';
						input.inputEl.inputMode = 'decimal';
					} else if (kind === 'date' || kind === 'datetime') {
						input.inputEl.type = kind === 'date' ? 'date' : 'datetime-local';
					}
					input.setValue(formatInputValue(kind, this.draft.get(field.id)))
						.setPlaceholder(field.placeholder ?? '')
						.onChange((value) => this.change(field, value));
					if (kind === 'image') {
						this.suggestions.addImages(
							input.inputEl,
							imageFiles,
							(value) => this.change(field, value, true),
						);
					} else if (kind === 'pdf') {
						this.suggestions.addMarkdownFiles(
							input.inputEl,
							pdfFiles,
							(value) => this.change(field, value, true),
						);
					} else if (supportsValueSuggestions(kind)) {
						this.suggestions.addValues(
							input.inputEl,
							this.suggestionValues.get(field.id) ?? [],
							(value) => this.change(field, value, true),
						);
					}
				});
			}
			if (!writable) queueMicrotask(() => { setting.setDisabled(true); });
		}
		this.formEl.ownerDocument.defaultView?.requestAnimationFrame(() => {
			if (!this.formEl.isConnected) return;
			this.formEl.scrollTop = scrollTop;
			if (!focus) return;
			this.formEl.querySelector<HTMLInputElement>(
				`.mbv-card-property-list-row[data-field="${focus.field}"]` +
				`[data-index="${focus.index}"] input`,
			)?.focus();
		});
	}

	private change(
		field: CardPropertyEditorField<Options>,
		value: CardPropertyDraftValue,
		immediate = false,
	): void {
		this.draft.set(field.id, value);
		this.updatePreview();
		this.markForSave(field.id, this.formEl, immediate);
	}

	private serialize(field: CardPropertyEditorField<Options>): unknown {
		const value = this.draft.get(field.id);
		const kind = this.kind(field);
		if (kind === 'boolean') return Boolean(value);
		if (kind === 'list') {
			const values = (Array.isArray(value) ? value : [String(value ?? '')])
				.map((item) => item.trim())
				.filter(Boolean);
			return values.length ? values : undefined;
		}
		const text = String(value ?? '').trim();
		if (!text) return undefined;
		if (kind === 'number') {
			const number = Number(text);
			if (!Number.isFinite(number)) throw new Error(`${field.name}必须是数字.`);
			return number;
		}
		if (kind === 'reading-status') return readReadingStatus(text);
		if (kind === 'select') return field.normalize?.(text) ?? text;
		return text;
	}

	private updatePreview(): void {
		this.preview?.update(this.previewEntry());
	}

	private previewEntry(): BasesEntry {
		return {
			file: this.context.entry.file,
			getValue: (property) => this.previewValue(property),
		};
	}

	private previewValue(property: BasesPropertyId): Value | null {
		for (const field of this.definition.fields) {
			if (field.property(this.context.options) !== property) continue;
			try {
				return toBasesValue(this.serialize(field));
			} catch {
				return toBasesValue(this.draft.get(field.id));
			}
		}
		return this.context.entry.getValue(property);
	}

	private kind(field: CardPropertyEditorField<Options>): CardPropertyFieldKind {
		return this.resolvedKinds.get(field.id) ?? field.kind ?? 'text';
	}

	private listValue(
		field: CardPropertyEditorField<Options>,
		ensureRow = true,
	): string[] {
		const value = this.draft.get(field.id);
		if (Array.isArray(value)) return value.length || !ensureRow ? value : [''];
		const text = String(value ?? '').trim();
		return text ? [text] : ensureRow ? [''] : [];
	}

	private isWritable(field: CardPropertyEditorField<Options>): boolean {
		const propertyId = field.property(this.context.options);
		return Boolean(
			field.filenameFallback && !propertyId || writablePropertyName(propertyId),
		);
	}

	private field(id: string): CardPropertyEditorField<Options> | undefined {
		return this.definition.fields.find((field) => field.id === id);
	}
}

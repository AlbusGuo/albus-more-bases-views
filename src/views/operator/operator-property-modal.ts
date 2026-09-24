import {
	ListValue,
	Notice,
	Setting,
	StringValue,
	parsePropertyId,
	type BasesEntry,
	type BasesPropertyId,
	type TFile,
	type Value,
} from 'obsidian';
import { ViewIsolatedModal } from '../../ui/view-isolated-modal';
import { listVaultImages } from '../../ui/vault-image-suggest';
import type { OperatorCardContext, OperatorCardController } from './operator-card';
import { OPERATOR_BADGE_SWITCH_INTERVAL_MS } from './operator-constants';
import {
	OperatorPropertyListControl,
	type OperatorListField,
} from './operator-property-list-control';

type OperatorField = 'artwork' | 'hiddenArtwork' | 'name' | 'code' | 'profession' | 'rarity' | 'faction';
type OperatorOptionKey = 'artworkProperty' | 'hiddenArtworkProperty' | 'nameProperty' | 'codeProperty'
	| 'professionProperty' | 'rarityProperty' | 'factionProperty';
type OperatorCardFactory = (context: OperatorCardContext) => OperatorCardController;

const FIELD_OPTIONS: Readonly<Record<OperatorField, OperatorOptionKey>> = {
	artwork: 'artworkProperty', hiddenArtwork: 'hiddenArtworkProperty', name: 'nameProperty', code: 'codeProperty',
	profession: 'professionProperty', rarity: 'rarityProperty', faction: 'factionProperty',
};
const POSITION_OPTIONS = ['artworkPositionProperty', 'hiddenArtworkPositionProperty', 'defaultArtworkProperty'] as const;

interface OperatorDraft {
	artwork: string[];
	hiddenArtwork: string[];
	name: string;
	code: string;
	profession: string[];
	rarity: string;
	faction: string[];
}

interface ListFocusTarget {
	field: OperatorListField;
	index: number;
}

export class OperatorPropertyModal extends ViewIsolatedModal {
	private readonly original = new Map<string, unknown>();
	private readonly dirty = new Set<OperatorField>();
	private imageFiles: TFile[] = [];
	private listControl!: OperatorPropertyListControl;
	private formEl!: HTMLElement;
	private previewEl!: HTMLElement;
	private preview: OperatorCardController | null = null;
	private badgeSwitchTimer: number | null = null;
	private badgeSequence = 0;
	private draft!: OperatorDraft;
	private readonly hiddenMode: boolean;
	private saveTimer: number | null = null;
	private saveChain: Promise<void> = Promise.resolve();
	private closed = false;

	constructor(private readonly context: OperatorCardContext, private readonly createCard: OperatorCardFactory) {
		super(context.app); this.hiddenMode = context.hiddenMode;
	}

	onOpen(): void {
		this.closed = false; this.setTitle('编辑干员'); this.modalEl.addClass('mbv-operator-property-modal');
		this.contentEl.addClass('mbv-operator-property-editor'); this.imageFiles = listVaultImages(this.app); this.load();
		this.listControl = new OperatorPropertyListControl(this.app, this.imageFiles);
		this.previewEl = this.contentEl.createDiv('mbv-operator-property-preview');
		this.formEl = this.contentEl.createDiv('mbv-operator-property-form');
		this.preview = this.createCard(this.previewContext()); this.previewEl.append(this.preview.element);
		this.preview.setArtworkWidth(210); this.preview.attach(); this.startBadgeSwitching(); this.renderForm();
	}

	onClose(): void {
		this.closed = true; this.stopBadgeSwitching(); this.listControl.destroy(); this.preview?.destroy(); this.preview = null;
		this.imageFiles = []; this.contentEl.empty();
		void this.flushSave().finally(() => { this.original.clear(); this.dirty.clear(); });
	}

	private load(): void {
		const source = this.frontmatter();
		const raw = (field: OperatorField): unknown => {
			const property = this.writableProperty(field);
			if (property && !this.original.has(property)) this.original.set(property, structuredClone(source?.[property]));
			return property ? source?.[property] : this.readEntryValue(this.propertyId(field));
		};
		this.draft = {
			artwork: readImageList(raw('artwork')), hiddenArtwork: readImageList(raw('hiddenArtwork')),
			name: valueText(raw('name')), code: valueText(raw('code')),
			profession: readChoiceList(raw('profession')), rarity: readRarity(raw('rarity')),
			faction: readChoiceList(raw('faction')),
		};
	}

	private renderForm(focus?: ListFocusTarget): void {
		const scroll = this.formEl.scrollTop; this.listControl.reset(); this.formEl.empty();
		if (this.hiddenMode) this.addImageList('hiddenArtwork', '隐藏立绘');
		else this.addImageList('artwork', '普通立绘');
		this.addText('name', '姓名', '文本'); this.addText('code', '代号', '文本');
		this.addProfessionList();
		this.setting('rarity', '星级', '1-7').addDropdown((dropdown) => {
			for (let rarity = 1; rarity <= 7; rarity++) dropdown.addOption(String(rarity), String(rarity));
			dropdown.setValue(this.draft.rarity).onChange((value) => { this.draft.rarity = value; this.mark('rarity', true); });
		});
		this.addFactionList();
		this.restoreFormState(scroll, focus);
	}

	private addText(field: 'name' | 'code',
		name: string, description: string): void {
		this.setting(field, name, description).addText((input) => input.setValue(this.draft[field])
			.onChange((value) => { this.draft[field] = value; this.mark(field); }));
	}

	private addImageList(field: 'artwork' | 'hiddenArtwork', name: string): void {
		this.listControl.renderImageList(
			this.setting(field, name, '图片双链'),
			{
				field, name, values: this.draft[field],
				writable: this.writableProperty(field) !== null,
				onChange: (index, value, immediate) => {
					this.draft[field][index] = value; this.mark(field, immediate);
				},
				onRemove: (index) => {
					this.draft[field].splice(index, 1); this.mark(field, true); this.renderForm();
				},
				onAdd: () => {
					this.draft[field].push('');
					this.renderForm({ field, index: this.draft[field].length - 1 });
				},
			},
		);
	}

	private addProfessionList(): void {
		const field = 'profession' as const;
		this.listControl.renderProfessionList(
			this.setting(field, '职业', '主职业/分支'),
			{
				field, name: '职业', values: this.draft.profession,
				onChange: (index, value) => {
					this.draft.profession[index] = value; this.mark(field, true);
					this.renderForm({ field, index });
				},
				onRemove: (index) => {
					this.draft.profession.splice(index, 1); this.mark(field, true); this.renderForm();
				},
				onAdd: () => {
					this.draft.profession.push('先锋');
					this.mark(field, true); this.renderForm({ field, index: this.draft.profession.length - 1 });
				},
			},
		);
	}

	private addFactionList(): void {
		const field = 'faction' as const;
		this.listControl.renderFactionList(
			this.setting(field, '阵营', '主阵营/分支'),
			{
				field, name: '阵营', values: this.draft.faction,
				onChange: (index, value) => {
					this.draft.faction[index] = value; this.mark(field, true);
					this.renderForm({ field, index });
				},
				onRemove: (index) => {
					this.draft.faction.splice(index, 1); this.mark(field, true); this.renderForm();
				},
				onAdd: () => {
					this.draft.faction.push('罗德岛');
					this.mark(field, true); this.renderForm({ field, index: this.draft.faction.length - 1 });
				},
			},
		);
	}

	private restoreFormState(scroll: number, focus?: ListFocusTarget): void {
		this.formEl.ownerDocument.defaultView?.requestAnimationFrame(() => {
			if (this.closed) return;
			this.formEl.scrollTop = scroll;
			if (!focus) return;
			this.formEl.querySelector<HTMLElement>(
				`.mbv-operator-property-list-row[data-field="${focus.field}"][data-index="${focus.index}"] input, ` +
				`.mbv-operator-property-list-row[data-field="${focus.field}"][data-index="${focus.index}"] select`,
			)?.focus();
		});
	}

	private setting(field: OperatorField, name: string, description: string): Setting {
		const writable = this.writableProperty(field) !== null;
		const setting = new Setting(this.formEl).setName(name).setDesc(writable ? description : `${description}, 未映射`)
			.setClass(`mbv-operator-property-${field}`);
		if (!writable) queueMicrotask(() => { setting.setDisabled(true); });
		return setting;
	}

	private mark(field: OperatorField, immediate = false): void {
		this.dirty.add(field); this.updatePreview();
		if (immediate) { this.enqueueSave(); return; }
		const ownerWindow = this.formEl.ownerDocument.defaultView ?? window;
		if (this.saveTimer !== null) ownerWindow.clearTimeout(this.saveTimer);
		this.saveTimer = ownerWindow.setTimeout(() => { this.saveTimer = null; this.enqueueSave(); }, 250);
	}

	private updatePreview(): void { this.preview?.update(this.previewContext()); }

	private startBadgeSwitching(): void {
		if (this.badgeSwitchTimer !== null) return;
		const ownerWindow = this.previewEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.badgeSwitchTimer = ownerWindow.setInterval(() => {
			if (this.previewEl.ownerDocument.hidden || !this.preview?.element.isConnected) return;
			this.badgeSequence += 1;
			this.preview.syncBadges(this.badgeSequence);
		}, OPERATOR_BADGE_SWITCH_INTERVAL_MS);
	}

	private stopBadgeSwitching(): void {
		if (this.badgeSwitchTimer === null) return;
		this.previewEl.ownerDocument.defaultView?.clearInterval(
			this.badgeSwitchTimer,
		);
		this.badgeSwitchTimer = null;
	}

	private previewContext(): OperatorCardContext {
		return {
			...this.context, ownerEl: this.previewEl, entry: this.previewEntry(), hiddenMode: this.hiddenMode,
			artworkWidth: 210,
			contextMenuEnabled: false,
			entryOpenEnabled: false,
			pointerMotionEnabled: false,
			badgeCyclePausesOnInteraction: false,
		};
	}

	private previewEntry(): BasesEntry {
		const source = this.context.entry;
		return { file: source.file, getValue: (property: BasesPropertyId) => this.previewValue(property) };
	}

	private previewValue(property: BasesPropertyId): Value | null {
		for (const field of Object.keys(FIELD_OPTIONS) as OperatorField[]) {
			if (this.propertyId(field) === property) return toValue(this.serialize(field));
		}
		for (const option of POSITION_OPTIONS) {
			if (this.context.options[option] !== property) continue;
			return toValue(this.readFrontmatterProperty(property));
		}
		return this.context.entry.getValue(property);
	}

	private enqueueSave(): void {
		if (this.saveTimer !== null) { (this.formEl.ownerDocument.defaultView ?? window).clearTimeout(this.saveTimer); this.saveTimer = null; }
		this.saveChain = this.saveChain.then(() => this.saveDirty()).catch((error: unknown) => {
			new Notice(error instanceof Error ? error.message : '保存干员属性失败.');
		});
	}

	private flushSave(): Promise<void> { this.enqueueSave(); return this.saveChain; }

	private async saveDirty(): Promise<void> {
		const fields = [...this.dirty]; if (!fields.length) return;
		for (const field of fields) this.dirty.delete(field);
		const changes = new Map<string, { before: unknown; after: unknown }>();
		try {
			for (const field of fields) {
				const property = this.writableProperty(field); if (!property) continue;
				const before = this.original.get(property), after = this.serialize(field);
				if (JSON.stringify(before) === JSON.stringify(after)) continue;
				const previous = changes.get(property);
				if (previous && JSON.stringify(previous.after) !== JSON.stringify(after)) throw new Error(`${property} 映射到多个字段, 修改内容存在冲突.`);
				changes.set(property, { before, after });
			}
			if (changes.size) await saveProperties(this.app, this.context.entry.file, changes);
			for (const [property, change] of changes) this.original.set(property, structuredClone(change.after));
		} catch (error) {
			for (const field of fields) this.dirty.add(field); throw error;
		}
	}

	private serialize(field: OperatorField): unknown {
		if (field === 'artwork' || field === 'hiddenArtwork') {
			return serializeList(this.draft[field], false);
		}
		if (field === 'profession' || field === 'faction') {
			return serializeList(this.draft[field], true);
		}
		if (field === 'rarity') return Number(this.draft.rarity);
		return this.draft[field].trim() || undefined;
	}

	private propertyId(field: OperatorField): BasesPropertyId | null { return this.context.options[FIELD_OPTIONS[field]]; }
	private writableProperty(field: OperatorField): string | null {
		const id = this.propertyId(field); if (!id) return null;
		const parsed = parsePropertyId(id); return parsed.type === 'note' ? parsed.name : null;
	}
	private frontmatter(): Record<string, unknown> | undefined {
		return this.app.metadataCache.getFileCache(this.context.entry.file)?.frontmatter;
	}
	private readFrontmatterProperty(id: BasesPropertyId): unknown {
		const parsed = parsePropertyId(id); return parsed.type === 'note' ? this.frontmatter()?.[parsed.name] : undefined;
	}
	private readEntryValue(id: BasesPropertyId | null): unknown { return id ? unwrapValue(this.context.entry.getValue(id)) : undefined; }
}

async function saveProperties(app: OperatorCardContext['app'], file: TFile,
	changes: ReadonlyMap<string, { before: unknown; after: unknown }>): Promise<void> {
	const current = app.vault.getFileByPath(file.path);
	if (!current || current !== file) throw new Error('笔记已移动或删除.');
	await app.fileManager.processFrontMatter(current, (frontmatter) => {
		const record = frontmatter as Record<string, unknown>;
		for (const [property, change] of changes) {
			if (JSON.stringify(record[property]) !== JSON.stringify(change.before)) throw new Error(`${property} 已发生变化, 请重新打开编辑器.`);
		}
		for (const [property, change] of changes) {
			if (change.after === undefined) delete record[property]; else record[property] = change.after;
		}
	});
}

function valueText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return `${value}`;
	return '';
}
function readImageList(value: unknown): string[] {
	const result: string[] = [];
	for (const text of readValueList(value)) {
		const links = [...text.matchAll(/!?\[\[([^\]]+)\]\]/gu)]
			.map((match) => `[[${match[1]}]]`);
		if (links.length) result.push(...links);
		else result.push(text);
	}
	return result;
}
function readChoiceList(value: unknown): string[] {
	return readValueList(value)
		.flatMap((item) => item.split(/[,，、\n]+/u))
		.map((item) => item.trim())
		.filter(Boolean);
}
function readValueList(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(readValueList);
	const text = valueText(value);
	return text ? [text] : [];
}
function serializeList(values: readonly string[], unique: boolean): unknown {
	const filtered = values.map((value) => value.trim()).filter(Boolean);
	const normalized = unique ? [...new Set(filtered)] : filtered;
	if (!normalized.length) return undefined;
	return normalized.length === 1 ? normalized[0] : normalized;
}
function readRarity(value: unknown): string {
	const rarity = Number(valueText(value)); return String(Number.isFinite(rarity) ? Math.min(7, Math.max(1, Math.round(rarity))) : 1);
}
function unwrapValue(value: Value | null): unknown {
	if (!value) return undefined;
	if (value instanceof ListValue) return Array.from({ length: value.length() }, (_, index) => unwrapValue(value.get(index)));
	return value.toString();
}
function toValue(value: unknown): Value | null {
	if (value === undefined || value === null) return null;
	if (Array.isArray(value)) return new ListValue(value.map((item) => new StringValue(valueText(item))));
	return new StringValue(valueText(value));
}

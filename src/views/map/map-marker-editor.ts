import {
	ColorComponent,
	Notice,
	parsePropertyId,
	setIcon,
	type App,
	type BasesPropertyId,
	type HexString,
	type TFile,
} from 'obsidian';
import type { IconService } from '../../services/icon-service';

export interface MapMarkerPropertyTarget {
	file: TFile;
	property: BasesPropertyId;
	value: string;
}

interface EditorCallbacks {
	onClose: () => void;
}

const DEFAULT_MARKER_COLOR = '#7c3aed';

export function canEditMapMarkerProperty(
	property: BasesPropertyId | null,
): property is BasesPropertyId {
	return getNotePropertyName(property) !== null;
}

export function createMapMarkerIconEditor(
	containerEl: HTMLElement,
	app: App,
	iconService: IconService,
	target: MapMarkerPropertyTarget,
	suggestedIcons: readonly string[],
	callbacks: EditorCallbacks,
): () => void {
	let value = target.value.trim();
	let dirty = false;
	const editorEl = createEditorShell(containerEl, '图标', callbacks.onClose);
	const pickerRowEl = editorEl.createDiv('mbv-map-icon-picker-row');
	pickerRowEl.createSpan({ text: '自定义图标' });
	const pickerButtonEl = pickerRowEl.createEl('button', {
		cls: 'clickable-icon mbv-map-icon-picker-button',
		attr: { type: 'button', 'aria-label': '选择标记图标' },
	});
	const renderSelection = (): void => {
		iconService.render(pickerButtonEl, value, 'circle-dashed');
	};
	pickerButtonEl.addEventListener('click', () => {
		void iconService.pick(pickerButtonEl, value, (iconName) => {
			value = iconName;
			dirty = true;
			renderSelection();
		});
	});
	let suggestionsEl: HTMLElement | null = null;
	if (suggestedIcons.length > 0) {
		const suggestionsRowEl = editorEl.createDiv('mbv-map-icon-suggestions-row');
		suggestionsRowEl.createSpan({ text: '已有图标' });
		suggestionsEl = suggestionsRowEl.createDiv('mbv-map-icon-suggestions');
	}
	const renderSuggestions = (): void => {
		if (!suggestionsEl) return;
		suggestionsEl.empty();
		for (const icon of suggestedIcons) {
			const buttonEl = suggestionsEl.createEl('button', {
				cls: 'clickable-icon mbv-map-icon-suggestion',
				attr: { type: 'button', 'aria-label': `使用已有图标 ${icon}` },
			});
			if (!iconService.render(buttonEl, icon)) {
				buttonEl.remove();
				continue;
			}
			buttonEl.addEventListener('click', () => {
				value = icon;
				dirty = true;
				renderSelection();
			});
		}
	};
	const releaseIconListener = iconService.onChanged(() => {
		renderSelection();
		renderSuggestions();
	});
	renderSelection();
	renderSuggestions();
	pickerButtonEl.focus();
	return createAutoSaveCleanup(
		editorEl,
		app,
		target,
		() => value,
		() => dirty,
		'保存标记图标失败.',
		() => releaseIconListener(),
	);
}

export function createMapMarkerColorEditor(
	containerEl: HTMLElement,
	app: App,
	target: MapMarkerPropertyTarget,
	suggestedColors: readonly string[],
	callbacks: EditorCallbacks,
): () => void {
	let value = toPickerColor(containerEl.ownerDocument, target.value);
	let dirty = false;
	const editorEl = createEditorShell(containerEl, '颜色', callbacks.onClose);
	const nativePickerEl = editorEl.createDiv('mbv-map-native-color-picker');
	const picker = new ColorComponent(nativePickerEl).setValue(value);
	const pickerInputEl = nativePickerEl.querySelector<HTMLInputElement>(
		'input[type="color"]',
	);
	const pickerRowEl = editorEl.createDiv('mbv-map-color-picker-row');
	pickerRowEl.createSpan({ text: '自定义颜色' });
	const customSwatchEl = createColorSwatch(
		pickerRowEl,
		'选择自定义颜色',
		value,
		() => openNativeColorPicker(pickerInputEl),
	);
	const renderCurrentColor = (): void => {
		customSwatchEl.setCssProps({
			'--mbv-map-swatch-color': value || DEFAULT_MARKER_COLOR,
		});
	};
	if (suggestedColors.length > 0) {
		const suggestionsRowEl = editorEl.createDiv('mbv-map-color-presets-row');
		suggestionsRowEl.createSpan({ text: '已有颜色' });
		const suggestionsEl = suggestionsRowEl.createDiv('mbv-map-color-presets');
		for (const color of suggestedColors) {
			createColorSwatch(suggestionsEl, `使用已有颜色 ${color}`, color, () => {
				value = color;
				dirty = true;
				picker.setValue(toPickerColor(containerEl.ownerDocument, color));
				renderCurrentColor();
			});
		}
	}
	picker.onChange((nextValue) => {
		value = nextValue;
		dirty = true;
		renderCurrentColor();
	});
	renderCurrentColor();
	return createAutoSaveCleanup(
		editorEl,
		app,
		target,
		() => value,
		() => dirty,
		'保存标记颜色失败.',
	);
}

function createAutoSaveCleanup(
	editorEl: HTMLElement,
	app: App,
	target: MapMarkerPropertyTarget,
	getValue: () => string,
	isDirty: () => boolean,
	errorMessage: string,
	beforeRemove?: () => void,
): () => void {
	let closed = false;
	return () => {
		if (closed) return;
		closed = true;
		beforeRemove?.();
		editorEl.remove();
		if (!isDirty()) return;
		const value = getValue();
		void saveProperty(app, target, value).then(() => {
			target.value = value;
		}, () => new Notice(errorMessage));
	};
}

function createColorSwatch(
	containerEl: HTMLElement,
	label: string,
	color: string,
	onClick: () => void,
): HTMLButtonElement {
	const buttonEl = containerEl.createEl('button', {
		cls: 'mbv-map-color-swatch',
		attr: { type: 'button', 'aria-label': label },
	});
	buttonEl.setCssProps({ '--mbv-map-swatch-color': color });
	buttonEl.addEventListener('click', onClick);
	return buttonEl;
}

function openNativeColorPicker(inputEl: HTMLInputElement | null): void {
	if (!inputEl) return;
	try {
		inputEl.showPicker();
	} catch {
		inputEl.click();
	}
}

function createEditorShell(
	containerEl: HTMLElement,
	title: string,
	onClose: () => void,
): HTMLElement {
	const editorEl = containerEl.createDiv('mbv-map-marker-editor');
	const headerEl = editorEl.createDiv('mbv-map-marker-editor-header');
	headerEl.createSpan({ cls: 'mbv-map-marker-editor-title', text: title });
	const closeButtonEl = headerEl.createEl('button', {
		cls: 'clickable-icon',
		attr: { type: 'button', 'aria-label': '关闭编辑器' },
	});
	setIcon(closeButtonEl, 'x');
	closeButtonEl.addEventListener('click', onClose);
	return editorEl;
}

async function saveProperty(
	app: App,
	target: MapMarkerPropertyTarget,
	value: string,
): Promise<void> {
	const property = getNotePropertyName(target.property);
	if (!property) throw new Error('Property is not writable.');
	await app.fileManager.processFrontMatter(target.file, (frontmatter) => {
		const writable = frontmatter as Record<string, unknown>;
		if (value) writable[property] = value;
		else delete writable[property];
	});
}

function getNotePropertyName(property: BasesPropertyId | null): string | null {
	if (!property) return null;
	const parsed = parsePropertyId(property);
	return parsed.type === 'note' && parsed.name.trim() ? parsed.name : null;
}

function toPickerColor(ownerDocument: Document, value: string): HexString {
	if (/^#[\da-f]{6}$/iu.test(value)) return value;
	const canvas = ownerDocument.createElement('canvas');
	const context = canvas.getContext('2d');
	if (!context) return DEFAULT_MARKER_COLOR;
	context.fillStyle = DEFAULT_MARKER_COLOR;
	context.fillStyle = value;
	const normalized = context.fillStyle;
	return /^#[\da-f]{6}$/iu.test(normalized)
		? normalized
		: DEFAULT_MARKER_COLOR;
}

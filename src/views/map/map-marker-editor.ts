import {
	ButtonComponent,
	ColorComponent,
	Notice,
	SearchComponent,
	getIconIds,
	parsePropertyId,
	setIcon,
	type App,
	type BasesPropertyId,
	type HexString,
	type TFile,
} from 'obsidian';

export interface MapMarkerPropertyTarget {
	file: TFile;
	property: BasesPropertyId;
	value: string;
}

interface EditorCallbacks {
	onClose: () => void;
	onSaved: () => void;
}

const DEFAULT_MARKER_COLOR = '#7c3aed';
const ICON_BATCH_SIZE = 180;
const COLOR_PRESETS: readonly { name: string; value: HexString }[] = [
	{ name: '红色', value: '#e03131' },
	{ name: '橙色', value: '#e8590c' },
	{ name: '黄色', value: '#f59f00' },
	{ name: '绿色', value: '#2f9e44' },
	{ name: '青色', value: '#0ca678' },
	{ name: '蓝色', value: '#1971c2' },
	{ name: '紫色', value: '#7c3aed' },
	{ name: '粉色', value: '#d6336c' },
	{ name: '灰色', value: '#495057' },
];

export function canEditMapMarkerProperty(
	property: BasesPropertyId | null,
): property is BasesPropertyId {
	return getNotePropertyName(property) !== null;
}

export function createMapMarkerIconEditor(
	containerEl: HTMLElement,
	app: App,
	target: MapMarkerPropertyTarget,
	callbacks: EditorCallbacks,
): () => void {
	const iconIds = getIconIds().map(String).sort((left, right) =>
		left.localeCompare(right),
	);
	const iconIdSet = new Set(iconIds);
	const initialValue = target.value.trim();
	let value = iconIdSet.has(initialValue)
		? initialValue
		: iconIdSet.has(`lucide-${initialValue}`) ? `lucide-${initialValue}` : initialValue;
	let saving = false;
	const editorEl = createEditorShell(containerEl, '图标', callbacks.onClose);
	const selectionEl = editorEl.createDiv('mbv-map-icon-picker-selection');
	const previewEl = selectionEl.createSpan('mbv-map-marker-editor-icon-preview');
	const selectionNameEl = selectionEl.createSpan('mbv-map-icon-picker-selection-name');
	const renderSelection = (): void => {
		previewEl.empty();
		if (value) setIcon(previewEl, value);
		selectionNameEl.setText(value || '默认图标');
	};
	const searchWrapEl = editorEl.createDiv('mbv-map-icon-picker-search');
	const search = new SearchComponent(searchWrapEl)
		.setPlaceholder('搜索图标');
	const gridEl = editorEl.createDiv('mbv-map-icon-picker-grid');
	let filteredIcons: readonly string[] = iconIds;
	let renderedCount = 0;
	let selectedButtonEl: HTMLButtonElement | null = null;
	const renderNextBatch = (): void => {
		const nextIcons = filteredIcons.slice(
			renderedCount,
			renderedCount + ICON_BATCH_SIZE,
		);
		for (const icon of nextIcons) {
			const buttonEl = gridEl.createEl('button', {
				cls: 'clickable-icon mbv-map-icon-picker-item',
				attr: { type: 'button', 'aria-label': icon },
			});
			setIcon(buttonEl, icon);
			if (icon === value) {
				buttonEl.addClass('is-selected');
				selectedButtonEl = buttonEl;
			}
			buttonEl.addEventListener('click', () => {
				selectedButtonEl?.removeClass('is-selected');
				value = icon;
				selectedButtonEl = buttonEl;
				buttonEl.addClass('is-selected');
				renderSelection();
			});
		}
		renderedCount += nextIcons.length;
	};
	const filterIcons = (query: string): void => {
		const normalized = query.trim().toLowerCase();
		filteredIcons = normalized
			? iconIds.filter((icon) => icon.toLowerCase().includes(normalized))
			: iconIds;
		gridEl.empty();
		renderedCount = 0;
		selectedButtonEl = null;
		renderNextBatch();
	};
	search.onChange(filterIcons);
	gridEl.addEventListener('scroll', () => {
		if (gridEl.scrollTop + gridEl.clientHeight < gridEl.scrollHeight - 48) return;
		renderNextBatch();
	});
	const actionsEl = editorEl.createDiv('mbv-map-marker-editor-actions');
	new ButtonComponent(actionsEl)
		.setButtonText('清除')
		.onClick(() => {
			value = '';
			selectedButtonEl?.removeClass('is-selected');
			selectedButtonEl = null;
			renderSelection();
		});
	const saveButton = new ButtonComponent(actionsEl)
		.setCta()
		.setButtonText('保存')
		.onClick(() => {
			if (saving) return;
			if (value && !iconIdSet.has(value)) {
				new Notice('请选择有效的 Obsidian 图标.');
				return;
			}
			saving = true;
			saveButton.setDisabled(true);
			void saveProperty(app, target, value).then(() => {
				target.value = value;
				saving = false;
				saveButton.setDisabled(false);
				callbacks.onSaved();
			}, () => {
				new Notice('保存标记图标失败.');
				saving = false;
				saveButton.setDisabled(false);
			});
		});
	renderSelection();
	renderNextBatch();
	search.inputEl.focus();
	return () => editorEl.remove();
}

export function createMapMarkerColorEditor(
	containerEl: HTMLElement,
	app: App,
	target: MapMarkerPropertyTarget,
	callbacks: EditorCallbacks,
): () => void {
	let value = toPickerColor(containerEl.ownerDocument, target.value);
	let saving = false;
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
	const presetsRowEl = editorEl.createDiv('mbv-map-color-presets-row');
	presetsRowEl.createSpan({ text: '预设颜色' });
	const presetsEl = presetsRowEl.createDiv('mbv-map-color-presets');
	const renderCurrentColor = (): void => {
		customSwatchEl.setCssProps({
			'--mbv-map-swatch-color': value || DEFAULT_MARKER_COLOR,
		});
	};
	for (const preset of COLOR_PRESETS) {
		createColorSwatch(presetsEl, preset.name, preset.value, () => {
			value = preset.value;
			picker.setValue(preset.value);
			renderCurrentColor();
		});
	}
	picker.onChange((nextValue) => {
		value = nextValue;
		renderCurrentColor();
	});
	const actionsEl = editorEl.createDiv('mbv-map-marker-editor-actions');
	new ButtonComponent(actionsEl)
		.setButtonText('清除')
		.onClick(() => {
			value = '';
			picker.setValue(DEFAULT_MARKER_COLOR);
			renderCurrentColor();
		});
	const saveButton = new ButtonComponent(actionsEl)
		.setCta()
		.setButtonText('保存')
		.onClick(() => {
			if (saving) return;
			saving = true;
			saveButton.setDisabled(true);
			void saveProperty(app, target, value).then(() => {
				target.value = value;
				saving = false;
				saveButton.setDisabled(false);
				callbacks.onSaved();
			}, () => {
				new Notice('保存标记颜色失败.');
				saving = false;
				saveButton.setDisabled(false);
			});
		});
	renderCurrentColor();
	return () => editorEl.remove();
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

import { setIcon, type App, type Setting, type TFile } from 'obsidian';
import { TextValueSuggest } from '../../ui/text-value-suggest';
import { VaultImageSuggest } from '../../ui/vault-image-suggest';
import { VaultMarkdownSuggest } from '../../ui/vault-markdown-suggest';

export class CardPropertySuggestions {
	private items: Array<{ close: () => void }> = [];

	constructor(private readonly app: App) {}

	reset(): void {
		for (const item of this.items) item.close();
		this.items = [];
	}

	addValues(
		inputEl: HTMLInputElement,
		values: readonly string[],
		onChoose: (value: string) => void,
	): void {
		if (!values.length) return;
		this.items.push(new TextValueSuggest(this.app, inputEl, values, onChoose));
	}

	addImages(
		inputEl: HTMLInputElement,
		files: readonly TFile[],
		onChoose: (value: string) => void,
	): void {
		this.items.push(new VaultImageSuggest(this.app, inputEl, files, onChoose));
	}

	addMarkdownFiles(
		inputEl: HTMLInputElement,
		files: readonly TFile[],
		onChoose: (value: string) => void,
	): void {
		this.items.push(new VaultMarkdownSuggest(this.app, inputEl, files, onChoose));
	}
}

interface CardPropertyListOptions {
	fieldId: string;
	name: string;
	placeholder: string;
	values: readonly string[];
	writable: boolean;
	imageFiles?: readonly TFile[];
	pdfFiles?: readonly TFile[];
	suggestionValues: readonly string[];
	onChange: (index: number, value: string, immediate: boolean) => void;
	onRemove: (index: number) => void;
	onAdd: () => void;
}

export function renderCardPropertyList(
	setting: Setting,
	suggestions: CardPropertySuggestions,
	options: CardPropertyListOptions,
): void {
	const listEl = setting.controlEl.createDiv('mbv-card-property-list');
	options.values.forEach((value, index) => {
		const rowEl = listEl.createDiv({
			cls: 'mbv-card-property-list-row',
			attr: { 'data-field': options.fieldId, 'data-index': String(index) },
		});
		const inputEl = rowEl.createEl('input', {
			type: 'text',
			attr: {
				placeholder: options.placeholder,
				'aria-label': `${options.name} ${index + 1}`,
			},
		});
		inputEl.value = value;
		inputEl.addEventListener('input', () => {
			options.onChange(index, inputEl.value, false);
		});
		if (options.writable) {
			const choose = (next: string): void => options.onChange(index, next, true);
			if (options.imageFiles) suggestions.addImages(inputEl, options.imageFiles, choose);
			else if (options.pdfFiles) {
				suggestions.addMarkdownFiles(inputEl, options.pdfFiles, choose);
			} else suggestions.addValues(inputEl, options.suggestionValues, choose);
		}
		addIconButton(rowEl, `删除${options.name}`, 'trash-2', () => options.onRemove(index));
	});
	addIconButton(
		listEl,
		`添加${options.name}`,
		'plus',
		options.onAdd,
		'mbv-card-property-list-add',
	);
}

function addIconButton(
	parentEl: HTMLElement,
	label: string,
	icon: string,
	onClick: () => void,
	className = '',
): void {
	const buttonEl = parentEl.createEl('button', {
		cls: `clickable-icon mbv-card-property-list-button ${className}`,
		attr: { type: 'button', 'aria-label': label },
	});
	setIcon(buttonEl, icon);
	buttonEl.addEventListener('click', onClick);
}

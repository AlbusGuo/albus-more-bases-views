import {
	DropdownComponent,
	setIcon,
	type App,
	type Setting,
	type TFile,
} from 'obsidian';
import { VaultImageSuggest } from '../../ui/vault-image-suggest';
import {
	getOperatorMainFaction,
	getOperatorMainProfession,
	OPERATOR_FACTION_BRANCH_VALUES,
	OPERATOR_MAIN_FACTION_VALUES,
	OPERATOR_MAIN_PROFESSION_VALUES,
	OPERATOR_PROFESSION_BRANCH_VALUES,
} from './operator-assets';

export type OperatorListField = 'artwork' | 'hiddenArtwork' | 'profession' | 'faction';

interface ListControlOptions {
	field: OperatorListField;
	name: string;
	values: readonly string[];
	onChange: (index: number, value: string, immediate: boolean) => void;
	onRemove: (index: number) => void;
	onAdd: () => void;
}

interface ImageListControlOptions extends ListControlOptions {
	writable: boolean;
}

interface HierarchicalChoiceOptions {
	mainValues: readonly string[];
	branchValues: Readonly<Record<string, readonly string[]>>;
	resolveMain: (value: string) => string;
	mainLabel: string;
	branchLabel: string;
}

export class OperatorPropertyListControl {
	private suggestions: VaultImageSuggest[] = [];

	constructor(
		private readonly app: App,
		private readonly imageFiles: readonly TFile[],
	) {}

	reset(): void {
		for (const suggestion of this.suggestions) suggestion.close();
		this.suggestions = [];
	}

	destroy(): void {
		this.reset();
	}

	renderImageList(
		setting: Setting,
		options: ImageListControlOptions,
	): void {
		const listEl = setting.controlEl.createDiv(
			'mbv-operator-property-list is-image-list',
		);
		options.values.forEach((value, index) => {
			const rowEl = this.createRow(listEl, options.field, index);
			const inputEl = rowEl.createEl('input', {
				type: 'text',
				attr: {
					placeholder: '双链',
					spellcheck: 'false',
					'aria-label': `${options.name} ${index + 1}`,
				},
			});
			inputEl.value = value;
			inputEl.addEventListener('input', () => {
				options.onChange(index, inputEl.value, false);
			});
			if (options.writable) {
				this.suggestions.push(new VaultImageSuggest(
					this.app,
					inputEl,
					this.imageFiles,
					(link) => options.onChange(index, link, true),
				));
			}
			this.addIconButton(
				rowEl,
				`删除${options.name}`,
				'x',
				() => options.onRemove(index),
			);
		});
		this.addIconButton(
			listEl,
			`添加${options.name}`,
			'plus',
			options.onAdd,
			'mbv-operator-property-list-add',
		);
	}

	renderProfessionList(
		setting: Setting,
		options: ListControlOptions,
	): void {
		this.renderHierarchicalChoiceList(setting, options, {
			mainValues: OPERATOR_MAIN_PROFESSION_VALUES,
			branchValues: OPERATOR_PROFESSION_BRANCH_VALUES,
			resolveMain: getOperatorMainProfession,
			mainLabel: '主职业',
			branchLabel: '分支',
		});
	}

	renderFactionList(
		setting: Setting,
		options: ListControlOptions,
	): void {
		this.renderHierarchicalChoiceList(setting, options, {
			mainValues: OPERATOR_MAIN_FACTION_VALUES,
			branchValues: OPERATOR_FACTION_BRANCH_VALUES,
			resolveMain: getOperatorMainFaction,
			mainLabel: '主阵营',
			branchLabel: '分支',
		});
	}

	private renderHierarchicalChoiceList(
		setting: Setting,
		options: ListControlOptions,
		hierarchy: HierarchicalChoiceOptions,
	): void {
		const listEl = setting.controlEl.createDiv(
			'mbv-operator-property-list is-choice-list is-hierarchical-list',
		);
		options.values.forEach((value, index) => {
			const rowEl = this.createRow(listEl, options.field, index);
			const main = hierarchy.resolveMain(value);
			const mainDropdown = new DropdownComponent(rowEl);
			if (main && !hierarchy.mainValues.includes(main)) {
				mainDropdown.addOption(main, main);
			}
			for (const option of hierarchy.mainValues) mainDropdown.addOption(option, option);
			mainDropdown.setValue(main).onChange((nextMain) => options.onChange(index, nextMain, true));
			mainDropdown.selectEl.setAttribute('aria-label', `${options.name}${hierarchy.mainLabel} ${index + 1}`);

			const branches = hierarchy.branchValues[main] ?? [];
			const branch = main === value ? '' : value;
			const branchDropdown = new DropdownComponent(rowEl).addOption('', '无');
			if (branch && !branches.includes(branch)) branchDropdown.addOption(branch, branch);
			for (const option of branches) branchDropdown.addOption(option, option);
			branchDropdown.setValue(branch).onChange((nextBranch) => options.onChange(index, nextBranch || main, true));
			branchDropdown.selectEl.setAttribute('aria-label', `${options.name}${hierarchy.branchLabel} ${index + 1}`);
			this.addIconButton(rowEl, `删除${options.name}`, 'x', () => options.onRemove(index));
		});
		this.addIconButton(listEl, `添加${options.name}`, 'plus', options.onAdd, 'mbv-operator-property-list-add');
	}

	private createRow(
		parentEl: HTMLElement,
		field: OperatorListField,
		index: number,
	): HTMLElement {
		return parentEl.createDiv({
			cls: 'mbv-operator-property-list-row',
			attr: { 'data-field': field, 'data-index': String(index) },
		});
	}

	private addIconButton(
		parentEl: HTMLElement,
		label: string,
		icon: string,
		onClick: () => void,
		className = '',
	): void {
		const buttonEl = parentEl.createEl('button', {
			cls: `clickable-icon mbv-operator-property-list-button ${className}`,
			attr: { type: 'button', 'aria-label': label },
		});
		setIcon(buttonEl, icon);
		buttonEl.addEventListener('click', onClick);
	}
}

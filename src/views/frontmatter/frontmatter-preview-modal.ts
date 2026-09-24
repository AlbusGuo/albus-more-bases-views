import { Modal, Setting, setIcon, type App } from 'obsidian';
import {
	getBatchActionLabel,
	type FrontmatterBatchPlan,
} from './frontmatter-batch';

export class FrontmatterPreviewModal extends Modal {
	private confirmed = false;

	constructor(
		app: App,
		private readonly plan: FrontmatterBatchPlan,
		private readonly onConfirm: () => void,
	) {
		super(app);
		this.setTitle('确认批量修改');
	}

	onOpen(): void {
		this.modalEl.addClass('mbv-frontmatter-preview-modal');
		this.contentEl.empty();
		const summaryEl = this.contentEl.createDiv('mbv-frontmatter-preview-summary');
		const isTypeConversion = this.plan.operation.action === 'rename' &&
			this.plan.operation.property.toLocaleLowerCase() ===
				this.plan.operation.newProperty.toLocaleLowerCase();
		const conflictCount = this.plan.conflicts.length + this.plan.typeConflicts.length;
		const hasExplicitType = 'propertyType' in this.plan.operation &&
			this.plan.operation.propertyType !== undefined;
		const canExecute = this.plan.typeConflicts.length === 0 && (
			this.plan.changes.length > 0 ||
			(hasExplicitType && this.plan.matchedProperties > 0 && this.plan.conflicts.length === 0)
		);
		createSummaryItem(
			summaryEl,
			'操作',
			isTypeConversion ? '调整属性类型' : getBatchActionLabel(this.plan.operation.action),
		);
		createSummaryItem(summaryEl, '当前结果', String(this.plan.totalFiles));
		createSummaryItem(summaryEl, '将修改', String(this.plan.changes.length), true);
		createSummaryItem(summaryEl, '无变化', String(this.plan.skipped));
		createSummaryItem(summaryEl, '冲突', String(conflictCount));

		const listEl = this.contentEl.createDiv('mbv-frontmatter-preview-list');
		for (const change of this.plan.changes.slice(0, 50)) {
			const rowEl = listEl.createDiv('mbv-frontmatter-preview-row');
			const iconEl = rowEl.createSpan('mbv-frontmatter-preview-icon');
			setIcon(iconEl, 'file-text');
			rowEl.createSpan({ cls: 'mbv-frontmatter-preview-path', text: change.filePath });
			rowEl.createSpan({ cls: 'mbv-frontmatter-preview-description', text: change.description });
		}
		if (this.plan.changes.length > 50) {
			listEl.createDiv({
				cls: 'mbv-frontmatter-preview-more',
				text: `另有 ${this.plan.changes.length - 50} 个文件未在预览中展开`,
			});
		}
		const conflicts = [
			...this.plan.typeConflicts.map((conflict) => ({ ...conflict, typeConflict: true })),
			...this.plan.conflicts.map((conflict) => ({ ...conflict, typeConflict: false })),
		];
		for (const conflict of conflicts.slice(0, 50)) {
			const rowEl = listEl.createDiv(
				`mbv-frontmatter-preview-row is-conflict${conflict.typeConflict ? ' is-blocking' : ''}`,
			);
			const iconEl = rowEl.createSpan('mbv-frontmatter-preview-icon');
			setIcon(iconEl, conflict.typeConflict ? 'shield-alert' : 'triangle-alert');
			rowEl.createSpan({ cls: 'mbv-frontmatter-preview-path', text: conflict.file.path });
			rowEl.createSpan({ cls: 'mbv-frontmatter-preview-description', text: conflict.reason });
		}
		if (conflicts.length > 50) {
			listEl.createDiv({
				cls: 'mbv-frontmatter-preview-more',
				text: `另有 ${conflicts.length - 50} 个冲突未展开`,
			});
		}
		const actions = new Setting(this.contentEl);
		actions.settingEl.addClass('mbv-frontmatter-preview-actions');
		actions.addButton((button) => button
			.setButtonText('取消')
			.onClick(() => this.close()));
		actions.addButton((button) => button
			.setWarning()
			.setButtonText(
				isTypeConversion && this.plan.changes.length === 0
					? '更新属性类型'
					: `修改 ${this.plan.changes.length} 个文件`,
			)
			.setDisabled(!canExecute)
			.onClick(() => {
				if (this.confirmed) return;
				this.confirmed = true;
				button.setDisabled(true);
				this.close();
				this.onConfirm();
			}));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

function createSummaryItem(
	containerEl: HTMLElement,
	label: string,
	value: string,
	accent = false,
): void {
	const itemEl = containerEl.createDiv(
		`mbv-frontmatter-preview-summary-item${accent ? ' is-accent' : ''}`,
	);
	itemEl.createSpan({ cls: 'mbv-frontmatter-preview-summary-label', text: label });
	itemEl.createSpan({ cls: 'mbv-frontmatter-preview-summary-value', text: value });
}

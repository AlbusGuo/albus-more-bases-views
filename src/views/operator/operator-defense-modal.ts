import { Modal, type App } from 'obsidian';

interface OperatorDefenseModalAssets {
	eye: string;
	check: string;
	back: string;
	rhodes: string;
}

export class OperatorDefenseModal extends Modal {
	constructor(
		app: App,
		private readonly assets: OperatorDefenseModalAssets,
		private readonly confirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('mbv-operator-defense-modal');
		this.contentEl.empty();

		const panelEl = this.contentEl.createDiv('mbv-operator-defense-panel');
		if (this.assets.rhodes) {
			panelEl.createEl('img', {
				cls: 'mbv-operator-defense-watermark',
				attr: {
					src: this.assets.rhodes,
					alt: '',
					decoding: 'async',
				},
			});
		}

		const headerEl = panelEl.createDiv('mbv-operator-defense-header');
		const headerIconEl = headerEl.createDiv('mbv-operator-defense-header-icon');
		headerIconEl.createEl('img', {
			attr: {
				src: this.assets.eye,
				alt: '',
				decoding: 'async',
			},
		});
		const headerCopyEl = headerEl.createDiv('mbv-operator-defense-header-copy');
		headerCopyEl.createDiv({
			cls: 'mbv-operator-defense-header-title',
			text: '系统警告',
		});
		headerCopyEl.createDiv({
			cls: 'mbv-operator-defense-header-subtitle',
			text: 'PRTS 系统权限',
		});

		const bodyEl = panelEl.createDiv('mbv-operator-defense-body');
		bodyEl.createDiv({
			cls: 'mbv-operator-defense-warning',
			text: '警告: PRTS 系统权限读写中...',
		});
		bodyEl.createDiv({
			cls: 'mbv-operator-defense-sequence',
			text: '内部序列开始检索, 检索到博士权限.',
		});
		bodyEl.createDiv({
			cls: 'mbv-operator-defense-title',
			text: '是否确认关闭全舰防御系统?',
		});
		const authorityEl = bodyEl.createDiv('mbv-operator-defense-authority');
		const authorityCheckEl = authorityEl.createDiv(
			'mbv-operator-defense-authority-check',
		);
		authorityCheckEl.createEl('img', {
			attr: {
				src: this.assets.check,
				alt: '',
				decoding: 'async',
			},
		});
		authorityEl.createSpan({ text: '博士权限已确认' });

		const actionsEl = panelEl.createDiv('mbv-operator-defense-actions');
		const cancelEl = actionsEl.createEl('button', {
			cls: 'mbv-operator-defense-cancel',
			attr: { type: 'button' },
		});
		cancelEl.createEl('img', {
			attr: { src: this.assets.back, alt: '', decoding: 'async' },
		});
		cancelEl.createSpan({ text: '返回' });
		const confirmEl = actionsEl.createEl('button', {
			cls: 'mbv-operator-defense-confirm',
			attr: { type: 'button' },
		});
		confirmEl.createEl('img', {
			attr: { src: this.assets.check, alt: '', decoding: 'async' },
		});
		confirmEl.createSpan({ text: '确认关闭' });

		cancelEl.addEventListener('click', () => this.close());
		confirmEl.addEventListener('click', () => {
			this.confirm();
			this.close();
		});
		confirmEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		this.modalEl.removeClass('mbv-operator-defense-modal');
	}
}

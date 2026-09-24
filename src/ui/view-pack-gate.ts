import { Notice, setIcon } from 'obsidian';
import {
	ViewPackManager,
	type ViewPackLoadResult,
} from '../services/view-pack-manager';

interface ViewPackGateOptions {
	id: string;
	displayName: string;
	filename: string;
}

export class ViewPackGate {
	private fallbackEl: HTMLElement | null = null;
	private loading = false;
	private disposed = false;
	private ready = false;

	constructor(
		private readonly parentEl: HTMLElement,
		private readonly packs: ViewPackManager,
		private readonly options: ViewPackGateOptions,
		private readonly onReady: () => void,
	) {
		this.renderLoading();
		void this.load();
	}

	get isReady(): boolean {
		return this.ready;
	}

	showUnavailableNotice(): void {
		new Notice(`${this.options.displayName}拓展包尚未加载.`);
	}

	destroy(): void {
		this.disposed = true;
		this.fallbackEl?.remove();
		this.fallbackEl = null;
	}

	private async load(): Promise<void> {
		if (this.loading || this.ready || this.disposed) return;
		this.loading = true;
		this.renderLoading();
		const result = await this.packs.load(this.options.id);
		this.loading = false;
		if (this.disposed) return;
		this.applyLoadResult(result);
	}

	private applyLoadResult(result: ViewPackLoadResult): void {
		if (result.status === 'loaded') {
			this.ready = true;
			this.fallbackEl?.remove();
			this.fallbackEl = null;
			this.onReady();
			return;
		}
		this.renderUnavailable(
			result.status === 'missing'
				? `${this.options.displayName}拓展包未安装`
				: `${this.options.displayName}拓展包无法使用`,
			result.status === 'missing'
				? `导入 ${this.options.filename} 后即可启用完整视图.\n安装位置: ${result.path}`
				: `${result.message}\n文件位置: ${result.path}`,
		);
	}

	private renderLoading(): void {
		const root = this.prepareFallback();
		const iconEl = root.createDiv('mbv-view-pack-icon');
		setIcon(iconEl, 'package-open');
		root.createDiv({
			cls: 'mbv-view-pack-title',
			text: `正在检查${this.options.displayName}拓展包…`,
		});
	}

	private renderUnavailable(title: string, description: string): void {
		const root = this.prepareFallback();
		const iconEl = root.createDiv('mbv-view-pack-icon');
		setIcon(iconEl, 'package-x');
		root.createDiv({ cls: 'mbv-view-pack-title', text: title });
		root.createDiv({ cls: 'mbv-view-pack-description', text: description });
		const actionsEl = root.createDiv('mbv-view-pack-actions');
		const importButton = actionsEl.createEl('button', {
			text: '导入拓展包…',
			cls: 'mod-cta',
		});
		const inputEl = root.createEl('input', {
			type: 'file',
			cls: 'mbv-view-pack-file-input',
			attr: { accept: '.mbvpack' },
		});
		importButton.addEventListener('click', () => inputEl.click());
		inputEl.addEventListener('change', () => {
			const file = inputEl.files?.[0];
			if (!file) return;
			void this.install(file);
		});
		const retryButton = actionsEl.createEl('button', { text: '重新检测' });
		retryButton.addEventListener('click', () => void this.load());
	}

	private async install(file: File): Promise<void> {
		if (this.loading || this.disposed) return;
		this.loading = true;
		this.renderLoading();
		let result: ViewPackLoadResult;
		try {
			result = await this.packs.install(this.options.id, await file.arrayBuffer());
		} catch (error) {
			result = {
				status: 'invalid',
				path: this.packs.getPath(this.options.id),
				message: error instanceof Error ? error.message : '无法读取拓展包.',
			};
		}
		this.loading = false;
		if (this.disposed) return;
		if (result.status === 'loaded') {
			new Notice(`${this.options.displayName}拓展包已安装.`);
		}
		this.applyLoadResult(result);
	}

	private prepareFallback(): HTMLElement {
		this.fallbackEl?.remove();
		const root = this.parentEl.createDiv({
			cls: 'mbv-view-pack-fallback',
			attr: { tabindex: '-1' },
		});
		this.fallbackEl = root;
		return root;
	}
}

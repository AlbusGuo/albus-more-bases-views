import { Notice, type Modal } from 'obsidian';

type CardEditorFactory<Context> = (
	context: Context,
	onClosed: () => void,
) => Modal | Promise<Modal | null> | null;

export class CardEditorHost<Context> {
	private modal: Modal | null = null;
	private request = 0;
	private opening = false;
	private destroyed = false;

	constructor(
		private readonly ownerEl: HTMLElement,
		private readonly factory: CardEditorFactory<Context>,
	) {}

	get isOpen(): boolean {
		return this.opening || this.modal !== null;
	}

	open(context: Context): void {
		const request = ++this.request;
		this.opening = true;
		let created: Modal | null = null;
		const ownerWindow = this.ownerEl.ownerDocument.defaultView ?? window;
		const onClosed = (): void => {
			ownerWindow.setTimeout(() => {
				if (this.modal === created) this.modal = null;
			}, 0);
		};
		void Promise.resolve(this.factory(context, onClosed))
			.then((modal) => {
				created = modal;
				if (!modal || this.destroyed || request !== this.request) return;
				this.modal?.close();
				this.modal = modal;
				modal.open();
			})
			.catch((error: unknown) => {
				new Notice(error instanceof Error ? error.message : '打开卡片编辑器失败.');
			})
			.finally(() => {
				if (request === this.request) this.opening = false;
			});
	}

	destroy(): void {
		this.destroyed = true;
		this.request += 1;
		this.opening = false;
		this.modal?.close();
		this.modal = null;
	}
}

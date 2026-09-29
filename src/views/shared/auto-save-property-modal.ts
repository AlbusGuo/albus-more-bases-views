import { Notice, type App } from 'obsidian';
import { ViewIsolatedModal } from '../../ui/view-isolated-modal';

export abstract class AutoSavePropertyModal<Field extends string>
	extends ViewIsolatedModal {
	protected readonly dirty = new Set<Field>();
	private saveTimer: number | null = null;
	private saveChain: Promise<void> = Promise.resolve();

	protected constructor(
		app: App,
		private readonly saveFailureMessage: string,
	) {
		super(app);
	}

	protected markForSave(
		field: Field,
		ownerEl: HTMLElement,
		immediate = false,
	): void {
		this.dirty.add(field);
		if (immediate) {
			this.enqueueSave(ownerEl);
			return;
		}
		const ownerWindow = ownerEl.ownerDocument.defaultView ?? window;
		if (this.saveTimer !== null) ownerWindow.clearTimeout(this.saveTimer);
		this.saveTimer = ownerWindow.setTimeout(() => {
			this.saveTimer = null;
			this.enqueueSave(ownerEl);
		}, 250);
	}

	protected flushSave(ownerEl: HTMLElement): Promise<void> {
		this.enqueueSave(ownerEl);
		return this.saveChain;
	}

	protected abstract saveDirty(): Promise<void>;

	private enqueueSave(ownerEl: HTMLElement): void {
		if (this.saveTimer !== null) {
			(ownerEl.ownerDocument.defaultView ?? window).clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		this.saveChain = this.saveChain
			.then(() => this.saveDirty())
			.catch((error: unknown) => {
				new Notice(error instanceof Error ? error.message : this.saveFailureMessage);
			});
	}
}

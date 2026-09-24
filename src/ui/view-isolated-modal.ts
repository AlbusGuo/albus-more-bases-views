import { Modal, type App } from 'obsidian';

/**
 * A native Obsidian modal whose focus and wheel lifecycle stays inside the
 * modal instead of feeding back into an expanded card view behind it.
 */
export abstract class ViewIsolatedModal extends Modal {
	constructor(app: App) {
		super(app);
		this.shouldRestoreSelection = false;
		this.modalEl.setAttribute('data-mbv-card-scroll', '');
	}
}

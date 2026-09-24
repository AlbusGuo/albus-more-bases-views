import {
	FileView,
	ItemView,
	MarkdownView,
	Modal,
	Scope,
	type App,
	type EventRef,
	type MarkdownFileInfo,
	type TAbstractFile,
	type TFile,
	WorkspaceLeaf,
} from 'obsidian';

interface ModalWorkspaceLeaf extends WorkspaceLeaf {
	/** Runtime leaf root used to preserve Obsidian's complete file-view chrome. */
	containerEl: HTMLElement;
}

const MODAL_CLASS = 'mbv-file-modal';
const STANDARD_MODAL_CONTAINER_CLASS = 'mbv-settings-modal-container';
const MODAL_LEAF_CLASS = 'mbv-file-modal-leaf';
const MORE_BASES_MODAL_ATTRIBUTE = 'data-albus-more-bases-file-modal';
const RIGHT_MODAL_CONTAINER_CLASS = 'mbv-file-modal-right-container';
const RIGHT_MODAL_CLASS = 'mbv-file-modal-right';
const COMPANION_PLUGIN_IDS = [
	'albus-custom-buttons',
	'albus-floating-toc',
] as const;

export type FileViewModalPlacement = 'center' | 'right';

type WorkspaceLeafConstructor = new (app: App) => ModalWorkspaceLeaf;

interface RuntimePluginRegistry {
	getPlugin(id: string): unknown;
}

interface RuntimeApp extends App {
	plugins?: RuntimePluginRegistry;
}

interface MoreBasesFileModalHandle {
	refresh(): void;
	destroy(): void;
}

interface MoreBasesFileModalApi {
	readonly apiVersion: '1';
	attachMoreBasesFileModal(
		view: MarkdownView,
	): MoreBasesFileModalHandle | null;
}

interface CompanionPluginRuntime {
	api?: Partial<MoreBasesFileModalApi>;
}

function createDetachedWorkspaceLeaf(app: App): ModalWorkspaceLeaf {
	const Leaf = WorkspaceLeaf as unknown as WorkspaceLeafConstructor;
	return new Leaf(app);
}

/** Hosts a real Obsidian WorkspaceLeaf inside Obsidian's native modal stack. */
export class FileViewModal extends Modal {
	private leaf: ModalWorkspaceLeaf | null = null;
	private activeLeafRef: EventRef | null = null;
	private fileOpenRef: EventRef | null = null;
	private fileDeleteRef: EventRef | null = null;
	private readonly viewActionEls: HTMLElement[] = [];
	private openRequestId = 0;
	private closed = true;
	private modalScopeParent: Scope | null = null;
	private nativeModalOpen = false;
	private activeEditorProxy: MarkdownFileInfo | null = null;
	private previousEmbeddedEditor: MarkdownFileInfo | null = null;
	private integrationView: MarkdownView | null = null;
	private readonly companionHandles = new Map<
		string,
		{ api: MoreBasesFileModalApi; handle: MoreBasesFileModalHandle }
	>();

	constructor(
		app: App,
		private readonly onFileChange: (path: string | null) => void = () => undefined,
		private readonly placement: FileViewModalPlacement = 'center',
	) {
		super(app);
		this.shouldRestoreSelection = false;
	}

	async show(file: TFile): Promise<void> {
		if (!this.closed) {
			await this.openFile(file);
			return;
		}

		this.closed = false;
		this.leaf = createDetachedWorkspaceLeaf(this.app);
		this.listenForFileDeletion();
		this.open();

		try {
			await this.openFile(file);
			this.listenForWorkspaceNavigation();
		} catch (error) {
			this.close();
			throw error;
		}
	}

	async openFile(file: TFile): Promise<void> {
		if (!this.leaf) {
			await this.show(file);
			return;
		}
		const requestId = ++this.openRequestId;
		await this.leaf.openFile(file, { active: false });
		if (this.closed || requestId !== this.openRequestId || !this.leaf) return;

		this.mountLeafInModal();
		this.refreshModalLeaf();
	}

	onOpen(): void {
		if (!this.leaf) {
			this.close();
			return;
		}
		this.containerEl.addClass(STANDARD_MODAL_CONTAINER_CLASS);
		this.modalEl.addClass(MODAL_CLASS);
		this.containerEl.classList.toggle(
			RIGHT_MODAL_CONTAINER_CLASS,
			this.placement === 'right',
		);
		this.modalEl.classList.toggle(RIGHT_MODAL_CLASS, this.placement === 'right');
		this.modalEl.setAttribute('data-mbv-card-scroll', '');
		this.modalEl.querySelector<HTMLElement>(':scope > .modal-close-button')?.remove();
		this.nativeModalOpen = true;
		this.leaf.containerEl.addClass(MODAL_LEAF_CLASS);
		this.leaf.containerEl.setAttribute(MORE_BASES_MODAL_ATTRIBUTE, 'true');
		this.contentEl.empty();
		this.mountLeafInModal();
	}

	onClose(): void {
		if (this.closed) return;
		this.closed = true;
		this.openRequestId += 1;
		this.nativeModalOpen = false;
		const leaf = this.leaf;

		this.stopListeningForWorkspaceNavigation();
		this.stopListeningForFileDeletion();
		this.releaseCompanionIntegrations();
		this.removeViewActions();
		this.releaseActiveEditor();
		this.contentEl.empty();
		this.containerEl.removeClass(STANDARD_MODAL_CONTAINER_CLASS);
		this.containerEl.removeClass(RIGHT_MODAL_CONTAINER_CLASS);
		this.modalEl.removeClass(MODAL_CLASS);
		this.modalEl.removeClass(RIGHT_MODAL_CLASS);
		this.modalEl.removeAttribute('data-mbv-card-scroll');
		leaf?.containerEl.removeClass(MODAL_LEAF_CLASS);
		leaf?.containerEl.removeAttribute(MORE_BASES_MODAL_ATTRIBUTE);
		this.onFileChange(null);
		leaf?.detach();

		this.leaf = null;
	}

	destroy(): void {
		if (!this.closed) this.close();
	}

	private mountLeafInModal(): void {
		if (!this.leaf) return;
		if (this.leaf.containerEl.parentElement !== this.contentEl) {
			this.contentEl.appendChild(this.leaf.containerEl);
		}
	}

	private refreshModalLeaf(): void {
		if (this.closed || !this.leaf) return;
		this.mountLeafInModal();
		this.syncActiveEditor();
		this.syncCompanionIntegrations();
		const file = this.getModalFile();
		this.syncModalScope();
		if (file) this.onFileChange(file.path);
		this.registerViewActions();
	}

	private syncActiveEditor(): void {
		const view = this.leaf?.view;
		if (!(view instanceof MarkdownView)) return;
		if (!this.activeEditorProxy) {
			const current = this.app.workspace.activeEditor;
			if (current && !(current instanceof MarkdownView)) {
				this.previousEmbeddedEditor = current;
			}
			this.activeEditorProxy = createActiveEditorProxy(view);
		}
		this.app.workspace.activeEditor = this.activeEditorProxy;
	}

	private releaseActiveEditor(): void {
		if (this.app.workspace.activeEditor === this.activeEditorProxy) {
			this.app.workspace.activeEditor = null;
			if (this.previousEmbeddedEditor) {
				this.app.workspace.activeEditor = this.previousEmbeddedEditor;
			}
		}
		this.activeEditorProxy = null;
		this.previousEmbeddedEditor = null;
	}

	private syncCompanionIntegrations(): void {
		const view = this.leaf?.view;
		if (!(view instanceof MarkdownView)) return;
		if (this.integrationView !== view) {
			this.releaseCompanionIntegrations();
			this.integrationView = view;
		}
		for (const pluginId of COMPANION_PLUGIN_IDS) {
			const api = this.getCompanionApi(pluginId);
			const existing = this.companionHandles.get(pluginId);
			if (existing && existing.api !== api) {
				this.destroyCompanionHandle(pluginId, existing.handle);
			}
			const current = this.companionHandles.get(pluginId);
			if (current) {
				try {
					current.handle.refresh();
				} catch (error) {
					console.warn(`${pluginId} failed to refresh the file modal.`, error);
					this.destroyCompanionHandle(pluginId, current.handle);
				}
				continue;
			}
			if (!api) continue;
			try {
				const handle = api.attachMoreBasesFileModal(view);
				if (handle) this.companionHandles.set(pluginId, { api, handle });
			} catch (error) {
				console.warn(`${pluginId} failed to attach to the file modal.`, error);
			}
		}
	}

	private getCompanionApi(pluginId: string): MoreBasesFileModalApi | null {
		const plugin = (this.app as RuntimeApp).plugins?.getPlugin(pluginId) as
			CompanionPluginRuntime | null | undefined;
		const api = plugin?.api;
		if (
			api?.apiVersion !== '1' ||
			typeof api.attachMoreBasesFileModal !== 'function'
		) return null;
		return api as MoreBasesFileModalApi;
	}

	private releaseCompanionIntegrations(): void {
		for (const [pluginId, registration] of this.companionHandles) {
			this.destroyCompanionHandle(pluginId, registration.handle);
		}
		this.companionHandles.clear();
		this.integrationView = null;
	}

	private destroyCompanionHandle(
		pluginId: string,
		handle: MoreBasesFileModalHandle,
	): void {
		this.companionHandles.delete(pluginId);
		try {
			handle.destroy();
		} catch (error) {
			console.warn(`${pluginId} failed to detach from the file modal.`, error);
		}
	}
	private syncModalScope(): void {
		const parent = this.leaf?.view.scope ?? this.app.scope;
		if (this.modalScopeParent === parent) return;

		if (this.nativeModalOpen) {
			this.app.keymap.popScope(this.scope);
		}
		this.scope = new Scope(parent);
		this.scope.register([], 'Escape', () => {
			this.close();
			return false;
		});
		this.scope.register(['Mod'], 'w', () => {
			this.close();
			return false;
		});
		this.modalScopeParent = parent;
		if (this.nativeModalOpen) {
			this.app.keymap.pushScope(this.scope);
		}
	}
	private registerViewActions(): void {
		this.removeViewActions();
		const view = this.leaf?.view;
		if (!(view instanceof ItemView)) return;
		this.viewActionEls.push(
			view.addAction(
				'square-arrow-out-up-right',
				'在新标签页中打开',
				(event) => {
					event.preventDefault();
					void this.openCurrentFileInNewTab();
				},
			),
		);
	}

	private removeViewActions(): void {
		for (const element of this.viewActionEls) element.remove();
		this.viewActionEls.length = 0;
	}

	private async openCurrentFileInNewTab(): Promise<void> {
		const path = this.getModalFile()?.path;
		if (!path) return;
		this.close();
		await this.app.workspace.openLinkText(path, '', 'tab');
	}

	private getModalFile(): TFile | null {
		const view = this.leaf?.view;
		if (!(view instanceof FileView)) return null;
		const file = view.file;
		return file?.path ? file : null;
	}

	private listenForWorkspaceNavigation(): void {
		if (this.activeLeafRef || this.fileOpenRef) return;
		this.activeLeafRef = this.app.workspace.on('active-leaf-change', () => {
			if (this.closed || !this.leaf) return;
			this.close();
		});
		this.fileOpenRef = this.app.workspace.on('file-open', () => {
			if (!this.closed) this.refreshModalLeaf();
		});
	}

	private stopListeningForWorkspaceNavigation(): void {
		if (this.activeLeafRef) this.app.workspace.offref(this.activeLeafRef);
		if (this.fileOpenRef) this.app.workspace.offref(this.fileOpenRef);
		this.activeLeafRef = null;
		this.fileOpenRef = null;
	}

	private listenForFileDeletion(): void {
		if (this.fileDeleteRef) return;
		this.fileDeleteRef = this.app.vault.on(
			'delete',
			(file: TAbstractFile) => {
				if (file.path === this.getModalFile()?.path) this.close();
			},
		);
	}

	private stopListeningForFileDeletion(): void {
		if (this.fileDeleteRef) this.app.vault.offref(this.fileDeleteRef);
		this.fileDeleteRef = null;
	}
}

function createActiveEditorProxy(view: MarkdownView): MarkdownFileInfo {
	return new Proxy({} as MarkdownFileInfo, {
		get: (_target, property) => {
			const value: unknown = Reflect.get(view, property, view);
			if (typeof value !== 'function') return value;
			return (...args: unknown[]): unknown => Reflect.apply(value, view, args);
		},
		set: (_target, property, value) => Reflect.set(view, property, value, view),
	});
}

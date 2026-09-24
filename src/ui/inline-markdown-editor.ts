import { Scope, type App, type TFile } from 'obsidian';
import { StateEffect } from '@codemirror/state';
import { EditorView, placeholder as codeMirrorPlaceholder } from '@codemirror/view';

interface RuntimeEditor {
	cm?: EditorView;
}

interface RuntimeMarkdownEditMode {
	activeCM?: EditorView;
	editor?: RuntimeEditor;
	_loaded?: boolean;
	set(value: string, clear: boolean): void;
	unload(): void;
	hide?: () => void;
	onUpdate(update: unknown, changed: boolean): void;
}

interface RuntimeEditorOwner {
	app: App;
	file: TFile | null;
	editMode: RuntimeMarkdownEditMode | null;
	editor: RuntimeEditor | null;
	getFile(): TFile | null;
	onMarkdownScroll(): void;
	syncScroll(): void;
	getMode(): 'source';
	requestSave(): void;
	save(): void;
}

interface RuntimeEmbed {
	editable: boolean;
	editMode: RuntimeMarkdownEditMode;
	showEditor(): void;
	unload(): void;
}

interface RuntimeApp extends App {
	embedRegistry: {
		embedByExtension: {
			md(owner: { app: App; containerEl: HTMLElement }, file: null, path: string): RuntimeEmbed;
		};
	};
}

interface RuntimeWorkspace {
	activeEditor?: RuntimeEditorOwner | null;
	setActiveLeaf: (...args: unknown[]) => unknown;
}

type RuntimeSetActiveLeaf = RuntimeWorkspace['setActiveLeaf'];

type MarkdownEditModeConstructor = new (
	app: App,
	container: HTMLElement,
	owner: RuntimeEditorOwner,
) => RuntimeMarkdownEditMode;

interface ActiveLeafPatchState {
	original: RuntimeSetActiveLeaf;
	patched: RuntimeSetActiveLeaf;
	editModes: Set<RuntimeMarkdownEditMode>;
}

export interface InlineMarkdownEditorOptions {
	value: string;
	file?: TFile | null;
	placeholder?: string;
	disabled?: boolean;
	onChange?: (value: string) => void;
}

let markdownEditModeBase: MarkdownEditModeConstructor | null = null;
const activeLeafPatches = new WeakMap<App, ActiveLeafPatchState>();
const inlineMarkdownEditorTheme = EditorView.theme({
	'&': {
		height: '100%',
		minHeight: '0',
		backgroundColor: 'transparent',
	},
	'.cm-scroller': {
		height: '100%',
		minHeight: '0',
		overflowX: 'hidden',
		overflowY: 'auto',
		padding: 'var(--input-padding)',
		fontFamily: 'var(--font-text)',
	},
	'.cm-content': {
		minHeight: '0',
		padding: '0',
		lineHeight: 'var(--line-height-tight)',
		backgroundColor: 'transparent',
		caretColor: 'var(--text-normal)',
	},
	'.cm-sizer': {
		minWidth: '0',
		borderRight: '0 !important',
	},
	'.cm-line': {
		padding: '0',
		backgroundColor: 'transparent',
	},
	'.cm-activeLine': {
		backgroundColor: 'transparent !important',
	},
	'&.cm-focused .cm-activeLine': {
		backgroundColor: 'transparent !important',
	},
	'.cm-line.cm-active': {
		backgroundColor: 'transparent !important',
	},
	'.cm-placeholder': {
		color: 'var(--input-placeholder-color)',
		pointerEvents: 'none',
	},
	'.cm-selectionBackground': {
		backgroundColor: 'var(--text-selection) !important',
	},
	'.cm-content ::selection': {
		backgroundColor: 'var(--text-selection)',
	},
});

export class InlineMarkdownEditor {
	private readonly editMode: RuntimeMarkdownEditMode;
	private readonly scope: Scope;
	private readonly owner: RuntimeEditorOwner;
	private destroyed = false;
	private observer: MutationObserver | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private resizeFrame: number | null = null;
	private unregisterActiveLeafGuard: (() => void) | null = null;
	private focusInHandler: (() => void) | null = null;
	private blurHandler: (() => void) | null = null;
	private containerMouseDownHandler: ((event: MouseEvent) => void) | null = null;
	private contentDom: HTMLElement | null = null;

	constructor(
		private readonly app: App,
		readonly containerEl: HTMLElement,
		options: InlineMarkdownEditorOptions,
	) {
		markdownEditModeBase ??= getMarkdownEditModeBase(app, containerEl.ownerDocument);
		this.owner = createEditorOwner(app, options.file ?? null);
		this.editMode = new markdownEditModeBase(app, containerEl, this.owner);
		this.owner.editMode = this.editMode;
		this.owner.editor = this.editMode.editor ?? null;
		this.scope = new Scope(app.scope);
		this.scope.register(['Mod'], 'Enter', () => true);
		this.editMode.set(String(options.value || ''), false);
		const originalUnload = this.editMode.unload.bind(this.editMode);
		this.editMode.unload = () => {
			if (this.destroyed) originalUnload();
		};
		if (typeof this.editMode.hide === 'function') this.editMode.hide = () => {};
		this.unregisterActiveLeafGuard = registerActiveLeafGuard(app, this.editMode);
		const originalOnUpdate = this.editMode.onUpdate.bind(this.editMode);
		this.editMode.onUpdate = (update, changed) => {
			if (this.destroyed) return;
			try { originalOnUpdate(update, changed); } catch { /* Internal updates are best effort. */ }
			if (changed) {
				options.onChange?.(this.value);
				this.scheduleResize();
			}
		};
		const editorView = this.editMode.editor?.cm;
		if (editorView) this.bindEditorView(editorView, options);
	}

	get value(): string {
		return this.editMode.editor?.cm?.state.doc.toString() ?? '';
	}

	focus(): void {
		this.editMode.editor?.cm?.focus();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.editMode.onUpdate = () => {};
		this.observer?.disconnect();
		this.observer = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		if (this.resizeFrame !== null) {
			this.containerEl.ownerDocument.defaultView?.cancelAnimationFrame(this.resizeFrame);
			this.resizeFrame = null;
		}
		if (this.contentDom) {
			if (this.focusInHandler) {
				this.contentDom.removeEventListener('focusin', this.focusInHandler);
			}
			if (this.blurHandler) this.contentDom.removeEventListener('blur', this.blurHandler);
		}
		if (this.containerMouseDownHandler) {
			this.containerEl.removeEventListener('mousedown', this.containerMouseDownHandler);
		}
		this.unregisterActiveLeafGuard?.();
		this.unregisterActiveLeafGuard = null;
		this.app.keymap.popScope(this.scope);
		const workspace = this.app.workspace as unknown as RuntimeWorkspace;
		if (workspace.activeEditor === this.owner) workspace.activeEditor = null;
		try {
			if (this.editMode._loaded) this.editMode.unload();
		} catch { /* A detached editor needs no further cleanup. */ }
	}

	private bindEditorView(
		editorView: EditorView,
		options: InlineMarkdownEditorOptions,
	): void {
		this.contentDom = editorView.contentDOM;
		const extensions = [inlineMarkdownEditorTheme];
		if (options.placeholder) extensions.push(codeMirrorPlaceholder(options.placeholder));
		editorView.dispatch({ effects: StateEffect.appendConfig.of(extensions) });
		if (options.disabled) {
			this.containerEl.addClass('is-disabled');
			editorView.contentDOM.contentEditable = 'false';
			editorView.contentDOM.tabIndex = -1;
			return;
		}
		this.focusInHandler = () => {
			this.app.keymap.pushScope(this.scope);
			const workspace = this.app.workspace as unknown as RuntimeWorkspace;
			workspace.activeEditor = this.owner;
		};
		editorView.contentDOM.addEventListener('focusin', this.focusInHandler);
		this.blurHandler = () => this.app.keymap.popScope(this.scope);
		editorView.contentDOM.addEventListener('blur', this.blurHandler);
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (ownerWindow) {
			this.observer = new ownerWindow.MutationObserver(() => {
				if (!this.destroyed && editorView.contentDOM.contentEditable !== 'true') {
					editorView.contentDOM.contentEditable = 'true';
				}
			});
			this.observer.observe(editorView.contentDOM, {
				attributes: true,
				attributeFilter: ['contenteditable'],
			});
			this.resizeObserver = new ownerWindow.ResizeObserver(() => this.scheduleResize());
			this.resizeObserver.observe(editorView.contentDOM);
		}
		this.containerMouseDownHandler = (event) => {
			if (this.destroyed) return;
			if (editorView.contentDOM.contentEditable !== 'true') {
				editorView.contentDOM.contentEditable = 'true';
			}
			if (editorView.contentDOM.contains(event.target as Node)) return;
			event.preventDefault();
			editorView.focus();
		};
		this.containerEl.addEventListener('mousedown', this.containerMouseDownHandler);
		this.scheduleResize();
	}

	private scheduleResize(): void {
		if (this.resizeFrame !== null || this.destroyed) return;
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.resizeFrame = ownerWindow.requestAnimationFrame(() => {
			this.resizeFrame = null;
			if (this.destroyed) return;
			const editorView = this.editMode.editor?.cm;
			if (!editorView) return;
			const containerStyle = ownerWindow.getComputedStyle(this.containerEl);
			const scrollerStyle = ownerWindow.getComputedStyle(editorView.scrollDOM);
			const minimum = parsePixels(containerStyle.getPropertyValue('--input-height'), 30);
			const verticalPadding = parsePixels(scrollerStyle.paddingTop) +
				parsePixels(scrollerStyle.paddingBottom);
			const verticalBorder = parsePixels(containerStyle.borderTopWidth) +
				parsePixels(containerStyle.borderBottomWidth);
			const maximum = Math.min(
				320,
				Math.max(minimum, Math.round(ownerWindow.innerHeight * 0.4)),
			);
			const desired = Math.max(
				minimum,
				Math.ceil(editorView.contentHeight + verticalPadding + verticalBorder),
			);
			const height = `${Math.min(desired, maximum)}px`;
			if (this.containerEl.style.getPropertyValue('--mbv-inline-editor-height') !== height) {
				this.containerEl.setCssProps({ '--mbv-inline-editor-height': height });
			}
			this.containerEl.classList.toggle('is-multiline', desired > minimum + 1);
			this.containerEl.classList.toggle('is-scrollable', desired > maximum);
		});
	}
}

function parsePixels(value: string, fallback = 0): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function getMarkdownEditModeBase(
	app: App,
	document: Document,
): MarkdownEditModeConstructor {
	const runtime = app as RuntimeApp;
	const embed = runtime.embedRegistry.embedByExtension.md(
		{ app, containerEl: document.createElement('div') },
		null,
		'',
	);
	embed.editable = true;
	embed.showEditor();
	const prototype = Object.getPrototypeOf(Object.getPrototypeOf(embed.editMode)) as {
		constructor: MarkdownEditModeConstructor;
	};
	embed.unload();
	return prototype.constructor;
}

function createEditorOwner(app: App, file: TFile | null): RuntimeEditorOwner {
	return {
		app,
		file,
		editMode: null,
		editor: null,
		getFile: () => file,
		onMarkdownScroll: () => {},
		syncScroll: () => {},
		getMode: () => 'source',
		requestSave: () => {},
		save: () => {},
	};
}

function registerActiveLeafGuard(
	app: App,
	editMode: RuntimeMarkdownEditMode,
): () => void {
	let state = activeLeafPatches.get(app);
	const workspace = app.workspace as unknown as RuntimeWorkspace;
	if (!state) {
		const editModes = new Set<RuntimeMarkdownEditMode>();
		const original = workspace.setActiveLeaf;
		const patched: RuntimeSetActiveLeaf = (...args) => {
			for (const registered of editModes) {
				if (registered.activeCM?.hasFocus) return;
			}
			return original.apply(workspace, args);
		};
		state = { original, patched, editModes };
		activeLeafPatches.set(app, state);
		workspace.setActiveLeaf = patched;
	}
	state.editModes.add(editMode);
	return () => {
		const current = activeLeafPatches.get(app);
		if (!current) return;
		current.editModes.delete(editMode);
		if (current.editModes.size > 0) return;
		if (workspace.setActiveLeaf === current.patched) {
			workspace.setActiveLeaf = current.original;
		}
		activeLeafPatches.delete(app);
	};
}

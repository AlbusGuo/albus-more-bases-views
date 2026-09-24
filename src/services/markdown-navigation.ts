import {
	Keymap,
	Platform,
	type App,
	type BasesAllOptions,
	type BasesViewConfig,
	type PaneType,
	type TFile,
} from 'obsidian';
import { FileViewModal } from '../ui/file-view-modal';

export type MarkdownOpenMode =
	| 'current'
	| 'tab'
	| 'window'
	| 'modal'
	| 'side';

export const DEFAULT_MARKDOWN_OPEN_MODE: MarkdownOpenMode = 'current';

export function createMarkdownOpenModeOption(): BasesAllOptions {
	return {
		type: 'dropdown',
		key: 'markdownOpenMode',
		displayName: '文件打开位置',
		default: DEFAULT_MARKDOWN_OPEN_MODE,
		options: {
			current: '当前标签页',
			tab: '新标签页',
			window: '新窗口',
			modal: '模态框',
			side: '右侧模态框',
		},
	};
}

export function readMarkdownOpenMode(config: BasesViewConfig): MarkdownOpenMode {
	const mode = config.get('markdownOpenMode');
	if (
		mode === 'tab' ||
		mode === 'window' ||
		mode === 'modal' ||
		mode === 'side'
	) {
		return mode;
	}
	return DEFAULT_MARKDOWN_OPEN_MODE;
}

export class MarkdownNavigationService {
	private readonly fileModal: FileViewModal;
	private readonly fileRightModal: FileViewModal;
	private readonly temporaryFileListeners = new Set<(path: string | null) => void>();

	constructor(private readonly app: App) {
		const notify = (path: string | null): void => {
			for (const listener of this.temporaryFileListeners) listener(path);
		};
		this.fileModal = new FileViewModal(app, notify);
		this.fileRightModal = new FileViewModal(app, notify, 'right');
	}

	onTemporaryFileChange(listener: (path: string | null) => void): () => void {
		this.temporaryFileListeners.add(listener);
		return () => this.temporaryFileListeners.delete(listener);
	}

	async open(
		file: TFile,
		sourcePath: string,
		mode: MarkdownOpenMode,
		event?: MouseEvent | KeyboardEvent,
		ownerEl?: HTMLElement,
	): Promise<boolean> {
		if (file.extension.toLowerCase() !== 'md') return false;
		const interactionOwner = ownerEl ?? resolveSidePanelOwner(event);
		try {
			const modifierTarget =
				event && 'button' in event && event.button === 1
					? 'tab'
					: Keymap.isModEvent(event);
			if (!modifierTarget && mode === 'modal') {
				this.fileRightModal.destroy();
				await this.fileModal.show(file);
				return true;
			}
			if (!modifierTarget && mode === 'side') {
				this.fileModal.destroy();
				await this.fileRightModal.show(file);
				return true;
			}
			if (!modifierTarget) {
				this.fileModal.destroy();
				this.fileRightModal.destroy();
			}
			const target = modifierTarget || this.getConfiguredTarget(mode);
			await this.app.workspace.openLinkText(file.path, sourcePath, target);
			return true;
		} finally {
			clearOpenTriggerFocus(event, interactionOwner);
		}
	}

	destroy(): void {
		this.fileModal.destroy();
		this.fileRightModal.destroy();
		this.temporaryFileListeners.clear();
	}

	closeSidePanel(_ownerEl?: HTMLElement): void {
		this.fileRightModal.destroy();
	}

	private getConfiguredTarget(mode: MarkdownOpenMode): PaneType | boolean {
		if (mode === 'current') return false;
		if (mode === 'window' && Platform.isMobile) return 'tab';
		if (mode === 'modal' || mode === 'side') return false;
		return mode;
	}
}

function resolveSidePanelOwner(
	event?: MouseEvent | KeyboardEvent,
): HTMLElement | null {
	const target = event?.targetNode;
	if (!target) return null;
	const element = target.instanceOf(Element) ? target : target.parentElement;
	return element?.closest<HTMLElement>('.bases-view') ??
		element?.closest<HTMLElement>([
			'.mbv-book-view',
			'.mbv-paper-view',
			'.mbv-project-view',
			'.mbv-course-view',
			'.mbv-media-view',
			'.mbv-movie-view',
			'.mbv-game-view',
			'.mbv-operator-view',
			'.mbv-celebrity-view',
			'.mbv-tier-view',
			'.mbv-map-view',
			'.mbv-index-view',
		].join(', ')) ?? null;
}

function clearOpenTriggerFocus(
	event: MouseEvent | KeyboardEvent | undefined,
	ownerEl: HTMLElement | null,
): void {
	const target = event?.targetNode;
	const element = target?.instanceOf(Element) ? target : target?.parentElement;
	const focusTarget = element?.closest<HTMLElement>(
		'a, button, input, [tabindex]',
	);
	focusTarget?.blur();
	const activeElement = ownerEl?.ownerDocument.activeElement;
	if (
		ownerEl &&
		activeElement?.instanceOf(HTMLElement) &&
		ownerEl.contains(activeElement)
	) activeElement.blur();
}

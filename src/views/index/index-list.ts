import {
	MarkdownRenderChild,
	MarkdownRenderer,
	setIcon,
	setTooltip,
	type App,
	type Component,
} from 'obsidian';
import type { IndexNote } from './index-model';

const ROW_HEIGHT = 72;
const OVERSCAN = 6;

export interface IndexVirtualListCallbacks {
	onSelect: (note: IndexNote) => void;
	onOpen: (note: IndexNote, event?: MouseEvent | KeyboardEvent) => void;
	onEditTags: (note: IndexNote) => void;
	onDelete: (note: IndexNote) => void;
}

export class IndexVirtualList {
	private readonly spacerEl: HTMLElement;
	private readonly emptyEl: HTMLElement;
	private readonly rows = new Map<number, HTMLElement>();
	private readonly renderChildren = new Map<HTMLElement, MarkdownRenderChild>();
	private readonly resizeObserver: ResizeObserver;
	private notes: readonly IndexNote[] = [];
	private selectedPath: string | null = null;
	private renderFrame: number | null = null;

	constructor(
		private readonly containerEl: HTMLElement,
		private readonly app: App,
		private readonly renderParent: Component,
		private readonly callbacks: IndexVirtualListCallbacks,
	) {
		containerEl.addClass('mbv-index-list');
		containerEl.tabIndex = 0;
		this.spacerEl = containerEl.createDiv('mbv-index-list-spacer');
		this.emptyEl = containerEl.createDiv({
			cls: 'mbv-index-list-empty',
			text: '没有符合条件的笔记',
		});
		containerEl.addEventListener('scroll', () => this.scheduleRender(), {
			passive: true,
		});
		containerEl.addEventListener('keydown', (event) => this.handleKeydown(event));
		this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
		this.resizeObserver.observe(containerEl);
	}

	update(notes: readonly IndexNote[], selectedPath: string | null): void {
		this.notes = notes;
		this.selectedPath = selectedPath;
		this.spacerEl.setCssProps({
			'--mbv-index-list-height': `${notes.length * ROW_HEIGHT}px`,
		});
		this.emptyEl.classList.toggle('is-visible', notes.length === 0);
		this.clearRows();
		this.renderVisibleRows();
	}

	setSelectedPath(path: string | null): void {
		this.selectedPath = path;
		for (const rowEl of this.rows.values()) {
			rowEl.classList.toggle('is-selected', rowEl.dataset.path === path);
		}
	}

	focusSelected(): void {
		this.containerEl.focus({ preventScroll: true });
		const index = this.notes.findIndex((note) => note.entry.file.path === this.selectedPath);
		if (index >= 0) this.scrollToIndex(index);
	}

	destroy(): void {
		this.resizeObserver.disconnect();
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (this.renderFrame !== null) ownerWindow?.cancelAnimationFrame(this.renderFrame);
		this.renderFrame = null;
		this.clearRows();
	}

	private scheduleRender(): void {
		if (this.renderFrame !== null) return;
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.renderFrame = ownerWindow.requestAnimationFrame(() => {
			this.renderFrame = null;
			this.renderVisibleRows();
		});
	}

	private renderVisibleRows(): void {
		if (this.notes.length === 0) {
			this.clearRows();
			return;
		}
		const viewportHeight = this.containerEl.clientHeight || ROW_HEIGHT * 8;
		const start = Math.max(0, Math.floor(this.containerEl.scrollTop / ROW_HEIGHT) - OVERSCAN);
		const end = Math.min(
			this.notes.length,
			Math.ceil((this.containerEl.scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
		);
		for (const [index, rowEl] of this.rows) {
			if (index >= start && index < end) continue;
			this.removeRow(rowEl);
			this.rows.delete(index);
		}
		for (let index = start; index < end; index += 1) {
			if (this.rows.has(index)) continue;
			const note = this.notes[index];
			if (!note) continue;
			const rowEl = this.createRow(note, index);
			this.rows.set(index, rowEl);
			this.spacerEl.append(rowEl);
		}
	}

	private createRow(note: IndexNote, index: number): HTMLElement {
		const rowEl = this.spacerEl.createEl('article', {
			cls: 'mbv-index-row',
			attr: { tabindex: '-1' },
		});
		rowEl.dataset.path = note.entry.file.path;
		rowEl.setCssProps({ '--mbv-index-row-top': `${index * ROW_HEIGHT}px` });
		rowEl.classList.toggle('is-selected', note.entry.file.path === this.selectedPath);
		const contentEl = rowEl.createDiv('mbv-index-row-content');
		contentEl.createDiv({ cls: 'mbv-index-row-title', text: note.title });
		const metaEl = contentEl.createDiv('mbv-index-row-meta');
		if (note.timeText) {
			metaEl.createSpan({ cls: 'mbv-index-row-time', text: note.timeText });
		}
		const tagsEl = metaEl.createDiv('mbv-index-row-tags');
		const renderChild = this.renderParent.addChild(new MarkdownRenderChild(rowEl));
		this.renderChildren.set(rowEl, renderChild);
		for (const categoryLabel of note.categoryLeaves) {
			const categoryPath = getCategoryPath(note, categoryLabel);
			const tagRenderEl = tagsEl.createDiv('mbv-index-row-tag-render');
			void MarkdownRenderer.render(
				this.app,
				`#${categoryPath}`,
				tagRenderEl,
				note.entry.file.path,
				renderChild,
			).then(() => {
				tagRenderEl.querySelectorAll<HTMLElement>('a.tag')
					.forEach((tagEl) => tagEl.setText(categoryLabel));
			}).catch(() => {
				if (!tagRenderEl.isConnected) return;
				tagRenderEl.empty();
				tagRenderEl.setText(categoryLabel);
			});
		}
		const actionsEl = rowEl.createDiv('mbv-index-row-actions');
		this.createActionButton(actionsEl, 'tags', '编辑标签', () => {
			this.callbacks.onEditTags(note);
		});
		this.createActionButton(actionsEl, 'trash-2', '删除笔记', () => {
			this.callbacks.onDelete(note);
		}, true);
		rowEl.addEventListener('click', (event) => {
			if (isTagInteraction(event)) return;
			this.callbacks.onSelect(note);
			this.callbacks.onOpen(note, event);
		});
		rowEl.addEventListener('auxclick', (event) => {
			if (isTagInteraction(event)) return;
			if (event.button === 1) this.callbacks.onOpen(note, event);
		});
		return rowEl;
	}

	private createActionButton(
		parentEl: HTMLElement,
		icon: string,
		label: string,
		onClick: (event: MouseEvent) => void,
		danger = false,
	): void {
		const buttonEl = parentEl.createEl('button', {
			cls: `clickable-icon mbv-index-row-action${danger ? ' is-danger' : ''}`,
			attr: { type: 'button', 'aria-label': label },
		});
		setIcon(buttonEl, icon);
		setTooltip(buttonEl, label);
		buttonEl.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			onClick(event);
		});
	}

	private handleKeydown(event: KeyboardEvent): void {
		if (this.notes.length === 0) return;
		const selectedIndex = this.notes.findIndex((note) =>
			note.entry.file.path === this.selectedPath,
		);
		const activeIndex = Math.max(0, selectedIndex);
		if (event.key === 'Enter') {
			const note = this.notes[activeIndex];
			if (!note) return;
			event.preventDefault();
			this.callbacks.onOpen(note, event);
			return;
		}
		if (event.key === ' ') {
			const note = this.notes[activeIndex];
			if (!note) return;
			event.preventDefault();
			this.callbacks.onOpen(note, event);
			return;
		}
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		const delta = event.key === 'ArrowDown' ? 1 : -1;
		const nextIndex = selectedIndex < 0
			? event.key === 'ArrowDown' ? 0 : this.notes.length - 1
			: Math.min(this.notes.length - 1, Math.max(0, selectedIndex + delta));
		const note = this.notes[nextIndex];
		if (!note) return;
		this.callbacks.onSelect(note);
		this.scrollToIndex(nextIndex);
	}

	private scrollToIndex(index: number): void {
		const top = index * ROW_HEIGHT;
		const bottom = top + ROW_HEIGHT;
		if (top < this.containerEl.scrollTop) this.containerEl.scrollTop = top;
		else if (bottom > this.containerEl.scrollTop + this.containerEl.clientHeight) {
			this.containerEl.scrollTop = bottom - this.containerEl.clientHeight;
		}
		this.scheduleRender();
	}

	private clearRows(): void {
		for (const rowEl of this.rows.values()) this.removeRow(rowEl);
		this.rows.clear();
	}

	private removeRow(rowEl: HTMLElement): void {
		const renderChild = this.renderChildren.get(rowEl);
		if (renderChild) {
			this.renderParent.removeChild(renderChild);
			this.renderChildren.delete(rowEl);
		}
		rowEl.remove();
	}
}

function isTagInteraction(event: MouseEvent): boolean {
	return Boolean((event.target as Element | null)?.closest('.mbv-index-row-tags'));
}

function getCategoryPath(note: IndexNote, categoryLabel: string): string {
	return note.categories.find((category) => {
		const parts = category.split('/').filter(Boolean);
		return (parts.at(-1) ?? category) === categoryLabel;
	}) ?? categoryLabel;
}

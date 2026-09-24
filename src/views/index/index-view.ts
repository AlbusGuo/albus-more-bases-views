import {
	BasesView,
	Keymap,
	SearchComponent,
	setIcon,
	type BasesPropertyId,
	type QueryController,
} from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import { AnimationFrameTask } from '../../ui/animation-frame-task';
import { IndexCategoryDragController } from './index-category-drag';
import { IndexVirtualList } from './index-list';
import {
	INDEX_OTHER_CATEGORY,
	buildIndexCategories,
	buildIndexNotes,
	filterIndexNotes,
	type IndexCategory,
	type IndexNote,
	type IndexSelection,
} from './index-model';
import { IndexNoteActions } from './index-note-actions';
import {
	getIndexViewOptions,
	readIndexViewOptions,
	type IndexViewOptions,
} from './index-options';

export const INDEX_VIEW_TYPE = 'albus-more-bases-views-index';
export { getIndexViewOptions };

export class IndexView extends BasesView {
	readonly type = INDEX_VIEW_TYPE;

	private readonly containerEl: HTMLElement;
	private readonly navEl: HTMLElement;
	private readonly resultCountEl: HTMLElement;
	private readonly search: SearchComponent;
	private readonly list: IndexVirtualList;
	private readonly noteActions: IndexNoteActions;
	private readonly categoryDrag: IndexCategoryDragController;
	private readonly dataUpdateTask: AnimationFrameTask;
	private options: IndexViewOptions | null = null;
	private notes: IndexNote[] = [];
	private categories: IndexCategory[] = [];
	private visibleProperties: BasesPropertyId[] = [];
	private filteredNotes: IndexNote[] = [];
	private selection: IndexSelection = { mode: 'all' };
	private selectedPath: string | null = null;
	private readonly collapsedCategories = new Set<string>();
	private query = '';
	private filterFrame: number | null = null;

	constructor(
		controller: QueryController,
		private readonly parentEl: HTMLElement,
		private readonly navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
	) {
		super(controller);
		viewTabs.attach(controller, parentEl);
		const embedded = this.isEmbedded();
		this.parentEl.classList.toggle('mbv-index-host', !embedded);
		this.register(() => this.parentEl.removeClass('mbv-index-host'));
		this.containerEl = parentEl.createDiv({
			cls: 'mbv-index-view',
			attr: { tabindex: '-1' },
		});
		this.containerEl.classList.toggle('is-embedded', embedded);
		this.noteActions = new IndexNoteActions(this.app);
		const toolbarEl = this.containerEl.createDiv('mbv-index-toolbar');
		const searchWrapEl = toolbarEl.createDiv('mbv-index-search');
		this.search = new SearchComponent(searchWrapEl)
			.setPlaceholder('搜索标题, 分类或属性');
		this.search.onChange((value) => {
			this.query = value;
			this.scheduleFilter();
		});
		this.search.inputEl.addEventListener('keydown', (event) => {
			if (event.key !== 'ArrowDown') return;
			event.preventDefault();
			this.list.focusSelected();
		});
		this.resultCountEl = toolbarEl.createDiv('mbv-index-result-count');
		const bodyEl = this.containerEl.createDiv('mbv-index-body');
		this.navEl = bodyEl.createEl('nav', {
			cls: 'mbv-index-nav nav-files-container',
			attr: { role: 'tree' },
		});
		this.categoryDrag = new IndexCategoryDragController(
			this.navEl,
			(paths) => this.reorderCategories(paths),
		);
		const listEl = bodyEl.createDiv('mbv-index-list-column');
		this.list = new IndexVirtualList(listEl, this.app, this, {
			onSelect: (note) => this.selectNote(note),
			onOpen: (note, event) => void this.openNote(note, event),
			onEditTags: (note) => this.editNoteTags(note),
			onDelete: (note) => this.noteActions.delete(note.entry.file),
		});
		this.register(this.navigation.onTemporaryFileChange((path) => {
			this.setActivePath(path);
		}));
		this.dataUpdateTask = new AnimationFrameTask(
			this.containerEl,
			() => this.applyDataUpdate(),
		);
	}

	onDataUpdated(): void {
		this.dataUpdateTask.schedule();
	}

	focus(): void {
		this.search.inputEl.focus();
	}

	onunload(): void {
		this.dataUpdateTask.cancel();
		this.parentEl.removeClass('mbv-index-host');
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (this.filterFrame !== null) ownerWindow?.cancelAnimationFrame(this.filterFrame);
		this.filterFrame = null;
		this.list.destroy();
		this.categoryDrag.destroy();
		this.navigation.closeSidePanel(this.containerEl);
	}

	private applyDataUpdate(): void {
		this.options = readIndexViewOptions(this.config);
		this.visibleProperties = this.config.getOrder();
		const entries = this.data.groupedData.flatMap((group) => group.entries);
		this.notes = buildIndexNotes(entries, this.options, this.visibleProperties);
		this.categories = buildIndexCategories(this.notes, this.options.categoryOrder);
		this.validateSelection();
		this.renderNavigation();
		this.applyFilter();
	}

	private scheduleFilter(): void {
		if (this.filterFrame !== null) return;
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.filterFrame = ownerWindow.requestAnimationFrame(() => {
			this.filterFrame = null;
			this.applyFilter();
		});
	}

	private applyFilter(): void {
		if (!this.options) return;
		this.filteredNotes = filterIndexNotes(this.notes, this.selection, this.query);
		this.resultCountEl.setText(`${this.filteredNotes.length} 条笔记`);
		const selected = this.filteredNotes.find((note) =>
			note.entry.file.path === this.selectedPath,
		) ?? null;
		this.selectedPath = selected?.entry.file.path ?? null;
		this.list.update(this.filteredNotes, this.selectedPath);
	}

	private renderNavigation(): void {
		this.categoryDrag.reset();
		this.navEl.empty();
		this.createNavButton('全部', this.notes.length, { mode: 'all' });
		const otherCount = this.notes.filter((note) =>
			note.categories.includes(INDEX_OTHER_CATEGORY),
		).length;
		if (otherCount > 0) {
			this.createNavButton('其他', otherCount, { mode: 'other' });
		}
		const children = new Map<string, IndexCategory[]>();
		for (const category of this.categories) {
			const parentPath = getCategoryParent(category.path);
			const siblings = children.get(parentPath) ?? [];
			siblings.push(category);
			children.set(parentPath, siblings);
		}
		this.renderCategoryChildren(this.navEl, '', children);
	}

	private createNavButton(
		label: string,
		count: number,
		selection: IndexSelection,
	): void {
		const itemEl = this.navEl.createDiv({
			cls: 'tree-item nav-file mbv-index-nav-item',
			attr: { role: 'treeitem' },
		});
		const selfEl = itemEl.createDiv({
			cls: 'tree-item-self nav-file-title tappable is-clickable',
			attr: { tabindex: '0' },
		});
		this.populateNavItem(itemEl, selfEl, label, count, selection);
	}

	private renderCategoryChildren(
		parentEl: HTMLElement,
		parentPath: string,
		children: ReadonlyMap<string, readonly IndexCategory[]>,
	): void {
		for (const category of children.get(parentPath) ?? []) {
			const childCategories = children.get(category.path) ?? [];
			if (childCategories.length > 0) {
				this.createCategoryFolder(parentEl, category, childCategories, children);
			} else {
				this.createCategoryLeaf(parentEl, category);
			}
		}
	}

	private createCategoryFolder(
		parentEl: HTMLElement,
		category: IndexCategory,
		childCategories: readonly IndexCategory[],
		children: ReadonlyMap<string, readonly IndexCategory[]>,
	): void {
		const collapsed = this.collapsedCategories.has(category.path);
		const itemEl = parentEl.createDiv({
			cls: `tree-item nav-folder mbv-index-nav-item is-category${
				collapsed ? ' is-collapsed' : ''
			}`,
			attr: {
				role: 'treeitem',
				'aria-expanded': String(!collapsed),
			},
		});
		itemEl.dataset.categoryDepth = String(category.depth);
		const titleEl = itemEl.createDiv({
			cls: 'tree-item-self nav-folder-title is-clickable mod-collapsible',
			attr: {
				tabindex: '0',
				'aria-label': `${collapsed ? '展开' : '折叠'} ${category.name}`,
			},
		});
		const collapseEl = titleEl.createDiv({
			cls: `tree-item-icon collapse-icon mbv-index-nav-toggle${
				collapsed ? ' is-collapsed' : ''
			}`,
		});
		setIcon(collapseEl, 'right-triangle');
		this.populateNavContent(
			titleEl,
			category.name,
			category.count,
			'nav-folder-title-content',
		);
		const toggle = (event: Event): void => {
			if (this.categoryDrag.consumeClick(category.path)) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			this.toggleCategory(category.path);
		};
		titleEl.addEventListener('click', toggle);
		titleEl.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowLeft' && !collapsed) {
				event.preventDefault();
				this.toggleCategory(category.path);
			} else if (event.key === 'ArrowRight' && collapsed) {
				event.preventDefault();
				this.toggleCategory(category.path);
			} else if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				toggle(event);
			}
		});
		this.categoryDrag.bind(itemEl, category.path, getCategoryParent(category.path));
		if (collapsed) return;
		const childrenEl = itemEl.createDiv({
			cls: 'tree-item-children nav-folder-children',
			attr: { role: 'group' },
		});
		for (const child of childCategories) {
			const grandchildren = children.get(child.path) ?? [];
			if (grandchildren.length > 0) {
				this.createCategoryFolder(childrenEl, child, grandchildren, children);
			} else {
				this.createCategoryLeaf(childrenEl, child);
			}
		}
	}

	private createCategoryLeaf(parentEl: HTMLElement, category: IndexCategory): void {
		const itemEl = parentEl.createDiv({
			cls: 'tree-item nav-file mbv-index-nav-item is-category',
			attr: { role: 'treeitem' },
		});
		itemEl.dataset.categoryDepth = String(category.depth);
		const selfEl = itemEl.createDiv({
			cls: 'tree-item-self nav-file-title tappable is-clickable',
			attr: { tabindex: '0' },
		});
		this.populateNavItem(
			itemEl,
			selfEl,
			category.name,
			category.count,
			{ mode: 'category', category: category.path },
		);
		this.categoryDrag.bind(itemEl, category.path, getCategoryParent(category.path));
	}

	private populateNavItem(
		itemEl: HTMLElement,
		selfEl: HTMLElement,
		label: string,
		count: number,
		selection: IndexSelection,
	): void {
		selfEl.classList.toggle(
			'is-active',
			isSameSelection(this.selection, selection),
		);
		this.populateNavContent(selfEl, label, count, 'nav-file-title-content');
		const activate = (event: Event): void => {
			const categoryPath = itemEl.dataset.categoryPath;
			if (categoryPath && this.categoryDrag.consumeClick(categoryPath)) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			this.selection = selection;
			this.renderNavigation();
			this.applyFilter();
		};
		selfEl.addEventListener('click', activate);
		selfEl.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			activate(event);
		});
	}

	private populateNavContent(
		selfEl: HTMLElement,
		label: string,
		count: number,
		contentClass: 'nav-file-title-content' | 'nav-folder-title-content',
	): void {
		selfEl.createDiv({
			cls: `tree-item-inner ${contentClass}`,
			text: label,
		});
		selfEl.createDiv('tree-item-flair-outer').createSpan({
			cls: 'tree-item-flair mbv-index-nav-count',
			text: String(count),
		});
	}

	private reorderCategories(siblingPaths: string[]): void {
		if (!this.options || siblingPaths.length < 2) return;
		const siblings = new Set(siblingPaths);
		const categoryOrder = this.categories
			.map((category) => category.path)
			.filter((path) => !siblings.has(path));
		categoryOrder.push(...siblingPaths);
		this.options = { ...this.options, categoryOrder };
		this.config.set('categoryOrder', categoryOrder);
		this.categories = buildIndexCategories(this.notes, categoryOrder);
		this.renderNavigation();
	}

	private toggleCategory(path: string): void {
		if (!this.collapsedCategories.has(path)) this.collapsedCategories.add(path);
		else this.collapsedCategories.delete(path);
		this.renderNavigation();
	}

	private selectNote(note: IndexNote): void {
		this.selectedPath = note.entry.file.path;
		this.list.setSelectedPath(this.selectedPath);
	}

	private editNoteTags(note: IndexNote): void {
		if (!this.options) return;
		this.noteActions.editTags(
			note.entry.file,
			this.options.categoryProperty,
			note.categories.filter((category) => category !== INDEX_OTHER_CATEGORY),
			this.categories.map((category) => category.path),
		);
	}

	private setActivePath(path: string | null): void {
		this.selectedPath = path && this.filteredNotes.some((note) =>
			note.entry.file.path === path,
		) ? path : null;
		this.list.setSelectedPath(this.selectedPath);
	}

	private async openNote(
		note: IndexNote,
		event?: MouseEvent | KeyboardEvent,
	): Promise<void> {
		if (!this.options) return;
		const handled = await this.navigation.open(
			note.entry.file,
			note.entry.file.path,
			this.options.markdownOpenMode,
			event,
			this.containerEl,
		);
		if (handled) return;
		await this.app.workspace.openLinkText(
			note.entry.file.path,
			note.entry.file.path,
			event && 'button' in event && event.button === 1
				? 'tab'
				: event ? Keymap.isModEvent(event) : false,
		);
	}

	private validateSelection(): void {
		const selection = this.selection;
		if (selection.mode !== 'category') return;
		const category = this.categories.find((item) =>
			item.path === selection.category,
		);
		const hasChildren = this.categories.some((item) =>
			item.path.startsWith(`${selection.category}/`),
		);
		if (!category || hasChildren) this.selection = { mode: 'all' };
	}

	private isEmbedded(): boolean {
		let element = this.parentEl.parentElement;
		while (element) {
			if (element.hasClass('bases-embed') || element.hasClass('block-language-base')) {
				return true;
			}
			element = element.parentElement;
		}
		return false;
	}
}

function isSameSelection(left: IndexSelection, right: IndexSelection): boolean {
	if (left.mode !== right.mode) return false;
	if (left.mode !== 'category' || right.mode !== 'category') return true;
	return left.category === right.category;
}

function getCategoryParent(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex > 0 ? path.slice(0, separatorIndex) : '';
}

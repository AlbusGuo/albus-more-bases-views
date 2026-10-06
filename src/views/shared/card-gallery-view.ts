import {
	BasesView,
	type App,
	type BasesEntry,
	type BasesEntryGroup,
	type BasesPropertyId,
	type BasesViewConfig,
	type Modal,
	type QueryController,
} from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import { attachBasesSearchProperties } from '../../services/bases-search-properties';
import { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import { AnimationFrameTask } from '../../ui/animation-frame-task';
import {
	createBasesViewportGroups,
	getBasesGroupId,
} from '../../ui/bases-entry-groups';
import { ViewportGrid, type ViewportGridGroup } from '../../ui/viewport-grid';
import {
	CardPropertyModal,
} from './card-property-modal';
import { collectCardPropertySuggestions } from './card-property-suggestions';
import type {
	CardPropertyEditorDefinition,
	CardPropertyPreviewFactory,
} from './card-property-editor-types';
import { CardEditorHost } from './card-editor-host';
import type { InteractiveCardController } from './card-interaction';

export interface CardGalleryCardContext<Options> {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: Options;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
}

interface GroupFoldController extends QueryController {
	getGroupFolds?: () => Set<string>;
	saveGroupFolds?: () => void;
}

interface GroupedViewConfig extends BasesViewConfig {
	groupBy?: { property?: BasesPropertyId };
}

export interface CardGalleryCardController<Context> {
	element: HTMLElement;
	update: (context: Context) => void;
	prepareHtmlExport?: () => Promise<void>;
	canOpenEditor?: () => boolean;
	prepareOpenEditor?: () => void;
	destroy?: () => void;
}

export interface CardGalleryViewDefinition<
	Options,
	Context extends CardGalleryCardContext<Options>,
	Controller extends CardGalleryCardController<Context>,
> {
	viewClass: string;
	gridClass: string;
	slotClass: string;
	readOptions: (config: BasesViewConfig) => Options;
	createCard: (context: Context) => Controller;
	getMinimumItemWidth: (options: Options | null) => number;
	estimatedRowHeight: (itemWidth: number, options: Options | null) => number;
	columnGap: number;
	rowGap: number;
	overscanRows?: number;
	maxDetachedItems?: number;
	resizeSettleDelay?: number;
	editor?: CardPropertyEditorDefinition<Options>;
}

/**
 * Owns the common Bases-to-card-gallery lifecycle while leaving every card's
 * DOM, styling, behavior, and view-specific state in its original module.
 */
export abstract class CardGalleryView<
	Options,
	Context extends CardGalleryCardContext<Options>,
	Controller extends CardGalleryCardController<Context>,
> extends BasesView {
	protected readonly containerEl: HTMLElement;
	protected readonly gridEl: HTMLElement;

	private readonly renderer: ViewportGrid<BasesEntry, Controller>;
	private readonly cardContexts = new WeakMap<HTMLElement, Context>();
	private readonly cardControllers = new WeakMap<HTMLElement, Controller>();
	private currentOptions: Options | null = null;
	private visibleProperties: BasesPropertyId[] = [];
	private groups: readonly ViewportGridGroup<BasesEntry>[] = createBasesViewportGroups([]);
	private readonly dataUpdateTask: AnimationFrameTask;
	private readonly editorHost: CardEditorHost<Context>;
	private readonly groupFoldController: GroupFoldController;
	private readonly fallbackGroupFolds = new Set<string>();

	protected constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		private readonly navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
		htmlExporter: CardGalleryHtmlExporter,
		private readonly definition: CardGalleryViewDefinition<
			Options,
			Context,
			Controller
		>,
	) {
		super(controller);
		this.groupFoldController = controller;
		this.register(attachBasesSearchProperties(
			controller,
			() => definition.readOptions(this.config),
		));
		viewTabs.attach(controller, parentEl);
		this.containerEl = parentEl.createDiv({
			cls: definition.viewClass,
			attr: { tabindex: '-1' },
		});
		this.htmlExporter = htmlExporter;
		this.gridEl = this.containerEl.createDiv(definition.gridClass);
		this.dataUpdateTask = new AnimationFrameTask(
			this.containerEl,
			() => this.applyDataUpdate(),
		);
		this.editorHost = new CardEditorHost(
			this.containerEl,
			(context, onClosed) => this.buildCardEditor(context, onClosed),
		);
		this.renderer = new ViewportGrid({
			containerEl: this.gridEl,
			getKey: (entry) => entry.file.path,
			create: (entry) => {
				const context = this.createCardContext(entry);
				const card = definition.createCard(context);
				this.bindCardEditor(card, context);
				this.onCardCreated(card);
				return card;
			},
			update: (card, entry) => {
				const context = this.createCardContext(entry);
				this.bindCardEditor(card, context);
				card.update(context);
			},
			dispose: (card) => {
				this.onCardDisposed(card);
				card.destroy?.();
			},
			onAttach: (card) => this.onCardAttached(card),
			onDetach: (card) => this.onCardDetached(card),
			getMinimumItemWidth: () =>
				definition.getMinimumItemWidth(this.currentOptions),
			estimatedRowHeight: (itemWidth) =>
				definition.estimatedRowHeight(itemWidth, this.currentOptions),
			onItemWidthChange: (itemWidth) => this.onItemWidthChanged(itemWidth),
			columnGap: definition.columnGap,
			rowGap: definition.rowGap,
			overscanRows: definition.overscanRows,
			maxDetachedItems: definition.maxDetachedItems,
			resizeSettleDelay: definition.resizeSettleDelay,
			slotClass: definition.slotClass,
		});
		this.registerDomEvent(this.gridEl, 'contextmenu', this.handleCardContextMenu);
	}

	onDataUpdated(): void {
		this.dataUpdateTask.schedule();
	}

	private applyDataUpdate(): void {
		this.refreshGalleryData(true);
	}

	private refreshGalleryData(render: boolean): void {
		const previousOptions = this.currentOptions;
		this.currentOptions = this.definition.readOptions(this.config);
		this.visibleProperties = this.config.getOrder();
		this.onOptionsChanged(this.currentOptions, previousOptions);
		const groupProperty = (this.config as GroupedViewConfig).groupBy?.property;
		this.groups = this.transformGalleryGroups(
			createBasesViewportGroups(this.data.groupedData, {
				app: this.app,
				propertyLabel: groupProperty
					? this.config.getDisplayName(groupProperty)
					: '',
				isCollapsed: (group) => this.isGroupCollapsed(group),
				onToggleCollapsed: (group) => this.toggleGroupCollapsed(group),
			}),
			this.currentOptions,
		);
		if (render) {
			this.renderer.setGroups(this.groups);
			this.onGalleryDataUpdated();
		}
	}

	onunload(): void {
		this.editorHost.destroy();
		this.dataUpdateTask.cancel();
		this.onBeforeGalleryUnload();
		this.renderer.destroy();
		this.onAfterGalleryUnload();
	}

	getViewActions(): Array<{
		name: string;
		icon: string;
		callback: () => void;
	}> {
		return [{
			name: '导出 HTML...',
			icon: 'lucide-download',
			callback: () => void this.htmlExporter.export(this),
		}];
	}

	protected get galleryOptions(): Options | null {
		return this.currentOptions;
	}

	protected refreshGalleryCards(): void {
		this.renderer.setGroups(this.groups);
	}

	protected get isCardEditorOpen(): boolean {
		return this.editorHost.isOpen;
	}

	protected supportsCardEditor(): boolean {
		return this.definition.editor !== undefined;
	}

	protected buildCardEditor(
		context: Context,
		onClosed: () => void,
	): Modal | Promise<Modal | null> | null {
		if (!this.definition.editor) return null;
		return new CardPropertyModal(
			context,
			this.definition.editor,
			this.createPreviewFactory(context),
			collectCardPropertySuggestions(
				this.definition.editor,
				context.options,
				this.groups.flatMap((group) => group.items),
			),
			onClosed,
		);
	}

	protected requestCardEditor(entry: BasesEntry): void {
		this.editorHost.open(this.createCardContext(entry));
	}

	get htmlExportContainer(): HTMLElement {
		return this.containerEl;
	}

	get htmlExportGrid(): HTMLElement {
		return this.gridEl;
	}

	get htmlExportGroups() {
		return this.groups;
	}

	get htmlExportMinimumItemWidth(): number {
		return this.definition.getMinimumItemWidth(this.currentOptions);
	}

	get htmlExportColumnGap(): number {
		return this.definition.columnGap;
	}

	get htmlExportRowGap(): number {
		return this.definition.rowGap;
	}

	prepareHtmlExportData(): void {
		this.refreshGalleryData(false);
	}

	createHtmlExportCard(entry: BasesEntry): Controller {
		const card = this.definition.createCard(this.createCardContext(entry));
		this.onHtmlExportCardCreated(card);
		return card;
	}

	prepareHtmlExportRoot(root: HTMLElement): Promise<void> | void {
		return this.onPrepareHtmlExportRoot(root);
	}

	protected extendCardContext(
		context: CardGalleryCardContext<Options>,
	): Context {
		return context as Context;
	}

	protected onOptionsChanged(
		_options: Options,
		_previousOptions: Options | null,
	): void {}

	protected onGalleryDataUpdated(): void {}

	protected transformGalleryGroups(
		groups: readonly ViewportGridGroup<BasesEntry>[],
		_options: Options,
	): readonly ViewportGridGroup<BasesEntry>[] {
		return groups;
	}

	protected onItemWidthChanged(_itemWidth: number): void {}

	protected onCardCreated(_card: Controller): void {}

	protected onCardAttached(_card: Controller): void {}

	protected onCardDetached(_card: Controller): void {}

	protected onCardDisposed(_card: Controller): void {}

	protected onHtmlExportCardCreated(_card: Controller): void {}

	protected onPrepareHtmlExportRoot(_root: HTMLElement): Promise<void> | void {}

	protected onBeforeGalleryUnload(): void {}

	protected onAfterGalleryUnload(): void {}

	private bindCardEditor(card: Controller, context: Context): void {
		card.element.dataset.mbvCardEditor = '';
		this.cardContexts.set(card.element, context);
		this.cardControllers.set(card.element, card);
	}

	private isGroupCollapsed(group: BasesEntryGroup): boolean {
		const id = getBasesGroupId(group);
		return id !== null && this.getGroupFolds().has(id);
	}

	private toggleGroupCollapsed(group: BasesEntryGroup): void {
		const id = getBasesGroupId(group);
		if (id === null) return;
		const folds = this.getGroupFolds();
		if (!folds.delete(id)) folds.add(id);
		this.groupFoldController.saveGroupFolds?.();
		const collapsed = folds.has(id);
		this.groups = this.groups.map((current) =>
			current.key === id ? { ...current, collapsed } : current,
		);
		this.renderer.setGroups(this.groups);
	}

	private getGroupFolds(): Set<string> {
		return this.groupFoldController.getGroupFolds?.() ?? this.fallbackGroupFolds;
	}

	private readonly handleCardContextMenu = (event: MouseEvent): void => {
		if (!this.supportsCardEditor()) return;
		const target = event.target as Element | null;
		if (!target || target.closest(
			'button, input, textarea, select, [contenteditable="true"], ' +
			'[data-mbv-card-editor-ignore]',
		)) return;
		const cardEl = target.closest<HTMLElement>('[data-mbv-card-editor]');
		if (!cardEl || !this.gridEl.contains(cardEl)) return;
		const context = this.cardContexts.get(cardEl);
		const card = this.cardControllers.get(cardEl);
		if (!context || !card || card.canOpenEditor?.() === false) return;
		event.preventDefault();
		event.stopPropagation();
		const focused = cardEl.ownerDocument.activeElement;
		if (focused instanceof HTMLElement && cardEl.contains(focused)) focused.blur();
		cardEl.ownerDocument.getSelection()?.removeAllRanges();
		card.prepareOpenEditor?.();
		this.editorHost.open(context);
	};

	private createPreviewFactory(context: Context): CardPropertyPreviewFactory {
		return (ownerEl, entry) => {
			const createContext = (nextEntry: BasesEntry): Context => ({
				...context,
				ownerEl,
				entry: nextEntry,
			});
			const card = this.definition.createCard(createContext(entry));
			return {
				element: card.element,
				update: (nextEntry) => card.update(createContext(nextEntry)),
				destroy: () => card.destroy?.(),
				interactive: isInteractiveCard(card) ? card : undefined,
			};
		};
	}

	private createCardContext(entry: BasesEntry): Context {
		return this.extendCardContext({
			app: this.app,
			ownerEl: this.containerEl,
			entry,
			options: this.currentOptions as Options,
			visibleProperties: this.visibleProperties,
			navigation: this.navigation,
		});
	}

	private readonly htmlExporter: CardGalleryHtmlExporter;
}

function isInteractiveCard(value: unknown): value is InteractiveCardController {
	if (!value || typeof value !== 'object') return false;
	const card = value as Partial<InteractiveCardController>;
	return card.element instanceof HTMLElement &&
		card.interactionElement instanceof HTMLElement &&
		card.placementElement instanceof HTMLElement &&
		typeof card.openMarkdown === 'function';
}

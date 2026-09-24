import {
	BasesView,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type BasesViewConfig,
	type QueryController,
} from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import { AnimationFrameTask } from '../../ui/animation-frame-task';
import { createBasesViewportGroups } from '../../ui/bases-entry-groups';
import { ViewportGrid, type ViewportGridGroup } from '../../ui/viewport-grid';

export interface CardGalleryCardContext<Options> {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: Options;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
}

export interface CardGalleryCardController<Context> {
	element: HTMLElement;
	update: (context: Context) => void;
	prepareHtmlExport?: () => Promise<void>;
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
	private currentOptions: Options | null = null;
	private visibleProperties: BasesPropertyId[] = [];
	private groups: readonly ViewportGridGroup<BasesEntry>[] = createBasesViewportGroups([]);
	private readonly dataUpdateTask: AnimationFrameTask;

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
		this.renderer = new ViewportGrid({
			containerEl: this.gridEl,
			getKey: (entry) => entry.file.path,
			create: (entry) => {
				const card = definition.createCard(this.createCardContext(entry));
				this.onCardCreated(card);
				return card;
			},
			update: (card, entry) => card.update(this.createCardContext(entry)),
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
		this.groups = this.transformGalleryGroups(
			createBasesViewportGroups(this.data.groupedData),
			this.currentOptions,
		);
		if (render) {
			this.renderer.setGroups(this.groups);
			this.onGalleryDataUpdated();
		}
	}

	onunload(): void {
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

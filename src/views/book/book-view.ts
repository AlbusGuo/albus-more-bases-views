import type { BasesEntry, QueryController } from 'obsidian';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import {
	createBookCard,
	type BookCardContext,
	type BookCardController,
} from './book-card';
import {
	getBookViewOptions,
	readBookViewOptions,
	type BookViewOptions,
} from './book-options';
import {
	CARD_GRID_COLUMN_GAP,
	DEFAULT_CARD_MIN_WIDTH,
} from '../shared/card-sizing';
import { CardGalleryView } from '../shared/card-gallery-view';
import { BOOK_CARD_EDITOR } from '../shared/card-editor-definitions';
import type { CardGalleryCardContext } from '../shared/card-gallery-view';
import type { ViewportGridGroup } from '../../ui/viewport-grid';
import {
	collectBookSeries,
	type BookSeriesCollection,
	type BookSeriesTransitionSource,
} from './book-series';
import { BookSeriesLightbox } from './book-series-lightbox';
import { createBookGalleryItem } from './book-series-entrance';

export const BOOK_VIEW_TYPE = 'albus-more-bases-views-book';
export { getBookViewOptions };

const CARD_DETAILS_ESTIMATE = 72;

export class BookView extends CardGalleryView<
	BookViewOptions,
	BookCardContext,
	BookCardController
> {
	readonly type = BOOK_VIEW_TYPE;
	private seriesCollections = new Map<string, BookSeriesCollection>();
	private exportGroups: readonly ViewportGridGroup<BasesEntry>[] = [];
	private seriesLightbox: BookSeriesLightbox | null = null;
	private itemWidth = DEFAULT_CARD_MIN_WIDTH;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
		htmlExporter: CardGalleryHtmlExporter,
	) {
		super(controller, parentEl, navigation, viewTabs, htmlExporter, {
			viewClass: 'mbv-book-view',
			gridClass: 'mbv-book-grid',
			slotClass: 'mbv-book-slot',
			readOptions: readBookViewOptions,
			createCard: createBookGalleryItem,
			getMinimumItemWidth: (options) =>
				options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: (itemWidth) =>
				itemWidth * 1.5 + CARD_DETAILS_ESTIMATE,
			columnGap: CARD_GRID_COLUMN_GAP,
			rowGap: 32,
			editor: BOOK_CARD_EDITOR,
		});
	}

	protected extendCardContext(
		context: CardGalleryCardContext<BookViewOptions>,
	): BookCardContext {
		const collection = this.seriesCollections.get(context.entry.file.path);
		return {
			...context,
			seriesCollection: collection,
			openSeries: collection
				? (nextCollection, source) => this.openSeries(nextCollection, source)
				: undefined,
		};
	}

	protected transformGalleryGroups(
		groups: readonly ViewportGridGroup<BasesEntry>[],
		options: BookViewOptions,
	): readonly ViewportGridGroup<BasesEntry>[] {
		this.exportGroups = groups;
		const result = collectBookSeries(
			groups,
			options.seriesProperty,
			options.collapseSeries,
		);
		this.seriesCollections = new Map(result.collectionsByLead);
		return result.groups;
	}

	protected onItemWidthChanged(width: number): void {
		this.itemWidth = width;
	}

	get htmlExportGroups(): readonly ViewportGridGroup<BasesEntry>[] {
		return this.exportGroups;
	}

	createHtmlExportCard(entry: BasesEntry): BookCardController {
		return createBookCard({
			...this.createCardContext(entry),
			seriesCollection: undefined,
			openSeries: undefined,
		});
	}

	protected onBeforeGalleryUnload(): void {
		this.seriesLightbox?.remove();
		this.seriesLightbox = null;
		this.seriesCollections.clear();
		this.exportGroups = [];
	}

	private openSeries(
		collection: BookSeriesCollection,
		source: BookSeriesTransitionSource,
	): void {
		this.seriesLightbox?.remove();
		let lightbox!: BookSeriesLightbox;
		lightbox = new BookSeriesLightbox({
			collection,
			source,
			itemWidth: this.itemWidth,
			createCard: (ownerEl, entry) => createBookCard({
				...this.createCardContext(entry),
				ownerEl,
				seriesCollection: undefined,
				openSeries: undefined,
			}),
			onEdit: (entry) => this.requestCardEditor(entry),
			onClosed: () => {
				if (this.seriesLightbox === lightbox) this.seriesLightbox = null;
			},
		});
		this.seriesLightbox = lightbox;
		lightbox.open();
	}
}

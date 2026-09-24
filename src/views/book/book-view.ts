import type { QueryController } from 'obsidian';
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

export const BOOK_VIEW_TYPE = 'albus-more-bases-views-book';
export { getBookViewOptions };

const CARD_DETAILS_ESTIMATE = 72;

export class BookView extends CardGalleryView<
	BookViewOptions,
	BookCardContext,
	BookCardController
> {
	readonly type = BOOK_VIEW_TYPE;

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
			createCard: createBookCard,
			getMinimumItemWidth: (options) =>
				options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: (itemWidth) =>
				itemWidth * 1.5 + CARD_DETAILS_ESTIMATE,
			columnGap: CARD_GRID_COLUMN_GAP,
			rowGap: 32,
		});
	}
}

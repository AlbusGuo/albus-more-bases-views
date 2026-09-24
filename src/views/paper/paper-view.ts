import type { QueryController } from 'obsidian';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import {
	createPaperCard,
	type PaperCardContext,
	type PaperCardController,
} from './paper-card';
import {
	getPaperViewOptions,
	readPaperViewOptions,
	type PaperViewOptions,
} from './paper-options';
import {
	CARD_GRID_COLUMN_GAP,
	DEFAULT_CARD_MIN_WIDTH,
} from '../shared/card-sizing';
import { CardGalleryView } from '../shared/card-gallery-view';

export const PAPER_VIEW_TYPE = 'albus-more-bases-views-paper';
export { getPaperViewOptions };

const PAPER_ASPECT_RATIO = 1.414;
const CARD_DETAILS_ESTIMATE = 72;

export class PaperView extends CardGalleryView<
	PaperViewOptions,
	PaperCardContext,
	PaperCardController
> {
	readonly type = PAPER_VIEW_TYPE;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
		htmlExporter: CardGalleryHtmlExporter,
	) {
		super(controller, parentEl, navigation, viewTabs, htmlExporter, {
			viewClass: 'mbv-paper-view',
			gridClass: 'mbv-paper-grid',
			slotClass: 'mbv-paper-slot',
			readOptions: readPaperViewOptions,
			createCard: createPaperCard,
			getMinimumItemWidth: (options) =>
				options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: (itemWidth) =>
				itemWidth * PAPER_ASPECT_RATIO + CARD_DETAILS_ESTIMATE,
			columnGap: CARD_GRID_COLUMN_GAP,
			rowGap: 20,
		});
	}
}

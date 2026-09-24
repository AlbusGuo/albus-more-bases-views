import type { QueryController } from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	getMediaViewOptions,
	getPosterHeightFactor,
	readMediaViewOptions,
	type MediaViewOptions,
} from '../media/media-options';
import {
	COMPACT_CARD_GRID_COLUMN_GAP,
	DEFAULT_CARD_MIN_WIDTH,
} from '../shared/card-sizing';
import { CardGalleryView } from '../shared/card-gallery-view';
import {
	createMovieCard,
	type MovieCardContext,
	type MovieCardController,
} from './movie-card';

export const MOVIE_VIEW_TYPE = 'albus-more-bases-views-movie';
export { getMediaViewOptions as getMovieViewOptions };

export class MovieView extends CardGalleryView<
	MediaViewOptions,
	MovieCardContext,
	MovieCardController
> {
	readonly type = MOVIE_VIEW_TYPE;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
		htmlExporter: CardGalleryHtmlExporter,
	) {
		super(controller, parentEl, navigation, viewTabs, htmlExporter, {
			viewClass: 'mbv-movie-view',
			gridClass: 'mbv-movie-grid',
			slotClass: 'mbv-movie-slot',
			readOptions: readMediaViewOptions,
			createCard: createMovieCard,
			getMinimumItemWidth: (options) =>
				options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: (itemWidth, options) =>
				itemWidth * getPosterHeightFactor(options?.posterAspectRatio ?? 2 / 3) + 72,
			columnGap: COMPACT_CARD_GRID_COLUMN_GAP,
			rowGap: 20,
		});
	}

	protected onOptionsChanged(options: MediaViewOptions): void {
		const aspectRatio = String(options.posterAspectRatio);
		if (this.containerEl.style.getPropertyValue('--mbv-movie-aspect-ratio') !== aspectRatio) {
			this.containerEl.setCssProps({ '--mbv-movie-aspect-ratio': aspectRatio });
		}
	}
}

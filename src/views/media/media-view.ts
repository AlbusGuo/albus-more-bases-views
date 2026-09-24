import type { QueryController } from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	createMediaCard,
	type MediaCardContext,
	type MediaCardController,
} from './media-card';
import {
	getMediaViewOptions,
	getPosterHeightFactor,
	readMediaViewOptions,
	type MediaViewOptions,
} from './media-options';
import {
	COMPACT_CARD_GRID_COLUMN_GAP,
	DEFAULT_CARD_MIN_WIDTH,
} from '../shared/card-sizing';
import { CardGalleryView } from '../shared/card-gallery-view';

export const MEDIA_VIEW_TYPE = 'albus-more-bases-views-media-diorama';
export { getMediaViewOptions };

export class MediaView extends CardGalleryView<
	MediaViewOptions,
	MediaCardContext,
	MediaCardController
> {
	readonly type = MEDIA_VIEW_TYPE;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
		htmlExporter: CardGalleryHtmlExporter,
	) {
		super(controller, parentEl, navigation, viewTabs, htmlExporter, {
			viewClass: 'mbv-media-view',
			gridClass: 'mbv-media-grid',
			slotClass: 'mbv-media-slot',
			readOptions: readMediaViewOptions,
			createCard: createMediaCard,
			getMinimumItemWidth: (options) =>
				options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: (itemWidth, options) =>
				itemWidth * getPosterHeightFactor(options?.posterAspectRatio ?? 2 / 3) + 80,
			columnGap: COMPACT_CARD_GRID_COLUMN_GAP,
			rowGap: 20,
		});
	}

	protected onOptionsChanged(options: MediaViewOptions): void {
		const aspectRatio = String(options.posterAspectRatio);
		if (this.containerEl.style.getPropertyValue('--mbv-media-aspect-ratio') !== aspectRatio) {
			this.containerEl.setCssProps({ '--mbv-media-aspect-ratio': aspectRatio });
		}
	}
}

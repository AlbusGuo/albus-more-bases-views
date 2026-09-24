import type { QueryController } from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	createGameCard,
	type GameCardContext,
	type GameCardController,
} from './game-card';
import {
	getGameViewOptions,
	readGameViewOptions,
	type GameViewOptions,
} from './game-options';
import {
	CARD_GRID_COLUMN_GAP,
	DEFAULT_CARD_MIN_WIDTH,
} from '../shared/card-sizing';
import { CardGalleryView } from '../shared/card-gallery-view';

export const GAME_VIEW_TYPE = 'albus-more-bases-views-game';
export { getGameViewOptions };

export class GameView extends CardGalleryView<
	GameViewOptions,
	GameCardContext,
	GameCardController
> {
	readonly type = GAME_VIEW_TYPE;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
		htmlExporter: CardGalleryHtmlExporter,
	) {
		super(controller, parentEl, navigation, viewTabs, htmlExporter, {
			viewClass: 'mbv-game-view',
			gridClass: 'mbv-game-grid',
			slotClass: 'mbv-game-slot',
			readOptions: readGameViewOptions,
			createCard: createGameCard,
			getMinimumItemWidth: (options) =>
				options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: (itemWidth) => itemWidth * 4 / 3 + 90,
			columnGap: CARD_GRID_COLUMN_GAP,
			rowGap: 40,
		});
	}
}

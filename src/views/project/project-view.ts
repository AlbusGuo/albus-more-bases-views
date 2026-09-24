import type { QueryController } from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	createProjectCard,
	type ProjectCardContext,
	type ProjectCardController,
} from './project-card';
import {
	getProjectViewOptions,
	readProjectViewOptions,
	type ProjectViewOptions,
} from './project-options';
import {
	COMPACT_CARD_GRID_COLUMN_GAP,
	DEFAULT_CARD_MIN_WIDTH,
} from '../shared/card-sizing';
import { CardGalleryView } from '../shared/card-gallery-view';

export const PROJECT_VIEW_TYPE = 'albus-more-bases-views-project';
export { getProjectViewOptions };

export class ProjectView extends CardGalleryView<
	ProjectViewOptions,
	ProjectCardContext,
	ProjectCardController
> {
	readonly type = PROJECT_VIEW_TYPE;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
		htmlExporter: CardGalleryHtmlExporter,
	) {
		super(controller, parentEl, navigation, viewTabs, htmlExporter, {
			viewClass: 'mbv-project-view',
			gridClass: 'mbv-project-grid',
			slotClass: 'mbv-project-slot',
			readOptions: readProjectViewOptions,
			createCard: createProjectCard,
			getMinimumItemWidth: (options) =>
				options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: () => 560,
			columnGap: COMPACT_CARD_GRID_COLUMN_GAP,
			rowGap: 16,
		});
	}
}

import type { QueryController } from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	createCourseCard,
	type CourseCardContext,
	type CourseCardController,
} from './course-card';
import {
	getCourseViewOptions,
	readCourseViewOptions,
	type CourseViewOptions,
} from './course-options';
import { DEFAULT_CARD_MIN_WIDTH } from '../shared/card-sizing';
import { CardGalleryView } from '../shared/card-gallery-view';

export const COURSE_VIEW_TYPE = 'albus-more-bases-views-course';
export { getCourseViewOptions };

export class CourseView extends CardGalleryView<
	CourseViewOptions,
	CourseCardContext,
	CourseCardController
> {
	readonly type = COURSE_VIEW_TYPE;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
		htmlExporter: CardGalleryHtmlExporter,
	) {
		super(controller, parentEl, navigation, viewTabs, htmlExporter, {
			viewClass: 'mbv-course-view',
			gridClass: 'mbv-course-grid',
			slotClass: 'mbv-course-slot',
			readOptions: readCourseViewOptions,
			createCard: createCourseCard,
			getMinimumItemWidth: (options) =>
				options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: () => 260,
			columnGap: 20,
			rowGap: 20,
		});
	}
}

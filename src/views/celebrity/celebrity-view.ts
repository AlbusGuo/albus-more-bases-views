import type { QueryController } from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	createCelebrityCard,
	type CelebrityCardContext,
	type CelebrityCardController,
} from './celebrity-card';
import {
	getCelebrityViewOptions,
	readCelebrityViewOptions,
	type CelebrityViewOptions,
} from './celebrity-options';
import { applyCelebrityFrameTexture } from './celebrity-frame-texture';
import {
	CARD_GRID_COLUMN_GAP,
	DEFAULT_CARD_MIN_WIDTH,
} from '../shared/card-sizing';
import { CardGalleryView } from '../shared/card-gallery-view';

export const CELEBRITY_VIEW_TYPE = 'albus-more-bases-views-celebrity';
export { getCelebrityViewOptions };

export class CelebrityView extends CardGalleryView<
	CelebrityViewOptions,
	CelebrityCardContext,
	CelebrityCardController
> {
	readonly type = CELEBRITY_VIEW_TYPE;

	private frameMaterial: CelebrityViewOptions['frameMaterial'] | null = null;
	private itemWidth = DEFAULT_CARD_MIN_WIDTH;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
		htmlExporter: CardGalleryHtmlExporter,
	) {
		super(controller, parentEl, navigation, viewTabs, htmlExporter, {
			viewClass: 'mbv-celebrity-view',
			gridClass: 'mbv-celebrity-grid',
			slotClass: 'mbv-celebrity-slot',
			readOptions: readCelebrityViewOptions,
			createCard: createCelebrityCard,
			getMinimumItemWidth: (options) =>
				options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: (itemWidth) => itemWidth * 4 / 3 + 72,
			columnGap: CARD_GRID_COLUMN_GAP,
			rowGap: 32,
			overscanRows: 2,
		});
	}

	protected onOptionsChanged(options: CelebrityViewOptions): void {
		this.containerEl.style.setProperty(
			'--mbv-celebrity-frame-width', `${options.frameWidth}px`,
		);
		this.containerEl.style.setProperty(
			'--mbv-celebrity-mat-width', `${options.matWidth}px`,
		);
		this.updateFrameGeometry();
		if (this.frameMaterial !== options.frameMaterial) {
			this.frameMaterial = options.frameMaterial;
			applyCelebrityFrameTexture(this.containerEl, options.frameMaterial);
		}
	}

	protected onItemWidthChanged(itemWidth: number): void {
		this.itemWidth = itemWidth;
		this.updateFrameGeometry();
	}

	private updateFrameGeometry(): void {
		const options = this.galleryOptions;
		if (!options) return;
		this.setGeometryProperty(
			'--mbv-celebrity-effective-frame-width',
			Math.min(options.frameWidth, this.itemWidth * 0.18),
		);
		this.setGeometryProperty(
			'--mbv-celebrity-effective-mat-width',
			Math.min(options.matWidth, this.itemWidth * 0.12),
		);
	}

	private setGeometryProperty(property: string, value: number): void {
		const formatted = `${Math.round(value * 100) / 100}px`;
		if (this.containerEl.style.getPropertyValue(property) === formatted) return;
		this.containerEl.style.setProperty(property, formatted);
	}
}

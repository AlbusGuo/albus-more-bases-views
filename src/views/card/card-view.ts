import type { QueryController } from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import type { ViewPackManager } from '../../services/view-pack-manager';
import { ViewPackGate } from '../../ui/view-pack-gate';
import {
	createCollectibleCard,
	type CollectibleCardContext,
	type CollectibleCardController,
} from './card-card';
import { applyCardMaterialAssets } from '../shared/card-material-assets';
import { CardInteractionController, createCardInteractionExportScript } from '../shared/card-interaction';
import {
	getCardViewOptions,
	readCardViewOptions,
	type CardViewOptions,
} from './card-options';
import { CardMaterialBag } from '../shared/card-material-surface';
import {
	CARD_GRID_COLUMN_GAP,
	DEFAULT_CARD_MIN_WIDTH,
} from '../shared/card-sizing';
import {
	CardGalleryView,
	type CardGalleryCardContext,
} from '../shared/card-gallery-view';

export const CARD_VIEW_TYPE = 'albus-more-bases-views-card';
export { getCardViewOptions };

const CARD_DETAILS_ESTIMATE = 72;
const CARD_INTERACTION_OPTIONS = {
	openingRotation: false,
	contextMenu: 'delegate',
	openExpandedOnClick: true,
} as const;

export class CardView extends CardGalleryView<
	CardViewOptions,
	CollectibleCardContext,
	CollectibleCardController
> {
	readonly type = CARD_VIEW_TYPE;

	private readonly interaction: CardInteractionController;
	private readonly materials = new CardMaterialBag();
	private readonly packGate: ViewPackGate;
	private packReady = false;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
		htmlExporter: CardGalleryHtmlExporter,
		packs: ViewPackManager,
	) {
		super(controller, parentEl, navigation, viewTabs, htmlExporter, {
			viewClass: 'mbv-collectible-view',
			gridClass: 'mbv-collectible-grid',
			slotClass: 'mbv-collectible-slot',
			readOptions: readCardViewOptions,
			createCard: createCollectibleCard,
			getMinimumItemWidth: (options) =>
				options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: (itemWidth, options) =>
				itemWidth / Math.max(0.1, options?.aspectRatio ?? 0.718) +
				CARD_DETAILS_ESTIMATE,
			columnGap: CARD_GRID_COLUMN_GAP,
			rowGap: 32,
			overscanRows: 2,
		});
		this.interaction = new CardInteractionController(
			this.containerEl,
			CARD_INTERACTION_OPTIONS,
		);
		this.containerEl.addClass('is-pack-pending');
		this.packGate = new ViewPackGate(parentEl, packs, {
			id: 'card',
			displayName: '卡牌',
			filename: 'card.mbvpack',
		}, () => this.activatePack());
	}

	onDataUpdated(): void {
		if (this.packReady) super.onDataUpdated();
	}

	getViewActions(): Array<{
		name: string;
		icon: string;
		callback: () => void;
	}> {
		return super.getViewActions().map(action => ({
			...action,
			callback: () => {
				if (this.packReady) action.callback();
				else this.packGate.showUnavailableNotice();
			},
		}));
	}

	protected extendCardContext(
		context: CardGalleryCardContext<CardViewOptions>,
	): CollectibleCardContext {
		return {
			...context,
			options: {
				...context.options,
				material: this.materials.resolve(
					context.entry.file.path,
					context.options.material,
				),
			},
		};
	}

	protected onOptionsChanged(
		options: CardViewOptions,
		previousOptions: CardViewOptions | null,
	): void {
		this.interaction.setExpandOnClick(options.clickToExpand);
		if (options.material !== previousOptions?.material) this.materials.clear();
	}

	protected onCardCreated(card: CollectibleCardController): void {
		this.interaction.register(card);
	}

	protected onCardDetached(card: CollectibleCardController): void {
		this.interaction.detach(card);
	}

	protected onCardDisposed(card: CollectibleCardController): void {
		this.interaction.unregister(card);
	}

	protected onPrepareHtmlExportRoot(root: HTMLElement): void {
		const scriptEl = root.ownerDocument.createElement('script');
		scriptEl.textContent = createCardInteractionExportScript(
			'.mbv-collectible-view',
			{
				...CARD_INTERACTION_OPTIONS,
				expandOnClick: this.galleryOptions?.clickToExpand ?? true,
			},
		);
		root.append(scriptEl);
	}

	protected onBeforeGalleryUnload(): void {
		this.packGate.destroy();
		this.interaction.destroy();
		this.materials.clear();
	}

	private activatePack(): void {
		if (this.packReady) return;
		this.packReady = true;
		applyCardMaterialAssets(this.containerEl, 'card');
		this.containerEl.removeClass('is-pack-pending');
		super.onDataUpdated();
	}

}

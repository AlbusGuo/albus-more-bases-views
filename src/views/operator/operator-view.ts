import type { QueryController } from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import type { ViewPackManager } from '../../services/view-pack-manager';
import { ViewPackGate } from '../../ui/view-pack-gate';
import type { OperatorAssetService } from './operator-assets';
import { OperatorArtworkRasterizer } from './operator-artwork-rasterizer';
import {
	CARD_GRID_COLUMN_GAP,
	DEFAULT_CARD_MIN_WIDTH,
} from '../shared/card-sizing';
import {
	CardGalleryView,
	type CardGalleryCardContext,
} from '../shared/card-gallery-view';
import {
	createOperatorCard,
	type OperatorCardContext,
	type OperatorCardController,
} from './operator-card';
import { OPERATOR_BADGE_SWITCH_INTERVAL_MS } from './operator-constants';
import { OperatorDefenseModal } from './operator-defense-modal';
import {
	getOperatorViewOptions,
	readOperatorViewOptions,
	type OperatorViewOptions,
} from './operator-options';

export const OPERATOR_VIEW_TYPE = 'albus-more-bases-views-operator';
export { getOperatorViewOptions };

export class OperatorView extends CardGalleryView<
	OperatorViewOptions,
	OperatorCardContext,
	OperatorCardController
> {
	readonly type = OPERATOR_VIEW_TYPE;

	private readonly defenseButtonEl: HTMLButtonElement;
	private readonly defenseImageEl: HTMLImageElement;
	private readonly attachedCards = new Set<OperatorCardController>();
	private readonly cards = new Set<OperatorCardController>();
	private readonly artworkRasterizer: OperatorArtworkRasterizer;
	private artworkWidth = DEFAULT_CARD_MIN_WIDTH;
	private badgeSwitchTimer: number | null = null;
	private badgeSequence = 0;
	private hiddenMode = false;
	private readonly packGate: ViewPackGate;
	private packReady = false;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
		htmlExporter: CardGalleryHtmlExporter,
		private readonly assets: OperatorAssetService,
		packs: ViewPackManager,
	) {
		super(controller, parentEl, navigation, viewTabs, htmlExporter, {
			viewClass: 'mbv-operator-view',
			gridClass: 'mbv-operator-grid',
			slotClass: 'mbv-operator-slot',
			readOptions: readOperatorViewOptions,
			createCard: createOperatorCard,
			getMinimumItemWidth: (options) =>
				options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: (itemWidth) => itemWidth * 25 / 12 + 88,
			columnGap: CARD_GRID_COLUMN_GAP,
			rowGap: 64,
			overscanRows: 0,
		});
		this.artworkRasterizer = new OperatorArtworkRasterizer();
		const resetPointerMotion = (): void => {
			for (const card of this.attachedCards) card.resetPointerMotion();
		};
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (ownerWindow) this.registerDomEvent(ownerWindow, 'blur', resetPointerMotion);
		this.registerDomEvent(
			this.containerEl.ownerDocument,
			'visibilitychange',
			() => {
				if (this.containerEl.ownerDocument.hidden) resetPointerMotion();
			},
		);

		const commandBarEl = this.containerEl.createDiv('mbv-operator-command-bar');
		this.gridEl.before(commandBarEl);
		this.defenseButtonEl = commandBarEl.createEl('button', {
			cls: 'mbv-operator-defense-toggle',
			attr: {
				type: 'button',
				'aria-label': '关闭全舰防御系统',
				'aria-pressed': 'false',
			},
		});
		const markerEl = this.defenseButtonEl.createSpan(
			'mbv-operator-defense-marker',
		);
		this.defenseImageEl = markerEl.createEl('img', {
			attr: { alt: '', decoding: 'async' },
		});
		this.defenseButtonEl.addEventListener('click', () => {
			if (!this.packReady) {
				this.packGate.showUnavailableNotice();
				return;
			}
			if (this.hiddenMode) {
				this.setHiddenMode(false);
				return;
			}
			new OperatorDefenseModal(
				this.app,
				{
					eye: this.assets.getDefenseSource(true),
					check: this.assets.getDefenseCheckSource(),
					back: this.assets.getDefenseBackSource(),
					rhodes: this.assets.getFactionSource('罗德岛') ?? '',
				},
				() => this.setHiddenMode(true),
			).open();
		});
		this.containerEl.addClass('is-pack-pending');
		this.packGate = new ViewPackGate(parentEl, packs, {
			id: 'operator',
			displayName: '干员',
			filename: 'operator.mbvpack',
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
		context: CardGalleryCardContext<OperatorViewOptions>,
	): OperatorCardContext {
		return {
			...context,
			hiddenMode: this.hiddenMode,
			assets: this.assets,
			artworkRasterizer: this.artworkRasterizer,
			artworkWidth: this.artworkWidth,
		};
	}

	protected onItemWidthChanged(itemWidth: number): void {
		this.artworkWidth = itemWidth;
		for (const card of this.cards) card.setArtworkWidth(itemWidth);
	}

	protected onCardCreated(card: OperatorCardController): void {
		this.cards.add(card);
		card.setArtworkWidth(this.artworkWidth);
		card.syncBadges(this.badgeSequence, false);
	}

	protected onCardAttached(card: OperatorCardController): void {
		this.attachedCards.add(card);
		card.attach();
		card.syncBadges(this.badgeSequence, false);
	}

	protected onCardDetached(card: OperatorCardController): void {
		this.attachedCards.delete(card);
		card.suspend();
	}

	protected onCardDisposed(card: OperatorCardController): void {
		this.attachedCards.delete(card);
		this.cards.delete(card);
	}

	protected onHtmlExportCardCreated(card: OperatorCardController): void {
		card.setArtworkWidth(this.artworkWidth);
		card.syncBadges(0, false);
	}

	protected onPrepareHtmlExportRoot(root: HTMLElement): void {
		const ownerDocument = root.ownerDocument;
		const storeEl = ownerDocument.createElement('div');
		storeEl.className = 'mbv-operator-export-assets';
		root.append(storeEl);
		const appendAsset = (kind: string, source: string): void => {
			if (!source) return;
			const imageEl = ownerDocument.createElement('img');
			imageEl.src = source;
			imageEl.alt = '';
			imageEl.dataset.kind = kind;
			imageEl.decoding = 'async';
			storeEl.append(imageEl);
		};
		appendAsset('eye-on', this.assets.getDefenseSource(false));
		appendAsset('eye-off', this.assets.getDefenseSource(true));
		appendAsset('check', this.assets.getDefenseCheckSource());
		appendAsset('back', this.assets.getDefenseBackSource());
		appendAsset('rhodes', this.assets.getFactionSource('罗德岛'));
	}

	protected onGalleryDataUpdated(): void {
		this.startBadgeSwitching();
	}

	protected onBeforeGalleryUnload(): void {
		this.packGate.destroy();
		this.stopBadgeSwitching();
	}

	protected onAfterGalleryUnload(): void {
		this.attachedCards.clear();
		this.cards.clear();
		this.artworkRasterizer.destroy();
	}

	private startBadgeSwitching(): void {
		if (this.badgeSwitchTimer !== null) return;
		const ownerWindow = this.defenseButtonEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.badgeSwitchTimer = ownerWindow.setInterval(() => {
			if (this.defenseButtonEl.ownerDocument.hidden) return;
			this.badgeSequence += 1;
			for (const card of this.attachedCards) {
				if (!card.element.isConnected) continue;
				card.syncBadges(this.badgeSequence);
			}
		}, OPERATOR_BADGE_SWITCH_INTERVAL_MS);
	}

	private activatePack(): void {
		if (this.packReady) return;
		this.packReady = true;
		this.containerEl.removeClass('is-pack-pending');
		this.updateDefenseButton();
		super.onDataUpdated();
	}

	private stopBadgeSwitching(): void {
		if (this.badgeSwitchTimer === null) return;
		this.defenseButtonEl.ownerDocument.defaultView?.clearInterval(
			this.badgeSwitchTimer,
		);
		this.badgeSwitchTimer = null;
	}

	private setHiddenMode(hiddenMode: boolean): void {
		if (this.hiddenMode === hiddenMode) return;
		this.hiddenMode = hiddenMode;
		this.updateDefenseButton();
		this.refreshGalleryCards();
	}

	private updateDefenseButton(): void {
		this.defenseButtonEl.classList.toggle('is-hidden-mode', this.hiddenMode);
		this.defenseButtonEl.setAttribute('aria-pressed', String(this.hiddenMode));
		this.defenseButtonEl.setAttribute(
			'aria-label',
			this.hiddenMode ? '恢复全舰防御系统' : '关闭全舰防御系统',
		);
		this.defenseImageEl.src = this.assets.getDefenseSource(this.hiddenMode);
	}
}

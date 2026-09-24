import { ListValue, NullValue, type BasesEntry, type BasesPropertyId, type QueryController, type Value } from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { CardGalleryHtmlExporter } from '../../services/card-gallery-html-exporter';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import type { ViewPackManager } from '../../services/view-pack-manager';
import { CardGalleryView } from '../shared/card-gallery-view';
import type { ViewportGridGroup } from '../../ui/viewport-grid';
import { CARD_GRID_COLUMN_GAP, DEFAULT_CARD_MIN_WIDTH } from '../shared/card-sizing';
import { HearthstoneCard, type HearthstoneCardContext } from './hearthstone-card';
import { readHearthstoneOptions, type HearthstoneOptions } from './hearthstone-options';
import { CardInteractionController, createCardInteractionExportScript, type CardInteractionOptions } from '../shared/card-interaction';
import { CardMaterialBag } from '../shared/card-material-surface';
import { applyCardMaterialAssets } from '../shared/card-material-assets';
import { ImageResourceCache } from '../../services/image-resource';
import { FrameWorkQueue } from '../../ui/frame-work-queue';
import type { CardGalleryCardContext } from '../shared/card-gallery-view';
import { HEARTHSTONE_VIEWPORT_HEIGHT, HEARTHSTONE_VIEWPORT_WIDTH } from './hearthstone-layout';
import { HearthstoneSurfaceMaskCache } from './hearthstone-scene';
import { buildHearthstoneRelations } from './hearthstone-relations';
import { createHearthstoneRelatedExportScript } from './hearthstone-related-cards';
import { MinionPropertyModal, type HearthstoneEditorSuggestions } from './hearthstone-property-modal';
import { loadHearthstoneAssets } from './hearthstone-template';
import { ViewPackGate } from '../../ui/view-pack-gate';

export const HEARTHSTONE_VIEW_TYPE = 'albus-more-bases-views-hearthstone';
export { getHearthstoneViewOptions } from './hearthstone-options';

const INTERACTION_OPTIONS: CardInteractionOptions = {
	cardSelector: '.mbv-hs-card', faceSelector: '.mbv-hs-face',
	placementSelector: '.mbv-hs-face', boundsSelector: '.mbv-hs-rotator', contextMenu: 'delegate',
	openExpandedOnClick: true,
	cachePointerRect: true,
};

export class HearthstoneView extends CardGalleryView<HearthstoneOptions, HearthstoneCardContext, HearthstoneCard> {
	readonly type = HEARTHSTONE_VIEW_TYPE;
	private readonly interaction: CardInteractionController;
	private readonly materials = new CardMaterialBag();
	private readonly images = new ImageResourceCache();
	private readonly surfaceMasks = new HearthstoneSurfaceMaskCache();
	private readonly work: FrameWorkQueue;
	private readonly cards = new Set<HearthstoneCard>();
	private currentEntries: readonly BasesEntry[] = [];
	private relatedEntries = new Map<string, readonly BasesEntry[]>();
	private relatedChildPaths = new Set<string>();
	private modal: MinionPropertyModal | null = null;
	private editorOpening = false;
	private disposed = false;
	private itemWidth = 160;
	private readonly packGate: ViewPackGate;
	private packReady = false;
	constructor(controller: QueryController, parentEl: HTMLElement, navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService, htmlExporter: CardGalleryHtmlExporter,
		packs: ViewPackManager) {
		super(controller, parentEl, navigation, viewTabs, htmlExporter, {
			viewClass: 'mbv-hs-view', gridClass: 'mbv-hs-grid', slotClass: 'mbv-hs-slot',
			readOptions: readHearthstoneOptions, createCard: (context) => new HearthstoneCard(context),
			getMinimumItemWidth: (options) => options?.cardMinWidth ?? DEFAULT_CARD_MIN_WIDTH,
			estimatedRowHeight: (width) => width * HEARTHSTONE_VIEWPORT_HEIGHT / HEARTHSTONE_VIEWPORT_WIDTH + 72,
			columnGap: CARD_GRID_COLUMN_GAP, rowGap: 24, overscanRows: 1, maxDetachedItems: 48,
		});
		this.containerEl.addClass('is-pack-pending');
		this.packGate = new ViewPackGate(parentEl, packs, {
			id: 'hearthstone',
			displayName: '炉石',
			filename: 'hearthstone.mbvpack',
		}, () => this.activatePack());
		this.work = new FrameWorkQueue(this.containerEl.ownerDocument.defaultView ?? window);
		this.interaction = new CardInteractionController(this.containerEl, INTERACTION_OPTIONS);
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
	protected extendCardContext(context: CardGalleryCardContext<HearthstoneOptions>): HearthstoneCardContext {
		return { ...context, options: { ...context.options, material: this.materials.resolve(context.entry.file.path, context.options.material) },
			relatedEntries: (this.relatedEntries.get(context.entry.file.path) ?? []).map(entry => ({
				entry,
				material: this.materials.resolve(entry.file.path, context.options.material),
			})),
			images: this.images, work: this.work, surfaceMasks: this.surfaceMasks,
			resetPointer: card => this.interaction.resetPointer(card.element),
			openEditor: entry => this.beginOpenEditor(entry, context.options),
			isEditorOpen: () => this.editorOpening || this.modal !== null };
	}
	protected transformGalleryGroups(
		groups: readonly ViewportGridGroup<BasesEntry>[],
		options: HearthstoneOptions,
	): readonly ViewportGridGroup<BasesEntry>[] {
		this.currentEntries = uniqueEntries(groups);
		const relations = buildHearthstoneRelations(
			this.app,
			groups,
			options.properties.derivedParent,
		);
		this.relatedChildPaths = new Set(relations.childPaths);
		if (!options.collapseRelatedCards) {
			this.relatedEntries.clear();
			return groups;
		}
		this.relatedEntries = new Map(relations.relatedByParent);
		return relations.groups;
	}
	protected onOptionsChanged(options: HearthstoneOptions, previous: HearthstoneOptions | null): void { if (options.material !== previous?.material) this.materials.clear(); }
	protected onCardCreated(card: HearthstoneCard): void { this.cards.add(card); card.setArtworkWidth(this.itemWidth); this.interaction.register(card); }
	protected onCardAttached(card: HearthstoneCard): void { card.attach(); }
	protected onCardDetached(card: HearthstoneCard): void { this.interaction.detach(card); card.suspend(); }
	protected onCardDisposed(card: HearthstoneCard): void { this.interaction.unregister(card); this.cards.delete(card); }
	protected onItemWidthChanged(width: number): void { this.itemWidth = width; for (const card of this.cards) card.setArtworkWidth(width); }
	protected onBeforeGalleryUnload(): void {
		this.disposed = true;
		this.packGate.destroy();
		this.editorOpening = false;
		this.modal?.close(); this.modal = null;
		this.interaction.destroy(); this.materials.clear(); this.relatedEntries.clear();
		this.relatedChildPaths.clear(); this.currentEntries = [];
	}
	protected onAfterGalleryUnload(): void { this.images.destroy(); this.surfaceMasks.clear(); this.work.destroy(); this.cards.clear(); }
	protected onPrepareHtmlExportRoot(root: HTMLElement): void {
		const script = root.ownerDocument.createElement('script');
		script.textContent = createCardInteractionExportScript('.mbv-hs-view', INTERACTION_OPTIONS) +
			'\n' + createHearthstoneRelatedExportScript();
		root.append(script);
	}
	private activatePack(): void {
		if (this.disposed || this.packReady) return;
		this.packReady = true;
		applyCardMaterialAssets(this.containerEl, 'hearthstone');
		this.containerEl.removeClass('is-pack-pending');
		super.onDataUpdated();
	}
	private beginOpenEditor(entry: BasesEntry, options: HearthstoneOptions): void {
		this.editorOpening = true;
		void this.openEditor(entry, options).finally(() => { this.editorOpening = false; });
	}
	private async openEditor(entry: BasesEntry, options: HearthstoneOptions): Promise<void> {
		const assets = await loadHearthstoneAssets();
		if (this.disposed) return;
		if (this.modal?.containerEl.isConnected) this.modal.close();
		const ownerWindow = this.containerEl.ownerDocument.defaultView ?? window;
		const modal = new MinionPropertyModal(
			this.app, entry.file, options, assets, this.editorSuggestions(options),
			() => {
				ownerWindow.setTimeout(() => {
					if (this.modal === modal) this.modal = null;
				}, 0);
			},
		);
		this.modal = modal;
		modal.open();
	}
	private editorSuggestions(options: HearthstoneOptions): HearthstoneEditorSuggestions {
		const noteFiles = this.currentEntries
			.filter(entry => !this.relatedChildPaths.has(entry.file.path))
			.map(entry => entry.file);
		return {
			noteFiles,
			cardNumbers: collectPropertyValues(this.currentEntries, options.properties.cardNumber),
			expansions: collectPropertyValues(this.currentEntries, options.properties.expansion),
			tribes: collectPropertyValues(this.currentEntries, options.properties.tribes),
		};
	}
}

function collectPropertyValues(
	entries: readonly BasesEntry[],
	property: BasesPropertyId | null,
): string[] {
	if (!property) return [];
	const values = new Set<string>();
	const collect = (value: Value | null): void => {
		if (!value || value instanceof NullValue) return;
		if (value instanceof ListValue) {
			for (let index = 0; index < value.length(); index += 1) collect(value.get(index));
			return;
		}
		const text = value.toString().trim();
		if (text) values.add(text);
	};
	for (const entry of entries) collect(entry.getValue(property));
	return [...values].sort((left, right) => left.localeCompare(right, 'zh-CN', {
		numeric: true, sensitivity: 'base',
	}));
}

function uniqueEntries(groups: readonly ViewportGridGroup<BasesEntry>[]): BasesEntry[] {
	const entries: BasesEntry[] = [], seen = new Set<string>();
	for (const group of groups) for (const entry of group.items) {
		if (seen.has(entry.file.path)) continue;
		seen.add(entry.file.path); entries.push(entry);
	}
	return entries;
}

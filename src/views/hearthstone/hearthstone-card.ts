import { Keymap, Notice, type BasesEntry } from 'obsidian';
import hearthstoneLegendCardBack from '../../../assets/card/hearthstone-legend-card-back.webp';
import { resolveBundledImage } from '../../ui/bundled-image';
import type { ImageResourceCache } from '../../services/image-resource';
import type { FrameWorkQueue } from '../../ui/frame-work-queue';
import { createCardPropertyRenderer } from '../shared/card-properties';
import { applyCardMaterial, type CardMaterialSelection } from '../shared/card-material-surface';
import type { CardGalleryCardContext } from '../shared/card-gallery-view';
import { prepareHearthstoneFonts } from './hearthstone-fonts';
import { cardKind, isHeroCard, isSkillCard, readArtworkPosition, type MinionData } from './hearthstone-model';
import type { HearthstoneOptions } from './hearthstone-options';
import { MinionScene, type HearthstoneSurfaceMaskCache, type MinionArtwork } from './hearthstone-scene';
import { loadHearthstoneAssetsFor, type HearthstoneAssets } from './hearthstone-template';
import { HEARTHSTONE_CARD_WIDTH, HEARTHSTONE_VIEWPORT_WIDTH } from './hearthstone-layout';
import { HearthstoneHitSurface } from './hearthstone-hit-surface';
import { HearthstoneHeroPowerView } from './hearthstone-hero-power-view';
import {
	getHearthstoneFlavorFrame,
	hasHearthstoneFlavorRarity,
	HEARTHSTONE_FLAVOR_FRAME,
} from './hearthstone-flavor-assets';
import { renderDescriptionMarkup } from './hearthstone-text';
import {
	readHearthstoneEntryData,
	readHearthstoneEntryInput,
	resolveHearthstoneEntryImages,
} from './hearthstone-entry';
import { HearthstoneRelatedCards } from './hearthstone-related-cards';

export interface HearthstoneRelatedEntry {
	entry: BasesEntry;
	material: CardMaterialSelection;
}

export interface HearthstoneCardContext extends CardGalleryCardContext<HearthstoneOptions> {
	images: ImageResourceCache; work: FrameWorkQueue; surfaceMasks: HearthstoneSurfaceMaskCache;
	relatedEntries: readonly HearthstoneRelatedEntry[];
	resetPointer: (card: HearthstoneCard) => void;
	openEditor: (entry: BasesEntry) => void;
	isEditorOpen: () => boolean;
}
const properties = createCardPropertyRenderer<HearthstoneCardContext>('mbv-hs-card-details');
export class HearthstoneCard {
	readonly element: HTMLElement;
	readonly interactionElement: HTMLElement;
	readonly placementElement: HTMLElement;
	private readonly translated: HTMLElement;
	private readonly rotator: HTMLElement;
	private readonly accessibleLabel: HTMLElement;
	private readonly revealEl: HTMLElement;
	private readonly flavorFrameEl: HTMLImageElement;
	private readonly flavorTextEl: HTMLElement;
	private readonly flavorExpansionEl: HTMLElement;
	private readonly flavorRarityEl: HTMLElement;
	private skillView: HearthstoneHeroPowerView | null = null;
	private relatedCards: HearthstoneRelatedCards | null = null;
	private context: HearthstoneCardContext;
	private readonly scene: MinionScene;
	private readonly hitSurface: HearthstoneHitSurface;
	private readonly message: HTMLElement;
	private readonly ready: Promise<void>;
	private assets: HearthstoneAssets | null = null;
	private data: MinionData;
	private input: Record<string, unknown> = {};
	private artworkSource = '';
	private imageSignature = '';
	private detailSignature = '';
	private materialSignature = '';
	private flavorSignature = '';
	private flavorFrameSource = HEARTHSTONE_FLAVOR_FRAME;
	private displayedFlavorData: MinionData | null = null;
	private collapseCleanupTimer: number | null = null;
	private paintCommitFrame: number | null = null;
	private paintRestoreFrame: number | null = null;
	private paintProxyEl: HTMLElement | null = null;
	private disposed = false;
	private attached = false;
	private expanded = false;
	private width = 160;
	private exportMode = false;
	private assetLoadVersion = 0;
	private assetScope = '';
	constructor(context: HearthstoneCardContext) {
		this.context = context; this.data = readHearthstoneEntryData(context, {});
		const document = context.ownerEl.ownerDocument;
		this.element = document.createElement('article'); this.element.className = 'mbv-hs-card';
		this.interactionElement = this.element.createDiv({ cls: 'mbv-hs-face', attr: { role: 'button', tabindex: '0', 'aria-expanded': 'false' } });
		this.placementElement = this.interactionElement;
		this.accessibleLabel = this.interactionElement.createSpan('mbv-hs-accessible-label');
		this.translated = this.interactionElement.createDiv('mbv-hs-translater');
		this.revealEl = this.translated.createDiv({
			cls: 'mbv-hs-reveal',
			attr: { 'aria-hidden': 'true' },
		});
		const flavorEl = this.revealEl.createDiv('mbv-hs-flavor');
		this.flavorFrameEl = flavorEl.createEl('img', {
			cls: 'mbv-hs-flavor-frame',
			attr: { alt: '', decoding: 'async' },
		});
		this.flavorTextEl = flavorEl.createDiv('mbv-hs-flavor-text');
		this.flavorExpansionEl = flavorEl.createDiv('mbv-hs-flavor-expansion');
		this.flavorRarityEl = flavorEl.createDiv('mbv-hs-flavor-rarity is-hidden');
		this.rotator = this.translated.createDiv('mbv-hs-rotator');
		const back = this.rotator.createDiv('mbv-hs-card-back');
		back.createEl('img', { cls: 'mbv-hs-card-back-image', attr: { src: resolveBundledImage(hearthstoneLegendCardBack), alt: '', decoding: 'async' } });
		this.hitSurface = new HearthstoneHitSurface(document);
		this.scene = new MinionScene(
			document,
			context.images,
			context.work,
			this.rotator,
			context.surfaceMasks,
			(path) => this.hitSurface.setPath(path),
		);
		this.rotator.append(this.scene.element);
		this.translated.append(this.hitSurface.element);
		this.message = this.element.createDiv({ cls: 'mbv-hs-message', attr: { role: 'status' } });
		this.interactionElement.addEventListener('contextmenu', this.handleContextMenu);
		this.update(context); this.ready = this.initialize();
	}
	getInteractionRect = (): DOMRect => this.hitSurface.element.getBoundingClientRect();
	getPointerRect = (): DOMRect => this.hitSurface.element.getBoundingClientRect();
	applyPointerStyle = (values: Readonly<Record<string, string>>): void => {
		const rotateX = values['--mbv-collectible-rotate-x'];
		const rotateY = values['--mbv-collectible-rotate-y'];
		if (rotateX !== undefined) this.rotator.style.setProperty('--mbv-collectible-rotate-x', rotateX);
		if (rotateY !== undefined) this.rotator.style.setProperty('--mbv-collectible-rotate-y', rotateY);
		this.scene.setPointerStyle(values);
	};
	isEditing = (): boolean => this.context.isEditorOpen();
	openMarkdown = async (event: MouseEvent | KeyboardEvent): Promise<void> => this.open(event);
	onExpandedChange = (expanded: boolean): void => {
		this.expanded = expanded; this.interactionElement.setAttribute('aria-expanded', String(expanded)); this.setArtworkWidth(this.width);
		this.accessibleLabel.setText(`${expanded ? '打开文件' : '放大'} ${this.data.title}`);
		this.relatedCards?.setExpanded(expanded);
		this.revealEl.setAttribute('aria-hidden', String(!expanded || !this.hasReveal()));
		if (expanded) {
			this.cancelCollapseCleanup();
			this.cancelPaintRebuild();
			this.element.classList.remove('is-collapsing');
			if (this.hasReveal()) this.ensureRevealSources(); else this.releaseRevealSources();
		} else {
			this.element.classList.add('is-collapsing');
			this.scheduleCollapseCleanup();
		}
	};
	setArtworkWidth(width: number): void {
		this.width = width; const dpr = this.element.ownerDocument.defaultView?.devicePixelRatio ?? 1;
		this.scene.setWidth(width * HEARTHSTONE_CARD_WIDTH / HEARTHSTONE_VIEWPORT_WIDTH * dpr * (this.expanded ? 1.75 : 1));
		this.relatedCards?.setArtworkWidth(width);
	}
	setHtmlExportItemWidth(width: number): void {
		this.width = width;
		this.scene.setWidth(width * HEARTHSTONE_CARD_WIDTH / HEARTHSTONE_VIEWPORT_WIDTH * 2);
		this.relatedCards?.setArtworkWidth(width);
	}
	attach(): void { if (this.disposed) return; this.attached = true; this.render(); }
	suspend(): void {
		this.attached = false; this.cancelCollapseCleanup(); this.cancelPaintRebuild();
		this.element.classList.remove('is-collapsing');
		this.releaseRevealSources(); this.scene.suspend(); this.skillView?.releaseSources();
	}
	update(context: HearthstoneCardContext): void {
		if (this.disposed) return; this.context = context;
		this.input = readHearthstoneEntryInput(context);
		this.data = readHearthstoneEntryData(context, this.input);
		if (this.assets && this.assetScope !== requiredAssetScope(this.data)) void this.ensureAssetsForCard();
		const signature = JSON.stringify([context.entry.file.path, this.input.artwork]);
		if (signature !== this.imageSignature) {
			this.imageSignature = signature;
			this.artworkSource = resolveHearthstoneEntryImages(
				context, this.element.ownerDocument, 'artwork',
			)[0] ?? '';
		}
		this.updateReveal();
		const materialSignature = context.entry.file.path + '\u0000' + context.options.material;
		if (materialSignature !== this.materialSignature) {
			this.materialSignature = materialSignature; applyCardMaterial(this.element, context.options.material, context.entry.file.path, true);
		}
		this.interactionElement.dataset.href = context.entry.file.path;
		this.accessibleLabel.setText(`${this.expanded ? '打开文件' : '放大'} ${this.data.title}`);
		const details = context.entry.file.path + '\u0000' + properties.getSignature(context);
		if (details !== this.detailSignature) { this.detailSignature = details; properties.update(this.element, context); }
		this.render();
	}
	async prepareHtmlExport(): Promise<void> {
		this.exportMode = true; this.cancelCollapseCleanup(); this.element.classList.remove('is-collapsing');
		await this.ready; await this.ensureAssetsForCard(); if (!this.assets) throw new Error('炉石卡牌素材加载失败.');
		this.attach();
		if (this.hasReveal()) this.ensureRevealSources();
		if (isSkillCard(this.data)) {
			await this.skillView?.readyHitPath();
			this.skillView?.prepareHtmlExport();
		}
		else await this.scene.prepareHtmlExport();
		await this.relatedCards?.prepareHtmlExport();
	}
	destroy(): void {
		this.disposed = true;
		this.relatedCards?.destroy(); this.relatedCards = null;
		this.suspend(); this.skillView = null;
		this.interactionElement.removeEventListener('contextmenu', this.handleContextMenu);
		for (const image of Array.from(this.element.querySelectorAll('img'))) {
			image.removeAttribute('src');
			image.remove();
		}
		this.element.empty();
		this.artworkSource = ''; this.assets = null;
	}
	private readonly handleContextMenu = (event: MouseEvent): void => this.editFromContextMenu(event);
	private async initialize(): Promise<void> {
		try {
			await prepareHearthstoneFonts(this.element.ownerDocument);
			await this.ensureAssetsForCard();
		} catch { if (!this.disposed) this.message.setText('卡牌资源加载失败.'); }
	}
	private async ensureAssetsForCard(): Promise<void> {
		const scope = requiredAssetScope(this.data);
		if (this.assets && this.assetScope === scope) return;
		const version = ++this.assetLoadVersion;
		const assets = await loadHearthstoneAssetsFor(this.data);
		if (this.disposed || version !== this.assetLoadVersion) return;
		this.assets = assets; this.assetScope = scope;
		if (this.expanded && this.hasReveal()) this.ensureRevealSources();
		this.scene.invalidateText(); this.render();
	}
	private artwork(): MinionArtwork {
		return { source: this.artworkSource, position: readArtworkPosition(this.input.artworkPosition) };
	}
	private render(): void {
		if (!this.assets || this.assetScope !== requiredAssetScope(this.data) || this.disposed || !this.attached) return;
		const skill = isSkillCard(this.data);
		this.element.classList.toggle('is-skill-card', skill);
		if (skill) {
			this.scene.suspend(); this.scene.element.hidden = true;
			this.skillView ??= new HearthstoneHeroPowerView(
				this.rotator,
				(path) => this.hitSurface.setPath(path),
			);
			this.skillView.element.addClass('is-card-skill');
			this.skillView.element.hidden = false;
			this.skillView.update(this.data, this.artworkSource);
			this.skillView.ensureSources(this.assets);
			this.message.setText('');
			return;
		}
		this.skillView?.releaseSources();
		if (this.skillView) this.skillView.element.hidden = true;
		this.scene.element.hidden = false; this.scene.resume();
		this.scene.update(this.data, this.artwork(), this.assets);
		this.message.setText(this.scene.element.dataset.descriptionOverflow === 'true' ? '描述过长, 打开笔记查看完整内容'
				: this.scene.element.dataset.titleOverflow === 'true' ? '名称过长, 打开笔记查看完整内容' : '');
	}
	private updateReveal(): void {
		const hasRelated = this.context.relatedEntries.length > 0;
		this.syncRelatedCards(hasRelated);
		const signature = JSON.stringify([
			this.data.rarity, this.data.flavor, this.data.expansion, this.data.cardType, hasRelated,
		]);
		if (signature === this.flavorSignature) return;
		this.flavorSignature = signature;
		this.renderFlavorPanel(this.data);
		this.element.classList.toggle('has-related', hasRelated);
		this.revealEl.setAttribute('aria-hidden', String(!this.expanded || !this.hasReveal()));
		if (this.expanded && this.hasReveal()) this.ensureRevealSources();
		else if (!this.expanded && !this.element.classList.contains('is-collapsing')) this.releaseRevealSources();
	}
	private syncRelatedCards(hasRelated: boolean): void {
		if (!hasRelated) {
			this.relatedCards?.destroy();
			this.relatedCards = null;
			return;
		}
		this.relatedCards ??= new HearthstoneRelatedCards(
			this.revealEl,
			this.translated,
			this.context,
			{
				openEntry: (entry, event) => { void this.openEntry(entry, event); },
				editEntry: entry => {
					this.context.resetPointer(this);
					this.context.openEditor(entry);
				},
				setParentPreviewActive: active => {
					this.context.resetPointer(this);
					this.element.classList.toggle('is-related-preview-active', active);
				},
				setPreviewFlavor: data => this.renderFlavorPanel(data ?? this.data),
			},
		);
		this.relatedCards.update(this.context);
		this.relatedCards.setArtworkWidth(this.width);
		this.relatedCards.setExpanded(this.expanded);
	}
	private ensureRevealSources(): void {
		const flavorFrame = resolveBundledImage(this.flavorFrameSource);
		if (this.hasDisplayedFlavorPanel() && this.flavorFrameEl.getAttribute('src') !== flavorFrame) {
			this.flavorFrameEl.src = flavorFrame;
		} else if (!this.hasDisplayedFlavorPanel()) this.flavorFrameEl.removeAttribute('src');
		this.relatedCards?.ensureSources();
	}
	private hasFlavorPanel(): boolean { return Boolean(this.data.flavor || this.data.expansion); }
	private hasDisplayedFlavorPanel(): boolean {
		const data = this.displayedFlavorData ?? this.data;
		return Boolean(data.flavor || data.expansion);
	}
	private renderFlavorPanel(data: MinionData): void {
		this.displayedFlavorData = data;
		const hasFlavor = Boolean(data.flavor || data.expansion);
		this.element.classList.toggle('has-flavor', hasFlavor);
		renderDescriptionMarkup(this.flavorTextEl, data.flavor);
		this.flavorExpansionEl.setText(data.expansion);
		const hasRarity = hasHearthstoneFlavorRarity(data.rarity);
		this.flavorFrameSource = getHearthstoneFlavorFrame(data.rarity);
		this.flavorRarityEl.setText(hasRarity ? data.rarity : '');
		this.flavorRarityEl.dataset.rarity = data.rarity;
		this.flavorRarityEl.classList.toggle('is-hidden', !hasRarity);
		if (this.expanded || this.exportMode) this.ensureRevealSources();
	}
	private hasReveal(): boolean {
		return Boolean(this.hasFlavorPanel() || this.context.relatedEntries.length);
	}
	private scheduleCollapseCleanup(): void {
		if (this.exportMode) return;
		this.cancelCollapseCleanup();
		const ownerWindow = this.element.ownerDocument.defaultView;
		if (!ownerWindow) { this.completeCollapse(); return; }
		this.collapseCleanupTimer = ownerWindow.setTimeout(() => {
			this.collapseCleanupTimer = null;
			this.completeCollapse();
		}, 920);
	}
	private cancelCollapseCleanup(): void {
		if (this.collapseCleanupTimer === null) return;
		this.element.ownerDocument.defaultView?.clearTimeout(this.collapseCleanupTimer);
		this.collapseCleanupTimer = null;
	}
	private completeCollapse(): void {
		if (this.expanded || this.disposed) return;
		this.releaseRevealSources();
		this.element.classList.remove('is-collapsing');
		const parent = this.element.parentElement;
		const ownerWindow = this.element.ownerDocument.defaultView;
		if (!parent || !ownerWindow) return;
		this.paintProxyEl = this.createPaintProxy();
		parent.append(this.paintProxyEl);
		this.element.classList.add('is-rebuilding-paint-tree');
		void this.element.offsetHeight;
		this.paintCommitFrame = ownerWindow.requestAnimationFrame(() => {
			this.paintCommitFrame = null;
			this.paintRestoreFrame = ownerWindow.requestAnimationFrame(() => {
				this.paintRestoreFrame = null;
				this.restorePaintTree();
			});
		});
	}
	private cancelPaintRebuild(): void {
		const ownerWindow = this.element.ownerDocument.defaultView;
		if (this.paintCommitFrame !== null) ownerWindow?.cancelAnimationFrame(this.paintCommitFrame);
		if (this.paintRestoreFrame !== null) ownerWindow?.cancelAnimationFrame(this.paintRestoreFrame);
		this.paintCommitFrame = null; this.paintRestoreFrame = null;
		this.restorePaintTree();
	}
	private restorePaintTree(): void {
		this.element.classList.remove('is-rebuilding-paint-tree');
		this.paintProxyEl?.remove(); this.paintProxyEl = null;
		void this.element.offsetHeight;
	}
	private createPaintProxy(): HTMLElement {
		const proxy = this.element.cloneNode(true) as HTMLElement;
		proxy.classList.remove('is-active', 'is-opening', 'is-collapsing', 'is-interacting', 'is-rebuilding-paint-tree');
		proxy.classList.add('is-paint-proxy');
		proxy.setAttribute('aria-hidden', 'true');
		const sourceCanvases = this.element.querySelectorAll('canvas');
		const targetCanvases = proxy.querySelectorAll('canvas');
		sourceCanvases.forEach((source, index) => {
			const target = targetCanvases[index]; if (!target) return;
			target.width = source.width; target.height = source.height;
			target.getContext('2d')?.drawImage(source, 0, 0);
		});
		return proxy;
	}
	private releaseRevealSources(): void {
		this.flavorFrameEl.removeAttribute('src');
		this.relatedCards?.releaseSources();
	}
	private async open(event: MouseEvent | KeyboardEvent): Promise<void> {
		return this.openEntry(this.context.entry, event);
	}
	private async openEntry(entry: BasesEntry, event: MouseEvent | KeyboardEvent): Promise<void> {
		if (this.exportMode) return; const { app, options, navigation, ownerEl } = this.context;
		try {
			if (!await navigation.open(entry.file, entry.file.path, options.markdownOpenMode, event, ownerEl)) await app.workspace.openLinkText(entry.file.path, entry.file.path, Keymap.isModEvent(event));
		} catch { new Notice('打开笔记失败.'); }
	}
	private editFromContextMenu(event: MouseEvent): void {
		if (this.exportMode) return;
		event.preventDefault(); event.stopPropagation(); this.context.resetPointer(this);
		this.context.openEditor(this.context.entry);
	}
}
function requiredAssetScope(data: MinionData): string {
	if (isSkillCard(data)) return data.cardType.startsWith('酒馆战棋-') ? 'battleground-skill' : 'skill';
	if (isHeroCard(data)) return data.cardType.startsWith('酒馆战棋-') ? 'battleground-hero' : 'hero';
	return cardKind(data) === '随从' ? 'minion' : 'final';
}

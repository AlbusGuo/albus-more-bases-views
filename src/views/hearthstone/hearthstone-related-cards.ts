import type { BasesEntry } from 'obsidian';
import { resolveBundledImage } from '../../ui/bundled-image';
import { applyCardMaterial } from '../shared/card-material-surface';
import {
	readHearthstoneEntryData,
	readHearthstoneEntryInput,
	resolveHearthstoneEntryImages,
} from './hearthstone-entry';
import { HearthstoneHeroPowerView } from './hearthstone-hero-power-view';
import { prepareHearthstoneFonts } from './hearthstone-fonts';
import { HEARTHSTONE_CARD_WIDTH, HEARTHSTONE_VIEWPORT_WIDTH } from './hearthstone-layout';
import { isSkillCard, readArtworkPosition, type ArtworkPosition, type MinionData } from './hearthstone-model';
import {
	HEARTHSTONE_RELATED_BACKGROUND,
	HEARTHSTONE_RELATED_CARD_ARMOR,
	HEARTHSTONE_RELATED_CARD_MANA,
	HEARTHSTONE_RELATED_CARD_OVERLAY,
	HEARTHSTONE_RELATED_CARD_REMAINS,
	HEARTHSTONE_RELATED_CARD_STARRED_OVERLAY,
} from './hearthstone-related-assets';
import { MinionScene } from './hearthstone-scene';
import { loadHearthstoneAssetsFor } from './hearthstone-template';
import type { HearthstoneCardContext, HearthstoneRelatedEntry } from './hearthstone-card';

interface RelatedCardItem {
	key: string;
	kind: 'card' | 'power';
	title: string;
	cost: string;
	rarity: MinionData['rarity'];
	artworkSource: string;
	artworkPosition: ArtworkPosition;
	data: MinionData;
	entry: BasesEntry;
	material: HearthstoneRelatedEntry['material'];
}

interface RelatedRow {
	item: RelatedCardItem;
	element: HTMLElement;
	artworkEl: HTMLImageElement;
	overlayEl: HTMLImageElement;
	manaEl: HTMLImageElement;
	starred: boolean;
}

interface HearthstoneRelatedCallbacks {
	openEntry: (entry: BasesEntry, event: MouseEvent | KeyboardEvent) => void;
	editEntry: (entry: BasesEntry) => void;
	setParentPreviewActive: (active: boolean) => void;
	setPreviewFlavor: (data: MinionData | null) => void;
}

export class HearthstoneRelatedCards {
	readonly element: HTMLElement;
	private readonly backgroundEl: HTMLImageElement;
	private readonly listEl: HTMLElement;
	private readonly previewEl: HTMLElement;
	private readonly previewCardEl: HTMLElement;
	private readonly previewScene: MinionScene;
	private readonly previewPower: HearthstoneHeroPowerView;
	private rows: RelatedRow[] = [];
	private signature = '';
	private expanded = false;
	private activeKey = '';
	private previewVersion = 0;
	private previewCleanupTimer: number | null = null;
	private previewExitTimer: number | null = null;
	private outgoingEl: HTMLElement | null = null;
	private outgoingCleanupTimer: number | null = null;
	private context: HearthstoneCardContext;
	private exportSceneWidth = 0;
	private readonly renderDocument: Document;

	constructor(
		revealParent: HTMLElement,
		overlayParent: HTMLElement,
		context: HearthstoneCardContext,
		private readonly callbacks: HearthstoneRelatedCallbacks,
	) {
		this.context = context;
		const document = revealParent.ownerDocument;
		this.renderDocument = document;
		this.element = revealParent.createDiv({
			cls: 'mbv-hs-related',
			attr: { 'data-mbv-card-interaction-ignore': '' },
		});
		this.backgroundEl = this.element.createEl('img', {
			cls: 'mbv-hs-related-background', attr: { alt: '', decoding: 'async' },
		});
		this.element.createDiv({ cls: 'mbv-hs-related-title', text: '相关卡牌' });
		this.listEl = this.element.createDiv({
			cls: 'mbv-hs-related-list',
			attr: { 'data-mbv-card-scroll': '' },
		});
		this.previewEl = overlayParent.createDiv('mbv-hs-related-preview');
		this.previewCardEl = this.previewEl.createDiv('mbv-hs-related-preview-card');
		this.previewScene = new MinionScene(
			document, context.images, context.work, undefined, context.surfaceMasks,
		);
		this.previewCardEl.append(this.previewScene.element);
		this.previewPower = new HearthstoneHeroPowerView(this.previewEl);
		this.previewPower.element.addClass('is-related-preview');
		this.hidePreview(true);
	}

	update(context: HearthstoneCardContext): void {
		this.context = context;
		const items: RelatedCardItem[] = [];
		for (const related of context.relatedEntries) {
			const childContext: HearthstoneCardContext = {
				...context,
				entry: related.entry,
				options: { ...context.options, material: related.material },
				relatedEntries: [],
			};
			const input = readHearthstoneEntryInput(childContext);
			const data = readHearthstoneEntryData(childContext, input);
			items.push({
				key: related.entry.file.path, kind: isSkillCard(data) ? 'power' : 'card', title: data.title, cost: data.cost,
				rarity: data.rarity,
				artworkSource: resolveHearthstoneEntryImages(
					childContext, this.element.ownerDocument, 'artwork',
				)[0] ?? '',
				artworkPosition: readArtworkPosition(input.artworkPosition), data,
				entry: related.entry, material: related.material,
			});
		}
		const signature = JSON.stringify(items.map(item => [
			item.key, item.title, item.cost, item.rarity, item.artworkSource,
			item.artworkPosition, item.data, item.material,
		]));
		if (signature === this.signature) return;
		this.signature = signature;
		this.hidePreview(true);
		this.listEl.empty();
		this.rows = items.map(item => this.createRow(item));
		if (this.expanded) this.ensureSources();
	}

	setArtworkWidth(width: number): void {
		const dpr = this.element.ownerDocument.defaultView?.devicePixelRatio ?? 1;
		this.exportSceneWidth = width * HEARTHSTONE_CARD_WIDTH /
			HEARTHSTONE_VIEWPORT_WIDTH * dpr * 1.75;
		this.previewScene.setWidth(this.exportSceneWidth);
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
		if (expanded) this.ensureSources();
		else this.hidePreview(true);
	}

	ensureSources(): void {
		const background = resolveBundledImage(HEARTHSTONE_RELATED_BACKGROUND);
		if (this.backgroundEl.getAttribute('src') !== background) this.backgroundEl.src = background;
		const mana = resolveBundledImage(HEARTHSTONE_RELATED_CARD_MANA);
		const remains = resolveBundledImage(HEARTHSTONE_RELATED_CARD_REMAINS);
		const armor = resolveBundledImage(HEARTHSTONE_RELATED_CARD_ARMOR);
		const overlay = resolveBundledImage(HEARTHSTONE_RELATED_CARD_OVERLAY);
		const starredOverlay = resolveBundledImage(HEARTHSTONE_RELATED_CARD_STARRED_OVERLAY);
		for (const row of this.rows) {
			if (row.item.artworkSource && row.artworkEl.getAttribute('src') !== row.item.artworkSource) {
				row.artworkEl.src = row.item.artworkSource;
			}
			const rowOverlay = row.starred ? starredOverlay : overlay;
			if (row.overlayEl.getAttribute('src') !== rowOverlay) row.overlayEl.src = rowOverlay;
			const costIcon = row.item.data.costType === '残骸'
				? remains
				: row.item.data.costType === '护甲值' ? armor : mana;
			if (row.manaEl.getAttribute('src') !== costIcon) row.manaEl.src = costIcon;
		}
	}

	async prepareHtmlExport(): Promise<void> {
		this.ensureSources();
		await prepareHearthstoneFonts(this.renderDocument);
		this.element.querySelector('.mbv-hs-related-export-templates')?.remove();
		const templatesEl = this.element.createDiv('mbv-hs-related-export-templates');
		const stagingEl = this.renderDocument.body.createDiv({
			cls: 'mbv-hs-related-export-staging',
			attr: { 'aria-hidden': 'true' },
		});
		try {
			for (const [index, row] of this.rows.entries()) {
				const key = String(index);
				row.element.dataset.mbvHsRelatedPreview = key;
				this.callbacks.setPreviewFlavor(row.item.data);
				const templateEl = templatesEl.createDiv({
					cls: 'mbv-hs-related-export-template',
					attr: { 'data-preview-key': key },
				});
				templateEl.dataset.hasFlavor = String(Boolean(
					row.item.data.flavor || row.item.data.expansion,
				));
				const preview = await this.createExportPreview(row.item, stagingEl);
				templateEl.append(preview);
				const flavor = this.element.parentElement?.querySelector<HTMLElement>(
					':scope > .mbv-hs-flavor',
				)?.cloneNode(true) as HTMLElement | undefined;
				if (flavor) {
					flavor.addClass('mbv-hs-related-export-flavor');
					templateEl.append(flavor);
				}
			}
		} finally {
			this.callbacks.setPreviewFlavor(null);
			this.clearPreviewContent();
			stagingEl.remove();
		}
	}

	releaseSources(): void {
		this.backgroundEl.removeAttribute('src');
		for (const row of this.rows) {
			row.artworkEl.removeAttribute('src');
			row.overlayEl.removeAttribute('src');
			row.manaEl.removeAttribute('src');
		}
		this.hidePreview(true);
	}

	destroy(): void {
		this.releaseSources();
		this.element.remove();
		this.previewEl.remove();
		this.rows = [];
	}

	private createRow(item: RelatedCardItem): RelatedRow {
		const hasCost = item.data.costType !== '无';
		const hasLegendaryStar = item.rarity === '传说' || item.rarity === '仅龙边';
		const rowEl = this.listEl.createDiv({
			cls: `mbv-hs-related-row${hasCost ? ' has-cost' : ''}`,
			attr: { tabindex: '0', role: 'button', 'data-mbv-card-interaction-ignore': '' },
		});
		const visualEl = rowEl.createDiv('mbv-hs-related-row-visual');
		const artworkWindowEl = visualEl.createDiv('mbv-hs-related-artwork');
		const artworkLayoutEl = artworkWindowEl.createDiv('mbv-hs-related-artwork-layout');
		const artworkEl = artworkLayoutEl.createEl('img', {
			attr: { alt: '', decoding: 'async', draggable: 'false' },
		});
		artworkLayoutEl.setCssProps({
			'--mbv-hs-related-art-x': `${item.artworkPosition.x}%`,
			'--mbv-hs-related-art-y': `${item.artworkPosition.y}%`,
			'--mbv-hs-related-art-scale': String(item.artworkPosition.scale),
		});
		artworkWindowEl.createDiv('mbv-hs-related-artwork-shade-fill');
		const overlayEl = visualEl.createEl('img', {
			cls: `mbv-hs-related-card-overlay${hasLegendaryStar ? ' has-star' : ''}`,
			attr: { alt: '', decoding: 'async', draggable: 'false' },
		});
		const manaEl = visualEl.createEl('img', {
			cls: 'mbv-hs-related-card-mana', attr: { alt: '', decoding: 'async', draggable: 'false' },
		});
		visualEl.createDiv({ cls: 'mbv-hs-related-cost', text: item.cost });
		visualEl.createDiv({ cls: 'mbv-hs-related-name', text: item.title });
		rowEl.addEventListener('pointerenter', () => this.showPreview(item, rowEl));
		rowEl.addEventListener('pointerleave', () => {
			if (!rowEl.matches(':focus')) this.scheduleHidePreview();
		});
		rowEl.addEventListener('focus', () => this.showPreview(item, rowEl));
		rowEl.addEventListener('blur', () => {
			if (!rowEl.matches(':hover')) this.scheduleHidePreview();
		});
		rowEl.addEventListener('click', event => {
			if (event.button !== 0) return;
			this.openItem(item, rowEl, event);
		});
		rowEl.addEventListener('keydown', event => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			this.openItem(item, rowEl, event);
		});
		rowEl.addEventListener('contextmenu', event => {
			this.editItem(item, rowEl, event);
		});
		return { item, element: rowEl, artworkEl, overlayEl, manaEl, starred: hasLegendaryStar };
	}

	private async createExportPreview(
		item: RelatedCardItem,
		stagingEl: HTMLElement,
	): Promise<HTMLElement> {
		const assets = await loadHearthstoneAssetsFor(item.data);
		const document = this.renderDocument;
		if (item.kind === 'power') {
			const power = new HearthstoneHeroPowerView(stagingEl);
			power.element.addClass('is-related-preview');
			power.update(item.data, item.artworkSource);
			power.ensureSources(assets);
			power.prepareHtmlExport();
			return power.element;
		}
		const preview = document.createElement('div');
		preview.className = 'mbv-hs-related-preview-card';
		stagingEl.append(preview);
		applyCardMaterial(preview, item.material, item.entry.file.path, true);
		const scene = new MinionScene(
			document,
			this.context.images,
			this.context.work,
			undefined,
			this.context.surfaceMasks,
		);
		preview.append(scene.element);
		scene.setWidth(this.exportSceneWidth);
		scene.resume();
		scene.update(item.data, {
			source: item.artworkSource,
			position: item.artworkPosition,
		}, assets);
		await scene.prepareHtmlExport();
		return preview;
	}

	private openItem(
		item: RelatedCardItem,
		rowEl: HTMLElement,
		event: MouseEvent | KeyboardEvent,
	): void {
		event.preventDefault(); event.stopPropagation();
		rowEl.blur();
		this.hidePreview(true);
		this.callbacks.openEntry(item.entry, event);
	}

	private editItem(
		item: RelatedCardItem,
		rowEl: HTMLElement,
		event: MouseEvent,
	): void {
		event.preventDefault(); event.stopPropagation();
		rowEl.blur();
		this.hidePreview(true);
		this.callbacks.editEntry(item.entry);
	}

	private showPreview(item: RelatedCardItem, rowEl: HTMLElement): void {
		if (!this.expanded) return;
		this.cancelPreviewExit();
		this.cancelPreviewCleanup();
		if (this.activeKey === item.key) return;
		const switching = Boolean(this.activeKey && this.previewEl.classList.contains('is-visible'));
		if (switching) this.createOutgoingPreview();
		this.setPreviewOrigin(rowEl);
		this.callbacks.setParentPreviewActive(true);
		this.callbacks.setPreviewFlavor(item.data);
		this.ensureSources();
		this.activeKey = item.key;
		const version = ++this.previewVersion;
		if (switching) this.previewEl.classList.add('is-switching');
		else this.previewEl.classList.remove('is-visible', 'is-switching');
		if (item.kind === 'power') {
			void this.showPowerPreview(item, version, switching);
			return;
		}
		void this.showCardPreview(item, version, switching);
	}

	private async showPowerPreview(item: RelatedCardItem, version: number, switching: boolean): Promise<void> {
		try {
			const assets = await loadHearthstoneAssetsFor(item.data);
			if (!this.isCurrentPreview(item, version)) return;
			this.previewScene.suspend();
			this.previewCardEl.hidden = true;
			this.previewPower.element.hidden = false;
			this.previewPower.update(item.data, item.artworkSource);
			this.previewPower.ensureSources(assets);
			this.revealPreview(switching, version);
		} catch {
			if (this.isCurrentPreview(item, version)) this.hidePreview(true);
		}
	}

	private async showCardPreview(item: RelatedCardItem, version: number, switching: boolean): Promise<void> {
		try {
			const assets = await loadHearthstoneAssetsFor(item.data);
			if (!this.isCurrentPreview(item, version)) return;
			this.previewPower.releaseSources();
			this.previewPower.element.hidden = true;
			this.previewCardEl.hidden = false;
			applyCardMaterial(this.previewCardEl, item.material, item.entry.file.path, true);
			this.previewScene.resume();
			this.previewScene.update(item.data, {
				source: item.artworkSource, position: item.artworkPosition,
			}, assets);
			this.revealPreview(switching, version);
		} catch {
			if (this.isCurrentPreview(item, version)) this.hidePreview(true);
		}
	}

	private isCurrentPreview(item: RelatedCardItem, version: number): boolean {
		return this.expanded && version === this.previewVersion && this.activeKey === item.key;
	}

	private revealPreview(switching: boolean, version: number): void {
		this.previewEl.classList.add('is-visible');
		if (!switching) {
			this.previewEl.classList.remove('is-switching');
			return;
		}
		const ownerWindow = this.previewEl.ownerDocument.defaultView;
		if (!ownerWindow) {
			this.previewEl.classList.remove('is-switching');
			return;
		}
		ownerWindow.requestAnimationFrame(() => ownerWindow.requestAnimationFrame(() => {
			if (version !== this.previewVersion) return;
			this.previewEl.classList.remove('is-switching');
			this.outgoingEl?.classList.add('is-leaving');
			this.cancelOutgoingCleanup();
			this.outgoingCleanupTimer = ownerWindow.setTimeout(() => {
				this.outgoingCleanupTimer = null;
				this.clearOutgoingPreview();
			}, 180);
		}));
	}

	private scheduleHidePreview(): void {
		this.cancelPreviewExit();
		const ownerWindow = this.previewEl.ownerDocument.defaultView;
		if (!ownerWindow) {
			this.hidePreview();
			return;
		}
		this.previewExitTimer = ownerWindow.setTimeout(() => {
			this.previewExitTimer = null;
			this.hidePreview();
		}, 50);
	}

	private hidePreview(immediate = false): void {
		this.cancelPreviewExit();
		this.callbacks.setParentPreviewActive(false);
		this.callbacks.setPreviewFlavor(null);
		this.activeKey = '';
		this.previewVersion += 1;
		this.previewEl.classList.remove('is-visible', 'is-switching');
		this.clearOutgoingPreview();
		this.cancelPreviewCleanup();
		if (!immediate && (this.previewCardEl.hidden === false || this.previewPower.element.hidden === false)) {
			const ownerWindow = this.previewEl.ownerDocument.defaultView;
			if (ownerWindow) {
				this.previewCleanupTimer = ownerWindow.setTimeout(() => {
					this.previewCleanupTimer = null;
					this.clearPreviewContent();
				}, 190);
				return;
			}
		}
		this.clearPreviewContent();
	}

	private clearPreviewContent(): void {
		this.clearOutgoingPreview();
		this.previewScene.suspend();
		this.previewPower.releaseSources();
		this.previewCardEl.hidden = true;
		this.previewPower.element.hidden = true;
	}

	private cancelPreviewCleanup(): void {
		if (this.previewCleanupTimer === null) return;
		this.previewEl.ownerDocument.defaultView?.clearTimeout(this.previewCleanupTimer);
		this.previewCleanupTimer = null;
	}

	private cancelPreviewExit(): void {
		if (this.previewExitTimer === null) return;
		this.previewEl.ownerDocument.defaultView?.clearTimeout(this.previewExitTimer);
		this.previewExitTimer = null;
	}

	private createOutgoingPreview(): void {
		this.clearOutgoingPreview();
		const source = this.previewCardEl.hidden ? this.previewPower.element : this.previewCardEl;
		if (source.hidden) return;
		const outgoing = this.previewEl.createDiv('mbv-hs-related-preview-outgoing');
		const clone = source.cloneNode(true) as HTMLElement;
		const sourceCanvases = source.querySelectorAll('canvas');
		const targetCanvases = clone.querySelectorAll('canvas');
		sourceCanvases.forEach((canvas, index) => {
			const target = targetCanvases[index];
			if (!target) return;
			target.width = canvas.width; target.height = canvas.height;
			target.getContext('2d')?.drawImage(canvas, 0, 0);
		});
		outgoing.append(clone);
		this.outgoingEl = outgoing;
	}

	private clearOutgoingPreview(): void {
		this.cancelOutgoingCleanup();
		this.outgoingEl?.remove();
		this.outgoingEl = null;
	}

	private cancelOutgoingCleanup(): void {
		if (this.outgoingCleanupTimer === null) return;
		this.previewEl.ownerDocument.defaultView?.clearTimeout(this.outgoingCleanupTimer);
		this.outgoingCleanupTimer = null;
	}

	private setPreviewOrigin(rowEl: HTMLElement): void {
		const row = rowEl.getBoundingClientRect();
		const parent = this.previewEl.parentElement?.getBoundingClientRect();
		if (!parent?.width || !parent.height) return;
		const x = (row.left + row.width / 2 - parent.left - parent.width / 2) / parent.width * 100;
		const y = (row.top + row.height / 2 - parent.top - parent.height / 2) / parent.height * 100;
		this.previewEl.setCssProps({
			'--mbv-hs-related-preview-origin-x': `${x}%`,
			'--mbv-hs-related-preview-origin-y': `${y}%`,
		});
	}
}

export function createHearthstoneRelatedExportScript(): string {
	return `(() => {
		const start = () => {
		const root = document.querySelector('.mbv-html-export-view');
		if (!root) return;
		const states = new WeakMap();
		const stateFor = (card) => {
			let state = states.get(card);
			if (!state) {
				state = {
					hideTimer: null,
					originalFlavor: card.querySelector('.mbv-hs-flavor')?.cloneNode(true) || null,
				};
				states.set(card, state);
			}
			return state;
		};
		const hide = (card) => {
			if (!card) return;
			const state = stateFor(card);
			if (state.hideTimer !== null) clearTimeout(state.hideTimer);
			state.hideTimer = null;
			const preview = card.querySelector('.mbv-hs-related-preview');
			preview?.classList.remove('is-visible');
			preview?.querySelectorAll('.mbv-hs-related-export-active').forEach((item) => item.remove());
			card.classList.remove('is-related-preview-active');
			const flavor = card.querySelector('.mbv-hs-flavor');
			if (flavor && state.originalFlavor) flavor.replaceWith(state.originalFlavor.cloneNode(true));
			card.classList.toggle('has-flavor', Boolean(state.originalFlavor && (
				state.originalFlavor.querySelector('.mbv-hs-flavor-text')?.textContent?.trim() ||
				state.originalFlavor.querySelector('.mbv-hs-flavor-expansion')?.textContent?.trim()
			)));
		};
		const scheduleHide = (card) => {
			if (!card) return;
			const state = stateFor(card);
			if (state.hideTimer !== null) clearTimeout(state.hideTimer);
			state.hideTimer = setTimeout(() => hide(card), 50);
		};
		const show = (row) => {
			const card = row.closest('.mbv-hs-card');
			if (!card?.classList.contains('is-active')) return;
			const related = row.closest('.mbv-hs-related');
			const key = row.dataset.mbvHsRelatedPreview;
			const template = key === undefined ? null : related?.querySelector(
				'.mbv-hs-related-export-template[data-preview-key="' + CSS.escape(key) + '"]'
			);
			const source = template?.querySelector(
				':scope > .mbv-hs-related-preview-card, :scope > .mbv-hs-hero-power.is-related-preview'
			);
			const preview = card.querySelector('.mbv-hs-related-preview');
			if (!template || !source || !preview) return;
			const state = stateFor(card);
			if (state.hideTimer !== null) clearTimeout(state.hideTimer);
			state.hideTimer = null;
			preview.querySelectorAll('.mbv-hs-related-export-active').forEach((item) => item.remove());
			const active = source.cloneNode(true);
			active.classList.add('mbv-hs-related-export-active');
			active.removeAttribute('hidden');
			preview.append(active);
			const rowRect = row.getBoundingClientRect();
			const parentRect = preview.parentElement?.getBoundingClientRect();
			if (parentRect?.width && parentRect.height) {
				preview.style.setProperty('--mbv-hs-related-preview-origin-x',
					((rowRect.left + rowRect.width / 2 - parentRect.left - parentRect.width / 2) / parentRect.width * 100) + '%');
				preview.style.setProperty('--mbv-hs-related-preview-origin-y',
					((rowRect.top + rowRect.height / 2 - parentRect.top - parentRect.height / 2) / parentRect.height * 100) + '%');
			}
			const flavorTemplate = template.querySelector(':scope > .mbv-hs-related-export-flavor');
			const flavor = card.querySelector('.mbv-hs-flavor');
			if (flavorTemplate && flavor) {
				const nextFlavor = flavorTemplate.cloneNode(true);
				nextFlavor.classList.remove('mbv-hs-related-export-flavor');
				flavor.replaceWith(nextFlavor);
			}
			card.classList.toggle('has-flavor', template.dataset.hasFlavor === 'true');
			card.classList.add('is-related-preview-active');
			preview.classList.add('is-visible');
		};
		for (const row of root.querySelectorAll('.mbv-hs-related-row[data-mbv-hs-related-preview]')) {
			row.addEventListener('pointerenter', () => show(row));
			row.addEventListener('pointerleave', () => {
				if (!row.matches(':focus')) scheduleHide(row.closest('.mbv-hs-card'));
			});
			row.addEventListener('focus', () => show(row));
			row.addEventListener('blur', () => {
				if (!row.matches(':hover')) scheduleHide(row.closest('.mbv-hs-card'));
			});
		}
		root.addEventListener('click', () => {
			setTimeout(() => {
				for (const card of root.querySelectorAll('.mbv-hs-card:not(.is-active)')) hide(card);
			}, 0);
		});
		};
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', start, { once: true });
		} else start();
	})();`;
}

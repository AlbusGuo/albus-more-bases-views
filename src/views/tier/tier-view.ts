import {
	BasesView,
	Notice,
	NullValue,
	parsePropertyId,
	setIcon,
	type BasesEntry,
	type BasesPropertyId,
	type QueryController,
} from 'obsidian';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import { AnimationFrameTask } from '../../ui/animation-frame-task';
import { ViewportMediaLoader } from '../../ui/viewport-media-loader';
import {
	createTierCard,
	type TierCardContext,
	type TierCardController,
} from './tier-card';
import { TierDragAutoScroller } from './tier-drag-scroll';
import {
	getSubTierForScore,
	getSubTiers,
	getTierInfo,
	MAIN_TIERS,
	type MainTierName,
	type TierInfo,
	type TierRowDefinition,
} from './tier-model';
import {
	getTierViewOptions,
	readTierViewOptions,
	type TierViewOptions,
} from './tier-options';

export const TIER_VIEW_TYPE = 'albus-more-bases-views-tier';
export { getTierViewOptions };

interface TierRowController {
	definition: TierRowDefinition;
	element: HTMLElement;
	cardsEl: HTMLElement;
	countEl: HTMLElement;
}

export class TierView extends BasesView {
	readonly type = TIER_VIEW_TYPE;

	private readonly containerEl: HTMLElement;
	private readonly chartEl: HTMLElement;
	private readonly backButtonEl: HTMLButtonElement;
	private readonly dragScroller: TierDragAutoScroller;
	private readonly coverLoader: ViewportMediaLoader<TierCardController>;
	private readonly cards = new Map<string, TierCardController>();
	private readonly rows = new Map<string, TierRowController>();
	private readonly entries = new Map<string, BasesEntry>();
	private readonly optimisticScores = new Map<string, number | null>();
	private options: TierViewOptions | null = null;
	private visibleProperties: BasesPropertyId[] = [];
	private drillTier: MainTierName | null = null;
	private rowMode = '';
	private draggedPath: string | null = null;
	private activeDropRow: HTMLElement | null = null;
	private readonly dataUpdateTask: AnimationFrameTask;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		private readonly navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
	) {
		super(controller);
		viewTabs.attach(controller, parentEl);
		this.containerEl = parentEl.createDiv({
			cls: 'mbv-tier-view',
			attr: { tabindex: '-1' },
		});
		this.dataUpdateTask = new AnimationFrameTask(
			this.containerEl,
			() => this.applyDataUpdate(),
		);
		this.dragScroller = new TierDragAutoScroller(this.containerEl);
		this.coverLoader = new ViewportMediaLoader(this.containerEl);

		this.backButtonEl = this.containerEl.createEl('button', {
			cls: 'clickable-icon mbv-tier-back is-hidden',
			attr: { type: 'button', 'aria-label': '返回评价总览' },
		});
		setIcon(this.backButtonEl, 'arrow-left');
		this.backButtonEl.addEventListener('click', () => this.showMainTiers());
		this.chartEl = this.containerEl.createDiv('mbv-tier-chart');
	}

	onDataUpdated(): void {
		this.dataUpdateTask.schedule();
	}

	private applyDataUpdate(): void {
		this.options = readTierViewOptions(this.config);
		this.visibleProperties = this.config.getOrder();
		this.coverLoader.setEstimatedItemHeight(this.options.cardMinWidth + 56);
		this.containerEl.style.setProperty('--mbv-tier-card-size', `${this.options.cardMinWidth}px`);
		this.entries.clear();
		const entries = this.data.groupedData.flatMap((group) => group.entries);
		for (const entry of entries) this.entries.set(entry.file.path, entry);
		this.clearSettledOptimisticScores();
		this.ensureRows();
		this.reconcileCards();
	}

	onunload(): void {
		this.dataUpdateTask.cancel();
		this.dragScroller.destroy();
		this.coverLoader.destroy();
		this.cards.clear();
		this.rows.clear();
		this.entries.clear();
	}

	private showMainTiers(): void {
		this.drillTier = null;
		this.ensureRows();
		this.reconcileCards();
	}

	private showDrillTier(tier: MainTierName): void {
		this.drillTier = tier;
		this.ensureRows();
		this.reconcileCards();
	}

	private ensureRows(): void {
		const nextMode = this.drillTier ? `drill:${this.drillTier}` : 'main';
		if (nextMode === this.rowMode) return;
		this.rowMode = nextMode;
		this.rows.clear();
		this.chartEl.empty();
		this.backButtonEl.classList.toggle('is-hidden', !this.drillTier);
		const definitions = this.drillTier ? getSubTiers(this.drillTier) : [...MAIN_TIERS];
		for (const definition of definitions) this.createRow(definition);
	}

	private createRow(definition: TierRowDefinition): void {
		const rowEl = this.chartEl.createDiv(`mbv-tier-row ${definition.className}`);
		rowEl.style.setProperty('--mbv-tier-accent', definition.color);
		const canDrill = !this.drillTier && definition.name !== '待品鉴';
		const labelEl = rowEl.createDiv({
			cls: `mbv-tier-row-label${canDrill ? ' is-clickable' : ''}`,
			attr: canDrill ? { role: 'button', tabindex: '0' } : undefined,
		});
		labelEl.createSpan({ cls: 'mbv-tier-row-name', text: definition.name });
		labelEl.createSpan({ cls: 'mbv-tier-row-range', text: definition.range });
		const countEl = labelEl.createSpan('mbv-tier-row-count');
		if (canDrill) {
			labelEl.addEventListener('click', () =>
				this.showDrillTier(definition.name as MainTierName),
			);
			labelEl.addEventListener('keydown', (event) => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				this.showDrillTier(definition.name as MainTierName);
			});
		}
		const cardsEl = rowEl.createDiv('mbv-tier-row-cards');
		this.bindRowDrop(rowEl, definition);
		this.rows.set(definition.name, { definition, element: rowEl, cardsEl, countEl });
	}

	private reconcileCards(): void {
		if (!this.options) return;
		const desiredCards = new Map<string, HTMLElement[]>();
		for (const name of this.rows.keys()) desiredCards.set(name, []);
		for (const [path, entry] of this.entries) {
			const info = this.getEntryTierInfo(entry);
			const target = this.getTargetRow(info);
			let card = this.cards.get(path);
			if (!card && target) {
				card = createTierCard(this.createCardContext(entry, info, target));
				this.cards.set(path, card);
			}
			if (!card) continue;
			card.update(this.createCardContext(entry, info, target));
			if (target) desiredCards.get(target.name)?.push(card.element);
		}
		for (const [path, card] of this.cards) {
			if (this.entries.has(path)) continue;
			card.element.remove();
			this.cards.delete(path);
			this.optimisticScores.delete(path);
		}
		for (const [name, row] of this.rows) {
			const elements = desiredCards.get(name) ?? [];
			if (!hasSameChildren(row.cardsEl, elements)) {
				row.cardsEl.replaceChildren(...elements);
			}
			row.countEl.setText(`${elements.length} 款`);
		}
		this.coverLoader.sync(this.cards.values());
	}

	private createCardContext(
		entry: BasesEntry,
		info: TierInfo,
		target: TierRowDefinition | null,
	): TierCardContext {
		return {
			app: this.app,
			ownerEl: this.containerEl,
			entry,
			info,
			options: this.options as TierViewOptions,
			visibleProperties: this.visibleProperties,
			navigation: this.navigation,
			onActivate: this.drillTier && target
				? () => void this.cycleCardScore(entry.file.path, target)
				: null,
			onDragStart: () => {
				this.draggedPath = entry.file.path;
				this.clearRowDropState();
				this.containerEl.addClass('is-dragging-card');
				this.dragScroller.start();
			},
			onDragEnd: () => {
				this.draggedPath = null;
				this.dragScroller.stop();
				this.containerEl.removeClass('is-dragging-card');
				this.clearRowDropState();
			},
		};
	}

	private getEntryTierInfo(entry: BasesEntry): TierInfo {
		const optimistic = this.optimisticScores.get(entry.file.path);
		if (optimistic !== undefined) return getTierInfo(optimistic === null ? '' : String(optimistic));
		return getTierInfo(this.getStoredRating(entry));
	}

	private getTargetRow(info: TierInfo): TierRowDefinition | null {
		if (!this.drillTier) return this.rows.get(info.name)?.definition ?? null;
		if (info.name !== this.drillTier) return null;
		return getSubTierForScore(this.drillTier, info.score);
	}

	private bindRowDrop(rowEl: HTMLElement, definition: TierRowDefinition): void {
		rowEl.addEventListener('dragover', (event) => {
			if (!this.options?.ratingProperty) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			if (this.activeDropRow === rowEl) return;
			this.activeDropRow?.removeClass('is-drag-over');
			this.activeDropRow = rowEl;
			rowEl.addClass('is-drag-over');
		});
		rowEl.addEventListener('dragleave', (event) => {
			if (rowEl.contains(event.relatedTarget as Node | null)) return;
			rowEl.removeClass('is-drag-over');
			if (this.activeDropRow === rowEl) this.activeDropRow = null;
		});
		rowEl.addEventListener('drop', (event) => {
			event.preventDefault();
			this.clearRowDropState();
			const path = this.draggedPath || event.dataTransfer?.getData('text/plain');
			this.draggedPath = null;
			if (!path || this.isInTierRow(path, definition)) return;
			void this.updateRating(path, definition.maxScore);
		});
	}

	private clearRowDropState(): void {
		this.activeDropRow?.removeClass('is-drag-over');
		this.activeDropRow = null;
	}

	private isInTierRow(path: string, definition: TierRowDefinition): boolean {
		const entry = this.entries.get(path);
		if (!entry) return false;
		return this.getTargetRow(this.getEntryTierInfo(entry))?.name === definition.name;
	}

	private async cycleCardScore(path: string, tier: TierRowDefinition): Promise<void> {
		if (tier.minScore === null || tier.maxScore === null) return;
		const entry = this.entries.get(path);
		if (!entry) return;
		const current = this.getEntryTierInfo(entry).score;
		let next = Math.round((current + 0.1) * 10) / 10;
		if (next > tier.maxScore || next < tier.minScore) next = tier.minScore;
		await this.updateRating(path, next);
	}

	private async updateRating(path: string, score: number | null): Promise<void> {
		const entry = this.entries.get(path);
		const property = this.options?.ratingProperty;
		if (!entry || !property) return;
		const parsed = parsePropertyId(property);
		if (parsed.type !== 'note') return;
		const previousOptimistic = this.optimisticScores.get(path);
		this.applyOptimisticScore(path, score);
		try {
			await this.app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
				const writable = frontmatter as Record<string, unknown>;
				writable[parsed.name] = score ?? '';
			});
		} catch {
			if (previousOptimistic === undefined) this.optimisticScores.delete(path);
			else this.optimisticScores.set(path, previousOptimistic);
			this.reconcileCards();
			new Notice('更新评分失败.');
		}
	}

	private applyOptimisticScore(path: string, score: number | null): void {
		const entry = this.entries.get(path);
		const card = this.cards.get(path);
		if (!entry || !card) return;
		const firstRect = card.element.getBoundingClientRect();
		const previousParent = card.element.parentElement;
		this.optimisticScores.set(path, score);
		const info = this.getEntryTierInfo(entry);
		const target = this.getTargetRow(info);
		card.update(this.createCardContext(entry, info, target));
		const targetCardsEl = target ? this.rows.get(target.name)?.cardsEl ?? null : null;
		if (targetCardsEl && card.element.parentElement !== targetCardsEl) {
			targetCardsEl.append(card.element);
		} else if (!targetCardsEl) {
			card.element.remove();
		}
		this.updateRowCount(previousParent);
		this.updateRowCount(card.element.parentElement);
		animateCardMove(card.element, firstRect);
	}

	private updateRowCount(cardsEl: HTMLElement | null): void {
		if (!cardsEl) return;
		for (const row of this.rows.values()) {
			if (row.cardsEl !== cardsEl) continue;
			row.countEl.setText(`${row.cardsEl.childElementCount} 款`);
			return;
		}
	}

	private clearSettledOptimisticScores(): void {
		for (const [path, expected] of this.optimisticScores) {
			const entry = this.entries.get(path);
			if (!entry) continue;
			const stored = Number.parseFloat(this.getStoredRating(entry));
			if ((expected === null && !Number.isFinite(stored)) || stored === expected) {
				this.optimisticScores.delete(path);
			}
		}
	}

	private getStoredRating(entry: BasesEntry): string {
		const property = this.options?.ratingProperty;
		if (!property) return '';
		const value = entry.getValue(property);
		if (!value || value instanceof NullValue) return '';
		return value.toString().trim();
	}

}

function hasSameChildren(container: HTMLElement, elements: HTMLElement[]): boolean {
	if (container.childElementCount !== elements.length) return false;
	for (let index = 0; index < elements.length; index += 1) {
		if (container.children.item(index) !== elements[index]) return false;
	}
	return true;
}

function animateCardMove(element: HTMLElement, firstRect: DOMRect): void {
	if (!element.isConnected) return;
	const lastRect = element.getBoundingClientRect();
	const deltaX = firstRect.left - lastRect.left;
	const deltaY = firstRect.top - lastRect.top;
	if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
	const ownerWindow = element.ownerDocument.defaultView;
	if (ownerWindow?.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	element.animate(
		[
			{ transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(0.96)` },
			{ transform: 'translate3d(0, 0, 0) scale(1)' },
		],
		{
			duration: 360,
			easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
		},
	);
}

import { setIcon, type BasesEntry } from 'obsidian';
import type { BookCardController } from './book-card';
import type {
	BookSeriesCollection,
	BookSeriesTransitionSource,
} from './book-series';

const OPEN_DURATION = 460;
const CLOSE_DURATION = 360;
const ITEM_STAGGER = 32;
const MAX_STAGGER = 160;
const BACKGROUND_OPACITY = 0.86;
const OPEN_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const CLOSE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface BookSeriesLightboxOptions {
	collection: BookSeriesCollection;
	source: BookSeriesTransitionSource;
	itemWidth: number;
	createCard: (ownerEl: HTMLElement, entry: BasesEntry) => BookCardController;
	onEdit: (entry: BasesEntry) => void;
	onClosed: () => void;
}

interface LightboxItem {
	element: HTMLElement;
	shellEl: HTMLElement;
	detailsEl: HTMLElement | null;
	controller: BookCardController;
}

export class BookSeriesLightbox {
	private readonly ownerDocument: Document;
	private readonly rootEl: HTMLElement;
	private readonly backgroundEl: HTMLElement;
	private readonly viewportEl: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly items: LightboxItem[] = [];
	private sourceRects: readonly DOMRect[] = [];
	private animations: Animation[] = [];
	private visible = false;
	private closing = false;

	constructor(private readonly options: BookSeriesLightboxOptions) {
		this.ownerDocument = options.source.element.ownerDocument;
		this.rootEl = this.ownerDocument.createElement('div');
		this.rootEl.className = 'mbv-book-series-lightbox is-transitioning is-opening';
		this.rootEl.setCssProps({
			'--mbv-book-series-item-width': `${Math.max(1, options.itemWidth)}px`,
		});
		this.backgroundEl = this.rootEl.createDiv('mbv-book-series-lightbox-background');
		this.backgroundEl.setCssProps({ opacity: '0' });
		this.viewportEl = this.rootEl.createDiv({
			cls: 'mbv-book-series-lightbox-viewport',
			attr: { tabindex: '-1' },
		});
		this.headerEl = this.render();
		this.headerEl.setCssProps({ opacity: '0' });
	}

	open(): void {
		if (this.visible) return;
		this.visible = true;
		this.closing = false;
		this.sourceRects = this.options.source.getItemRects();
		this.ownerDocument.body.append(this.rootEl);
		this.ownerDocument.addEventListener('keydown', this.handleKeydown);
		this.rootEl.addEventListener('click', this.handleRootClick);
		this.viewportEl.focus({ preventScroll: true });
		this.animateOpen();
	}

	close(): void {
		if (!this.visible || this.closing) return;
		this.closing = true;
		this.showFinalState();
		this.cancelAnimations();
		this.rootEl.addClass('is-transitioning');
		this.rootEl.removeClass('is-opening');
		this.rootEl.addClass('is-closing');
		if (!this.canAnimate()) {
			this.remove();
			return;
		}

		const sourceRects = this.getCurrentSourceRects();
		this.animations.push(
			this.backgroundEl.animate(
				[{ opacity: BACKGROUND_OPACITY }, { opacity: 0 }],
				this.animationOptions(CLOSE_DURATION, CLOSE_EASING),
			),
			this.headerEl.animate(
				[
					{ opacity: 1, transform: 'translateY(0)' },
					{ opacity: 0, transform: 'translateY(-12px)' },
				],
				this.animationOptions(180, CLOSE_EASING),
			),
		);
		for (const [index, item] of this.items.entries()) {
			const targetRect = sourceRects[index] ?? sourceRects.at(-1);
			if (!targetRect) continue;
			const targetOpacity = index < this.options.source.visibleItemCount ? 1 : 0;
			const delay = Math.min(MAX_STAGGER, (this.items.length - index - 1) * 18);
			this.animations.push(item.shellEl.animate(
				[
					{ opacity: 1, transform: 'translate(0, 0) scale(1, 1)' },
					{
						opacity: targetOpacity,
						transform: this.rectTransform(item.shellEl, targetRect),
					},
				],
				this.animationOptions(CLOSE_DURATION, CLOSE_EASING, delay),
			));
			if (item.detailsEl) {
				this.animations.push(item.detailsEl.animate(
					[{ opacity: 1 }, { opacity: 0 }],
					this.animationOptions(150, CLOSE_EASING),
				));
			}
		}
		void this.waitForAnimations().then(() => this.remove());
	}

	remove(): void {
		if (!this.visible && !this.rootEl.isConnected) return;
		this.visible = false;
		this.closing = false;
		this.cancelAnimations();
		this.ownerDocument.removeEventListener('keydown', this.handleKeydown);
		this.rootEl.removeEventListener('click', this.handleRootClick);
		for (const item of this.items) item.controller.destroy?.();
		this.items.length = 0;
		this.rootEl.remove();
		this.options.source.setExpanded(false);
		if (this.options.source.element.isConnected) {
			this.options.source.element.focus({ preventScroll: true });
		}
		this.options.onClosed();
	}

	private render(): HTMLElement {
		const headerEl = this.viewportEl.createDiv('mbv-book-series-lightbox-header');
		headerEl.createDiv({
			cls: 'mbv-book-series-lightbox-title',
			text: this.options.collection.label,
		});
		headerEl.createSpan({
			cls: 'mbv-book-series-lightbox-count',
			text: `${this.options.collection.entries.length} 本`,
		});
		const closeButton = headerEl.createEl('button', {
			cls: 'clickable-icon mbv-book-series-lightbox-close',
			attr: { type: 'button', 'aria-label': '收起合集' },
		});
		setIcon(closeButton, 'x');
		closeButton.addEventListener('click', () => this.close());

		const scrollEl = this.viewportEl.createDiv('mbv-book-series-lightbox-scroll');
		const gridEl = scrollEl.createDiv('mbv-book-series-lightbox-grid');
		for (const [index, entry] of this.options.collection.entries.entries()) {
			const itemEl = gridEl.createDiv('mbv-book-series-lightbox-item');
			itemEl.setCssProps({
				'--mbv-book-series-motion-layer': String(
					this.options.collection.entries.length - index,
				),
			});
			itemEl.classList.toggle('is-source-front', index === 0);
			itemEl.classList.toggle(
				'is-source-back',
				index > 0 && index < this.options.source.visibleItemCount,
			);
			const controller = this.options.createCard(itemEl, entry);
			itemEl.append(controller.element);
			const shellEl = controller.element.querySelector<HTMLElement>('.mbv-book-shell');
			if (!shellEl) {
				controller.destroy?.();
				itemEl.remove();
				continue;
			}
			const detailsEl = controller.element.querySelector<HTMLElement>('.mbv-book-card-body');
			shellEl.setCssProps({ opacity: '0' });
			if (detailsEl) detailsEl.setCssProps({ opacity: '0' });
			this.items.push({ element: itemEl, shellEl, detailsEl, controller });
			itemEl.addEventListener('contextmenu', (event) => {
				const target = event.target as Element | null;
				if (target?.closest('button, input, textarea, select')) return;
				event.preventDefault();
				event.stopPropagation();
				this.options.onEdit(entry);
			});
		}
		return headerEl;
	}

	private animateOpen(): void {
		if (!this.canAnimate()) {
			this.options.source.setExpanded(true);
			this.showFinalState();
			this.rootEl.removeClass('is-transitioning');
			return;
		}

		this.backgroundEl.setCssProps({ opacity: String(BACKGROUND_OPACITY) });
		this.headerEl.setCssProps({ opacity: '1' });
		this.animations.push(
			this.backgroundEl.animate(
				[{ opacity: 0 }, { opacity: BACKGROUND_OPACITY }],
				this.animationOptions(280, OPEN_EASING),
			),
			this.headerEl.animate(
				[
					{ opacity: 0, transform: 'translateY(-12px)' },
					{ opacity: 1, transform: 'translateY(0)' },
				],
				this.animationOptions(280, OPEN_EASING, 100),
			),
		);
		for (const [index, item] of this.items.entries()) {
			const sourceRect = this.sourceRects[index] ?? this.sourceRects.at(-1);
			item.shellEl.setCssProps({ opacity: '1' });
			const sourceOpacity = index < this.options.source.visibleItemCount ? 1 : 0;
			const delay = Math.min(MAX_STAGGER, index * ITEM_STAGGER);
			if (sourceRect) {
				this.animations.push(item.shellEl.animate(
					[
						{
							opacity: sourceOpacity,
							transform: this.rectTransform(item.shellEl, sourceRect),
						},
						{ opacity: 1, transform: 'translate(0, 0) scale(1, 1)' },
					],
					this.animationOptions(OPEN_DURATION, OPEN_EASING, delay),
				));
			}
			if (item.detailsEl) {
				item.detailsEl.setCssProps({ opacity: '1' });
				this.animations.push(item.detailsEl.animate(
					[
						{ opacity: 0, transform: 'translateY(-6px)' },
						{ opacity: 1, transform: 'translateY(0)' },
					],
					this.animationOptions(220, OPEN_EASING, delay + 190),
				));
			}
		}
		this.options.source.setExpanded(true);
		void this.waitForAnimations().then(() => {
			if (this.closing || !this.visible) return;
			this.showFinalState();
			this.cancelAnimations();
			this.rootEl.removeClasses(['is-transitioning', 'is-opening']);
		});
	}

	private showFinalState(): void {
		this.backgroundEl.setCssProps({ opacity: String(BACKGROUND_OPACITY) });
		this.headerEl.setCssProps({ opacity: '1' });
		this.headerEl.style.removeProperty('transform');
		for (const item of this.items) {
			item.shellEl.setCssProps({ opacity: '1' });
			item.shellEl.style.removeProperty('transform');
			if (item.detailsEl) {
				item.detailsEl.setCssProps({ opacity: '1' });
				item.detailsEl.style.removeProperty('transform');
			}
		}
	}

	private getCurrentSourceRects(): readonly DOMRect[] {
		if (!this.options.source.element.isConnected) return this.sourceRects;
		const rects = this.options.source.getItemRects();
		return rects.length > 0 ? rects : this.sourceRects;
	}

	private rectTransform(element: HTMLElement, target: DOMRect): string {
		const from = element.getBoundingClientRect();
		if (from.width <= 0 || from.height <= 0) {
			return 'translate(0, 0) scale(0.2, 0.2)';
		}
		const translateX = target.left - from.left;
		const translateY = target.top - from.top;
		const scaleX = target.width / from.width;
		const scaleY = target.height / from.height;
		return `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
	}

	private animationOptions(
		duration: number,
		easing: string,
		delay = 0,
	): KeyframeAnimationOptions {
		return { duration, easing, delay, fill: 'both' };
	}

	private waitForAnimations(): Promise<void> {
		return Promise.all(this.animations.map((animation) =>
			animation.finished.catch(() => undefined),
		)).then(() => undefined);
	}

	private canAnimate(): boolean {
		return !this.ownerDocument.defaultView
			?.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	private cancelAnimations(): void {
		for (const animation of this.animations) animation.cancel();
		this.animations = [];
	}

	private readonly handleRootClick = (event: MouseEvent): void => {
		if (
			event.target === this.rootEl ||
			event.target === this.backgroundEl ||
			event.target === this.viewportEl ||
			(event.target as Element | null)?.classList?.contains(
				'mbv-book-series-lightbox-scroll',
			) ||
			(event.target as Element | null)?.classList?.contains(
				'mbv-book-series-lightbox-grid',
			)
		) this.close();
	};

	private readonly handleKeydown = (event: KeyboardEvent): void => {
		if (this.visible && event.key === 'Escape') this.close();
	};
}

interface CategoryPointerDragState {
	pointerId: number;
	pointerType: string;
	sourceEl: HTMLElement;
	sourcePath: string;
	parentPath: string;
	startClientY: number;
	lastClientY: number;
	initialIndex: number;
	currentIndex: number;
	initialScrollTop: number;
	items: HTMLElement[];
	rects: CategoryBlockRect[];
	touchReady: boolean;
	active: boolean;
}

interface CategoryBlockRect {
	top: number;
	height: number;
}

export class IndexCategoryDragController {
	private drag: CategoryPointerDragState | null = null;
	private pointerAbort: AbortController | null = null;
	private activationTimer: number | null = null;
	private autoScrollFrame: number | null = null;
	private settleTimer: number | null = null;
	private suppressedPath: string | null = null;
	private suppressClickUntil = 0;

	constructor(
		private readonly navEl: HTMLElement,
		private readonly onReorder: (paths: string[]) => void,
	) {}

	bind(itemEl: HTMLElement, path: string, parentPath: string): void {
		itemEl.dataset.categoryPath = path;
		itemEl.dataset.categoryParent = parentPath;
		itemEl.addEventListener('pointerdown', (event) => {
			if (
				this.drag ||
				this.settleTimer !== null ||
				!event.isPrimary ||
				event.button !== 0 ||
				(event.target as Element | null)?.closest('.mbv-index-nav-toggle')
			) return;
			const items = this.getSiblingItems(parentPath);
			const initialIndex = items.indexOf(itemEl);
			if (initialIndex < 0 || items.length < 2) return;
			this.drag = {
				pointerId: event.pointerId,
				pointerType: event.pointerType,
				sourceEl: itemEl,
				sourcePath: path,
				parentPath,
				startClientY: event.clientY,
				lastClientY: event.clientY,
				initialIndex,
				currentIndex: initialIndex,
				initialScrollTop: this.navEl.scrollTop,
				items,
				rects: items.map((item) => this.getBlockRect(item)),
				touchReady: event.pointerType !== 'touch',
				active: false,
			};
			this.bindPointerEvents(itemEl.ownerDocument);
			if (event.pointerType === 'touch') {
				this.activationTimer = this.navEl.win.setTimeout(() => {
					this.activationTimer = null;
					const drag = this.drag;
					if (!drag || drag.pointerId !== event.pointerId) return;
					drag.touchReady = true;
					this.activate(drag);
				}, 180);
			}
		});
	}

	consumeClick(path: string): boolean {
		if (this.suppressedPath !== path || performance.now() > this.suppressClickUntil) {
			return false;
		}
		this.suppressedPath = null;
		this.suppressClickUntil = 0;
		return true;
	}

	reset(): void {
		this.cancel(false);
		if (this.settleTimer !== null) {
			this.navEl.win.clearTimeout(this.settleTimer);
			this.settleTimer = null;
		}
		this.clearTransforms(this.getAllItems());
	}

	destroy(): void {
		this.reset();
	}

	private bindPointerEvents(ownerDocument: Document): void {
		this.pointerAbort?.abort();
		const abort = new AbortController();
		this.pointerAbort = abort;
		ownerDocument.addEventListener('pointermove', (event) => {
			this.handlePointerMove(event);
		}, { signal: abort.signal });
		ownerDocument.addEventListener('pointerup', (event) => {
			this.handlePointerEnd(event, false);
		}, { capture: true, signal: abort.signal });
		ownerDocument.addEventListener('pointercancel', (event) => {
			this.handlePointerEnd(event, true);
		}, { signal: abort.signal });
		ownerDocument.addEventListener('keydown', (event) => {
			if (event.key !== 'Escape' || !this.drag?.active) return;
			event.preventDefault();
			this.cancel(true);
		}, { signal: abort.signal });
	}

	private handlePointerMove(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		drag.lastClientY = event.clientY;
		if (!drag.active) {
			const distance = Math.abs(event.clientY - drag.startClientY);
			if (drag.pointerType === 'touch') {
				if (!drag.touchReady && distance > 8) {
					this.cancel(false);
					return;
				}
				if (!drag.touchReady) return;
			} else if (distance < 4) return;
			this.activate(drag);
		}
		event.preventDefault();
		this.updateSort(drag);
	}

	private activate(drag: CategoryPointerDragState): void {
		if (drag.active || this.drag !== drag) return;
		drag.active = true;
		drag.sourceEl.addClass('is-dragging');
		this.getSelfEl(drag.sourceEl)?.addClass('is-being-dragged');
		drag.sourceEl.setAttribute('aria-grabbed', 'true');
		this.navEl.addClass('is-sorting');
		this.startAutoScroll();
		this.updateSort(drag);
	}

	private updateSort(drag: CategoryPointerDragState): void {
		const scrollDelta = this.navEl.scrollTop - drag.initialScrollTop;
		const pointerDelta = drag.lastClientY - drag.startClientY;
		const sourceRect = drag.rects[drag.initialIndex];
		if (!sourceRect) return;
		const sourceCenter = sourceRect.top + sourceRect.height / 2 + pointerDelta;
		let nextIndex = drag.initialIndex;
		if (pointerDelta > 0) {
			for (let index = drag.initialIndex + 1; index < drag.rects.length; index += 1) {
				const rect = drag.rects[index];
				if (!rect || sourceCenter <= rect.top - scrollDelta + rect.height / 2) break;
				nextIndex = index;
			}
		} else if (pointerDelta < 0) {
			for (let index = drag.initialIndex - 1; index >= 0; index -= 1) {
				const rect = drag.rects[index];
				if (!rect || sourceCenter >= rect.top - scrollDelta + rect.height / 2) break;
				nextIndex = index;
			}
		}
		drag.currentIndex = nextIndex;
		const virtualItems = [...drag.items];
		virtualItems.splice(drag.initialIndex, 1);
		virtualItems.splice(nextIndex, 0, drag.sourceEl);
		for (const [originalIndex, item] of drag.items.entries()) {
			if (item === drag.sourceEl) {
				this.setBlockTranslate(item, pointerDelta + scrollDelta);
				continue;
			}
			const targetIndex = virtualItems.indexOf(item);
			const originalRect = drag.rects[originalIndex];
			const targetRect = drag.rects[targetIndex];
			if (!originalRect || !targetRect) continue;
			this.setBlockTranslate(item, targetRect.top - originalRect.top);
		}
	}

	private handlePointerEnd(event: PointerEvent, canceled: boolean): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		if (!drag.active) {
			this.cancel(false);
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.suppressedPath = drag.sourcePath;
		this.suppressClickUntil = performance.now() + 300;
		if (canceled) this.cancel(true);
		else this.finish(drag);
	}

	private finish(drag: CategoryPointerDragState): void {
		this.stopTracking();
		const nextItems = [...drag.items];
		const [source] = nextItems.splice(drag.initialIndex, 1);
		if (source) nextItems.splice(drag.currentIndex, 0, source);
		const nextPaths = nextItems.map((item) => item.dataset.categoryPath).filter(
			(path): path is string => Boolean(path),
		);
		const sourceRect = drag.rects[drag.initialIndex];
		const targetRect = drag.rects[drag.currentIndex];
		drag.sourceEl.addClass('is-settling');
		if (sourceRect && targetRect) {
			this.setBlockTranslate(drag.sourceEl, targetRect.top - sourceRect.top);
		}
		this.settleTimer = this.navEl.win.setTimeout(() => {
			this.settleTimer = null;
			this.clearTransforms(drag.items);
			if (drag.currentIndex !== drag.initialIndex) this.onReorder(nextPaths);
		}, 160);
	}

	private cancel(animateBack: boolean): void {
		const drag = this.drag;
		this.stopTracking();
		if (!drag) return;
		if (!drag.active || !animateBack) {
			this.clearTransforms(drag.items);
			return;
		}
		for (const item of drag.items) {
			item.addClass('is-settling');
			this.setBlockTranslate(item, 0, true);
		}
		this.settleTimer = this.navEl.win.setTimeout(() => {
			this.settleTimer = null;
			this.clearTransforms(drag.items);
		}, 160);
	}

	private stopTracking(): void {
		this.pointerAbort?.abort();
		this.pointerAbort = null;
		this.drag = null;
		if (this.activationTimer !== null) {
			this.navEl.win.clearTimeout(this.activationTimer);
			this.activationTimer = null;
		}
		if (this.autoScrollFrame !== null) {
			this.navEl.win.cancelAnimationFrame(this.autoScrollFrame);
			this.autoScrollFrame = null;
		}
	}

	private startAutoScroll(): void {
		if (this.autoScrollFrame !== null) return;
		const step = (): void => {
			this.autoScrollFrame = null;
			const drag = this.drag;
			if (!drag?.active) return;
			const rect = this.navEl.getBoundingClientRect();
			const threshold = 32;
			let amount = 0;
			if (drag.lastClientY < rect.top + threshold) {
				amount = -12 * (1 - Math.max(0, drag.lastClientY - rect.top) / threshold);
			} else if (drag.lastClientY > rect.bottom - threshold) {
				amount = 12 * (1 - Math.max(0, rect.bottom - drag.lastClientY) / threshold);
			}
			if (amount !== 0) {
				const previous = this.navEl.scrollTop;
				this.navEl.scrollTop += amount;
				if (this.navEl.scrollTop !== previous) this.updateSort(drag);
			}
			this.autoScrollFrame = this.navEl.win.requestAnimationFrame(step);
		};
		this.autoScrollFrame = this.navEl.win.requestAnimationFrame(step);
	}

	private clearTransforms(items: readonly HTMLElement[]): void {
		this.navEl.removeClass('is-sorting');
		const elements = new Set(items.flatMap((item) => this.getBranchItems(item)));
		for (const item of elements) {
			item.removeClass('is-dragging', 'is-settling');
			this.getSelfEl(item)?.removeClass('is-being-dragged');
			item.removeAttribute('aria-grabbed');
			item.style.removeProperty('translate');
		}
	}

	private setBlockTranslate(
		root: HTMLElement,
		deltaY: number,
		settling = false,
	): void {
		for (const item of this.getBranchItems(root)) {
			if (settling) item.addClass('is-settling');
			item.style.translate = `0 ${deltaY}px`;
		}
	}

	private getBlockRect(root: HTMLElement): CategoryBlockRect {
		const elements = this.getBranchItems(root);
		const first = elements[0]?.getBoundingClientRect() ?? root.getBoundingClientRect();
		const last = elements.at(-1)?.getBoundingClientRect() ?? first;
		return { top: first.top, height: last.bottom - first.top };
	}

	private getBranchItems(root: HTMLElement): HTMLElement[] {
		return [root];
	}

	private getSiblingItems(parentPath: string): HTMLElement[] {
		return this.getAllItems().filter((item) =>
			item.dataset.categoryParent === parentPath,
		);
	}

	private getAllItems(): HTMLElement[] {
		return Array.from(
			this.navEl.querySelectorAll<HTMLElement>('.mbv-index-nav-item.is-category'),
		);
	}

	private getSelfEl(item: HTMLElement): HTMLElement | null {
		return item.querySelector<HTMLElement>(':scope > .tree-item-self');
	}
}

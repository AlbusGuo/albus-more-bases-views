export class TierDragAutoScroller {
	private frame = 0;
	private scroller: HTMLElement | null = null;
	private lastDragY = 0;
	private active = false;

	constructor(private readonly containerEl: HTMLElement) {
		const ownerDocument = containerEl.ownerDocument;
		ownerDocument.addEventListener('dragover', this.handleDragOver);
		ownerDocument.addEventListener('dragend', this.handleDragEnd);
		ownerDocument.addEventListener('drop', this.handleDragEnd);
	}

	start(): void {
		this.active = true;
		this.scroller = this.findScrollContainer();
	}

	stop(): void {
		this.active = false;
		const view = this.containerEl.ownerDocument.defaultView;
		if (view && this.frame) view.cancelAnimationFrame(this.frame);
		this.frame = 0;
	}

	destroy(): void {
		this.stop();
		const ownerDocument = this.containerEl.ownerDocument;
		ownerDocument.removeEventListener('dragover', this.handleDragOver);
		ownerDocument.removeEventListener('dragend', this.handleDragEnd);
		ownerDocument.removeEventListener('drop', this.handleDragEnd);
	}

	private readonly handleDragOver = (event: DragEvent): void => {
		if (!this.active) return;
		this.lastDragY = event.clientY;
		if (this.getDirection() === 0) {
			this.cancelFrame();
			return;
		}
		if (!this.frame) this.run();
	};

	private readonly handleDragEnd = (): void => this.stop();

	private run(): void {
		const view = this.containerEl.ownerDocument.defaultView;
		if (!view) return;
		this.frame = view.requestAnimationFrame(() => {
			this.frame = 0;
			if (!this.active) return;
			const direction = this.getDirection();
			if (direction === 0) return;
			const bounds = this.getScrollBounds();
			const edge = Math.min(160, Math.max(72, bounds.height * 0.18));
			const distance = direction < 0
				? this.lastDragY - bounds.top
				: bounds.bottom - this.lastDragY;
			const strength = Math.max(0, 1 - distance / edge);
			this.findScrollContainer().scrollTop +=
				direction * Math.max(1, Math.round(strength * strength * 18));
			this.run();
		});
	}

	private getDirection(): -1 | 0 | 1 {
		const view = this.containerEl.ownerDocument.defaultView;
		if (!view) return 0;
		const bounds = this.getScrollBounds();
		const edge = Math.min(160, Math.max(72, bounds.height * 0.18));
		if (this.lastDragY >= bounds.top && this.lastDragY < bounds.top + edge) return -1;
		if (
			this.lastDragY <= bounds.bottom &&
			this.lastDragY > bounds.bottom - edge
		) {
			return 1;
		}
		return 0;
	}

	private getScrollBounds(): { top: number; bottom: number; height: number } {
		const scroller = this.findScrollContainer();
		if (scroller === this.containerEl.ownerDocument.documentElement) {
			const height = this.containerEl.ownerDocument.defaultView?.innerHeight ??
				scroller.clientHeight;
			return { top: 0, bottom: height, height };
		}
		const rect = scroller.getBoundingClientRect();
		return { top: rect.top, bottom: rect.bottom, height: rect.height };
	}

	private cancelFrame(): void {
		const view = this.containerEl.ownerDocument.defaultView;
		if (view && this.frame) view.cancelAnimationFrame(this.frame);
		this.frame = 0;
	}

	private findScrollContainer(): HTMLElement {
		if (this.scroller?.isConnected) return this.scroller;
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		let element: HTMLElement | null = this.containerEl;
		while (element) {
			const style = ownerWindow?.getComputedStyle(element);
			if (style && /(auto|scroll)/.test(`${style.overflow} ${style.overflowY}`)) {
				this.scroller = element;
				return element;
			}
			element = element.parentElement;
		}
		this.scroller = this.containerEl.ownerDocument.documentElement;
		return this.scroller;
	}
}

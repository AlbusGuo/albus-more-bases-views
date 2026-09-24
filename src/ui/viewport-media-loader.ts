import {
	VIEWPORT_OVERSCAN_ROWS,
	findScrollRoot,
} from './viewport-grid';

export interface ViewportMediaController {
	element: HTMLElement;
	hasPendingMedia: () => boolean;
	loadMedia: () => void;
}

const MINIMUM_OVERSCAN_PIXELS = 2000;

export class ViewportMediaLoader<
	Controller extends ViewportMediaController,
> {
	private readonly scrollRoot: HTMLElement | null;
	private readonly controllers = new Map<HTMLElement, Controller>();
	private readonly pendingLoads = new Set<Controller>();
	private observer: IntersectionObserver | null = null;
	private loadFrame: number | null = null;
	private overscanPixels = MINIMUM_OVERSCAN_PIXELS;
	private disposed = false;

	constructor(private readonly containerEl: HTMLElement) {
		this.scrollRoot = findScrollRoot(containerEl);
		this.rebuildObserver();
	}

	setEstimatedItemHeight(itemHeight: number): void {
		const nextOverscan = Math.max(
			MINIMUM_OVERSCAN_PIXELS,
			Math.ceil(Math.max(1, itemHeight) * VIEWPORT_OVERSCAN_ROWS),
		);
		if (nextOverscan === this.overscanPixels) return;
		this.overscanPixels = nextOverscan;
		this.rebuildObserver();
	}

	sync(controllers: Iterable<Controller>): void {
		if (this.disposed) return;
		const activeElements = new Set<HTMLElement>();
		for (const controller of controllers) {
			const element = controller.element;
			activeElements.add(element);
			this.controllers.set(element, controller);
			this.observer?.unobserve(element);
			this.pendingLoads.delete(controller);
			if (!element.isConnected || !controller.hasPendingMedia()) continue;
			if (this.observer) this.observer.observe(element);
			else this.queueLoad(controller);
		}
		for (const [element, controller] of this.controllers) {
			if (activeElements.has(element)) continue;
			this.observer?.unobserve(element);
			this.pendingLoads.delete(controller);
			this.controllers.delete(element);
		}
	}

	destroy(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.observer?.disconnect();
		this.observer = null;
		this.cancelLoadFrame();
		this.controllers.clear();
		this.pendingLoads.clear();
	}

	private rebuildObserver(): void {
		this.observer?.disconnect();
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (!ownerWindow || typeof ownerWindow.IntersectionObserver !== 'function') {
			this.observer = null;
			for (const controller of this.controllers.values()) {
				if (controller.element.isConnected && controller.hasPendingMedia()) {
					this.queueLoad(controller);
				}
			}
			return;
		}
		this.observer = new ownerWindow.IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const controller = this.controllers.get(entry.target as HTMLElement);
					if (!controller) continue;
					this.observer?.unobserve(controller.element);
					this.queueLoad(controller);
				}
			},
			{
				root: this.scrollRoot,
				rootMargin: String(this.overscanPixels) + 'px 0px',
			},
		);
		for (const controller of this.controllers.values()) {
			if (controller.element.isConnected && controller.hasPendingMedia()) {
				this.observer.observe(controller.element);
			}
		}
	}

	private queueLoad(controller: Controller): void {
		if (this.disposed || !controller.hasPendingMedia()) return;
		this.pendingLoads.add(controller);
		if (this.loadFrame !== null) return;
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (!ownerWindow) {
			this.flushLoads();
			return;
		}
		this.loadFrame = ownerWindow.requestAnimationFrame(() => {
			this.loadFrame = null;
			this.flushLoads();
		});
	}

	private flushLoads(): void {
		if (this.disposed) return;
		const controllers = [...this.pendingLoads];
		this.pendingLoads.clear();
		for (const controller of controllers) {
			if (!controller.element.isConnected || !controller.hasPendingMedia()) continue;
			controller.loadMedia();
		}
	}

	private cancelLoadFrame(): void {
		if (this.loadFrame === null) return;
		this.containerEl.ownerDocument.defaultView?.cancelAnimationFrame(this.loadFrame);
		this.loadFrame = null;
	}
}
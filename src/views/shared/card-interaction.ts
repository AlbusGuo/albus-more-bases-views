import { findScrollRoot } from '../../ui/viewport-grid';
import { getCardPointerStyle, getRestingCardPointerStyle } from './card-pointer-style';

const MAX_RECEDING_CARDS = 2;

export interface InteractiveCardController {
	element: HTMLElement;
	interactionElement: HTMLElement;
	placementElement: HTMLElement;
	openMarkdown: (event: MouseEvent | KeyboardEvent) => Promise<void>;
	isEditing?: () => boolean;
	getInteractionRect?: () => DOMRect;
	getPointerRect?: () => DOMRect;
	applyPointerStyle?: (values: Readonly<Record<string, string>>) => void;
	onExpandedChange?: (expanded: boolean) => void;
}

export interface CardInteractionOptions {
	cardSelector?: string;
	faceSelector?: string;
	placementSelector?: string;
	boundsSelector?: string;
	contextMenu?: 'open' | 'delegate';
	openingRotation?: boolean;
	expandOnClick?: boolean;
	openExpandedOnClick?: boolean;
	cachePointerRect?: boolean;
}

interface InteractionRuntime {
	findScrollRoot: typeof findScrollRoot;
	getCardPointerStyle: typeof getCardPointerStyle;
	getRestingCardPointerStyle: typeof getRestingCardPointerStyle;
	tickSpring: typeof tickSpring;
}

interface PointerState {
	cardEl: HTMLElement;
	x: number;
	y: number;
}

interface CardPlacement {
	x: number;
	y: number;
	scale: number;
}

interface ScrollLockState {
	element: HTMLElement;
	scrollLeft: number;
	scrollTop: number;
}

export class CardInteractionController {
	private readonly cards = new Map<HTMLElement, InteractiveCardController>();
	private readonly abortController: AbortController;
	private readonly scrollRoot: HTMLElement | null;
	private activeCardEl: HTMLElement | null = null;
	private hoverCardEl: HTMLElement | null = null;
	private hoverRect: DOMRect | null = null;
	private hoverRectCardEl: HTMLElement | null = null;
	private readonly recedingCardEls: HTMLElement[] = [];
	private pointerState: PointerState | null = null;
	private pointerFrame: number | null = null;
	private recenterTimer: number | null = null;
	private openingFrame: number | null = null;
	private openingCardEl: HTMLElement | null = null;
	private openingLastTime = 0;
	private openingLastAngle = 0;
	private openingAngle = 0;
	private openingLastPlacement: CardPlacement = { x: 0, y: 0, scale: 1 };
	private openingPlacement: CardPlacement = { x: 0, y: 0, scale: 1 };
	private openingTarget: CardPlacement = { x: 0, y: 0, scale: 1 };
	private openingRunning = false;
	private scrollLock: ScrollLockState | null = null;
	private expandOnClick: boolean;

	constructor(
		private readonly gridEl: HTMLElement,
		private readonly options: CardInteractionOptions = {},
		private readonly runtime: InteractionRuntime = {
			findScrollRoot,
			getCardPointerStyle,
			getRestingCardPointerStyle,
			tickSpring,
		},
	) {
		this.expandOnClick = options.expandOnClick !== false;
		const ownerWindow = gridEl.ownerDocument.defaultView ?? window;
		this.abortController = new ownerWindow.AbortController();
		this.scrollRoot = this.runtime.findScrollRoot(gridEl);
		const signal = this.abortController.signal;
		gridEl.addEventListener('pointermove', this.handlePointerMove, { signal });
		gridEl.addEventListener('pointerout', this.handlePointerOut, { signal });
		gridEl.addEventListener('pointerleave', this.handlePointerLeave, { signal });
		gridEl.addEventListener('click', this.handleClick, { capture: true, signal });
		gridEl.addEventListener('contextmenu', this.handleContextMenu, { signal });
		gridEl.addEventListener('keydown', this.handleKeyDown, { signal });
		(this.scrollRoot ?? ownerWindow).addEventListener('scroll', this.handleViewportChange, {
			passive: true,
			signal,
		});
		ownerWindow.addEventListener('resize', this.handleViewportChange, { signal });
		ownerWindow.addEventListener('blur', this.handlePointerBoundaryExit, { signal });
		gridEl.ownerDocument.addEventListener(
			'visibilitychange',
			this.handleVisibilityChange,
			{ signal },
		);
		gridEl.ownerDocument.addEventListener('wheel', this.handleLockedScroll, {
			capture: true,
			passive: false,
			signal,
		});
		gridEl.ownerDocument.addEventListener('touchmove', this.handleLockedScroll, {
			capture: true,
			passive: false,
			signal,
		});
	}

	expand(element: HTMLElement, animate = true): void {
		if (this.activeCardEl !== element) this.activate(element, animate);
	}

	collapse(): void {
		this.deactivate();
	}

	setExpandOnClick(enabled: boolean): void {
		this.expandOnClick = enabled;
		if (!enabled) this.deactivate();
	}

	resetPointer(element: HTMLElement): void {
		this.cancelPointerFrame();
		this.removeRecedingCard(element);
		this.resetCard(element);
		if (this.hoverCardEl === element) this.hoverCardEl = null;
		this.clearHoverRect(element);
	}

	private setStyles(
		element: HTMLElement | null,
		values: Record<string, string>,
	): void {
		if (!element) return;
		for (const [key, value] of Object.entries(values)) {
			element.style.setProperty(key, value);
		}
	}

	register(card: InteractiveCardController): void {
		this.cards.set(card.element, card);
	}

	unregister(card: InteractiveCardController): void {
		if (this.activeCardEl === card.element) this.deactivate();
		if (this.hoverCardEl === card.element) this.hoverCardEl = null;
		this.clearHoverRect(card.element);
		this.removeRecedingCard(card.element);
		this.cards.delete(card.element);
	}

	detach(card: InteractiveCardController): void {
		if (this.activeCardEl === card.element) this.deactivate();
		if (this.hoverCardEl === card.element) {
			this.resetCard(card.element);
			this.hoverCardEl = null;
		}
		this.clearHoverRect(card.element);
		this.removeRecedingCard(card.element);
	}

	destroy(): void {
		this.abortController.abort();
		this.deactivate();
		this.cancelPointerFrame();
		this.cancelRecenterTimer();
		this.cancelOpening();
		this.unlockScroll();
		this.recedingCardEls.length = 0;
		this.cards.clear();
	}

	private readonly handlePointerMove = (event: PointerEvent): void => {
		if (event.pointerType === 'touch') return;
		if (this.isIgnoredTarget(event.target)) return;
		let cardEl: HTMLElement | null;
		if (this.activeCardEl) {
			if (this.findCard(event.target) !== this.activeCardEl) {
				this.cancelPointerFrame();
				if (this.hoverCardEl === this.activeCardEl) this.hoverCardEl = null;
				this.clearHoverRect(this.activeCardEl);
				this.resetCard(this.activeCardEl);
				return;
			}
			cardEl = this.activeCardEl;
		} else cardEl = this.findPointerCard(event);
		if (!cardEl) {
			if (this.hoverCardEl) this.resetHoverMotion();
			return;
		}
		if (this.cards.get(cardEl)?.isEditing?.()) { this.resetPointer(cardEl); return; }
		if (this.openingRunning) return;
		if (this.hoverCardEl !== cardEl) {
			if (this.hoverCardEl && this.hoverCardEl !== this.activeCardEl) {
				this.recedeCard(this.hoverCardEl);
			}
			this.removeRecedingCard(cardEl);
			this.hoverCardEl = cardEl;
			this.clearHoverRect();
			cardEl.classList.add('is-interacting');
		}
		this.pointerState = {
			cardEl,
			x: event.clientX,
			y: event.clientY,
		};
		this.schedulePointerFrame();
	};

	private readonly handlePointerOut = (event: PointerEvent): void => {
		const cardEl = this.findCard(event.target);
		if (!cardEl || cardEl.contains(event.relatedTarget as Node | null)) return;
		this.cancelPointerFrame();
		if (this.activeCardEl === cardEl) {
			if (this.hoverCardEl === cardEl) this.hoverCardEl = null;
			this.clearHoverRect(cardEl);
			this.resetCard(cardEl);
			return;
		}
		if (this.hoverCardEl === cardEl) this.hoverCardEl = null;
		this.clearHoverRect(cardEl);
		this.recedeCard(cardEl);
	};

	private readonly handlePointerLeave = (): void => {
		this.resetHoverMotion();
	};

	private readonly handlePointerBoundaryExit = (): void => {
		this.resetHoverMotion();
	};

	private readonly handleVisibilityChange = (): void => {
		if (this.gridEl.ownerDocument.hidden) this.resetHoverMotion();
	};

	private readonly handleClick = (event: MouseEvent): void => {
		if (event.button !== 0) return;
		if (this.isIgnoredTarget(event.target)) return;
		const candidate = this.findPointerCard(event);
		if (candidate && this.cards.get(candidate)?.isEditing?.()) return;
		if (this.activeCardEl && this.cards.get(this.activeCardEl)?.isEditing?.()) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		const cardEl = candidate;
		if (!cardEl) {
			this.deactivate();
			return;
		}
		const card = this.cards.get(cardEl);
		if (!card) return;
		if (!this.expandOnClick) {
			event.preventDefault();
			event.stopPropagation();
			this.deactivate();
			void card.openMarkdown(event);
			return;
		}
		if (this.activeCardEl && this.activeCardEl !== cardEl) {
			event.preventDefault();
			event.stopPropagation();
			this.deactivate();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (this.activeCardEl) {
			if (this.options.openExpandedOnClick) {
				this.openActiveCard(cardEl, card, event);
			}
			else this.deactivate();
			return;
		}
		this.activate(cardEl);
	};

	private readonly handleContextMenu = (event: MouseEvent): void => {
		if (this.isIgnoredTarget(event.target)) return;
		const cardEl = this.findCard(event.target);
		if (!cardEl) return;
		if (this.activeCardEl === cardEl) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (this.options.contextMenu === 'delegate') return;
		const card = this.cards.get(cardEl);
		if (!card) return;
		event.preventDefault();
		event.stopPropagation();
		if (this.activeCardEl && this.activeCardEl !== cardEl) {
			this.deactivate();
			return;
		}
		this.deactivate();
		void card.openMarkdown(event);
	};

	private readonly handleKeyDown = (event: KeyboardEvent): void => {
		if (this.isIgnoredTarget(event.target)) return;
		const candidate = this.findCard(event.target);
		if (candidate && this.cards.get(candidate)?.isEditing?.()) return;
		if (event.key === 'Escape' && this.activeCardEl) {
			event.preventDefault();
			this.deactivate();
			return;
		}
		if (this.activeCardEl && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
			event.preventDefault();
			return;
		}
		if (event.key !== 'Enter' && event.key !== ' ') return;
		const cardEl = this.findCard(event.target);
		if (!cardEl) return;
		event.preventDefault();
		const card = this.cards.get(cardEl);
		if (!card) return;
		if (!this.expandOnClick) {
			this.deactivate();
			void card.openMarkdown(event);
		} else if (this.activeCardEl && this.options.openExpandedOnClick) {
			this.openActiveCard(cardEl, card, event);
		} else if (this.activeCardEl) this.deactivate();
		else this.activate(cardEl);
	};

	private readonly handleViewportChange = (): void => {
		this.clearHoverRect();
		if (!this.activeCardEl && this.hoverCardEl) this.resetHoverMotion();
		const lock = this.scrollLock;
		if (
			lock &&
			(lock.element.scrollLeft !== lock.scrollLeft ||
				lock.element.scrollTop !== lock.scrollTop)
		) {
			lock.element.scrollLeft = lock.scrollLeft;
			lock.element.scrollTop = lock.scrollTop;
			return;
		}
		if (!this.activeCardEl || this.openingRunning) return;
		this.cancelRecenterTimer();
		const ownerWindow = this.gridEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.recenterTimer = ownerWindow.setTimeout(() => {
			this.recenterTimer = null;
			if (this.activeCardEl) this.centerCard(this.activeCardEl);
		}, 120);
	};

	private readonly handleLockedScroll = (event: Event): void => {
		if (!this.activeCardEl) return;
		if ((event.target as Element | null)?.closest('[data-mbv-card-scroll]')) return;
		event.preventDefault();
	};

	private activate(cardEl: HTMLElement, animate = true): void {
		this.deactivate();
		if (!this.cards.has(cardEl)) return;
		this.finishRecedingCards();
		this.cancelPointerFrame();
		for (const element of this.cards.keys()) {
			if (element !== cardEl && element.classList.contains('is-interacting')) this.resetCard(element);
		}
		this.resetCard(cardEl);
		this.hoverCardEl = null;
		this.clearHoverRect();
		this.activeCardEl = cardEl;
		this.lockScroll();
		cardEl.classList.add('is-active');
		this.cards.get(cardEl)?.onExpandedChange?.(true);
		if (
			animate &&
			this.options.openingRotation !== false &&
			!(this.gridEl.ownerDocument.defaultView ?? window)
				.matchMedia('(prefers-reduced-motion: reduce)').matches
		) this.startOpening(cardEl, this.getCardPlacement(cardEl));
		else this.applyCardPlacement(cardEl, this.getCardPlacement(cardEl));
	}

	private openActiveCard(
		cardEl: HTMLElement,
		card: InteractiveCardController,
		event: MouseEvent | KeyboardEvent,
	): void {
		this.cancelPointerFrame();
		this.hoverCardEl = null;
		this.resetCard(cardEl);
		void card.openMarkdown(event);
	}

	private deactivate(): void {
		const cardEl = this.activeCardEl;
		if (!cardEl) return;
		this.cancelOpening();
		this.activeCardEl = null;
		this.unlockScroll();
		this.cards.get(cardEl)?.onExpandedChange?.(false);
		cardEl.classList.remove('is-active', 'is-opening');
		cardEl.style.removeProperty('--mbv-collectible-translate-x');
		cardEl.style.removeProperty('--mbv-collectible-translate-y');
		cardEl.style.removeProperty('--mbv-collectible-scale');
		cardEl.style.removeProperty('--mbv-collectible-inverse-scale');
		this.resetCard(cardEl);
	}

	private centerCard(cardEl: HTMLElement): void {
		this.applyCardPlacement(cardEl, this.getCardPlacement(cardEl));
	}

	private getCardPlacement(cardEl: HTMLElement): CardPlacement {
		const card = this.cards.get(cardEl);
		if (!card) return { x: 0, y: 0, scale: 1 };
		const cardRect = card.placementElement.getBoundingClientRect();
		const viewportRect = this.getViewportRect();
		const availableWidth = Math.max(1, viewportRect.width - 48);
		const availableHeight = Math.max(1, viewportRect.height - 48);
		const scale = Math.min(
			1.75,
			availableWidth / Math.max(1, cardRect.width),
			availableHeight / Math.max(1, cardRect.height),
		);
		const translateX = viewportRect.left + viewportRect.width / 2 -
			(cardRect.left + cardRect.width / 2);
		const translateY = viewportRect.top + viewportRect.height / 2 -
			(cardRect.top + cardRect.height / 2);
		return {
			x: Math.round(translateX),
			y: Math.round(translateY),
			scale: Math.max(1, scale),
		};
	}

	private applyCardPlacement(cardEl: HTMLElement, placement: CardPlacement): void {
		this.setStyles(cardEl, {
			'--mbv-collectible-translate-x': `${placement.x}px`,
			'--mbv-collectible-translate-y': `${placement.y}px`,
			'--mbv-collectible-scale': String(placement.scale),
			'--mbv-collectible-inverse-scale': String(1 / placement.scale),
		});
	}

	private getViewportRect(): DOMRect {
		if (this.scrollRoot) return this.scrollRoot.getBoundingClientRect();
		const root = this.gridEl.ownerDocument.documentElement;
		return new DOMRect(0, 0, root.clientWidth, root.clientHeight);
	}

	private lockScroll(): void {
		if (this.scrollLock) return;
		const element = this.scrollRoot ?? this.gridEl.ownerDocument.documentElement;
		this.scrollLock = {
			element,
			scrollLeft: element.scrollLeft,
			scrollTop: element.scrollTop,
		};
		element.classList.add('mbv-card-scroll-locked');
	}

	private unlockScroll(): void {
		const lock = this.scrollLock;
		if (!lock) return;
		this.scrollLock = null;
		lock.element.classList.remove('mbv-card-scroll-locked');
		lock.element.scrollLeft = lock.scrollLeft;
		lock.element.scrollTop = lock.scrollTop;
	}

	private schedulePointerFrame(): void {
		if (this.pointerFrame !== null) return;
		const ownerWindow = this.gridEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.pointerFrame = ownerWindow.requestAnimationFrame(() => {
			this.pointerFrame = null;
			this.flushPointerState();
		});
	}

	private flushPointerState(): void {
		const state = this.pointerState;
		this.pointerState = null;
		if (!state || !state.cardEl.isConnected) return;
		const card = this.cards.get(state.cardEl);
		if (!card) return;
		const rect = this.pointerRect(state.cardEl, card);
		const tilt = Number(state.cardEl.style.getPropertyValue('--mbv-collectible-tilt')) || 20;
		this.setPointerStyles(state.cardEl, this.runtime.getCardPointerStyle(state.x, state.y, rect, '--mbv-collectible', tilt));
	}

	private resetCard(cardEl: HTMLElement): void {
		cardEl.classList.remove('is-interacting');
		this.setPointerStyles(cardEl, this.runtime.getRestingCardPointerStyle('--mbv-collectible'));
	}

	private resetHoverMotion(): void {
		this.cancelPointerFrame();
		const hoverCardEl = this.hoverCardEl;
		this.hoverCardEl = null;
		this.clearHoverRect();
		if (hoverCardEl && hoverCardEl !== this.activeCardEl) {
			this.recedeCard(hoverCardEl);
		}
		if (this.activeCardEl) this.resetCard(this.activeCardEl);
	}

	private recedeCard(cardEl: HTMLElement): void {
		this.removeRecedingCard(cardEl);
		this.resetCard(cardEl);
		this.recedingCardEls.push(cardEl);
		while (this.recedingCardEls.length > MAX_RECEDING_CARDS) {
			const oldest = this.recedingCardEls.shift();
			if (oldest) this.finishPointerTransitions(oldest);
		}
	}

	private removeRecedingCard(cardEl: HTMLElement): void {
		const index = this.recedingCardEls.indexOf(cardEl);
		if (index >= 0) this.recedingCardEls.splice(index, 1);
	}

	private finishRecedingCards(): void {
		for (const cardEl of this.recedingCardEls) this.finishPointerTransitions(cardEl);
		this.recedingCardEls.length = 0;
	}

	private finishPointerTransitions(cardEl: HTMLElement): void {
		for (const animation of cardEl.getAnimations({ subtree: true })) {
			const transitionProperty = 'transitionProperty' in animation
				? String((animation as CSSTransition).transitionProperty) : '';
			if (!transitionProperty.startsWith('--mbv-collectible-')) continue;
			try { animation.finish(); } catch { /* A detached transition needs no cleanup. */ }
		}
	}

	private findCard(target: EventTarget | null): HTMLElement | null {
		const element = target as Element | null;
		const surface = element?.closest<HTMLElement>(
			this.options.faceSelector ?? '.mbv-collectible-rotator',
		);
		const selector = this.options.cardSelector ?? '.mbv-collectible-card';
		const direct = surface?.closest<HTMLElement>(selector);
		if (direct) return direct;
		const placement = element?.closest<HTMLElement>(
			this.options.placementSelector ?? '.mbv-collectible-scene',
		);
		return placement?.closest<HTMLElement>(selector) ?? null;
	}

	private isIgnoredTarget(target: EventTarget | null): boolean {
		return Boolean((target as Element | null)?.closest('[data-mbv-card-interaction-ignore]'));
	}

	private findPointerCard(event: MouseEvent | PointerEvent): HTMLElement | null {
		return this.findCard(event.target);
	}

	private pointerRect(cardEl: HTMLElement, card: InteractiveCardController): DOMRect {
		if (!this.options.cachePointerRect || this.activeCardEl === cardEl) {
			return card.getInteractionRect?.() ?? card.interactionElement.getBoundingClientRect();
		}
		if (!this.hoverRect || this.hoverRectCardEl !== cardEl) {
			this.hoverRect = card.getPointerRect?.() ?? card.getInteractionRect?.() ??
				card.interactionElement.getBoundingClientRect();
			this.hoverRectCardEl = cardEl;
		}
		return this.hoverRect;
	}

	private clearHoverRect(cardEl?: HTMLElement): void {
		if (cardEl && this.hoverRectCardEl !== cardEl) return;
		this.hoverRect = null;
		this.hoverRectCardEl = null;
	}

	private setPointerStyles(cardEl: HTMLElement, values: Readonly<Record<string, string>>): void {
		const card = this.cards.get(cardEl);
		if (card?.applyPointerStyle) card.applyPointerStyle(values);
		else this.setStyles(cardEl, values);
	}

	private cancelPointerFrame(): void {
		if (this.pointerFrame !== null) {
			this.gridEl.ownerDocument.defaultView?.cancelAnimationFrame(this.pointerFrame);
		}
		this.pointerFrame = null;
		this.pointerState = null;
	}

	private cancelRecenterTimer(): void {
		if (this.recenterTimer === null) return;
		this.gridEl.ownerDocument.defaultView?.clearTimeout(this.recenterTimer);
		this.recenterTimer = null;
	}

	private cancelOpening(): void {
		if (this.openingFrame !== null) {
			this.gridEl.ownerDocument.defaultView?.cancelAnimationFrame(
				this.openingFrame,
			);
			this.openingFrame = null;
		}
		this.setStyles(this.openingCardEl, {
			'--mbv-collectible-pop-rotate': '0deg',
		});
		this.openingCardEl?.classList.remove('is-opening', 'is-showing-back');
		this.openingCardEl = null;
		this.openingRunning = false;
	}

	private startOpening(cardEl: HTMLElement, target: CardPlacement): void {
		this.cancelOpening();
		const ownerWindow = this.gridEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.openingRunning = true;
		this.openingCardEl = cardEl;
		this.openingLastTime = ownerWindow.performance.now();
		this.openingLastAngle = 0;
		this.openingAngle = 0;
		this.openingLastPlacement = { x: 0, y: 0, scale: 1 };
		this.openingPlacement = { x: 0, y: 0, scale: 1 };
		this.openingTarget = target;
		cardEl.classList.add('is-opening');
		cardEl.classList.remove('is-showing-back');
		this.setStyles(cardEl, { '--mbv-collectible-pop-rotate': '0deg' });
		this.applyCardPlacement(cardEl, this.openingPlacement);
		this.openingFrame = ownerWindow.requestAnimationFrame(this.stepOpening);
	}

	private readonly stepOpening = (time: number): void => {
		this.openingFrame = null;
		const cardEl = this.openingCardEl;
		const ownerWindow = this.gridEl.ownerDocument.defaultView;
		if (!cardEl || !ownerWindow || !cardEl.isConnected) {
			this.cancelOpening();
			return;
		}
		const deltaTime = Math.max(0.001, (time - this.openingLastTime) * 60 / 1000);
		const delta = 360 - this.openingAngle;
		const velocity = (this.openingAngle - this.openingLastAngle) / deltaTime;
		const acceleration = 0.033 * delta - 0.45 * velocity;
		const change = (velocity + acceleration) * deltaTime;
		const nextPlacement = {
			x: this.runtime.tickSpring(
				this.openingLastPlacement.x,
				this.openingPlacement.x,
				this.openingTarget.x,
				deltaTime,
			),
			y: this.runtime.tickSpring(
				this.openingLastPlacement.y,
				this.openingPlacement.y,
				this.openingTarget.y,
				deltaTime,
			),
			scale: this.runtime.tickSpring(
				this.openingLastPlacement.scale,
				this.openingPlacement.scale,
				this.openingTarget.scale,
				deltaTime,
			),
		};
		this.openingLastTime = time;
		this.openingLastAngle = this.openingAngle;
		this.openingAngle += change;
		cardEl.classList.toggle(
			'is-showing-back',
			this.openingAngle > 90 && this.openingAngle < 270,
		);
		this.openingLastPlacement = this.openingPlacement;
		this.openingPlacement = nextPlacement;
		this.applyCardPlacement(cardEl, nextPlacement);
		if (this.openingAngle >= 359.5 || Math.abs(360 - this.openingAngle) < 0.5) {
			this.setStyles(cardEl, { '--mbv-collectible-pop-rotate': '360deg' });
			this.applyCardPlacement(cardEl, this.openingTarget);
			cardEl.classList.remove('is-opening', 'is-showing-back');
			this.openingCardEl = null;
			this.openingRunning = false;
			return;
		}
		cardEl.style.setProperty(
			'--mbv-collectible-pop-rotate',
			`${this.openingAngle}deg`,
		);
		this.openingFrame = ownerWindow.requestAnimationFrame(this.stepOpening);
	};
}

function tickSpring(
	lastValue: number,
	currentValue: number,
	targetValue: number,
	deltaTime: number,
): number {
	const delta = targetValue - currentValue;
	const velocity = (currentValue - lastValue) / deltaTime;
	const acceleration = 0.033 * delta - 0.45 * velocity;
	return currentValue + (velocity + acceleration) * deltaTime;
}

export function createCardInteractionExportScript(
	rootSelector: string,
	options: CardInteractionOptions = {},
): string {
	return `(() => {
  const start = () => {
   const root = document.querySelector(${JSON.stringify(rootSelector)}); if (!root) return;
   const options = ${JSON.stringify(options)};
   const runtime = { findScrollRoot: ${findScrollRoot.toString()}, getCardPointerStyle: ${getCardPointerStyle.toString()}, getRestingCardPointerStyle: ${getRestingCardPointerStyle.toString()}, tickSpring: ${tickSpring.toString()} };
   const controller = new (${CardInteractionController.toString()})(root, options, runtime);
   for (const element of root.querySelectorAll(options.cardSelector || '.mbv-collectible-card')) {
    const face = element.querySelector(options.faceSelector || '.mbv-collectible-rotator');
    const placement = element.querySelector(options.placementSelector || '.mbv-collectible-scene');
    const bounds = options.boundsSelector ? element.querySelector(options.boundsSelector) : null;
    if (face && placement) controller.register({ element, interactionElement: face, placementElement: placement, openMarkdown: async () => {}, getInteractionRect: bounds ? () => bounds.getBoundingClientRect() : undefined });
   }
   addEventListener('pagehide', (event) => { if (!event.persisted) controller.destroy(); else controller.collapse(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
 })();`;
}

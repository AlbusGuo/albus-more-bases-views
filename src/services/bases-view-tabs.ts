import {
	Notice,
	setIcon,
	setTooltip,
	type App,
	type EventRef,
	type QueryController,
} from 'obsidian';
import type { IconService } from './icon-service';

interface InternalViewConfig {
	name: string;
	type: string;
	data?: Record<string, unknown>;
	get?: (key: string) => unknown;
	set?: (key: string, value: unknown) => void;
}

interface InternalBasesQuery {
	views: InternalViewConfig[];
	save?: () => void | Promise<void>;
	getViewConfig?: (name: string) => InternalViewConfig | null;
}

interface InternalViewRegistration {
	icon?: string;
}

interface InternalBasesPlugin {
	getRegistration?: (type: string) => InternalViewRegistration | null;
}

interface InternalQueryController extends QueryController {
	query?: InternalBasesQuery | null;
	viewName?: string;
	viewHeaderEl?: HTMLElement;
	plugin?: InternalBasesPlugin;
	selectView?: (name: string) => void;
	promptForAddView?: () => void;
	viewMenu?: {
		toolbarItem?: { scrollEl?: HTMLElement };
	};
}

interface InternalBasesFileView {
	controller?: QueryController;
}

interface TabPointerDragState {
	pointerId: number;
	sourceEl: HTMLButtonElement;
	sourceName: string;
	pointerType: string;
	startClientX: number;
	startClientY: number;
	lastClientX: number;
	initialIndex: number;
	currentIndex: number;
	initialScrollLeft: number;
	tabs: HTMLButtonElement[];
	rects: DOMRect[];
	touchReady: boolean;
	active: boolean;
}

const BASES_VIEW_TYPE = 'bases';

export class BasesViewTabsService {
	private readonly instances = new Map<HTMLElement, BasesTabsInstance>();
	private readonly eventRefs: EventRef[] = [];
	private scanFrame: number | null = null;
	private started = false;
	private destroyed = false;
	private readonly releaseIconListener: () => void;
	constructor(
		private readonly app: App,
		private readonly iconService: IconService,
		private readonly groupingDisabledViewTypes: ReadonlySet<string> = new Set(),
	) {
		this.releaseIconListener = this.iconService.onChanged(() =>
			this.refreshViewIcons());
	}

	start(): void {
		if (this.started || this.destroyed) return;
		this.started = true;
		this.app.workspace.onLayoutReady(() => {
			if (this.destroyed) return;
			this.eventRefs.push(
				this.app.workspace.on('layout-change', () => this.scheduleScan()),
				this.app.workspace.on('active-leaf-change', () => this.scheduleScan()),
				this.app.workspace.on('file-open', () => this.scheduleScan()),
			);
			this.scheduleScan();
		});
	}

	attach(controller: QueryController, viewContainerEl?: HTMLElement): void {
		const internalController = controller as InternalQueryController;
		const headerEl =
			internalController.viewHeaderEl ??
			viewContainerEl?.parentElement?.querySelector<HTMLElement>(
				':scope > .bases-header',
			);
		if (!headerEl) return;
		this.ensureInstance(headerEl, internalController);
		this.syncRequiredIcons();
	}

	destroy(): void {
		this.destroyed = true;
		if (this.scanFrame !== null) {
			window.cancelAnimationFrame(this.scanFrame);
			this.scanFrame = null;
		}
		for (const eventRef of this.eventRefs) {
			this.app.workspace.offref(eventRef);
		}
		this.eventRefs.length = 0;
		for (const instance of this.instances.values()) instance.destroy();
		this.instances.clear();
		this.releaseIconListener();
		this.iconService.release(this);
	}

	private scheduleScan(): void {
		if (this.scanFrame !== null) return;
		this.scanFrame = window.requestAnimationFrame(() => {
			this.scanFrame = null;
			this.scan();
		});
	}

	private scan(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(BASES_VIEW_TYPE)) {
			const controller = (leaf.view as unknown as InternalBasesFileView)
				.controller;
			if (controller) this.attach(controller);
		}

		for (const [headerEl, instance] of this.instances) {
			if (headerEl.isConnected) continue;
			instance.destroy();
			this.instances.delete(headerEl);
		}
		this.syncRequiredIcons();
	}

	private ensureInstance(
		headerEl: HTMLElement,
		controller: InternalQueryController,
	): void {
		const current = this.instances.get(headerEl);
		if (current) {
			current.setController(controller);
			return;
		}
		const instance = BasesTabsInstance.create(
			headerEl,
			controller,
			this.iconService,
			this.groupingDisabledViewTypes,
			() => this.handleViewIconChanged(),
		);
		if (instance) this.instances.set(headerEl, instance);
	}

	private handleViewIconChanged(): void {
		this.refreshViewIcons();
		this.syncRequiredIcons();
	}

	private refreshViewIcons(): void {
		for (const instance of this.instances.values()) instance.refreshIcons();
	}

	private syncRequiredIcons(): void {
		const iconIds = [...new Set(
			[...this.instances.values()].flatMap((instance) =>
				instance.getConfiguredIconIds()),
		)];
		this.iconService.setRequiredIcons(this, iconIds);
	}
}

class BasesTabsInstance {
	private readonly containerEl: HTMLElement;
	private readonly listEl: HTMLElement;
	private readonly addButtonEl: HTMLButtonElement;
	private readonly nativeViewsButtonEl: HTMLElement;
	private readonly observer: MutationObserver;
	private readonly resizeObserver: ResizeObserver;
	private refreshFrame: number | null = null;
	private responsiveFrame: number | null = null;
	private renderSignature = '';
	private destroyed = false;
	private pointerDrag: TabPointerDragState | null = null;
	private pointerDragAbort: AbortController | null = null;
	private activationTimer: number | null = null;
	private autoScrollFrame: number | null = null;
	private settleTimer: number | null = null;
	private suppressedClickName: string | null = null;
	private suppressClickUntil = 0;
	private constructor(
		private readonly headerEl: HTMLElement,
		private readonly nativeViewsMenuEl: HTMLElement,
		private controller: InternalQueryController,
		private readonly iconService: IconService,
		private readonly groupingDisabledViewTypes: ReadonlySet<string>,
		private readonly onViewIconChanged: () => void,
	) {
		this.nativeViewsButtonEl =
			nativeViewsMenuEl.querySelector<HTMLElement>('.text-icon-button') ??
			nativeViewsMenuEl;
		this.containerEl = createDiv('mbv-bases-view-tabs');
		this.listEl = this.containerEl.createDiv('mbv-bases-view-tab-list');
		this.addButtonEl = this.containerEl.createEl('button', {
			cls: 'clickable-icon mbv-bases-view-add',
			attr: { type: 'button' },
		});
		setIcon(this.addButtonEl, 'plus');
		this.addButtonEl.createSpan({
			cls: 'mbv-visually-hidden',
			text: '添加视图',
		});
		this.addButtonEl.addEventListener(
			'click',
			() => this.addView(this.addButtonEl),
		);
		this.nativeViewsMenuEl.before(this.containerEl);
		this.nativeViewsMenuEl.setAttribute('aria-hidden', 'true');
		this.headerEl.addClass('mbv-bases-tabs-enabled');

		this.observer = new MutationObserver(() => this.scheduleRefresh());
		const ResizeObserverConstructor =
			this.containerEl.ownerDocument.defaultView?.ResizeObserver ?? ResizeObserver;
		this.resizeObserver = new ResizeObserverConstructor(() =>
			this.scheduleResponsiveLayout());
		this.resizeObserver.observe(this.headerEl);
		const toolbarEl = this.headerEl.querySelector<HTMLElement>('.bases-toolbar');
		if (toolbarEl) this.resizeObserver.observe(toolbarEl);
		this.resizeObserver.observe(this.containerEl);
		this.resizeObserver.observe(this.listEl);
		this.observeControllerMenu();
		this.refresh();
	}

	static create(
		headerEl: HTMLElement,
		controller: InternalQueryController,
		iconService: IconService,
		groupingDisabledViewTypes: ReadonlySet<string>,
		onViewIconChanged: () => void,
	): BasesTabsInstance | null {
		const nativeViewsMenuEl =
			headerEl.querySelector<HTMLElement>('.bases-toolbar-views-menu');
		if (!nativeViewsMenuEl || !isSupportedController(controller)) return null;
		return new BasesTabsInstance(
			headerEl,
			nativeViewsMenuEl,
			controller,
			iconService,
			groupingDisabledViewTypes,
			onViewIconChanged,
		);
	}

	setController(controller: InternalQueryController): void {
		if (!isSupportedController(controller)) return;
		this.controller = controller;
		this.observeControllerMenu();
		this.refresh();
	}

	refresh(): void {
		if (this.destroyed) return;
		this.syncViewIconEditor();
		const views = getViews(this.controller);
		if (views.length === 0) return;
		const activeViewName = this.controller.viewName ?? views[0]?.name ?? '';
		const activeView = views.find((view) => view.name === activeViewName);
		this.headerEl.classList.toggle(
			'mbv-bases-grouping-disabled',
			Boolean(activeView && this.groupingDisabledViewTypes.has(activeView.type)),
		);
		const signature = JSON.stringify([
			activeViewName,
			...views.map((view) =>
				`${view.type}\u0000${view.name}\u0000${getConfiguredViewIcon(view)}`),
		]);
		if (signature === this.renderSignature) return;
		this.renderSignature = signature;
		this.listEl.empty();

		for (const view of views) {
			const tabEl = this.listEl.createEl('button', {
				cls: 'clickable-icon mbv-bases-view-tab',
				attr: {
					type: 'button',
					'aria-pressed': String(view.name === activeViewName),
					'aria-label': view.name,
				},
			});
			const iconEl = tabEl.createSpan('mbv-bases-view-tab-icon');
			this.iconService.render(
				iconEl,
				getConfiguredViewIcon(view),
				getDefaultViewIcon(this.controller, view.type),
			);
			tabEl.createSpan({ cls: 'mbv-bases-view-tab-name', text: view.name });
			tabEl.classList.toggle('is-active', view.name === activeViewName);
			tabEl.dataset.viewName = view.name;
			tabEl.addEventListener('click', (event) => {
				if (this.consumeSuppressedClick(view.name)) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				this.selectView(view.name, tabEl);
			});
			this.bindTabDrag(tabEl, view.name);
		}
		this.scheduleResponsiveLayout();
	}

	refreshIcons(): void {
		this.renderSignature = '';
		const root = this.controller.viewMenu?.toolbarItem?.scrollEl ??
			this.nativeViewsMenuEl;
		root.querySelectorAll<HTMLElement>('.mbv-bases-view-icon-picker')
			.forEach((element) => delete element.dataset.iconSignature);
		this.refresh();
	}

	getConfiguredIconIds(): string[] {
		return getViews(this.controller)
			.map((view) => getConfiguredViewIcon(view))
			.filter(Boolean);
	}

	private observeControllerMenu(): void {
		this.observer.disconnect();
		this.observer.observe(this.nativeViewsMenuEl, {
			attributes: true,
			characterData: true,
			childList: true,
			subtree: true,
		});
		const scrollEl = this.controller.viewMenu?.toolbarItem?.scrollEl;
		if (scrollEl && scrollEl !== this.nativeViewsMenuEl) {
			this.observer.observe(scrollEl, {
				childList: true,
				subtree: true,
			});
		}
	}

	private syncViewIconEditor(): void {
		const root = this.controller.viewMenu?.toolbarItem?.scrollEl ??
			this.nativeViewsMenuEl;
		const formEl = root.querySelector<HTMLElement>(
			'.bases-toolbar-menu-form.view-config-menu',
		);
		const rowEl = formEl?.querySelector<HTMLElement>(
			':scope > .input-row:first-child',
		);
		const contentEl = rowEl?.querySelector<HTMLElement>(
			':scope > .input-row-content',
		);
		const inputEl = contentEl?.querySelector<HTMLInputElement>('input[type="text"]');
		if (!rowEl || !contentEl || !inputEl) return;
		const view = getViews(this.controller).find((candidate) =>
			candidate.name === inputEl.value,
		);
		if (!view) return;
		rowEl.addClass('mbv-bases-view-name-row');
		let buttonEl = rowEl.querySelector<HTMLButtonElement>(
			':scope > .mbv-bases-view-icon-picker',
		);
		if (!buttonEl) {
			buttonEl = rowEl.createEl('button', {
				cls: 'clickable-icon mbv-bases-view-icon-picker',
				attr: { type: 'button', 'aria-label': '更换视图图标' },
			});
			rowEl.insertBefore(buttonEl, contentEl);
			setTooltip(buttonEl, '更换视图图标; 右键恢复默认');
			buttonEl.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				void this.iconService.pick(
					buttonEl as HTMLButtonElement,
					getConfiguredViewIcon(view),
					(iconName) => this.updateViewIcon(view, iconName),
				);
			});
			buttonEl.addEventListener('contextmenu', (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.updateViewIcon(view, '');
			});
		}
		const iconName = getConfiguredViewIcon(view);
		const fallbackIcon = getDefaultViewIcon(this.controller, view.type);
		const iconSignature = `${iconName}\0${fallbackIcon}`;
		if (buttonEl.dataset.iconSignature !== iconSignature) {
			this.iconService.render(buttonEl, iconName, fallbackIcon);
			buttonEl.dataset.iconSignature = iconSignature;
		}
	}

	private updateViewIcon(view: InternalViewConfig, iconName: string): void {
		if (typeof view.set === 'function') view.set('icon', iconName || null);
		else {
			view.data ??= {};
			if (iconName) view.data.icon = iconName;
			else delete view.data.icon;
			void this.controller.query?.save?.();
		}
		this.renderSignature = '';
		this.refresh();
		this.onViewIconChanged();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		if (this.refreshFrame !== null) {
			this.headerEl.win.cancelAnimationFrame(this.refreshFrame);
			this.refreshFrame = null;
		}
		if (this.responsiveFrame !== null) {
			this.headerEl.win.cancelAnimationFrame(this.responsiveFrame);
			this.responsiveFrame = null;
		}
		this.observer.disconnect();
		this.resizeObserver.disconnect();
		const root = this.controller.viewMenu?.toolbarItem?.scrollEl ??
			this.nativeViewsMenuEl;
		root.querySelectorAll('.mbv-bases-view-icon-picker').forEach((element) =>
			element.remove());
		root.querySelectorAll('.mbv-bases-view-name-row').forEach((element) =>
			element.removeClass('mbv-bases-view-name-row'));
		this.cancelPointerDrag(false);
		if (this.settleTimer !== null) {
			this.headerEl.win.clearTimeout(this.settleTimer);
			this.settleTimer = null;
		}
		this.containerEl.remove();
		this.nativeViewsMenuEl.removeAttribute('aria-hidden');
		this.nativeViewsMenuEl.style.removeProperty('inset-inline-start');
		this.nativeViewsMenuEl.style.removeProperty('top');
		this.headerEl.removeClass('mbv-bases-tabs-enabled');
		this.headerEl.removeClass('mbv-bases-grouping-disabled');
	}

	private selectView(name: string, anchorEl: HTMLElement): void {
		if (name === this.controller.viewName) {
			this.openCurrentViewSettings(anchorEl);
			return;
		}
		this.controller.selectView?.(name);
		this.scheduleRefresh();
	}

	private addView(anchorEl: HTMLElement): void {
		this.positionNativeMenu(anchorEl);
		this.controller.promptForAddView?.();
		this.scheduleRefresh();
	}

	private openCurrentViewSettings(anchorEl: HTMLElement): void {
		this.positionNativeMenu(anchorEl);
		const anchorRect = anchorEl.getBoundingClientRect();
		const EventConstructor =
			this.nativeViewsButtonEl.ownerDocument.defaultView?.MouseEvent ??
			MouseEvent;
		this.nativeViewsButtonEl.dispatchEvent(
			new EventConstructor('contextmenu', {
				bubbles: true,
				cancelable: true,
				clientX: anchorRect.left + anchorRect.width / 2,
				clientY: anchorRect.bottom,
				screenX: anchorEl.win.screenX + anchorRect.left + anchorRect.width / 2,
				screenY: anchorEl.win.screenY + anchorRect.bottom,
				view: this.nativeViewsButtonEl.ownerDocument.defaultView ?? window,
			}),
		);
	}

	private positionNativeMenu(anchorEl: HTMLElement): void {
		const anchorRect = anchorEl.getBoundingClientRect();
		const headerRect = this.headerEl.getBoundingClientRect();
		this.nativeViewsMenuEl.style.insetInlineStart =
			`${Math.max(0, anchorRect.left - headerRect.left)}px`;
		this.nativeViewsMenuEl.style.top =
			`${Math.max(0, anchorRect.top - headerRect.top)}px`;
	}

	private bindTabDrag(tabEl: HTMLButtonElement, viewName: string): void {
		tabEl.addEventListener('pointerdown', (event) => {
			if (
				this.pointerDrag ||
				this.settleTimer !== null ||
				!event.isPrimary ||
				event.button !== 0
			) return;
			const tabs = this.getRenderedTabs();
			const initialIndex = tabs.indexOf(tabEl);
			if (initialIndex < 0) return;

			this.pointerDrag = {
				pointerId: event.pointerId,
				sourceEl: tabEl,
				sourceName: viewName,
				pointerType: event.pointerType,
				startClientX: event.clientX,
				startClientY: event.clientY,
				lastClientX: event.clientX,
				initialIndex,
				currentIndex: initialIndex,
				initialScrollLeft: this.listEl.scrollLeft,
				tabs,
				rects: tabs.map((tab) => tab.getBoundingClientRect()),
				touchReady: event.pointerType !== 'touch',
				active: false,
			};
			this.bindPointerDragEvents(tabEl.ownerDocument);
			if (event.pointerType === 'touch') {
				this.activationTimer = this.headerEl.win.setTimeout(() => {
					this.activationTimer = null;
					const drag = this.pointerDrag;
					if (!drag || drag.pointerId !== event.pointerId) return;
					drag.touchReady = true;
					this.activatePointerDrag(drag);
				}, 180);
			}
		});
	}

	private bindPointerDragEvents(ownerDocument: Document): void {
		this.pointerDragAbort?.abort();
		const abort = new AbortController();
		this.pointerDragAbort = abort;
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
			if (event.key !== 'Escape' || !this.pointerDrag?.active) return;
			event.preventDefault();
			this.cancelPointerDrag(true);
		}, { signal: abort.signal });
	}

	private handlePointerMove(event: PointerEvent): void {
		const drag = this.pointerDrag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		drag.lastClientX = event.clientX;
		if (!drag.active) {
			const distance = Math.hypot(
				event.clientX - drag.startClientX,
				event.clientY - drag.startClientY,
			);
			if (drag.pointerType === 'touch') {
				if (!drag.touchReady && distance > 8) {
					this.cancelPointerDrag(false);
					return;
				}
				if (!drag.touchReady) return;
			} else if (distance < 4) {
				return;
			}
			this.activatePointerDrag(drag);
		}
		event.preventDefault();
		this.updatePointerSort(drag);
	}

	private activatePointerDrag(drag: TabPointerDragState): void {
		if (drag.active || this.pointerDrag !== drag) return;
		drag.active = true;
		drag.sourceEl.addClass('is-dragging');
		drag.sourceEl.dataset.dragging = 'true';
		drag.sourceEl.setAttribute('aria-grabbed', 'true');
		this.listEl.addClass('is-sorting');
		this.startAutoScroll();
		this.updatePointerSort(drag);
	}

	private updatePointerSort(drag: TabPointerDragState): void {
		const scrollDelta = this.listEl.scrollLeft - drag.initialScrollLeft;
		const pointerDelta = drag.lastClientX - drag.startClientX;
		const sourceRect = drag.rects[drag.initialIndex];
		if (!sourceRect) return;
		const sourceCenter = sourceRect.left + sourceRect.width / 2 + pointerDelta;
		let nextIndex = drag.initialIndex;

		if (pointerDelta > 0) {
			for (let index = drag.initialIndex + 1; index < drag.rects.length; index++) {
				const rect = drag.rects[index];
				if (!rect || sourceCenter <= rect.left - scrollDelta + rect.width / 2) break;
				nextIndex = index;
			}
		} else if (pointerDelta < 0) {
			for (let index = drag.initialIndex - 1; index >= 0; index--) {
				const rect = drag.rects[index];
				if (!rect || sourceCenter >= rect.left - scrollDelta + rect.width / 2) break;
				nextIndex = index;
			}
		}

		drag.currentIndex = nextIndex;
		const virtualTabs = [...drag.tabs];
		virtualTabs.splice(drag.initialIndex, 1);
		virtualTabs.splice(nextIndex, 0, drag.sourceEl);
		for (const [originalIndex, tab] of drag.tabs.entries()) {
			if (tab === drag.sourceEl) {
				tab.style.translate = `${pointerDelta + scrollDelta}px 0`;
				continue;
			}
			const targetIndex = virtualTabs.indexOf(tab);
			const originalRect = drag.rects[originalIndex];
			const targetRect = drag.rects[targetIndex];
			if (!originalRect || !targetRect) continue;
			tab.style.translate = `${targetRect.left - originalRect.left}px 0`;
		}
	}

	private handlePointerEnd(event: PointerEvent, canceled: boolean): void {
		const drag = this.pointerDrag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		if (!drag.active) {
			this.cancelPointerDrag(false);
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.suppressedClickName = drag.sourceName;
		this.suppressClickUntil = performance.now() + 300;
		if (canceled) {
			this.cancelPointerDrag(true);
			return;
		}
		this.finishPointerDrag(drag);
	}

	private finishPointerDrag(drag: TabPointerDragState): void {
		this.stopPointerTracking();
		const nextOrder = [...drag.tabs];
		const [source] = nextOrder.splice(drag.initialIndex, 1);
		if (source) nextOrder.splice(drag.currentIndex, 0, source);
		const viewOrder = nextOrder.map((tab) => tab.dataset.viewName).filter(
			(name): name is string => typeof name === 'string' && name.length > 0,
		);
		const sourceRect = drag.rects[drag.initialIndex];
		const targetRect = drag.rects[drag.currentIndex];
		drag.sourceEl.addClass('is-settling');
		if (sourceRect && targetRect) {
			drag.sourceEl.style.translate = `${targetRect.left - sourceRect.left}px 0`;
		}
		this.settleTimer = this.headerEl.win.setTimeout(() => {
			this.settleTimer = null;
			this.clearTabTransforms(drag.tabs);
			if (drag.currentIndex !== drag.initialIndex) void this.saveViewOrder(viewOrder);
		}, 160);
	}

	private cancelPointerDrag(animateBack: boolean): void {
		const drag = this.pointerDrag;
		this.stopPointerTracking();
		if (!drag) return;
		if (!drag.active || !animateBack) {
			this.clearTabTransforms(drag.tabs);
			return;
		}
		for (const tab of drag.tabs) {
			tab.addClass('is-settling');
			tab.setCssProps({ translate: '0 0' });
		}
		this.settleTimer = this.headerEl.win.setTimeout(() => {
			this.settleTimer = null;
			this.clearTabTransforms(drag.tabs);
		}, 160);
	}

	private stopPointerTracking(): void {
		this.pointerDragAbort?.abort();
		this.pointerDragAbort = null;
		this.pointerDrag = null;
		if (this.activationTimer !== null) {
			this.headerEl.win.clearTimeout(this.activationTimer);
			this.activationTimer = null;
		}
		if (this.autoScrollFrame !== null) {
			this.headerEl.win.cancelAnimationFrame(this.autoScrollFrame);
			this.autoScrollFrame = null;
		}
	}

	private clearTabTransforms(tabs: HTMLButtonElement[]): void {
		this.listEl.removeClass('is-sorting');
		for (const tab of tabs) {
			tab.removeClass('is-dragging', 'is-settling');
			tab.removeAttribute('aria-grabbed');
			delete tab.dataset.dragging;
			tab.style.removeProperty('translate');
		}
		this.scheduleResponsiveLayout();
	}

	private startAutoScroll(): void {
		if (this.autoScrollFrame !== null) return;
		const step = (): void => {
			this.autoScrollFrame = null;
			const drag = this.pointerDrag;
			if (!drag?.active) return;
			const rect = this.listEl.getBoundingClientRect();
			const threshold = 32;
			let amount = 0;
			if (drag.lastClientX < rect.left + threshold) {
				amount = -12 * (1 - Math.max(0, drag.lastClientX - rect.left) / threshold);
			} else if (drag.lastClientX > rect.right - threshold) {
				amount = 12 * (1 - Math.max(0, rect.right - drag.lastClientX) / threshold);
			}
			if (amount !== 0) {
				const previousScrollLeft = this.listEl.scrollLeft;
				this.listEl.scrollLeft += amount;
				if (this.listEl.scrollLeft !== previousScrollLeft) this.updatePointerSort(drag);
			}
			this.autoScrollFrame = this.headerEl.win.requestAnimationFrame(step);
		};
		this.autoScrollFrame = this.headerEl.win.requestAnimationFrame(step);
	}

	private consumeSuppressedClick(viewName: string): boolean {
		if (
			this.suppressedClickName !== viewName ||
			performance.now() > this.suppressClickUntil
		) return false;
		this.suppressedClickName = null;
		this.suppressClickUntil = 0;
		return true;
	}

	private getRenderedTabs(): HTMLButtonElement[] {
		return Array.from(
			this.listEl.querySelectorAll<HTMLButtonElement>('.mbv-bases-view-tab'),
		);
	}

	private async saveViewOrder(nextOrder: string[]): Promise<void> {
		const query = this.controller.query;
		const views = query?.views;
		if (!query || !Array.isArray(views) || typeof query.save !== 'function') {
			new Notice('当前数据库无法保存视图顺序.');
			return;
		}
		const previousOrder = [...views];
		const viewsByName = new Map(views.map((view) => [view.name, view]));
		const orderedViews = nextOrder.map((name) => viewsByName.get(name)).filter(
			(view): view is InternalViewConfig => view !== undefined,
		);
		if (orderedViews.length !== views.length) return;
		if (orderedViews.every((view, index) => view === views[index])) return;
		views.splice(0, views.length, ...orderedViews);
		this.renderSignature = '';
		this.refresh();
		try {
			await query.save();
		} catch {
			views.splice(0, views.length, ...previousOrder);
			this.renderSignature = '';
			this.refresh();
			new Notice('保存视图顺序失败.');
		}
	}

	private scheduleRefresh(): void {
		if (this.destroyed || this.refreshFrame !== null) return;
		this.refreshFrame = this.headerEl.win.requestAnimationFrame(() => {
			this.refreshFrame = null;
			this.refresh();
		});
	}

	private scheduleResponsiveLayout(): void {
		if (this.destroyed || this.responsiveFrame !== null) return;
		this.responsiveFrame = this.headerEl.win.requestAnimationFrame(() => {
			this.responsiveFrame = null;
			this.updateResponsiveLayout();
		});
	}

	private updateResponsiveLayout(): void {
		if (this.destroyed || this.pointerDrag) return;
		this.containerEl.removeClass('is-icon-only');
		this.containerEl.addClass('is-measuring-labels');
		const labelsFit = this.listEl.scrollWidth <= this.listEl.clientWidth + 1;
		this.containerEl.removeClass('is-measuring-labels');
		this.containerEl.toggleClass('is-icon-only', !labelsFit);
	}
}

function isSupportedController(
	controller: InternalQueryController,
): boolean {
	return (
		typeof controller.selectView === 'function' &&
		typeof controller.promptForAddView === 'function' &&
		Array.isArray(controller.query?.views)
	);
}

function getViews(controller: InternalQueryController): InternalViewConfig[] {
	const views = controller.query?.views;
	if (!Array.isArray(views)) return [];
	return views.filter(
		(view) =>
			typeof view?.name === 'string' &&
			view.name.length > 0 &&
			typeof view.type === 'string',
	);
}

function getConfiguredViewIcon(view: InternalViewConfig): string {
	const configured = view.get?.('icon') ?? view.data?.icon;
	return typeof configured === 'string' ? configured.trim() : '';
}

function getDefaultViewIcon(
	controller: InternalQueryController,
	viewType: string,
): string {
	const registeredIcon = controller.plugin?.getRegistration?.(viewType)?.icon;
	if (registeredIcon) return registeredIcon;
	if (viewType === 'cards') return 'lucide-layout-grid';
	if (viewType === 'list') return 'lucide-list';
	return 'lucide-table';
}

export interface ViewportGridItemController {
	element: HTMLElement;
}

export interface ViewportGridGroup<Item> {
	key: string;
	label: string;
	showHeader: boolean;
	items: readonly Item[];
}

export interface ViewportGridOptions<
	Item,
	Controller extends ViewportGridItemController,
> {
	containerEl: HTMLElement;
	getKey: (item: Item) => string;
	create: (item: Item) => Controller;
	update: (controller: Controller, item: Item) => void;
	dispose?: (controller: Controller) => void;
	onAttach?: (controller: Controller) => void;
	onDetach?: (controller: Controller) => void;
	getMinimumItemWidth: () => number;
	estimatedRowHeight: (itemWidth: number) => number;
	onItemWidthChange?: (itemWidth: number) => void;
	columnGap?: number;
	rowGap?: number;
	overscanRows?: number;
	maxDetachedItems?: number;
	resizeSettleDelay?: number;
	slotClass?: string;
}

interface GridSlot<Item, Controller> {
	key: string;
	element: HTMLElement;
	item: Item;
	controller: Controller;
	dirty: boolean;
}

interface GridGroupHeader {
	element: HTMLElement;
	labelEl: HTMLElement;
	countEl: HTMLElement;
}

interface GridDimensions {
	columns: number;
	itemWidth: number;
	estimatedItemRowHeight: number;
}

interface GridHeaderRow<Item> {
	kind: 'header';
	key: string;
	group: ViewportGridGroup<Item>;
}

interface GridItemsRow<Item> {
	kind: 'items';
	key: string;
	group: ViewportGridGroup<Item>;
	items: readonly Item[];
}

type GridRow<Item> = GridHeaderRow<Item> | GridItemsRow<Item>;

interface GridLayout<Item> extends GridDimensions {
	rows: GridRow<Item>[];
	rowOffsets: number[];
	rowHeights: number[];
	totalHeight: number;
}

const GROUP_HEADER_HEIGHT = 32;
export const VIEWPORT_OVERSCAN_ROWS = 5;

/**
	 * Keeps only nearby rows in the layout tree. Hydrated controllers may be cached
 * while detached, so revisiting a row does not recreate cards or reload media.
 * Group headers and group row boundaries participate in the same virtual layout.
 */
export class ViewportGrid<
	Item,
	Controller extends ViewportGridItemController,
> {
	private readonly slots = new Map<string, GridSlot<Item, Controller>>();
	private readonly attachedSlots = new Set<GridSlot<Item, Controller>>();
	private readonly groupHeaders = new Map<string, GridGroupHeader>();
	private readonly scrollRoot: HTMLElement | null;
	private readonly resizeObserver: ResizeObserver;
	private readonly topSpacerEl: HTMLElement;
	private readonly bottomSpacerEl: HTMLElement;
	private readonly measuredRowHeights = new Map<string, number>();
	private readonly pendingSlotUpdates = new Set<GridSlot<Item, Controller>>();
	private groups: readonly ViewportGridGroup<Item>[] = [];
	private rowHeightLayoutKey = '';
	private resizeFrame: number | null = null;
	private measureFrame: number | null = null;
	private updateFrame: number | null = null;
	private reportedItemWidth = -1;
	private columnCount = -1;
	private observedGridWidth = 0;
	private pendingGridWidth = 0;
	private observedViewportHeight = 0;
	private resizeSettleTimer: number | null = null;
	private resizeFrozen = false;
	private frozenGridTemplateColumns = '';
	private frozenJustifyContent = '';
	private renderedStartRow = -1;
	private renderedEndRow = -1;
	private renderedLayout: GridLayout<Item> | null = null;
	private cachedLayout: GridLayout<Item> | null = null;
	private layoutDirty = true;
	private viewportContentOffset: number | null = null;
	private topologyVersion = 0;
	private renderedTopologyVersion = -1;
	private disposed = false;

	constructor(private readonly options: ViewportGridOptions<Item, Controller>) {
		this.scrollRoot = findScrollRoot(options.containerEl);
		this.topSpacerEl = this.createSpacer('is-top');
		this.bottomSpacerEl = this.createSpacer('is-bottom');
		this.resizeObserver = new ResizeObserver((entries) => {
			let viewportChanged = false;
			for (const entry of entries) {
				if (entry.target === options.containerEl) {
					this.handleGridResize(entry.contentRect.width);
				} else if (entry.target === this.scrollRoot) {
					const height = entry.contentRect.height;
					if (Math.abs(height - this.observedViewportHeight) >= 0.5) {
						this.observedViewportHeight = height;
						viewportChanged = true;
					}
				}
			}
			this.viewportContentOffset = null;
			if (viewportChanged) this.scheduleLayout();
		});
		this.resizeObserver.observe(options.containerEl);
		if (this.scrollRoot) this.resizeObserver.observe(this.scrollRoot);
		(this.scrollRoot ?? options.containerEl.ownerDocument.defaultView)
			?.addEventListener('scroll', this.handleScroll, { passive: true });
	}

	setItems(items: readonly Item[]): void {
		this.setGroups([{
			key: 'ungrouped',
			label: '',
			showHeader: false,
			items,
		}]);
	}

	setGroups(groups: readonly ViewportGridGroup<Item>[]): void {
		if (this.disposed) return;
		const stable = this.hasStableTopology(groups);
		this.groups = groups;
		this.layoutDirty = true;
		if (!stable) {
			this.viewportContentOffset = null;
			this.measuredRowHeights.clear();
			this.rowHeightLayoutKey = '';
		}

		const activeItems = new Map<string, Item>();
		const activeHeaderKeys = new Set<string>();
		for (const group of groups) {
			if (group.showHeader) activeHeaderKeys.add(group.key);
			for (const item of group.items) {
				activeItems.set(this.options.getKey(item), item);
			}
		}

		for (const [key, slot] of this.slots) {
			const item = activeItems.get(key);
			if (item) {
				slot.item = item;
				if (slot.element.isConnected) {
					if (stable) this.queueSlotUpdate(slot);
					else {
						this.pendingSlotUpdates.delete(slot);
						this.options.update(slot.controller, item);
						slot.dirty = false;
					}
				} else {
					this.pendingSlotUpdates.delete(slot);
					slot.dirty = true;
				}
				continue;
			}
			this.disposeSlot(slot);
			this.slots.delete(key);
		}
		for (const [key, header] of this.groupHeaders) {
			if (activeHeaderKeys.has(key)) continue;
			header.element.remove();
			this.groupHeaders.delete(key);
		}

		if (!stable) this.topologyVersion += 1;
		this.renderWindow(!stable);
		if (!stable) this.scheduleRowMeasurement();
	}

	destroy(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.cancelScheduledLayout();
		this.cancelScheduledMeasurement();
		this.cancelScheduledUpdates();
		this.cancelResizeSettle();
		this.releaseResizeFreeze();
		this.resizeObserver.disconnect();
		(this.scrollRoot ?? this.options.containerEl.ownerDocument.defaultView)
			?.removeEventListener('scroll', this.handleScroll);
		this.groups = [];
		this.cachedLayout = null;
		for (const slot of this.slots.values()) this.disposeSlot(slot);
		this.slots.clear();
		this.groupHeaders.clear();
		this.options.containerEl.empty();
	}

	private readonly handleScroll = (): void => this.scheduleLayout();

	private handleGridResize(width: number): void {
		if (this.disposed || !Number.isFinite(width) || width <= 0) return;
		this.pendingGridWidth = width;
		if (this.observedGridWidth <= 0 || this.reportedItemWidth <= 0) {
			this.observedGridWidth = width;
			this.scheduleLayout();
			return;
		}
		if (Math.abs(width - this.observedGridWidth) < 0.5) return;
		this.freezeResize();
		this.scheduleResizeSettle();
	}

	private freezeResize(): void {
		if (this.resizeFrozen || this.columnCount <= 0 || this.reportedItemWidth <= 0) {
			return;
		}
		this.resizeFrozen = true;
		const style = this.options.containerEl.style;
		this.frozenGridTemplateColumns = style.getPropertyValue('grid-template-columns');
		this.frozenJustifyContent = style.getPropertyValue('justify-content');
		const itemWidth = String(
			Math.round(this.reportedItemWidth * 100) / 100,
		) + 'px';
		style.setProperty(
			'grid-template-columns',
			'repeat(auto-fit, minmax(' + itemWidth + ', ' + itemWidth + '))',
		);
		style.setProperty('justify-content', 'space-between');
		this.cancelScheduledMeasurement();
	}

	private releaseResizeFreeze(): void {
		if (!this.resizeFrozen) return;
		this.resizeFrozen = false;
		const style = this.options.containerEl.style;
		if (this.frozenGridTemplateColumns) {
			style.setProperty('grid-template-columns', this.frozenGridTemplateColumns);
		} else {
			style.removeProperty('grid-template-columns');
		}
		if (this.frozenJustifyContent) {
			style.setProperty('justify-content', this.frozenJustifyContent);
		} else {
			style.removeProperty('justify-content');
		}
		this.frozenGridTemplateColumns = '';
		this.frozenJustifyContent = '';
	}

	private scheduleResizeSettle(): void {
		this.cancelResizeSettle();
		const ownerWindow = this.options.containerEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.resizeSettleTimer = ownerWindow.setTimeout(() => {
			this.resizeSettleTimer = null;
			if (this.disposed) return;
			this.observedGridWidth = this.pendingGridWidth;
			this.layoutDirty = true;
			this.rowHeightLayoutKey = '';
			this.measuredRowHeights.clear();
			this.releaseResizeFreeze();
			this.scheduleLayout();
		}, this.options.resizeSettleDelay ?? 100);
	}

	private cancelResizeSettle(): void {
		if (this.resizeSettleTimer === null) return;
		this.options.containerEl.ownerDocument.defaultView?.clearTimeout(
			this.resizeSettleTimer,
		);
		this.resizeSettleTimer = null;
	}

	private scheduleLayout(): void {
		if (this.disposed || this.resizeFrame !== null) return;
		const ownerWindow = this.options.containerEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.resizeFrame = ownerWindow.requestAnimationFrame(() => {
			this.resizeFrame = null;
			this.renderWindow(false);
		});
	}

	private cancelScheduledLayout(): void {
		if (this.resizeFrame === null) return;
		this.options.containerEl.ownerDocument.defaultView?.cancelAnimationFrame(
			this.resizeFrame,
		);
		this.resizeFrame = null;
	}

	private cancelScheduledMeasurement(): void {
		if (this.measureFrame === null) return;
		this.options.containerEl.ownerDocument.defaultView?.cancelAnimationFrame(
			this.measureFrame,
		);
		this.measureFrame = null;
	}

	private queueSlotUpdate(slot: GridSlot<Item, Controller>): void {
		slot.dirty = true;
		this.pendingSlotUpdates.add(slot);
		this.scheduleSlotUpdates();
	}

	private scheduleSlotUpdates(): void {
		if (this.disposed || this.updateFrame !== null || this.pendingSlotUpdates.size === 0) {
			return;
		}
		const ownerWindow = this.options.containerEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.updateFrame = ownerWindow.requestAnimationFrame(() => {
			this.updateFrame = null;
			this.flushSlotUpdates(ownerWindow);
		});
	}

	private flushSlotUpdates(ownerWindow: Window): void {
		if (this.disposed) return;
		const startedAt = ownerWindow.performance.now();
		let updated = false;
		for (const slot of this.pendingSlotUpdates) {
			this.pendingSlotUpdates.delete(slot);
			if (!this.slots.has(slot.key) || !slot.element.isConnected) continue;
			this.options.update(slot.controller, slot.item);
			slot.dirty = false;
			updated = true;
			if (ownerWindow.performance.now() - startedAt >= 6) break;
		}
		if (updated) {
			this.measuredRowHeights.clear();
			this.layoutDirty = true;
		}
		if (this.pendingSlotUpdates.size > 0) this.scheduleSlotUpdates();
		else {
			this.scheduleRowMeasurement();
			this.scheduleLayout();
		}
	}

	private cancelScheduledUpdates(): void {
		if (this.updateFrame !== null) {
			this.options.containerEl.ownerDocument.defaultView?.cancelAnimationFrame(
				this.updateFrame,
			);
			this.updateFrame = null;
		}
		this.pendingSlotUpdates.clear();
	}

	private renderWindow(force: boolean): void {
		if (this.disposed) return;
		const dimensions = this.calculateDimensions();
		const rowHeightLayoutKey = this.getRowHeightLayoutKey(dimensions);
		if (rowHeightLayoutKey !== this.rowHeightLayoutKey) {
			this.rowHeightLayoutKey = rowHeightLayoutKey;
			this.measuredRowHeights.clear();
			this.layoutDirty = true;
		}
		if (Math.abs(dimensions.itemWidth - this.reportedItemWidth) >= 0.01) {
			this.reportedItemWidth = dimensions.itemWidth;
			this.options.onItemWidthChange?.(dimensions.itemWidth);
		}
		if (dimensions.columns !== this.columnCount) {
			this.columnCount = dimensions.columns;
			this.options.containerEl.setCssProps({
				'--mbv-viewport-grid-columns': String(dimensions.columns),
			});
		}

		const layout = this.getLayout(dimensions);
		if (layout.rows.length === 0) {
			this.syncAttachedSlots(new Set());
			this.options.containerEl.empty();
			this.renderedStartRow = -1;
			this.renderedEndRow = -1;
			this.renderedLayout = null;
			return;
		}

		const viewport = this.getViewportRange();
		const firstVisibleRow = this.findFirstRowEndingAfter(layout, viewport.start);
		const firstRowAfterViewport = this.findFirstRowStartingAtOrAfter(
			layout,
			viewport.end,
		);
		const overscanRows = Math.max(0, Math.floor(
			this.options.overscanRows ?? VIEWPORT_OVERSCAN_ROWS,
		));
		const startRow = Math.max(0, firstVisibleRow - overscanRows);
		const endRow = Math.min(
			layout.rows.length,
			firstRowAfterViewport + overscanRows,
		);
		this.updateSpacerSizes(startRow, endRow, layout);
		const layoutChanged = this.renderedLayout !== layout;
		this.renderedLayout = layout;

		if (
			!force &&
			startRow === this.renderedStartRow &&
			endRow === this.renderedEndRow &&
			!layoutChanged &&
			this.renderedTopologyVersion === this.topologyVersion
		) {
			return;
		}

		const desiredChildren: HTMLElement[] = [];
		const desiredSlots = new Set<GridSlot<Item, Controller>>();
		if (startRow > 0) desiredChildren.push(this.topSpacerEl);
		for (let rowIndex = startRow; rowIndex < endRow; rowIndex += 1) {
			const row = layout.rows[rowIndex];
			if (!row) continue;
			if (row.kind === 'header') {
				desiredChildren.push(this.getOrCreateGroupHeader(row.group).element);
				continue;
			}
			for (const item of row.items) {
				const slot = this.getOrCreateSlot(item);
				slot.element.dataset.mbvGridRowKey = row.key;
				desiredChildren.push(slot.element);
				desiredSlots.add(slot);
			}
		}
		if (endRow < layout.rows.length) desiredChildren.push(this.bottomSpacerEl);
		this.reconcileChildren(desiredChildren);
		this.syncAttachedSlots(desiredSlots);
		this.renderedStartRow = startRow;
		this.renderedEndRow = endRow;
		this.renderedTopologyVersion = this.topologyVersion;
		this.scheduleRowMeasurement();
	}

	private syncAttachedSlots(
		desiredSlots: ReadonlySet<GridSlot<Item, Controller>>,
	): void {
		for (const slot of this.attachedSlots) {
			if (desiredSlots.has(slot)) continue;
			this.attachedSlots.delete(slot);
			this.options.onDetach?.(slot.controller);
		}
		for (const slot of desiredSlots) {
			if (this.attachedSlots.has(slot)) continue;
			this.attachedSlots.add(slot);
			this.options.onAttach?.(slot.controller);
		}
		this.pruneDetachedSlots();
	}

	private pruneDetachedSlots(): void {
		const configuredLimit = this.options.maxDetachedItems;
		if (configuredLimit === undefined) return;
		let detachedCount = this.slots.size - this.attachedSlots.size;
		const limit = Math.max(0, Math.floor(configuredLimit));
		if (detachedCount <= limit) return;
		for (const [key, slot] of this.slots) {
			if (this.attachedSlots.has(slot)) continue;
			this.disposeSlot(slot);
			this.slots.delete(key);
			detachedCount -= 1;
			if (detachedCount <= limit) break;
		}
	}

	private reconcileChildren(desiredChildren: readonly HTMLElement[]): void {
		const containerEl = this.options.containerEl;
		for (let index = 0; index < desiredChildren.length; index += 1) {
			const desired = desiredChildren[index];
			if (!desired) continue;
			const current = containerEl.children.item(index);
			if (current === desired) continue;
			containerEl.insertBefore(desired, current);
		}
		while (containerEl.children.length > desiredChildren.length) {
			containerEl.lastElementChild?.remove();
		}
	}

	private calculateDimensions(): GridDimensions {
		const width = this.observedGridWidth ||
			this.options.containerEl.clientWidth || 1000;
		const minimumWidth = Math.max(1, this.options.getMinimumItemWidth());
		const columnGap = this.options.columnGap ?? 0;
		const columns = Math.max(
			1,
			Math.floor((width + columnGap) / (minimumWidth + columnGap)),
		);
		const itemWidth = Math.max(
			1,
			(width - columnGap * (columns - 1)) / columns,
		);
		return {
			columns,
			itemWidth,
			estimatedItemRowHeight: Math.max(
				1,
				this.options.estimatedRowHeight(itemWidth),
			),
		};
	}

	private getLayout(dimensions: GridDimensions): GridLayout<Item> {
		const cached = this.cachedLayout;
		if (
			!this.layoutDirty &&
			cached &&
			cached.columns === dimensions.columns &&
			Math.abs(cached.itemWidth - dimensions.itemWidth) < 0.01 &&
			Math.abs(
				cached.estimatedItemRowHeight - dimensions.estimatedItemRowHeight,
			) < 0.01
		) return cached;
		const layout = this.buildLayout(dimensions);
		this.cachedLayout = layout;
		this.layoutDirty = false;
		return layout;
	}

	private buildLayout(dimensions: GridDimensions): GridLayout<Item> {
		const rows: GridRow<Item>[] = [];
		for (const group of this.groups) {
			if (group.showHeader) {
				rows.push({
					kind: 'header',
					key: `header:${group.key}`,
					group,
				});
			}
			for (let offset = 0; offset < group.items.length; offset += dimensions.columns) {
				const rowIndex = Math.floor(offset / dimensions.columns);
				rows.push({
					kind: 'items',
					key: `items:${group.key}:${rowIndex}`,
					group,
					items: group.items.slice(offset, offset + dimensions.columns),
				});
			}
		}

		const rowGap = this.options.rowGap ?? 0;
		const rowOffsets: number[] = [];
		const rowHeights: number[] = [];
		let offset = 0;
		for (const row of rows) {
			const estimatedHeight = row.kind === 'header'
				? GROUP_HEADER_HEIGHT
				: dimensions.estimatedItemRowHeight;
			const height = this.measuredRowHeights.get(row.key) ?? estimatedHeight;
			rowOffsets.push(offset);
			rowHeights.push(height);
			offset += height + rowGap;
		}
		const totalHeight = rows.length > 0 ? Math.max(0, offset - rowGap) : 0;
		return {
			...dimensions,
			rows,
			rowOffsets,
			rowHeights,
			totalHeight,
		};
	}

	private getViewportRange(): { start: number; end: number } {
		if (this.scrollRoot) {
			if (this.viewportContentOffset === null) {
				const containerRect = this.options.containerEl.getBoundingClientRect();
				const rootRect = this.scrollRoot.getBoundingClientRect();
				this.viewportContentOffset = this.scrollRoot.scrollTop +
					containerRect.top - rootRect.top;
			}
			const height = this.observedViewportHeight || this.scrollRoot.clientHeight;
			const start = Math.max(
				0,
				this.scrollRoot.scrollTop - this.viewportContentOffset,
			);
			return { start, end: start + height };
		}
		const ownerWindow = this.options.containerEl.ownerDocument.defaultView;
		const containerRect = this.options.containerEl.getBoundingClientRect();
		const height = ownerWindow?.innerHeight ?? 800;
		const start = Math.max(0, -containerRect.top);
		return { start, end: start + height };
	}

	private findFirstRowEndingAfter(layout: GridLayout<Item>, position: number): number {
		let low = 0;
		let high = layout.rows.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			const end = (layout.rowOffsets[middle] ?? 0) +
				(layout.rowHeights[middle] ?? 0);
			if (end <= position) low = middle + 1;
			else high = middle;
		}
		return low;
	}

	private findFirstRowStartingAtOrAfter(
		layout: GridLayout<Item>,
		position: number,
	): number {
		let low = 0;
		let high = layout.rows.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if ((layout.rowOffsets[middle] ?? 0) < position) low = middle + 1;
			else high = middle;
		}
		return low;
	}

	private updateSpacerSizes(
		startRow: number,
		endRow: number,
		layout: GridLayout<Item>,
	): void {
		const rowGap = this.options.rowGap ?? 0;
		const topHeight = startRow > 0
			? Math.max(0, (layout.rowOffsets[startRow] ?? 0) - rowGap)
			: 0;
		let bottomHeight = 0;
		if (endRow < layout.rows.length && endRow > 0) {
			const previousRow = endRow - 1;
			const renderedBottom = (layout.rowOffsets[previousRow] ?? 0) +
				(layout.rowHeights[previousRow] ?? 0);
			bottomHeight = Math.max(0, layout.totalHeight - renderedBottom - rowGap);
		}
		this.setSpacerHeight(this.topSpacerEl, topHeight);
		this.setSpacerHeight(this.bottomSpacerEl, bottomHeight);
	}

	private getRowHeightLayoutKey(dimensions: GridDimensions): string {
		return `${dimensions.columns}:${Math.round(dimensions.itemWidth)}`;
	}

	private scheduleRowMeasurement(): void {
		if (this.disposed || this.measureFrame !== null) return;
		const ownerWindow = this.options.containerEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.measureFrame = ownerWindow.requestAnimationFrame(() => {
			this.measureFrame = null;
			this.measureRenderedRows();
		});
	}

	private measureRenderedRows(): void {
		const layout = this.renderedLayout;
		if (
			this.disposed ||
			!layout ||
			this.renderedStartRow < 0 ||
			this.renderedEndRow <= this.renderedStartRow
		) return;

		if (this.resizeFrozen) return;
		const pendingRows = new Set<string>();
		for (
			let rowIndex = this.renderedStartRow;
			rowIndex < this.renderedEndRow;
			rowIndex += 1
		) {
			const row = layout.rows[rowIndex];
			if (row?.kind === 'items' && !this.measuredRowHeights.has(row.key)) {
				pendingRows.add(row.key);
			}
		}
		if (pendingRows.size === 0) return;

		const itemRowHeights = new Map<string, number>();
		for (const element of Array.from(
			this.options.containerEl.querySelectorAll<HTMLElement>(
				':scope > .mbv-viewport-grid-slot',
			),
		)) {
			const rowKey = element.dataset.mbvGridRowKey;
			if (!rowKey || !pendingRows.has(rowKey)) continue;
			itemRowHeights.set(
				rowKey,
				Math.max(itemRowHeights.get(rowKey) ?? 0, element.offsetHeight),
			);
		}

		let changed = false;
		for (const rowKey of pendingRows) {
			const measuredHeight = itemRowHeights.get(rowKey) ?? 0;
			if (measuredHeight <= 0) continue;
			this.measuredRowHeights.set(rowKey, measuredHeight);
			changed = true;
		}
		if (changed) {
			this.layoutDirty = true;
			this.scheduleLayout();
		}
	}

	private setSpacerHeight(element: HTMLElement, height: number): void {
		const value = `${Math.round(height * 100) / 100}px`;
		if (element.style.getPropertyValue('--mbv-viewport-grid-spacer-height') === value) {
			return;
		}
		element.setCssProps({ '--mbv-viewport-grid-spacer-height': value });
	}

	private getOrCreateSlot(item: Item): GridSlot<Item, Controller> {
		const key = this.options.getKey(item);
		const existing = this.slots.get(key);
		if (existing) {
			this.slots.delete(key);
			this.slots.set(key, existing);
			existing.item = item;
			if (existing.dirty) {
				this.pendingSlotUpdates.delete(existing);
				this.options.update(existing.controller, item);
				existing.dirty = false;
			}
			return existing;
		}
		const controller = this.options.create(item);
		const element = this.options.containerEl.ownerDocument.createElement('div');
		element.classList.add('mbv-viewport-grid-slot');
		if (this.options.slotClass) element.classList.add(this.options.slotClass);
		element.dataset.mbvGridKey = key;
		element.append(controller.element);
		const slot = { key, element, item, controller, dirty: false };
		this.slots.set(key, slot);
		return slot;
	}

	private getOrCreateGroupHeader(group: ViewportGridGroup<Item>): GridGroupHeader {
		let header = this.groupHeaders.get(group.key);
		if (!header) {
			const element = this.options.containerEl.ownerDocument.createElement('div');
			element.classList.add('mbv-viewport-grid-group-header');
			const labelEl = element.createSpan('mbv-viewport-grid-group-label');
			const countEl = element.createSpan('mbv-viewport-grid-group-count');
			header = { element, labelEl, countEl };
			this.groupHeaders.set(group.key, header);
		}
		header.labelEl.setText(group.label);
		header.countEl.setText(`${group.items.length} 项`);
		return header;
	}

	private createSpacer(positionClass: string): HTMLElement {
		const element = this.options.containerEl.ownerDocument.createElement('div');
		element.classList.add('mbv-viewport-grid-spacer', positionClass);
		return element;
	}

	private hasStableTopology(groups: readonly ViewportGridGroup<Item>[]): boolean {
		if (groups.length !== this.groups.length) return false;
		for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
			const previousGroup = this.groups[groupIndex];
			const nextGroup = groups[groupIndex];
			if (
				!previousGroup ||
				!nextGroup ||
				previousGroup.key !== nextGroup.key ||
				previousGroup.showHeader !== nextGroup.showHeader ||
				previousGroup.items.length !== nextGroup.items.length
			) return false;
			for (let itemIndex = 0; itemIndex < nextGroup.items.length; itemIndex += 1) {
				const previousItem = previousGroup.items[itemIndex];
				const nextItem = nextGroup.items[itemIndex];
				if (
					previousItem === undefined ||
					nextItem === undefined ||
					this.options.getKey(previousItem) !== this.options.getKey(nextItem)
				) return false;
			}
		}
		return true;
	}

	private disposeSlot(slot: GridSlot<Item, Controller>): void {
		this.pendingSlotUpdates.delete(slot);
		if (this.attachedSlots.delete(slot)) {
			this.options.onDetach?.(slot.controller);
		}
		this.options.dispose?.(slot.controller);
		slot.element.remove();
	}
}

export function findScrollRoot(element: HTMLElement): HTMLElement | null {
	const ownerWindow = element.ownerDocument.defaultView;
	if (!ownerWindow) return null;
	let parent = element.parentElement;
	while (parent) {
		const style = ownerWindow.getComputedStyle(parent);
		if (/(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`)) {
			return parent;
		}
		parent = parent.parentElement;
	}
	return null;
}

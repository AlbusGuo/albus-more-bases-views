import { type App, BasesEntry, BasesPropertyId } from 'obsidian';
import { LngLatBounds, Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import { parseCoordinates, type MapCoordinates } from './map-coordinates';
import { createMapMarkerElement } from './map-marker';
import {
	canEditMapMarkerProperty,
	createMapMarkerColorEditor,
	createMapMarkerIconEditor,
	type MapMarkerPropertyTarget,
} from './map-marker-editor';
import type { MapViewOptions } from './map-options';
import { createMapPopupContent } from './map-popup';

interface MarkerRecord {
	entry: BasesEntry;
	marker: Marker;
	coordinates: MapCoordinates;
	presentationSignature: string;
}

export interface MarkerUpdateContext {
	entries: BasesEntry[];
	options: MapViewOptions;
	visibleProperties: BasesPropertyId[];
	centerConfigured: boolean;
	getDisplayName: (property: BasesPropertyId) => string;
}

export class MapMarkerManager {
	private readonly markers = new Map<string, MarkerRecord>();
	private inspectorEl: HTMLElement | null = null;
	private connectorEl: HTMLElement | null = null;
	private inspectorKey: string | null = null;
	private editorCleanup: (() => void) | null = null;
	private context: MarkerUpdateContext | null = null;
	private allowInitialFit = true;
	private readonly handleMapBackgroundClick = (event: MouseEvent): void => {
		const target = event.target as Element | null;
		if (target?.closest?.('.mbv-map-marker, .mbv-map-inspector')) return;
		this.closeInspector();
	};
	private readonly handleMapMoveStart = (): void => {
		this.closeInspector();
	};
	private readonly handleMapResize = (): void => {
		if (!this.inspectorKey) return;
		const record = this.markers.get(this.inspectorKey);
		if (record) this.positionInspector(record);
	};

	constructor(
		private readonly app: App,
		private readonly map: MapLibreMap,
		private readonly mapEl: HTMLElement,
		private readonly navigation: MarkdownNavigationService,
	) {
		this.mapEl.addEventListener('click', this.handleMapBackgroundClick);
		this.map.on('movestart', this.handleMapMoveStart);
		this.map.on('resize', this.handleMapResize);
	}

	suppressInitialFit(): void {
		this.allowInitialFit = false;
	}

	update(context: MarkerUpdateContext): void {
		this.context = context;
		const property = context.options.coordinatesProperty;
		if (!property) {
			this.clear();
			return;
		}
		const activeKeys = new Set<string>();
		const allCoordinates: MapCoordinates[] = [];
		for (const entry of context.entries) {
			const coordinates = parseCoordinates(entry.getValue(property));
			if (!coordinates) continue;
			const key = entry.file.path;
			activeKeys.add(key);
			allCoordinates.push(coordinates);
			this.upsert(key, entry, coordinates);
		}
		for (const [key, record] of this.markers) {
			if (activeKeys.has(key)) continue;
			record.marker.remove();
			this.markers.delete(key);
			if (this.inspectorKey === key) this.closeInspector();
		}
		if (this.inspectorKey && !this.editorCleanup) {
			this.renderInspector(this.inspectorKey);
		}
		if (!this.allowInitialFit || allCoordinates.length === 0) return;
		this.allowInitialFit = false;
		if (context.centerConfigured) return;
		const bounds = new LngLatBounds();
		for (const [latitude, longitude] of allCoordinates) {
			bounds.extend([longitude, latitude]);
		}
		this.map.fitBounds(bounds, { padding: 30, maxZoom: 14, duration: 0 });
	}

	clear(): void {
		for (const record of this.markers.values()) record.marker.remove();
		this.markers.clear();
		this.closeInspector();
	}

	destroy(): void {
		this.mapEl.removeEventListener('click', this.handleMapBackgroundClick);
		this.map.off('movestart', this.handleMapMoveStart);
		this.map.off('resize', this.handleMapResize);
		this.clear();
		this.context = null;
	}

	private upsert(
		key: string,
		entry: BasesEntry,
		coordinates: MapCoordinates,
	): void {
		if (!this.context) return;
		const { options } = this.context;
		const title = getEntryText(entry, options.titleProperty) || entry.file.basename;
		const icon = getEntryText(entry, options.markerIconProperty);
		const color = getEntryText(entry, options.markerColorProperty);
		const signature = getPresentationSignature(
			entry,
			options.imageProperty,
			title,
			icon,
			color,
		);
		const existing = this.markers.get(key);
		if (existing && existing.presentationSignature === signature) {
			existing.entry = entry;
			existing.coordinates = coordinates;
			existing.marker.setLngLat([coordinates[1], coordinates[0]]);
			return;
		}
		existing?.marker.remove();
		const element = createMapMarkerElement(this.mapEl.ownerDocument, {
			icon,
			color,
			onActivate: () => this.openInspector(key),
		});
		const marker = new Marker({ element, anchor: 'bottom' })
			.setLngLat([coordinates[1], coordinates[0]])
			.addTo(this.map);
		this.markers.set(key, {
			entry,
			marker,
			coordinates,
			presentationSignature: signature,
		});
	}

	private openInspector(key: string): void {
		this.closeInspector();
		this.inspectorKey = key;
		this.connectorEl = this.mapEl.createDiv('mbv-map-inspector-connector');
		this.inspectorEl = this.mapEl.createDiv({
			cls: 'mbv-map-inspector',
			attr: { tabindex: '-1' },
		});
		stopMapInteraction(this.inspectorEl);
		this.inspectorEl.addEventListener('keydown', (event) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			event.stopPropagation();
			if (this.editorCleanup) this.closeEditor();
			else this.closeInspector();
		});
		this.renderInspector(key, true);
		this.inspectorEl.focus({ preventScroll: true });
	}

	private renderInspector(key: string, position = false): void {
		if (!this.context) return;
		const record = this.markers.get(key);
		if (!record || !this.inspectorEl || this.inspectorKey !== key) return;
		this.inspectorEl.empty();
		const iconProperty = this.context.options.markerIconProperty;
		const colorProperty = this.context.options.markerColorProperty;
		const contentEl = createMapPopupContent({
			app: this.app,
			ownerEl: this.mapEl,
			ownerDocument: this.mapEl.ownerDocument,
			entry: record.entry,
			options: this.context.options,
			visibleProperties: this.context.visibleProperties,
			getDisplayName: this.context.getDisplayName,
			navigation: this.navigation,
			onEditIcon: canEditMapMarkerProperty(iconProperty)
				? () => this.openPropertyEditor(key, 'icon', iconProperty)
				: undefined,
			onEditColor: canEditMapMarkerProperty(colorProperty)
				? () => this.openPropertyEditor(key, 'color', colorProperty)
				: undefined,
			onClose: () => this.closeInspector(),
		});
		this.inspectorEl.append(contentEl);
		if (position) this.positionInspector(record);
		else this.positionConnector(record);
	}

	private openPropertyEditor(
		key: string,
		kind: 'icon' | 'color',
		property: BasesPropertyId,
	): void {
		if (!this.context) return;
		const record = this.markers.get(key);
		if (!record || !this.inspectorEl || this.inspectorKey !== key) return;
		this.closeEditor();
		this.inspectorEl.addClass('is-editing');
		const target: MapMarkerPropertyTarget = {
			file: record.entry.file,
			property,
			value: getEntryText(record.entry, property),
		};
		const callbacks = {
			onClose: () => {
				this.closeEditor();
				this.renderInspector(key);
			},
			onSaved: () => {
				this.closeEditor();
				this.renderInspector(key);
			},
		};
		this.editorCleanup = kind === 'icon'
			? createMapMarkerIconEditor(this.inspectorEl, this.app, target, callbacks)
			: createMapMarkerColorEditor(this.inspectorEl, this.app, target, callbacks);
		this.positionConnector(record);
	}

	private positionInspector(record: MarkerRecord): void {
		if (!this.inspectorEl) return;
		const point = this.map.project([
			record.coordinates[1],
			record.coordinates[0],
		]);
		const viewportWidth = this.mapEl.clientWidth;
		const viewportHeight = this.mapEl.clientHeight;
		const panelWidth = this.inspectorEl.offsetWidth;
		const panelHeight = this.inspectorEl.offsetHeight;
		const padding = 12;
		const gap = 30;
		const markerCenterY = point.y - 16;
		const preferredPosition = {
			left: point.x + gap,
			top: markerCenterY - panelHeight / 2,
		};
		const candidates = [
			preferredPosition,
			{ left: point.x - panelWidth - gap, top: markerCenterY - panelHeight / 2 },
			{ left: point.x - panelWidth / 2, top: point.y - panelHeight - 40 },
			{ left: point.x - panelWidth / 2, top: point.y + 12 },
		];
		let best = preferredPosition;
		let bestOverflow = Number.POSITIVE_INFINITY;
		for (const candidate of candidates) {
			const overflow = getPanelOverflow(
				candidate,
				panelWidth,
				panelHeight,
				viewportWidth,
				viewportHeight,
				padding,
			);
			if (overflow >= bestOverflow) continue;
			best = candidate;
			bestOverflow = overflow;
			if (overflow === 0) break;
		}
		const maxLeft = Math.max(padding, viewportWidth - panelWidth - padding);
		const maxTop = Math.max(padding, viewportHeight - panelHeight - padding);
		const reservedHeight = Math.min(360, Math.max(1, viewportHeight - padding * 2));
		const maxTopForExpansion = Math.max(
			padding,
			viewportHeight - reservedHeight - padding,
		);
		const left = Math.round(clamp(best.left, padding, maxLeft));
		const top = Math.round(clamp(
			best.top,
			padding,
			Math.min(maxTop, maxTopForExpansion),
		));
		const maxHeight = Math.max(1, viewportHeight - top - padding);
		this.inspectorEl.setCssProps({
			'--mbv-map-inspector-left': `${left}px`,
			'--mbv-map-inspector-top': `${top}px`,
			'--mbv-map-inspector-max-height': `${maxHeight}px`,
		});
		this.positionConnector(record);
	}

	private positionConnector(record: MarkerRecord): void {
		if (!this.inspectorEl || !this.connectorEl) return;
		const point = this.map.project([
			record.coordinates[1],
			record.coordinates[0],
		]);
		const startX = point.x;
		const startY = point.y - 16;
		const panelLeft = this.inspectorEl.offsetLeft;
		const panelTop = this.inspectorEl.offsetTop;
		const panelRight = panelLeft + this.inspectorEl.offsetWidth;
		const panelBottom = panelTop + this.inspectorEl.offsetHeight;
		const endX = clamp(startX, panelLeft, panelRight);
		const endY = clamp(startY, panelTop, panelBottom);
		const deltaX = endX - startX;
		const deltaY = endY - startY;
		const length = Math.hypot(deltaX, deltaY);
		const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
		const markerColor = this.context
			? getEntryText(record.entry, this.context.options.markerColorProperty)
			: '';
		const supportedColor = markerColor &&
			this.mapEl.ownerDocument.defaultView?.CSS.supports('color', markerColor)
			? markerColor
			: 'var(--interactive-accent)';
		this.connectorEl.toggleClass('is-hidden', length < 2);
		this.connectorEl.setCssProps({
			'--mbv-map-connector-left': `${startX}px`,
			'--mbv-map-connector-top': `${startY}px`,
			'--mbv-map-connector-length': `${length}px`,
			'--mbv-map-connector-angle': `${angle}deg`,
			'--mbv-map-connector-color': supportedColor,
		});
	}

	private closeEditor(): void {
		const cleanup = this.editorCleanup;
		this.editorCleanup = null;
		cleanup?.();
		this.inspectorEl?.removeClass('is-editing');
	}

	private closeInspector(): void {
		this.closeEditor();
		this.connectorEl?.remove();
		this.connectorEl = null;
		this.inspectorEl?.remove();
		this.inspectorEl = null;
		this.inspectorKey = null;
	}
}

function getPanelOverflow(
	position: { left: number; top: number },
	width: number,
	height: number,
	viewportWidth: number,
	viewportHeight: number,
	padding: number,
): number {
	return Math.max(0, padding - position.left) +
		Math.max(0, position.left + width + padding - viewportWidth) +
		Math.max(0, padding - position.top) +
		Math.max(0, position.top + height + padding - viewportHeight);
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function stopMapInteraction(element: HTMLElement): void {
	for (const type of ['click', 'dblclick', 'mousedown', 'pointerdown', 'contextmenu']) {
		element.addEventListener(type, (event) => event.stopPropagation());
	}
	element.addEventListener('wheel', (event) => event.stopPropagation(), {
		passive: true,
	});
}

function getPresentationSignature(
	entry: BasesEntry,
	imageProperty: BasesPropertyId | null,
	title: string,
	icon: string,
	color: string,
): string {
	const image = getEntryText(entry, imageProperty);
	return [title, icon, color, image].join('\u0000');
}

function getEntryText(entry: BasesEntry, property: BasesPropertyId | null): string {
	if (!property) return '';
	const text = entry.getValue(property)?.toString().trim() ?? '';
	return text.toLowerCase() === 'null' ? '' : text;
}

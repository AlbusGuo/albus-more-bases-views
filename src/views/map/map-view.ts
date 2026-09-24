/*
 * Map view architecture adapted with reference to obsidianmd/obsidian-maps.
 * Copyright (c) 2025 Obsidian, licensed under MIT; see OBSIDIAN_MAPS_LICENSE.
 */
import {
	BasesView,
	Menu,
	Notice,
	parsePropertyId,
	type BasesPropertyId,
	type QueryController,
} from 'obsidian';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { BasesViewTabsService } from '../../services/bases-view-tabs';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import { AnimationFrameTask } from '../../ui/animation-frame-task';
import { createMapControls } from './map-controls';
import {
	formatCoordinates,
	parseCoordinates,
	parseCoordinateText,
	type MapCoordinates,
} from './map-coordinates';
import type { MapMarkerManager } from './map-marker-manager';
import { loadMapRuntime } from './map-runtime';
import {
	DEFAULT_MAP_CENTER,
	getMapViewOptions,
	readMapViewOptions,
	type MapViewOptions,
} from './map-options';
import { bindMapPitchDrag } from './map-pitch';
import { createMapStyle } from './map-style';

export const MAP_VIEW_TYPE = 'albus-more-bases-views-map';
export { getMapViewOptions };

interface MapRuntimeConfig {
	options: MapViewOptions;
	center: MapCoordinates;
	centerConfigured: boolean;
}

interface PendingMapState {
	center?: MapCoordinates;
	zoom?: number;
	pitch?: number;
}

export class MapView extends BasesView {
	readonly type = MAP_VIEW_TYPE;

	private readonly containerEl: HTMLElement;
	private readonly mapEl: HTMLElement;
	private map: MapLibreMap | null = null;
	private markerManager: MapMarkerManager | null = null;
	private mapInitialization: Promise<void> | null = null;
	private mapInitializationId = 0;
	private titleObserver: MutationObserver | null = null;
	private runtimeConfig: MapRuntimeConfig | null = null;
	private visibleProperties: BasesPropertyId[] = [];
	private configSignature = '';
	private mapLoaded = false;
	private suppressMarkerFit = false;
	private pendingState: PendingMapState | null = null;
	private resizeFrame: number | null = null;
	private resizeTimer: number | null = null;
	private styleFrame: number | null = null;
	private forceStyleRefresh = false;
	private appliedDarkTheme: boolean | null = null;
	private readonly dataUpdateTask: AnimationFrameTask;

	constructor(
		controller: QueryController,
		private readonly parentEl: HTMLElement,
		private readonly navigation: MarkdownNavigationService,
		viewTabs: BasesViewTabsService,
	) {
		super(controller);
		viewTabs.attach(controller, parentEl);
		this.containerEl = parentEl.createDiv({
			cls: 'mbv-map-view is-loading',
			attr: { tabindex: '-1' },
		});
		this.mapEl = this.containerEl.createDiv('mbv-map-canvas');
		this.dataUpdateTask = new AnimationFrameTask(
			this.containerEl,
			() => this.applyDataUpdate(),
		);
		const resizeObserver = new ResizeObserver(() => this.scheduleMapResize());
		resizeObserver.observe(this.containerEl);
		resizeObserver.observe(parentEl);
		this.register(() => resizeObserver.disconnect());
		this.registerEvent(this.app.workspace.on('css-change', () => {
			this.scheduleMapStyle(false);
		}));
		this.register(() => this.cleanupScheduledFrames());
		this.register(() => parentEl.removeClass('mbv-map-host'));
	}

	onDataUpdated(): void {
		this.dataUpdateTask.schedule();
	}

	private applyDataUpdate(): void {
		const options = readMapViewOptions(this.config);
		const runtimeConfig = {
			options,
			center: this.getConfiguredCenter(),
			centerConfigured: this.hasConfiguredCenter(),
		};
		this.runtimeConfig = runtimeConfig;
		this.visibleProperties = this.config.getOrder();
		this.updateHeight(options.mapHeight);
		const signature = createConfigSignature(runtimeConfig);
		if (!this.map) {
			this.configSignature = signature;
			this.initializeMap();
			return;
		}
		if (signature !== this.configSignature) {
			const previousSignature = this.configSignature;
			this.configSignature = signature;
			this.applyConfig(runtimeConfig, previousSignature);
		}
		if (this.mapLoaded) this.updateMarkers();
	}

	onunload(): void {
		this.dataUpdateTask.cancel();
		this.mapInitializationId += 1;
		this.mapInitialization = null;
		this.cleanupScheduledFrames();
		this.parentEl.removeClass('mbv-map-host');
		this.titleObserver?.disconnect();
		this.titleObserver = null;
		this.markerManager?.destroy();
		this.markerManager = null;
		this.map?.remove();
		this.map = null;
	}

	onResize(): void {
		this.scheduleMapResize();
	}

	focus(): void {
		this.containerEl.focus({ preventScroll: true });
	}

	setEphemeralState(state: unknown): void {
		this.pendingState = readEphemeralState(state);
		if (this.pendingState) {
			this.suppressMarkerFit = true;
			this.markerManager?.suppressInitialFit();
		}
		if (!this.map || !this.pendingState) return;
		this.applyPendingState();
	}

	getEphemeralState(): unknown {
		if (!this.map) return {};
		const center = this.map.getCenter();
		return {
			center: { latitude: center.lat, longitude: center.lng },
			zoom: this.map.getZoom(),
			pitch: this.map.getPitch(),
		};
	}

	private initializeMap(): void {
		if (this.map || this.mapInitialization) return;
		const initializationId = ++this.mapInitializationId;
		this.mapInitialization = this.createMap(initializationId).finally(() => {
			if (initializationId === this.mapInitializationId) {
				this.mapInitialization = null;
			}
		});
	}

	private async createMap(initializationId: number): Promise<void> {
		try {
			const runtime = await loadMapRuntime();
			const config = this.runtimeConfig;
			if (initializationId !== this.mapInitializationId || !config) return;
			this.mountMap(config, runtime.Map, runtime.MapMarkerManager);
		} catch {
			if (initializationId !== this.mapInitializationId) return;
			this.containerEl.removeClass('is-loading');
			new Notice('地图组件加载失败.');
		}
	}

	private mountMap(
		config: MapRuntimeConfig,
		MapConstructor: typeof import('maplibre-gl').Map,
		MarkerManagerConstructor: typeof MapMarkerManager,
	): void {
		if (this.pendingState) this.suppressMarkerFit = true;
		const initialCenter = this.pendingState?.center ?? config.center;
		const initialZoom = this.pendingState?.zoom ?? config.options.defaultZoom;
		const initialPitch = this.pendingState?.pitch ?? 0;
		this.appliedDarkTheme = this.isDarkTheme();
		this.map = new MapConstructor({
			container: this.mapEl,
			style: this.getMapStyle(config.options),
			center: [initialCenter[1], initialCenter[0]],
			zoom: initialZoom,
			pitch: initialPitch,
			bearing: 0,
			minZoom: config.options.minZoom,
			maxZoom: config.options.maxZoom,
			minPitch: 0,
			maxPitch: 60,
			dragRotate: false,
			touchPitch: false,
			pitchWithRotate: false,
			attributionControl: { compact: true },
		});
		this.markerManager = new MarkerManagerConstructor(
			this.app,
			this.map,
			this.mapEl,
			this.navigation,
		);
		if (this.suppressMarkerFit) this.markerManager.suppressInitialFit();
		createMapControls(this.map.getContainer(), this.map, () => this.resetMap());
		this.register(bindMapPitchDrag(
			this.mapEl,
			this.map,
			(event) => this.showMapContextMenu(event),
		));
		this.map.on('load', () => {
			if (!this.map) return;
			this.mapLoaded = true;
			this.containerEl.removeClass('is-loading');
			this.removeCanvasTooltip();
			this.applyPendingState();
			this.updateMarkers();
		});
	}

	private applyConfig(config: MapRuntimeConfig, previousSignature: string): void {
		if (!this.map) return;
		this.map.setMinZoom(config.options.minZoom);
		this.map.setMaxZoom(config.options.maxZoom);
		const previous = parseConfigSignature(previousSignature);
		const nextCenter = formatCoordinates(config.center, 6);
		if (!this.pendingState && previous.center !== nextCenter) {
			this.map.setCenter([config.center[1], config.center[0]]);
		}
		if (!this.pendingState && previous.zoom !== config.options.defaultZoom) {
			this.map.setZoom(config.options.defaultZoom);
		}
		if (previous.tiles !== getTileSignature(config.options)) {
			this.scheduleMapStyle(true);
		}
	}

	private applyMapStyle(force: boolean): void {
		if (!this.map || !this.runtimeConfig) return;
		const dark = this.isDarkTheme();
		if (!force && dark === this.appliedDarkTheme) return;
		this.appliedDarkTheme = dark;
		this.map.setStyle(this.getMapStyle(this.runtimeConfig.options));
	}

	private getMapStyle(options: MapViewOptions) {
		const dark = this.isDarkTheme();
		return createMapStyle(dark, options.mapTiles, options.mapTilesDark);
	}

	private isDarkTheme(): boolean {
		return this.containerEl.ownerDocument.body.hasClass('theme-dark');
	}

	private updateMarkers(): void {
		if (!this.markerManager || !this.runtimeConfig) return;
		this.markerManager.update({
			entries: this.data.groupedData.flatMap((group) => group.entries),
			options: this.runtimeConfig.options,
			visibleProperties: this.visibleProperties,
			centerConfigured: this.runtimeConfig.centerConfigured,
			getDisplayName: (property) => this.config.getDisplayName(property),
		});
	}

	private resetMap(): void {
		if (!this.map || !this.runtimeConfig) return;
		this.map.easeTo({
			center: [this.runtimeConfig.center[1], this.runtimeConfig.center[0]],
			zoom: this.runtimeConfig.options.defaultZoom,
			pitch: 0,
			bearing: 0,
		});
	}

	private showMapContextMenu(event: MouseEvent): void {
		if (!this.map || !this.runtimeConfig) return;
		const rect = this.mapEl.getBoundingClientRect();
		const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
		const lngLat = this.map.unproject(point);
		const coordinates: MapCoordinates = [
			Math.round(lngLat.lat * 100000) / 100000,
			Math.round(lngLat.lng * 100000) / 100000,
		];
		const menu = Menu.forEvent(event);
		menu.addItem((item) => item
			.setTitle('新建坐标笔记')
			.setIcon('square-pen')
			.onClick(() => this.createCoordinateFile(coordinates)));
		menu.addItem((item) => item
			.setTitle('复制坐标')
			.setIcon('copy')
			.onClick(() => this.copyCoordinates(coordinates)));
		menu.addItem((item) => item
			.setTitle('设为默认中心')
			.setIcon('map-pin')
			.onClick(() => this.setDefaultCenter(coordinates)));
		menu.addItem((item) => item
			.setTitle(`设为默认缩放 (${this.map?.getZoom().toFixed(1) ?? ''})`)
			.setIcon('crosshair')
			.onClick(() => this.setDefaultZoom()));
	}

	private createCoordinateFile(coordinates: MapCoordinates): void {
		const property = this.runtimeConfig?.options.coordinatesProperty;
		void this.createFileForView('', (frontmatter) => {
			if (!property) return;
			const parsed = parsePropertyId(property);
			if (parsed.type !== 'note') return;
			const writable = frontmatter as Record<string, unknown>;
			writable[parsed.name] = coordinates.map((value) => value.toFixed(5));
		});
	}

	private copyCoordinates(coordinates: MapCoordinates): void {
		const clipboard = this.mapEl.ownerDocument.defaultView?.navigator.clipboard;
		if (!clipboard) {
			new Notice('当前环境无法访问剪贴板.');
			return;
		}
		void clipboard.writeText(formatCoordinates(coordinates)).then(
			() => new Notice('坐标已复制.'),
			() => new Notice('复制坐标失败.'),
		);
	}

	private setDefaultCenter(coordinates: MapCoordinates): void {
		this.config.set('centerLatitude', String(coordinates[0]));
		this.config.set('centerLongitude', String(coordinates[1]));
		if (this.runtimeConfig) this.runtimeConfig.center = coordinates;
		this.map?.setCenter([coordinates[1], coordinates[0]]);
	}

	private setDefaultZoom(): void {
		if (!this.map) return;
		const zoom = Math.round(this.map.getZoom() * 10) / 10;
		this.config.set('defaultZoom', zoom);
		if (this.runtimeConfig) this.runtimeConfig.options.defaultZoom = zoom;
	}

	private updateHeight(height: number): void {
		const embedded = this.isEmbedded();
		this.containerEl.setCssProps({ '--mbv-map-height': `${height}px` });
		this.containerEl.classList.toggle('is-embedded', embedded);
		this.parentEl.classList.toggle('mbv-map-host', !embedded);
		this.scheduleMapResize();
	}

	private isEmbedded(): boolean {
		let element = this.containerEl.parentElement;
		while (element) {
			if (element.hasClass('bases-embed') || element.hasClass('block-language-base')) {
				return true;
			}
			element = element.parentElement;
		}
		return false;
	}

	private getConfiguredCenter(): MapCoordinates {
		const latitude = this.getConfiguredCoordinate('centerLatitude', -90, 90);
		const longitude = this.getConfiguredCoordinate('centerLongitude', -180, 180);
		if (latitude !== null || longitude !== null) {
			return [
				latitude ?? DEFAULT_MAP_CENTER[0],
				longitude ?? DEFAULT_MAP_CENTER[1],
			];
		}
		// 兼容早期测试版本中合并填写的中心坐标.
		try {
			const evaluated = this.config.getEvaluatedFormula(this, 'center');
			const coordinates = parseCoordinates(evaluated);
			if (coordinates) return coordinates;
		} catch {
			// Invalid or context-dependent formulas fall back to the raw value.
		}
		const raw = this.config.get('center');
		return typeof raw === 'string'
			? (parseCoordinateText(raw) ?? [...DEFAULT_MAP_CENTER])
			: [...DEFAULT_MAP_CENTER];
	}

	private getConfiguredCoordinate(
		key: 'centerLatitude' | 'centerLongitude',
		minimum: number,
		maximum: number,
	): number | null {
		try {
			const evaluated = this.config.getEvaluatedFormula(this, key);
			const number = Number(evaluated?.toString());
			if (Number.isFinite(number) && number >= minimum && number <= maximum) {
				return number;
			}
		} catch {
			// 无效公式继续尝试读取原始数值.
		}
		const raw = this.config.get(key);
		const number = typeof raw === 'string' && raw.trim()
			? Number(raw)
			: typeof raw === 'number' ? raw : Number.NaN;
		return Number.isFinite(number) && number >= minimum && number <= maximum
			? number
			: null;
	}

	private hasConfiguredCenter(): boolean {
		return hasConfigValue(this.config.get('centerLatitude')) ||
			hasConfigValue(this.config.get('centerLongitude')) ||
			hasConfigValue(this.config.get('center'));
	}

	private scheduleMapResize(): void {
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		if (this.resizeTimer !== null) ownerWindow.clearTimeout(this.resizeTimer);
		this.resizeTimer = ownerWindow.setTimeout(() => {
			this.resizeTimer = null;
			if (this.resizeFrame !== null) return;
			this.resizeFrame = ownerWindow.requestAnimationFrame(() => {
				this.resizeFrame = null;
				this.map?.resize();
			});
		}, 80);
	}

	private scheduleMapStyle(force: boolean): void {
		this.forceStyleRefresh ||= force;
		if (this.styleFrame !== null) return;
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		this.styleFrame = ownerWindow.requestAnimationFrame(() => {
			this.styleFrame = null;
			const forceRefresh = this.forceStyleRefresh;
			this.forceStyleRefresh = false;
			this.applyMapStyle(forceRefresh);
		});
	}

	private cleanupScheduledFrames(): void {
		const ownerWindow = this.containerEl.ownerDocument.defaultView;
		if (this.resizeFrame !== null) ownerWindow?.cancelAnimationFrame(this.resizeFrame);
		if (this.resizeTimer !== null) ownerWindow?.clearTimeout(this.resizeTimer);
		if (this.styleFrame !== null) ownerWindow?.cancelAnimationFrame(this.styleFrame);
		this.resizeFrame = null;
		this.resizeTimer = null;
		this.styleFrame = null;
		this.forceStyleRefresh = false;
	}

	private applyPendingState(): void {
		if (!this.map || !this.pendingState) return;
		if (this.pendingState.center) {
			this.map.setCenter([this.pendingState.center[1], this.pendingState.center[0]]);
		}
		if (this.pendingState.zoom !== undefined) this.map.setZoom(this.pendingState.zoom);
		if (this.pendingState.pitch !== undefined) this.map.setPitch(this.pendingState.pitch);
		this.pendingState = null;
	}

	private removeCanvasTooltip(): void {
		const remove = (): void => {
			const canvas = this.mapEl.querySelector('canvas');
			canvas?.removeAttribute('title');
			canvas?.removeAttribute('aria-label');
		};
		remove();
		this.titleObserver?.disconnect();
		const Observer = this.mapEl.ownerDocument.defaultView?.MutationObserver;
		if (!Observer) return;
		this.titleObserver = new Observer(remove);
		this.titleObserver.observe(this.mapEl, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['title', 'aria-label'],
		});
	}
}

function hasConfigValue(value: unknown): boolean {
	return typeof value === 'string' ? value.trim().length > 0 : value != null;
}

function createConfigSignature(config: MapRuntimeConfig): string {
	return JSON.stringify({
		center: formatCoordinates(config.center, 6),
		zoom: config.options.defaultZoom,
		minZoom: config.options.minZoom,
		maxZoom: config.options.maxZoom,
		tiles: getTileSignature(config.options),
	});
}

function parseConfigSignature(signature: string): {
	center?: string;
	zoom?: number;
	tiles?: string;
} {
	try {
		return JSON.parse(signature) as { center?: string; zoom?: number; tiles?: string };
	} catch {
		return {};
	}
}

function getTileSignature(options: MapViewOptions): string {
	return JSON.stringify([options.mapTiles, options.mapTilesDark]);
}

function readEphemeralState(state: unknown): PendingMapState | null {
	if (!state || typeof state !== 'object') return null;
	const value = state as Record<string, unknown>;
	const centerValue = value.center;
	let center: MapCoordinates | undefined;
	if (centerValue && typeof centerValue === 'object') {
		const centerObject = centerValue as Record<string, unknown>;
		const latitude = Number(centerObject.latitude ?? centerObject.lat);
		const longitude = Number(centerObject.longitude ?? centerObject.lng);
		center = parseCoordinateText(`${latitude}, ${longitude}`) ?? undefined;
	}
	const zoom = typeof value.zoom === 'number' ? value.zoom : undefined;
	const pitch = typeof value.pitch === 'number'
		? Math.min(60, Math.max(0, value.pitch))
		: undefined;
	return center || zoom !== undefined || pitch !== undefined
		? { center, zoom, pitch }
		: null;
}

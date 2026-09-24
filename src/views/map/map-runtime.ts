import type { Map } from 'maplibre-gl';
import type { MapMarkerManager } from './map-marker-manager';

export interface MapRuntime {
	Map: typeof Map;
	MapMarkerManager: typeof MapMarkerManager;
}

let runtimePromise: Promise<MapRuntime> | null = null;

/** Loads the heavy map engine only when a map view is actually opened. */
export function loadMapRuntime(): Promise<MapRuntime> {
	runtimePromise ??= Promise.all([
		import('maplibre-gl'),
		import('./map-marker-manager'),
	]).then(([maplibre, markerManager]) => ({
		Map: maplibre.Map,
		MapMarkerManager: markerManager.MapMarkerManager,
	})).catch((error: unknown) => {
		runtimePromise = null;
		throw error;
	});
	return runtimePromise;
}
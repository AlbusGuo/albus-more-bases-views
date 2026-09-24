import type { StyleSpecification } from 'maplibre-gl';

const LIGHT_TILES = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
const DARK_TILES = ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'];
const ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function createMapStyle(
	dark: boolean,
	lightTiles: string[],
	darkTiles: string[],
): StyleSpecification {
	const tiles = dark
		? (darkTiles.length ? darkTiles : DARK_TILES)
		: (lightTiles.length ? lightTiles : LIGHT_TILES);
	return {
		version: 8,
		sources: {
			'mbv-map-tiles': {
				type: 'raster',
				tiles,
				tileSize: 256,
				attribution: ATTRIBUTION,
			},
		},
		layers: [{
			id: 'mbv-map-background',
			type: 'raster',
			source: 'mbv-map-tiles',
			minzoom: 0,
			maxzoom: 24,
		}],
	};
}

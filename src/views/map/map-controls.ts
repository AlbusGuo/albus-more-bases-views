import { setIcon } from 'obsidian';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { formatCoordinates } from './map-coordinates';

export function createMapControls(
	containerEl: HTMLElement,
	map: MapLibreMap,
	reset: () => void,
): void {
	const buttonGroupEl = containerEl.createDiv({
		cls: 'mbv-map-controls maplibregl-ctrl maplibregl-ctrl-group',
	});
	createButton(buttonGroupEl, '放大', 'plus', () => map.zoomIn());
	createButton(buttonGroupEl, '缩小', 'minus', () => map.zoomOut());
	createButton(buttonGroupEl, '重置地图', 'refresh-cw', reset);

	const infoEl = containerEl.createDiv('mbv-map-info');
	const zoomEl = infoEl.createDiv();
	const centerEl = infoEl.createDiv();
	const update = (): void => {
		const center = map.getCenter();
		zoomEl.setText(`缩放: ${map.getZoom().toFixed(1)}`);
		centerEl.setText(`中心: ${formatCoordinates([center.lat, center.lng], 4)}`);
	};
	map.on('zoom', update);
	map.on('move', update);
	update();
}

function createButton(
	containerEl: HTMLElement,
	label: string,
	icon: string,
	callback: () => void,
): void {
	const buttonEl = containerEl.createEl('button', {
		cls: 'clickable-icon',
		attr: { type: 'button', 'aria-label': label },
	});
	setIcon(buttonEl, icon);
	buttonEl.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		callback();
	});
}

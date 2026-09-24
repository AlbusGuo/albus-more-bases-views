import { setIcon } from 'obsidian';

export interface MapMarkerPresentation {
	color: string;
	icon: string;
	onActivate: () => void;
}

export function createMapMarkerElement(
	ownerDocument: Document,
	presentation: MapMarkerPresentation,
): HTMLElement {
	const markerEl = ownerDocument.createElement('button');
	markerEl.classList.add('mbv-map-marker');
	markerEl.type = 'button';
	markerEl.createDiv('mbv-map-marker-shadow');
	const pinEl = markerEl.createDiv('mbv-map-marker-pin');
	markerEl.createDiv('mbv-map-marker-outline');
	const color = getSupportedColor(ownerDocument, presentation.color);
	if (color) pinEl.setCssProps({ '--mbv-map-marker-color': color });
	if (presentation.icon) {
		const iconEl = markerEl.createDiv('mbv-map-marker-icon');
		setIcon(iconEl, presentation.icon);
		if (iconEl.childElementCount === 0) {
			iconEl.remove();
			markerEl.createDiv('mbv-map-marker-dot');
		}
	} else {
		markerEl.createDiv('mbv-map-marker-dot');
	}
	markerEl.addEventListener('click', (event) => {
		event.stopPropagation();
		presentation.onActivate();
	});
	return markerEl;
}

function getSupportedColor(ownerDocument: Document, value: string): string {
	const color = value.trim();
	if (!color) return '';
	return ownerDocument.defaultView?.CSS.supports('color', color) ? color : '';
}

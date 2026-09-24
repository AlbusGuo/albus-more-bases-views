import type { Map as MapLibreMap } from 'maplibre-gl';

const MIN_PITCH = 0;
const MAX_PITCH = 60;
const DRAG_THRESHOLD = 3;

export function bindMapPitchDrag(
	mapEl: HTMLElement,
	map: MapLibreMap,
	onRightClick: (event: MouseEvent) => void,
): () => void {
	const ownerDocument = mapEl.ownerDocument;
	let dragging = false;
	let moved = false;
	let startX = 0;
	let startY = 0;
	let lastY = 0;
	const onMouseDown = (event: MouseEvent): void => {
		if (event.button !== 2) return;
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		dragging = true;
		moved = false;
		startX = event.clientX;
		startY = event.clientY;
		lastY = event.clientY;
		mapEl.addClass('is-pitch-dragging');
	};
	const onMouseMove = (event: MouseEvent): void => {
		if (!dragging) return;
		const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
		if (distance >= DRAG_THRESHOLD) moved = true;
		const deltaY = lastY - event.clientY;
		lastY = event.clientY;
		if (!moved || Math.abs(deltaY) < 1) return;
		map.setPitch(Math.min(MAX_PITCH, Math.max(MIN_PITCH, map.getPitch() + deltaY * 0.6)));
	};
	const onMouseUp = (event: MouseEvent): void => {
		if (!dragging || event.button !== 2) return;
		dragging = false;
		mapEl.removeClass('is-pitch-dragging');
		if (!moved) onRightClick(event);
	};
	const onContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
	};
	mapEl.addEventListener('mousedown', onMouseDown, true);
	mapEl.addEventListener('contextmenu', onContextMenu, true);
	ownerDocument.addEventListener('mousemove', onMouseMove);
	ownerDocument.addEventListener('mouseup', onMouseUp);
	return () => {
		mapEl.removeEventListener('mousedown', onMouseDown, true);
		mapEl.removeEventListener('contextmenu', onContextMenu, true);
		ownerDocument.removeEventListener('mousemove', onMouseMove);
		ownerDocument.removeEventListener('mouseup', onMouseUp);
	};
}

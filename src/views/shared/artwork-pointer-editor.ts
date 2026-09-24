import {
	createArtworkPosition,
	moveArtworkPosition,
	type ArtworkPosition,
} from './artwork-position';

export interface ArtworkPointerEditorOptions {
	surface: HTMLElement;
	isEnabled: () => boolean;
	getPosition: () => ArtworkPosition;
	setPosition: (position: ArtworkPosition) => void;
	setDragging: (dragging: boolean) => void;
	onCommit?: () => void;
	wheelDeltaThreshold?: number;
	maximumScale?: number;
}

/** Shared direct-manipulation behavior used by operator and Hearthstone artwork editors. */
export function bindArtworkPointerEditor(
	options: ArtworkPointerEditorOptions,
): () => void {
	const { surface } = options;
	const ownerWindow = surface.ownerDocument.defaultView ?? window;
	const abort = new ownerWindow.AbortController();
	const signal = abort.signal;
	let pointer: { id: number; x: number; y: number } | null = null;
	let accumulatedWheelDelta = 0;

	const endDrag = (event: PointerEvent): void => {
		if (pointer?.id !== event.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		pointer = null;
		options.setDragging(false);
		options.onCommit?.();
		if (surface.hasPointerCapture(event.pointerId)) {
			surface.releasePointerCapture(event.pointerId);
		}
	};

	surface.addEventListener('pointerdown', event => {
		if (!options.isEnabled() || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
		accumulatedWheelDelta = 0;
		surface.setPointerCapture(event.pointerId);
		options.setDragging(true);
	}, { signal });
	surface.addEventListener('pointermove', event => {
		if (!options.isEnabled() || pointer?.id !== event.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		const rect = surface.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;
		const position = options.getPosition();
		options.setPosition(moveArtworkPosition(
			position,
			(event.clientX - pointer.x) / rect.width * 100,
			(event.clientY - pointer.y) / rect.height * 100,
		));
		pointer.x = event.clientX;
		pointer.y = event.clientY;
	}, { signal });
	surface.addEventListener('pointerup', endDrag, { signal });
	surface.addEventListener('pointercancel', endDrag, { signal });
	surface.addEventListener('click', event => {
		if (!options.isEnabled()) return;
		event.preventDefault();
		event.stopPropagation();
	}, { signal });
	surface.addEventListener('wheel', event => {
		if (!options.isEnabled()) return;
		event.preventDefault();
		event.stopPropagation();
		const position = options.getPosition();
		let direction = event.deltaY < 0 ? 1 : -1;
		let steps = 1;
		if (options.wheelDeltaThreshold !== undefined) {
			const threshold = Math.max(1, options.wheelDeltaThreshold);
			const delta = event.deltaMode === 1
				? event.deltaY * 40
				: event.deltaMode === 2
					? event.deltaY * Math.max(1, surface.clientHeight)
					: event.deltaY;
			if (delta === 0) return;
			accumulatedWheelDelta = Math.max(
				-threshold * 3,
				Math.min(threshold * 3, accumulatedWheelDelta + delta),
			);
			steps = Math.floor(Math.abs(accumulatedWheelDelta) / threshold);
			if (steps === 0) return;
			direction = accumulatedWheelDelta < 0 ? 1 : -1;
			accumulatedWheelDelta -= Math.sign(accumulatedWheelDelta) * steps * threshold;
		}
		const steppedScale = Math.round(
			(position.scale + direction * 0.1 * steps) * 10,
		) / 10;
		const boundedScale = Math.max(0, options.maximumScale === undefined || direction < 0
			? steppedScale
			: Math.min(options.maximumScale, steppedScale));
		if (boundedScale === position.scale) return;
		options.setPosition(createArtworkPosition(position.x, position.y, boundedScale));
		options.onCommit?.();
	}, { passive: false, signal });

	return () => {
		if (pointer && surface.hasPointerCapture(pointer.id)) {
			surface.releasePointerCapture(pointer.id);
		}
		pointer = null;
		options.setDragging(false);
		abort.abort();
	};
}

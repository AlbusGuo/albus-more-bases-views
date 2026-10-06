import type { BookCardContext, BookCardController } from './book-card';
import { createBookCard } from './book-card';

const STACK_LAYERS = [
	{ x: 0, y: 0, scale: 1, hoverX: 0, hoverY: -3, hoverScale: 1.01 },
	{ x: 5, y: -8, scale: 0.985, hoverX: 8, hoverY: -14, hoverScale: 0.985 },
	{ x: -3, y: -16, scale: 0.97, hoverX: -7, hoverY: -26, hoverScale: 0.97 },
	{ x: 3, y: -24, scale: 0.955, hoverX: 7, hoverY: -38, hoverScale: 0.955 },
] as const;

export function createBookGalleryItem(
	initialContext: BookCardContext,
): BookCardController {
	const element = createDiv('mbv-book-gallery-item');
	let controller: BookCardController | null = null;
	let mode: 'book' | 'series' | null = null;
	let currentContext = initialContext;

	const render = (context: BookCardContext): void => {
		currentContext = context;
		const nextMode = context.seriesCollection ? 'series' : 'book';
		if (mode === nextMode && nextMode === 'book' && controller) {
			controller.update(context);
			return;
		}
		controller?.destroy?.();
		element.empty();
		mode = nextMode;
		controller = nextMode === 'series'
			? createSeriesEntrance(context)
			: createBookCard(context);
		element.append(controller.element);
	};

	render(initialContext);
	return {
		element,
		update: render,
		destroy: () => controller?.destroy?.(),
		canOpenEditor: () => mode === 'book' && controller?.canOpenEditor?.() !== false,
	};

	function createSeriesEntrance(context: BookCardContext): BookCardController {
		const collection = context.seriesCollection;
		if (!collection) return createBookCard(context);
		const entranceEl = createDiv({
			cls: 'mbv-book-series-entrance',
			attr: {
				role: 'button',
				tabindex: '0',
			},
		});
		const stackEl = entranceEl.createDiv('mbv-book-series-step-stack');
		const visualControllers: BookCardController[] = [];
		const shellElements: HTMLElement[] = [];
		const visibleEntries = collection.entries.slice(0, STACK_LAYERS.length);
		for (let depth = visibleEntries.length - 1; depth >= 0; depth--) {
			const entry = visibleEntries[depth];
			const layer = STACK_LAYERS[depth];
			if (!entry || !layer) continue;
			const bookWrapEl = stackEl.createDiv('mbv-book-series-step-book');
			bookWrapEl.classList.toggle('is-back-book', depth > 0);
			bookWrapEl.setCssProps({
				'--mbv-book-series-step-depth': String(depth),
				'--mbv-book-series-step-x': `${layer.x}px`,
				'--mbv-book-series-step-y': `${layer.y}px`,
				'--mbv-book-series-step-scale': String(layer.scale),
				'--mbv-book-series-step-hover-x': `${layer.hoverX}px`,
				'--mbv-book-series-step-hover-y': `${layer.hoverY}px`,
				'--mbv-book-series-step-hover-scale': String(layer.hoverScale),
			});
			bookWrapEl.setAttribute('aria-hidden', 'true');
			bookWrapEl.inert = true;
			const visual = createBookCard({
				...context,
				entry,
				seriesCollection: undefined,
				openSeries: undefined,
			});
			visualControllers.push(visual);
			bookWrapEl.append(visual.element);
			const shellEl = visual.element.querySelector<HTMLElement>('.mbv-book-shell');
			if (shellEl) shellElements[depth] = shellEl;
		}
		const captionEl = entranceEl.createDiv(
			'mbv-book-series-entrance-caption mbv-book-card-body mbv-card-details',
		);
		captionEl.createDiv({
			cls: 'mbv-book-series-entrance-title mbv-card-property-title',
			text: collection.label,
		});
		const propertiesEl = captionEl.createDiv('mbv-card-properties');
		propertiesEl.createDiv({
			cls: 'mbv-book-series-entrance-count mbv-card-property',
			text: `${collection.entries.length} 本`,
		});
		const source = {
			element: entranceEl,
			visibleItemCount: visibleEntries.length,
			getItemRects: (): readonly DOMRect[] => {
				const fallback = stackEl.getBoundingClientRect();
				const layerRects = visibleEntries.map((_, index) =>
					shellElements[index]?.getBoundingClientRect() ?? fallback);
				const lastRect = layerRects.at(-1) ?? fallback;
				return collection.entries.map((_, index) =>
					layerRects[index] ?? lastRect);
			},
			setExpanded: (expanded: boolean): void => {
				entranceEl.classList.toggle('is-expanded', expanded);
				entranceEl.setAttribute('aria-expanded', String(expanded));
			},
		};
		entranceEl.setAttribute('aria-expanded', 'false');
		const open = (): void => {
			currentContext.openSeries?.(collection, source);
		};
		entranceEl.addEventListener('click', (event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			open();
		});
		entranceEl.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			open();
		});
		return {
			element: entranceEl,
			update: () => undefined,
			destroy: () => {
				for (const visual of visualControllers) visual.destroy?.();
			},
			canOpenEditor: () => false,
		};
	}
}

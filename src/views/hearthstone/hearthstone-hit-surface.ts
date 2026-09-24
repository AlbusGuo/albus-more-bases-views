import {
	HEARTHSTONE_CARD_HEIGHT,
	HEARTHSTONE_CARD_WIDTH,
} from './hearthstone-layout';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const HIT_CELL_SIZE = 4;
const HIT_ALPHA_THRESHOLD = 12;
const MINIMUM_COMPONENT_CELLS = 2;

export const DEFAULT_HEARTHSTONE_HIT_PATH =
	'M72 24H468Q506 24 506 62V608Q506 650 464 650H76Q34 650 34 608V66Q34 24 72 24Z';

export class HearthstoneHitSurface {
	readonly element: SVGSVGElement;
	readonly pathElement: SVGPathElement;

	constructor(document: Document) {
		this.element = document.createElementNS(SVG_NAMESPACE, 'svg');
		this.element.classList.add('mbv-hs-hit-surface');
		this.element.setAttribute('viewBox', `0 0 ${HEARTHSTONE_CARD_WIDTH} ${HEARTHSTONE_CARD_HEIGHT}`);
		this.element.setAttribute('preserveAspectRatio', 'none');
		this.element.setAttribute('aria-hidden', 'true');
		this.element.setAttribute('focusable', 'false');
		this.pathElement = document.createElementNS(SVG_NAMESPACE, 'path');
		this.pathElement.classList.add('mbv-hs-hit-path');
		this.pathElement.setAttribute('d', DEFAULT_HEARTHSTONE_HIT_PATH);
		this.element.append(this.pathElement);
	}

	setPath(path: string | null): void {
		this.pathElement.setAttribute('d', path || DEFAULT_HEARTHSTONE_HIT_PATH);
	}

}

export function createHearthstoneHitPath(alpha: Uint8ClampedArray): string {
	const columns = Math.ceil(HEARTHSTONE_CARD_WIDTH / HIT_CELL_SIZE);
	const rows = Math.ceil(HEARTHSTONE_CARD_HEIGHT / HIT_CELL_SIZE);
	const occupied = new Uint8Array(columns * rows);
	for (let row = 0; row < rows; row += 1) {
		const top = row * HIT_CELL_SIZE;
		const bottom = Math.min(HEARTHSTONE_CARD_HEIGHT, top + HIT_CELL_SIZE);
		for (let column = 0; column < columns; column += 1) {
			const left = column * HIT_CELL_SIZE;
			const right = Math.min(HEARTHSTONE_CARD_WIDTH, left + HIT_CELL_SIZE);
			let visiblePixels = 0;
			for (let y = top; y < bottom; y += 1) {
				for (let x = left; x < right; x += 1) {
					if ((alpha[(y * HEARTHSTONE_CARD_WIDTH + x) * 4 + 3] ?? 0) >=
						HIT_ALPHA_THRESHOLD) visiblePixels += 1;
				}
			}
			if (visiblePixels > 0) {
				occupied[row * columns + column] = 1;
			}
		}
	}
	removeSmallComponents(occupied, columns, rows);
	fillEnclosedHoles(occupied, columns, rows);
	const commands: string[] = [];
	for (let row = 0; row < rows; row += 1) {
		let column = 0;
		while (column < columns) {
			while (column < columns && occupied[row * columns + column] === 0) {
				column += 1;
			}
			if (column >= columns) break;
			const start = column;
			while (column < columns && occupied[row * columns + column] === 1) {
				column += 1;
			}
			const left = start * HIT_CELL_SIZE;
			const right = Math.min(HEARTHSTONE_CARD_WIDTH, column * HIT_CELL_SIZE);
			const top = row * HIT_CELL_SIZE;
			const bottom = Math.min(HEARTHSTONE_CARD_HEIGHT, top + HIT_CELL_SIZE);
			commands.push(`M${left} ${top}H${right}V${bottom}H${left}Z`);
		}
	}
	return commands.join('');
}

function fillEnclosedHoles(
	occupied: Uint8Array,
	columns: number,
	rows: number,
): void {
	const outside = new Uint8Array(occupied.length);
	const queue: number[] = [];
	const enqueue = (row: number, column: number): void => {
		const index = row * columns + column;
		if (occupied[index] === 1 || outside[index] === 1) return;
		outside[index] = 1;
		queue.push(index);
	};
	for (let column = 0; column < columns; column += 1) {
		enqueue(0, column);
		enqueue(rows - 1, column);
	}
	for (let row = 1; row < rows - 1; row += 1) {
		enqueue(row, 0);
		enqueue(row, columns - 1);
	}
	for (let cursor = 0; cursor < queue.length; cursor += 1) {
		const current = queue[cursor];
		if (current === undefined) continue;
		const row = Math.floor(current / columns);
		const column = current % columns;
		if (row > 0) enqueue(row - 1, column);
		if (row + 1 < rows) enqueue(row + 1, column);
		if (column > 0) enqueue(row, column - 1);
		if (column + 1 < columns) enqueue(row, column + 1);
	}
	for (let index = 0; index < occupied.length; index += 1) {
		if (occupied[index] === 0 && outside[index] === 0) occupied[index] = 1;
	}
}

function removeSmallComponents(
	occupied: Uint8Array,
	columns: number,
	rows: number,
): void {
	const visited = new Uint8Array(occupied.length);
	for (let index = 0; index < occupied.length; index += 1) {
		if (occupied[index] === 0 || visited[index] === 1) continue;
		const component: number[] = [];
		const queue = [index];
		visited[index] = 1;
		for (let cursor = 0; cursor < queue.length; cursor += 1) {
			const current = queue[cursor];
			if (current === undefined) continue;
			component.push(current);
			const row = Math.floor(current / columns);
			const column = current % columns;
			for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
				for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
					if (rowOffset === 0 && columnOffset === 0) continue;
					const nextRow = row + rowOffset;
					const nextColumn = column + columnOffset;
					if (
						nextRow < 0 || nextRow >= rows ||
						nextColumn < 0 || nextColumn >= columns
					) continue;
					const next = nextRow * columns + nextColumn;
					if (occupied[next] === 0 || visited[next] === 1) continue;
					visited[next] = 1;
					queue.push(next);
				}
			}
		}
		if (component.length >= MINIMUM_COMPONENT_CELLS) continue;
		for (const cell of component) occupied[cell] = 0;
	}
}

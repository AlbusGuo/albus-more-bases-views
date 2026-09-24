import type { CelebrityFrameMaterial } from './celebrity-options';

type WoodDirection = 'horizontal' | 'vertical';
type ColorTuple = readonly [number, number, number];

interface WoodPalette {
	base: ColorTuple;
	dark: ColorTuple;
	light: ColorTuple;
}

interface WoodKnot {
	x: number;
	y: number;
	rx: number;
	ry: number;
	power: number;
}

interface CelebrityFrameTextures {
	horizontal: string;
	vertical: string;
}

const WOOD_PALETTES: Record<CelebrityFrameMaterial, WoodPalette> = {
	walnut: {
		base: [84, 50, 31],
		dark: [38, 22, 15],
		light: [128, 80, 50],
	},
	oak: {
		base: [177, 131, 83],
		dark: [101, 70, 40],
		light: [214, 177, 128],
	},
	mahogany: {
		base: [99, 48, 50],
		dark: [49, 20, 25],
		light: [150, 84, 82],
	},
};

const textureCache = new WeakMap<
	Document,
	Map<CelebrityFrameMaterial, CelebrityFrameTextures>
>();

export function applyCelebrityFrameTexture(
	containerEl: HTMLElement,
	material: CelebrityFrameMaterial,
): void {
	const ownerDocument = containerEl.ownerDocument;
	let documentTextures = textureCache.get(ownerDocument);
	if (!documentTextures) {
		documentTextures = new Map();
		textureCache.set(ownerDocument, documentTextures);
	}
	const textures = documentTextures.get(material) ?? createTextures(ownerDocument, material);
	if (!textures) return;
	documentTextures.set(material, textures);
	setTexture(containerEl, '--mbv-celebrity-wood-horizontal', textures.horizontal);
	setTexture(containerEl, '--mbv-celebrity-wood-vertical', textures.vertical);
}

function createTextures(
	ownerDocument: Document,
	material: CelebrityFrameMaterial,
): CelebrityFrameTextures | null {
	const palette = WOOD_PALETTES[material];
	const horizontal = buildWoodTexture(
		ownerDocument, 1600, 280, palette, 'horizontal', 11 + material.length,
	);
	const vertical = buildWoodTexture(
		ownerDocument, 280, 1600, palette, 'vertical', 29 + material.length,
	);
	return horizontal && vertical
		? { horizontal, vertical }
		: null;
}

function buildWoodTexture(
	ownerDocument: Document,
	width: number,
	height: number,
	palette: WoodPalette,
	direction: WoodDirection,
	seed: number,
): string | null {
	const canvas = ownerDocument.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) return null;
	const random = createRandom(seed);
	const image = context.createImageData(width, height);
	const data = image.data;
	const horizontal = direction === 'horizontal';
	const major = horizontal ? height : width;
	const warp = buildWarp(major, random);
	const knots = buildKnots(width, height, horizontal, random);

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const majorPosition = horizontal ? y : x;
			const minorPosition = horizontal ? x : y;
			const warped = warp[majorPosition] ?? 0;
			const position = majorPosition + warped * 18 + Math.sin(minorPosition * 0.022) * 3.5;
			let grain = Math.sin(position * 0.17) * 0.5 +
				Math.sin(position * 0.049 + 0.6) * 0.35;
			grain += Math.sin(position * 0.013 + minorPosition * 0.01) * 0.2;
			grain = grain * 0.5 + 0.5;
			let pore = Math.sin(minorPosition * 0.8 + majorPosition * 0.13) * 0.5 + 0.5;
			pore = pore > 0.82 ? (pore - 0.82) * 1.8 : 0;
			const knotInfluence = getKnotInfluence(knots, x, y);
			const value = clamp(grain + knotInfluence - pore * 0.12, 0, 1);
			const sheen = horizontal
				? Math.cos(x / width * Math.PI * 1.35) * 0.035
				: Math.cos(y / height * Math.PI * 1.35) * 0.035;
			const index = (y * width + x) * 4;
			data[index] = clamp(
				palette.base[0] + (value - 0.5) * (palette.light[0] - palette.dark[0]) + sheen * 255,
				0, 255,
			);
			data[index + 1] = clamp(
				palette.base[1] + (value - 0.5) * (palette.light[1] - palette.dark[1]) + sheen * 215,
				0, 255,
			);
			data[index + 2] = clamp(
				palette.base[2] + (value - 0.5) * (palette.light[2] - palette.dark[2]) + sheen * 170,
				0, 255,
			);
			data[index + 3] = 255;
		}
	}
	context.putImageData(image, 0, 0);
	paintLongGrain(context, width, height, horizontal, random);
	paintPores(context, width, height, random);
	paintVarnish(context, width, height);
	try {
		return canvas.toDataURL('image/png');
	} catch {
		return null;
	}
}

function buildWarp(length: number, random: () => number): Float32Array {
	const warp = new Float32Array(length);
	let accumulated = 0;
	for (let index = 0; index < length; index += 1) {
		accumulated += (random() - 0.5) * 0.35;
		accumulated *= 0.97;
		warp[index] = accumulated + lineNoise(index, random);
	}
	return warp;
}

function buildKnots(
	width: number,
	height: number,
	horizontal: boolean,
	random: () => number,
): WoodKnot[] {
	return Array.from({ length: 4 + Math.floor(random() * 4) }, () => ({
		x: random() * width,
		y: random() * height,
		rx: (horizontal ? 90 : 35) + random() * (horizontal ? 110 : 45),
		ry: (horizontal ? 22 : 90) + random() * (horizontal ? 32 : 110),
		power: 0.8 + random() * 0.8,
	}));
}

function getKnotInfluence(knots: WoodKnot[], x: number, y: number): number {
	let influence = 0;
	for (const knot of knots) {
		const deltaX = (x - knot.x) / knot.rx;
		const deltaY = (y - knot.y) / knot.ry;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		if (distance >= 1.25) continue;
		const ring = Math.sin(
			(1 - distance) * 16 * knot.power + Math.atan2(deltaY, deltaX) * 0.2,
		) * (1 - distance);
		influence += ring * 0.25;
	}
	return influence;
}

function paintLongGrain(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	horizontal: boolean,
	random: () => number,
): void {
	context.globalAlpha = 0.12;
	context.strokeStyle = 'rgb(255 255 255 / 55%)';
	for (let index = 0; index < 26; index += 1) {
		context.beginPath();
		if (horizontal) {
			const position = random() * height;
			context.moveTo(0, position);
			for (let x = 0; x <= width; x += 16) {
				context.lineTo(x, position + Math.sin(x * 0.02 + index) * (1 + random() * 2));
			}
		} else {
			const position = random() * width;
			context.moveTo(position, 0);
			for (let y = 0; y <= height; y += 16) {
				context.lineTo(position + Math.sin(y * 0.02 + index) * (1 + random() * 2), y);
			}
		}
		context.lineWidth = 1 + random() * 1.2;
		context.stroke();
	}
}

function paintPores(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	random: () => number,
): void {
	context.globalAlpha = 0.16;
	for (let index = 0; index < 170; index += 1) {
		context.fillStyle = index % 2
			? 'rgb(20 10 8 / 25%)'
			: 'rgb(255 255 255 / 8%)';
		context.fillRect(
			random() * width,
			random() * height,
			0.8 + random() * 2.2,
			0.4 + random() * 1.1,
		);
	}
}

function paintVarnish(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
): void {
	const varnish = context.createLinearGradient(0, 0, 0, height);
	varnish.addColorStop(0, 'rgb(255 255 255 / 8%)');
	varnish.addColorStop(0.22, 'rgb(255 255 255 / 2%)');
	varnish.addColorStop(0.5, 'transparent');
	varnish.addColorStop(0.78, 'rgb(0 0 0 / 6%)');
	varnish.addColorStop(1, 'rgb(0 0 0 / 12%)');
	context.globalAlpha = 1;
	context.fillStyle = varnish;
	context.fillRect(0, 0, width, height);
}

function lineNoise(position: number, random: () => number): number {
	return Math.sin(position * 0.018) * 0.45 +
		Math.sin(position * 0.051 + 1.7) * 0.22 +
		Math.sin(position * 0.11 + 3.1) * 0.09 +
		(random() - 0.5) * 0.08;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function createRandom(seed: number): () => number {
	let value = seed;
	return () => {
		let next = value += 0x6d2b79f5;
		next = Math.imul(next ^ next >>> 15, next | 1);
		next ^= next + Math.imul(next ^ next >>> 7, next | 61);
		return ((next ^ next >>> 14) >>> 0) / 4294967296;
	};
}

function setTexture(element: HTMLElement, property: string, source: string): void {
	element.style.setProperty(property, `url("${source}")`);
}

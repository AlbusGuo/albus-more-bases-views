export interface ArtworkPosition { x: number; y: number; scale: number }
export function createArtworkPosition(x: number, y: number, scale: number): ArtworkPosition {
	return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 0,
		scale: Number.isFinite(scale) ? Math.max(0, scale) : 1 };
}
export function formatArtworkPosition(position: ArtworkPosition): string {
	return '[' + [position.x, position.y, position.scale].map(n => String(Math.round(n * 1000) / 1000)).join(',') + ']';
}
export function moveArtworkPosition(position: ArtworkPosition, dx: number, dy: number): ArtworkPosition {
	const factor = 1 - position.scale;
	const safe = Math.abs(factor) < 0.1 ? factor < 0 ? -0.1 : 0.1 : factor;
	return createArtworkPosition(position.x + dx / safe, position.y + dy / safe, position.scale);
}
export function artworkTransform(position: ArtworkPosition): { left: number; top: number; size: number } {
	return { left: position.x * (1 - position.scale), top: position.y * (1 - position.scale), size: position.scale * 100 };
}
export function parseArtworkPosition(value: unknown, index = 0): ArtworkPosition {
	const fallback = (): ArtworkPosition => ({ x: 50, y: 0, scale: 1.48 });
	if (Array.isArray(value)) {
		if (value.length === 3 && value.every(v => typeof v === 'number' || typeof v === 'string' && v.trim() && Number.isFinite(Number(v)))) {
			return createArtworkPosition(Number(value[0]), Number(value[1]), Number(value[2]));
		}
		return parseArtworkPosition(value[index] ?? value[0]);
	}
	if (typeof value !== 'string') return fallback();
	const matches = [...value.matchAll(/\[\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\]/gu)];
	const match = matches[index] ?? matches[0];
	return match ? createArtworkPosition(Number(match[1]), Number(match[2]), Number(match[3])) : fallback();
}

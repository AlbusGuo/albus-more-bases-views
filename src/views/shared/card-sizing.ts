import type { BasesAllOptions } from 'obsidian';

export const DEFAULT_CARD_MIN_WIDTH = 160;
export const MIN_CARD_WIDTH = 50;
export const MAX_CARD_WIDTH = 800;
export const CARD_WIDTH_STEP = 1;
export const CARD_GRID_COLUMN_GAP = 24;
export const COMPACT_CARD_GRID_COLUMN_GAP = 16;

export function readCardMinWidth(value: unknown): number {
	const number = Number(value);
	if (!Number.isFinite(number)) return DEFAULT_CARD_MIN_WIDTH;
	return Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, number));
}

export function createCardMinWidthOption(
	displayName: string,
): BasesAllOptions {
	return {
		type: 'slider',
		key: 'cardMinWidth',
		displayName,
		default: DEFAULT_CARD_MIN_WIDTH,
		min: MIN_CARD_WIDTH,
		max: MAX_CARD_WIDTH,
		step: CARD_WIDTH_STEP,
		instant: true,
	};
}

import { cardKind, isHeroCard, type MinionData } from './hearthstone-model';
import { HEARTHSTONE_FONTS } from './hearthstone-fonts';
import { HEARTHSTONE_CARD_HEIGHT, HEARTHSTONE_CARD_WIDTH } from './hearthstone-layout';

export interface DescriptionToken { text: string; bold: boolean; italic: boolean }
interface TextLine { tokens: DescriptionToken[]; width: number }
export interface DescriptionLayout { lines: TextLine[]; size: number; leading: number; overflow: boolean }
export function tokenizeDescription(text: string): DescriptionToken[] {
	const result: DescriptionToken[] = [];
	for (const match of text.replace(/\r\n?/g, '\n').matchAll(/\*\*([^*]+)\*\*|\*([^*]+)\*|([^*]+)|(\*)/g)) {
		const content = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
		for (const part of content.match(/[a-zA-Z0-9]+(?:[.'-][a-zA-Z0-9]+)*|[^\S\n]+|\n|./gu) ?? []) result.push({ text: part, bold: match[1] !== undefined, italic: match[2] !== undefined });
	}
	return result;
}

export function renderDescriptionMarkup(element: HTMLElement, text: string): void {
	element.empty();
	let content = '';
	let bold = false;
	let italic = false;
	const append = (): void => {
		if (!content) return;
		let parent = element;
		if (bold) parent = parent.createEl('strong');
		if (italic) parent = parent.createEl('em');
		parent.append(element.ownerDocument.createTextNode(content));
		content = '';
	};
	for (const token of tokenizeDescription(text)) {
		if (token.bold !== bold || token.italic !== italic) {
			append(); bold = token.bold; italic = token.italic;
		}
		content += token.text;
	}
	append();
}
export function layoutDescription(text: string, width: number, height: number,
	measure: (text: string, size: number, bold: boolean, italic: boolean) => number,
	maximum = 30.5, leadingRatio = 1.14): DescriptionLayout {
	const tokens = tokenizeDescription(text.slice(0, 12000)); let lines: TextLine[] = []; let size = maximum;
	for (; size >= 12; size -= 0.5) {
		lines = [{ tokens: [], width: 0 }];
		const append = (token: DescriptionToken): void => {
			let line = lines.at(-1); if (!line) return;
			if (token.text === '\n') { lines.push({ tokens: [], width: 0 }); return; }
			const length = measure(token.text, size, token.bold, token.italic);
			if (length > width && Array.from(token.text).length > 1) { for (const character of Array.from(token.text)) append({ ...token, text: character }); return; }
			if (line.width + length > width && line.tokens.length) { line = { tokens: [], width: 0 }; lines.push(line); }
			if (!line.tokens.length && /^\s+$/u.test(token.text)) return;
			line.tokens.push(token); line.width += length;
		};
		for (const token of tokens) append(token);
		if (lines.length * size * leadingRatio <= height) return { lines, size, leading: size * leadingRatio, overflow: text.length > 12000 };
	}
	size = 12; lines = lines.slice(0, Math.max(1, Math.floor(height / (size * leadingRatio))));
	const last = lines.at(-1);
	if (last) {
		const ellipsis = measure('…', size, false, false);
		while (last.width + ellipsis > width && last.tokens.length) { const token = last.tokens.pop(); if (token) last.width -= measure(token.text, size, token.bold, token.italic); }
		last.tokens.push({ text: '…', bold: false, italic: false }); last.width += ellipsis;
	}
	return { lines, size, leading: size * leadingRatio, overflow: true };
}

interface TextPoint { x: number; y: number }
interface TextLayout {
	title: TextPoint & { width: number; size: number; stroke: number; font?: string; spaced?: boolean; spacing?: number; curve?: 'minion' | 'hero' | 'spell' | 'location'; sourceBaseline?: number };
	numberSize: number;
	cost: TextPoint;
	attack: TextPoint;
	health: TextPoint;
	showTribes: boolean;
	stackedTribes: boolean;
	tribeX: number;
	tribeY: number;
	tribeGap: number;
	tribeWidth: number;
	tribeSize: number;
	description: { x: number; top: number; bottom: number; width: number; size: number; color: string; leadingRatio?: number };
}

function standardTitle(text: string): TextLayout['title'] {
	const length = Array.from(text).length;
	if (length <= 8) return { x: 270, y: 390, width: 344, size: 40, stroke: 4, curve: 'minion', sourceBaseline: 40.6053 };
	if (length === 9) return { x: 270, y: 390, width: 344, size: 38, stroke: 4, curve: 'minion', sourceBaseline: 39.6053 };
	if (length === 10) return { x: 270, y: 390, width: 344, size: 34, stroke: 4, curve: 'minion', sourceBaseline: 38.6053 };
	if (length === 11) return { x: 270, y: 390, width: 344, size: 30.8, stroke: 4, curve: 'minion', sourceBaseline: 36.6053 };
	if (length === 12) return { x: 270, y: 390, width: 344, size: 29.2, stroke: 4, curve: 'minion', sourceBaseline: 36.6053 };
	return { x: 270, y: 390, width: 344, size: Math.max(17, Math.min(29.2, 343.47 / length)), stroke: 4, curve: 'minion', sourceBaseline: 33.6053 };
}

function heroTitle(text: string): TextLayout['title'] {
	const length = Array.from(text).length;
	const sizes = [40, 40, 40, 40, 40, 40, 40, 40, 36, 32.4, 29.33333, 26.4, 24];
	const baselines = [40.6053, 40.6053, 40.6053, 40.6053, 40.6053, 40.6053, 40.6053,
		40.6053, 38.6053, 37.6053, 36.6053, 35.6053, 34.6053];
	const index = Math.min(12, length);
	const size = sizes[index] ?? 24;
	return {
		x: 273, y: 380, width: 286,
		size: length > 12 ? Math.max(16, 24 * 12 / length) : size,
		stroke: 4, curve: 'hero', sourceBaseline: baselines[index] ?? 34.6053,
	};
}

function spellTitle(text: string): TextLayout['title'] {
	const title = standardTitle(text);
	return { ...title, size: title.size * 0.97 };
}

function textLayout(data: MinionData): TextLayout {
	const kind = cardKind(data);
	if (kind !== '随从' && kind !== '英雄' && data.finish === '异画') return {
		title: { x: 273, y: data.description ? 413 : 573, width: 280, size: 25, stroke: 5 }, numberSize: 90,
		cost: { x: 112, y: 116 }, attack: { x: 120, y: 605 }, health: { x: 436, y: 606 },
		showTribes: kind === '法术', stackedTribes: false, tribeX: 273, tribeY: 586, tribeGap: 0, tribeWidth: 230, tribeSize: 23,
		description: { x: 274, top: 443, bottom: kind === '法术' ? 562 : 528, width: 270, size: 24, color: '#f3f0e9' },
	};
	if (kind === '法术') return {
		title: data.finish === '金卡'
			? { x: 274, y: 383, width: 290, size: 34, stroke: 4, font: HEARTHSTONE_FONTS.skillTitle, spaced: true, spacing: 0.973 }
			: { ...spellTitle(data.title), x: 275.5, curve: 'spell', y: 386, font: HEARTHSTONE_FONTS.skillTitle, spaced: true, spacing: 0.973 }, numberSize: 96,
		cost: { x: 112, y: 133 }, attack: { x: 119, y: 603 }, health: { x: 430, y: 604 },
		showTribes: true, stackedTribes: data.tribes.length === 2, tribeX: 270, tribeY: 615, tribeGap: 23, tribeWidth: 180, tribeSize: 27,
		description: { x: 268.6, top: 466, bottom: 586, width: 237, size: 21.53333,
			color: data.finish === '金卡' ? '#ddd' : '#1e1710', leadingRatio: 24.13334 / 21.53333 },
	};
	if (kind === '武器') return {
		title: { x: 270, y: 385, width: 290, size: 33.64, stroke: 4 }, numberSize: 96,
		cost: { x: 112, y: 133 }, attack: { x: 119, y: 603 }, health: { x: 430, y: 604 },
		showTribes: true, stackedTribes: false, tribeX: 270, tribeY: 603, tribeGap: 0, tribeWidth: 180, tribeSize: 29,
		description: { x: 269.6, top: 459, bottom: 587, width: 268, size: 22.66667,
			color: '#dcdcdc', leadingRatio: 25.6 / 22.66667 },
	};
	if (kind === '地标') return {
		title: { x: 279, y: 399, width: 360, size: 40, stroke: 4, font: HEARTHSTONE_FONTS.skillTitle,
			spaced: true, curve: 'location', sourceBaseline: 40.6053 }, numberSize: 94.5,
		cost: { x: 112, y: 133 }, attack: { x: 119, y: 603 }, health: { x: 430, y: 604 },
		showTribes: true, stackedTribes: false, tribeX: 270, tribeY: 615, tribeGap: 0, tribeWidth: 180, tribeSize: 28,
		description: { x: 270.6, top: 466, bottom: 586, width: 249, size: 23.88,
			color: data.finish === '金卡' ? '#ddd' : '#1e1710', leadingRatio: 26.8 / 23.88 },
	};
	if (isHeroCard(data) && data.finish === '异画') return {
		title: { x: 273, y: data.description ? 413 : 573, width: data.description ? 300 : 250, size: 25, stroke: 5 },
		numberSize: 90,
		cost: { x: 112, y: 116 }, attack: { x: 120, y: 605 }, health: { x: 436, y: 606 },
		showTribes: false, stackedTribes: false, tribeX: 0, tribeY: 0, tribeGap: 0, tribeWidth: 0, tribeSize: 0,
		description: { x: 274, top: 440, bottom: 570, width: 266, size: 28, color: '#f3f0e9' },
	};
	if (isHeroCard(data)) return {
		title: heroTitle(data.title), numberSize: 96,
		cost: { x: 112, y: 133 }, attack: { x: 119, y: 603 }, health: { x: 430, y: 604 },
		showTribes: false, stackedTribes: false, tribeX: 0, tribeY: 0, tribeGap: 0, tribeWidth: 0, tribeSize: 0,
		description: { x: 270, top: 454, bottom: 580, width: 238, size: 30,
			color: data.finish === '金卡' ? '#ddd' : '#211b15' },
	};
	if (data.finish === '钻石卡') return {
		title: { x: 271, y: 408, width: 294, size: 32, stroke: 6 }, numberSize: 90,
		cost: { x: 112, y: 133 }, attack: { x: 122, y: 584 }, health: { x: 415, y: 584 },
		showTribes: true, stackedTribes: data.tribes.length === 2, tribeX: 270, tribeY: 603,
		tribeGap: 23, tribeWidth: 155, tribeSize: 27,
		description: { x: 270, top: 468, bottom: data.tribes.length ? 574 : 580, width: 252, size: 27, color: '#211b15' },
	};
	if (data.finish === '异画') return {
		title: { x: 273, y: data.description ? 413 : 573, width: 270, size: 24, stroke: 5 }, numberSize: 90,
		cost: { x: 112, y: 116 }, attack: { x: 120, y: 605 }, health: { x: 447, y: 606 },
		showTribes: Boolean(data.description), stackedTribes: false, tribeX: 273, tribeY: 586,
		tribeGap: 0, tribeWidth: 230, tribeSize: 23,
		description: { x: 274, top: 465, bottom: 528, width: 290, size: 24, color: '#f3f0e9' },
	};
	return {
		title: standardTitle(data.title), numberSize: 96,
		cost: { x: 112, y: 133 },
		attack: { x: 119, y: 603 }, health: { x: 430, y: 604 },
		showTribes: true, stackedTribes: data.tribes.length === 2, tribeX: 270, tribeY: 615,
		tribeGap: 23, tribeWidth: 180, tribeSize: 29,
		description: { x: 270.5, top: 445, bottom: 593, width: 281, size: 30.5,
			color: data.finish === '金卡' ? '#ddd' : '#211b15', leadingRatio: 26.8 / 23.88 },
	};
}

/** Rasterize on content, font or resolution changes only; hover never lays out text. */
export class MinionTextRenderer {
	readonly element: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private signature = '';
	private resolution = 512;
	private active = false;
	private data: MinionData | null = null;
	constructor(document: Document) {
		this.element = document.createElement('canvas'); this.element.className = 'mbv-hs-text';
		this.element.width = this.element.height = 1; this.element.setAttribute('aria-hidden', 'true');
		const context = this.element.getContext('2d'); if (!context) throw new Error('无法创建卡牌文字画布.'); this.context = context;
	}
	setWidth(pixels: number): void {
		const next = Math.min(1536, Math.max(256, Math.ceil(pixels / 128) * 128));
		if (next === this.resolution) return;
		this.resolution = next; this.invalidate(); if (this.data) this.update(this.data);
	}
	resume(): void { this.active = true; if (this.data) this.update(this.data); }
	suspend(): void { this.active = false; this.element.width = this.element.height = 1; this.invalidate(); }
	invalidate(): void { this.signature = ''; }
	update(data: MinionData): void {
		this.data = data; if (!this.active) return;
		const signature = JSON.stringify([this.resolution, data.title, data.description, data.cardType, data.finish,
			data.costType, data.cost, data.attack, data.health, data.heroStat, data.tribes]);
		if (signature === this.signature) return; this.signature = signature;
		this.element.width = this.resolution;
		this.element.height = Math.round(this.resolution * HEARTHSTONE_CARD_HEIGHT / HEARTHSTONE_CARD_WIDTH);
		const ctx = this.context;
		ctx.setTransform(this.resolution / HEARTHSTONE_CARD_WIDTH, 0, 0, this.element.height / HEARTHSTONE_CARD_HEIGHT, 0, 0);
		ctx.lineJoin = 'round'; ctx.textBaseline = 'alphabetic';
		const layout = textLayout(data);
		const titleFont = layout.title.font ?? HEARTHSTONE_FONTS.title;
		const title = layout.title.spaced
			? this.fitSpaced(data.title, layout.title.size, layout.title.width, titleFont, layout.title.spacing ?? 1)
			: this.fit(data.title, layout.title.size, layout.title.width, titleFont, false);
		this.element.dataset.title = data.title; this.element.dataset.titleOverflow = String(title.text !== data.title);
		if (layout.title.curve) this.drawWarpedTitle(title.text, title.size, layout.title.stroke,
			layout.title.sourceBaseline ?? 40.6053, layout.title.curve, titleFont, Boolean(layout.title.spaced), layout.title.spacing ?? 1);
		else {
			ctx.save(); ctx.translate(layout.title.x, layout.title.y);
			if (layout.title.spaced) this.drawSpacedLabel(ctx, title.text, 0, 0, title.size, titleFont, layout.title.stroke, '#f0f0f0', layout.title.spacing ?? 1);
			else this.drawLabel(title.text, 0, 0, title.size, titleFont, false, layout.title.stroke, '#f0f0f0');
			ctx.restore();
		}
		const number = (text: string, x: number, y: number): void => {
			if (!text) return;
			const label = this.fit(text, layout.numberSize, 91, HEARTHSTONE_FONTS.number, true);
			const metrics = this.measure(label.text, label.size, HEARTHSTONE_FONTS.number, true);
			this.drawLabel(label.text, x, y + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2, label.size, HEARTHSTONE_FONTS.number, true, 8, '#fff');
		};
		if (data.cardType === '酒馆战棋-随从' || data.cardType === '酒馆战棋-法术') number(data.cost, 110, 255);
		else number(data.cost, layout.cost.x, layout.cost.y);
		if (isHeroCard(data)) number(data.heroStat, layout.health.x, layout.health.y);
		else if (cardKind(data) === '地标') number(data.health, layout.health.x, layout.health.y);
		else if (cardKind(data) !== '法术') { number(data.attack, layout.attack.x, layout.attack.y); number(data.health, layout.health.x, layout.health.y); }
		const tribe = (text: string, x: number, y: number, width: number): void => {
			const label = this.fit(text, layout.tribeSize, width, HEARTHSTONE_FONTS.title, false);
			this.drawLabel(label.text, x, y, label.size, HEARTHSTONE_FONTS.title, false, 4, '#f6f1eb');
		};
		if (layout.showTribes && data.tribes.length === 2 && layout.stackedTribes) {
			data.tribes.forEach((text, index) => tribe(text, layout.tribeX, layout.tribeY + index * layout.tribeGap, layout.tribeWidth));
		} else if (layout.showTribes && data.tribes.length) tribe(data.tribes.join(' / '), layout.tribeX, layout.tribeY, layout.tribeWidth);
		if (!data.description) { this.element.dataset.descriptionOverflow = 'false'; return; }
		const description = layoutDescription(data.description, layout.description.width, layout.description.bottom - layout.description.top,
			(text, size, bold, italic) => this.measure(text, size, HEARTHSTONE_FONTS.description, bold, italic).width,
			layout.description.size, layout.description.leadingRatio);
		this.element.dataset.descriptionOverflow = String(description.overflow);
		const firstY = layout.description.top + (layout.description.bottom - layout.description.top - description.lines.length * description.leading) / 2 + description.size * 0.85;
		ctx.fillStyle = layout.description.color; ctx.textAlign = 'left';
		description.lines.forEach((line, index) => {
			let x = layout.description.x - line.width / 2;
			for (const token of line.tokens) { const metrics = this.measure(token.text, description.size, HEARTHSTONE_FONTS.description, token.bold, token.italic); ctx.fillText(token.text, x, firstY + index * description.leading); x += metrics.width; }
		});
	}
	prepareHtmlExport(): void {
		const image = this.element.ownerDocument.createElement('img'); image.className = 'mbv-hs-text'; image.alt = '';
		image.src = this.element.toDataURL('image/png'); this.element.replaceWith(image); this.suspend();
	}
	private measure(text: string, size: number, family: string, bold = false, italic = false): TextMetrics {
		this.context.font = `${italic ? 'italic' : 'normal'} ${bold ? 700 : 400} ${size}px ${family}`; return this.context.measureText(text);
	}
	private fit(text: string, maximum: number, width: number, font: string, bold: boolean): { text: string; size: number } {
		const chars = Array.from(text).slice(0, 500); let label = chars.join('');
		const size = Math.max(10, Math.min(maximum, maximum * width / Math.max(1, this.measure(label, maximum, font, bold).width)));
		if (label === text && this.measure(label, size, font, bold).width <= width) return { text, size };
		while (chars.length && this.measure(chars.join('') + '…', size, font, bold).width > width) chars.pop();
		label = chars.join('') + '…'; return { text: label, size };
	}
	private fitSpaced(text: string, maximum: number, width: number, font: string, spacing: number): { text: string; size: number } {
		const chars = Array.from(text).slice(0, 500);
		const measured = this.spacedWidth(chars, maximum, font, spacing);
		const size = Math.max(10, Math.min(maximum, maximum * width / Math.max(1, measured)));
		if (chars.length === Array.from(text).length && this.spacedWidth(chars, size, font, spacing) <= width) return { text, size };
		while (chars.length && this.spacedWidth([...chars, '…'], size, font, spacing) > width) chars.pop();
		return { text: chars.join('') + '…', size };
	}
	private drawLabel(text: string, x: number, y: number, size: number, font: string, bold: boolean, stroke: number, color: string): void {
		this.measure(text, size, font, bold); this.context.textAlign = 'center'; this.context.strokeStyle = '#000';
		this.context.lineWidth = stroke; this.context.strokeText(text, x, y); this.context.fillStyle = color; this.context.fillText(text, x, y);
	}
	private drawSpacedLabel(context: CanvasRenderingContext2D, text: string, x: number, y: number,
		size: number, font: string, stroke: number, color: string, spacing: number): void {
		const chars = Array.from(text);
		const advances = chars.map((character) => this.titleAdvance(character, size, font, spacing));
		let cursor = x - advances.reduce((sum, value) => sum + value, 0) / 2;
		context.font = `normal 400 ${size}px ${font}`;
		context.textAlign = 'center'; context.strokeStyle = '#000'; context.lineWidth = stroke; context.fillStyle = color;
		chars.forEach((character, index) => {
			const advance = advances[index] ?? size;
			const center = cursor + advance / 2;
			context.strokeText(character, center, y); context.fillText(character, center, y); cursor += advance;
		});
	}
	private spacedWidth(chars: readonly string[], size: number, font: string, spacing: number): number {
		return chars.reduce((sum, character) => sum + this.titleAdvance(character, size, font, spacing), 0);
	}
	private titleAdvance(character: string, size: number, font: string, spacing: number): number {
		if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]$/u.test(character)) return size * spacing;
		return this.measure(character, size, font).width * spacing;
	}
	private drawWarpedTitle(text: string, size: number, stroke: number, baseline: number,
		curve: 'minion' | 'hero' | 'spell' | 'location', font: string, spaced: boolean, spacing: number): void {
		const scale = 2, width = curve === 'location' ? 370 : 354, height = 50;
		const hero = curve === 'hero';
		const spell = curve === 'spell';
		const location = curve === 'location';
		const sourceCenter = location ? 185.1948 : 177.1948;
		const targetTop = hero ? 340 : location ? 345 : 330;
		const targetHeight = hero ? 70 : location ? 70 : 90;
		const canvas = this.element.ownerDocument.createElement('canvas'); canvas.width = width * scale; canvas.height = height * scale;
		const warped = this.element.ownerDocument.createElement('canvas'); warped.width = HEARTHSTONE_CARD_WIDTH * scale; warped.height = targetHeight * scale;
		const context = canvas.getContext('2d'), warpedContext = warped.getContext('2d'); if (!context || !warpedContext) return;
		context.setTransform(scale, 0, 0, scale, 0, 0); context.lineJoin = 'round'; context.textBaseline = 'alphabetic'; context.textAlign = 'center';
		context.font = `normal 400 ${size}px ${font}`;
		if (spaced) {
			const verticalScale = spell ? 1.1 : location ? 0.95 : 1;
			const verticalShift = spell ? 2 : location ? 0.5 : 0;
			context.save(); context.translate(0, baseline + verticalShift); context.scale(1, verticalScale);
			this.drawSpacedLabel(context, text, sourceCenter, 0, size, font, stroke, '#f0f0f0', spacing); context.restore();
		}
		else {
			context.strokeStyle = '#000'; context.lineWidth = stroke; context.strokeText(text, sourceCenter, baseline);
			context.fillStyle = '#f0f0f0'; context.fillText(text, sourceCenter, baseline);
		}
		warpedContext.setTransform(scale, 0, 0, scale, 0, -targetTop * scale);
		for (let sourceX = 0; sourceX < width; sourceX++) {
			const xScale = hero ? 0.943 : location ? 326 / 370 : spell ? 329 / 354 : 0.957;
			const centerX = hero ? 273 : location ? 116 + sourceCenter * xScale : spell ? 110 + sourceCenter * xScale : 270;
			const targetX = centerX + (sourceX - sourceCenter) * xScale;
			const halfWidth = hero ? 132 : location ? 163 : spell ? 164.5 : 155;
			const t = Math.max(-1, Math.min(1, (targetX - centerX) / halfWidth));
			const targetBaseline = hero ? 379.5 + 24.5 * t * t
				: location ? 401 - 18 * t * t
					: spell ? 375.5 + 18.5 * t * t : 390.1 + 10.2 * t * t - 14 * t;
			warpedContext.drawImage(canvas, sourceX * scale, 0, scale, height * scale,
				targetX, targetBaseline - baseline, 1.3, height);
		}
		this.context.drawImage(warped, 0, 0, warped.width, warped.height, 0, targetTop, HEARTHSTONE_CARD_WIDTH, targetHeight);
		canvas.width = canvas.height = warped.width = warped.height = 1;
	}
}

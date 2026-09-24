import { HEARTHSTONE_FONTS } from './hearthstone-fonts';
import { HEARTHSTONE_CARD_HEIGHT, HEARTHSTONE_CARD_WIDTH } from './hearthstone-layout';
import type { MinionData } from './hearthstone-model';
import { layoutDescription } from './hearthstone-text';

export class HearthstoneHeroPowerTextRenderer {
	readonly element: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private data: MinionData | null = null;
	private signature = '';
	private active = false;

	constructor(document: Document) {
		this.element = document.createElement('canvas');
		this.element.className = 'mbv-hs-hero-power-text';
		this.element.dataset.nameFont = HEARTHSTONE_FONTS.skillTitle;
		this.element.dataset.descriptionFont = HEARTHSTONE_FONTS.skillDescription;
		this.element.dataset.costFont = HEARTHSTONE_FONTS.skillTitle;
		this.element.width = this.element.height = 1;
		const context = this.element.getContext('2d');
		if (!context) throw new Error('无法创建技能文字画布.');
		this.context = context;
	}

	update(card: MinionData): void {
		const data = card.skill;
		this.data = card;
		this.element.setText([data.cost, data.name, data.description].filter(Boolean).join('. '));
		this.element.dataset.cost = data.cost;
		this.element.dataset.name = data.name;
		this.element.dataset.description = data.description;
		if (!this.active) return;
		const battleground = card.cardType.startsWith('酒馆战棋-');
		const signature = JSON.stringify([battleground, data.cost, data.name, data.description]);
		if (signature === this.signature) return;
		this.signature = signature;
		const resolution = 768;
		this.element.width = resolution;
		this.element.height = Math.round(resolution * HEARTHSTONE_CARD_HEIGHT / HEARTHSTONE_CARD_WIDTH);
		const context = this.context;
		context.setTransform(resolution / HEARTHSTONE_CARD_WIDTH, 0, 0,
			this.element.height / HEARTHSTONE_CARD_HEIGHT, 0, 0);
		context.lineJoin = 'round';
		context.textBaseline = 'alphabetic';
		if (battleground) {
			this.drawLabel(data.cost, 273, 161, 106.67, 100, HEARTHSTONE_FONTS.skillTitle, 8, '#fff');
			this.drawLabel(data.name, 266, 428, 38.27, 250, HEARTHSTONE_FONTS.skillTitle, 4, '#e6e6e6');
			this.drawDescription(data.description, { x: 137, y: 466, width: 264, height: 94, size: 26.9 });
		} else {
			this.drawLabel(data.cost, 267.335, 143.581, 92.42, 100, HEARTHSTONE_FONTS.skillTitle, 8, '#fff');
			this.drawLabel(data.name, 275.47, 369.815, 30.72, 240, HEARTHSTONE_FONTS.skillTitle, 4, '#e6e6e6');
			this.drawDescription(data.description, { x: 146, y: 448, width: 240, height: 98, size: 30.13334 });
		}
	}

	resume(): void {
		this.active = true;
		if (this.data) this.update(this.data);
	}

	suspend(): void {
		this.active = false;
		this.signature = '';
		this.element.width = this.element.height = 1;
	}

	prepareHtmlExport(): void {
		if (!this.active || !this.element.isConnected) return;
		const image = this.element.ownerDocument.createElement('img');
		image.className = this.element.className;
		image.alt = '';
		for (const [key, value] of Object.entries(this.element.dataset)) image.dataset[key] = value;
		image.src = this.element.toDataURL('image/png');
		this.element.replaceWith(image);
		this.suspend();
	}

	private drawDescription(text: string, box: { x: number; y: number; width: number; height: number; size: number }): void {
		if (!text) return;
		const context = this.context;
		const layout = layoutDescription(text, box.width, box.height,
			(value, size, bold, italic) => this.measure(value, size, HEARTHSTONE_FONTS.skillDescription, bold, italic).width, box.size);
		const firstY = box.y + (box.height - layout.lines.length * layout.leading) / 2 + layout.size * 0.85;
		context.fillStyle = '#211b15';
		context.textAlign = 'left';
		layout.lines.forEach((line, index) => {
			let x = box.x + (box.width - line.width) / 2;
			for (const token of line.tokens) {
				const metrics = this.measure(token.text, layout.size, HEARTHSTONE_FONTS.skillDescription, token.bold, token.italic);
				context.fillText(token.text, x, firstY + index * layout.leading);
				x += metrics.width;
			}
		});
	}

	private drawLabel(text: string, x: number, y: number, maximum: number, width: number,
		font: string, stroke: number, color: string): void {
		if (!text) return;
		const size = Math.max(12, Math.min(maximum,
			maximum * width / Math.max(1, this.measure(text, maximum, font).width)));
		const context = this.context;
		context.font = `normal 400 ${size}px ${font}`;
		context.textAlign = 'center';
		context.strokeStyle = '#000';
		context.lineWidth = stroke;
		context.strokeText(text, x, y);
		context.fillStyle = color;
		context.fillText(text, x, y);
	}

	private measure(text: string, size: number, font: string, bold = false, italic = false): TextMetrics {
		this.context.font = `${italic ? 'italic' : 'normal'} ${bold ? 700 : 400} ${size}px ${font}`;
		return this.context.measureText(text);
	}
}

import type { App, TFile } from 'obsidian';
import { ImageResourceCache } from '../../services/image-resource';
import { resolveImageTextSource } from '../../ui/image-source';
import { FrameWorkQueue } from '../../ui/frame-work-queue';
import { isSkillCard, readArtworkPosition, readMinionData, valueText, type ArtworkPosition } from './hearthstone-model';
import { MinionScene, type MinionArtwork } from './hearthstone-scene';
import type { HearthstoneAssets } from './hearthstone-template';
import { HearthstoneHeroPowerView } from './hearthstone-hero-power-view';

export class MinionPropertyPreview {
	readonly element: HTMLElement;
	readonly surface: HTMLElement;
	private readonly cache = new ImageResourceCache();
	private readonly queue: FrameWorkQueue;
	private readonly scene: MinionScene;
	private readonly skillView: HearthstoneHeroPowerView;
	private skillCard = false;
	private artwork: MinionArtwork = { source: '', position: readArtworkPosition(null) };
	constructor(parent: HTMLElement, private readonly app: App, private readonly file: TFile,
		private readonly assets: HearthstoneAssets, private readonly fallbackTitle?: string) {
		const ownerWindow = parent.ownerDocument.defaultView ?? window;
		this.queue = new FrameWorkQueue(ownerWindow);
		this.element = parent.createDiv('mbv-hs-property-preview-card');
		this.scene = new MinionScene(parent.ownerDocument, this.cache, this.queue);
		this.element.append(this.scene.element);
		this.skillView = new HearthstoneHeroPowerView(this.element);
		this.skillView.element.addClass('is-property-preview', 'is-card-skill');
		this.surface = this.element.createDiv('mbv-hs-property-preview-hit-area');
		this.scene.setWidth(720 * (ownerWindow.devicePixelRatio || 1)); this.scene.resume();
	}
	update(input: Record<string, unknown>): void {
		const artwork = firstValue(input.artwork);
		this.artwork = {
			source: resolveImageTextSource(this.app, artwork, this.file) ?? '',
			position: readArtworkPosition(input.artworkPosition),
		};
		const data = readMinionData(input, this.fallbackTitle);
		this.skillCard = isSkillCard(data);
		this.element.classList.toggle('has-artwork', Boolean(this.artwork.source));
		this.element.classList.toggle('is-skill-card', this.skillCard);
		this.skillView.element.classList.toggle('has-artwork', Boolean(this.artwork.source));
		this.skillView.element.hidden = !this.skillCard;
		if (this.skillCard) {
			this.scene.suspend(); this.scene.element.hidden = true;
			this.skillView.update(data, this.artwork.source);
			this.skillView.ensureSources(this.assets);
		} else {
			this.skillView.releaseSources();
			this.scene.element.hidden = false; this.scene.resume();
			this.scene.update(data, this.artwork, this.assets);
		}
	}
	setPosition(position: ArtworkPosition): void {
		this.artwork = { ...this.artwork, position };
		if (this.skillCard) this.skillView.setPosition(position); else this.scene.updatePosition(this.artwork);
	}
	destroy(): void { this.skillView.releaseSources(); this.scene.suspend(); this.cache.destroy(); this.queue.destroy(); }
}

function firstValue(value: unknown): string { return valueText(Array.isArray(value) ? value[0] : value); }

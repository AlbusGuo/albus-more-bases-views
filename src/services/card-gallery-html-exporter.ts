import {
	ButtonComponent,
	Modal,
	Notice,
	ProgressBarComponent,
	type App,
	type BasesEntry,
} from 'obsidian';
import type { ViewportGridGroup } from '../ui/viewport-grid';
import { readAsDataUrl } from './image-resource';

type ExportCardController = {
	element: HTMLElement;
	prepareHtmlExport?: () => Promise<void>;
	setHtmlExportItemWidth?: (width: number) => void;
	destroy?: () => void;
};

export interface ExportableCardGalleryView {
	type: string;
	config: { name: string };
	htmlExportContainer: HTMLElement;
	htmlExportGrid: HTMLElement;
	htmlExportGroups: readonly ViewportGridGroup<BasesEntry>[];
	htmlExportMinimumItemWidth: number;
	htmlExportColumnGap: number;
	prepareHtmlExportData?(): void;
	createHtmlExportCard(entry: BasesEntry): ExportCardController;
	prepareHtmlExportRoot?(root: HTMLElement): Promise<void> | void;
}

const EXPORT_WIDTH = 1440;
const RESOURCE_CONCURRENCY = 6;
const CARD_PREPARE_CONCURRENCY = 4;
const DOM_BATCH_SIZE = 24;

interface ExportProgress {
	stage: string;
	value: number;
}

class HtmlExportCancelledError extends Error {}

class HtmlExportProgressModal extends Modal {
	private progressBar: ProgressBarComponent | null = null;
	private statusEl: HTMLElement | null = null;
	private closedByExporter = false;
	private cancelled = false;

	constructor(app: App) {
		super(app);
		this.setTitle('正在导出 HTML');
	}

	onOpen(): void {
		this.modalEl.addClass('mbv-html-export-progress-modal');
		this.contentEl.empty();
		this.statusEl = this.contentEl.createDiv({
			cls: 'mbv-html-export-progress-status',
			text: '正在准备视图...',
		});
		this.progressBar = new ProgressBarComponent(this.contentEl.createDiv(
			'mbv-html-export-progress-bar',
		)).setValue(0);
		const actionsEl = this.contentEl.createDiv('mbv-html-export-progress-actions');
		new ButtonComponent(actionsEl)
			.setButtonText('取消导出')
			.onClick(() => {
				this.cancelled = true;
				this.statusEl?.setText('正在取消...');
			});
	}

	onClose(): void {
		if (!this.closedByExporter) this.cancelled = true;
		this.progressBar = null;
		this.statusEl = null;
	}

	update(progress: ExportProgress): void {
		this.statusEl?.setText(progress.stage);
		this.progressBar?.setValue(Math.clamp(progress.value, 0, 100));
	}

	throwIfCancelled(): void {
		if (this.cancelled) throw new HtmlExportCancelledError();
	}

	finish(): void {
		this.closedByExporter = true;
		this.close();
	}
}

export class CardGalleryHtmlExporter {
	private readonly exportingViews = new WeakSet<ExportableCardGalleryView>();

	constructor(
		private readonly app: App,
		private readonly readStylesheet: () => Promise<string>,
	) {}

	async export(view: ExportableCardGalleryView): Promise<void> {
		if (this.exportingViews.has(view)) return;
		this.exportingViews.add(view);
		const progressModal = new HtmlExportProgressModal(this.app);
		progressModal.open();
		try {
			const html = await this.createHtml(view, (progress) => {
				progressModal.throwIfCancelled();
				progressModal.update(progress);
			});
			progressModal.throwIfCancelled();
			progressModal.update({ stage: '正在生成下载文件...', value: 98 });
			await yieldToMainThread(view.htmlExportContainer.ownerDocument);
			downloadHtml(view.htmlExportContainer.ownerDocument, html, createFileName(view));
			new Notice('HTML 导出完成.');
		} catch (error) {
			if (error instanceof HtmlExportCancelledError) {
				new Notice('已取消 HTML 导出.');
				return;
			}
			console.error('[More Bases Views] HTML 导出失败', error);
			new Notice(`HTML 导出失败: ${getErrorMessage(error)}`);
		} finally {
			progressModal.finish();
			this.exportingViews.delete(view);
		}
	}

	private async createHtml(
		view: ExportableCardGalleryView,
		onProgress: (progress: ExportProgress) => void,
	): Promise<string> {
		view.prepareHtmlExportData?.();
		const ownerDocument = view.htmlExportContainer.ownerDocument;
		onProgress({ stage: '正在准备导出环境...', value: 2 });
		await yieldToMainThread(ownerDocument);
		const iframe = ownerDocument.createElement('iframe');
		iframe.className = 'mbv-card-gallery-export-stage';
		iframe.setAttribute('aria-hidden', 'true');
		ownerDocument.body.append(iframe);
		const exportDocument = iframe.contentDocument;
		if (!exportDocument) {
			iframe.remove();
			throw new Error('无法创建导出文档.');
		}

		const controllers: ExportCardController[] = [];
		try {
			const pluginCss = await this.readPluginStylesheet();
			initializeDocument(exportDocument, ownerDocument, pluginCss, view.config.name);
			const exportRoot = exportDocument.createElement('main');
			exportRoot.className = `${view.htmlExportContainer.className} mbv-html-export-view`;
			copyInlineStyle(view.htmlExportContainer, exportRoot);
			exportDocument.body.append(exportRoot);

			for (const child of Array.from(view.htmlExportContainer.children)) {
				if (child === view.htmlExportGrid) continue;
				exportRoot.append(child.cloneNode(true));
			}
			await view.prepareHtmlExportRoot?.(exportRoot);
			onProgress({ stage: '正在创建卡片...', value: 8 });

			const gridEl = exportDocument.createElement('div');
			gridEl.className = `${view.htmlExportGrid.className} mbv-html-export-grid`;
			copyInlineStyle(view.htmlExportGrid, gridEl);
			exportRoot.append(gridEl);
			const gridWidth = gridEl.clientWidth || EXPORT_WIDTH;
			const columns = Math.max(1, Math.floor(
				(gridWidth + view.htmlExportColumnGap) /
				(view.htmlExportMinimumItemWidth + view.htmlExportColumnGap),
			));
			const itemWidth = Math.max(
				1,
				(gridWidth - view.htmlExportColumnGap * (columns - 1)) / columns,
			);
			gridEl.style.setProperty('--mbv-viewport-grid-columns', String(columns));
			gridEl.dataset.mbvMinimumItemWidth = String(view.htmlExportMinimumItemWidth);
			gridEl.dataset.mbvColumnGap = String(view.htmlExportColumnGap);

			const totalCards = view.htmlExportGroups.reduce(
				(total, group) => total + group.items.length,
				0,
			);
			let createdCards = 0;
			for (const group of view.htmlExportGroups) {
				if (group.showHeader) gridEl.append(createGroupHeader(exportDocument, group));
				for (const entry of group.items) {
					const controller = view.createHtmlExportCard(entry);
					controllers.push(controller);
					controller.setHtmlExportItemWidth?.(itemWidth);
					const slotEl = exportDocument.createElement('div');
					slotEl.className = `mbv-viewport-grid-slot ${getSlotClass(view.htmlExportGrid)}`.trim();
					slotEl.append(exportDocument.adoptNode(controller.element));
					gridEl.append(slotEl);
					createdCards += 1;
					if (createdCards % DOM_BATCH_SIZE === 0) {
						onProgress({
							stage: `正在创建卡片 (${createdCards}/${totalCards})...`,
							value: 8 + 32 * createdCards / Math.max(1, totalCards),
						});
						await yieldToMainThread(exportDocument);
					}
				}
			}

			onProgress({ stage: '正在加载卡片内容...', value: 42 });
			await prepareExportControllers(controllers, (completed, total) => {
				onProgress({
					stage: `正在加载卡片内容 (${completed}/${total})...`,
					value: 42 + 11 * completed / Math.max(1, total),
				});
			});
			await settleDocument(exportDocument);
			prepareReadOnlyDom(exportDocument);
			onProgress({ stage: '正在整理图片资源...', value: 55 });
			await inlineDocumentResources(exportDocument, (completed, total) => {
				onProgress({
					stage: `正在整理图片资源 (${completed}/${total})...`,
					value: 55 + 35 * completed / Math.max(1, total),
				});
			});
			await settleDocument(exportDocument);
			onProgress({ stage: '正在生成 HTML 文档...', value: 92 });
			await yieldToMainThread(exportDocument);
			const documentHtml = exportDocument.documentElement.outerHTML;
			const script = `<script>${createExportRuntime().replace(/<\/script/gi, '<\\/script')}</script>`;
			return '<!doctype html>\n' + documentHtml.replace('</body>', `${script}</body>`);
		} finally {
			for (const controller of controllers) controller.destroy?.();
			iframe.remove();
		}
	}

	private async readPluginStylesheet(): Promise<string> {
		try {
			return await this.readStylesheet();
		} catch {
			return '';
		}
	}
}

async function prepareExportControllers(
	controllers: readonly ExportCardController[],
	onProgress: (completed: number, total: number) => void,
): Promise<void> {
	let cursor = 0;
	let completed = 0;
	onProgress(0, controllers.length);
	const workers = Array.from({
		length: Math.min(CARD_PREPARE_CONCURRENCY, controllers.length),
	}, async () => {
		while (cursor < controllers.length) {
			const controller = controllers[cursor++];
			if (!controller) continue;
			await controller.prepareHtmlExport?.();
			completed += 1;
			onProgress(completed, controllers.length);
		}
	});
	await Promise.all(workers);
}

function initializeDocument(
	target: Document,
	source: Document,
	pluginCss: string,
	title: string,
): void {
	target.documentElement.lang = 'zh-CN';
	target.title = title || 'More Bases Views';
	target.documentElement.className = source.documentElement.className;
	target.body.className = `${source.body.className} mbv-html-export-body`;
	const styleEl = target.createElement('style');
	styleEl.textContent = `
:root { ${collectThemeVariables(source)} }
${pluginCss}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body { background: var(--background-primary); color: var(--text-normal); }
button, input, textarea { font: inherit; }
.clickable-icon { display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: inherit; }
.mbv-html-export-view { min-height: 100vh !important; }
.mbv-html-export-grid { --mbv-viewport-grid-spacer-height: 0px; }
.mbv-html-export-view [data-mbv-export-remove] { display: none !important; }
.mbv-html-export-view a { color: inherit; }
.mbv-html-export-view [role='link'], .mbv-html-export-view a { cursor: default !important; }
.mbv-html-export-view .mbv-project-task-completed-list { max-height: none; overflow: visible; }
.mbv-html-export-view .mbv-operator-export-data { display: none !important; }
.mbv-html-export-view .mbv-project-task-completed-toggle[aria-expanded='false'] .mbv-project-task-completed-icon { transform: rotate(-90deg); }
.mbv-html-export-view .mbv-book-cover-native-value > p,
.mbv-html-export-view .mbv-book-cover-native-value > span,
.mbv-html-export-view .mbv-book-cover-native-value > a,
.mbv-html-export-view .image-embed,
.mbv-html-export-view .internal-embed,
.mbv-html-export-view .media-embed {
	margin: 0 !important;
	padding: 0 !important;
}
.mbv-html-export-modal-container { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 14px; }
.mbv-html-export-modal-bg { position: absolute; inset: 0; background: rgb(0 0 0 / 58%); backdrop-filter: blur(3px); }
.mbv-html-export-modal { position: relative; z-index: 1; }
.mbv-operator-export-assets { display: none !important; }
`;
	target.head.append(styleEl);
}

function collectThemeVariables(source: Document): string {
	const styles = source.defaultView?.getComputedStyle(source.body);
	if (!styles) return '';
	const values: string[] = [];
	for (const name of Array.from(styles)) {
		if (!name.startsWith('--')) continue;
		const value = styles.getPropertyValue(name).trim();
		if (value) values.push(`${name}:${value};`);
	}
	return values.join('');
}

function createGroupHeader(
	document: Document,
	group: ViewportGridGroup<BasesEntry>,
): HTMLElement {
	const headerEl = document.createElement('div');
	headerEl.className = 'mbv-viewport-grid-group-header';
	const labelEl = document.createElement('span');
	labelEl.className = 'mbv-viewport-grid-group-label';
	labelEl.textContent = group.label;
	const countEl = document.createElement('span');
	countEl.className = 'mbv-viewport-grid-group-count';
	countEl.textContent = `${group.items.length} 项`;
	headerEl.append(labelEl, countEl);
	return headerEl;
}

function getSlotClass(gridEl: HTMLElement): string {
	const className = Array.from(gridEl.classList).find((name) => name.endsWith('-grid'));
	return className ? className.replace(/-grid$/, '-slot') : '';
}

function copyInlineStyle(source: HTMLElement, target: HTMLElement): void {
	const style = source.getAttribute('style');
	if (style) target.setAttribute('style', style);
}

async function settleDocument(document: Document): Promise<void> {
	await Promise.all(Array.from(document.images).map(async (image) => {
		if (!image.complete) {
			await new Promise<void>((resolve) => {
				image.addEventListener('load', () => resolve(), { once: true });
				image.addEventListener('error', () => resolve(), { once: true });
			});
		}
		try { await image.decode(); } catch { /* 保留无法解码的占位状态. */ }
	}));
	try { await document.fonts.ready; } catch { /* 使用当前可用字体继续布局. */ }
	const ownerWindow = document.defaultView;
	if (!ownerWindow) return;
	await new Promise<void>((resolve) => ownerWindow.requestAnimationFrame(() => resolve()));
	await new Promise<void>((resolve) => ownerWindow.requestAnimationFrame(() => resolve()));
}

async function yieldToMainThread(document: Document): Promise<void> {
	const ownerWindow = document.defaultView;
	if (!ownerWindow) return;
	await new Promise<void>((resolve) => ownerWindow.setTimeout(resolve, 0));
}

function prepareReadOnlyDom(document: Document): void {
	for (const toggleEl of Array.from(
		document.querySelectorAll<HTMLButtonElement>('.mbv-project-task-completed-toggle'),
	)) {
		if (toggleEl.getAttribute('aria-expanded') !== 'true') toggleEl.click();
	}
	for (const element of Array.from(document.querySelectorAll<HTMLElement>('[contenteditable]'))) {
		element.removeAttribute('contenteditable');
	}
	for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a'))) {
		anchor.removeAttribute('href');
		anchor.removeAttribute('target');
		anchor.removeAttribute('rel');
	}
	for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input'))) {
		input.disabled = true;
	}
	for (const element of Array.from(document.querySelectorAll<HTMLElement>([
		'.mbv-book-action', '.mbv-paper-action', '.mbv-project-github-link',
		'.mbv-project-task-delete', '.mbv-project-task-add-host',
		'.mbv-operator-potential-toggle',
	].join(',')))) element.dataset.mbvExportRemove = 'true';
	for (const element of Array.from(document.querySelectorAll<HTMLElement>([
		'.mbv-media-slider', '.mbv-movie-rating-button', '.mbv-game-rating-track',
		'.mbv-project-status-toggle',
	].join(',')))) {
		element.setAttribute('aria-disabled', 'true');
		element.tabIndex = -1;
	}
}

async function inlineDocumentResources(
	document: Document,
	onProgress: (completed: number, total: number) => void,
): Promise<void> {
	const cache = new Map<string, Promise<string | null>>();
	const resolve = (source: string): Promise<string | null> => {
		const existing = cache.get(source);
		if (existing) return existing;
		const pending = readAsDataUrl(source);
		cache.set(source, pending);
		return pending;
	};
	const tasks: Array<() => Promise<string[]>> = [];
	for (const image of Array.from(document.querySelectorAll<HTMLImageElement>('img[src]'))) {
		const source = image.getAttribute('src') ?? '';
		if (!source || source.startsWith('data:')) continue;
		tasks.push(async () => {
			const dataUrl = await resolve(source);
			if (dataUrl) {
				image.setAttribute('src', dataUrl);
				return [];
			}
			return [source];
		});
	}
	for (const element of Array.from(document.querySelectorAll<HTMLElement>('[style]'))) {
		for (const property of Array.from(element.style)) {
			const value = element.style.getPropertyValue(property);
			const sources = findCssResourceSources(value);
			if (!sources.length) continue;
			tasks.push(async () => {
				let nextValue = value;
				const failed: string[] = [];
				for (const source of sources) {
					const dataUrl = await resolve(source);
					if (!dataUrl) {
						failed.push(source);
						continue;
					}
					nextValue = replaceCssResourceSource(nextValue, source, dataUrl);
				}
				if (nextValue !== value) {
					element.style.setProperty(
						property,
						nextValue,
						element.style.getPropertyPriority(property),
					);
				}
				return failed;
			});
		}
	}
	let cursor = 0;
	let completed = 0;
	const failedSources = new Set<string>();
	onProgress(0, tasks.length);
	const workers = Array.from({ length: Math.min(RESOURCE_CONCURRENCY, tasks.length) }, async () => {
		while (cursor < tasks.length) {
			const task = tasks[cursor++];
			if (!task) continue;
			for (const source of await task()) failedSources.add(source);
			completed += 1;
			onProgress(completed, tasks.length);
			if (completed % DOM_BATCH_SIZE === 0) await yieldToMainThread(document);
		}
	});
	await Promise.all(workers);
	if (failedSources.size > 0) {
		throw new Error(`有 ${failedSources.size} 个图片资源无法写入导出文件.`);
	}
}

function findCssResourceSources(value: string): string[] {
	const sources = new Set<string>();
	for (const match of value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s][^)]*))\s*\)/gu)) {
		const source = (match[1] ?? match[2] ?? match[3] ?? '').trim();
		if (source && !source.startsWith('data:')) sources.add(source);
	}
	return [...sources];
}

function replaceCssResourceSource(
	value: string,
	source: string,
	dataUrl: string,
): string {
	return value.replaceAll(`url("${source}")`, `url("${dataUrl}")`)
		.replaceAll(`url('${source}')`, `url("${dataUrl}")`)
		.replaceAll(`url(${source})`, `url("${dataUrl}")`);
}

function createFileName(view: ExportableCardGalleryView): string {
	const base = (view.config.name || view.type).replace(/[\\/:*?"<>|]+/g, '-').trim();
	return `${base || '视图'}-${formatTimestamp(new Date())}.html`;
}

function formatTimestamp(date: Date): string {
	const part = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}-` +
		`${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`;
}

function downloadHtml(document: Document, html: string, fileName: string): void {
	const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	document.defaultView?.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) return error.message;
	if (typeof error === 'string' && error.trim()) return error;
	if (typeof error === 'number' || typeof error === 'boolean') return String(error);
	return '未知错误';
}

function createExportRuntime(): string {
	return `(() => {
	const root = document.querySelector('.mbv-html-export-view');
	if (!root) return;
	const operatorCards = Array.from(root.querySelectorAll('.mbv-operator-card'));
	const operatorAsset = (kind) => root.querySelector('.mbv-operator-export-assets img[data-kind="' + kind + '"]')?.src || '';
	let operatorHiddenMode = root.querySelector('.mbv-operator-export-data')?.dataset.hiddenMode === 'true';
	const getOperatorMode = (card, hiddenMode) => card.querySelector('.mbv-operator-export-artworks[data-hidden-mode="' + String(hiddenMode) + '"]');
	const getOperatorArtworks = (card, hiddenMode) => Array.from(getOperatorMode(card, hiddenMode)?.querySelectorAll('.mbv-operator-export-artwork') || []);
	const setOperatorArtwork = (card, artwork, animate) => {
		const layouts = Array.from(card.querySelectorAll('.mbv-operator-artwork-layout'));
		if (layouts.length < 2) return;
		const active = Math.max(0, layouts.findIndex((layout) => layout.classList.contains('is-active')));
		const currentLayout = layouts[active];
		const nextLayout = layouts[active === 0 ? 1 : 0];
		const nextImage = nextLayout?.querySelector('img');
		if (!currentLayout || !nextLayout || !nextImage) return;
		const source = artwork?.src || '';
		if (!source) {
			for (const layout of layouts) layout.classList.add('is-hidden');
			return;
		}
		for (const [property, value] of [
			['--mbv-operator-artwork-size', artwork.dataset.artworkSize],
			['--mbv-operator-artwork-left', artwork.dataset.artworkLeft],
			['--mbv-operator-artwork-top', artwork.dataset.artworkTop],
		]) {
			if (value) nextLayout.style.setProperty(property, value);
		}
		nextImage.src = source;
		nextImage.classList.remove('is-hidden');
		nextLayout.classList.remove('is-hidden');
		const commit = () => {
			nextLayout.classList.add('is-active');
			currentLayout.classList.remove('is-active');
			if (animate) setTimeout(() => currentLayout.classList.add('is-hidden'), 360);
			else currentLayout.classList.add('is-hidden');
		};
		if (animate) requestAnimationFrame(commit); else commit();
	};
	const applyOperatorHiddenMode = (hiddenMode) => {
		operatorHiddenMode = hiddenMode;
		for (const card of operatorCards) {
			const mode = getOperatorMode(card, hiddenMode);
			const artworks = getOperatorArtworks(card, hiddenMode);
			const index = Math.max(0, Math.min(artworks.length - 1, Number(mode?.dataset.currentArtwork || 0)));
			setOperatorArtwork(card, artworks[index] || null, true);
		}
		const button = root.querySelector('.mbv-operator-defense-toggle');
		button?.classList.toggle('is-hidden-mode', hiddenMode);
		button?.setAttribute('aria-pressed', String(hiddenMode));
		const image = button?.querySelector('img');
		if (image) image.src = operatorAsset(hiddenMode ? 'eye-off' : 'eye-on');
	};
	const closeOperatorModal = () => document.querySelector('.mbv-html-export-modal-container')?.remove();
	const openOperatorModal = () => {
		closeOperatorModal();
		const container = document.createElement('div');
		container.className = 'mbv-html-export-modal-container';
		const bg = container.appendChild(document.createElement('div'));
		bg.className = 'mbv-html-export-modal-bg';
		const modal = container.appendChild(document.createElement('div'));
		modal.className = 'mbv-html-export-modal mbv-operator-defense-modal';
		modal.innerHTML = '<div class="modal-content"><div class="mbv-operator-defense-panel">' +
			(operatorAsset('rhodes') ? '<img class="mbv-operator-defense-watermark" alt="" src="' + operatorAsset('rhodes') + '">' : '') +
			'<div class="mbv-operator-defense-header"><div class="mbv-operator-defense-header-icon"><img alt="" src="' + operatorAsset('eye-off') + '"></div><div class="mbv-operator-defense-header-copy"><div class="mbv-operator-defense-header-title">系统警告</div><div class="mbv-operator-defense-header-subtitle">PRTS 系统权限</div></div></div>' +
			'<div class="mbv-operator-defense-body"><div class="mbv-operator-defense-warning">警告: PRTS 系统权限读写中...</div><div class="mbv-operator-defense-sequence">内部序列开始检索, 检索到博士权限.</div><div class="mbv-operator-defense-title">是否确认关闭全舰防御系统?</div><div class="mbv-operator-defense-authority"><div class="mbv-operator-defense-authority-check"><img alt="" src="' + operatorAsset('check') + '"></div><span>博士权限已确认</span></div></div>' +
			'<div class="mbv-operator-defense-actions"><button class="mbv-operator-defense-cancel" type="button"><img alt="" src="' + operatorAsset('back') + '"><span>返回</span></button><button class="mbv-operator-defense-confirm" type="button"><img alt="" src="' + operatorAsset('check') + '"><span>确认关闭</span></button></div></div></div>';
		document.body.append(container);
		bg.addEventListener('click', closeOperatorModal);
		modal.querySelector('.mbv-operator-defense-cancel')?.addEventListener('click', closeOperatorModal);
		modal.querySelector('.mbv-operator-defense-confirm')?.addEventListener('click', () => { applyOperatorHiddenMode(true); closeOperatorModal(); });
		modal.querySelector('.mbv-operator-defense-confirm')?.focus();
	};
	for (const grid of root.querySelectorAll('.mbv-html-export-grid')) {
		const updateColumns = () => {
			const minimum = Number(grid.dataset.mbvMinimumItemWidth || 160);
			const gap = Number(grid.dataset.mbvColumnGap || 0);
			const columns = Math.max(1, Math.floor((grid.clientWidth + gap) / (minimum + gap)));
			grid.style.setProperty('--mbv-viewport-grid-columns', String(columns));
		};
		updateColumns();
		new ResizeObserver(updateColumns).observe(grid);
	}
	for (const card of operatorCards) {
		const store = card.querySelector('.mbv-operator-export-data');
		let modeStore = getOperatorMode(card, operatorHiddenMode);
		let artworks = getOperatorArtworks(card, operatorHiddenMode);
		let artworkIndex = Number(modeStore?.dataset.currentArtwork || 0);
		setOperatorArtwork(card, artworks[artworkIndex] || null, false);
		const switchArtwork = (direction) => {
			modeStore = getOperatorMode(card, operatorHiddenMode);
			artworks = getOperatorArtworks(card, operatorHiddenMode);
			if (artworks.length < 2) return;
			artworkIndex = Number(modeStore?.dataset.currentArtwork || 0);
			artworkIndex = (artworkIndex + direction + artworks.length) % artworks.length;
			if (modeStore) modeStore.dataset.currentArtwork = String(artworkIndex);
			setOperatorArtwork(card, artworks[artworkIndex], true);
		};
		const switcher = card.querySelector('.mbv-operator-artwork-switch');
		switcher?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); switchArtwork(1); });
		switcher?.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); switchArtwork(-1); });
		const frame = card.querySelector('.mbv-operator-frame');
		card.addEventListener('pointermove', (event) => {
			if (!frame || event.pointerType === 'touch') return;
			const rect = frame.getBoundingClientRect();
			const x = Math.max(-12, Math.min(12, event.clientX - rect.left - rect.width / 2));
			const y = Math.max(-12, Math.min(12, event.clientY - rect.top - rect.height / 2));
			frame.style.setProperty('--mbv-operator-tilt-x', String(-y / 1.8) + 'deg');
			frame.style.setProperty('--mbv-operator-tilt-y', String(x) + 'deg');
			frame.style.setProperty('--mbv-operator-art-x', String(Math.round(x / 10)) + 'px');
			frame.style.setProperty('--mbv-operator-art-y', String(Math.round(y / 18)) + 'px');
			frame.style.setProperty('--mbv-operator-logo-x', String(Math.round(x / 10)) + 'px');
			frame.style.setProperty('--mbv-operator-logo-y', String(Math.round(y / 15)) + 'px');
		});
		card.addEventListener('pointerleave', () => {
			if (!frame) return;
			for (const name of ['--mbv-operator-tilt-x','--mbv-operator-tilt-y']) frame.style.setProperty(name, '0deg');
			for (const name of ['--mbv-operator-art-x','--mbv-operator-art-y','--mbv-operator-logo-x','--mbv-operator-logo-y']) frame.style.setProperty(name, '0px');
		});
	}
	const defenseButton = root.querySelector('.mbv-operator-defense-toggle');
	defenseButton?.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (operatorHiddenMode) applyOperatorHiddenMode(false); else openOperatorModal();
	});
	let badgeSequence = 0;
	setInterval(() => {
		badgeSequence += 1;
		for (const card of operatorCards) {
			if (card.matches(':hover,:focus-within')) continue;
			for (const kind of ['profession','faction']) {
				const stored = Array.from(card.querySelectorAll('.mbv-operator-export-' + kind + 's img'));
				if (stored.length < 2) continue;
				const target = card.querySelector('.mbv-operator-' + kind + '-image.is-active') || card.querySelector('.mbv-operator-' + kind + '-image');
				if (!target) continue;
				const source = stored[badgeSequence % stored.length];
				target.src = source.src;
				const frame = card.querySelector('.mbv-operator-frame');
				frame?.style.setProperty('--mbv-operator-' + kind + '-glow', source.dataset.glow || '#b9c2cf');
			}
		}
	}, 3000);
	root.addEventListener('click', (event) => {
		const target = event.target instanceof Element ? event.target : null;
		const completed = target?.closest('.mbv-project-task-completed-toggle');
		if (completed) {
			const list = completed.parentElement?.querySelector('.mbv-project-task-completed-list');
			if (list) {
				const expanded = completed.getAttribute('aria-expanded') !== 'true';
				completed.setAttribute('aria-expanded', String(expanded));
				list.hidden = !expanded;
			}
			return;
		}
		if (target?.closest('a,[role="link"]')) event.preventDefault();
	});
	})();`;
}

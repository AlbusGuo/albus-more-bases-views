import {
	Keymap,
	ListValue,
	Notice,
	NullValue,
	parsePropertyId,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type Value,
} from 'obsidian';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	resolveImageFile,
	resolveImageSource,
	resolveRenderedImageSource,
} from '../../ui/image-source';
import { arrayBufferToDataUrl, readAsDataUrl } from '../../services/image-resource';
import type { OperatorAssetService } from './operator-assets';
import {
	getOperatorArtworkOverscanPercent,
	type OperatorArtworkRasterRequest,
	type OperatorArtworkRasterizer,
} from './operator-artwork-rasterizer';
import type { OperatorViewOptions } from './operator-options';
import { artworkTransform, createArtworkPosition, formatArtworkPosition } from '../shared/artwork-position';
import { bindArtworkPointerEditor } from '../shared/artwork-pointer-editor';
import {
	getOperatorDetailsSignature,
	updateOperatorDetails,
} from './operator-properties';
import { OperatorPropertyModal } from './operator-property-modal';


interface OperatorArtworkPosition {
	x: number;
	y: number;
	scale: number;
}

const OPERATOR_BUST_PRESET_SCALE = 1.48;

export interface OperatorCardContext {
	app: App;
	ownerEl: HTMLElement;
	entry: BasesEntry;
	options: OperatorViewOptions;
	hiddenMode: boolean;
	visibleProperties: BasesPropertyId[];
	navigation: MarkdownNavigationService;
	assets: OperatorAssetService;
	artworkRasterizer: OperatorArtworkRasterizer;
	artworkWidth: number;
	contextMenuEnabled?: boolean;
	entryOpenEnabled?: boolean;
	pointerMotionEnabled?: boolean;
	badgeCyclePausesOnInteraction?: boolean;
}

export interface OperatorCardController {
	element: HTMLElement;
	update: (context: OperatorCardContext) => void;
	syncBadges: (sequence: number, animate?: boolean) => void;
	attach: () => void;
	suspend: () => void;
	setArtworkWidth: (width: number) => void;
	setHtmlExportItemWidth: (width: number) => void;
	prepareHtmlExport: () => Promise<void>;
	resetPointerMotion: () => void;
	destroy: () => void;
}

interface OperatorCardElements {
	cardEl: HTMLElement;
	shellEl: HTMLElement;
	frameEl: HTMLElement;
	artworkEl: HTMLElement;
	rarityBackgroundImageEl: HTMLImageElement;
	rarityBannerImageEl: HTMLImageElement;
	rarityGlowImageEl: HTMLImageElement;
	rarityHeaderImageEl: HTMLImageElement;
	professionShadowImageEl: HTMLImageElement;
	starsImageEl: HTMLImageElement;
	artworkLayoutEl: HTMLElement;
	artworkImageEl: HTMLImageElement;
	artworkTransitionLayoutEl: HTMLElement;
	artworkTransitionImageEl: HTMLImageElement;
	artworkSwitchEl: HTMLButtonElement;
	artworkSwitchImageEl: HTMLImageElement;
	artworkSwitchBlueImageEl: HTMLImageElement;
	potentialToggleEl: HTMLButtonElement;
	potentialImageEl: HTMLImageElement;
	potentialBlueImageEl: HTMLImageElement;
	professionEl: HTMLElement;
	professionImageEl: HTMLImageElement;
	professionTransitionImageEl: HTMLImageElement;
	factionEl: HTMLElement;
	rarityEl: HTMLElement;
	factionImageEl: HTMLImageElement;
	factionTransitionImageEl: HTMLImageElement;
	nameEl: HTMLElement;
	codeEl: HTMLElement;
}

interface OperatorCardState {
	context: OperatorCardContext;
	contentSignature: string;
	artworkSignature: string;
	defaultArtworkSignature: string;
	artworkSources: string[];
	artworkPositions: (OperatorArtworkPosition | null)[];
	artworkIndex: number;
	artworkHiddenMode: boolean;
	artworkActiveSlot: 0 | 1;
	artworkTransitionFrame: number | null;
	artworkCleanupTimer: number | null;
	artworkWarmupCancel: (() => void) | null;
	artworkReleaseCancel: (() => void) | null;
	artworkDisplayKey: string;
	attached: boolean;
	artworkWidth: number;
	positionEditing: boolean;
	positionSaving: boolean;
	defaultArtworkSaving: boolean;
	professionValues: string[];
	professionIndex: number;
	professionActiveSlot: 0 | 1;
	professionTransitionFrame: number | null;
	factionValues: string[];
	factionIndex: number;
	factionActiveSlot: 0 | 1;
	factionTransitionFrame: number | null;
	detailsSignature: string;
	motionFrame: number | null;
	centerX: number;
	centerY: number;
	pointerX: number;
	pointerY: number;
}

export function createOperatorCard(
	initialContext: OperatorCardContext,
): OperatorCardController {
	const state: OperatorCardState = {
		context: initialContext,
		contentSignature: '',
		artworkSignature: '',
		defaultArtworkSignature: '',
		artworkSources: [],
		artworkPositions: [],
		artworkIndex: 0,
		artworkHiddenMode: initialContext.hiddenMode,
		artworkActiveSlot: 0,
		artworkTransitionFrame: null,
		artworkCleanupTimer: null,
		artworkWarmupCancel: null,
		artworkReleaseCancel: null,
		artworkDisplayKey: '',
		attached: false,
		artworkWidth: initialContext.artworkWidth,
		positionEditing: false,
		positionSaving: false,
		defaultArtworkSaving: false,
		professionValues: [],
		professionIndex: 0,
		professionActiveSlot: 0,
		professionTransitionFrame: null,
		factionValues: [],
		factionIndex: 0,
		factionActiveSlot: 0,
		factionTransitionFrame: null,
		detailsSignature: '',
		motionFrame: null,
		centerX: 0,
		centerY: 0,
		pointerX: 0,
		pointerY: 0,
	};
	const cardEl = createEl('article', { cls: 'mbv-operator-card' });
	cardEl.classList.toggle(
		'is-static-preview',
		initialContext.pointerMotionEnabled === false,
	);
	const elements = buildOperatorShell(cardEl, state);
	let propertyModal: OperatorPropertyModal | null = null;
	bindArtworkImageState(elements, state);
	bindArtworkSwitch(elements, state);
	bindPotentialToggle(elements, state);
	const destroyPositionEditor = bindPositionEditor(elements, state);
	const clearSelection = (): void => {
		clearOperatorCardSelection(elements, state);
	};
	bindPointerSelectionCleanup(cardEl, clearSelection);
	if (initialContext.pointerMotionEnabled !== false) {
		bindPointerMotion(cardEl, elements.frameEl, state);
	}
	if (initialContext.contextMenuEnabled !== false) cardEl.addEventListener('contextmenu', (event) => {
		if (state.positionEditing || (event.target as Element | null)?.closest('button')) return;
		event.preventDefault(); event.stopPropagation();
		clearSelection();
		propertyModal?.close();
		propertyModal = new OperatorPropertyModal(state.context, createOperatorCard);
		propertyModal.open();
	});

	const update = (context: OperatorCardContext): void => {
		state.context = context;
		if (context.entryOpenEnabled !== false) {
			elements.shellEl.setAttribute('href', context.entry.file.path);
			elements.shellEl.dataset.href = context.entry.file.path;
		}
		updateContent(elements, state);
		updateArtwork(elements, state);
		const detailsSignature = getOperatorDetailsSignature(context);
		if (detailsSignature !== state.detailsSignature) {
			state.detailsSignature = detailsSignature;
			updateOperatorDetails(cardEl, context);
		}
	};



	const syncBadges = (sequence: number, animate = true): void => {
		syncOperatorBadges(elements, state, sequence, animate);
	};

	const attach = (): void => {
		if (state.attached) return;
		cancelArtworkRelease(state);
		state.attached = true;
		applyArtworkSource(elements, state);
	};

	const suspend = (): void => {
		if (!state.attached) return;
		state.attached = false;
		resetPointerMotion(cardEl, elements.frameEl, state);
		cancelArtworkWarmup(state);
		cancelArtworkTransition(elements, state);
		scheduleArtworkRelease(elements, state);
	};

	const setArtworkWidth = (width: number): void => {
		if (!Number.isFinite(width) || width <= 0) return;
		if (Math.abs(width - state.artworkWidth) < 0.5) return;
		state.artworkWidth = width;
		if (state.attached && !state.positionEditing) applyArtworkSource(elements, state);
	};

	const destroy = (): void => {
		propertyModal?.close(); propertyModal = null;
		destroyPositionEditor();
		suspend();
		cancelArtworkRelease(state);
		releaseArtworkImages(elements, state);
		const ownerWindow = elements.frameEl.ownerDocument.defaultView;
		if (state.artworkTransitionFrame !== null) {
			ownerWindow?.cancelAnimationFrame(state.artworkTransitionFrame);
			state.artworkTransitionFrame = null;
		}
		if (state.artworkCleanupTimer !== null) {
			ownerWindow?.clearTimeout(state.artworkCleanupTimer);
			state.artworkCleanupTimer = null;
		}
		if (state.motionFrame !== null) {
			ownerWindow?.cancelAnimationFrame(state.motionFrame);
			state.motionFrame = null;
		}
		if (state.professionTransitionFrame !== null) {
			ownerWindow?.cancelAnimationFrame(state.professionTransitionFrame);
			state.professionTransitionFrame = null;
		}
		if (state.factionTransitionFrame !== null) {
			ownerWindow?.cancelAnimationFrame(state.factionTransitionFrame);
			state.factionTransitionFrame = null;
		}
	};

	const prepareHtmlExport = async (): Promise<void> => {
		const storeEl = cardEl.createDiv('mbv-operator-export-data');
		storeEl.dataset.hiddenMode = String(state.context.hiddenMode);
		const ownerWindow = cardEl.ownerDocument.defaultView;
		const devicePixelRatio = ownerWindow?.devicePixelRatio ?? 1;
		const modes = [false, true] as const;
		for (const hiddenMode of modes) {
			const artworkSet = await resolveExportArtworkSet(
				state.context,
				hiddenMode,
				cardEl.ownerDocument,
			);
			const currentArtwork = hiddenMode === state.context.hiddenMode
				? state.artworkIndex
				: artworkSet.defaultIndex;
			const modeEl = storeEl.createDiv('mbv-operator-export-artworks');
			modeEl.dataset.hiddenMode = String(hiddenMode);
			modeEl.dataset.currentArtwork = String(currentArtwork);
			const rasters = await Promise.all(artworkSet.sources.map(async (source, index) => {
				const position = artworkSet.positions[index] ?? createDefaultArtworkPosition();
				const raster = await state.context.artworkRasterizer.getRaster({
					source,
					x: position.x,
					y: position.y,
					scale: position.scale,
					cardWidth: state.artworkWidth,
					devicePixelRatio,
				});
				return {
					...raster,
					position,
					source: await createPortableArtworkSource(raster.source),
				};
			}));
			for (const raster of rasters) {
				const presentation = getExportArtworkPresentation(
					raster.position,
					raster.cropped,
				);
				modeEl.createEl('img', {
					cls: 'mbv-operator-export-artwork',
					attr: {
						src: raster.source,
						alt: '',
						decoding: 'async',
						'data-artwork-cropped': String(raster.cropped),
						'data-artwork-size': presentation.size,
						'data-artwork-left': presentation.left,
						'data-artwork-top': presentation.top,
					},
				});
			}
		}
		const professionEl = storeEl.createDiv('mbv-operator-export-professions');
		for (const profession of state.professionValues) {
			const source = state.context.assets.getProfessionSource(profession);
			if (!source) continue;
			professionEl.createEl('img', {
				attr: { src: source, alt: '', 'data-glow': state.context.assets.getProfessionGlow(profession) },
			});
		}
		const factionEl = storeEl.createDiv('mbv-operator-export-factions');
		for (const faction of state.factionValues) {
			factionEl.createEl('img', {
				attr: {
					src: state.context.assets.getFactionSource(faction),
					alt: '',
					'data-glow': state.context.assets.getFactionGlow(faction),
				},
			});
		}
		const activeModeEl = storeEl.querySelector<HTMLElement>(
			`.mbv-operator-export-artworks[data-hidden-mode="${String(state.context.hiddenMode)}"]`,
		);
		const activeArtwork = activeModeEl?.querySelectorAll<HTMLImageElement>(
			'.mbv-operator-export-artwork',
		)[state.artworkIndex];
		if (activeArtwork) {
			setExportArtworkImmediately(
				elements,
				state,
				activeArtwork.src,
				activeArtwork.dataset.artworkCropped === 'true',
			);
			await waitForImage(elements.artworkImageEl);
		}
	};

	update(initialContext);
	return {
		element: cardEl,
		update,
		syncBadges,
		attach,
		suspend,
		setArtworkWidth,
		setHtmlExportItemWidth: setArtworkWidth,
		prepareHtmlExport,
		resetPointerMotion: () => resetPointerMotion(cardEl, elements.frameEl, state),
		destroy,
	};
}

function buildOperatorShell(
	cardEl: HTMLElement,
	state: { context: OperatorCardContext },
): OperatorCardElements {
	const shellEl = state.context.entryOpenEnabled === false
		? cardEl.createDiv('mbv-operator-shell')
		: cardEl.createEl('a', {
			cls: 'mbv-operator-shell',
			attr: { href: '', role: 'link' },
		});
	if (state.context.entryOpenEnabled !== false) bindEntryOpen(shellEl, state);

	const frameEl = shellEl.createDiv('mbv-operator-frame');
	const clipEl = frameEl.createDiv('mbv-operator-clip');

	const rarityHeaderImageEl = createLayerImage(
		clipEl,
		'mbv-operator-rarity-header',
	);
	const professionShadowImageEl = createLayerImage(
		clipEl,
		'mbv-operator-profession-shadow',
	);
	const rarityBannerImageEl = createLayerImage(
		clipEl,
		'mbv-operator-rarity-banner',
	);
	const rarityGlowImageEl = createLayerImage(
		clipEl,
		'mbv-operator-rarity-glow',
	);
	const rarityBackgroundImageEl = createLayerImage(
		clipEl,
		'mbv-operator-rarity-background',
	);

	const artworkEl = clipEl.createDiv('mbv-operator-artwork');
	const artworkMotionEl = artworkEl.createDiv('mbv-operator-artwork-motion');
	const artworkLayoutEl = artworkMotionEl.createDiv(
		'mbv-operator-artwork-layout is-active is-hidden',
	);
	const artworkImageEl = artworkLayoutEl.createEl('img', {
		cls: 'mbv-operator-artwork-image is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	const artworkTransitionLayoutEl = artworkMotionEl.createDiv(
		'mbv-operator-artwork-layout is-hidden',
	);
	const artworkTransitionImageEl = artworkTransitionLayoutEl.createEl('img', {
		cls: 'mbv-operator-artwork-image is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	clipEl.createDiv('mbv-operator-patch');

	const footerEl = clipEl.createDiv('mbv-operator-footer');
	const identityEl = footerEl.createDiv('mbv-operator-identity');
	const codeEl = identityEl.createDiv('mbv-operator-code');
	const nameEl = identityEl.createDiv('mbv-operator-name');

	const professionEl = frameEl.createDiv('mbv-operator-profession');
	const professionTrackEl = professionEl.createDiv(
		'mbv-operator-profession-track',
	);
	const professionImageEl = professionTrackEl.createEl('img', {
		cls: 'mbv-operator-profession-image is-slot-a is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	const professionTransitionImageEl = professionTrackEl.createEl('img', {
		cls: 'mbv-operator-profession-image is-slot-b is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});

	const factionEl = frameEl.createDiv('mbv-operator-faction');
	const factionTrackEl = factionEl.createDiv('mbv-operator-faction-track');
	const factionImageEl = factionTrackEl.createEl('img', {
		cls: 'mbv-operator-faction-image is-slot-a is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
	const factionTransitionImageEl = factionTrackEl.createEl('img', {
		cls: 'mbv-operator-faction-image is-slot-b is-hidden',
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});

	const rarityEl = frameEl.createDiv('mbv-operator-rarity');
	const rarityTrackEl = rarityEl.createDiv('mbv-operator-rarity-track');
	const starsImageEl = createLayerImage(
		rarityTrackEl,
		'mbv-operator-stars',
	);

	const artworkSwitchEl = cardEl.createEl('button', {
		cls: 'clickable-icon mbv-operator-artwork-switch is-hidden',
		attr: {
			type: 'button',
			'aria-label': '切换立绘',
		},
	});
	const artworkSwitchImageEl = artworkSwitchEl.createEl('img', {
		cls: 'mbv-operator-artwork-switch-image',
		attr: { alt: '', decoding: 'async' },
	});
	const artworkSwitchBlueImageEl = artworkSwitchEl.createEl('img', {
		cls: 'mbv-operator-artwork-switch-image is-blue',
		attr: { alt: '', decoding: 'async' },
	});

	const potentialToggleEl = cardEl.createEl('button', {
		cls: 'clickable-icon mbv-operator-potential-toggle',
		attr: {
			type: 'button',
			'aria-label': '编辑立绘定位',
			'aria-pressed': 'false',
		},
	});
	const potentialImageEl = potentialToggleEl.createEl('img', {
		cls: 'mbv-operator-potential-image',
		attr: { alt: '', decoding: 'async' },
	});
	const potentialBlueImageEl = potentialToggleEl.createEl('img', {
		cls: 'mbv-operator-potential-image is-blue',
		attr: { alt: '', decoding: 'async' },
	});

	return {
		cardEl,
		shellEl,
		frameEl,
		artworkEl,
		rarityBackgroundImageEl,
		rarityBannerImageEl,
		rarityGlowImageEl,
		rarityHeaderImageEl,
		professionShadowImageEl,
		starsImageEl,
		artworkLayoutEl,
		artworkImageEl,
		artworkTransitionLayoutEl,
		artworkTransitionImageEl,
		artworkSwitchEl,
		artworkSwitchImageEl,
		artworkSwitchBlueImageEl,
		potentialToggleEl,
		potentialImageEl,
		potentialBlueImageEl,
		professionEl,
		professionImageEl,
		professionTransitionImageEl,
		factionEl,
		rarityEl,
		factionImageEl,
		factionTransitionImageEl,
		nameEl,
		codeEl,
	};
}

function createLayerImage(
	parentEl: HTMLElement,
	className: string,
): HTMLImageElement {
	return parentEl.createEl('img', {
		cls: className,
		attr: { alt: '', loading: 'eager', decoding: 'async' },
	});
}

function updateContent(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	const { context } = state;
	const name = context.options.nameProperty
		? getPropertyText(context, context.options.nameProperty)
		: context.entry.file.basename;
	const code = getPropertyText(context, context.options.codeProperty);
	const professions = getPropertyTexts(
		context,
		context.options.professionProperty,
	);
	const factions = getPropertyTexts(context, context.options.factionProperty);
	const rarity = readRarity(
		getPropertyText(context, context.options.rarityProperty),
	);
	const signature = [
		name,
		code,
		professions.join('\u001f'),
		factions.join('\u001f'),
		rarity,
	].join('\u0000');
	if (signature === state.contentSignature) return;
	state.contentSignature = signature;

	elements.nameEl.setText(name);
	elements.codeEl.setText(code || name.toUpperCase());
	elements.frameEl.dataset.rarity = String(rarity);
	elements.frameEl.setCssProps({
		'--mbv-operator-rarity-glow': context.assets.getRarityGlow(rarity),
	});
	updateSource(
		elements.artworkSwitchImageEl,
		context.assets.getEliteTwoSource(false),
	);
	updateSource(
		elements.artworkSwitchBlueImageEl,
		context.assets.getEliteTwoSource(true),
	);
	updateSource(
		elements.potentialImageEl,
		context.assets.getPotentialSource(false),
	);
	updateSource(
		elements.potentialBlueImageEl,
		context.assets.getPotentialSource(true),
	);

	updateOperatorBadges(elements, state, professions, factions);

	const rarityAssets = context.assets.getRarityAssets(rarity);
	updateSource(elements.rarityBackgroundImageEl, rarityAssets.background);
	updateSource(elements.rarityBannerImageEl, rarityAssets.banner);
	updateSource(elements.rarityGlowImageEl, rarityAssets.glow);
	updateSource(elements.rarityHeaderImageEl, rarityAssets.header);
	updateSource(
		elements.professionShadowImageEl,
		rarityAssets.professionShadow,
	);
	updateSource(elements.starsImageEl, rarityAssets.stars);
}

function updateArtwork(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	const { context } = state;
	const artworkProperty = context.hiddenMode
		? context.options.hiddenArtworkProperty
		: context.options.artworkProperty;
	const artworkValue = artworkProperty
		? context.entry.getValue(artworkProperty)
		: null;
	const positionProperty = context.hiddenMode
		? context.options.hiddenArtworkPositionProperty
		: context.options.artworkPositionProperty;
	const positionValue = positionProperty
		? context.entry.getValue(positionProperty)
		: null;
	const defaultArtworkProperty = context.options.defaultArtworkProperty;
	const defaultArtworkValue = defaultArtworkProperty
		? context.entry.getValue(defaultArtworkProperty)
		: null;
	const defaultArtworkSignature = (defaultArtworkProperty ?? '') +
		'\u0000' + (defaultArtworkValue?.toString() ?? '');
	const signature = String(context.hiddenMode) +
		'\u0000' + (artworkProperty ?? '') +
		'\u0000' + (artworkValue?.toString() ?? '') +
		'\u0000' + (positionProperty ?? '') +
		'\u0000' + (positionValue?.toString() ?? '') +
		'\u0000' + defaultArtworkSignature;
	if (signature === state.artworkSignature) return;
	const defaultArtworkChanged =
		defaultArtworkSignature !== state.defaultArtworkSignature;
	state.artworkSignature = signature;
	state.defaultArtworkSignature = defaultArtworkSignature;
	const previousIndex = state.artworkIndex;
	const previousSource = state.artworkSources[previousIndex] ?? null;
	const previousHiddenMode = state.artworkHiddenMode;
	const nextSources = resolvePropertyImages(
		context,
		artworkValue,
		elements.frameEl.ownerDocument,
	);
	const nextRange = getArtworkRange(nextSources.length);
	const preservesSelection =
		!defaultArtworkChanged &&
		previousHiddenMode === context.hiddenMode &&
		previousIndex >= nextRange.start &&
		previousIndex < nextRange.start + nextRange.count &&
		nextSources[previousIndex] === previousSource;
	state.artworkSources = nextSources;
	state.artworkPositions = resolveArtworkPositions(positionValue);
	state.artworkIndex = preservesSelection
		? previousIndex
		: resolveDefaultArtworkIndex(defaultArtworkValue, nextSources.length);
	state.artworkHiddenMode = context.hiddenMode;
	applyArtworkSource(elements, state);
}

function getArtworkRange(
	artworkCount: number,
): { start: number; count: number } {
	return { start: 0, count: artworkCount };
}

function resolveDefaultArtworkIndex(
	value: Value | null,
	artworkCount: number,
): number {
	if (!value || value instanceof NullValue || artworkCount <= 0) return 0;
	const ordinal = Number(value.toString().trim());
	if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > artworkCount) {
		return 0;
	}
	return ordinal - 1;
}

function cycleArtwork(
	elements: OperatorCardElements,
	state: OperatorCardState,
	direction: 1 | -1,
): void {
	const range = getArtworkRange(state.artworkSources.length);
	if (range.count <= 1) return;
	const relativeIndex = state.artworkIndex - range.start;
	state.artworkIndex = range.start +
		(relativeIndex + direction + range.count) % range.count;
	applyArtworkSource(elements, state);
}

function bindArtworkSwitch(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	elements.artworkSwitchEl.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		cycleArtwork(elements, state, 1);
	});
	elements.artworkSwitchEl.addEventListener('contextmenu', (event) => {
		event.preventDefault();
		event.stopPropagation();
		cycleArtwork(elements, state, -1);
	});
}

function bindPointerSelectionCleanup(
	cardEl: HTMLElement,
	clearSelection: () => void,
): void {
	cardEl.addEventListener('pointerup', () => {
		queueMicrotask(clearSelection);
	});
	cardEl.addEventListener('contextmenu', clearSelection);
}

function clearOperatorCardSelection(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	const activeElement = elements.cardEl.ownerDocument.activeElement;
	if (activeElement && elements.cardEl.contains(activeElement)) {
		(activeElement as HTMLElement).blur();
	}
	if (!state.positionEditing) {
		resetPointerMotion(elements.cardEl, elements.frameEl, state);
	}
}

function bindPotentialToggle(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	elements.potentialToggleEl.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (state.positionSaving || state.defaultArtworkSaving) return;
		if (state.positionEditing) {
			void saveArtworkPositions(elements, state);
			return;
		}
		beginPositionEditing(elements, state);
	});
	elements.potentialToggleEl.addEventListener('contextmenu', (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (state.positionSaving || state.defaultArtworkSaving) return;
		void saveDefaultArtwork(elements, state);
	});
}

function beginPositionEditing(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	if (state.artworkSources.length === 0) {
		new Notice('当前条目没有可编辑的立绘.');
		return;
	}
	if (!getPositionPropertyName(state)) return;
	ensureCurrentArtworkPosition(state);
	setPositionEditing(elements, state, true);
	applyArtworkSource(elements, state);
}

async function saveDefaultArtwork(
	elements: OperatorCardElements,
	state: OperatorCardState,
): Promise<void> {
	if (state.artworkSources.length === 0) {
		new Notice('当前条目没有可设为默认的立绘.');
		return;
	}
	const propertyName = getDefaultArtworkPropertyName(state);
	if (!propertyName) return;
	const ordinal = state.artworkIndex + 1;
	const positionPropertyName = state.positionEditing
		? getPositionPropertyName(state)
		: null;
	if (state.positionEditing && !positionPropertyName) return;
	const positionValues = positionPropertyName
		? state.artworkSources.map((_, index) =>
			formatArtworkPosition(
				state.artworkPositions[index] ??
					createDefaultArtworkPosition(),
			),
		)
		: null;
	state.defaultArtworkSaving = true;
	elements.potentialToggleEl.disabled = true;
	elements.potentialToggleEl.addClass('is-saving');
	try {
		await state.context.app.fileManager.processFrontMatter(
			state.context.entry.file,
			(frontmatter) => {
				const writable = frontmatter as Record<string, unknown>;
				if (positionPropertyName && positionValues) {
					writable[positionPropertyName] = positionValues;
				}
				writable[propertyName] = ordinal;
			},
		);
		new Notice(`已将第 ${ordinal} 张立绘设为默认.`);
	} catch {
		new Notice('保存默认立绘失败.');
	} finally {
		state.defaultArtworkSaving = false;
		elements.potentialToggleEl.disabled = false;
		elements.potentialToggleEl.removeClass('is-saving');
	}
}

function getDefaultArtworkPropertyName(state: OperatorCardState): string | null {
	const property = state.context.options.defaultArtworkProperty;
	if (!property) {
		new Notice('请先在视图设置中选择默认立绘属性.');
		return null;
	}
	const parsed = parsePropertyId(property);
	if (parsed.type !== 'note') {
		new Notice('默认立绘必须使用笔记属性.');
		return null;
	}
	return parsed.name;
}

async function saveArtworkPositions(
	elements: OperatorCardElements,
	state: OperatorCardState,
): Promise<void> {
	const propertyName = getPositionPropertyName(state);
	if (!propertyName) return;
	state.positionSaving = true;
	elements.potentialToggleEl.disabled = true;
	elements.potentialToggleEl.addClass('is-saving');
	const values = state.artworkSources.map((_, index) =>
		formatArtworkPosition(
			state.artworkPositions[index] ?? createDefaultArtworkPosition(),
		),
	);
	try {
		await state.context.app.fileManager.processFrontMatter(
			state.context.entry.file,
			(frontmatter) => {
				const writable = frontmatter as Record<string, unknown>;
				writable[propertyName] = values;
			},
		);
		setPositionEditing(elements, state, false);
		applyArtworkSource(elements, state);
	} catch {
		new Notice('保存立绘定位失败.');
	} finally {
		state.positionSaving = false;
		elements.potentialToggleEl.disabled = false;
		elements.potentialToggleEl.removeClass('is-saving');
	}
}

function getPositionPropertyName(
	state: OperatorCardState,
): string | null {
	const property = state.context.hiddenMode
		? state.context.options.hiddenArtworkPositionProperty
		: state.context.options.artworkPositionProperty;
	if (!property) {
		new Notice(
			state.context.hiddenMode
				? '请先在视图设置中选择隐藏立绘定位坐标属性.'
				: '请先在视图设置中选择普通立绘定位坐标属性.',
		);
		return null;
	}
	const parsed = parsePropertyId(property);
	if (parsed.type !== 'note') {
		new Notice('立绘定位坐标必须使用笔记属性.');
		return null;
	}
	return parsed.name;
}

function setPositionEditing(
	elements: OperatorCardElements,
	state: OperatorCardState,
	editing: boolean,
): void {
	state.positionEditing = editing;
	elements.cardEl.classList.toggle('is-position-editing', editing);
	elements.potentialToggleEl.classList.toggle('is-active', editing);
	elements.potentialToggleEl.setAttribute('aria-pressed', String(editing));
	elements.potentialToggleEl.setAttribute(
		'aria-label',
		editing
			? '保存立绘定位; 右键设为默认立绘'
			: '编辑立绘定位; 右键设为默认立绘',
	);
	if (editing) {
		cancelArtworkWarmup(state);
		resetPointerMotion(
			elements.cardEl,
			elements.frameEl,
			state,
		);
	}
	if (!editing) {
		elements.cardEl.removeClass('is-position-dragging');
	}
}

function bindPositionEditor(
	elements: OperatorCardElements,
	state: OperatorCardState,
): () => void {
	return bindArtworkPointerEditor({
		surface: elements.artworkEl,
		isEnabled: () => state.positionEditing,
		getPosition: () => ensureCurrentArtworkPosition(state),
		setPosition: position => {
			state.artworkPositions[state.artworkIndex] = position;
			updateArtworkPresentation(elements, state);
		},
		setDragging: dragging => {
			elements.cardEl.classList.toggle('is-position-dragging', dragging);
		},
	});
}

function applyArtworkSource(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	cancelArtworkWarmup(state);
	const source = state.artworkSources[state.artworkIndex] ?? null;
	const range = getArtworkRange(state.artworkSources.length);
	elements.artworkSwitchEl.classList.toggle(
		'is-hidden',
		range.count <= 1,
	);
	elements.artworkSwitchEl.setAttribute(
		'aria-label',
		range.count > 1
			? '切换立绘, 当前第 ' +
				String(state.artworkIndex - range.start + 1) +
				' 张, 共 ' + String(range.count) + ' 张'
			: '切换立绘',
	);
	if (!source) {
		clearArtworkSlots(elements, state);
		return;
	}
	if (!state.attached) return;

	const position = state.artworkPositions[state.artworkIndex] ??
		createDefaultArtworkPosition();
	// 与其他卡片视图一致, 先把原始图片直接交给浏览器并发加载;
	// 栅格化只在后台预热缓存, 不在当前画面中途替换, 避免可见变化.
	const directResult = {
		source,
		key: 'full\u0000' + source,
		cropped: false,
	};
	const rasterRequest = {
		source,
		x: position.x,
		y: position.y,
		scale: position.scale,
		cardWidth: state.artworkWidth,
		devicePixelRatio:
			elements.frameEl.ownerDocument.defaultView?.devicePixelRatio ?? 1,
	};
	const cachedResult = state.positionEditing
		? null
		: state.context.artworkRasterizer.getCachedRaster(rasterRequest);
	const displayResult = cachedResult ?? directResult;
	const activeImageEl = getArtworkImage(elements, state.artworkActiveSlot);
	const activeLayoutEl = getArtworkLayout(elements, state.artworkActiveSlot);
	if (
		state.positionEditing ||
		activeImageEl.dataset.artworkSource !== source ||
		!activeImageEl.naturalWidth ||
		activeLayoutEl.hasClass('is-hidden')
	) stageArtworkResult(elements, state, source, displayResult);
	if (state.positionEditing) return;
	if (!cachedResult) {
		scheduleArtworkWarmup(elements, state, rasterRequest, displayResult.key);
	}
}

function scheduleArtworkWarmup(
	elements: OperatorCardElements,
	state: OperatorCardState,
	request: OperatorArtworkRasterRequest,
	displayKey: string,
): void {
	const ownerWindow = elements.frameEl.ownerDocument.defaultView;
	if (!ownerWindow) return;
	const run = (): void => {
		state.artworkWarmupCancel = null;
		if (
			!state.attached ||
			state.positionEditing ||
			state.artworkDisplayKey !== displayKey
		) return;
		void state.context.artworkRasterizer.getRaster(request);
	};
	if (typeof ownerWindow.requestIdleCallback === 'function') {
		const handle = ownerWindow.requestIdleCallback(run, { timeout: 1200 });
		state.artworkWarmupCancel = () => {
			ownerWindow.cancelIdleCallback(handle);
		};
		return;
	}
	const handle = ownerWindow.setTimeout(run, 250);
	state.artworkWarmupCancel = () => ownerWindow.clearTimeout(handle);
}

function cancelArtworkWarmup(state: OperatorCardState): void {
	state.artworkWarmupCancel?.();
	state.artworkWarmupCancel = null;
}

function scheduleArtworkRelease(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	cancelArtworkRelease(state);
	const ownerWindow = elements.frameEl.ownerDocument.defaultView;
	if (!ownerWindow) {
		releaseArtworkImages(elements, state);
		return;
	}
	const run = (): void => {
		state.artworkReleaseCancel = null;
		if (!state.attached) releaseArtworkImages(elements, state);
	};
	if (typeof ownerWindow.requestIdleCallback === 'function') {
		const handle = ownerWindow.requestIdleCallback(run, { timeout: 1200 });
		state.artworkReleaseCancel = () => {
			ownerWindow.cancelIdleCallback(handle);
		};
		return;
	}
	const handle = ownerWindow.setTimeout(run, 500);
	state.artworkReleaseCancel = () => ownerWindow.clearTimeout(handle);
}

function cancelArtworkRelease(state: OperatorCardState): void {
	state.artworkReleaseCancel?.();
	state.artworkReleaseCancel = null;
}

function releaseArtworkImages(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	for (const slot of [0, 1] as const) {
		resetArtworkSlot(
			getArtworkImage(elements, slot),
			getArtworkLayout(elements, slot),
		);
	}
	state.artworkDisplayKey = '';
}

function stageArtworkResult(
	elements: OperatorCardElements,
	state: OperatorCardState,
	originalSource: string,
	result: { source: string; key: string; cropped: boolean },
): void {
	state.artworkDisplayKey = result.key;
	const activeImageEl = getArtworkImage(elements, state.artworkActiveSlot);
	const activeLayoutEl = getArtworkLayout(elements, state.artworkActiveSlot);
	if (
		activeImageEl.dataset.artworkDisplayKey === result.key &&
		activeImageEl.naturalWidth
	) {
		updateArtworkPresentation(elements, state, activeLayoutEl, result.cropped);
		activeImageEl.removeClass('is-hidden');
		activeLayoutEl.removeClass('is-hidden');
		return;
	}

	const nextSlot = state.artworkActiveSlot === 0 ? 1 : 0;
	const nextImageEl = getArtworkImage(elements, nextSlot);
	const nextLayoutEl = getArtworkLayout(elements, nextSlot);
	updateArtworkPresentation(elements, state, nextLayoutEl, result.cropped);
	nextLayoutEl.addClass('is-hidden');
	nextLayoutEl.removeClass('is-active');
	resetImage(nextImageEl);
	nextImageEl.dataset.artworkSource = originalSource;
	nextImageEl.dataset.artworkDisplayKey = result.key;
	nextImageEl.dataset.artworkCropped = String(result.cropped);
	nextImageEl.src = result.source;
	if (nextImageEl.complete && nextImageEl.naturalWidth) {
		commitArtworkSlot(elements, state, nextSlot);
	}
}

function clearArtworkSlots(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	cancelArtworkWarmup(state);
	cancelArtworkTransition(elements, state);
	state.artworkDisplayKey = '';
	for (const slot of [0, 1] as const) {
		const imageEl = getArtworkImage(elements, slot);
		const layoutEl = getArtworkLayout(elements, slot);
		layoutEl.addClass('is-hidden');
		layoutEl.removeClass('is-active');
		resetImage(imageEl);
		delete imageEl.dataset.artworkSource;
		delete imageEl.dataset.artworkDisplayKey;
		delete imageEl.dataset.artworkCropped;
	}
}

function updateArtworkPresentation(
	elements: OperatorCardElements,
	state: OperatorCardState,
	layoutEl = getArtworkLayout(elements, state.artworkActiveSlot),
	cropped = getArtworkImage(
		elements,
		state.artworkActiveSlot,
	).dataset.artworkCropped === 'true',
): void {
	if (cropped) {
		const overscan = getOperatorArtworkOverscanPercent();
		layoutEl.setCssProps({
			'--mbv-operator-artwork-size': formatNumber(100 + overscan * 2) + '%',
			'--mbv-operator-artwork-left': formatNumber(-overscan) + '%',
			'--mbv-operator-artwork-top': formatNumber(-overscan) + '%',
		});
		elements.frameEl.setCssProps({
			'--mbv-operator-artwork-focus-x': '0%',
			'--mbv-operator-artwork-focus-y': '0%',
			'--mbv-operator-artwork-base-y': '3cqw',
		});
		return;
	}
	const position = state.artworkPositions[state.artworkIndex] ??
		createDefaultArtworkPosition();
	setArtworkTransform(
		elements.frameEl,
		layoutEl,
		position.x,
		position.y,
		position.scale,
		0,
		0,
		'3cqw',
	);
}
function ensureCurrentArtworkPosition(
	state: OperatorCardState,
): OperatorArtworkPosition {
	const current = state.artworkPositions[state.artworkIndex];
	if (current) return current;
	const position = createDefaultArtworkPosition();
	state.artworkPositions[state.artworkIndex] = position;
	return position;
}

function createDefaultArtworkPosition(): OperatorArtworkPosition {
	return createArtworkPosition(50, 0, OPERATOR_BUST_PRESET_SCALE);
}

async function resolveExportArtworkSet(
	context: OperatorCardContext,
	hiddenMode: boolean,
	ownerDocument: Document,
): Promise<{
	sources: string[];
	positions: (OperatorArtworkPosition | null)[];
	defaultIndex: number;
}> {
	const artworkProperty = hiddenMode
		? context.options.hiddenArtworkProperty
		: context.options.artworkProperty;
	const positionProperty = hiddenMode
		? context.options.hiddenArtworkPositionProperty
		: context.options.artworkPositionProperty;
	const artworkValue = artworkProperty
		? context.entry.getValue(artworkProperty)
		: null;
	const positionValue = positionProperty
		? context.entry.getValue(positionProperty)
		: null;
	const defaultValue = context.options.defaultArtworkProperty
		? context.entry.getValue(context.options.defaultArtworkProperty)
		: null;
	const sources = await resolvePortablePropertyImages(
		context,
		artworkValue,
		ownerDocument,
	);
	return {
		sources,
		positions: resolveArtworkPositions(positionValue),
		defaultIndex: resolveDefaultArtworkIndex(defaultValue, sources.length),
	};
}

function setExportArtworkImmediately(
	elements: OperatorCardElements,
	state: OperatorCardState,
	source: string,
	cropped: boolean,
): void {
	cancelArtworkTransition(elements, state);
	state.artworkActiveSlot = 0;
	resetArtworkSlot(elements.artworkTransitionImageEl, elements.artworkTransitionLayoutEl);
	elements.artworkLayoutEl.addClass('is-active');
	elements.artworkLayoutEl.removeClass('is-hidden');
	elements.artworkImageEl.removeClass('is-hidden');
	elements.artworkImageEl.src = source;
	elements.artworkImageEl.dataset.artworkDisplayKey = 'export\u0000' + source;
	elements.artworkImageEl.dataset.artworkCropped = String(cropped);
	updateArtworkPresentation(elements, state, elements.artworkLayoutEl, cropped);
}

function getExportArtworkPresentation(
	position: OperatorArtworkPosition,
	cropped: boolean,
): { size: string; left: string; top: string } {
	if (cropped) {
		const overscan = getOperatorArtworkOverscanPercent();
		return {
			size: formatNumber(100 + overscan * 2) + '%',
			left: formatNumber(-overscan) + '%',
			top: formatNumber(-overscan) + '%',
		};
	}
	const transform = artworkTransform(position);
	return {
		size: formatNumber(transform.size) + '%',
		left: formatNumber(transform.left) + '%',
		top: formatNumber(transform.top) + '%',
	};
}

async function createPortableArtworkSource(source: string): Promise<string> {
	if (source.startsWith('data:')) return source;
	const portable = await readAsDataUrl(source);
	if (!portable) throw new Error('无法读取导出立绘资源.');
	return portable;
}

async function resolvePortablePropertyImages(
	context: OperatorCardContext,
	value: Value | null,
	ownerDocument: Document,
): Promise<string[]> {
	const sources: string[] = [];
	const collect = async (current: Value | null): Promise<void> => {
		if (!current || current instanceof NullValue) return;
		if (current instanceof ListValue) {
			for (let index = 0; index < current.length(); index += 1) {
				await collect(current.get(index));
			}
			return;
		}
		const file = resolveImageFile(
			context.app,
			current,
			context.entry.file,
		);
		if (file) {
			const contents = await context.app.vault.readBinary(file);
			sources.push(arrayBufferToDataUrl(contents, imageMimeType(file.extension)));
			return;
		}
		const source = resolvePropertyImage(context, current, ownerDocument);
		if (!source) return;
		sources.push(await readAsDataUrl(source) ?? source);
	};
	await collect(value);
	return sources;
}

function imageMimeType(extension: string): string {
	switch (extension.toLowerCase()) {
		case 'avif': return 'image/avif';
		case 'bmp': return 'image/bmp';
		case 'gif': return 'image/gif';
		case 'jpg':
		case 'jpeg': return 'image/jpeg';
		case 'svg': return 'image/svg+xml';
		case 'webp': return 'image/webp';
		default: return 'image/png';
	}
}

async function waitForImage(imageEl: HTMLImageElement): Promise<void> {
	if (!imageEl.complete) {
		await new Promise<void>((resolve, reject) => {
			imageEl.addEventListener('load', () => resolve(), { once: true });
			imageEl.addEventListener('error', () => {
				reject(new Error('导出立绘加载失败.'));
			}, { once: true });
		});
	}
	if (!imageEl.naturalWidth) throw new Error('导出立绘加载失败.');
	try {
		await imageEl.decode();
	} catch {
		if (!imageEl.naturalWidth) throw new Error('导出立绘解码失败.');
	}
}

function setArtworkTransform(
	frameEl: HTMLElement,
	layoutEl: HTMLElement,
	originX: number,
	originY: number,
	scale: number,
	translateX: number,
	translateY: number,
	baseY: string,
): void {
	const { size, left, top } = artworkTransform({ x: originX, y: originY, scale });
	layoutEl.setCssProps({
		'--mbv-operator-artwork-size': formatNumber(size) + '%',
		'--mbv-operator-artwork-left': formatNumber(left) + '%',
		'--mbv-operator-artwork-top': formatNumber(top) + '%',
	});
	frameEl.setCssProps({
		'--mbv-operator-artwork-focus-x': formatNumber(translateX) + '%',
		'--mbv-operator-artwork-focus-y': formatNumber(translateY) + '%',
		'--mbv-operator-artwork-base-y': baseY,
	});
}

function resolvePropertyImages(
	context: OperatorCardContext,
	value: Value | null,
	ownerDocument: Document,
): string[] {
	const sources: string[] = [];
	const collect = (current: Value | null): void => {
		if (!current || current instanceof NullValue) return;
		if (current instanceof ListValue) {
			for (let index = 0; index < current.length(); index += 1) {
				collect(current.get(index));
			}
			return;
		}
		const source = resolvePropertyImage(context, current, ownerDocument);
		if (source) sources.push(source);
	};
	collect(value);
	return sources;
}

function updateOperatorBadges(
	elements: OperatorCardElements,
	state: OperatorCardState,
	professions: string[],
	factions: string[],
): void {
	const currentProfession =
		state.professionValues[state.professionIndex] ?? '';
	const currentFaction = state.factionValues[state.factionIndex] ?? '';
	state.professionValues = professions;
	state.factionValues = factions;
	state.professionIndex = Math.max(
		0,
		professions.indexOf(currentProfession),
	);
	state.factionIndex = Math.max(0, factions.indexOf(currentFaction));
	applyProfessionBadge(elements, state, false);
	applyFactionBadge(elements, state, false);
}

function syncOperatorBadges(
	elements: OperatorCardElements,
	state: OperatorCardState,
	sequence: number,
	animate: boolean,
): void {
	const cycleProfession = state.professionValues.length > 1;
	const cycleFaction = state.factionValues.length > 1;
	if (!cycleProfession && !cycleFaction) return;
	if (
		state.context.badgeCyclePausesOnInteraction !== false &&
		(
		elements.cardEl.matches(':hover') ||
		elements.cardEl.matches(':focus-within')
		)
	) {
		return;
	}
	if (cycleProfession) {
		const nextIndex = sequence % state.professionValues.length;
		if (nextIndex !== state.professionIndex) {
			state.professionIndex = nextIndex;
			applyProfessionBadge(elements, state, animate);
		}
	}
	if (cycleFaction) {
		const nextIndex = sequence % state.factionValues.length;
		if (nextIndex !== state.factionIndex) {
			state.factionIndex = nextIndex;
			applyFactionBadge(elements, state, animate);
		}
	}
}
function applyProfessionBadge(
	elements: OperatorCardElements,
	state: OperatorCardState,
	animate: boolean,
): void {
	const profession =
		state.professionValues[state.professionIndex] ?? '';
	const source = state.context.assets.getProfessionSource(profession);
	const result = applyBadgeSource(
		[
			elements.professionImageEl,
			elements.professionTransitionImageEl,
		],
		state.professionActiveSlot,
		source,
		animate,
		state.professionTransitionFrame,
	);
	state.professionActiveSlot = result.activeSlot;
	state.professionTransitionFrame = result.transitionFrame;
	elements.professionEl.classList.toggle('is-empty', !source);
	elements.professionEl.classList.toggle(
		'is-branch',
		state.context.assets.isProfessionBranch(profession),
	);
	elements.frameEl.setCssProps({
		'--mbv-operator-profession-glow':
			state.context.assets.getProfessionGlow(profession),
	});
}

function applyFactionBadge(
	elements: OperatorCardElements,
	state: OperatorCardState,
	animate: boolean,
): void {
	const faction = state.factionValues[state.factionIndex] ?? '';
	const result = applyBadgeSource(
		[
			elements.factionImageEl,
			elements.factionTransitionImageEl,
		],
		state.factionActiveSlot,
		state.context.assets.getFactionSource(faction),
		animate,
		state.factionTransitionFrame,
	);
	state.factionActiveSlot = result.activeSlot;
	state.factionTransitionFrame = result.transitionFrame;
	elements.frameEl.setCssProps({
		'--mbv-operator-faction-glow':
			state.context.assets.getFactionGlow(faction),
	});
}

function applyBadgeSource(
	imageEls: readonly [HTMLImageElement, HTMLImageElement],
	activeSlot: 0 | 1,
	source: string | null,
	animate: boolean,
	transitionFrame: number | null,
): { activeSlot: 0 | 1; transitionFrame: number | null } {
	const ownerWindow = imageEls[0].ownerDocument.defaultView;
	if (transitionFrame !== null) {
		ownerWindow?.cancelAnimationFrame(transitionFrame);
	}
	if (!source) {
		for (const imageEl of imageEls) {
			imageEl.removeClass('is-active');
			resetImage(imageEl);
		}
		return { activeSlot: 0, transitionFrame: null };
	}
	const activeImageEl = imageEls[activeSlot];
	if (!animate || !activeImageEl.getAttribute('src')) {
		const inactiveSlot = activeSlot === 0 ? 1 : 0;
		updateSource(activeImageEl, source);
		activeImageEl.addClass('is-active');
		imageEls[inactiveSlot].removeClass('is-active');
		resetImage(imageEls[inactiveSlot]);
		return { activeSlot, transitionFrame: null };
	}
	if (activeImageEl.getAttribute('src') === source) {
		return { activeSlot, transitionFrame: null };
	}
	const nextSlot = activeSlot === 0 ? 1 : 0;
	const nextImageEl = imageEls[nextSlot];
	nextImageEl.removeClass('is-active');
	updateSource(nextImageEl, source);
	const commit = (): void => {
		nextImageEl.addClass('is-active');
		activeImageEl.removeClass('is-active');
	};
	if (!ownerWindow) {
		commit();
		return { activeSlot: nextSlot, transitionFrame: null };
	}
	return {
		activeSlot: nextSlot,
		transitionFrame: ownerWindow.requestAnimationFrame(commit),
	};
}

function updateSource(
	imageEl: HTMLImageElement,
	source: string | null,
): void {
	if (!source) {
		resetImage(imageEl);
		return;
	}
	if (imageEl.getAttribute('src') === source) return;
	imageEl.src = source;
	imageEl.removeClass('is-hidden');
}

function bindArtworkImageState(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	for (const slot of [0, 1] as const) {
		const imageEl = getArtworkImage(elements, slot);
		const layoutEl = getArtworkLayout(elements, slot);
		imageEl.addEventListener('load', () => {
			if (!imageEl.naturalWidth) return;
			if (imageEl.dataset.artworkDisplayKey !== state.artworkDisplayKey) return;
			commitArtworkSlot(elements, state, slot);
		});
		imageEl.addEventListener('error', () => {
			imageEl.addClass('is-hidden');
			layoutEl.addClass('is-hidden');
		});
	}
}

function commitArtworkSlot(
	elements: OperatorCardElements,
	state: OperatorCardState,
	nextSlot: 0 | 1,
): void {
	const nextImageEl = getArtworkImage(elements, nextSlot);
	if (
		!state.artworkDisplayKey ||
		nextImageEl.dataset.artworkDisplayKey !== state.artworkDisplayKey
	) return;
	const nextLayoutEl = getArtworkLayout(elements, nextSlot);
	updateArtworkPresentation(
		elements,
		state,
		nextLayoutEl,
		nextImageEl.dataset.artworkCropped === 'true',
	);
	if (state.artworkActiveSlot === nextSlot) {
		nextImageEl.removeClass('is-hidden');
		nextLayoutEl.removeClass('is-hidden');
		nextLayoutEl.addClass('is-active');
		return;
	}
	const previousSlot = state.artworkActiveSlot;
	const previousImageEl = getArtworkImage(elements, previousSlot);
	const previousLayoutEl = getArtworkLayout(elements, previousSlot);
	const previousDisplayKey = previousImageEl.dataset.artworkDisplayKey;
	state.artworkActiveSlot = nextSlot;
	nextImageEl.removeClass('is-hidden');
	nextLayoutEl.addClass('is-active');
	previousLayoutEl.removeClass('is-active');
	cancelArtworkTransition(elements, state);
	const ownerWindow = nextLayoutEl.ownerDocument.defaultView;
	const commit = (): void => {
		nextLayoutEl.removeClass('is-hidden');
		previousLayoutEl.addClass('is-hidden');
	};
	if (!ownerWindow) {
		commit();
		resetArtworkSlot(previousImageEl, previousLayoutEl);
		return;
	}
	state.artworkTransitionFrame = ownerWindow.requestAnimationFrame(() => {
		state.artworkTransitionFrame = null;
		if (!nextLayoutEl.isConnected) return;
		commit();
		state.artworkCleanupTimer = ownerWindow.setTimeout(() => {
			state.artworkCleanupTimer = null;
			if (
				state.artworkActiveSlot !== previousSlot &&
				previousImageEl.dataset.artworkDisplayKey === previousDisplayKey
			) resetArtworkSlot(previousImageEl, previousLayoutEl);
		}, 360);
	});
}

function cancelArtworkTransition(
	elements: OperatorCardElements,
	state: OperatorCardState,
): void {
	const ownerWindow = elements.frameEl.ownerDocument.defaultView;
	if (state.artworkTransitionFrame !== null) {
		ownerWindow?.cancelAnimationFrame(state.artworkTransitionFrame);
		state.artworkTransitionFrame = null;
	}
	if (state.artworkCleanupTimer !== null) {
		ownerWindow?.clearTimeout(state.artworkCleanupTimer);
		state.artworkCleanupTimer = null;
	}
}

function resetArtworkSlot(
	imageEl: HTMLImageElement,
	layoutEl: HTMLElement,
): void {
	layoutEl.addClass('is-hidden');
	layoutEl.removeClass('is-active');
	resetImage(imageEl);
	delete imageEl.dataset.artworkSource;
	delete imageEl.dataset.artworkDisplayKey;
	delete imageEl.dataset.artworkCropped;
}
function getArtworkImage(
	elements: OperatorCardElements,
	slot: 0 | 1,
): HTMLImageElement {
	return slot === 0
		? elements.artworkImageEl
		: elements.artworkTransitionImageEl;
}

function getArtworkLayout(
	elements: OperatorCardElements,
	slot: 0 | 1,
): HTMLElement {
	return slot === 0
		? elements.artworkLayoutEl
		: elements.artworkTransitionLayoutEl;
}

function resolveArtworkPositions(
	value: Value | null,
): (OperatorArtworkPosition | null)[] {
	if (!value || value instanceof NullValue) return [];
	if (!(value instanceof ListValue)) {
		return parseArtworkPositionTextList(value.toString());
	}

	const directPosition = parseArtworkPositionValueList(value);
	if (directPosition) return [directPosition];

	const positions: (OperatorArtworkPosition | null)[] = [];
	for (let index = 0; index < value.length(); index += 1) {
		const item = value.get(index);
		if (!item || item instanceof NullValue) {
			positions.push(null);
			continue;
		}
		if (item instanceof ListValue) {
			positions.push(parseArtworkPositionValueList(item));
			continue;
		}
		positions.push(parseArtworkPositionText(item.toString()));
	}
	return positions;
}

function parseArtworkPositionValueList(
	value: ListValue,
): OperatorArtworkPosition | null {
	if (value.length() !== 3) return null;
	const numbers: number[] = [];
	for (let index = 0; index < value.length(); index += 1) {
		const item = value.get(index);
		if (!item || item instanceof NullValue || item instanceof ListValue) {
			return null;
		}
		const parsed = Number(item.toString().trim());
		if (!Number.isFinite(parsed)) return null;
		numbers.push(parsed);
	}
	const [x, y, scale] = numbers;
	if (x === undefined || y === undefined || scale === undefined) return null;
	return createArtworkPosition(x, y, scale);
}

function parseArtworkPositionText(
	text: string,
): OperatorArtworkPosition | null {
	return parseArtworkPositionTextList(text)[0] ?? null;
}

function parseArtworkPositionTextList(
	text: string,
): (OperatorArtworkPosition | null)[] {
	const positions: OperatorArtworkPosition[] = [];
	const pattern =
		/\[\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\]/gu;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		positions.push(createArtworkPosition(
			Number(match[1]),
			Number(match[2]),
			Number(match[3]),
		));
	}
	return positions;
}

function formatNumber(value: number): string {
	return String(Math.round(value * 1000) / 1000);
}

function bindPointerMotion(
	motionEl: HTMLElement,
	frameEl: HTMLElement,
	state: OperatorCardState,
): void {
	motionEl.addEventListener('pointerenter', () => {
		if (state.positionEditing) {
			resetPointerMotion(motionEl, frameEl, state);
			return;
		}
		updateCardCenter(frameEl, state);
	});
	motionEl.addEventListener('pointermove', (event) => {
		if (state.positionEditing || event.pointerType === 'touch') return;
		if (!state.centerX && !state.centerY) updateCardCenter(frameEl, state);
		state.pointerX = event.clientX;
		state.pointerY = event.clientY;
		if (state.motionFrame !== null) return;
		const ownerWindow = frameEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		state.motionFrame = ownerWindow.requestAnimationFrame(() => {
			state.motionFrame = null;
			const rawX = state.pointerX - state.centerX;
			const rawY = state.pointerY - state.centerY;
			const rotateX = clamp(rawX, -12, 12);
			const rotateY = clamp(rawY, -12, 12);
			const brightness = 1 - rotateY / 12 * 0.035;
			frameEl.setCssProps({
				'--mbv-operator-tilt-x': String(-rotateY / 1.8) + 'deg',
				'--mbv-operator-tilt-y': String(rotateX) + 'deg',
				'--mbv-operator-brightness': String(brightness),
				'--mbv-operator-shadow-x': String(-rotateX) + 'px',
				'--mbv-operator-shadow-y': String(-rotateY) + 'px',
				'--mbv-operator-art-x': String(Math.round(rawX / 10)) + 'px',
				'--mbv-operator-art-y': String(Math.round(rawY / 18)) + 'px',
				'--mbv-operator-logo-x': String(Math.round(rawX / 10)) + 'px',
				'--mbv-operator-logo-y': String(Math.round(rawY / 15)) + 'px',
				'--mbv-operator-logo-shadow-x': String(-rotateX / 7) + 'px',
				'--mbv-operator-logo-shadow-y': String(-rotateY / 7) + 'px',
			});
			motionEl.setCssProps({
				'--mbv-operator-control-tilt-x': String(-rotateY / 1.8) + 'deg',
				'--mbv-operator-control-tilt-y': String(rotateX) + 'deg',
			});
		});
	});
	motionEl.addEventListener('pointerleave', () => {
		resetPointerMotion(motionEl, frameEl, state);
	});
}

function resetPointerMotion(
	motionEl: HTMLElement,
	frameEl: HTMLElement,
	state: OperatorCardState,
): void {
	cancelMotionFrame(frameEl, state);
	state.centerX = 0;
	state.centerY = 0;
	frameEl.setCssProps({
		'--mbv-operator-tilt-x': '0deg',
		'--mbv-operator-tilt-y': '0deg',
		'--mbv-operator-brightness': '1',
		'--mbv-operator-shadow-x': '0px',
		'--mbv-operator-shadow-y': '0px',
		'--mbv-operator-art-x': '0px',
		'--mbv-operator-art-y': '0px',
		'--mbv-operator-logo-x': '0px',
		'--mbv-operator-logo-y': '0px',
		'--mbv-operator-logo-shadow-x': '0px',
		'--mbv-operator-logo-shadow-y': '0px',
	});
	motionEl.setCssProps({
		'--mbv-operator-control-tilt-x': '0deg',
		'--mbv-operator-control-tilt-y': '0deg',
	});
}

function updateCardCenter(
	frameEl: HTMLElement,
	state: OperatorCardState,
): void {
	const rect = frameEl.getBoundingClientRect();
	state.centerX = rect.left + rect.width / 2;
	state.centerY = rect.top + rect.height / 2;
}

function cancelMotionFrame(
	frameEl: HTMLElement,
	state: OperatorCardState,
): void {
	if (state.motionFrame === null) return;
	frameEl.ownerDocument.defaultView?.cancelAnimationFrame(state.motionFrame);
	state.motionFrame = null;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function bindEntryOpen(
	shellEl: HTMLElement,
	state: { context: OperatorCardContext },
): void {
	const open = (event: MouseEvent | KeyboardEvent): void => {
		event.preventDefault();
		void openOperatorEntry(state.context, event);
	};
	shellEl.addEventListener('click', (event) => {
		if (event.button === 0) open(event);
	});
	shellEl.addEventListener('auxclick', (event) => {
		if (event.button === 1) open(event);
	});
	shellEl.addEventListener('keydown', (event) => {
		if (
			event.target === shellEl &&
			(event.key === 'Enter' || event.key === ' ')
		) {
			open(event);
		}
	});
}

async function openOperatorEntry(
	context: OperatorCardContext,
	event: MouseEvent | KeyboardEvent,
): Promise<void> {
	const handled = await context.navigation.open(
		context.entry.file,
		context.entry.file.path,
		context.options.markdownOpenMode,
		event,
		context.ownerEl,
	);
	if (handled) return;
	await context.app.workspace.openLinkText(
		context.entry.file.path,
		context.entry.file.path,
		'button' in event && event.button === 1 ? 'tab' : Keymap.isModEvent(event),
	);
}

function resolvePropertyImage(
	context: OperatorCardContext,
	value: Value | null,
	ownerDocument: Document,
): string | null {
	if (!value || value instanceof NullValue || !value.toString().trim()) {
		return null;
	}
	return resolveImageSource(context.app, value, context.entry.file) ??
		resolveRenderedImageSource(context.app, value, ownerDocument);
}

function getPropertyText(
	context: OperatorCardContext,
	property: BasesPropertyId | null,
): string {
	return getPropertyTexts(context, property)[0] ?? '';
}

function getPropertyTexts(
	context: OperatorCardContext,
	property: BasesPropertyId | null,
): string[] {
	if (!property) return [];
	const values: string[] = [];
	const seen = new Set<string>();
	const collect = (value: Value | null): void => {
		if (!value || value instanceof NullValue) return;
		if (value instanceof ListValue) {
			for (let index = 0; index < value.length(); index += 1) {
				collect(value.get(index));
			}
			return;
		}
		const text = value.toString().trim();
		if (!text || text.toLowerCase() === 'null' || seen.has(text)) return;
		seen.add(text);
		values.push(text);
	};
	collect(context.entry.getValue(property));
	return values;
}

function readRarity(value: string): number {
	return /^[1-7]$/u.test(value) ? Number(value) : 1;
}
function resetImage(imageEl: HTMLImageElement): void {
	imageEl.removeAttribute('src');
	imageEl.addClass('is-hidden');
}

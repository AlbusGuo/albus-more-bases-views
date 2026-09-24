import {
	Keymap,
	NullValue,
	setIcon,
	type App,
	type BasesEntry,
	type BasesPropertyId,
} from 'obsidian';
import type { MarkdownNavigationService } from '../../services/markdown-navigation';
import {
	resolveImageSource,
	resolveRenderedImageSource,
} from '../../ui/image-source';
import type { MapViewOptions } from './map-options';

export interface MapPopupContext {
	app: App;
	ownerEl: HTMLElement;
	ownerDocument: Document;
	entry: BasesEntry;
	options: MapViewOptions;
	visibleProperties: BasesPropertyId[];
	getDisplayName: (property: BasesPropertyId) => string;
	navigation: MarkdownNavigationService;
	onEditIcon?: () => void;
	onEditColor?: () => void;
	onClose: () => void;
}

export function createMapPopupContent(context: MapPopupContext): HTMLElement {
	const ownerDocument = context.ownerDocument;
	const rootEl = ownerDocument.createElement('div');
	rootEl.classList.add('mbv-map-inspector-content');
	renderHeader(rootEl, context);
	renderImage(rootEl, context);
	const titleEl = rootEl.createEl('a', {
		cls: 'mbv-map-popup-title internal-link',
		text: getPropertyText(context, context.options.titleProperty) ||
			context.entry.file.basename,
		attr: {
			href: context.entry.file.path,
			'data-href': context.entry.file.path,
		},
	});
	bindEntryOpen(titleEl, context);
	renderAppearanceProperties(rootEl, context);
	renderProperties(rootEl, context);
	return rootEl;
}

function renderHeader(rootEl: HTMLElement, context: MapPopupContext): void {
	const headerEl = rootEl.createDiv('mbv-map-inspector-header');
	createActionButton(headerEl, 'x', '关闭', context.onClose);
}

function renderAppearanceProperties(
	rootEl: HTMLElement,
	context: MapPopupContext,
): void {
	const properties = [
		{
			property: context.options.markerIconProperty,
			onEdit: context.onEditIcon,
			kind: 'icon' as const,
		},
		{
			property: context.options.markerColorProperty,
			onEdit: context.onEditColor,
			kind: 'color' as const,
		},
	];
	const configured = properties.filter((item) => item.property);
	if (configured.length === 0) return;
	const listEl = rootEl.createDiv('mbv-map-popup-properties');
	for (const item of configured) {
		const property = item.property;
		if (!property) continue;
		const rowEl = item.onEdit
			? listEl.createEl('button', {
				cls: 'mbv-map-popup-row mbv-map-popup-property-button',
				attr: { type: 'button' },
			})
			: listEl.createDiv('mbv-map-popup-row');
		rowEl.createSpan({
			cls: 'mbv-map-popup-label',
			text: context.getDisplayName(property),
		});
		const value = getPropertyText(context, property);
		const valueEl = rowEl.createSpan('mbv-map-popup-value');
		if (item.kind === 'icon') renderIconValue(valueEl, value);
		else renderColorValue(valueEl, value);
		if (item.onEdit) {
			setIcon(valueEl.createSpan('mbv-map-popup-property-chevron'), 'chevron-right');
			rowEl.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				item.onEdit?.();
			});
		}
	}
}

function renderIconValue(containerEl: HTMLElement, icon: string): void {
	const iconEl = containerEl.createSpan('mbv-map-popup-property-icon');
	if (icon) setIcon(iconEl, icon);
	if (iconEl.childElementCount === 0) setIcon(iconEl, 'circle-dashed');
	containerEl.createSpan({ text: icon || '未设置' });
}

function renderColorValue(containerEl: HTMLElement, color: string): void {
	const swatchEl = containerEl.createSpan('mbv-map-popup-property-color');
	if (color && containerEl.ownerDocument.defaultView?.CSS.supports('color', color)) {
		swatchEl.setCssProps({ '--mbv-map-property-color': color });
	}
	containerEl.createSpan({ text: color || '未设置' });
}

function createActionButton(
	containerEl: HTMLElement,
	icon: string,
	label: string,
	onClick: () => void,
): HTMLButtonElement {
	const buttonEl = containerEl.createEl('button', {
		cls: 'clickable-icon',
		attr: { type: 'button', 'aria-label': label },
	});
	setIcon(buttonEl, icon);
	if (buttonEl.childElementCount === 0) setIcon(buttonEl, 'shapes');
	buttonEl.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		onClick();
	});
	return buttonEl;
}
function renderImage(rootEl: HTMLElement, context: MapPopupContext): void {
	const property = context.options.imageProperty;
	const value = property ? context.entry.getValue(property) : null;
	if (!value || value instanceof NullValue || !value.toString().trim()) return;
	const source = resolveImageSource(context.app, value, context.entry.file) ??
		resolveRenderedImageSource(context.app, value, rootEl.ownerDocument);
	if (!source) return;
	const imageWrapEl = rootEl.createDiv('mbv-map-popup-image');
	imageWrapEl.createEl('img', {
		attr: { src: source, alt: '', loading: 'eager', decoding: 'async' },
	});
}

function renderProperties(rootEl: HTMLElement, context: MapPopupContext): void {
	let listEl: HTMLElement | null = null;
	for (const property of context.visibleProperties) {
		if (
			property === context.options.markerIconProperty ||
			property === context.options.markerColorProperty
		) continue;
		const value = context.entry.getValue(property);
		if (!value || value instanceof NullValue || !value.toString().trim()) continue;
		listEl ??= rootEl.createDiv('mbv-map-popup-properties');
		const rowEl = listEl.createDiv('mbv-map-popup-row');
		rowEl.createSpan({
			cls: 'mbv-map-popup-label',
			text: context.getDisplayName(property),
		});
		const valueEl = rowEl.createSpan('mbv-map-popup-value');
		value.renderTo(valueEl, context.app.renderContext);
	}
}

function bindEntryOpen(
	linkEl: HTMLAnchorElement,
	context: MapPopupContext,
): void {
	const open = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		void openEntry(context, event);
	};
	linkEl.addEventListener('click', (event) => {
		if (event.button === 0) open(event);
	});
	linkEl.addEventListener('auxclick', (event) => {
		if (event.button === 1) open(event);
	});
}

async function openEntry(
	context: MapPopupContext,
	event: MouseEvent,
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
		event.button === 1 ? 'tab' : Keymap.isModEvent(event),
	);
}

function getPropertyText(
	context: MapPopupContext,
	property: BasesPropertyId | null,
): string {
	if (!property) return '';
	const value = context.entry.getValue(property);
	if (!value || value instanceof NullValue) return '';
	const text = value.toString().trim();
	return text.toLowerCase() === 'null' ? '' : text;
}

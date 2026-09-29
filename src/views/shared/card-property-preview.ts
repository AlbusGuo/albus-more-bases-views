import type { BasesEntry } from 'obsidian';
import { CardInteractionController } from './card-interaction';
import type {
	CardPropertyPreviewController,
	CardPropertyPreviewFactory,
} from './card-property-editor-types';

export class CardPropertyPreview {
	private readonly controller: CardPropertyPreviewController;
	private interaction: CardInteractionController | null = null;

	constructor(
		private readonly element: HTMLElement,
		viewOwnerEl: HTMLElement,
		factory: CardPropertyPreviewFactory,
		entry: BasesEntry,
	) {
		this.element.addClass('is-awaiting-pointer');
		const contextEl = this.element.createDiv('mbv-card-property-preview-context');
		copyViewPresentation(viewOwnerEl, contextEl);
		this.controller = factory(contextEl, entry);
		this.controller.element.addClass('mbv-card-property-preview-card');
		contextEl.append(this.controller.element);
		disablePreviewFocus(this.controller.element);
		if (this.controller.interactive) {
			this.interaction = new CardInteractionController(contextEl, {
				contextMenu: 'delegate',
				openingRotation: false,
				openExpandedOnClick: false,
			});
			this.interaction.register(this.controller.interactive);
		}
		for (const eventName of [
			'pointerdown', 'click', 'auxclick', 'contextmenu', 'keydown', 'input', 'change',
		]) this.element.addEventListener(eventName, preventPreviewAction, true);
		this.element.addEventListener('pointermove', () => {
			this.element.removeClass('is-awaiting-pointer');
		}, { once: true });
		this.element.ownerDocument.defaultView?.requestAnimationFrame(() => {
			const focused = this.element.ownerDocument.activeElement;
			if (focused instanceof HTMLElement && this.element.contains(focused)) focused.blur();
		});
	}

	update(entry: BasesEntry): void {
		this.controller.update(entry);
	}

	destroy(): void {
		this.interaction?.destroy();
		this.interaction = null;
		this.controller.destroy?.();
	}
}

function copyViewPresentation(source: HTMLElement, target: HTMLElement): void {
	for (let index = 0; index < source.classList.length; index += 1) {
		const className = source.classList.item(index);
		if (className?.startsWith('mbv-') && className.endsWith('-view')) {
			target.addClass(className);
		}
	}
	for (let index = 0; index < source.style.length; index += 1) {
		const property = source.style.item(index);
		if (!property.startsWith('--')) continue;
		target.style.setProperty(
			property,
			source.style.getPropertyValue(property),
			source.style.getPropertyPriority(property),
		);
	}
}

function disablePreviewFocus(root: HTMLElement): void {
	for (const element of [
		root,
		...Array.from(root.querySelectorAll<HTMLElement>(
			'a, button, input, textarea, select, [tabindex], [contenteditable]',
		)),
	]) {
		element.tabIndex = -1;
		element.removeAttribute('contenteditable');
	}
}

function preventPreviewAction(event: Event): void {
	event.preventDefault();
	event.stopPropagation();
}

import {
	type App,
	TFile,
	type Value,
} from 'obsidian';
import { resolveImageSource } from '../../ui/image-source';

export function renderBookCover(
	app: App,
	value: Value,
	sourceFile: TFile,
	coverEl: HTMLElement,
	spineImageEl: HTMLImageElement,
): void {
	const source = resolveImageSource(app, value, sourceFile);
	if (source) {
		const image = coverEl.createEl('img', {
			cls: 'mbv-book-cover-image is-loading',
			attr: {
				alt: '',
				loading: 'eager',
				decoding: 'async',
			},
		});
		bindImageState(image, coverEl, spineImageEl);
		image.src = source;
		return;
	}

	const nativeValueEl = coverEl.createDiv('mbv-book-cover-native-value');
	value.renderTo(nativeValueEl, app.renderContext);
	const nativeImage = nativeValueEl.querySelector('img');
	if (!nativeImage) {
		nativeValueEl.remove();
		return;
	}

	nativeImage.addClass('mbv-book-cover-image');
	nativeImage.setAttribute('alt', '');
	nativeImage.setAttribute('loading', 'eager');
	nativeImage.setAttribute('decoding', 'async');
	bindImageState(nativeImage, coverEl, spineImageEl);
}

function bindImageState(
	image: HTMLImageElement,
	coverEl: HTMLElement,
	spineImageEl: HTMLImageElement,
): void {
	const markLoaded = () => {
		if (!image.naturalWidth) return;
		image.removeClass('is-loading');
		coverEl.addClass('has-cover');
		coverEl.querySelector('.mbv-book-cover-placeholder')?.remove();
		spineImageEl.src = image.currentSrc || image.src;
		spineImageEl.removeClass('is-hidden');
	};
	const markFailed = () => {
		image.remove();
		coverEl.removeClass('has-cover');
		spineImageEl.addClass('is-hidden');
	};

	image.addEventListener('load', markLoaded, { once: true });
	image.addEventListener('error', markFailed, { once: true });
	if (image.complete) markLoaded();
}
